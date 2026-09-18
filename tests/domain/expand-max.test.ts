import { test, expect } from "vitest";
import { storeFromRdf, parseRdf } from "../../src/domain/rdf-io";
import { NS, TYPE, iriTerm, type Triple } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
const base = "http://expand.test/#";
function fixture(links: [string, string][], extra: string[] = []) {
  const names = [...new Set([...links.flat(), ...extra])];
  const triples: Triple[] = names.map((n) => ({
    subject: base + n,
    predicate: TYPE,
    object: iriTerm(NS.owl + "Class"),
  }));
  triples.push(
    ...links.map(([a, b]) => ({
      subject: base + a,
      predicate: base + "related",
      object: iriTerm(base + b),
    })),
  );
  const store = storeFromRdf(triples, "Expand max"),
    view = new Viewport(store);
  return { store, view };
}
test("expands all visible roots breadth-first and fills the remaining capacity without eviction", () => {
  const links: [string, string][] = [];
  for (const root of ["A", "B"])
    for (let i = 0; i < 40; i++) {
      links.push(
        [root, root + i],
        [root + i, root + i + "deep"],
        [root + i + "deep", root + i + "deeper"],
      );
    }
  const { store, view } = fixture(links, ["Unrelated"]);
  view.setBudget(100);
  view.seed([base + "A", base + "B"], true, false);
  const rdf = structuredClone(store.tbox);
  expect(view.expandMax()).toEqual({ added: 98, limitReached: true });
  for (const root of ["A", "B"]) {
    expect(view.nodes.has(base + root)).toBe(true);
    for (let i = 0; i < 40; i++)
      expect(view.nodes.has(base + root + i)).toBe(true);
  }
  expect([...view.nodes.values()].filter((n) => n.distance === 2)).toHaveLength(
    18,
  );
  expect([...view.nodes.values()].some((n) => n.iri.endsWith("deeper"))).toBe(
    false,
  );
  expect(view.nodes.has(base + "Unrelated")).toBe(false);
  expect(store.tbox).toEqual(rdf);
  const before = structuredClone([...view.nodes]);
  expect(view.expandMax()).toEqual({ added: 0, limitReached: true });
  expect([...view.nodes]).toEqual(before);
});
test("continues transitively in both directions and stops at the reachable component", () => {
  const { view } = fixture([
    ["A", "B"],
    ["B", "C"],
    ["D", "C"],
    ["X", "Y"],
  ]);
  view.seed([base + "A"], true, false);
  expect(view.expandMax()).toEqual({ added: 3, limitReached: false });
  expect([...view.nodes.keys()]).toEqual(
    ["A", "B", "C", "D"].map((n) => base + n),
  );
  expect(view.nodes.get(base + "D")!.distance).toBe(3);
  expect(view.expandMax()).toEqual({ added: 0, limitReached: false });
});
test("terminates on cycles, self-loops and duplicate paths", () => {
  const { view } = fixture([
    ["A", "B"],
    ["A", "C"],
    ["B", "D"],
    ["C", "D"],
    ["D", "A"],
    ["A", "A"],
  ]);
  view.seed([base + "A"], true, false);
  expect(view.expandMax()).toEqual({ added: 3, limitReached: false });
  expect(view.nodes.size).toBe(4);
});
test("empty and isolated maps do not pull in unrelated ontology nodes", () => {
  const { view } = fixture([["A", "B"]], ["Isolated"]);
  expect(view.expandMax()).toEqual({ added: 0, limitReached: false });
  view.seed([base + "Isolated"], true, false);
  expect(view.expandMax()).toEqual({ added: 0, limitReached: false });
  expect([...view.nodes.keys()]).toEqual([base + "Isolated"]);
});
test("walks beyond capped neighbor lists when many predicates point to an already visible node", () => {
  const ts: Triple[] = ["A", "B", "C"].map((n) => ({
    subject: base + n,
    predicate: TYPE,
    object: iriTerm(NS.owl + "Class"),
  }));
  for (let i = 0; i < 4100; i++)
    ts.push({
      subject: base + "A",
      predicate: base + "p" + i,
      object: iriTerm(base + "B"),
    });
  ts.push({
    subject: base + "A",
    predicate: base + "last",
    object: iriTerm(base + "C"),
  });
  const store = storeFromRdf(ts, "Large adjacency"),
    view = new Viewport(store);
  view.seed([base + "A", base + "B"], true, false);
  expect(
    store.neighbours(base + "A").list.some((n) => n.iri === base + "C"),
  ).toBe(false);
  expect(view.expandMax()).toEqual({ added: 1, limitReached: false });
  expect(view.nodes.has(base + "C")).toBe(true);
});
test("expands projected intersection members without anonymous collection nodes", async () => {
  const parsed = await parseRdf(
    "@prefix : <" +
      base +
      ">. @prefix owl:<" +
      NS.owl +
      ">. :A a owl:Class;owl:equivalentClass [a owl:Class;owl:intersectionOf (:B :C)]. :B a owl:Class. :C a owl:Class.",
    "x.ttl",
    base,
  );
  const store = storeFromRdf(parsed.triples, "Intersection"),
    view = new Viewport(store);
  view.seed([base + "A"], true, false);
  expect(view.expandMax().added).toBe(2);
  expect([...view.nodes.keys()].sort()).toEqual(
    ["A", "B", "C"].map((n) => base + n),
  );
});
test.each(["force", "hierarchy", "radial", "grid", "circle"] as const)(
  "keeps all original nodes fixed during %s layout after expansion",
  (mode) => {
    const { store, view } = fixture([
      ["A", "B"],
      ["B", "C"],
      ["D", "E"],
    ]);
    view.seed([base + "A", base + "D"], true, false);
    view.nodes.get(base + "A")!.x = 41.25;
    view.nodes.get(base + "A")!.y = -67.75;
    view.nodes.get(base + "D")!.x = 225;
    view.nodes.get(base + "D")!.y = 309;
    view.nodes.get(base + "D")!.pinned = true;
    view.expandMax();
    const layouts = new Layouts(view, store);
    layouts.choice = mode;
    layouts.run(false);
    if (mode === "force") for (let i = 0; i < 30; i++) layouts.force.step(true);
    expect(view.nodes.get(base + "A")).toMatchObject({
      x: 41.25,
      y: -67.75,
      pinned: false,
    });
    expect(view.nodes.get(base + "D")).toMatchObject({
      x: 225,
      y: 309,
      pinned: true,
    });
  },
);
