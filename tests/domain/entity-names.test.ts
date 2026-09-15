import { describe, it, expect } from "vitest";
import {
  identifier,
  isDefaultIdentifier,
  labelledIri,
  LABEL,
} from "../../src/domain/rdf-model";
import { buildEmptyStore } from "../../src/domain/workspace";
import { buildStore } from "../../src/domain/fixture";
import { storeFromRdf } from "../../src/domain/rdf-io";
import { THING, TYPE, NS, type Triple } from "../../src/domain/model";

describe("default entity identifiers follow the first meaningful label", () => {
  it("uses the creation normalizer for spaces, punctuation and Unicode", () => {
    expect(identifier("Alpha Beta !! Gamma")).toBe("AlphaBetaGamma");
    expect(identifier("  Course   Credit  ")).toBe("CourseCredit");
    expect(identifier("123 credits")).toBe("Entity123Credits");
    expect(identifier("Ｃourse Credit")).toBe("CourseCredit");
    const s = buildEmptyStore();
    const a = s.createClass("New class", THING);
    expect(s.rename(a, "Alpha Beta !! Gamma")).toBe(
      s.ontology.namespace + identifier("Alpha Beta !! Gamma"),
    );
    expect(s.createClass("Alpha Beta !! Gamma", THING)).toBe(
      s.ontology.namespace + "AlphaBetaGamma2",
    );
  });
  it.each([
    "NewClass",
    "NewClass2",
    "NewNode123",
    "new_class_2",
    "NewIndividual",
    "NewProperty",
    "NewObjectProperty2",
  ])("recognizes only a complete placeholder pattern: %s", (name) => {
    expect(isDefaultIdentifier("https://example.org/#" + name)).toBe(true);
    expect(labelledIri("urn:test:" + name, "Course Credit", () => false)).toBe(
      "urn:test:CourseCredit",
    );
  });
  it.each([
    "CourseCredit",
    "CourseCredit2",
    "NewYork",
    "NewClassroom",
    "NewNodeType",
    "Class",
    "Customer42",
  ])("keeps established identifier %s when relabeling", (name) => {
    const iri = "https://example.org/#" + name;
    expect(isDefaultIdentifier(iri)).toBe(false);
    expect(labelledIri(iri, "A revised label", () => false)).toBe(iri);
  });
  it("keeps defaults until a meaningful label and then preserves the established name on later edits", () => {
    const s = buildEmptyStore(),
      a = s.createClass("New class", THING),
      b = s.createClass("New class", THING);
    expect(s.rename(b, "New class")).toBe(b);
    const next = s.rename(a, "Course Credit");
    expect(s.rename(next, "Credit hours")).toBe(next);
    expect(s.entities.get(next)?.label).toBe("Credit hours");
    expect(s.exists(a)).toBe(false);
    expect(s.exists(b)).toBe(true);
  });
  it("resolves collisions without merging entities, retargets incoming types and supports undo", () => {
    const s = buildEmptyStore(),
      existing = s.createClass("Course Credit", THING),
      old = s.createClass("New class 2", THING),
      individual = s.createNamedIndividual("Student", old);
    const next = s.rename(old, "Course Credit");
    expect(next).toBe(existing + "2");
    expect(s.entities.get(individual)?.types).toContain(next);
    expect(
      s.tbox.find(
        (t) =>
          t.subject === individual &&
          t.predicate === TYPE &&
          t.object.value === next,
      ),
    ).toBeDefined();
    expect(s.entities.get(existing)?.label).toBe("Course Credit");
    s.undo();
    expect(s.entities.get(old)?.label).toBe("New class 2");
    expect(s.entities.get(individual)?.types).toContain(old);
    s.redo();
    expect(s.exists(next)).toBe(true);
  });
  it("repairs a saved default-name mismatch using the current label, retaining language and named graph", () => {
    const old = "https://example.org/NewClass",
      graph = "https://example.org/annotations";
    const triples: Triple[] = [
      {
        subject: old,
        predicate: TYPE,
        object: { literal: false, value: NS.owl + "Class" },
      },
      {
        subject: old,
        predicate: LABEL,
        object: { literal: true, value: "Course Credit", language: "en" },
        graph,
      },
      {
        subject: old,
        predicate: LABEL,
        object: { literal: true, value: "Crédit", language: "fr" },
        graph,
      },
    ];
    const s = storeFromRdf(triples, "Existing mismatch");
    const next = s.rename(old, "Course Credit");
    expect(next).toBe("https://example.org/CourseCredit");
    expect(s.tbox.filter((t) => t.predicate === LABEL)).toEqual(
      triples.slice(1).map((t) => ({ ...t, subject: next })),
    );
  });
  it("applies the same rule through detailed statement editing, including an explicit identifier override", () => {
    const s = buildEmptyStore(),
      old = s.createClass("New node", THING);
    const ts = s
      .entityStatements(old)
      .map((t) =>
        t.predicate === LABEL
          ? { ...t, object: { ...t.object, value: "Course Credit" } }
          : t,
      );
    expect(s.updateEntity(old, ts)).toBe(s.ontology.namespace + "CourseCredit");
    const other = s.createClass("New class", THING),
      explicit = s.ontology.namespace + "Credits";
    const edited = s
      .entityStatements(other)
      .map((t) =>
        t.predicate === LABEL
          ? { ...t, object: { ...t.object, value: "Course Credit" } }
          : t,
      );
    expect(s.updateEntity(other, edited, explicit)).toBe(explicit);
  });
  it("also promotes a newly created default in the example while keeping its established identifiers fixed", () => {
    const s = buildStore(0),
      old = s.createClass("New class", THING);
    const next = s.rename(old, "Course Credit");
    expect(next).toBe(s.ontology.namespace + "CourseCredit");
    expect(s.rename(next, "Credit hours")).toBe(next);
  });
});
