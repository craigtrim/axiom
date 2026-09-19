import { expect, test } from "vitest";
import { ancestryTrail } from "../../src/domain/ancestry";
import { entity, THING, type Entity } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
const base = "https://example.org/ancestry#";
const tree = (rows: [string, string[]][]) =>
  new Map(
    rows.map(([name, parents]) => {
      const e = entity(base + name, "Class");
      e.label = name;
      e.parents = parents.map((p) => base + p);
      return [e.iri, e];
    }),
  );
const names = (result: ReturnType<typeof ancestryTrail>) =>
  result.stages.map((stage) => stage.map((step) => step.label));

test("consolidates Basic English into four stages, including its definition and cycle", async () => {
  const store = storeFromRdf(
    (
      await parseRdf(
        "@prefix : <" +
          base +
          ">. @prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. " +
          ":Course a owl:Class. :Language a owl:Class; rdfs:subClassOf :Course. " +
          ":English a owl:Class; rdfs:subClassOf :Language, :EnglishLanguage. " +
          ':EnglishLanguage a owl:Class; rdfs:label "English Language"; owl:equivalentClass [a owl:Class; owl:intersectionOf (:English :Language)]. ' +
          ':BasicEnglish a owl:Class; rdfs:label "Basic English"; rdfs:subClassOf :EnglishLanguage.',
        "ancestry.ttl",
        base,
      )
    ).triples,
    "Ancestry",
  );
  const before = JSON.stringify(store.tbox);
  const result = ancestryTrail(store.entities, base + "BasicEnglish");
  expect(names(result)).toEqual([
    ["Basic English"],
    ["English Language"],
    ["English", "Language"],
    ["Course"],
  ]);
  expect(result.stages[1][0].parents.map((p) => p.relation)).toEqual([
    "definition",
    "definition",
  ]);
  expect(result.stages[2][0].parents.map((p) => p.label)).toEqual([
    "English Language",
    "Language",
  ]);
  expect(result.more).toBe(false);
  expect(JSON.stringify(store.tbox)).toBe(before);
});

test("merges diamond paths and groups shared roots without duplicating any entity", () => {
  const index = tree([
    ["Root", []],
    ["Other root", []],
    ["A", ["Root"]],
    ["B", ["Root", "Other root"]],
    ["Child", ["B", "A", "B"]],
  ]);
  const result = ancestryTrail(index, base + "Child");
  expect(names(result)).toEqual([
    ["Child"],
    ["A", "B"],
    ["Other root", "Root"],
  ]);
  expect(result.stages.at(-1)!.every((step) => step.root)).toBe(true);
});

test("retains instance memberships and keeps roots last across different branch depths", () => {
  const index = tree([
    ["Root", []],
    ["A", ["B"]],
    ["B", ["Root"]],
  ]);
  const instance = entity(base + "One", "Individual");
  instance.types = [base + "Root", base + "A", "_:anonymous"];
  index.set(instance.iri, instance);
  const result = ancestryTrail(index, instance.iri);
  expect(names(result)).toEqual([["One"], ["A"], ["B"], ["Root"]]);
  expect(result.stages[0][0].parents.map((p) => [p.label, p.relation])).toEqual(
    [
      ["A", "instance"],
      ["Root", "instance"],
    ],
  );
  const a = index.get(base + "A")!;
  a.types = [base + "Unrelated"];
  expect(names(ancestryTrail(index, a.iri))).toEqual([["A"], ["B"], ["Root"]]);
});

test("does not invent Thing as a parent or label a cycle as a root", () => {
  const index = tree([
    ["Alone", []],
    ["A", ["B"]],
    ["B", ["A"]],
    ["Self", ["Self"]],
  ]);
  index.set(THING, entity(THING, "Class"));
  expect(names(ancestryTrail(index, base + "Alone"))).toEqual([["Alone"]]);
  expect(names(ancestryTrail(index, base + "A"))).toEqual([["A"], ["B"]]);
  for (const id of ["A", "Self"]) {
    const result = ancestryTrail(index, base + id);
    expect(result.stages.flat().some((step) => step.root)).toBe(false);
    expect(new Set(result.stages.flat().map((step) => step.iri)).size).toBe(
      result.stages.flat().length,
    );
    expect(result.more).toBe(false);
  }
});

test("traverses a combinatorial taxonomy once per ancestor", () => {
  const rows: [string, string[]][] = [["Child", ["A0", "B0"]]];
  for (let i = 0; i < 30; i++) {
    const parents = i === 29 ? [] : ["A" + (i + 1), "B" + (i + 1)];
    rows.push(["A" + i, parents], ["B" + i, parents]);
  }
  const result = ancestryTrail(tree(rows), base + "Child");
  expect(result.stages).toHaveLength(31);
  expect(result.stages.flat()).toHaveLength(61);
  expect(result.more).toBe(false);
});

test("bounds broad ancestry and can load the remainder", () => {
  const rows: [string, string[]][] = [["Child", []]];
  for (let i = 0; i < 90; i++) {
    rows[0][1].push("Parent" + i);
    rows.push(["Parent" + i, []]);
  }
  const index = tree(rows);
  const first = ancestryTrail(index, base + "Child", 64);
  expect(first.stages.flat()).toHaveLength(64);
  expect(first.more).toBe(true);
  const all = ancestryTrail(index, base + "Child", 128);
  expect(all.stages.flat()).toHaveLength(91);
  expect(all.more).toBe(false);
});

test("handles deep ancestry iteratively and ignores unrelated nodes", () => {
  const rows: [string, string[]][] = Array.from({ length: 700 }, (_, i) => [
    "Level" + i,
    i ? ["Level" + (i - 1)] : [],
  ]);
  const index = tree(rows);
  for (let i = 0; i < 15000; i++)
    index.set(base + "Unrelated" + i, entity(base + "Unrelated" + i, "Class"));
  const result = ancestryTrail(index, base + "Level699");
  expect(result.stages).toHaveLength(700);
  expect(result.stages.at(-1)![0].label).toBe("Level0");
  expect(result.stages.at(-1)![0].root).toBe(true);
  expect(result.more).toBe(false);
});

test("marks unresolved ancestors and handles an untyped individual", () => {
  const index = tree([["Child", ["Missing"]]]);
  const missing = ancestryTrail(index, base + "Child").stages[1][0];
  expect(missing.unresolved).toBe(true);
  expect(missing.root).toBe(false);
  const e: Entity = entity(base + "One", "Individual");
  index.set(e.iri, e);
  expect(names(ancestryTrail(index, e.iri))).toEqual([["One"]]);
});
