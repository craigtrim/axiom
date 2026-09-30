import { describe, it, expect, vi } from "vitest";
import {
  EntitySearchIndex,
  semanticFillLimit,
} from "../../src/domain/entity-search";
import {
  findEntities,
  prepareSemanticFind,
  indexFor,
} from "../../src/domain/resource-search";
import { Store } from "../../src/domain/store";
import { NS, entity } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { readFindOptions } from "../../src/shared/find";
import {
  embeddingCosine,
  embeddingDot,
  embeddingText,
} from "../../src/shared/embeddings";
const base = "https://example.test/search#";
async function fixture() {
  const rdf = await parseRdf(
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    :A a owl:Class; rdfs:label "Automobile"; rdfs:seeAlso "Motor vehicle"; :code "AUTO1"; rdfs:comment "Road transport".
    :B a owl:Class; rdfs:label "Carpet".
    :driver a owl:NamedIndividual, :A; rdfs:label "Driver".
    :drives a owl:ObjectProperty; rdfs:label "Drives".`,
    "search.ttl",
    base,
  );
  return storeFromRdf(rdf.triples, "Search");
}
const scores = new Map([
  ["Automobile", 0.87],
  ["Motor vehicle", 0.85],
  ["Carpet", 0.28],
  ["Driver", 0.6],
  ["Drives", 0.5],
  ["Road transport", 0.75],
  ["AUTO1", 1],
]);
const options = { text: "car", fields: ["name"] };
describe("automatic semantic enrichment", () => {
  it("uses dot products equivalent to cosine for normalized embeddings", () => {
    const a = new Float32Array([0.6, 0.8]),
      b = new Float32Array([0, 1]);
    expect(embeddingDot(a, b)).toBeCloseTo(embeddingCosine(a, b));
    expect(embeddingDot(a, a)).toBeCloseTo(1);
    expect(embeddingText("  Systems ADMIN. ")).toBe("systems admin.");
    expect(embeddingText("English Basic")).not.toBe(
      embeddingText("Basic English"),
    );
  });
  it("preserves a preferred-label prefix and fills with a strong semantic match", async () => {
    const store = await fixture();
    const result = findEntities(store, options, scores);
    expect(result.rows.map((r) => r.name)).toEqual(["Carpet", "Automobile"]);
    expect(result.rows[1]).toMatchObject({
      iri: base + "A",
      similarity: 0.87,
      matchedField: "name",
      matchedValue: "Automobile",
    });
    expect(findEntities(store, { ...options, text: "unrelated" }).rows).toEqual(
      [],
    );
    expect(
      findEntities(
        store,
        { ...options, excludeIri: base + "A" },
        scores,
      ).rows.map((r) => r.name),
    ).not.toContain("Automobile");
  });
  it("applies semantic eligibility after type filters and exclusions", async () => {
    const store = await fixture();
    expect(
      findEntities(
        store,
        { ...options, kinds: ["individuals"] },
        scores,
      ).rows.map((r) => r.name),
    ).toEqual(["Driver"]);
    const index = indexFor(store);
    expect(
      index.search("car", true, [base + "B"], 24, scores).map((r) => r.label),
    ).toEqual(["Automobile"]);
    expect(
      findEntities(
        store,
        options,
        new Map([
          ["Automobile", 0.49],
          ["Driver", NaN],
        ]),
      ).rows.map((r) => r.name),
    ).toEqual(["Carpet"]);
  });
  it("scores only selected fields, including literal and referenced property values", async () => {
    const store = await fixture(),
      scorer = vi.fn(async () => scores);
    await prepareSemanticFind(
      store,
      { ...options, fields: [base + "code"] },
      scorer,
    );
    expect(scorer).toHaveBeenCalledWith("car", ["AUTO1"]);
    expect(
      findEntities(store, { ...options, fields: [base + "code"] }, scores)
        .rows[0],
    ).toMatchObject({ matchedField: base + "code", matchedValue: "AUTO1" });
    for (const fields of [[], ["absent"]])
      expect(findEntities(store, { ...options, fields }, scores).total).toBe(0);
    expect(findEntities(store, { ...options, kinds: [] }, scores).total).toBe(
      0,
    );
    expect(indexFor(store).semanticTexts([NS.rdf + "type"])).toContain(
      NS.owl + "Class",
    );
    expect(indexFor(store).semanticTexts(["name", "iri"])).toBe(
      indexFor(store).semanticTexts(["iri", "name"]),
    );
  });
  it("uses one index per version and rebuilds after edits and undo", async () => {
    const store = await fixture(),
      first = indexFor(store);
    expect(indexFor(store)).toBe(first);
    store.updateEntity(
      base + "A",
      store
        .entityStatements(base + "A")
        .filter((t) => t.predicate !== NS.rdfs + "seeAlso"),
    );
    expect(indexFor(store)).not.toBe(first);
    expect(indexFor(store).semanticTexts(["name"])).not.toContain(
      "Motor vehicle",
    );
    store.undo();
    expect(indexFor(store).semanticTexts(["name"])).toContain("Motor vehicle");
  });
  it("bounds semantic-only recall and never pads a full lexical result set", () => {
    const store = new Store();
    store.entities.clear();
    const values = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const label = "Course " + i;
      store.entities.set(base + i, { ...entity(base + i, "Class"), label });
      values.set(label, 0.8 - i / 1000);
    }
    const index = new EntitySearchIndex(store);
    const result = index.find({ text: "study", fields: ["name"] }, values);
    expect(result.total).toBe(semanticFillLimit);
    expect(
      index.find(
        { text: "zzqx", fields: ["name"] },
        new Map([["Course 1", 0.2]]),
      ).total,
    ).toBe(0);
    expect(index.find({ text: "Course", fields: ["name"] }, values).total).toBe(
      100,
    );
  });
  it.each(["words", "phrase", "exact", "cosine"])(
    "migrates saved %s mode without losing query or filters",
    (match) => {
      const result = readFindOptions({
        match,
        minimumSimilarity: 0.99,
        text: "car",
        fields: ["name"],
        kinds: ["classes"],
        sort: "name-desc",
      });
      expect(result).toMatchObject({
        text: "car",
        fields: ["name"],
        kinds: ["classes"],
        sort: "name-desc",
      });
      expect(result).not.toHaveProperty("match");
      expect(result).not.toHaveProperty("minimumSimilarity");
    },
  );
});

it("fuses semantic and lexical ranks without confusing similarity with eligibility", () => {
  const store = new Store();
  for (const name of ["Course Alpha", "Course Beta", "Course Gamma"]) {
    const iri = base + name.replaceAll(" ", "_");
    store.entities.set(iri, { ...entity(iri, "Class"), label: name });
  }
  const index = new EntitySearchIndex(store);
  expect(index.find({ text: "Course", fields: ["name"] }).rows[0].name).toBe(
    "Course Alpha",
  );
  const enriched = index.find(
    { text: "Course", fields: ["name"] },
    new Map([
      ["Course Alpha", 0.55],
      ["Course Beta", 0.6],
      ["Course Gamma", 0.95],
    ]),
  );
  expect(enriched.rows[0].name).toBe("Course Gamma");
  expect(enriched.total).toBe(3);
});
