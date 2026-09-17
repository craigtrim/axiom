import { expect, it } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import { THING, NS, entity } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { applyGraphAppearance } from "../../src/domain/graph-appearance";
import { styleRules, nodeStyle } from "../../src/domain/graph-style";
import { taxonomyRows } from "../../src/domain/taxonomy-rows";
import { parseRdf, storeFromRdf, writeRdf } from "../../src/domain/rdf-io";

it.each(["force", "hierarchy", "radial", "grid", "circle"] as const)(
  "keeps the action node exactly fixed through expand, collapse and settling in %s",
  (mode) => {
    const s = buildEmptyStore(),
      parent = s.createClass("Parent", THING);
    for (let i = 0; i < 8; i++) s.createClass("Child " + i, parent);
    const v = new Viewport(s);
    v.seed([parent], true, false);
    const l = new Layouts(v, s);
    l.choice = mode;
    l.run();
    const n = v.nodes.get(parent)!;
    n.x = 37.125;
    n.y = -93.75;
    v.holdPosition(parent);
    v.expand(parent);
    l.run(false);
    for (let i = 0; i < 60 && mode === "force"; i++) l.force.step(true);
    expect({ x: n.x, y: n.y }).toEqual({ x: 37.125, y: -93.75 });
    expect(n.pinned).toBe(false);
    v.holdPosition(parent);
    v.collapse(parent);
    l.run(false);
    for (let i = 0; i < 60 && mode === "force"; i++) l.force.step(true);
    expect({ x: n.x, y: n.y }).toEqual({ x: 37.125, y: -93.75 });
    l.run(true);
    expect(n.layoutFixed).toBe(false);
  },
);
it("branch styles follow taxonomy descendants while exact-node rules override them", () => {
  const s = buildEmptyStore(),
    p = s.createClass("Parent", THING),
    c = s.createClass("Child", p),
    g = s.createClass("Grandchild", c),
    other = s.createClass("Other", THING);
  const v = new Viewport(s);
  v.seed([p, c, g, other], true, false);
  const text = `node[iri="${c}"] {fill:#ff0000;} node[ancestor="${p}"] {fill:#4477aa;size:40px;}`;
  applyGraphAppearance(v, text);
  expect(nodeStyle(styleRules(text), v.nodes.get(p)!).fill).toBe("#4477aa");
  expect(nodeStyle(styleRules(text), v.nodes.get(g)!).fill).toBe("#4477aa");
  expect(nodeStyle(styleRules(text), v.nodes.get(c)!).fill).toBe("#ff0000");
  expect(nodeStyle(styleRules(text), v.nodes.get(other)!).fill).toBeUndefined();
  const added = s.createClass("Later", g);
  v.admit([added]);
  applyGraphAppearance(v, text);
  expect(nodeStyle(styleRules(text), v.nodes.get(added)!).fill).toBe("#4477aa");
});
it("taxonomy search retains ancestor paths with large branches and deterministic ordering", () => {
  const root = entity(THING, "Class"),
    parent = entity("urn:Parent", "Class");
  root.children = [parent.iri];
  parent.parents = [THING];
  const children = Array.from({ length: 6000 }, (_, i) => {
    const e = entity("urn:Child" + i, "Class");
    e.name = "Course " + i;
    e.parents = [parent.iri];
    return e;
  });
  parent.children = children.map((e) => e.iri);
  const entities = [root, parent, ...children];
  expect(taxonomyRows(entities, new Set([THING]))).toHaveLength(2);
  expect(taxonomyRows(entities, new Set([THING, parent.iri]))).toHaveLength(
    6002,
  );
  expect(taxonomyRows(entities, new Set(), "Course 5999")).toEqual([
    { iri: THING, depth: 0 },
    { iri: parent.iri, depth: 1 },
    { iri: children[5999].iri, depth: 2 },
  ]);
});
it("formats complete Turtle and RDF/XML as separate subject blocks with round-trip values", async () => {
  const input = `@prefix :<https://example.test/>. @prefix owl:<${NS.owl}>. @prefix rdfs:<${NS.rdfs}>. :A a owl:Class;rdfs:label "A [literal] <x>\\nnext". :B a owl:Class;rdfs:label "B".`;
  const parsed = await parseRdf(input, "x.ttl", "https://example.test/");
  for (const format of ["turtle", "rdfxml"] as const) {
    const text = await writeRdf(parsed.triples, format),
      loaded = await parseRdf(text, "x", "https://example.test/", format);
    expect(loaded.triples).toHaveLength(parsed.triples.length);
    expect(
      storeFromRdf(loaded.triples, "Test").resolve("https://example.test/A")
        ?.label,
    ).toBe("A [literal] <x>\nnext");
    expect(text).toMatch(/\n\s*\n/);
    if (format === "rdfxml")
      expect(text.match(/<rdf:Description /g)).toHaveLength(2);
  }
});
