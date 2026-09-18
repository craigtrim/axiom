import { describe, it, expect } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import { Viewport } from "../../src/domain/viewport";
import { THING } from "../../src/domain/model";
import type { GraphSnapshot } from "../../src/shared/protocol";
import { MIN_GRAPH_ZOOM } from "../../src/shared/graph-limits";
import { readPreferences } from "../../src/shared/preferences";
import { bounds, fit, screenPoint, zoomAt } from "../../src/renderer/scene";

function largeGraph(): GraphSnapshot {
  const store = buildEmptyStore(),
    a = store.createClass("Alpha", THING),
    b = store.createClass("Beta", THING),
    view = new Viewport(store);
  view.seed([a, b], true, false);
  const nodes = [...view.nodes.values()];
  nodes[0].x = -1e8;
  nodes[0].y = -1e8;
  nodes[1].x = 1e8;
  nodes[1].y = 1e8;
  return {
    nodes,
    edges: [],
    focus: [],
    budget: 1000,
    hidden: 0,
    revision: 0,
    mode: "circle",
    choice: "circle",
    frozen: true,
    groups: [],
    rings: [],
    ringOrigin: { x: 0, y: 0 },
  };
}

describe("graph zoom", () => {
  it("zooms far below five percent around the pointer and reverses without moving that anchor", () => {
    const original = { x: -120, y: 90, zoom: 1 },
      anchor = { x: 270, y: 310 },
      world = {
        x: (anchor.x - original.x) / original.zoom,
        y: (anchor.y - original.y) / original.zoom,
      };
    let camera = original;
    for (let i = 0; i < 60; i++) {
      camera = zoomAt(camera, anchor, 1 / 1.2);
      const screen = screenPoint(world, camera);
      expect(screen.x).toBeCloseTo(anchor.x, 8);
      expect(screen.y).toBeCloseTo(anchor.y, 8);
    }
    expect(camera.zoom).toBeLessThan(0.0001);
    for (let i = 0; i < 60; i++) camera = zoomAt(camera, anchor, 1.2);
    expect(camera.zoom).toBeCloseTo(original.zoom, 8);
    expect(camera.x).toBeCloseTo(original.x, 6);
    expect(camera.y).toBeCloseTo(original.y, 6);
  });

  it("keeps extreme wheel input finite and allows zooming back in", () => {
    const anchor = { x: 400, y: 300 };
    let camera = zoomAt({ x: 120, y: 90, zoom: 1 }, anchor, Math.exp(-1500));
    expect(camera.zoom).toBeGreaterThan(0);
    expect(camera.zoom).toBeLessThan(1e-12);
    expect(Object.values(camera).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(1000 / camera.zoom)).toBe(true);
    expect(zoomAt(camera, anchor, 1.2).zoom).toBeGreaterThan(camera.zoom);
    camera = zoomAt(camera, anchor, Math.exp(1500));
    expect(camera.zoom).toBe(5);
    expect(Object.values(camera).every(Number.isFinite)).toBe(true);
  });

  it("fits the entire graph even when it requires much less than five percent zoom", () => {
    const graph = largeGraph(),
      camera = fit(graph, 1000, 700),
      b = bounds(graph, 0);
    expect(camera.zoom).toBeLessThan(0.00001);
    const topLeft = screenPoint(b, camera),
      bottomRight = screenPoint(
        { x: b.x + b.width, y: b.y + b.height },
        camera,
      );
    expect(topLeft.x).toBeGreaterThanOrEqual(43.99);
    expect(topLeft.y).toBeGreaterThanOrEqual(43.99);
    expect(bottomRight.x).toBeLessThanOrEqual(956.01);
    expect(bottomRight.y).toBeLessThanOrEqual(656.01);
  });

  it("keeps Fit positive and finite while a pane is collapsed", () => {
    const camera = fit(largeGraph(), 0, 0);
    expect(camera.zoom).toBeGreaterThan(0);
    expect(Object.values(camera).every(Number.isFinite)).toBe(true);
  });

  it.each([0.049, 0.001, 1e-9, MIN_GRAPH_ZOOM])(
    "retains zoom %s in every saved graph camera",
    (zoom) => {
      const panelState = {
        "graph.camera": { x: 230, y: 450, zoom },
        "graph.camera.graph:second": { x: -90, y: 30, zoom },
      };
      expect(readPreferences({ version: 1, panelState }).panelState).toEqual(
        panelState,
      );
    },
  );

  it.each([0, -1, NaN, Infinity])(
    "rejects invalid zoom %s for all graph cameras",
    (zoom) => {
      expect(
        readPreferences({
          version: 1,
          panelState: {
            "graph.camera": { x: 0, y: 0, zoom },
            "graph.camera.graph:second": { x: 0, y: 0, zoom },
          },
        }).panelState,
      ).toEqual({});
    },
  );
});
