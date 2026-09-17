import { afterEach, expect, it, vi } from "vitest";
import {
  buildEmptyStore,
  readWorkspace,
  type Workspace,
} from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { exportScene, type Camera } from "../../src/renderer/scene";
import {
  nearestEdge,
  edgeRoute,
  routeMiddle,
} from "../../src/renderer/edge-geometry";
import type { GraphSnapshot } from "../../src/shared/protocol";
function fixture(intersection = false) {
  const store = buildEmptyStore(),
    a = store.createClass("Alpha", THING),
    b = store.createClass("Beta", a),
    c = store.createClass("Combined", THING);
  if (intersection) store.setIntersection(c, [a, b]);
  const view = new Viewport(store);
  view.seed([a, b, c], true, false);
  const layouts = new Layouts(view, store);
  layouts.choice = "circle";
  layouts.run();
  const graph: GraphSnapshot = {
    nodes: [...view.nodes.values()],
    edges: [...view.edges.values()],
    focus: [c],
    budget: 1000,
    hidden: 0,
    revision: 0,
    mode: "circle",
    choice: "circle",
    groups: [],
    rings: [],
    ringOrigin: { x: 0, y: 0 },
    frozen: true,
    stylesheet: "edge {stroke:#ed1278;stroke-width:3}",
  };
  return { store, view, graph };
}
afterEach(() => vi.unstubAllGlobals());
it("omits edge strokes, arrows and intersection captions from image exports without changing RDF or node placement", () => {
  const { store, graph } = fixture(true),
    original = JSON.stringify(store.tbox),
    positions = graph.nodes.map((n) => [n.x, n.y]),
    count = graph.edges.length;
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 7 }),
      }),
    }),
  });
  const visible = exportScene(graph, false, "svg", null, {
    caption: false,
    legend: false,
  }).data;
  expect(visible).toContain("#ed1278");
  expect(visible).toContain("equivalent to all");
  graph.edgesVisible = false;
  const hidden = exportScene(graph, false, "svg", null, {
    caption: false,
    legend: false,
  }).data;
  expect(hidden).not.toContain("#ed1278");
  expect(hidden).not.toContain("equivalent to all");
  expect(hidden).toContain("Alpha");
  expect(hidden).toContain("Beta");
  expect(hidden).toContain("Combined");
  expect(graph.edges).toHaveLength(count);
  expect(JSON.stringify(store.tbox)).toBe(original);
  expect(graph.nodes.map((n) => [n.x, n.y])).toEqual(positions);
  graph.edgesVisible = true;
  expect(
    exportScene(graph, false, "svg", null, { caption: false, legend: false })
      .data,
  ).toBe(visible);
});
it("does not hit-test invisible relationships", () => {
  const { graph } = fixture(),
    edge = graph.edges[0],
    camera: Camera = { x: 400, y: 300, zoom: 1 };
  const a = graph.nodes.find((n) => n.iri === edge.source)!,
    b = graph.nodes.find((n) => n.iri === edge.target)!;
  const point = routeMiddle(edgeRoute(edge, a, b, camera, graph.mode));
  expect(nearestEdge(graph, point, camera)).toBeDefined();
  graph.edgesVisible = false;
  expect(nearestEdge(graph, point, camera)).toBeUndefined();
});
it("defaults old workspaces to visible edges and restores hidden edges without discarding relationships", () => {
  const { store, view } = fixture();
  const doc: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: store.ontology,
    entities: [...store.entities.values()],
    tbox: store.tbox,
    individuals: [],
    customers: [],
    selected: null,
    graph: {
      iris: [...view.nodes.keys()],
      focus: [],
      pins: [],
      budget: 1000,
      layout: "circle",
    },
  };
  expect(readWorkspace(doc).view.edgesVisible).toBe(true);
  doc.graph.edgesVisible = false;
  const loaded = readWorkspace(doc);
  expect(loaded.view.edgesVisible).toBe(false);
  expect(loaded.view.edges.size).toBe(view.edges.size);
  expect(loaded.store.tbox).toEqual(store.tbox);
  doc.graph.edgesVisible = "false" as unknown as boolean;
  expect(() => readWorkspace(doc)).toThrow("Invalid graph settings");
});

it("hides only number badges in exports and restores them without changing graph data", () => {
  const { store, graph } = fixture();
  const before = structuredClone(graph),
    rdf = structuredClone(store.tbox);
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 7 }),
      }),
    }),
  });
  const exportSvg = () =>
    exportScene(graph, false, "svg", null, { caption: false, legend: false })
      .data;
  const visible = exportSvg();
  expect(visible).toMatch(/>\+\d[^<]*</);
  graph.countsVisible = false;
  const hidden = exportSvg();
  expect(hidden).not.toMatch(/>\+\d[^<]*</);
  expect(hidden).toContain("Alpha");
  expect(hidden).toContain("Beta");
  expect(hidden).toContain("#ed1278");
  expect(graph.nodes).toEqual(before.nodes);
  expect(graph.edges).toEqual(before.edges);
  expect(store.tbox).toEqual(rdf);
  graph.countsVisible = true;
  expect(exportSvg()).toBe(visible);
});
it("defaults old workspaces to visible counts and restores hidden counts independently of edges", () => {
  const { store, view } = fixture();
  const doc: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: store.ontology,
    entities: [...store.entities.values()],
    tbox: store.tbox,
    individuals: [],
    customers: [],
    selected: null,
    graph: {
      iris: [...view.nodes.keys()],
      focus: [],
      pins: [],
      budget: 1000,
      layout: "circle",
    },
  };
  expect(readWorkspace(doc).view.countsVisible).toBe(true);
  doc.graph.countsVisible = false;
  const restored = readWorkspace(doc);
  expect(restored.view.countsVisible).toBe(false);
  expect(restored.view.edgesVisible).toBe(true);
  expect(restored.store.tbox).toEqual(store.tbox);
  doc.graph.countsVisible = "false" as unknown as boolean;
  expect(() => readWorkspace(doc)).toThrow("Invalid graph settings");
});
