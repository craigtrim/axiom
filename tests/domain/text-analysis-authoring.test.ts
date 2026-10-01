import { describe, expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  textAnalysisDraft,
  createTextAnalysisClass,
  createTextAnalysisHierarchy,
} from "../../src/domain/text-analysis-authoring";
import { buildStore } from "../../src/domain/fixture";
import { readPreferences } from "../../src/shared/preferences";
import { NS, THING, SUBCLASS, TYPE } from "../../src/domain/model";
import { selectedEntityName } from "../../src/shared/selected-entity-name";
const base = "https://example.org/authoring#";
const turtle = `@prefix : <${base}> . @prefix owl: <${NS.owl}> .
@prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> .
: a owl:Ontology .
:Systems a owl:Class; rdfs:label "Systems"; skos:altLabel "platforms, frameworks" .
:Electronic a owl:Class; rdfs:label "Electronic" .
:Stem a owl:Class; rdfs:label "stem" .
:System a owl:NamedIndividual; rdfs:label "Surveillance" .
:prop a owl:ObjectProperty; rdfs:label "Electronic Surveillance" .
:Cafe a owl:Class; rdfs:label "Café" .
:Pair a owl:Class; skos:altLabel "alpha+beta" .
`;
const fixture = async () =>
  storeFromRdf((await parseRdf(turtle, "test.ttl", base)).triples, "test");
describe("create classes from selected text", () => {
  it.each([
    ["Basic ENGLISH COMPOSITION", "Composition"],
    ["PERSONAL DIMENSIONS OF EDUCATION", "Education"],
    ["Basic ETHICS & SOCIAL RESPONSIBILITY", "Social Responsibility"],
    ["INTRO TO HIV PREVENTION", "HIV Prevention"],
    ["PHD SEMINAR IN GIS", "GIS"],
    ["CALCULUS II", "Calculus"],
  ])(
    "title casing %s preserves parent ranking and duplicate detection",
    async (phrase, parentName) => {
      const store = await fixture();
      const parent = store.createClass(parentName, THING);
      const seeded = selectedEntityName(phrase);
      const rawDraft = textAnalysisDraft(store, phrase, 1);
      const seededDraft = textAnalysisDraft(store, seeded, 1);
      expect(seededDraft).toEqual({ ...rawDraft, label: seeded });
      expect(seededDraft.defaultParent).toBe(parent);
      expect(seededDraft.existing).toEqual([]);
      const created = createTextAnalysisClass(store, seeded, parent);
      const rawCollision = textAnalysisDraft(store, phrase, 1);
      expect(textAnalysisDraft(store, seeded, 1)).toEqual({
        ...rawCollision,
        label: seeded,
      });
      expect(rawCollision.existing).toEqual([{ iri: created, label: seeded }]);
      const version = store.version;
      expect(() => createTextAnalysisClass(store, phrase, parent)).toThrow(
        /existing class/,
      );
      expect(() => createTextAnalysisClass(store, seeded, parent)).toThrow(
        /existing class/,
      );
      expect(store.version).toBe(version);
    },
  );
  it.each(["ADVANCED PLATFORMS", "ADVANCED FRAMEWORKS", "ADVANCED CAFE\u0301"])(
    "title casing %s preserves alias and Unicode parent matches",
    async (phrase) => {
      const store = await fixture();
      const seeded = selectedEntityName(phrase);
      const raw = textAnalysisDraft(store, phrase, 1);
      expect(raw.parents.length).toBeGreaterThan(0);
      expect(textAnalysisDraft(store, seeded, 1)).toEqual({
        ...raw,
        label: seeded,
      });
    },
  );
  it("suggests partial class names and prefers a trailing match at the same length", async () => {
    const store = await fixture();
    const before = JSON.stringify([...store.scan()]);
    const draft = textAnalysisDraft(
      store,
      "Electronic Surveillance Systems",
      17,
    );
    expect(draft).toMatchObject({
      label: "Electronic Surveillance Systems",
      defaultParent: base + "Systems",
      datasetEpoch: 17,
      version: store.version,
      existing: [],
    });
    expect(draft.parents.map((p) => p.iri)).toEqual([
      base + "Systems",
      base + "Electronic",
    ]);
    expect(JSON.stringify([...store.scan()])).toBe(before);
  });
  it("prefers a longer matching parent phrase and retains shorter choices", async () => {
    const store = await fixture();
    const long = store.createClass("Surveillance Systems", base + "Systems");
    const draft = textAnalysisDraft(
      store,
      "Electronic Surveillance Systems",
      1,
    );
    expect(draft.defaultParent).toBe(long);
    expect(draft.parents.map((p) => p.iri)).toContain(base + "Systems");
  });
  it.each([
    "Electronic platforms",
    "Electronic frameworks",
    "  Electronic\n  Systems  ",
  ])("uses aliases and whitespace in %s", async (phrase) => {
    const store = await fixture();
    expect(textAnalysisDraft(store, phrase, 1).defaultParent).toBe(
      base + "Systems",
    );
  });
  it("matches Unicode without matching inside words or using instances as parents", async () => {
    const store = await fixture();
    expect(
      textAnalysisDraft(store, "Advanced CAFE\u0301", 1).defaultParent,
    ).toBe(base + "Cafe");
    expect(
      textAnalysisDraft(store, "ecosystems surveillance", 1).parents,
    ).toEqual([]);
    expect(textAnalysisDraft(store, "Unmatched phrase", 1).defaultParent).toBe(
      THING,
    );
  });
  it("does not treat plus-pattern syntax as an existing literal name", async () => {
    const store = await fixture();
    expect(textAnalysisDraft(store, "alpha beta", 1).existing).toEqual([]);
  });
  it.each(["systems", "PLATFORMS", "frameworks"])(
    "recognizes existing classes for %s and prevents duplicates",
    async (phrase) => {
      const store = await fixture(),
        version = store.version,
        before = store.tripleCount;
      expect(textAnalysisDraft(store, phrase, 1).existing).toEqual([
        { iri: base + "Systems", label: "Systems" },
      ]);
      expect(() => createTextAnalysisClass(store, phrase, THING)).toThrow(
        /existing class/,
      );
      expect(store.version).toBe(version);
      expect(store.tripleCount).toBe(before);
    },
  );
  it("keeps duplicate labels from different namespaces as separate choices", async () => {
    const store = storeFromRdf(
      (
        await parseRdf(
          turtle +
            `<https://other.org/#Systems> a owl:Class; rdfs:label "Systems" .`,
          "test.ttl",
          base,
        )
      ).triples,
      "test",
    );
    expect(textAnalysisDraft(store, "systems", 1).existing).toHaveLength(2);
    expect(
      textAnalysisDraft(store, "Electronic Systems", 1).parents.filter(
        (p) => p.label === "Systems",
      ),
    ).toHaveLength(2);
  });
  it("adds exactly one class under the selected parent and supports undo and redo", async () => {
    const store = await fixture(),
      before = JSON.stringify([...store.scan()]);
    const iri = createTextAnalysisClass(
      store,
      "Electronic Surveillance Systems",
      base + "Systems",
      "A selected course topic.",
    );
    expect(store.entities.get(iri)).toMatchObject({
      label: "Electronic Surveillance Systems",
      parents: [base + "Systems"],
      comment: "A selected course topic.",
    });
    expect(store.entityStatements(iri)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predicate: TYPE,
          object: expect.objectContaining({ value: NS.owl + "Class" }),
        }),
        expect.objectContaining({
          predicate: SUBCLASS,
          object: expect.objectContaining({ value: base + "Systems" }),
        }),
      ]),
    );
    expect(
      textAnalysisDraft(store, "Electronic Surveillance Systems", 1).existing[0]
        .iri,
    ).toBe(iri);
    store.undo();
    expect(JSON.stringify([...store.scan()])).toBe(before);
    expect(
      textAnalysisDraft(store, "Electronic Surveillance Systems", 1).existing,
    ).toEqual([]);
    store.redo();
    expect(store.entities.get(iri)?.parents).toEqual([base + "Systems"]);
  });
  it("allows choosing a different parent and leaves RDF unchanged after an invalid parent", async () => {
    const store = await fixture(),
      before = JSON.stringify([...store.scan()]);
    expect(() =>
      createTextAnalysisClass(store, "New Systems", base + "prop"),
    ).toThrow(/superclass/);
    expect(JSON.stringify([...store.scan()])).toBe(before);
    const iri = createTextAnalysisClass(
      store,
      "New Systems",
      base + "Electronic",
    );
    expect(store.entities.get(iri)?.parents).toEqual([base + "Electronic"]);
  });
  it.each(["", " ", "a".repeat(257)])(
    "rejects an invalid phrase without modifying RDF",
    async (label) => {
      const store = await fixture(),
        before = store.tripleCount;
      expect(() => textAnalysisDraft(store, label, 1)).toThrow();
      expect(() => createTextAnalysisClass(store, label, THING)).toThrow();
      expect(store.tripleCount).toBe(before);
    },
  );
});
describe("entity pane preferences", () => {
  it("restores a closed pane and its size", () => {
    expect(
      readPreferences({
        version: 1,
        panelState: {
          "textanalysis.pane.open": false,
          "textanalysis.pane.size": 42,
        },
      }).panelState,
    ).toMatchObject({
      "textanalysis.pane.open": false,
      "textanalysis.pane.size": 42,
    });
  });
  it.each([0, 14, 71, Infinity, NaN, "32", null])(
    "ignores an invalid pane size %s",
    (size) => {
      expect(
        readPreferences({
          version: 1,
          panelState: { "textanalysis.pane.size": size },
        }).panelState,
      ).not.toHaveProperty("textanalysis.pane.size");
    },
  );
});

describe("multiple parents and new parent hierarchies", () => {
  const node = (
    label: string,
    parents: unknown[] = [{ iri: THING }],
    comment = "",
  ) => ({ label, comment, parents });
  it("asserts every selected parent once and restores them together", async () => {
    const store = await fixture(),
      before = [...store.scan()],
      version = store.version;
    const iri = createTextAnalysisClass(store, "New topic", [
      base + "Systems",
      base + "Electronic",
      base + "Systems",
    ]);
    expect(store.entities.get(iri)?.parents).toEqual([
      base + "Systems",
      base + "Electronic",
    ]);
    expect(
      store.entityStatements(iri).filter((t) => t.predicate === SUBCLASS),
    ).toHaveLength(2);
    expect(store.version).toBe(version + 1);
    store.undo();
    expect([...store.scan()]).toEqual(before);
    store.redo();
    expect(store.entities.get(iri)?.parents).toHaveLength(2);
  });
  it("creates a class, parent and grandparent with multiple ancestry in one undo step", async () => {
    const store = await fixture(),
      before = [...store.scan()],
      undo = store.undoStack.length;
    const iri = createTextAnalysisHierarchy(
      store,
      node(
        "Applications",
        [
          { iri: base + "Electronic" },
          {
            create: node(
              "Computer Software",
              [
                { iri: base + "Systems" },
                {
                  create: node(
                    "Technology",
                    [{ iri: THING }],
                    "Grandparent description",
                  ),
                },
              ],
              "Parent description",
            ),
          },
        ],
        "Class description",
      ),
    );
    const software = [...store.entities.values()].find(
      (e) => e.label === "Computer Software",
    )!;
    const technology = [...store.entities.values()].find(
      (e) => e.label === "Technology",
    )!;
    expect(store.entities.get(iri)).toMatchObject({
      parents: [base + "Electronic", software.iri],
      comment: "Class description",
    });
    expect(software).toMatchObject({
      parents: [base + "Systems", technology.iri],
      comment: "Parent description",
    });
    expect(technology).toMatchObject({
      parents: [THING],
      comment: "Grandparent description",
    });
    expect(store.undoStack).toHaveLength(undo + 1);
    const after = [...store.scan()];
    store.undo();
    expect([...store.scan()]).toEqual(before);
    expect(
      [iri, software.iri, technology.iri].some((id) => store.entities.has(id)),
    ).toBe(false);
    store.redo();
    expect([...store.scan()]).toEqual(after);
  });
  it.each([
    [
      "missing superclass",
      node("New topic", [
        { create: node("Parent", [{ iri: base + "missing" }]) },
      ]),
    ],
    [
      "property superclass",
      node("New topic", [{ create: node("Parent", [{ iri: base + "prop" }]) }]),
    ],
    ["individual superclass", node("New topic", [{ iri: base + "System" }])],
    [
      "duplicate existing alias",
      node("New topic", [{ create: node("platforms") }]),
    ],
    [
      "duplicate new name",
      node("New topic", [
        { create: node("Parent") },
        { create: node("PARENT") },
      ]),
    ],
    [
      "ancestor with the same name",
      node("New topic", [{ create: node("NEW TOPIC") }]),
    ],
    ["missing parents", node("New topic", [])],
    ["invalid deep label", node("New topic", [{ create: node(" ") }])],
    [
      "ambiguous parent reference",
      node("New topic", [{ iri: THING, create: node("Parent") }]),
    ],
    [
      "oversized description",
      node("New topic", [
        { create: node("Parent", [{ iri: THING }], "a".repeat(10001)) },
      ]),
    ],
  ])("rejects %s without any RDF or history change", async (_, input) => {
    const store = await fixture();
    const before = [...store.scan()],
      version = store.version,
      undo = store.undoStack.length;
    expect(() => createTextAnalysisHierarchy(store, input)).toThrow();
    expect([...store.scan()]).toEqual(before);
    expect(store.version).toBe(version);
    expect(store.undoStack).toHaveLength(undo);
  });
  it("rejects an object cycle without overflowing or changing the ontology", async () => {
    const store = await fixture(),
      before = [...store.scan()];
    const input = node("New topic");
    input.parents.push({ create: input });
    expect(() => createTextAnalysisHierarchy(store, input)).toThrow(/ancestor/);
    expect([...store.scan()]).toEqual(before);
  });
  it("allocates distinct IRIs for different labels that mint the same identifier", async () => {
    const store = await fixture();
    const result = store.createClassHierarchy([
      {
        id: "child",
        name: "Foo bar",
        comment: "",
        parents: [{ id: "parent" }],
      },
      { id: "parent", name: "Foo-bar", comment: "", parents: [{ iri: THING }] },
    ]);
    expect(new Set(result.values()).size).toBe(2);
    expect(store.entities.get(result.get("child")!)?.parents).toEqual([
      result.get("parent"),
    ]);
  });
  it("supports a shared new ancestor without duplicating it", async () => {
    const store = await fixture();
    const result = store.createClassHierarchy([
      {
        id: "child",
        name: "New topic",
        comment: "",
        parents: [{ id: "a" }, { id: "b" }],
      },
      { id: "a", name: "Parent A", comment: "", parents: [{ id: "root" }] },
      { id: "b", name: "Parent B", comment: "", parents: [{ id: "root" }] },
      { id: "root", name: "New root", comment: "", parents: [{ iri: THING }] },
    ]);
    expect(result.size).toBe(4);
    expect(store.entities.get(result.get("a")!)?.parents).toEqual([
      result.get("root"),
    ]);
    expect(store.entities.get(result.get("b")!)?.parents).toEqual([
      result.get("root"),
    ]);
  });
  it("rejects a new-class graph cycle before recording an edit", async () => {
    const store = await fixture(),
      before = [...store.scan()];
    expect(() =>
      store.createClassHierarchy([
        { id: "a", name: "Parent A", comment: "", parents: [{ id: "b" }] },
        { id: "b", name: "Parent B", comment: "", parents: [{ id: "a" }] },
      ]),
    ).toThrow(/ancestor/);
    expect([...store.scan()]).toEqual(before);
  });
  it("preserves generated data while adding and undoing a new hierarchy", () => {
    const store = buildStore(12);
    const individuals = structuredClone(store.individuals),
      customers = structuredClone(store.customers);
    const iri = createTextAnalysisHierarchy(
      store,
      node("New course", [{ create: node("New curriculum") }]),
    );
    expect(store.entities.has(iri)).toBe(true);
    expect(store.individuals).toEqual(individuals);
    expect(store.customers).toEqual(customers);
    store.undo();
    expect(store.individuals).toEqual(individuals);
    expect(store.customers).toEqual(customers);
  });
});
