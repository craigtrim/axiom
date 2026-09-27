import { describe, it, expect } from "vitest";
import {
  mergeEntityStatements,
  alignAnonymousStatements,
} from "../../src/domain/entity-merge";
import { NS, SUBCLASS, TYPE, type Triple } from "../../src/domain/model";
import { statementKey } from "../../src/domain/rdf-model";
const iri = "https://example.test/MilitaryEngineering";
const t = (
  predicate: string,
  value: string,
  literal = false,
  extra: Partial<Triple> = {},
): Triple => ({
  subject: iri,
  predicate,
  object: { literal, value },
  ...extra,
});
const parent = (name: string) => t(SUBCLASS, "https://example.test/" + name);
const label = (value: string, language = "en") =>
  t(NS.rdfs + "label", value, true, {
    object: { literal: true, value, language },
  });
const comment = (value: string) => t(NS.rdfs + "comment", value, true);
const sorted = (ts: Triple[]) => ts.map(statementKey).sort();
const a = parent("MilitaryScience"),
  b = parent("Engineering"),
  c = parent("Systems"),
  d = parent("Technology");
describe("three-way entity edits", () => {
  const examples: [string, Triple[], Triple[], Triple[], Triple[]][] = [
    ["unchanged remote", [a], [a, b], [a], [a, b]],
    ["unchanged draft", [a], [a], [a, b], [a, b]],
    ["same additions", [a], [a, b], [a, b], [a, b]],
    ["different parents", [a], [a, b], [a, c], [a, b, c]],
    [
      "parent and label",
      [a, label("Military")],
      [a, b, label("Military")],
      [a, label("Military Engineering")],
      [a, b, label("Military Engineering")],
    ],
    [
      "parent and comment",
      [a, comment("old")],
      [a, b, comment("old")],
      [a, comment("new")],
      [a, b, comment("new")],
    ],
    ["independent removals", [a, b, c], [a, b], [a, c], [a]],
    ["same removal", [a, b], [a], [a], [a]],
    ["removal and new parent", [a, b], [a], [a, b, c], [a, c]],
    ["replacement and added parent", [a, b], [a, c], [a, b, d], [a, c, d]],
    ["independent replacements", [a, b], [c, b], [a, d], [c, d]],
    ["same replacement plus extra parent", [a], [b], [b, c], [b, c]],
    ["statement reordering", [a, b], [b, a, c], [b, a], [a, b, c]],
    ["duplicate assertions", [a], [a, b, b], [a, c, c], [a, b, c]],
    [
      "new comments in different languages",
      [],
      [label("Engineering", "en")],
      [label("Ingenieurwesen", "de")],
      [label("Engineering", "en"), label("Ingenieurwesen", "de")],
    ],
    [
      "edits in different graphs",
      [
        { ...a, graph: "urn:g1" },
        { ...a, graph: "urn:g2" },
      ],
      [
        { ...b, graph: "urn:g1" },
        { ...a, graph: "urn:g2" },
      ],
      [
        { ...a, graph: "urn:g1" },
        { ...c, graph: "urn:g2" },
      ],
      [
        { ...b, graph: "urn:g1" },
        { ...c, graph: "urn:g2" },
      ],
    ],
    [
      "nonoverlapping comment edits",
      [comment("Study of engineering for military needs.")],
      [comment("The study of engineering for military needs.")],
      [comment("Study of engineering for military operations.")],
      [comment("The study of engineering for military operations.")],
    ],
  ];
  it.each(examples)("merges %s", (_, base, local, current, want) => {
    const copy = JSON.stringify([base, local, current]);
    expect(sorted(mergeEntityStatements(base, local, current))).toEqual(
      sorted(want),
    );
    expect(sorted(mergeEntityStatements(base, current, local))).toEqual(
      sorted(want),
    );
    expect(JSON.stringify([base, local, current])).toBe(copy);
  });
  it.each([
    ["different replacements", [a], [b], [c]],
    ["replacement versus deletion", [a, b], [a, c], [a]],
    ["different labels", [label("Old")], [label("Local")], [label("Remote")]],
    ["competing new label", [], [label("Local")], [label("Remote")]],
    [
      "overlapping comment",
      [comment("old")],
      [comment("local")],
      [comment("remote")],
    ],
    ["competing replacement plus shared addition", [a], [b, d], [c, d]],
    [
      "changed list member",
      [t(NS.rdf + "first", "urn:a")],
      [t(NS.rdf + "first", "urn:b")],
      [t(NS.rdf + "first", "urn:c")],
    ],
    [
      "different datatypes for the same literal",
      [comment("42")],
      [
        t(NS.rdfs + "comment", "42", true, {
          object: { value: "42", literal: true, datatype: NS.xsd + "integer" },
        }),
      ],
      [
        t(NS.rdfs + "comment", "42", true, {
          object: { value: "42", literal: true, datatype: NS.xsd + "decimal" },
        }),
      ],
    ],
  ] as [string, Triple[], Triple[], Triple[]][])(
    "preserves drafts on %s",
    (_, base, local, current) => {
      expect(() => mergeEntityStatements(base, local, current)).toThrow(
        /changed.*draft is preserved/,
      );
      expect(() => mergeEntityStatements(base, current, local)).toThrow(
        /changed.*draft is preserved/,
      );
    },
  );
  it("does not union incompatible values of an OWL functional property", () => {
    const p = "urn:serial";
    expect(() =>
      mergeEntityStatements(
        [],
        [t(p, "A", true)],
        [t(p, "B", true)],
        new Set([p]),
      ),
    ).toThrow("changed");
  });
  it("detects deleting an anonymous expression while its contents are edited", () => {
    const link = t(SUBCLASS, "_:expr"),
      inside = t(NS.owl + "someValuesFrom", "urn:A", false, {
        subject: "_:expr",
      });
    const changed = { ...inside, object: { literal: false, value: "urn:B" } };
    expect(() =>
      mergeEntityStatements([a, link, inside], [a], [a, link, changed]),
    ).toThrow("changed");
  });
  it("keeps explicit blank identities and aligns nested inline expression slots", () => {
    const base = [
      t(SUBCLASS, "_:expr"),
      t(NS.owl + "intersectionOf", "_:list", false, { subject: "_:expr" }),
      t(NS.rdf + "first", "urn:A", false, { subject: "_:list" }),
    ];
    const local = [
      t(SUBCLASS, "_:fresh"),
      t(NS.owl + "intersectionOf", "_:freshList", false, {
        subject: "_:fresh",
      }),
      t(NS.rdf + "first", "urn:B", false, { subject: "_:freshList" }),
    ];
    const aligned = alignAnonymousStatements(base, local, iri);
    expect(aligned[0].object.value).toBe("_:expr");
    expect(aligned[2].subject).toBe("_:list");
    expect(aligned[2].object.value).toBe("urn:B");
    expect(alignAnonymousStatements(base, base, iri)).toEqual(base);
  });
  it("does not guess which of several anonymous expressions a new one replaces", () => {
    const base = [t(SUBCLASS, "_:a"), t(SUBCLASS, "_:b")];
    const local = [t(SUBCLASS, "_:new")];
    expect(alignAnonymousStatements(base, local, iri)).toEqual(local);
  });
  it("can merge a label change alongside an unchanged anonymous expression", () => {
    const link = t(SUBCLASS, "_:e"),
      body = t(TYPE, NS.owl + "Class", false, { subject: "_:e" });
    expect(
      sorted(
        mergeEntityStatements(
          [a, link, body, label("Old")],
          [a, link, body, label("New")],
          [a, b, link, body, label("Old")],
        ),
      ),
    ).toEqual(sorted([a, b, link, body, label("New")]));
  });
});
