import { describe, expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { textAnalysisCanonical } from "../../src/domain/text-analysis-concepts";
import { textAnalysisGraphNodes } from "../../src/domain/text-analysis-graph";
import { Viewport } from "../../src/domain/viewport";
import { NS, SUBCLASS, TYPE, entity } from "../../src/domain/model";
import { Store } from "../../src/domain/store";

const base = "https://example.test/nav#";
const iri = (id: string) => base + id;
const turtle = `@prefix : <${base}> . @prefix owl: <${NS.owl}> .
@prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> .
:Root a owl:Class; rdfs:label "Root" .
:Animal a owl:Class; rdfs:label "Animal"; rdfs:subClassOf :Root .
:Pet a owl:Class; rdfs:label "Pet"; rdfs:subClassOf :Root .
:Dog a owl:Class; rdfs:subClassOf :Animal, :Pet; rdfs:label "Domestic dog";
  rdfs:comment "A description from the ontology."; skos:altLabel "canine" .
:Cat a owl:Class; rdfs:label "Cat"; rdfs:subClassOf :Animal .
:Unrelated a owl:Class; rdfs:subClassOf :Root .
<https://other.test/nav#Dog> a owl:Class; rdfs:label "Other dog" .
<https://unlabelled.test/nav#Dog> a owl:Class .
<https://example.test/SlashDog> a owl:Class; rdfs:label "Slash dog" .
:NoLabel a owl:Class; skos:altLabel "A synonym without a label" .
:case a owl:NamedIndividual, :Dog; rdfs:label "Specific dog" .
:childProperty a owl:ObjectProperty; rdfs:subPropertyOf :rootProperty; rdfs:label "Child property" .
:rootProperty a owl:ObjectProperty .
:Cycle a owl:Class; rdfs:subClassOf :Loop .
:Loop a owl:Class; rdfs:subClassOf :Cycle, :Root .
:Defined a owl:Class; owl:equivalentClass [ a owl:Class; owl:intersectionOf (:Animal :Pet) ] .`;
const fixture = async () =>
  storeFromRdf(
    (await parseRdf(turtle, "navigation.ttl", base)).triples,
    "navigation",
  );

describe("matched ontology identities", () => {
  it.each([
    ["https://example.test/nav#Mixed_Case", "mixed_case"],
    ["https://example.test/path#part/Name", "part/name"],
    ["https://example.test/SlashDog", "https://example.test/slashdog"],
    ["urn:Example:Dog", "urn:example:dog"],
    ["https://example.test/#CAFÉ", "café"],
    ["https://example.test/#ΟΣ", "ος"],
    ["https://example.test/#İ", "i̇"],
    ["https://example.test/#A%20B", "a%20b"],
    ["https://example.test/#\ufeffAnchor", "\ufeffanchor"],
    ["https://example.test/#\u0085Anchor\u0085", "anchor"],
  ])("preserves native identifier normalization for %s", (value, expected) => {
    expect(textAnalysisCanonical(value)).toBe(expected);
  });
  it("keeps actual IDs, display labels, comments and both parents without guessing from labels", async () => {
    const store = await fixture();
    const context = await textAnalysisContext(store, 1);
    expect(context.concepts!.dog).toEqual([
      expect.objectContaining({
        iri: iri("Dog"),
        label: "Domestic dog",
        comment: "A description from the ontology.",
        kind: "Class",
        taxonomy: true,
        parents: [
          { iri: iri("Animal"), label: "Animal" },
          { iri: iri("Pet"), label: "Pet" },
        ],
      }),
      expect.objectContaining({
        iri: "https://other.test/nav#Dog",
        label: "Other dog",
      }),
    ]);
    expect(context.concepts!.domestic_dog).toBeUndefined();
    expect(context.concepts!["https://example.test/slashdog"][0].iri).toBe(
      "https://example.test/SlashDog",
    );
    expect(context.concepts!.nolabel[0].iri).toBe(iri("NoLabel"));
    expect(context.concepts!.case[0]).toMatchObject({
      taxonomy: false,
      parents: [{ iri: iri("Dog"), label: "Domestic dog" }],
    });
  });
  it("refreshes entry descriptions on ontology edits without changing canonical identity", async () => {
    const store = await fixture();
    const before = await textAnalysisContext(store, 1);
    store.entities.get(iri("Dog"))!.comment = "Revised description";
    store.version++;
    const after = await textAnalysisContext(store, 1);
    expect(before.concepts!.dog[0].comment).toBe(
      "A description from the ontology.",
    );
    expect(after.concepts!.dog[0].comment).toBe("Revised description");
    expect(after.concepts!.dog[0].iri).toBe(before.concepts!.dog[0].iri);
  });
});

describe("graphs of matched spans", () => {
  it("deduplicates matches and shared ancestors, follows all parents, and excludes siblings", async () => {
    const store = await fixture();
    const before = JSON.stringify([...store.scan()]);
    const result = textAnalysisGraphNodes(store, [
      iri("Dog"),
      iri("Cat"),
      iri("Dog"),
    ]);
    expect(result.matches).toEqual([iri("Dog"), iri("Cat")]);
    expect(new Set(result.iris)).toEqual(
      new Set(["Dog", "Cat", "Animal", "Pet", "Root"].map(iri)),
    );
    expect(result.roots).toEqual([iri("Root")]);
    const view = new Viewport(store);
    view.seed(result.iris, true, false);
    expect(view.nodes.size).toBe(5);
    expect(
      [...view.edges.values()].filter((e) => e.predicate === SUBCLASS),
    ).toHaveLength(5);
    expect(JSON.stringify([...store.scan()])).toBe(before);
  });
  it("keeps cycles finite and follows their real path to the root", async () => {
    const result = textAnalysisGraphNodes(await fixture(), [iri("Cycle")]);
    expect(new Set(result.iris)).toEqual(
      new Set(["Cycle", "Loop", "Root"].map(iri)),
    );
    expect(result.roots).toEqual([iri("Root")]);
  });
  it("retains disconnected roots without manufacturing a link to owl:Thing", async () => {
    const result = textAnalysisGraphNodes(await fixture(), [
      iri("Root"),
      "https://other.test/nav#Dog",
    ]);
    expect(result.roots).toEqual(result.iris);
    expect(result.iris).not.toContain(NS.owl + "Thing");
  });
  it("includes instance types, property parents and equivalent intersection ancestry", async () => {
    const store = await fixture();
    const result = textAnalysisGraphNodes(store, [
      iri("case"),
      iri("childProperty"),
      iri("Defined"),
    ]);
    expect(new Set(result.iris)).toEqual(
      new Set(
        [
          "case",
          "Dog",
          "Animal",
          "Pet",
          "Root",
          "childProperty",
          "rootProperty",
          "Defined",
        ].map(iri),
      ),
    );
    const view = new Viewport(store);
    view.seed(result.iris, true, false);
    expect([...view.edges.values()]).toContainEqual(
      expect.objectContaining({
        source: iri("case"),
        predicate: TYPE,
        target: iri("Dog"),
      }),
    );
    expect(
      [...view.edges.values()].filter((edge) => edge.source === iri("Defined")),
    ).toHaveLength(2);
  });
  it("retains ancestry beyond the ordinary viewport budget and admits the entire closure", () => {
    const store = new Store();
    for (let n = 0; n < 1100; n++) {
      const node = entity(iri("N" + n), "Class");
      if (n) node.parents = [iri("N" + (n - 1))];
      store.entities.set(node.iri, node);
    }
    store.rebuildSchema();
    const result = textAnalysisGraphNodes(store, [iri("N1099")]);
    const view = new Viewport(store);
    view.setBudget(Math.max(view.budget, result.iris.length));
    expect(view.seed(result.iris, true, false).refused).toBe(0);
    expect(view.nodes.size).toBe(1100);
    expect(result.roots).toEqual([iri("N0")]);
  });
  it("rejects a closure over the graph limit rather than silently omitting ancestors", async () => {
    const store = await fixture();
    expect(() => textAnalysisGraphNodes(store, [iri("Dog")], 3)).toThrow(
      "3-node graph limit",
    );
    expect(textAnalysisGraphNodes(store, [iri("Dog")], 4).iris).toHaveLength(4);
  });
  it.each([null, {}, "Dog", [17], [null], ["_:blank"], ["x".repeat(10001)]])(
    "rejects malformed selections %#",
    async (selection) => {
      expect(() => textAnalysisGraphNodes(new Store(), selection)).toThrow(
        "Invalid Text Analysis",
      );
    },
  );
  it("rejects empty or removed matches", async () => {
    const store = await fixture();
    expect(() => textAnalysisGraphNodes(store, [])).toThrow(
      "no matched ontology",
    );
    expect(() => textAnalysisGraphNodes(store, [iri("Deleted")])).toThrow(
      "no longer available",
    );
  });
});
