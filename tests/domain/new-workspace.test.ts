import { it, expect } from "vitest";
import {
  buildEmptyStore,
  readWorkspace,
  type Workspace,
} from "../../src/domain/workspace";
import { NS, THING, TYPE } from "../../src/domain/model";
import { executeQuery } from "../../src/domain/query";
it("starts with only the ontology root and no example records", () => {
  const s = buildEmptyStore();
  expect(s.ontology.example).toBe(false);
  expect(s.classCount).toBe(1);
  expect(s.individualCount).toBe(0);
  expect([...s.entities.keys()]).toEqual([THING]);
  expect(s.undoStack).toHaveLength(0);
  expect(() => s.rename(THING, "Anything")).toThrow(/root/);
});
it("creates and queries native ontology classes and individuals with undo and redo", async () => {
  const s = buildEmptyStore(),
    person = s.createClass("Person", THING),
    alice = s.createNamedIndividual("Alice", person);
  expect(person).toBe("http://example.org/ontology#Person");
  expect(s.instanceIris(person)).toEqual([alice]);
  expect(s.instanceCount(person)).toBe(1);
  expect([...s.scan(person, TYPE)]).toContainEqual({
    subject: person,
    predicate: TYPE,
    object: { value: NS.owl + "Class", literal: false },
  });
  const query = await executeQuery(
    s.querySnapshot(),
    "SELECT ?s WHERE { ?s a <" + person + "> . }",
    new AbortController().signal,
  );
  expect(query.rows).toHaveLength(1);
  expect(query.rows[0][0]?.value).toBe(alice);
  s.undo();
  expect(s.exists(alice)).toBe(false);
  expect(s.instanceCount(person)).toBe(0);
  s.redo();
  expect(s.exists(alice)).toBe(true);
  expect(s.instanceCount(person)).toBe(1);
});
it("round-trips generic ontology metadata and exact node limits", () => {
  const s = buildEmptyStore(),
    person = s.createClass("Person", THING),
    alice = s.createNamedIndividual("Alice", person);
  const d: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: s.ontology,
    entities: [...s.entities.values()],
    tbox: s.tbox,
    individuals: [],
    customers: [],
    graph: {
      iris: [person, alice],
      focus: [person],
      pins: [],
      budget: 357,
      layout: "grid",
    },
    selected: alice,
  };
  const restored = readWorkspace(d);
  expect(restored.store.ontology).toEqual(s.ontology);
  expect(restored.view.budget).toBe(357);
  expect(restored.selected).toBe(alice);
  expect(restored.store.instanceIris(person)).toEqual([alice]);
  expect(restored.store.createClass("Company", THING)).toBe(
    s.ontology.namespace + "Company",
  );
  expect(readWorkspace({ ...d, selected: "missing" }).selected).toBe(THING);
});
it.each([0, 99, 15001, 357.5])(
  "rejects unsupported node limit %s",
  (budget) => {
    const s = buildEmptyStore();
    expect(() =>
      readWorkspace({
        format: "axiom-workspace",
        version: 1,
        ontology: s.ontology,
        entities: [...s.entities.values()],
        tbox: s.tbox,
        individuals: [],
        customers: [],
        graph: { iris: [], focus: [], pins: [], budget, layout: "auto" },
        selected: THING,
      }),
    ).toThrow(/graph settings/);
  },
);
