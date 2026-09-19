import { describe, it, expect } from "vitest";
import {
  NS,
  TYPE,
  SUBCLASS,
  iriTerm,
  type Triple,
} from "../../src/domain/model";
import { storeFromRdf } from "../../src/domain/rdf-io";
import {
  graphStyleAnalysis,
  applyGraphAppearance,
} from "../../src/domain/graph-appearance";
import { Viewport, type GraphNode } from "../../src/domain/viewport";
import { nodeRelevance } from "../../src/domain/graph-relevance";
import { labelOrder } from "../../src/renderer/label-priority";
import { Draw, render, type Rect } from "../../src/renderer/scene";
import type { GraphSnapshot } from "../../src/shared/protocol";
const ns = "urn:relevance:",
  iri = (name: string) => ns + name;
function fixture() {
  const triples: Triple[] = [
    "Hub",
    "Populated",
    "Leaf",
    ...Array.from({ length: 20 }, (_, i) => "Child" + i),
  ].map((name) => ({
    subject: iri(name),
    predicate: TYPE,
    object: iriTerm(NS.owl + "Class"),
  }));
  for (let i = 0; i < 20; i++) {
    triples.push({
      subject: iri("Child" + i),
      predicate: SUBCLASS,
      object: iriTerm(iri("Hub")),
    });
    triples.push({
      subject: iri("Person" + i),
      predicate: TYPE,
      object: iriTerm(iri("Populated")),
    });
  }
  const store = storeFromRdf(triples, "Relevance"),
    view = new Viewport(store);
  view.admit([iri("Leaf"), iri("Hub"), iri("Populated")]);
  applyGraphAppearance(view, "node {size:20}");
  return { store, view };
}
function snapshot(view: Viewport): GraphSnapshot {
  return {
    nodes: [...view.nodes.values()],
    edges: [...view.edges.values()],
    focus: [...view.focus],
    budget: 15000,
    hidden: view.hidden,
    revision: view.revision,
    mode: "circle",
    choice: "circle",
    frozen: true,
    groups: [],
    rings: [],
    ringOrigin: { x: 0, y: 0 },
    countsVisible: false,
    edgesVisible: false,
    stylesheet: "node {size:20}",
  };
}
function labels(
  graph: GraphSnapshot,
  zoom = 0.1,
  selected: string | null = null,
  hover: string | null = null,
  max = 900,
  allLabels = false,
) {
  const draw = new Draw(null, 800, 600, {
    measureText: (s: string) => ({ width: s.length * 7 }),
  } as CanvasRenderingContext2D);
  const shown = new Map<string, Rect>();
  render(draw, graph, { x: 400, y: 300, zoom }, false, selected, hover, max, {
    allLabels,
    onLabel: (iri, rect) => shown.set(iri, rect),
  });
  return [...shown.keys()];
}

describe("graph relevance", () => {
  it("uses full-dataset connectivity and direct instances even when no neighbours are displayed", () => {
    const { store, view } = fixture(),
      index = graphStyleAnalysis(store);
    expect(index.metrics.get(iri("Hub"))!.connections).toBe(20);
    expect(index.metrics.get(iri("Populated"))!.connections).toBe(20);
    expect(index.metrics.get(iri("Populated"))!.instances).toBe(20);
    expect(view.nodes.get(iri("Hub"))!.shownDegree).toBe(0);
    expect(view.nodes.get(iri("Populated"))!.relevance).toBeGreaterThan(
      view.nodes.get(iri("Hub"))!.relevance!,
    );
    expect(view.nodes.get(iri("Hub"))!.relevance).toBeGreaterThan(
      view.nodes.get(iri("Leaf"))!.relevance!,
    );
    expect(labelOrder(snapshot(view), null, null).map((n) => n.iri)).toEqual([
      iri("Populated"),
      iri("Hub"),
      iri("Leaf"),
    ]);
  });
  it("normalizes count scales independently, compresses outliers and handles empty metrics", () => {
    const connections = nodeRelevance({
      connections: 10,
      instances: 0,
      maxConnections: 10,
      maxInstances: 1000000,
    });
    const instances = nodeRelevance({
      connections: 0,
      instances: 1000000,
      maxConnections: 10,
      maxInstances: 1000000,
    });
    expect(connections).toBe(instances);
    expect(
      nodeRelevance({
        connections: 0,
        instances: 1000,
        maxConnections: 10,
        maxInstances: 1000000,
      }),
    ).toBeGreaterThan(0.2);
    expect(
      nodeRelevance({
        connections: 0,
        instances: 0,
        maxConnections: 0,
        maxInstances: 0,
      }),
    ).toBe(0);
  });
  it("retains the most relevant colliding label when zooming out and reveals neighbours when zooming in", () => {
    const { view } = fixture(),
      g = snapshot(view);
    g.nodes.forEach((n, i) => {
      n.x = (i - 1) * 160;
      n.y = 0;
    });
    const before = structuredClone(g);
    expect(labels(g, 0.05)).toEqual([iri("Populated")]);
    expect(labels(g, 1)).toHaveLength(3);
    expect(labels(g, 0.05)).toEqual([iri("Populated")]);
    expect(g).toEqual(before);
  });
  it("keeps explicit focus, selection, hover and pins ahead of automatic relevance", () => {
    const { view } = fixture(),
      g = snapshot(view);
    for (const n of g.nodes) n.x = n.y = 0;
    g.focus = [iri("Leaf")];
    expect(labels(g)).toEqual([iri("Leaf")]);
    g.focus = [];
    expect(labels(g, 0.1, iri("Leaf"))).toEqual([iri("Leaf")]);
    expect(labels(g, 0.1, null, iri("Leaf"))).toEqual([iri("Leaf")]);
    g.nodes = g.nodes.map((n) => ({ ...n, pinned: n.iri === iri("Leaf") }));
    expect(labels(g)).toEqual([iri("Leaf")]);
  });
  it("ignores cosmetic node size when labels compete for space", () => {
    const { view } = fixture(),
      g = snapshot(view);
    for (const n of g.nodes) n.x = n.y = 0;
    g.stylesheet += ' node[iri="' + iri("Leaf") + '"] {size:120}';
    expect(labels(g, 0.01)).toEqual([iri("Populated")]);
  });
  it("uses stable IRI ties rather than admission order", () => {
    const { view } = fixture(),
      g = snapshot(view);
    for (const n of g.nodes) {
      n.x = n.y = 0;
      n.relevance = 0;
    }
    const first = labels(g);
    expect(labels({ ...g, nodes: [...g.nodes].reverse() })).toEqual(first);
  });
  it("reuses ranking while zooming, panning and moving nodes, and invalidates it for a new snapshot", () => {
    const { store, view } = fixture(),
      g = snapshot(view),
      index = graphStyleAnalysis(store);
    const ordered = labelOrder(g, null, null);
    for (const n of g.nodes) {
      n.x += 100;
      n.y -= 200;
    }
    expect(labelOrder(g, null, null)).toBe(ordered);
    applyGraphAppearance(view, "node {size:90}");
    expect(graphStyleAnalysis(store)).toBe(index);
    const next = {
      ...g,
      nodes: g.nodes.map((n) => ({
        ...n,
        relevance: n.iri === iri("Leaf") ? 2 : 0,
      })),
    };
    expect(labelOrder(next, null, null)[0].iri).toBe(iri("Leaf"));
    expect(labelOrder(g, iri("Leaf"), null)[0].iri).toBe(iri("Leaf"));
  });
  it("refreshes the index after instance edits and Undo/Redo without retaining stale counts", () => {
    const { store, view } = fixture(),
      original = graphStyleAnalysis(store);
    store.createEdge({
      subject: iri("Person0"),
      predicate: TYPE,
      object: iriTerm(iri("Leaf")),
    });
    view.refresh();
    applyGraphAppearance(view, "");
    const edited = graphStyleAnalysis(store);
    expect(edited).not.toBe(original);
    expect(edited.metrics.get(iri("Leaf"))!.instances).toBe(1);
    expect(view.nodes.get(iri("Leaf"))!.relevance).toBeGreaterThan(0);
    store.undo();
    view.refresh();
    applyGraphAppearance(view, "");
    expect(graphStyleAnalysis(store).metrics.get(iri("Leaf"))!.instances).toBe(
      0,
    );
    expect(view.nodes.get(iri("Leaf"))!.relevance).toBe(
      original.relevance.get(iri("Leaf")),
    );
    store.redo();
    view.refresh();
    applyGraphAppearance(view, "");
    expect(graphStyleAnalysis(store).metrics.get(iri("Leaf"))!.instances).toBe(
      1,
    );
  });
  it("does not spend the label budget on offscreen high-relevance nodes and still supports all-label exports", () => {
    const { view } = fixture(),
      g = snapshot(view);
    for (const n of g.nodes) {
      n.y = 0;
      n.x = n.iri === iri("Leaf") ? 0 : 100000;
    }
    expect(labels(g, 1, null, null, 1)).toEqual([iri("Leaf")]);
    for (const n of g.nodes) n.x = 0;
    expect(labels(g, 0.01, null, null, 900, true)).toHaveLength(3);
  });
  it("caches the ordering of 15000 nodes across repeated zoom frames", () => {
    const { view } = fixture(),
      g = snapshot(view),
      template = g.nodes[0];
    g.nodes = Array.from({ length: 15000 }, (_, i): GraphNode => ({
      ...template,
      iri: "urn:" + i,
      relevance: i / 15000,
    }));
    const order = labelOrder(g, null, null);
    expect(order[0].iri).toBe("urn:14999");
    for (let i = 0; i < 100; i++) expect(labelOrder(g, null, null)).toBe(order);
  });
});
