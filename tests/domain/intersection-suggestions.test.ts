import { test, expect } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import { intersectionSuggestions } from "../../src/domain/intersection-suggestions";
import { NS, SUBCLASS, THING, iriTerm } from "../../src/domain/model";
import { taxonomyParents } from "../../src/domain/class-expressions";
import { Viewport } from "../../src/domain/viewport";
import { storeFromRdf, parseRdf, writeRdf } from "../../src/domain/rdf-io";
const setup = () => {
  const s = buildEmptyStore();
  const a = s.createClass("Ultrafast Polymer Cutting", THING),
    b = s.createClass("Laser Polymer Cutting", THING),
    target = s.createClass("Ultrafast Laser Polymer Cutting", THING);
  return { s, a, b, target };
};
test("local matcher finds existing complementary labels without changing RDF", () => {
  const { s, a, b, target } = setup(),
    before = structuredClone(s.tbox);
  const results = intersectionSuggestions(s, target);
  expect(results[0].members.sort()).toEqual([a, b].sort());
  expect(results[0].coverage).toBe(1);
  expect(results[0].missing).toEqual([]);
  expect(s.tbox).toEqual(before);
});
test("matching reports missing modifiers and returns none for unrelated or negated names", () => {
  const { s, target } = setup();
  const modified = s.createClass(
    "Advanced Ultrafast Laser Polymer Cutting",
    THING,
  );
  expect(intersectionSuggestions(s, modified)[0].missing).toEqual(["advanced"]);
  expect(
    intersectionSuggestions(s, s.createClass("Library History", THING)),
  ).toEqual([]);
  expect(
    intersectionSuggestions(
      s,
      s.createClass("Non Laser Polymer Cutting", THING),
    ),
  ).toEqual([]);
});
test("label index invalidates on rename and ignores descendants", () => {
  const { s, a, b, target } = setup();
  expect(intersectionSuggestions(s, target)).toHaveLength(1);
  s.rename(a, "Other Process");
  expect(intersectionSuggestions(s, target)).toEqual([]);
  s.undo();
  s.createClass("Laser Cutting", target);
  expect(
    intersectionSuggestions(s, target).every((r) =>
      r.members.every((m) => m !== target),
    ),
  ).toBe(true);
});
test("intersection creation and branch deletion preserve semantics and support Undo", () => {
  const { s, a, b, target } = setup();
  s.setIntersection(target, [a, b]);
  expect(taxonomyParents(s.entities.get(target))).toEqual(
    expect.arrayContaining([a, b]),
  );
  expect(intersectionSuggestions(s, target)).toEqual([]);
  const v = new Viewport(s);
  v.seed([target]);
  const edge = [...v.edges.values()].find((e) => e.intersection)!;
  expect(v.nodes.has(edge.intersection!.iri)).toBe(false);
  s.setIntersection(target, [a], SUBCLASS, edge.intersection!.axiom);
  expect(s.tbox).toContainEqual({
    subject: target,
    predicate: SUBCLASS,
    object: iriTerm(a),
  });
  expect(s.entities.get(target)!.classExpressions).toBeUndefined();
  expect(s.tbox.some((t) => t.predicate === NS.owl + "intersectionOf")).toBe(
    false,
  );
  s.undo();
  expect(s.entities.get(target)!.classExpressions).toHaveLength(1);
  s.redo();
  expect(s.entities.get(target)!.classExpressions).toBeUndefined();
});
test("cycles, missing members and duplicate intersections are rejected", () => {
  const { s, a, b, target } = setup();
  expect(() =>
    s.setIntersection(a, [target, s.createClass("Child", a)]),
  ).toThrow(/cycle/);
  expect(() => s.setIntersection(target, [a, "missing"])).toThrow(/existing/);
  s.setIntersection(target, [a, b]);
  expect(() => s.setIntersection(target, [b, a])).toThrow(/already/);
});
test("shared named-graph expressions are not changed when one owner loses a member", async () => {
  const text =
    "@prefix : <http://e.test/#> . @prefix owl:<" +
    NS.owl +
    "> . @prefix rdfs:<" +
    NS.rdfs +
    "> . :A a owl:Class . :B a owl:Class . :C rdfs:subClassOf _:e . :D rdfs:subClassOf _:e . _:e a owl:Class;owl:intersectionOf (:A :B).";
  const ts = (await parseRdf(text, "x.ttl", "http://e.test/#")).triples.map(
    (t) => ({ ...t, graph: "http://e.test/graph" }),
  );
  const s = storeFromRdf(ts, "Shared"),
    c = "http://e.test/#C",
    d = "http://e.test/#D",
    a = "http://e.test/#A",
    b = "http://e.test/#B";
  const axiom = s.tbox.find(
    (t) => t.subject === c && t.predicate === SUBCLASS,
  )!;
  s.setIntersection(c, [a], SUBCLASS, axiom);
  expect(taxonomyParents(s.entities.get(d))).toEqual([a, b]);
  expect(
    s.tbox.find((t) => t.subject === c && t.predicate === SUBCLASS)?.graph,
  ).toBe("http://e.test/graph");
  const roundtrip = storeFromRdf(
    (
      await parseRdf(
        await writeRdf(s.tbox, "nquads"),
        "x.nq",
        "http://e.test/#",
      )
    ).triples,
    "Reopen",
  );
  expect(taxonomyParents(roundtrip.entities.get(d))).toEqual([a, b]);
});
