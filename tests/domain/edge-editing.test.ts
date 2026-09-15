import { describe, it, expect } from "vitest";
import {
  buildEmptyStore,
  readWorkspace,
  type Workspace,
} from "../../src/domain/workspace";
import { storeFromRdf } from "../../src/domain/rdf-io";
import {
  THING,
  SUBCLASS,
  NS,
  TYPE,
  iriTerm,
  type Triple,
} from "../../src/domain/model";
import { Viewport, edgeKey, type GraphNode } from "../../src/domain/viewport";
import {
  edgeRoute,
  routeMiddle,
  nearestEdge,
} from "../../src/renderer/edge-geometry";
import type { GraphSnapshot } from "../../src/shared/protocol";
describe("relationship editing", () => {
  it("redirects one assertion, preserves nodes and annotations, and supports Undo and Redo", () => {
    const s = buildEmptyStore(),
      a = s.createClass("A", THING),
      b = s.createClass("B", THING),
      c = s.createClass("C", THING);
    const original = s.tbox.find(
      (t) => t.subject === a && t.predicate === SUBCLASS,
    )!;
    s.editEdge(original, { ...original, object: iriTerm(b) });
    expect(s.entities.get(a)?.parents).toEqual([b]);
    expect(s.entities.get(b)?.children).toContain(a);
    expect(s.entities.get(a)?.label).toBe("A");
    expect(s.entities.has(c)).toBe(true);
    s.undo();
    expect(s.entities.get(a)?.parents).toEqual([THING]);
    s.redo();
    expect(s.entities.get(a)?.parents).toEqual([b]);
    s.editEdge({ ...original, object: iriTerm(b) });
    expect(s.entities.get(a)?.parents).toEqual([]);
    expect(s.entities.has(a)).toBe(true);
    expect(s.entities.has(b)).toBe(true);
    s.undo();
    expect(s.entities.get(a)?.parents).toEqual([b]);
  });
  it("changes source and predicate without leaving a stale projected edge", () => {
    const s = buildEmptyStore(),
      a = s.createClass("A", THING),
      b = s.createClass("B", THING),
      c = s.createClass("C", THING);
    const original = s.tbox.find(
      (t) => t.subject === a && t.predicate === SUBCLASS,
    )!;
    s.editEdge(original, {
      subject: b,
      predicate: "https://example.org/related",
      object: iriTerm(c),
    });
    expect(s.entities.get(a)?.parents).toEqual([]);
    expect(s.neighbours(b).list).toContainEqual({
      iri: c,
      predicate: "https://example.org/related",
      outgoing: true,
    });
    expect(s.neighbours(c).list).toContainEqual({
      iri: b,
      predicate: "https://example.org/related",
      outgoing: false,
    });
  });
  it("keeps parallel named-graph assertions separate and rejects duplicate replacements atomically", () => {
    const a = "https://example.org/A",
      b = "https://example.org/B",
      c = "https://example.org/C",
      p = "https://example.org/related";
    const statements: Triple[] = [
      ...[a, b, c].map((subject) => ({
        subject,
        predicate: TYPE,
        object: iriTerm(NS.owl + "Class"),
      })),
      {
        subject: a,
        predicate: p,
        object: iriTerm(b),
        graph: "https://example.org/g1",
      },
      {
        subject: a,
        predicate: p,
        object: iriTerm(b),
        graph: "https://example.org/g2",
      },
    ];
    const s = storeFromRdf(statements, "Edges"),
      original = statements[3];
    s.editEdge(original, { ...original, object: iriTerm(c) });
    expect(s.tbox).toContainEqual(statements[4]);
    expect(s.tbox).toContainEqual({ ...original, object: iriTerm(c) });
    expect(s.entities.get(a)?.iri).toBe(a);
    const before = structuredClone(s.tbox),
      version = s.version;
    expect(() =>
      s.editEdge(statements[4], {
        ...statements[4],
        graph: "https://example.org/g1",
      }),
    ).toThrow();
    expect(() =>
      s.editEdge(statements[4], {
        ...statements[4],
        object: iriTerm("https://example.org/missing"),
      }),
    ).toThrow();
    expect(s.tbox).toEqual(before);
    expect(s.version).toBe(version);
  });
  it("round-trips manual routes and rejects invalid coordinates", () => {
    const s = buildEmptyStore(),
      a = s.createClass("A", THING),
      key = edgeKey({ source: a, predicate: SUBCLASS, target: THING });
    const doc: Workspace = {
      format: "axiom-workspace",
      version: 1,
      ontology: s.ontology,
      entities: [...s.entities.values()],
      tbox: s.tbox,
      individuals: [],
      customers: [],
      selected: a,
      graph: {
        iris: [a, THING],
        focus: [],
        pins: [],
        budget: 1000,
        layout: "force",
        routes: [{ key, x: 12, y: 80 }],
      },
    };
    const loaded = readWorkspace(doc);
    expect(loaded.view.edges.get(key)?.bend).toEqual({ x: 12, y: 80 });
    loaded.view.refresh();
    expect(loaded.view.edges.get(key)?.bend).toEqual({ x: 12, y: 80 });
    expect(() =>
      readWorkspace({
        ...doc,
        graph: { ...doc.graph, routes: [{ key, x: NaN, y: 0 }] },
      }),
    ).toThrow("edge route");
  });
});
describe("edge geometry", () => {
  const a = { iri: "a", x: 0, y: 0, radius: 10 } as GraphNode,
    b = { iri: "b", x: 200, y: 100, radius: 10 } as GraphNode;
  const camera = { x: 30, y: 20, zoom: 1.5 };
  for (const mode of ["force", "hierarchy"])
    it(
      "hit-tests " + mode + " routes with parallel edges and manual bends",
      () => {
        for (const bend of [undefined, { x: 70, y: -100 }]) {
          const edge = {
            source: "a",
            target: "b",
            predicate: "p",
            parallelIndex: 0,
            parallelCount: 2,
            bend,
          };
          const route = edgeRoute(edge, a, b, camera, mode),
            p = routeMiddle(route);
          const graph = { nodes: [a, b], edges: [edge], mode } as GraphSnapshot;
          expect(nearestEdge(graph, p, camera)).toBe(edge);
          expect(
            nearestEdge(graph, { x: -500, y: -500 }, camera),
          ).toBeUndefined();
        }
      },
    );
  it("gives self-loops visible, selectable geometry", () => {
    const edge = {
      source: "a",
      target: "a",
      predicate: "p",
      parallelIndex: 0,
      parallelCount: 1,
    };
    const route = edgeRoute(edge, a, a, camera, "force"),
      p = routeMiddle(route);
    expect(p.y).toBeLessThan(camera.y - a.radius * camera.zoom);
    expect(
      nearestEdge(
        { nodes: [a], edges: [edge], mode: "force" } as GraphSnapshot,
        p,
        camera,
      ),
    ).toBe(edge);
  });
});

it("Fit and export bounds include manual bends beyond the node positions", async () => {
  const { bounds } = await import("../../src/renderer/scene");
  const s = buildEmptyStore(),
    a = s.createClass("A", THING),
    v = new Viewport(s);
  v.seed([a, THING], true, false);
  const edge = [...v.edges.values()][0];
  edge.bend = { x: 2000, y: -1000 };
  const b = bounds(
    {
      nodes: [...v.nodes.values()],
      edges: [edge],
      mode: "force",
    } as GraphSnapshot,
    0,
  );
  expect(b.x + b.width).toBeGreaterThanOrEqual(2000);
  expect(b.y).toBeLessThanOrEqual(-1000);
});
