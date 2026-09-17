import { Draw, render } from "../../src/renderer/scene";
import type { GraphSnapshot } from "../../src/shared/protocol";
import { test, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { parseRdf, storeFromRdf, writeRdf } from "../../src/domain/rdf-io";
import { NS, SUBCLASS, TYPE, iriTerm } from "../../src/domain/model";
import {
  INTERSECTION,
  EQUIVALENT_CLASS,
  namedClass,
  taxonomyParents,
  taxonomyChildren,
} from "../../src/domain/class-expressions";
import { Viewport, edgeKey } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { readWorkspace, type Workspace } from "../../src/domain/workspace";
import { statementKey } from "../../src/domain/rdf-model";
const base = "http://devry.edu/courses#",
  owner = base + "3D_Design_and_3D_Printing";
const a = base + "3D_Design",
  b = base + "3D_Printing";
const source = await readFile(
  "tests/fixtures/intersections/courses.ttl",
  "utf8",
);
const load = async (text = source) =>
  storeFromRdf((await parseRdf(text, "courses.ttl", base)).triples, "Courses");

test("subclass intersections become ordinary parent statements and graph arrows", async () => {
  const s=await load(), e=s.entities.get(owner)!;
  expect(e.kind).toBe("Class"); expect(e.parents).toEqual([a,b]); expect(e.classExpressions).toBeUndefined();
  expect(s.tbox.some(t=>t.predicate===INTERSECTION || t.predicate===EQUIVALENT_CLASS)).toBe(false);
  expect(taxonomyChildren(s.entities.get(a))).toContain(owner);
  const v=new Viewport(s); v.seed([owner]);
  expect([...v.nodes.keys()].sort()).toEqual([owner,a,b].sort());
  expect(v.edges.size).toBe(2);
  expect([...v.edges.values()].every(e=>e.predicate===SUBCLASS && !e.intersection)).toBe(true);
  const l=new Layouts(v,s); l.run(); expect(l.resolved).toBe("hierarchy");
  expect(v.nodes.get(a)!.y).toBeLessThan(v.nodes.get(owner)!.y);
});

test("equivalence, including reversed triples, stays distinct from subclass", async () => {
  for (const text of [
    source.replace("rdfs:subClassOf", "owl:equivalentClass"),
    source +
      "\n[ owl:intersectionOf ( :3D_Design :3D_Printing ) ] owl:equivalentClass :Reverse .",
  ]) {
    const s = await load(text),
      e = s.entities.get(text.includes(":Reverse") ? base + "Reverse" : owner)!;
    expect(e.kind).toBe("Defined");
    expect(e.classExpressions![0].predicate).toBe(EQUIVALENT_CLASS);
    expect(taxonomyParents(e)).toEqual([a, b]);
  }
});

test("nested conjunctions project branches; restrictions are not taxonomy parents", async () => {
  const s = await load(
    source.replace(
      "( :3D_Design :3D_Printing )",
      "( :3D_Design [ owl:intersectionOf (:3D_Printing :Extra) ] [ a owl:Restriction ; owl:onProperty :uses ; owl:someValuesFrom :Tool ] )",
    ),
  );
  expect(taxonomyParents(s.entities.get(owner))).toEqual([
    a,
    b,
    base + "Extra",
  ]);
  const v = new Viewport(s);
  v.seed([owner]);
  expect(
    [...v.nodes.values()].filter((n) => n.kind === "Intersection"),
  ).toHaveLength(0);
  expect(v.nodes.has(base + "Extra")).toBe(true);
  expect([...v.nodes.values()].some((n) => n.label === "uses some Tool")).toBe(
    true,
  );
  expect([...v.nodes.values()].every((n) => !n.label.startsWith("_:"))).toBe(
    true,
  );
});

test("named intersections retain their identity and infer only the safe parent direction", async () => {
  const s = await load(
    source +
      "\n:Named owl:intersectionOf (:3D_Design :3D_Printing) .\n:Child rdfs:subClassOf [ owl:intersectionOf (:Named :Extra) ] .",
  );
  expect(s.entities.get(base + "Named")!.kind).toBe("Defined");
  expect(taxonomyParents(s.entities.get(base + "Named"))).toEqual([a, b]);
  expect(taxonomyParents(s.entities.get(base + "Child"))).toEqual([
    base + "Named",
    base + "Extra",
  ]);
  expect(taxonomyParents(s.entities.get(a))).toEqual([]);
});

test("bad lists and cyclic nested expressions cannot hang, leak list cells or infer partial parents", async () => {
  for (const list of [
    "_:list <" + NS.rdf + "first> :3D_Design ; <" + NS.rdf + "rest> _:list .",
    "_:list <" + NS.rdf + "first> :3D_Design .",
    "_:list <" +
      NS.rdf +
      'first> "literal" ; <' +
      NS.rdf +
      "rest> <" +
      NS.rdf +
      "nil> .",
  ]) {
    const s = await load(
      source.replace("( :3D_Design :3D_Printing )", "_:list") + "\n" + list,
    );
    const e = s.entities.get(owner)!,
      expression = s.entities.get(e.classExpressions![0].iri)!;
    expect(expression.intersection!.issue).toBeTruthy();
    expect(expression.intersection!.members).toEqual([]);
    expect(taxonomyParents(e)).toEqual([]);
    const v = new Viewport(s);
    v.seed([owner]);
    expect(v.nodes.size).toBe(1);
  }
  const s = await load(
    source +
      "\n_:cycle owl:intersectionOf (_:cycle :3D_Design) .\n:Loop rdfs:subClassOf _:cycle .",
  );
  const v = new Viewport(s);
  v.seed([base + "Loop"]);
  expect(v.nodes.size).toBe(2);
});

test("RDF lists are resolved within their statement graph", async () => {
  const s = await load(source.replace("rdfs:subClassOf", "owl:equivalentClass")),
    ts = structuredClone(s.tbox);
  const head = ts.find((t) => t.predicate === INTERSECTION)!;
  for (const t of ts) t.graph = "https://example.test/graph";
  const list = ts.find((t) => t.predicate === NS.rdf + "first")!;
  ts.push({
    ...list,
    object: iriTerm(base + "Wrong"),
    graph: "https://example.test/other",
  });
  const result = storeFromRdf(ts, "Named graphs");
  expect(result.entities.get(head.subject)!.intersection!.members).toEqual([
    a,
    b,
  ]);
  expect(taxonomyParents(result.entities.get(owner))).not.toContain(
    base + "Wrong",
  );
});

test("export, workspace reopen, rename and Undo preserve equivalent definitions", async () => {
  const s = await load(source.replace("rdfs:subClassOf", "owl:equivalentClass")),
    original = s.tbox.map(statementKey).sort();
  const serialized = await writeRdf(s.tbox, "turtle"),
    reimport = await load(serialized);
  expect(taxonomyParents(reimport.entities.get(owner))).toEqual([a, b]);
  expect(reimport.entities.get(owner)!.parents).toEqual([]);
  s.rename(a, "Design in three dimensions");
  s.undo();
  expect(s.tbox.map(statementKey).sort()).toEqual(original);
  const v = new Viewport(s);
  v.seed([owner]);
  const document: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: s.ontology,
    entities: [...s.entities.values()],
    tbox: s.tbox,
    individuals: [],
    customers: [],
    graph: {
      iris: [...v.nodes.keys()],
      focus: [owner],
      pins: [],
      budget: 100,
      layout: "hierarchy",
    },
    selected: owner,
  };
  const reopened = readWorkspace(JSON.parse(JSON.stringify(document)));
  expect(reopened.store.tbox.map(statementKey).sort()).toEqual(original);
  expect(taxonomyParents(reopened.store.entities.get(owner))).toEqual([a, b]);
  expect(
    [...reopened.view.nodes.values()].filter((n) => n.kind === "Intersection"),
  ).toHaveLength(0);
  const junction = s.entities.get(owner)!.classExpressions![0].iri;
  expect(() => s.rename(junction, "Wrong")).toThrow(/expression/);
  expect(() =>
    s.createEdge({
      subject: junction,
      predicate: SUBCLASS,
      object: iriTerm(a),
    }),
  ).toThrow(/expression/);
});

test("expression expansion obeys the graph node budget", async () => {
  const s = await load(
    source.replace(
      "( :3D_Design :3D_Printing )",
      "(" +
        Array.from({ length: 250 }, (_, i) => ":Member" + i).join(" ") +
        ")",
    ),
  );
  const v = new Viewport(s);
  v.setBudget(100);
  v.seed([owner]);
  expect(v.nodes.size).toBeLessThanOrEqual(100);
  const junction = v.nodes.get(owner)!;
  expect(junction.degree - junction.shownDegree).toBeGreaterThan(0);
  expect(v.nodes.has(owner)).toBe(true);
});

test("graph export has branches and preserves the subclass or equivalence caption", async () => {
  for (const [predicate, caption] of [
    ["rdfs:subClassOf", "subclass of all"],
    ["owl:equivalentClass", "equivalent to all"],
  ]) {
    const s = await load(source.replace("rdfs:subClassOf", predicate)),
      v = new Viewport(s);
    v.seed([owner]);
    const layouts = new Layouts(v, s);
    layouts.choice = "hierarchy";
    layouts.run();
    const g: GraphSnapshot = {
      nodes: [...v.nodes.values()],
      edges: [...v.edges.values()],
      focus: [owner],
      budget: 100,
      hidden: v.hidden,
      revision: 0,
      mode: layouts.resolved,
      choice: "hierarchy",
      groups: [],
      rings: [],
      ringOrigin: { x: 0, y: 0 },
      frozen: true,
    };
    for (const dark of [false, true]) {
      const d = new Draw(null, 800, 600, {
        measureText: (text: string) => ({ width: text.length * 7 }),
      } as CanvasRenderingContext2D);
      render(d, g, { x: 400, y: 100, zoom: 1 }, dark, owner);
      const svg = d.finish();
      expect(svg).not.toContain(">AND</text>");
      if (predicate === "owl:equivalentClass") expect(svg).toContain(">" + caption + "</text>");
      else expect(svg).not.toContain("subclass of all");
      expect(svg).toContain("3D Design");
      expect(svg).toContain("3D Printing");
      expect(svg).not.toContain("_:n3-");
    }
  }
});
