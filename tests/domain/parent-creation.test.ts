// #227: Parent creation rewrites only inherited named edges, atomically.
import { expect, it } from "vitest";
import { createAddEntity, checkAddEntity } from "../../src/domain/add-entity";
import {
  readSavedAddEntity,
  type AddEntityInput,
} from "../../src/shared/add-entity";
import { NS, SUBCLASS, THING, TYPE } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  declaration,
  fromTriples,
  iri,
  reference,
} from "../fixtures/search/fixture";

const fixture = () =>
  fromTriples([
    ...["Row", "Old", "Other", "Descendant"].flatMap((n) =>
      declaration(iri(n), n),
    ),
    reference(iri("Row"), SUBCLASS, iri("Old")),
    reference(iri("Row"), SUBCLASS, iri("Other")),
    reference(iri("Row"), SUBCLASS, "_:restriction"),
    reference("_:restriction", TYPE, NS.owl + "Restriction"),
    reference("_:restriction", NS.owl + "onProperty", iri("property")),
    reference("_:restriction", NS.owl + "someValuesFrom", iri("Old")),
    reference(iri("Descendant"), SUBCLASS, iri("Row")),
  ]);
const input = (parents = [iri("Old")]): AddEntityInput => ({
  kind: "class",
  root: {
    label: "Inserted",
    comment: "",
    insertAbove: iri("Row"),
    manualParents: true,
    parents: parents.map((iri) => ({ iri })),
  },
});
it.each<string[]>([[iri("Old")], [iri("Old"), iri("Other")], []])(
  "inserts above a row with chosen parents %j and restores the exact RDF with one undo",
  (...parents) => {
    const store = fixture(),
      before = [...store.scan()];
    const creation = input(parents);
    expect(checkAddEntity(store, creation, 1).findings).toEqual([]);
    const result = createAddEntity(store, creation, 1);
    expect(store.entities.get(result.iri)?.parents).toEqual(
      parents.length ? parents : [THING],
    );
    const rowParents = store
      .entityStatements(iri("Row"))
      .filter((t) => t.predicate === SUBCLASS && !t.object.literal)
      .map((t) => t.object.value);
    expect(new Set(rowParents)).toEqual(
      new Set([
        iri("Inserted"),
        "_:restriction",
        ...[iri("Old"), iri("Other")].filter((p) => !parents.includes(p)),
      ]),
    );
    const after = [...store.scan()];
    store.undo();
    expect([...store.scan()]).toEqual(before);
    expect(store.entities.has(result.iri)).toBe(false);
    store.redo();
    expect([...store.scan()]).toEqual(after);
  },
);
it("inserts between a row and its only named parent", () => {
  const store = fromTriples([
    ...declaration(iri("Row"), "Row"),
    ...declaration(iri("Old"), "Old"),
    reference(iri("Row"), SUBCLASS, iri("Old")),
  ]);
  const result = createAddEntity(store, input(), 1);
  expect(store.entities.get(iri("Row"))?.parents).toEqual([result.iri]);
  expect(store.entities.get(result.iri)?.parents).toEqual([iri("Old")]);
});

it("preserves a defined class's intersection while inserting its asserted parent", async () => {
  const parsed = await parseRdf(
    `@prefix : <https://search.test/ontology#>.
    @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    :Old a owl:Class. :Other a owl:Class.
    :Row a owl:Class; rdfs:subClassOf :Old;
      owl:equivalentClass [owl:intersectionOf (:Old :Other)].`,
    "parent.ttl",
    "https://search.test/ontology#",
  );
  const store = storeFromRdf(parsed.triples, "Defined class");
  store.ontology.namespace = "https://search.test/ontology#";
  const before = [...store.scan()];
  expect(store.entities.get(iri("Row"))?.kind).toBe("Defined");
  createAddEntity(store, input(), 1);
  expect(
    store
      .entityStatements(iri("Row"))
      .filter((t) => t.predicate === SUBCLASS)
      .map((t) => t.object.value),
  ).toEqual([iri("Inserted")]);
  expect(
    [...store.scan()].filter(
      (t) => t.predicate !== SUBCLASS && t.subject !== iri("Inserted"),
    ),
  ).toEqual(before.filter((t) => t.predicate !== SUBCLASS));
  store.undo();
  expect([...store.scan()]).toEqual(before);
});

it("creates a drafted ancestor and inserts the root in the same undo", () => {
  const store = fixture(),
    before = [...store.scan()],
    creation = input();
  creation.root.parents = [
    {
      create: {
        label: "Drafted Ancestor",
        comment: "",
        parents: [{ iri: iri("Old") }],
      },
    },
  ];
  const result = createAddEntity(store, creation, 1);
  expect(store.entities.get(result.iri)?.parents).toEqual([
    iri("DraftedAncestor"),
  ]);
  expect(store.entities.get(iri("Row"))?.parents).toContain(result.iri);
  store.undo();
  expect([...store.scan()]).toEqual(before);
});
it.each([iri("Row"), iri("Descendant")])(
  "rejects a cycle through %s before writing",
  (parent) => {
    const store = fixture(),
      before = [...store.scan()],
      creation = input([parent]);
    expect(checkAddEntity(store, creation, 1).findings).toEqual([
      expect.objectContaining({
        kind: "bad2",
        message: "A class cannot be its own ancestor.",
      }),
    ]);
    expect(() => createAddEntity(store, creation, 1)).toThrow(/ancestor/);
    expect([...store.scan()]).toEqual(before);
  },
);
it.each([THING, iri("missing"), "_:restriction"])(
  "rejects unavailable or non-class row %s",
  (row) => {
    const store = fixture(),
      before = [...store.scan()],
      creation = input();
    creation.root.insertAbove = row;
    expect(() => createAddEntity(store, creation, 1)).toThrow(/non-root class/);
    expect([...store.scan()]).toEqual(before);
  },
);
it("retains the insertion target in saved drafts and rejects an individual insertion", () => {
  const creation = input();
  expect(
    readSavedAddEntity({ ...creation, phrase: "inserted", origin: "find" }).root
      .insertAbove,
  ).toBe(iri("Row"));
  expect(() =>
    createAddEntity(fixture(), { ...creation, kind: "individual" }, 1),
  ).toThrow(/Parent action/);
});
