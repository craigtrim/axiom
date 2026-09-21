import { describe, expect, it } from "vitest";
import { findGraphNodes } from "../../src/domain/find-graph";
import { findEntities } from "../../src/domain/resource-search";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { Viewport } from "../../src/domain/viewport";
import { NS, SUBCLASS, TYPE, entity } from "../../src/domain/model";
import { Store } from "../../src/domain/store";
const base = "https://example.test/ancestry#";
const iri = (name: string) => base + name;
async function fixture() {
  const rdf = await parseRdf(
    "@prefix : <" +
      base +
      ">. @prefix owl: <" +
      NS.owl +
      ">. @prefix rdfs: <" +
      NS.rdfs +
      ">. " +
      ":Root a owl:Class. :OtherRoot a owl:Class. :Language a owl:Class; rdfs:subClassOf :Root. " +
      ":English a owl:Class; rdfs:subClassOf :Language, :OtherRoot. " +
      ':Basic a owl:Class; rdfs:label "Basic English"; rdfs:subClassOf :English; rdfs:comment "Foundation wording". ' +
      ':Advanced a owl:Class; rdfs:label "Advanced English"; rdfs:subClassOf :English. ' +
      ":Unrelated a owl:Class; rdfs:subClassOf :Root. " +
      ':student a owl:NamedIndividual, :Basic; rdfs:label "English learner". ' +
      ':Defined a owl:Class; rdfs:label "Defined language"; owl:equivalentClass [ a owl:Class; owl:intersectionOf (:English :Language) ]. ' +
      ":Cyclic a owl:Class; rdfs:subClassOf :Loop. :Loop a owl:Class; rdfs:subClassOf :Cyclic, :Root. " +
      ':property a owl:ObjectProperty; rdfs:label "English property"; rdfs:subPropertyOf :superproperty. :superproperty a owl:ObjectProperty.',
    "ancestry.ttl",
    base,
  );
  return storeFromRdf(rdf.triples, "Ancestry");
}
const options = {
  text: "English",
  fields: ["name"],
  kinds: ["classes"],
  limit: 1,
  offset: 2,
};

describe("Find result graph ancestry", () => {
  it("includes all pages, both roots and shared ancestors exactly once without unrelated siblings", async () => {
    const s = await fixture();
    const before = JSON.stringify([...s.scan()]),
      version = s.version;
    const result = findGraphNodes(s, options);
    expect(result.matches.length).toBe(findEntities(s, options).total);
    expect(new Set(result.matches)).toEqual(
      new Set(["English", "Basic", "Advanced"].map(iri)),
    );
    expect(new Set(result.iris)).toEqual(
      new Set(
        ["English", "Basic", "Advanced", "Language", "Root", "OtherRoot"].map(
          iri,
        ),
      ),
    );
    expect(result.iris.length).toBe(new Set(result.iris).size);
    expect(new Set(result.roots)).toEqual(
      new Set(["Root", "OtherRoot"].map(iri)),
    );
    expect(s.version).toBe(version);
    expect(JSON.stringify([...s.scan()])).toBe(before);
    const graph = new Viewport(s);
    graph.seed(result.iris, true, false);
    expect([...graph.nodes.keys()]).toEqual(result.iris);
    for (const [child, parent] of [
      ["Basic", "English"],
      ["Advanced", "English"],
      ["English", "Language"],
      ["English", "OtherRoot"],
      ["Language", "Root"],
    ])
      expect([...graph.edges.values()]).toContainEqual(
        expect.objectContaining({
          source: iri(child),
          target: iri(parent),
          predicate: SUBCLASS,
        }),
      );
  });
  it("uses the same cosine threshold, fields, kind facets and exclusion as the result list", async () => {
    const s = await fixture();
    const cosine = {
      ...options,
      text: "English Basic",
      match: "cosine",
      minimumSimilarity: 1,
    };
    expect(findGraphNodes(s, cosine).matches).toEqual([iri("Basic")]);
    const field = {
      ...options,
      text: "foundation",
      fields: [NS.rdfs + "comment"],
    };
    expect(findGraphNodes(s, field).matches).toEqual([iri("Basic")]);
    expect(
      findGraphNodes(s, { ...options, excludeIri: iri("English") }).matches,
    ).not.toContain(iri("English"));
    // An excluded search match can still be needed as an ancestor.
    expect(
      findGraphNodes(s, { ...options, excludeIri: iri("English") }).iris,
    ).toContain(iri("English"));
    expect(() =>
      findGraphNodes(s, { ...cosine, excludeIri: iri("Basic") }),
    ).toThrow("no search results");
  });
  it("follows instance types and property ancestry, excluding declaration metadata", async () => {
    const s = await fixture();
    const instance = findGraphNodes(s, { ...options, kinds: ["individuals"] });
    expect(instance.matches).toEqual([iri("student")]);
    expect(new Set(instance.iris)).toEqual(
      new Set(
        ["student", "Basic", "English", "Language", "Root", "OtherRoot"].map(
          iri,
        ),
      ),
    );
    const graph = new Viewport(s);
    graph.seed(instance.iris, true, false);
    expect([...graph.edges.values()]).toContainEqual(
      expect.objectContaining({
        source: iri("student"),
        target: iri("Basic"),
        predicate: TYPE,
      }),
    );
    expect(
      findGraphNodes(s, { ...options, kinds: ["properties"] }).iris,
    ).toEqual([iri("property"), iri("superproperty")]);
  });
  it("keeps equivalent intersection branches and their real predicates intact", async () => {
    const s = await fixture();
    const result = findGraphNodes(s, {
      text: "Defined language",
      match: "exact",
      fields: ["name"],
    });
    expect(new Set(result.iris)).toEqual(
      new Set(["Defined", "English", "Language", "Root", "OtherRoot"].map(iri)),
    );
    const graph = new Viewport(s);
    graph.seed(result.iris, true, false);
    const branches = [...graph.edges.values()].filter(
      (e) => e.source === iri("Defined"),
    );
    expect(branches).toHaveLength(2);
    expect(
      branches.every(
        (e) => e.predicate === NS.owl + "equivalentClass" && e.intersection,
      ),
    ).toBe(true);
  });
  it("terminates cycles, retains their root path and does not invent roots for disconnected classes", async () => {
    const s = await fixture();
    expect(
      new Set(
        findGraphNodes(s, { text: "Cyclic", fields: ["name"], match: "exact" })
          .iris,
      ),
    ).toEqual(new Set(["Cyclic", "Loop", "Root"].map(iri)));
    expect(
      findGraphNodes(s, { text: "OtherRoot", fields: ["name"], match: "exact" })
        .iris,
    ).toEqual([iri("OtherRoot")]);
  });
  it("works with generated individuals and traverses a deep hierarchy iteratively", () => {
    const s = new Store();
    for (let i = 0; i < 1100; i++) {
      const e = entity(iri("Depth" + i), "Class");
      if (i) e.parents = [iri("Depth" + (i - 1))];
      s.entities.set(e.iri, e);
    }
    s.rebuildSchema();
    s.loadGenerated(
      [
        {
          iri: iri("order"),
          index: 0,
          type: iri("Depth1099"),
          reference: "Needle",
          branch: "x",
          price: 1,
          timestamp: 0,
          rating: 1,
          customerIndex: 0,
        },
      ],
      [{ iri: iri("customer"), name: "Demo customer" }],
    );
    const result = findGraphNodes(s, { text: "Needle", fields: ["name"] });
    expect(result.iris).toHaveLength(1101);
    expect(result.iris.at(-1)).toBe(iri("Depth0"));
    const graph = new Viewport(s);
    graph.setBudget(Math.max(graph.budget, result.iris.length));
    expect(graph.seed(result.iris, true, false).refused).toBe(0);
    expect(graph.nodes.size).toBe(1101);
  });
  it("rejects an oversized ancestry closure rather than dropping matches or root paths", async () => {
    const s = await fixture();
    expect(() => findGraphNodes(s, options, 5)).toThrow("5-node graph limit");
    expect(findGraphNodes(s, options, 6).iris).toHaveLength(6);
    expect(() => findGraphNodes(s, { ...options, fields: [] })).toThrow(
      "no search results",
    );
  });
});
