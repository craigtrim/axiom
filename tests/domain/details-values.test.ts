import { describe, expect, it } from "vitest";
import { canonize } from "rdf-canonize";
import { NS, TYPE, SUBCLASS, entity } from "../../src/domain/model";
import { compactIri, expandIri } from "../../src/shared/terms";
import { Store } from "../../src/domain/store";
import { parseRdf, storeFromRdf, writeRdf } from "../../src/domain/rdf-io";
import {
  ResourceSearchIndex,
  resourceSuggestions,
} from "../../src/domain/resource-search";
import { simpleParentExpressions } from "../../src/domain/class-parents";
import {
  entitySource,
  applyEntitySource,
} from "../../src/domain/entity-source";
const base = "https://example.test/";
const make = async (extra = "", predicate = "owl:equivalentClass") =>
  storeFromRdf(
    (
      await parseRdf(
        "@prefix : <" +
          base +
          "> . @prefix owl: <" +
          NS.owl +
          "> . @prefix rdfs: <" +
          NS.rdfs +
          '> . :A a owl:Class; rdfs:label "Café Laser Cutting"; ' + predicate + ' [a owl:Class; owl:intersectionOf (:B :C)]. :B a owl:Class; rdfs:label "Polymer Cutting" . :C a owl:Class; rdfs:label "Laser Cutting" . :D a owl:Class . :i a :B . ' +
          extra,
        "fixture.ttl",
        base,
      )
    ).triples,
    "Test",
  );
const canonical = async (triples: Parameters<typeof writeRdf>[0]) =>
  canonize(await writeRdf(triples, "nquads"), {
    algorithm: "RDFC-1.0",
    inputFormat: "application/n-quads",
  });
describe("Details resource values", () => {
  it("keeps blank-node identity when it also names a graph outside the snippet", async () => {
    const store = await make();
    const expression = store
      .entityStatements(base + "A")
      .find((t) => t.predicate === NS.owl + "equivalentClass")!.object.value;
    store.tbox.push({
      subject: base + "D",
      predicate: NS.rdfs + "comment",
      object: { literal: true, value: 'A [bracket] and "quote"' },
      graph: expression,
    });
    store.rebuildSchema();
    const before = await canonical(store.tbox),
      doc = await entitySource(store, 1, base + "A");
    expect(doc.text).toContain(expression);
    await applyEntitySource(store, 1, doc);
    expect(await canonical(store.tbox)).toBe(before);
  });
  it("uses recognized, reversible vocabulary abbreviations", () => {
    for (const prefix of [
      "skos",
      "dc",
      "dcterms",
      "rdf",
      "rdfs",
      "owl",
    ] as const) {
      const iri = NS[prefix] + "name";
      expect(compactIri(iri, NS[prefix])).toBe(prefix + ":name");
      expect(expandIri(prefix + ":name", base)).toBe(iri);
    }
    expect(expandIri("constructor:value", base)).toBe("constructor:value");
  });
  it("indexes multiple words, aliases, IRIs, accents, class filters and revisions", async () => {
    const store = await make(
      ":A <" + NS.skos + 'altLabel> "Rapid Manufacturing" .',
    );
    expect(resourceSuggestions(store, "laser cafe", true)[0].iri).toBe(
      base + "A",
    );
    expect(resourceSuggestions(store, "rapid man", true)[0].iri).toBe(
      base + "A",
    );
    expect(
      resourceSuggestions(store, base + "C", true).some(
        (e) => e.iri === base + "C",
      ),
    ).toBe(true);
    expect(resourceSuggestions(store, "", true).every((e) => e.isClass)).toBe(
      true,
    );
    expect(
      resourceSuggestions(store, "laser", true, [base + "A"]).map((e) => e.iri),
    ).toEqual([base + "C"]);
    store.updateEntity(base + "D", [
      ...store.entityStatements(base + "D"),
      {
        subject: base + "D",
        predicate: NS.rdfs + "label",
        object: { literal: true, value: "New indexed label" },
      },
    ]);
    expect(resourceSuggestions(store, "new indexed", true)[0].iri).toBe(
      base + "D",
    );
    store.undo();
    expect(resourceSuggestions(store, "new indexed", true)).toEqual([]);
  });
  it("keeps warm searches bounded in a 100,000-class index", () => {
    const store = new Store();
    store.ontology.namespace = base;
    for (let i = 0; i < 100000; i++)
      store.entities.set(base + "Course_" + i, {
        ...entity(base + "Course_" + i, "Class"),
        label: "Laser Polymer Course " + i,
      });
    const started = performance.now();
    const index = new ResourceSearchIndex(store);
    const built = performance.now() - started;
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const matches = index.search("polymer " + (99000 + i), true);
      expect(matches[0]?.iri).toBe(base + "Course_" + (99000 + i));
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        resources: 100000,
        buildMs: Math.round(built),
        warmP95Ms: times[94],
        warmMaxMs: times[99],
      }),
    );
    expect(times[94]).toBeLessThan(50);
  }, 30000);
  it("simplifies future subclass intersections into ordinary parents without asserting equivalence", async () => {
    const store = await make("", "rdfs:subClassOf"), original = structuredClone(store.tbox);
    expect(store.resolve(base + "A")?.parents).toEqual([base + "B",base + "C"]);
    expect(store.tbox.some(t=>t.predicate===NS.owl+"intersectionOf")).toBe(false);
    expect(store.tbox.some(t=>t.predicate===NS.owl+"equivalentClass")).toBe(false);
    store.updateEntity(base+"A",store.entityStatements(base+"A").map(t=>t.predicate===SUBCLASS && t.object.value===base+"C" ? {...t,object:{literal:false,value:base+"D"}} : t));
    expect(store.resolve(base + "A")?.parents).toEqual([base + "B",base + "D"]);
    store.undo(); expect(store.tbox).toEqual(original);
  });
  it("preserves shared and annotated expressions and never flattens unions or equivalence", async () => {
    const store = await make(),
      parent = store
        .entityStatements(base + "A")
        .find((t) => t.predicate === NS.owl + "equivalentClass")!;
    store.tbox.push({ ...parent, subject: base + "D" });
    store.rebuildSchema();
    store.updateEntity(
      base + "A",
      store.entityStatements(base + "A").flatMap((t) =>
        t.predicate === NS.owl + "equivalentClass"
          ? [base + "B", base + "C"].map((value) => ({
              ...t,
              predicate: SUBCLASS,
              object: { literal: false, value },
            }))
          : [t],
      ),
    );
    expect(store.resolve(parent.object.value)?.intersection?.members).toEqual([
      base + "B",
      base + "C",
    ]);
    store.tbox.push({
      subject: parent.object.value,
      predicate: NS.rdfs + "comment",
      object: { literal: true, value: "Keep annotation" },
    });
    store.rebuildSchema();
    expect(
      simpleParentExpressions(store, store.entityStatements(base + "D")),
    ).toEqual({});
    expect(
      simpleParentExpressions(store, store.entityStatements(base + "D")),
    ).toEqual({});
    const union = await make(":D rdfs:subClassOf [owl:unionOf (:B :C)].");
    expect(
      simpleParentExpressions(union, union.entityStatements(base + "D")),
    ).toEqual({});
  });
  it("adds plain parents by default, with equivalence requiring an explicit operation", async () => {
    const store = await make();
    store.addClassParents(base + "D", [base + "B", base + "C"]);
    expect(
      store
        .entityStatements(base + "D")
        .filter((t) => t.predicate === SUBCLASS)
        .map((t) => t.object.value),
    ).toEqual([base + "B", base + "C"]);
    expect(store.resolve(base + "D")?.classExpressions).toBeUndefined();
    expect(() => store.addClassParents(base + "B", [base + "D"])).toThrow(
      "cycle",
    );
    expect(() => store.addClassParents(base + "D", [base + "i"])).toThrow();
  });
  it("writes idiomatic scoped Turtle and round-trips its meaning", async () => {
    const store = await make();
    const doc = await entitySource(store, 1, base + "A");
    expect(doc.text).toContain("[");
    expect(doc.text).toMatch(/owl:intersectionOf\s*\(:B :C\)/);
    expect(doc.text).not.toContain("rdf:first");
    expect(doc.text).not.toContain("_:n3");
    expect(doc.text).not.toContain('"Polymer Cutting"');
    const before = await canonical(store.tbox);
    await applyEntitySource(store, 1, doc);
    expect(await canonical(store.tbox)).toBe(before);
  });
  it("keeps shared blank identity and scoped anonymous-root source", async () => {
    const store = await make(),
      parent = store
        .entityStatements(base + "A")
        .find((t) => t.predicate === NS.owl + "equivalentClass")!;
    store.tbox.push({ ...parent, subject: base + "D" });
    store.rebuildSchema();
    const doc = await entitySource(store, 1, base + "A");
    expect(doc.text).toContain(parent.object.value);
    await applyEntitySource(store, 1, {
      ...doc,
      text: doc.text.replace("Café Laser Cutting", "Changed"),
    });
    expect(store.resolve(base + "D")?.classExpressions?.[0].iri).toBe(
      parent.object.value,
    );
    const scoped = await entitySource(store, 1, parent.object.value);
    expect(scoped.text).toContain("(:B :C)");
    expect(scoped.text).not.toContain(":A ");
    expect(scoped.text).not.toContain(":D ");
    const before = await canonical(store.tbox);
    await applyEntitySource(store, 1, scoped);
    expect(await canonical(store.tbox)).toBe(before);
  });
});
