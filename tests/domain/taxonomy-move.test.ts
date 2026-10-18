import { it, expect } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { NS, SUBCLASS, THING } from "../../src/domain/model";
import { taxonomyRows } from "../../src/domain/taxonomy-rows";
import {
  classMoveIssue,
  classMovesIssue,
} from "../../src/domain/taxonomy-move";
const base = "https://example.org/move#";
// craigtrim/axiom#91: a multiple-branch drop is atomic and preserves RDF provenance.
const prefixes =
  "@prefix : <" +
  base +
  ">. @prefix owl: <" +
  NS.owl +
  ">. @prefix rdfs: <" +
  NS.rdfs +
  ">. ";
const body =
  ':A a owl:Class; rdfs:label "A". :B a owl:Class; rdfs:label "B". :Z a owl:Class; rdfs:label "Z". :Child a owl:Class; rdfs:label "Child"; rdfs:comment "Keep this"; rdfs:subClassOf :A. :Leaf a owl:Class; rdfs:subClassOf :Child. :Instance a :Child.';
const fixture = async (extra = "", file = "move.ttl") =>
  storeFromRdf(
    (await parseRdf(prefixes + body + " " + extra, file, base)).triples,
    "Move",
  );
type TestStore = Awaited<ReturnType<typeof fixture>>;
const parents = (s: TestStore, iri = base + "Child") =>
  s
    .entityStatements(iri)
    .filter((t) => t.predicate === SUBCLASS)
    .map((t) => t.object.value);
function shownParent(
  s: TestStore,
  iri: string,
  open = new Set(s.entities.keys()),
) {
  const rows = taxonomyRows(
      [...s.entities.values()].filter(
        (e) => ["Class", "Defined"].includes(e.kind) && !e.iri.startsWith("_:"),
      ),
      open,
    ),
    path: string[] = [];
  for (const row of rows) {
    if (row.iri === iri) return row.depth ? path[row.depth - 1] : null;
    path[row.depth] = row.iri;
    path.length = row.depth + 1;
  }
  return undefined;
}
it("moves the asserted parent with descendants and instances intact in one undo step", async () => {
  const s = await fixture(),
    before = structuredClone(s.tbox),
    depth = s.undoStack.length;
  expect(s.moveClass(base + "Child", base + "Z", base + "A")).toBe(true);
  expect(parents(s)).toEqual([base + "Z"]);
  expect(parents(s, base + "Leaf")).toEqual([base + "Child"]);
  expect(s.entities.get(base + "Instance")?.types).toEqual([base + "Child"]);
  expect(s.entities.get(base + "Child")?.comment).toBe("Keep this");
  expect(s.undoStack.length).toBe(depth + 1);
  s.undo();
  expect(s.tbox).toEqual(before);
  s.redo();
  expect(parents(s)).toEqual([base + "Z"]);
});
it("replaces only the dragged parent and displays multiple inheritance beneath the destination", async () => {
  const s = await fixture(":Child rdfs:subClassOf :B.");
  expect(shownParent(s, base + "Child")).toBe(base + "A");
  s.moveClass(base + "Child", base + "Z", base + "A");
  expect(parents(s)).toEqual([base + "Z", base + "B"]);
  expect(shownParent(s, base + "Child")).toBe(base + "Z");
  s.undo();
  expect(shownParent(s, base + "Child")).toBe(base + "A");
  s.redo();
  expect(shownParent(s, base + "Child")).toBe(base + "Z");
});
it("deduplicates an existing target and treats an unchanged parent as a no-op", async () => {
  const s = await fixture(":Child rdfs:subClassOf :B.");
  s.moveClass(base + "Child", base + "B", base + "A");
  expect(parents(s)).toEqual([base + "B"]);
  const version = s.version;
  expect(s.moveClass(base + "Child", base + "B", base + "B")).toBe(false);
  expect(s.version).toBe(version);
});
it("moves a root class and makes a root drop an explicit subclass assertion", async () => {
  const s = await fixture();
  s.moveClass(base + "Z", base + "B", null);
  expect(parents(s, base + "Z")).toEqual([base + "B"]);
  s.moveClass(base + "Z", THING, base + "B");
  expect(parents(s, base + "Z")).toEqual([THING]);
});
it("preserves equivalent definitions and restrictions when moving a derived branch", async () => {
  const s = await fixture(
    ":Defined a owl:Class; owl:equivalentClass [a owl:Class; owl:intersectionOf (:A :B)]; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :A]. :p a owl:ObjectProperty.",
  );
  const iri = base + "Defined",
    before = s.tbox.filter(
      (t) => t.subject !== iri || t.predicate !== SUBCLASS,
    );
  s.moveClass(iri, base + "Z", base + "A");
  expect(
    new Set(
      s.tbox
        .filter((t) => t.subject !== iri || t.predicate !== SUBCLASS)
        .map((t) => JSON.stringify(t)),
    ),
  ).toEqual(new Set(before.map((t) => JSON.stringify(t))));
  expect(parents(s, iri)).toContain(base + "Z");
  expect(parents(s, iri).some((p) => p.startsWith("_:"))).toBe(true);
  expect(s.entities.get(iri)?.taxonomyParents).toEqual(
    expect.arrayContaining([base + "Z", base + "A", base + "B"]),
  );
  expect(shownParent(s, iri)).toBe(base + "Z");
});
it("rejects self, descendants, owl:Thing and non-class destinations without mutation", async () => {
  const s = await fixture(),
    before = structuredClone(s.tbox);
  for (const [iri, target, from] of [
    [base + "Child", base + "Child", base + "A"],
    [base + "A", base + "Leaf", null],
    [THING, base + "A", null],
    [base + "Child", base + "Instance", base + "A"],
    [base + "Child", "urn:missing", base + "A"],
  ] as const)
    expect(() => s.moveClass(iri, target, from)).toThrow();
  expect(s.tbox).toEqual(before);
  expect(s.undoStack).toHaveLength(0);
});
it("detects cycles through equivalent intersection members", async () => {
  const s = await fixture(
    ":Defined a owl:Class; owl:equivalentClass [a owl:Class; owl:intersectionOf (:Child :B)].",
  );
  expect(classMoveIssue(s.entities, base + "A", base + "Defined")).toMatch(
    /descendants/,
  );
});
it("retains all named graph provenance on the moved assertions", async () => {
  const s = await fixture(
    ":g1 { :Child rdfs:subClassOf :A. } :g2 { :Child rdfs:subClassOf :A. }",
    "move.trig",
  );
  s.moveClass(base + "Child", base + "Z", base + "A");
  const links = s
    .entityStatements(base + "Child")
    .filter((t) => t.predicate === SUBCLASS);
  expect(links.map((t) => t.object.value)).toEqual([
    base + "Z",
    base + "Z",
    base + "Z",
  ]);
  expect(links.map((t) => t.graph ?? "").sort()).toEqual([
    "",
    base + "g1",
    base + "g2",
  ]);
});
it("keeps nodes reachable through another open parent and through filtered ancestry", async () => {
  const s = await fixture(":Child rdfs:subClassOf :B.");
  expect(shownParent(s, base + "Child", new Set([base + "B"]))).toBe(
    base + "B",
  );
  const rows = taxonomyRows(
    [...s.entities.values()].filter((e) =>
      ["Class", "Defined"].includes(e.kind),
    ),
    new Set(),
    "Leaf",
  );
  expect(rows.some((r) => r.iri === base + "Leaf")).toBe(true);
});
it("retains every visible class while choosing a forest in cyclic data", async () => {
  const s = await fixture(
    ":A rdfs:subClassOf :B. :B rdfs:subClassOf :A, :Z. :Child rdfs:subClassOf :B.",
  );
  const rows = taxonomyRows(
    [...s.entities.values()].filter((e) =>
      ["Class", "Defined"].includes(e.kind),
    ),
    new Set(s.entities.keys()),
  );
  expect(new Set(rows.map((r) => r.iri)).size).toBe(rows.length);
  for (const name of ["A", "B", "Z", "Child", "Leaf"])
    expect(rows.some((r) => r.iri === base + name)).toBe(true);
});

it("moves two branches with one version, one Undo, one Redo and no lost graph provenance", async () => {
  const s = await fixture(
    ":Other a owl:Class; rdfs:subClassOf :A. :g { :Other rdfs:subClassOf :A. }",
    "batch.trig",
  );
  const before = structuredClone(s.tbox),
    version = s.version;
  expect(
    s.moveClasses(
      [
        { iri: base + "Child", fromParent: base + "A" },
        { iri: base + "Other", fromParent: base + "A" },
      ],
      base + "Z",
    ),
  ).toBe(true);
  expect(s.version).toBe(version + 1);
  expect(s.undoStack).toHaveLength(1);
  expect(parents(s, base + "Other")).toEqual([base + "Z", base + "Z"]);
  expect(s.undoStack[0].label).toBe("Move 2 branches under Z");
  const after = structuredClone(s.tbox);
  s.undo();
  expect(s.tbox).toEqual(before);
  s.redo();
  expect(s.tbox).toEqual(after);
});
it("validates every member before a multi-branch transaction", async () => {
  const s = await fixture(),
    before = structuredClone(s.tbox);
  for (const moves of [
    [
      { iri: base + "Child", fromParent: base + "A" },
      { iri: base + "Z", fromParent: base + "missing" },
    ],
    [
      { iri: base + "Child", fromParent: base + "A" },
      { iri: THING, fromParent: null },
    ],
    [
      { iri: base + "Child", fromParent: base + "A" },
      { iri: base + "Child", fromParent: base + "A" },
    ],
  ])
    expect(() => s.moveClasses(moves, base + "B")).toThrow();
  expect(s.tbox).toEqual(before);
  expect(s.undoStack).toHaveLength(0);
  expect(s.version).toBe(0);
});
it("moves a large branch selection in one transaction without truncating it", async () => {
  const ids = Array.from({ length: 5000 }, (_, i) => "Branch" + i);
  const s = await fixture(
    ids.map((id) => `:${id} a owl:Class; rdfs:subClassOf :A.`).join("\n"),
  );
  const before = structuredClone(s.tbox);
  s.moveClasses(
    ids.map((id) => ({ iri: base + id, fromParent: base + "A" })),
    base + "Z",
  );
  expect(ids.every((id) => parents(s, base + id).join() === base + "Z")).toBe(
    true,
  );
  expect(s.version).toBe(1);
  expect(s.undoStack).toHaveLength(1);
  s.undo();
  expect(s.tbox).toEqual(before);
}, 15000);
it("prunes nested branches and leaves children below the moved ancestor", async () => {
  const s = await fixture();
  s.moveClasses(
    [
      { iri: base + "Child", fromParent: base + "A" },
      { iri: base + "Leaf", fromParent: base + "Child" },
    ],
    base + "Z",
  );
  expect(parents(s)).toEqual([base + "Z"]);
  expect(parents(s, base + "Leaf")).toEqual([base + "Child"]);
  expect(s.undoStack).toHaveLength(1);
});
it("blocks an existing parent only when every independent branch already sits there", async () => {
  const s = await fixture();
  expect(
    classMovesIssue(
      s.entities,
      [{ iri: base + "Child", fromParent: base + "A" }],
      base + "A",
    ),
  ).toBe("A is already the parent");
  expect(
    classMovesIssue(
      s.entities,
      [
        { iri: base + "Child", fromParent: base + "A" },
        { iri: base + "Z", fromParent: null },
      ],
      base + "A",
    ),
  ).toBeUndefined();
  s.moveClasses(
    [
      { iri: base + "Child", fromParent: base + "A" },
      { iri: base + "Z", fromParent: null },
    ],
    base + "A",
  );
  expect(parents(s)).toEqual([base + "A"]);
  expect(parents(s, base + "Z")).toEqual([base + "A"]);
});
it("counts asserted property uses independently of class membership and restores them on Undo", async () => {
  const s = await fixture(":p a owl:ObjectProperty. :Instance :p :A, :B.");
  expect(s.assertionCounts.get(base + "p")).toBe(2);
  s.updateEntity(
    base + "Instance",
    s
      .entityStatements(base + "Instance")
      .filter((t) => t.predicate !== base + "p"),
  );
  expect(s.assertionCounts.get(base + "p") ?? 0).toBe(0);
  s.undo();
  expect(s.assertionCounts.get(base + "p")).toBe(2);
});
