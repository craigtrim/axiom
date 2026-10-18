// craigtrim/axiom#90: verify the real RDF worker measure against the reference's own seed.
import { expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { analyzeSparsity } from "../../src/domain/sparsity";
import {
  readSparsityOptions,
  groupSparsityRows,
  pageSparsityGroups,
  sparsityRowKey,
  type SparsityRow,
} from "../../src/shared/sparsity";
import {
  sparsityFixture,
  sparsityBase,
} from "../fixtures/sparsity-visual/fixture";

it("matches every reference comparison at every influence chip and both scopes without changing RDF", async () => {
  const f = sparsityFixture();
  const store = storeFromRdf(
    (await parseRdf(f.turtle, "reference.ttl", sparsityBase)).triples,
    "Reference",
  );
  const before = JSON.stringify(store.tbox);
  expect(f.names.length - 1).toBe(467);
  for (const scope of ["owl:Thing", "Business"])
    for (const weight of [0, 10, 20, 30, 40]) {
      const actual = analyzeSparsity(store, {
        iri: f.iri(scope),
        descendantWeight: weight,
      });
      const ref = f.compute(scope, weight);
      expect(actual).toMatchObject({
        groups: ref.groups.length,
        unpaired: ref.lone,
        excluded: ref.cyc,
        compared: ref.scanned,
      });
      expect(actual.rows.length).toBe(ref.measured);
      if (scope === "owl:Thing")
        expect(actual).toMatchObject({
          classes: 467,
          groups: 205,
          unpaired: 51,
          excluded: 4,
          compared: 824,
        });
      for (const g of ref.groups)
        for (const r of g.rows) {
          const found = actual.rows.find(
            (x) => x.parent === f.iri(g.parent) && x.iri === f.iri(r.name),
          );
          expect(found, g.parent + " / " + r.name).toMatchObject({
            children: r.c,
            discounted: r.d,
            peerChildren: r.mc,
            peerDiscounted: r.md,
            peers: r.peers,
            score: r.score,
          });
        }
      expect(actual.compared).toBe(
        actual.rows.length + actual.unpaired + actual.excluded,
      );
    }
  expect(JSON.stringify(store.tbox)).toBe(before);
  expect(store.undoStack).toHaveLength(0);
});

it("rounds before filtering and compares clean children beneath a cyclic parent", async () => {
  const node = (name: string, parents: string[]) =>
    `<urn:${name}> a <http://www.w3.org/2002/07/owl#Class>${parents.length ? "; <http://www.w3.org/2000/01/rdf-schema#subClassOf> " + parents.map((p) => `<urn:${p}>`).join(",") : ""} .`;
  let turtle = node("Root", []) + node("M", ["Root"]) + node("N", ["Root"]);
  for (const [branch, children, nearby] of [
    ["M", 7, 38],
    ["N", 10, 39],
  ] as const) {
    for (let i = 0; i < children; i++) turtle += node(branch + i, [branch]);
    for (let i = 0; i < nearby; i++)
      turtle += node(branch + "D" + i, [branch + "0"]);
  }
  turtle +=
    node("P", ["Root", "Q"]) +
    node("Q", ["P"]) +
    node("X", ["P"]) +
    node("Y", ["P"]);
  for (let i = 0; i < 3; i++) turtle += node("X" + i, ["X"]);
  const store = storeFromRdf(
    (await parseRdf(turtle, "rounding.ttl", "urn:")).triples,
    "Rounding",
  );
  const report = analyzeSparsity(store, { iri: "urn:Root" });
  expect(
    report.rows.find((r) => r.iri === "urn:M" && r.parent === "urn:Root")
      ?.score,
  ).toBe(25);
  expect(
    report.rows.find((r) => r.iri === "urn:Y" && r.parent === "urn:P")?.score,
  ).toBe(100);
  expect(report.compared).toBe(
    report.rows.length + report.unpaired + report.excluded,
  );
});

it("maps saved intermediate influence settings to the nearest chip with halves up", () => {
  for (const [saved, expected] of [
    [0, 0],
    [4, 0],
    [5, 10],
    [14, 10],
    [15, 20],
    [25, 30],
    [35, 40],
    [39, 40],
  ])
    expect(
      readSparsityOptions({ descendantWeight: saved }).descendantWeight,
    ).toBe(expected);
});

it("pages the reference's 90 groups and 144 findings with repeated group context", async () => {
  const f = sparsityFixture();
  const store = storeFromRdf(
    (await parseRdf(f.turtle, "reference.ttl", sparsityBase)).triples,
    "Reference",
  );
  const report = analyzeSparsity(store, { iri: f.iri("owl:Thing") });
  const groups = groupSparsityRows(report.rows, readSparsityOptions({}));
  expect(groups).toHaveLength(90);
  expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(144);
  expect(pageSparsityGroups(groups, [], 0).pages).toBe(3);
  const open = groups.map((g) => g.parent);
  const first = pageSparsityGroups(groups, open, 0),
    second = pageSparsityGroups(groups, open, 1);
  expect(first.pages).toBe(6);
  expect(second.entries).toHaveLength(41);
  expect(second.entries[0].row).toBeUndefined();
  expect(second.entries[0].group.parent).toBe(second.entries[1].group.parent);
  expect(pageSparsityGroups(groups, [], 5).page).toBe(2);
  const all = Array.from({ length: 6 }, (_, i) =>
    pageSparsityGroups(groups, open, i)
      .entries.filter((e) => e.row)
      .map((e) => sparsityRowKey(e.row!)),
  ).flat();
  expect(new Set(all).size).toBe(144);
  expect(all.length).toBe(144);
});

it("filters rounded positive scores by labels while retaining the complete baseline and original group rank", () => {
  const make = (
    parent: string,
    name: string,
    score: number,
    children: number,
    siblingOrder: number,
  ) =>
    ({
      parent,
      parentName: parent,
      iri: "urn:" + name,
      name,
      score,
      children,
      siblingOrder,
    }) as SparsityRow;
  const rows = [
    make("Alpha", "Retain", 60, 1, 2),
    make("Alpha", "Hidden", 100, 0, 1),
    make("Alpha", "Even", 0, 5, 0),
    make("Beta", "Retain", 70, 1, 1),
    make("Beta", "Even", 0, 5, 0),
  ];
  const groups = groupSparsityRows(
    rows,
    readSparsityOptions({
      minimumScore: 0,
      includeLeaves: false,
      text: "retain",
    }),
  );
  expect(groups.map((g) => g.name)).toEqual(["Alpha", "Beta"]);
  expect(groups[0].all.map((r) => r.name)).toEqual([
    "Even",
    "Retain",
    "Hidden",
  ]);
  expect(groups[0].rows.map((r) => r.score)).toEqual([60]);
  expect(groups[0].mean).toBe(2);
  expect(
    groupSparsityRows(
      rows,
      readSparsityOptions({ minimumScore: 0, text: "urn:" }),
    ),
  ).toHaveLength(0);
  expect(
    groupSparsityRows(
      rows,
      readSparsityOptions({ minimumScore: 0, text: "alpha" }),
    )[0].rows.map((r) => r.name),
  ).toEqual(["Hidden", "Retain"]);
  expect(sparsityRowKey({ ...rows[0], parent: "Beta" })).not.toBe(
    sparsityRowKey(rows[0]),
  );
});

it("normalizes saved report state without accepting malformed group or page values", () => {
  expect(
    readSparsityOptions({
      report: true,
      open: ["a", "a", null, 7, "b"],
      selected: "pair",
      page: -1,
      request: 3,
    }),
  ).toMatchObject({
    report: true,
    open: ["a", "b"],
    selected: "pair",
    page: 0,
    request: 3,
  });
  expect(
    readSparsityOptions({
      report: "true",
      open: { a: true },
      selected: 2,
      page: Infinity,
    }),
  ).toMatchObject({ report: false, open: [], selected: "", page: 0 });
});
