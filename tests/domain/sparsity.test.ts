import { describe, it, expect } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { NS, THING } from "../../src/domain/model";
import { analyzeSparsity } from "../../src/domain/sparsity";
import { readSparsityOptions } from "../../src/shared/sparsity";
import { readPreferences } from "../../src/shared/preferences";
const base = "https://example.org/sparsity#";
const prefixes =
  "@prefix : <" +
  base +
  ">. @prefix owl: <" +
  NS.owl +
  ">. @prefix rdfs: <" +
  NS.rdfs +
  ">. ";
const node = (name: string, parent?: string) =>
  ":" +
  name +
  " a owl:Class" +
  (parent ? "; rdfs:subClassOf :" + parent : "") +
  ". ";
const branches = (parent: string, count: number) =>
  Array.from({ length: count }, (_, i) => node(parent + i, parent)).join("");
const body =
  node("Root") +
  node("A", "Root") +
  node("B", "Root") +
  branches("A", 5) +
  branches("B", 1);
const fixture = async (text = body) =>
  storeFromRdf(
    (await parseRdf(prefixes + text, "sparsity.ttl", base)).triples,
    "Sparsity",
  );
const analyze = (
  store: Awaited<ReturnType<typeof fixture>>,
  iri = "Root",
  descendantWeight = 20,
) =>
  analyzeSparsity(store, {
    iri: iri === THING ? iri : base + iri,
    descendantWeight,
  });
const row = (r: ReturnType<typeof analyze>, name: string, parent = "Root") =>
  r.rows.find((v) => v.iri === base + name && v.parent === base + parent)!;
it("flags one child against five and leaves balanced leaf groups unflagged", async () => {
  const report = analyze(await fixture());
  expect(row(report, "B")).toMatchObject({
    children: 1,
    peerChildren: 5,
    score: 80,
    peers: 1,
    nearby: 0,
  });
  expect(row(report, "A").score).toBe(0);
  expect(report.rows.filter((r) => r.score > 0).map((r) => r.name)).toEqual([
    "B",
  ]);
  expect(report).toMatchObject({ classes: 9, groups: 2, unpaired: 1 });
});
it("uses only local siblings and ignores unrelated branches outside the chosen scope", async () => {
  const s = await fixture(
    body +
      node("Elsewhere") +
      node("Huge", "Elsewhere") +
      branches("Huge", 200),
  );
  expect(row(analyze(s), "B").score).toBe(80);
  expect(analyze(s, "A").rows.every((r) => r.parent === base + "A")).toBe(true);
  expect(analyze(s, "A").classes).toBe(6);
});
it("normalizes by other siblings rather than including the candidate in its own mean", async () => {
  const r = analyze(await fixture(body + node("C", "Root") + branches("C", 3)));
  expect(row(r, "B")).toMatchObject({ peerChildren: 4, peers: 2, score: 75 });
  expect(row(r, "C").score).toBe(0);
});
it("direct children dominate even when a narrow branch has very many descendants", async () => {
  const s = await fixture(body + branches("B0", 100));
  expect(row(analyze(s), "B").score).toBe(80);
  expect(row(analyze(s), "A").score).toBe(20);
  expect(row(analyze(s, "Root", 0), "A").score).toBe(0);
});
it("discounts depth, stops at level four and counts shared descendants at shortest distance", async () => {
  const s = await fixture(
    node("Root") +
      node("A", "Root") +
      node("B", "Root") +
      node("X", "A") +
      node("Y", "A") +
      ":Shared a owl:Class; rdfs:subClassOf :X,:Y. " +
      node("Deep", "Shared") +
      node("Deeper", "Deep") +
      node("TooFar", "Deeper"),
  );
  expect(row(analyze(s), "A")).toMatchObject({
    children: 2,
    nearby: 3,
    discounted: 1.75,
  });
  s.moveClass(base + "Deep", base + "A", base + "Shared");
  expect(row(analyze(s), "A")).toMatchObject({
    children: 3,
    nearby: 3,
    discounted: 2.5,
  });
});
it("does not score a lone child or a group made only of leaves", async () => {
  expect(
    analyze(await fixture(node("Root") + node("A", "Root"))),
  ).toMatchObject({ groups: 0, unpaired: 1, rows: [] });
  expect(
    analyze(await fixture(node("Root") + branches("Root", 5))).rows.every(
      (r) => r.score === 0,
    ),
  ).toBe(true);
  expect(analyze(await fixture(), "B0")).toMatchObject({
    classes: 1,
    groups: 0,
    rows: [],
  });
});
it("leaf findings are relative to developed siblings, not proof of missing classes", async () => {
  const r = analyze(await fixture(body + node("Leaf", "Root")));
  expect(row(r, "Leaf")).toMatchObject({
    children: 0,
    peerChildren: 3,
    score: 100,
  });
});
it("keeps separate comparisons for multiple parents and deduplicates hierarchy links", async () => {
  const s = await fixture(
    body +
      node("Other") +
      node("C", "Other") +
      branches("C", 10) +
      ":B rdfs:subClassOf :Other,:Root.",
  );
  const r = analyze(s, THING);
  expect(row(r, "B", "Root")).toMatchObject({ peerChildren: 5, score: 80 });
  expect(row(r, "B", "Other")).toMatchObject({ peerChildren: 10, score: 90 });
  expect(r.sharedClasses).toBe(1);
});
it("whole taxonomy includes unasserted top-level roots without modifying RDF", async () => {
  const s = await fixture(body + node("Empty")),
    before = JSON.stringify(s.tbox),
    undo = s.undoStack.length;
  const r = analyze(s, THING);
  expect(
    r.rows.find((v) => v.iri === base + "Empty" && v.parent === THING)?.score,
  ).toBe(100);
  expect(r.classes).toBe(10);
  expect(JSON.stringify(s.tbox)).toBe(before);
  expect(s.undoStack.length).toBe(undo);
});
it("handles cycles and self-links without inventing inflated descendant counts", async () => {
  const s = await fixture(
    body +
      node("Cycle", "Root") +
      node("Loop", "Cycle") +
      ":Cycle rdfs:subClassOf :Loop. " +
      ":Self a owl:Class; rdfs:subClassOf :Self,:Root.",
  );
  const r = analyze(s);
  expect(r.cycleClasses).toBe(3);
  expect(
    r.rows.some((v) =>
      ["Cycle", "Loop", "Self"].some((n) => v.iri === base + n),
    ),
  ).toBe(false);
  expect(row(r, "B").score).toBe(80);
  expect(r.rows.every((v) => Number.isFinite(v.score))).toBe(true);
});
it("uses definition-derived taxonomy children but excludes individuals and unrelated RDF links", async () => {
  const s = await fixture(
    body +
      ":Defined a owl:Class; owl:equivalentClass [owl:intersectionOf (:A :B)]. :i a :A. :B rdfs:seeAlso :A.",
  );
  const r = analyze(s);
  expect(row(r, "A").children).toBe(6);
  expect(row(r, "B").children).toBe(2);
  expect(
    r.rows.some((v) => v.iri === base + "i" || v.iri.startsWith("_:")),
  ).toBe(false);
});
it("refreshes cached measures after edits and undo and does not leak caller changes", async () => {
  const s = await fixture(),
    first = analyze(s);
  first.rows[0].score = -999;
  expect(row(analyze(s), "B").score).toBe(80);
  s.moveClass(base + "A0", base + "B", base + "A");
  expect(row(analyze(s), "B")).toMatchObject({
    children: 2,
    peerChildren: 4,
    score: 50,
  });
  s.undo();
  expect(row(analyze(s), "B").score).toBe(80);
});
it("validates selection and normalizes persisted options", async () => {
  const s = await fixture();
  expect(() => analyze(s, "Absent")).toThrow("Choose an ontology class");
  expect(
    readSparsityOptions({
      descendantWeight: 200,
      minimumScore: -4,
      includeLeaves: false,
    }),
  ).toMatchObject({
    descendantWeight: 40,
    minimumScore: 0,
    includeLeaves: false,
  });
  expect(readSparsityOptions({ descendantWeight: NaN })).toMatchObject({
    descendantWeight: 20,
  });
  const options = {
    ...readSparsityOptions({ iri: base + "Root" }),
    namespace: base,
  };
  expect(
    readPreferences({
      version: 1,
      theme: "light",
      panelState: { "sparsity.view": options },
    }).panelState?.["sparsity.view"],
  ).toEqual(options);
});
it("handles a deep hierarchy iteratively and keeps distant descendants bounded", async () => {
  const text =
    node("Root") +
    Array.from({ length: 2000 }, (_, i) =>
      node("N" + i, i ? "N" + (i - 1) : "Root"),
    ).join("");
  const r = analyze(await fixture(text));
  expect(r).toMatchObject({ classes: 2001, groups: 0, unpaired: 2000 });
});
it("analyzes a 15000-class hierarchy with a bounded renderable result set", async () => {
  const s = await fixture(
    node("Root") +
      node("A", "Root") +
      node("B", "Root") +
      branches("A", 14996) +
      branches("B", 1),
  );
  const started = performance.now(),
    r = analyze(s);
  expect(r.classes).toBe(15000);
  expect(row(r, "B").score).toBeGreaterThan(99);
  expect(performance.now() - started).toBeLessThan(5000);
});
