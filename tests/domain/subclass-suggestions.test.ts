import { test, expect } from "vitest";
import {
  buildEmptyStore,
  readWorkspace,
  type Workspace,
} from "../../src/domain/workspace";
import { subclassSuggestions } from "../../src/domain/subclass-suggestions";
import { NS, SUBCLASS, THING, iriTerm } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
const setup = () => {
  const s = buildEmptyStore();
  const child = s.createClass("Alpha Beta Gamma", THING);
  const a = s.createClass("Alpha Gamma", THING);
  const b = s.createClass("Beta Gamma", THING);
  return { s, child, a, b };
};
test("Alpha Beta Gamma finds Alpha Gamma and Beta Gamma as existing parents without editing RDF", () => {
  const { s, child, a, b } = setup();
  const before = structuredClone(s.tbox);
  expect(subclassSuggestions(s, child).map((c) => c.iri)).toEqual([a, b]);
  expect(subclassSuggestions(s, a)).toEqual([]);
  expect(s.tbox).toEqual(before);
});
test("matches whole words in order, supports middle omissions, and ranks closest parents first", () => {
  const { s, child, a, b } = setup();
  const gamma = s.createClass("Gamma", THING);
  s.createClass("Gamma Alpha", THING);
  s.createClass("Alph Gamma", THING);
  s.createClass("Alpha Beta Gamma Extra", THING);
  expect(subclassSuggestions(s, child).map((c) => c.iri)).toEqual([
    a,
    b,
    gamma,
  ]);
});
test("excludes existing ancestors, descendants, unrelated names, negated targets and individuals", () => {
  const { s, child, a, b } = setup();
  s.addClassParents(child, [a]);
  s.addClassParents(b, [child]);
  s.createClass("Beta", b);
  s.createClass("History", THING);
  s.createNamedIndividual("Gamma", THING);
  expect(subclassSuggestions(s, child)).toEqual([]);
  const negative = s.createClass("Non Alpha Beta Gamma", THING);
  expect(subclassSuggestions(s, negative)).toEqual([]);
});
test("index follows renames, creation, and Undo", () => {
  const { s, child, a, b } = setup();
  expect(subclassSuggestions(s, child)).toHaveLength(2);
  s.rename(a, "Other Procedure");
  expect(subclassSuggestions(s, child).map((c) => c.iri)).toEqual([b]);
  s.undo();
  expect(subclassSuggestions(s, child)).toHaveLength(2);
  s.createClass("Alpha Beta", THING);
  expect(subclassSuggestions(s, child)).toHaveLength(3);
});
test("accepted parents create ordinary links from the selected child with one Undo", () => {
  const { s, child, a, b } = setup();
  const before = structuredClone(s.tbox),
    count = s.undoStack.length;
  s.addClassParents(child, [a, b, a]);
  expect(s.undoStack.length).toBe(count + 1);
  for (const parent of [a, b]) {
    expect(s.tbox).toContainEqual({
      subject: child,
      predicate: SUBCLASS,
      object: iriTerm(parent),
    });
    expect(s.entities.get(parent)!.parents).not.toContain(child);
  }
  expect(s.entities.get(child)!.parents).toEqual(
    expect.arrayContaining([THING, a, b]),
  );
  expect(s.tbox.length).toBe(before.length + 2);
  expect(subclassSuggestions(s, child)).toEqual([]);
  expect(
    s.tbox.some((t) =>
      [NS.owl + "intersectionOf", NS.owl + "equivalentClass"].includes(
        t.predicate,
      ),
    ),
  ).toBe(false);
  s.undo();
  expect(s.tbox).toEqual(before);
  expect(subclassSuggestions(s, child)).toHaveLength(2);
  s.redo();
  expect(subclassSuggestions(s, child)).toEqual([]);
});
test("parent batch validation prevents partial changes and cycles", () => {
  const { s, child, a, b } = setup();
  s.addClassParents(b, [child]);
  const before = structuredClone(s.tbox);
  expect(() => s.addClassParents(child, [a, "missing"])).toThrow(/existing/);
  expect(s.tbox).toEqual(before);
  expect(() => s.addClassParents(child, [a, child])).toThrow(/distinct/);
  expect(s.tbox).toEqual(before);
  expect(() => s.addClassParents(child, [a, b])).toThrow(/cycle/);
  expect(s.tbox).toEqual(before);
});
test("matching excludes parents already provided by equivalent intersection definitions", () => {
  const { s, child, a, b } = setup();
  s.setIntersection(child, [a, b]);
  expect(subclassSuggestions(s, child)).toEqual([]);
});
test("normalizes case, punctuation and camel case", () => {
  const s = buildEmptyStore();
  const child = s.createClass("UltrafastLaserPolymerCutting", THING);
  const a = s.createClass("Ultrafast_Polymer-Cutting", THING);
  const b = s.createClass("LASER polymer cutting", THING);
  expect(
    subclassSuggestions(s, child)
      .map((c) => c.iri)
      .sort(),
  ).toEqual([a, b].sort());
});
test("bounds large sets of existing parent matches", () => {
  const s = buildEmptyStore();
  const words = Array.from({ length: 10 }, (_, i) => "Word" + i);
  const child = s.createClass(words.join(" "), THING);
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 8; b++)
      for (let c = b + 1; c < 9; c++)
        for (let d = c + 1; d < 10; d++)
          s.createClass(
            [words[a], words[b], words[c], words[d]].join(" "),
            THING,
          );
  expect(subclassSuggestions(s, child)).toHaveLength(100);
});
test("partially expanded nodes can collapse using the same menu action", () => {
  const { s, child } = setup();
  for (let i = 0; i < 5; i++) s.createClass("Child " + i, child);
  const v = new Viewport(s);
  v.seed([child], true, false);
  v.expand(child, 2);
  expect(v.nodes.get(child)!.expanded).toBe(true);
  expect(v.nodes.get(child)!.shownDegree).toBeLessThan(
    v.nodes.get(child)!.degree,
  );
  v.collapse(child);
  expect(v.nodes.get(child)!.expanded).toBe(false);
});

test("saved expansion state restores the right menu action, with old workspaces supported", () => {
  const { s, child, a } = setup();
  const doc: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: s.ontology,
    entities: [...s.entities.values()],
    tbox: s.tbox,
    individuals: [],
    customers: [],
    selected: child,
    graph: {
      iris: [child, a, THING],
      focus: [child],
      pins: [],
      budget: 1000,
      layout: "circle",
      expanded: [child],
    },
  };
  expect(readWorkspace(doc).view.nodes.get(child)!.expanded).toBe(true);
  delete doc.graph.expanded;
  expect(readWorkspace(doc).view.nodes.get(child)!.expanded).toBe(false);
  doc.graph.expanded = [null as unknown as string];
  expect(() => readWorkspace(doc)).toThrow(/Invalid graph settings/);
});
