// craigtrim/axiom#188: an export tile draws exactly the whole scene's grid dots that reach it, and no others.
import { afterEach, expect, it, vi } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { Draw, render } from "../../src/renderer/scene";
import type { GraphSnapshot } from "../../src/shared/protocol";
function graph(): GraphSnapshot {
  const store = buildEmptyStore(),
    a = store.createClass("Alpha", THING),
    b = store.createClass("Beta", a);
  const view = new Viewport(store);
  view.seed([a, b], true, false);
  const layouts = new Layouts(view, store);
  layouts.choice = "circle";
  layouts.run();
  return {
    nodes: [...view.nodes.values()],
    edges: [...view.edges.values()],
    focus: [a],
    budget: 1000,
    hidden: 0,
    revision: 0,
    mode: "circle",
    choice: "circle",
    groups: [],
    rings: [],
    ringOrigin: { x: 0, y: 0 },
    frozen: true,
  } as unknown as GraphSnapshot;
}
const dots = (d: Draw) =>
  d.parts
    .filter((p) => p.includes('r="0.65"'))
    .map((p) => {
      const [, x, y] = p.match(/cx="([^"]+)" cy="([^"]+)"/)!;
      return x + "," + y;
    });
afterEach(() => vi.unstubAllGlobals());
it("draws only the grid dots that reach a tile, where the whole scene draws them", () => {
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 7 }),
      }),
    }),
  });
  const g = graph(),
    camera = { x: 1234.5, y: -987.25, zoom: 1 },
    width = 3000,
    height = 2000,
    whole = new Draw(null, width, height);
  render(whole, g, camera, false, null, null, 900, {});
  const all = dots(whole);
  expect(all.length).toBeGreaterThan(4000);
  for (const clip of [
    { x: 0, y: 0, width: 500, height: 400 },
    { x: 1700, y: 933, width: 250, height: 600 },
    { x: 2960, y: 1965, width: 20, height: 20 },
  ]) {
    const tile = new Draw(null, width, height);
    render(tile, g, camera, false, null, null, 900, { clip });
    const expected = all.filter((key) => {
      const [x, y] = key.split(",").map(Number);
      return (
        x >= clip.x - 1 &&
        x < clip.x + clip.width + 1 &&
        y >= clip.y - 1 &&
        y < clip.y + clip.height + 1
      );
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(dots(tile).sort()).toEqual(expected.sort());
  }
});
