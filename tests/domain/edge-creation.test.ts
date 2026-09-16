import { describe, it, expect } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import {
  THING,
  SUBCLASS,
  TYPE,
  NS,
  iriTerm,
  type Triple,
} from "../../src/domain/model";
import { storeFromRdf } from "../../src/domain/rdf-io";
import { instancePage } from "../../src/domain/instances";
import { connectionTarget } from "../../src/renderer/connection-geometry";
import type { GraphNode } from "../../src/domain/viewport";

describe("adding graph relationships", () => {
  it("adds one parent without replacing existing axioms, and undoes as one edit", () => {
    const s = buildEmptyStore(),
      a = s.createClass("Child", THING),
      b = s.createClass("Parent", THING);
    const before = structuredClone(s.tbox),
      history = s.undoStack.length;
    const edge = { subject: a, predicate: SUBCLASS, object: iriTerm(b) };
    s.createEdge(edge);
    expect(s.tbox).toEqual([...before, edge]);
    expect(s.entities.get(a)?.parents).toEqual(
      expect.arrayContaining([THING, b]),
    );
    expect(s.entities.get(b)?.children).toContain(a);
    expect(s.entities.get(a)?.label).toBe("Child");
    expect(s.undoStack).toHaveLength(history + 1);
    s.undo();
    expect(s.tbox).toEqual(before);
    expect(s.entities.get(b)?.children).not.toContain(a);
    s.redo();
    expect(s.tbox).toContainEqual(edge);
    expect(s.entities.get(b)?.children).toContain(a);
  });
  it("updates instance reports and preserves the original type when adding another", () => {
    const a = "https://example.org/A",
      b = "https://example.org/B",
      i = "https://example.org/one";
    const s = storeFromRdf(
      [
        ...[a, b].map((subject) => ({
          subject,
          predicate: TYPE,
          object: iriTerm(NS.owl + "Class"),
        })),
        {
          subject: i,
          predicate: TYPE,
          object: iriTerm(NS.owl + "NamedIndividual"),
        },
        { subject: i, predicate: TYPE, object: iriTerm(a) },
      ],
      "Connections",
    );
    expect(instancePage(s, b).total).toBe(0);
    s.createEdge({ subject: i, predicate: TYPE, object: iriTerm(b) });
    expect(instancePage(s, a).total).toBe(1);
    expect(instancePage(s, b).rows.map((r) => r.iri)).toEqual([i]);
    s.undo();
    expect(instancePage(s, b).total).toBe(0);
    s.redo();
    expect(instancePage(s, b).total).toBe(1);
  });
  it("rejects duplicates and invalid endpoints without changing data, version or history", () => {
    const s = buildEmptyStore(),
      a = s.createClass("A", THING),
      edge = { subject: a, predicate: SUBCLASS, object: iriTerm(THING) };
    const before = structuredClone(s.tbox),
      version = s.version,
      history = s.undoStack.length;
    for (const invalid of [
      edge,
      { ...edge, subject: "https://example.org/missing" },
      { ...edge, object: iriTerm("https://example.org/missing") },
      { ...edge, object: { literal: true, value: "text" } },
      { ...edge, predicate: "not an IRI" },
      {},
    ] as Triple[])
      expect(() => s.createEdge(invalid)).toThrow();
    expect(s.tbox).toEqual(before);
    expect(s.version).toBe(version);
    expect(s.undoStack).toHaveLength(history);
  });
  it("adds a separate named-graph assertion and a self-relationship explicitly", () => {
    const s = buildEmptyStore(),
      a = s.createClass("A", THING);
    const edge = {
      subject: a,
      predicate: SUBCLASS,
      object: iriTerm(THING),
      graph: "https://example.org/g",
    };
    s.createEdge(edge);
    expect(s.tbox).toContainEqual(edge);
    s.createEdge({
      subject: a,
      predicate: "https://example.org/related",
      object: iriTerm(a),
    });
    expect(s.neighbours(a).list).toContainEqual({
      iri: a,
      predicate: "https://example.org/related",
      outgoing: true,
    });
  });
});
describe("connection targets", () => {
  const a = { iri: "a", kind: "Class", x: 0, y: 0, radius: 10 } as GraphNode;
  it.each([0.05, 0.5, 1, 3])(
    "keeps a target at least 48 pixels across at zoom %s",
    (zoom) => {
      const camera = { x: 40, y: 40, zoom };
      expect(connectionTarget([a], { x: 63, y: 40 }, camera)?.iri).toBe("a");
      expect(connectionTarget([a], { x: 100, y: 40 }, camera)).toBeUndefined();
    },
  );
  it("prefers the node body under the pointer over another node's padded area", () => {
    const b = { ...a, iri: "b", x: 20 };
    expect(
      connectionTarget([a, b], { x: 16, y: 0 }, { x: 0, y: 0, zoom: 1 })?.iri,
    ).toBe("b");
  });
  it("supports labels, excludes the source and ignores generated or otherwise ineligible nodes", () => {
    const b = { ...a, iri: "b", x: 80 },
      camera = { x: 0, y: 0, zoom: 1 };
    const labels = new Map([["b", { x: 30, y: 35, width: 100, height: 20 }]]);
    expect(
      connectionTarget(
        [a, b],
        { x: 40, y: 40 },
        camera,
        undefined,
        undefined,
        undefined,
        labels,
      )?.iri,
    ).toBe("b");
    expect(
      connectionTarget([a, b], { x: 0, y: 0 }, camera, undefined, "a"),
    ).toBeUndefined();
    expect(
      connectionTarget(
        [a, b],
        { x: 80, y: 0 },
        camera,
        undefined,
        undefined,
        new Set(["a"]),
      ),
    ).toBeUndefined();
  });
});
