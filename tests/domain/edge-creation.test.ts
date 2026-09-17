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

it("uses semantic defaults only when the entity kinds establish the relationship", async () => {
  const { connectionPredicate } =
    await import("../../src/renderer/connection-predicate");
  const { SUBPROPERTY } = await import("../../src/domain/model");
  expect(connectionPredicate({ kind: "Defined" }, { kind: "Class" })).toBe(
    SUBCLASS,
  );
  expect(connectionPredicate({ kind: "Individual" }, { kind: "Class" })).toBe(
    TYPE,
  );
  expect(
    connectionPredicate({ kind: "ObjectProperty" }, { kind: "ObjectProperty" }),
  ).toBe(SUBPROPERTY);
  expect(
    connectionPredicate({ kind: "Class" }, { kind: "Individual" }),
  ).toBeUndefined();
  expect(
    connectionPredicate({ kind: "Individual" }, { kind: "Individual" }),
  ).toBeUndefined();
});
it("preserves segmented routes across workspace reload, hit testing, Fit and export bounds", async () => {
  const { readWorkspace } = await import("../../src/domain/workspace");
  const { edgeRoute, routePoints, nearestEdge } =
    await import("../../src/renderer/edge-geometry");
  const { bounds } = await import("../../src/renderer/scene");
  const s = buildEmptyStore(),
    a = s.createClass("A", THING),
    key = JSON.stringify([a, SUBCLASS, THING]);
  const points = [
    { x: -500, y: 100 },
    { x: -500, y: 900 },
  ];
  const doc = {
    format: "axiom-workspace",
    version: 1,
    ontology: s.ontology,
    entities: [...s.entities.values()],
    tbox: s.tbox,
    individuals: [],
    customers: [],
    selected: null,
    graph: {
      iris: [a, THING],
      focus: [],
      pins: [],
      budget: 1000,
      layout: "force",
      routes: [{ key, ...points[0], points }],
    },
  };
  const loaded = readWorkspace(doc);
  loaded.view.refresh();
  const edge = loaded.view.edges.get(key)!;
  expect(edge.bend?.points).toEqual(points);
  const nodes = [...loaded.view.nodes.values()],
    source = loaded.view.nodes.get(a)!,
    target = loaded.view.nodes.get(THING)!;
  const route = edgeRoute(
    edge,
    source,
    target,
    { x: 0, y: 0, zoom: 1 },
    "force",
  );
  expect(routePoints(route).slice(1, -1)).toEqual(points);
  const graph = {
    nodes,
    edges: [edge],
    mode: "force",
  } as import("../../src/shared/protocol").GraphSnapshot;
  expect(nearestEdge(graph, { x: -500, y: 500 }, { x: 0, y: 0, zoom: 1 })).toBe(
    edge,
  );
  expect(bounds(graph, 0).height).toBeGreaterThanOrEqual(800);
  expect(() =>
    readWorkspace({
      ...doc,
      graph: {
        ...doc.graph,
        routes: [{ key, x: 0, y: 0, points: [{ x: NaN, y: 1 }] }],
      },
    }),
  ).toThrow("edge route");
  expect(() =>
    readWorkspace({
      ...doc,
      graph: {
        ...doc.graph,
        routes: [{ key, x: 0, y: 0, points: Array(65).fill({ x: 1, y: 1 }) }],
      },
    }),
  ).toThrow("edge route");
});
