import { describe, expect, it } from "vitest";
import {
  buildEmptyStore,
  readWorkspace,
  type Workspace,
} from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import { Viewport, edgeKey } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { layoutOptions } from "../../src/shared/layout-options";

function fixture() {
  const store = buildEmptyStore(),
    parent = store.createClass("Parent", THING);
  const children = Array.from({ length: 12 }, (_, i) =>
    store.createClass("Child " + i, parent),
  );
  const view = new Viewport(store);
  view.seed([parent, ...children], true, false);
  view.focus = new Set([parent]);
  return { store, view, layouts: new Layouts(view, store), parent, children };
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

it.each(layoutOptions.map((option) => option.id))(
  "adjusts existing %s geometry reversibly without resizing nodes or restarting the layout",
  (mode) => {
    const { view, layouts } = fixture();
    layouts.choice = mode;
    layouts.run();
    // External layout output has ordinary graph coordinates, just like these placements.
    if (mode.startsWith("elk-"))
      [...view.nodes.values()].forEach((n, i) => {
        n.x = i * 100;
        n.y = (i % 3) * 120;
      });
    const before = structuredClone([...view.nodes.values()]);
    layouts.setSpacing(2.5);
    const after = [...view.nodes.values()];
    expect(distance(after[0], after[1])).toBeCloseTo(
      distance(before[0], before[1]) * 2.5,
    );
    expect(after.map((n) => n.radius)).toEqual(before.map((n) => n.radius));
    expect(layouts.choice).toBe(mode);
    layouts.setSpacing(0.5);
    expect(distance(after[0], after[1])).toBeCloseTo(
      distance(before[0], before[1]) * 0.5,
    );
    layouts.setSpacing(1);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].x).toBeCloseTo(before[i].x);
      expect(after[i].y).toBeCloseTo(before[i].y);
    }
  },
);
it.each(["auto", "force", "hierarchy", "radial", "grid", "circle"] as const)(
  "retains %s spacing through relayout and keeps pinned/action nodes fixed",
  (mode) => {
    const { view, layouts, parent } = fixture();
    layouts.choice = mode;
    layouts.run();
    const base = structuredClone([...view.nodes.values()]);
    layouts.setSpacing(2);
    layouts.run();
    const spaced = [...view.nodes.values()];
    expect(distance(spaced[0], spaced[1])).toBeCloseTo(
      distance(base[0], base[1]) * 2,
    );
    const pin = spaced[1];
    pin.pinned = true;
    pin.x = 37.125;
    pin.y = -93.75;
    layouts.setSpacing(3);
    layouts.run();
    for (let i = 0; i < 30 && mode === "force"; i++) layouts.force.step(true);
    expect([pin.x, pin.y]).toEqual([37.125, -93.75]);
    const anchor = view.nodes.get(parent)!;
    anchor.x = 133.25;
    anchor.y = -217.125;
    view.holdPosition(parent);
    view.expand(parent);
    layouts.run(false);
    for (let i = 0; i < 30 && mode === "force"; i++) layouts.force.step(true);
    expect([anchor.x, anchor.y]).toEqual([133.25, -217.125]);
  },
);
it("expands grid cells and their frames together, including inside the same cluster", () => {
  const { view, layouts, children } = fixture();
  layouts.choice = "grid";
  layouts.run();
  const frame = layouts.groups.find((g) => g.count === 12)!;
  const a = view.nodes.get(children[0])!,
    b = view.nodes.get(children[1])!;
  const gap = distance(a, b);
  layouts.setSpacing(3);
  expect(distance(a, b)).toBeCloseTo(gap * 3);
  const next = layouts.groups.find((g) => g.count === 12)!;
  expect(next.width).toBe(frame.width * 3);
  expect(next.height).toBe(frame.height * 3);
});
it("retains wider force spacing after the simulation settles", () => {
  function settled(spacing: number) {
    const { view, layouts } = fixture();
    layouts.choice = "force";
    layouts.spacing = spacing;
    layouts.run();
    for (let i = 0; i < 350; i++) layouts.force.step(true);
    const lengths = [...view.edges.values()].map((e) =>
      distance(view.nodes.get(e.source)!, view.nodes.get(e.target)!),
    );
    return lengths.reduce((a, b) => a + b, 0) / lengths.length;
  }
  expect(settled(2)).toBeGreaterThan(settled(1) * 1.7);
});
it("scales manual edge routes with the nodes", () => {
  const { view, layouts } = fixture();
  layouts.run();
  const edge = [...view.edges.values()][0],
    bend = { x: 25, y: 30, points: [{ x: 20, y: 45 }] };
  view.routes.set(edgeKey(edge), bend);
  edge.bend = bend;
  layouts.setSpacing(2);
  expect(edge.bend).toEqual({ x: 50, y: 60, points: [{ x: 40, y: 90 }] });
});
describe("workspace compatibility", () => {
  function doc(): Workspace {
    const { store, view } = fixture();
    return {
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
        layout: "grid",
      },
    };
  }
  it("defaults older workspaces to 100% and restores a saved value", () => {
    const input = doc();
    expect(readWorkspace(input).layouts.spacing).toBe(1);
    input.graph.spacing = 2.25;
    const loaded = readWorkspace(input);
    expect(loaded.layouts.spacing).toBe(2.25);
    const before = structuredClone([...loaded.view.nodes.values()]);
    loaded.layouts.run();
    expect([...loaded.view.nodes.values()].map((n) => [n.x, n.y])).toEqual(
      before.map((n) => [n.x, n.y]),
    );
  });
  it.each([0, 0.49, 3.01, Infinity, NaN, "2"])(
    "rejects invalid spacing %s",
    (value) => {
      const input = doc();
      input.graph.spacing = value as number;
      expect(() => readWorkspace(input)).toThrow("Invalid graph settings");
      expect(() => fixture().layouts.setSpacing(value as number)).toThrow(
        "Node spacing",
      );
    },
  );
});

it("keeps radial guides centred on a pinned focus while changing their spacing", () => {
  const { view, layouts, parent } = fixture();
  const root = view.nodes.get(parent)!;
  root.x = 83;
  root.y = -115;
  root.pinned = true;
  layouts.choice = "radial";
  layouts.run();
  const rings = [...layouts.rings];
  layouts.setSpacing(2.5);
  expect(layouts.ringOrigin).toEqual({ x: 83, y: -115 });
  expect(layouts.rings).toEqual(rings.map((r) => r * 2.5));
  layouts.run();
  expect(layouts.ringOrigin).toEqual({ x: 83, y: -115 });
});
