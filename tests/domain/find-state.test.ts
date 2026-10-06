import { beforeEach, expect, it, vi } from "vitest";
import { NS, SUBCLASS, THING, TYPE, type Entity } from "../../src/domain/model";
import { parseRdf } from "../../src/domain/rdf-io";
import {
  declaration,
  fromTriples,
  iri,
  reference,
} from "../fixtures/search/fixture";

const client = vi.hoisted(() => ({
  panel: (_key: string, fallback: unknown) => fallback,
  savePanel: vi.fn(),
  command: vi.fn(),
  state: { entities: [] as Entity[] },
}));
vi.mock("../../src/renderer/client", () => client);
import {
  findState,
  openFindCreation,
  syncFindEpoch,
  updateFind,
  updateFindDraft,
} from "../../src/renderer/find-state";

let epoch = 0;
beforeEach(() => {
  syncFindEpoch(++epoch);
  client.state.entities = [];
  updateFind({ text: "new sibling" });
});

it.each([
  ["one named parent", [iri("Parent")], [iri("Parent")]],
  [
    "two named parents",
    [iri("Parent"), iri("Other")],
    [iri("Parent"), iri("Other")],
  ],
  [
    "a parent and a restriction",
    [iri("Parent"), "_:restriction"],
    [iri("Parent")],
  ],
  ["no parent", [], []],
  ["only a restriction", ["_:restriction"], []],
  ["Thing", [THING], []],
  ["Thing and a named parent", [THING, iri("Parent")], [iri("Parent")]],
  ["a self reference", [iri("Row"), iri("Parent")], [iri("Parent")]],
])("Sibling prefills %s", (_name, parents, expected) => {
  const store = fromTriples([
    ...declaration(iri("Row"), "Row"),
    ...declaration(iri("Parent"), "Parent"),
    ...declaration(iri("Other"), "Other"),
    reference("_:restriction", TYPE, NS.owl + "Restriction"),
    reference("_:restriction", NS.owl + "onProperty", iri("property")),
    reference("_:restriction", NS.owl + "someValuesFrom", iri("Parent")),
    ...parents.map((parent) => reference(iri("Row"), SUBCLASS, parent)),
  ]);
  client.state.entities = [...store.entities.values()];
  openFindCreation({ door: "sibling", target: iri("Row") });
  expect(findState().draft).toMatchObject({
    label: "New Sibling",
    kind: "Class",
    parents: expected,
    origin: { door: "sibling", target: iri("Row") },
  });
});

it("Sibling uses the taxonomy parents of a defined intersection", async () => {
  const parsed = await parseRdf(
    `@prefix : <https://search.test/ontology#>.
     @prefix owl: <${NS.owl}>.
     :Parent a owl:Class. :Other a owl:Class.
     :Row a owl:Class; owl:equivalentClass [owl:intersectionOf (:Parent :Other)].`,
    "sibling.ttl",
    "https://search.test/ontology#",
  );
  const store = fromTriples(parsed.triples);
  client.state.entities = [...store.entities.values()];
  expect(store.entities.get(iri("Row"))?.kind).toBe("Defined");
  openFindCreation({ door: "sibling", target: iri("Row") });
  expect(findState().draft.parents).toEqual([iri("Parent"), iri("Other")]);
});

it("retains edited Sibling parents separately from Subclass and other rows", () => {
  client.state.entities = [
    ...fromTriples([
      ...declaration(iri("Row"), "Row"),
      ...declaration(iri("Parent"), "Parent"),
      reference(iri("Row"), SUBCLASS, iri("Parent")),
    ]).entities.values(),
  ];
  openFindCreation({ door: "sibling", target: iri("Row") });
  updateFindDraft({ label: "Edited sibling", labelEdited: true, parents: [] });
  openFindCreation({ door: "subclass", target: iri("Row") });
  expect(findState().draft.parents).toEqual([iri("Row")]);
  updateFindDraft({ label: "Edited subclass", labelEdited: true });
  openFindCreation({ door: "sibling", target: iri("Parent") });
  expect(findState().draft.label).toBe("New Sibling");
  openFindCreation({ door: "sibling", target: iri("Row") });
  expect(findState().draft).toMatchObject({
    label: "Edited sibling",
    parents: [],
  });
  openFindCreation({ door: "subclass", target: iri("Row") });
  expect(findState().draft.label).toBe("Edited subclass");
});
