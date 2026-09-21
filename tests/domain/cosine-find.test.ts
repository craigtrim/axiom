import { describe, it, expect } from "vitest";
import { CosineTextIndex } from "../../src/domain/cosine";
import { findEntities } from "../../src/domain/resource-search";
import { EntityFindIndex } from "../../src/domain/entity-find";
import { Store } from "../../src/domain/store";
import { NS, entity } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { readFindOptions } from "../../src/shared/find";
import { readPreferences } from "../../src/shared/preferences";
const base = "https://example.test/cosine#";
async function fixture() {
  const rdf = await parseRdf(
    "@prefix : <" +
      base +
      ">. @prefix owl: <" +
      NS.owl +
      ">. @prefix rdfs: <" +
      NS.rdfs +
      ">. @prefix skos: <" +
      NS.skos +
      ">. " +
      ':A a owl:Class; rdfs:label "Basic English"; rdfs:comment "Foundations of written communication"; rdfs:seeAlso "ENG BAS"; :courseCode "ENG101". ' +
      ':B a owl:Class; rdfs:label "Advanced English"; rdfs:subClassOf :A. ' +
      ':C a owl:Class; rdfs:label "Marine Biology". ' +
      ':alice a owl:NamedIndividual, :A; rdfs:label "Basic English Learner"; :courseCode "STU101". ' +
      ':teaches a owl:ObjectProperty; rdfs:label "English instruction".',
    "cosine.ttl",
    base,
  );
  return storeFromRdf(rdf.triples, "Cosine");
}
describe("cosine vectors", () => {
  it("normalizes vectors, preserves word-order independence and accepts an unseen query", () => {
    const index = new CosineTextIndex([
      "Basic English",
      "Advanced English",
      "Marine Biology",
    ]);
    expect(index.search("English Basic").get(0)).toBeCloseTo(1, 12);
    const scores = index.search("Basic English vocabulary");
    expect(scores.get(0)).toBeGreaterThan(scores.get(1)!);
    expect(scores.get(0)).toBeLessThan(1);
    expect(index.search("Englsh basc").get(0)).toBeGreaterThan(0.2);
    expect(index.search("zzzzqqqq").size).toBe(0);
    expect(index.search("---").size).toBe(0);
    expect(new CosineTextIndex([]).search("anything").size).toBe(0);
  });
  it("handles Unicode, accents, case, punctuation and short names", () => {
    const index = new CosineTextIndex(["Café_English", "中 文", "A"]);
    expect(index.search("cafe english").get(0)).toBeCloseTo(1, 12);
    expect(index.search("文 中").get(1)).toBeCloseTo(1, 12);
    expect(index.search("a").get(2)).toBeCloseTo(1, 12);
    expect(index.search("a foreign query").get(2)).toBeLessThan(1);
  });
});
describe("faceted cosine search", () => {
  it("ranks classes and instances together and returns scores and match evidence", async () => {
    const s = await fixture();
    const r = findEntities(s, {
      text: "english basic",
      match: "cosine",
      fields: ["name"],
      kinds: ["classes", "individuals"],
      minimumSimilarity: 0.2,
    });
    expect(r.rows[0]).toMatchObject({
      iri: base + "A",
      matchedField: "name",
      matchedValue: "Basic English",
    });
    expect(r.rows[0].similarity).toBeCloseTo(1, 12);
    expect(r.rows.some((v) => v.iri === base + "alice")).toBe(true);
    expect(r.rows.some((v) => v.iri === base + "teaches")).toBe(false);
    expect(
      r.rows.every((v) => v.similarity! >= 0.2 && v.similarity! <= 1),
    ).toBe(true);
    expect(
      findEntities(s, {
        text: "english basic",
        match: "cosine",
        fields: ["name"],
        minimumSimilarity: 1,
      }).rows.map((r) => r.iri),
    ).toEqual([base + "A"]);
  });
  it("exposes every predicate and searches literal, alias, IRI and resource values", async () => {
    const s = await fixture();
    const fields = findEntities(s, {}).fields.map((f) => f.id);
    for (const p of [
      "name",
      "iri",
      NS.rdf + "type",
      NS.rdfs + "label",
      NS.rdfs + "comment",
      NS.rdfs + "seeAlso",
      NS.rdfs + "subClassOf",
      base + "courseCode",
    ])
      expect(fields).toContain(p);
    const search = (text: string, field: string) =>
      findEntities(s, {
        text,
        match: "cosine",
        fields: [field],
        minimumSimilarity: 0.9,
      });
    expect(search("ENG101", base + "courseCode").rows[0]).toMatchObject({
      iri: base + "A",
      matchedField: base + "courseCode",
      matchedValue: "ENG101",
    });
    expect(
      search("Foundations of written communication", NS.rdfs + "comment")
        .rows[0].iri,
    ).toBe(base + "A");
    expect(search("BAS ENG", "name").rows[0].iri).toBe(base + "A");
    expect(search("Basic English", NS.rdfs + "subClassOf").rows[0].iri).toBe(
      base + "B",
    );
    expect(search(base + "C", "iri").rows[0].iri).toBe(base + "C");
    expect(search("ENG101", "name").total).toBe(0);
    expect(search("ENG101", "*").rows[0].iri).toBe(base + "A");
  });
  it("does not dilute a matching value with unrelated fields and supports empty facet selections", async () => {
    const s = await fixture(),
      opts = { text: "Basic English", match: "cosine", minimumSimilarity: 1 };
    expect(
      findEntities(s, { ...opts, fields: ["*"] }).rows.find(
        (r) => r.iri === base + "A",
      )?.similarity,
    ).toBeCloseTo(1, 12);
    expect(findEntities(s, { ...opts, fields: [] }).total).toBe(0);
    expect(findEntities(s, { ...opts, kinds: [] }).total).toBe(0);
    expect(findEntities(s, { ...opts, fields: ["absent"] }).total).toBe(0);
    expect(
      findEntities(s, {
        ...opts,
        fields: ["name"],
        excludeIri: base + "A",
      }).rows.some((r) => r.iri === base + "A"),
    ).toBe(false);
    expect(
      findEntities(s, {
        text: "English",
        fields: [NS.rdfs + "label"],
        kinds: ["individuals"],
      }).rows.map((r) => r.iri),
    ).toEqual([base + "alice"]);
  });
  it("refreshes indexed fields, scores and aliases after edits and undo", async () => {
    const s = await fixture(),
      opts = {
        text: "ENG101",
        match: "cosine",
        fields: [base + "courseCode"],
        minimumSimilarity: 1,
      };
    expect(findEntities(s, opts).total).toBe(1);
    s.updateEntity(
      base + "A",
      s
        .entityStatements(base + "A")
        .map((t) =>
          t.predicate === base + "courseCode"
            ? { ...t, object: { literal: true, value: "HIS201" } }
            : t,
        ),
    );
    expect(findEntities(s, opts).total).toBe(0);
    expect(findEntities(s, { ...opts, text: "HIS201" }).total).toBe(1);
    s.undo();
    expect(findEntities(s, opts).total).toBe(1);
  });
  it("indexes generated instance fields", () => {
    const s = new Store();
    s.loadGenerated(
      [
        {
          index: 0,
          iri: base + "order",
          type: base + "Order",
          reference: "AB-12",
          branch: "West Campus",
          price: 5,
          timestamp: 0,
          rating: 4,
          customerIndex: 0,
        },
      ],
      [{ iri: base + "customer", name: "Alex Smith" }],
    );
    const result = findEntities(s, {
      text: "Campus West",
      fields: [NS.demo + "branch"],
      match: "cosine",
      kinds: ["individuals"],
    });
    expect(result.rows[0].iri).toBe(base + "order");
    expect(result.rows[0].similarity).toBeCloseTo(1, 12);
    expect(result.fields.map((f) => f.id)).toContain(NS.demo + "priceGBP");
  });
  it("pages all cosine results stably across 15000 classes and reuses prepared vectors", () => {
    const s = new Store();
    s.entities.clear();
    for (let i = 0; i < 15000; i++)
      s.entities.set(base + i, {
        ...entity(base + i, "Class"),
        label: "English Course " + i,
      });
    const index = new EntityFindIndex(s),
      start = performance.now();
    const options = {
      text: "English Course",
      fields: ["name"],
      match: "cosine",
      minimumSimilarity: 0,
      limit: 100,
    };
    const first = index.find(options);
    expect(first.total).toBe(15000);
    const elapsed = performance.now() - start;
    const warm = performance.now();
    const last = index.find({ ...options, offset: 14900 });
    expect(last.rows).toHaveLength(100);
    expect(last.rows.some((r) => first.rows.some((f) => r.iri === f.iri))).toBe(
      false,
    );
    expect(
      index.find({ ...options, excludeIri: first.rows[0].iri }).total,
    ).toBe(14999);
    expect(performance.now() - warm).toBeLessThan(2000);
    expect(elapsed).toBeLessThan(10000);
  });
  it("validates and persists facet choices and finite score thresholds", () => {
    const opts = readFindOptions({
      match: "cosine",
      fields: ["name", NS.rdfs + "comment", 23, "name"],
      kinds: ["classes", "individuals", "invalid"],
      minimumSimilarity: Infinity,
    });
    expect(opts.fields).toEqual(["name", NS.rdfs + "comment"]);
    expect(opts.kinds).toEqual(["classes", "individuals"]);
    expect(opts.minimumSimilarity).toBe(0);
    expect(readFindOptions({ minimumSimilarity: 2 }).minimumSimilarity).toBe(1);
    expect(readFindOptions({ fields: [], kinds: [] }).fields).toEqual([]);
    expect(
      readPreferences({ version: 1, panelState: { "find.view": opts } })
        .panelState?.["find.view"],
    ).toEqual(opts);
  });
});
