import { describe, it, expect } from "vitest";
import { buildStore } from "../../src/domain/fixture";
import { readWorkspace, type Workspace } from "../../src/domain/workspace";
import { Viewport, hidden, edgeKey } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { NS, defaultFilter } from "../../src/domain/model";
function document(): Workspace {
  const s = buildStore(1000);
  return {
    format: "axiom-workspace",
    version: 1,
    entities: [...s.entities.values()],
    tbox: s.tbox,
    individuals: s.individuals,
    customers: s.customers,
    graph: {
      iris: [NS.pizza + "Pizza"],
      focus: [NS.pizza + "Pizza"],
      pins: [{ iri: NS.pizza + "Pizza", x: 123, y: 456 }],
      budget: 1000,
      layout: "grid",
    },
    selected: NS.pizza + "Pizza",
  };
}
describe("workspace integrity", () => {
  it("round-trips edits, schema, focus and pins", () => {
    const d = document(),
      s = readWorkspace(d);
    s.store.editCell(s.store.individuals[0].iri, "price", "16.75");
    s.store.createClass("TestPizza", NS.pizza + "Pizza");
    const next = readWorkspace({
      ...d,
      entities: [...s.store.entities.values()],
      tbox: s.store.tbox,
      individuals: s.store.individuals,
    });
    expect(next.store.entities.has(NS.pizza + "TestPizza")).toBe(true);
    expect(next.store.individuals[0].price).toBe(16.75);
    expect(next.view.nodes.get(NS.pizza + "Pizza")).toMatchObject({
      x: 123,
      y: 456,
      pinned: true,
    });
    expect(next.view.focus.has(NS.pizza + "Pizza")).toBe(true);
  });
  it.each([
    "duplicate",
    "price",
    "pin",
    "restriction",
    "root",
    "customer",
    "budget",
  ])("rejects malformed %s without mutating its source", (key) => {
    const d = document();
    if (key === "duplicate") d.customers[0].iri = d.entities[0].iri;
    if (key === "price") d.individuals[0].price = NaN;
    if (key === "pin") d.graph.pins[0].x = Infinity;
    if (key === "restriction")
      d.entities[0].restrictions = [{ shape: "not", fillers: [] }];
    if (key === "root")
      d.entities = d.entities.filter((e) => !e.iri.endsWith("#Thing"));
    if (key === "customer") d.individuals[0].customerIndex = -1;
    if (key === "budget") d.graph.budget = 2;
    const before = structuredClone(d);
    expect(() => readWorkspace(d)).toThrow();
    expect(d).toEqual(before);
  });
});
it("maintains viewport edges, degrees, caps and protected nodes through 10,000 seeded operations", () => {
  const store = buildStore(1000),
    v = new Viewport(store);
  v.setBudget(100);
  const all = [
    ...store.entities.keys(),
    ...store.individuals.slice(0, 120).map((i) => i.iri),
  ];
  let seed = 234567;
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let i = 0; i < 10000; i++) {
    const iri = all[random(all.length)],
      before = new Set(
        [...v.nodes.values()]
          .filter((n) => n.pinned || v.focus.has(n.iri))
          .map((n) => n.iri),
      ),
      op = random(6);
    if (op === 0) v.admit([iri, iri]);
    if (op === 1) v.expand(iri, 12);
    if (op === 2) v.collapse(iri);
    if (op === 3 && v.nodes.has(iri))
      v.nodes.get(iri)!.pinned = !v.nodes.get(iri)!.pinned;
    if (op === 4) v.remove(iri);
    if (op === 5) {
      try {
        v.setBudget((random(3) + 1) * 100);
      } catch {}
    }
    expect(v.nodes.size).toBeLessThanOrEqual(v.budget);
    if (op < 3 || op === 5)
      for (const key of before) expect(v.nodes.has(key)).toBe(true);
    const degrees = new Map([...v.nodes.keys()].map((k) => [k, 0]));
    for (const [key, e] of v.edges) {
      expect(degrees.has(e.source) && degrees.has(e.target)).toBe(true);
      expect(key).toBe(edgeKey(e));
      degrees.set(e.source, degrees.get(e.source)! + 1);
      degrees.set(e.target, degrees.get(e.target)! + 1);
    }
    for (const n of v.nodes.values()) {
      expect(n.shownDegree).toBe(degrees.get(n.iri));
      expect(
        n.degree,
        JSON.stringify({
          step: i,
          node: n,
          edges: [...v.edges.values()].filter(
            (e) => e.source === n.iri || e.target === n.iri,
          ),
        }),
      ).toBeGreaterThanOrEqual(n.shownDegree);
    }
    expect(v.hidden).toBe(
      [...v.nodes.values()].reduce((n, node) => n + hidden(node), 0),
    );
  }
}, 60000);
it("filters customers and sorts numeric values without altering the Store order", () => {
  const s = buildStore(1000),
    original = s.individuals.slice(),
    name = s.customers[s.individuals[0].customerIndex].name;
  const rows = s.table({
    ...defaultFilter,
    query: name,
    sort: "price",
    direction: -1,
  });
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r, i) => i === 0 || rows[i - 1].price >= r.price)).toBe(
    true,
  );
  expect(s.individuals).toEqual(original);
});
it.each(["hierarchy", "radial", "grid"] as const)(
  "%s layout preserves pins and repeats deterministically",
  (mode) => {
    const s = buildStore(1000),
      v = new Viewport(s);
    v.seed([NS.pizza + "Pizza"]);
    const pinned = v.nodes.get(NS.pizza + "Pizza")!;
    pinned.pinned = true;
    pinned.x = 231;
    pinned.y = -271;
    const l = new Layouts(v, s);
    l.choice = mode;
    l.run();
    const first = [...v.nodes.values()].map((n) => [n.x, n.y]);
    l.run();
    expect([...v.nodes.values()].map((n) => [n.x, n.y])).toEqual(first);
    expect(pinned).toMatchObject({ x: 231, y: -271 });
  },
);
