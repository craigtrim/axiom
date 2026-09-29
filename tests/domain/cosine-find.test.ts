import { describe, it, expect, vi } from "vitest";
import { EntityFindIndex } from "../../src/domain/entity-find";
import {
  findEntities,
  prepareSemanticFind,
} from "../../src/domain/resource-search";
import { Store } from "../../src/domain/store";
import { NS, entity } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { readFindOptions } from "../../src/shared/find";
import { embeddingCosine, embeddingText } from "../../src/shared/embeddings";
const base = "https://example.test/cosine#";
async function fixture() {
  const rdf = await parseRdf(
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    :A a owl:Class; rdfs:label "Automobile"; rdfs:seeAlso "Motor vehicle"; :code "AUTO1"; rdfs:comment "Road transport".
    :B a owl:Class; rdfs:label "Carpet".
    :driver a owl:NamedIndividual, :A; rdfs:label "Driver".
    :drives a owl:ObjectProperty; rdfs:label "Drives".`,
    "cosine.ttl",
    base,
  );
  return storeFromRdf(rdf.triples, "Cosine");
}
// Fixed model outputs isolate search facets and pagination from inference quality.
const scores = new Map([
  ["Automobile", 0.87],
  ["Motor vehicle", 0.85],
  ["Carpet", 0.28],
  ["Driver", 0.6],
  ["Drives", 0.5],
  ["Road transport", 0.75],
  ["AUTO1", 1],
]);
const options = {
  text: "car",
  match: "cosine",
  fields: ["name"],
  minimumSimilarity: 0.4,
};
describe("semantic cosine search", () => {
  it("calculates cosine from dense embeddings without changing punctuation or word order", () => {
    expect(
      embeddingCosine(new Float32Array([3, 4]), new Float32Array([3, 4])),
    ).toBeCloseTo(1);
    expect(
      embeddingCosine(new Float32Array([1, 0]), new Float32Array([0, 1])),
    ).toBe(0);
    expect(
      embeddingCosine(new Float32Array([1, 0]), new Float32Array([-1, 0])),
    ).toBe(-1);
    expect(embeddingText("  Systems ADMIN. ")).toBe("systems admin.");
    expect(embeddingText("English Basic")).not.toBe(
      embeddingText("Basic English"),
    );
  });
  it("ranks supplied semantic scores without shared words and retains match evidence", async () => {
    const store = await fixture();
    const result = findEntities(store, options, scores);
    expect(result.rows[0]).toMatchObject({
      iri: base + "A",
      similarity: 0.87,
      matchedField: "name",
      matchedValue: "Automobile",
    });
    expect(result.rows.map((r) => r.name)).toEqual([
      "Automobile",
      "Driver",
      "Drives",
    ]);
    expect(
      findEntities(store, { ...options, kinds: ["classes"] }, scores).rows.map(
        (r) => r.name,
      ),
    ).toEqual(["Automobile"]);
    expect(
      findEntities(store, { ...options, excludeIri: base + "A" }, scores).rows,
    ).toHaveLength(2);
    expect(() => findEntities(store, { ...options, text: "other" })).toThrow(
      /MPNet/,
    );
  });
  it("prepares only selected fields and reuses model scores across filters and pages", async () => {
    const store = await fixture();
    const score = vi.fn(async (_query: string, _texts: string[]) => scores);
    expect(await prepareSemanticFind(store, options, score)).toBe(scores);
    const texts = score.mock.calls[0][1];
    expect(texts).toContain("Motor vehicle");
    expect(texts).not.toContain("Road transport");
    await prepareSemanticFind(
      store,
      { ...options, offset: 20, minimumSimilarity: 0.8 },
      score,
    );
    expect(score).toHaveBeenCalledTimes(1);
    await prepareSemanticFind(store, { ...options, text: "car?" }, score);
    expect(score).toHaveBeenCalledTimes(2);
    await prepareSemanticFind(store, { ...options, fields: ["*"] }, score);
    expect(score).toHaveBeenCalledTimes(3);
  });
  it("searches arbitrary predicates without diluting a matching field", async () => {
    const store = await fixture();
    expect(
      findEntities(store, { ...options, fields: ["*"] }, scores).rows[0]
        .similarity,
    ).toBe(1);
    expect(
      findEntities(store, { ...options, fields: [base + "code"] }, scores)
        .rows[0],
    ).toMatchObject({ matchedField: base + "code", matchedValue: "AUTO1" });
    expect(findEntities(store, { ...options, fields: [] }, scores).total).toBe(
      0,
    );
    expect(
      findEntities(store, { ...options, fields: ["absent"] }, scores).total,
    ).toBe(0);
    expect(findEntities(store, { ...options, kinds: [] }, scores).total).toBe(
      0,
    );
  });
  it("refreshes after edits and undo and retries failed model work", async () => {
    const store = await fixture();
    const score = vi.fn(async () => scores);
    await prepareSemanticFind(store, options, score);
    store.updateEntity(
      base + "A",
      store
        .entityStatements(base + "A")
        .filter((t) => t.predicate !== NS.rdfs + "seeAlso"),
    );
    await prepareSemanticFind(store, options, score);
    expect(score).toHaveBeenCalledTimes(2);
    store.undo();
    await prepareSemanticFind(store, options, score);
    expect(score).toHaveBeenCalledTimes(3);
    const index = new EntityFindIndex(store);
    await expect(
      index.semanticScores(options, async () => {
        throw Error("model missing");
      }),
    ).rejects.toThrow("model missing");
    expect(await index.semanticScores(options, score)).toBe(scores);
  });
  it("pages 15000 semantic matches without losing results or requiring another model call", () => {
    const store = new Store();
    store.entities.clear();
    const values = new Map<string, number>();
    for (let i = 0; i < 15000; i++) {
      const label = "Course " + i;
      store.entities.set(base + i, { ...entity(base + i, "Class"), label });
      values.set(label, 0.8 - i / 100000);
    }
    const index = new EntityFindIndex(store);
    const first = index.find({ ...options, limit: 100 }, values);
    expect(first.total).toBe(15000);
    const last = index.find({ ...options, limit: 100, offset: 14900 }, values);
    expect(last.rows).toHaveLength(100);
    expect(last.rows.some((r) => first.rows.some((f) => f.iri === r.iri))).toBe(
      false,
    );
  });
  it("validates finite thresholds and empty facets", () => {
    expect(
      readFindOptions({ minimumSimilarity: Infinity }).minimumSimilarity,
    ).toBe(0);
    expect(readFindOptions({ minimumSimilarity: 2 }).minimumSimilarity).toBe(1);
    expect(readFindOptions({ fields: [], kinds: [] }).fields).toEqual([]);
  });
});
