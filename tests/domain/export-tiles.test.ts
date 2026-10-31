// craigtrim/axiom#188: an export tile draws exactly the whole scene's grid dots that reach it, SVG draws the grid as one pattern, and WebGL draws its dots.
import { afterEach, expect, it, vi } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { Draw, exportScene, render } from "../../src/renderer/scene";
import { GpuDraw } from "../../src/renderer/GpuDraw";
import type { GraphSnapshot } from "../../src/shared/protocol";
function graph(far?: number): GraphSnapshot {
  const store = buildEmptyStore(),
    a = store.createClass("Alpha", THING),
    b = store.createClass("Beta", a);
  const view = new Viewport(store);
  view.seed([a, b], true, false);
  const layouts = new Layouts(view, store);
  layouts.choice = "circle";
  layouts.run();
  const nodes = [...view.nodes.values()];
  if (far !== undefined) nodes[1].x = nodes[0].x + far;
  return {
    nodes,
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
/** A 2D context that records the grid dots it is asked to draw, and their colours, and ignores everything else. */
function recording() {
  const dots: string[] = [],
    colors = new Set<string>(),
    state: Record<PropertyKey, unknown> = {};
  const ctx = new Proxy(state, {
    get: (target, key) =>
      key === "measureText"
        ? (text: string) => ({ width: text.length * 7 })
        : key === "arc"
          ? (x: number, y: number, r: number) => {
              if (r === 0.65) {
                dots.push(x + "," + y);
                colors.add(String(state.fillStyle));
              }
            }
          : key in target
            ? target[key]
            : () => undefined,
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, dots, colors };
}
function stubDocument() {
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 7 }),
      }),
    }),
  });
}
afterEach(() => vi.unstubAllGlobals());
const camera = { x: 1234.5, y: -987.25, zoom: 1 },
  width = 3000,
  height = 2000;
it("draws only the grid dots that reach a tile, where the whole scene draws them", () => {
  stubDocument();
  const g = graph(),
    whole = recording();
  render(new Draw(whole.ctx, width, height), g, camera, false, null, null, 900);
  expect(whole.dots.length).toBeGreaterThan(4000);
  for (const clip of [
    { x: 0, y: 0, width: 500, height: 400 },
    { x: 1700, y: 933, width: 250, height: 600 },
    // Dots straddle all four edges of this one: x 1710.5 and 1744.5, y 950.75 and 984.75.
    { x: 1711, y: 951, width: 33, height: 33 },
    { x: 2960, y: 1965, width: 20, height: 20 },
  ]) {
    const tile = recording();
    render(
      new Draw(tile.ctx, width, height),
      g,
      camera,
      false,
      null,
      null,
      900,
      {
        clip,
      },
    );
    const expected = whole.dots.filter((key) => {
      const [x, y] = key.split(",").map(Number);
      return (
        x >= clip.x - 1 &&
        x < clip.x + clip.width + 1 &&
        y >= clip.y - 1 &&
        y < clip.y + clip.height + 1
      );
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(tile.dots.sort()).toEqual(expected.sort());
  }
});
it("draws an SVG's grid as one pattern on the canvas dots' lattice", () => {
  stubDocument();
  const svg = new Draw(null, width, height),
    canvas = recording();
  render(svg, graph(), camera, false, null, null, 900);
  render(
    new Draw(canvas.ctx, width, height),
    graph(),
    camera,
    false,
    null,
    null,
    900,
  );
  const out = svg.finish(),
    pattern = out.match(
      /<defs><pattern id="(axiom-grid-[0-9a-z]+)" patternUnits="userSpaceOnUse" x="([^"]+)" y="([^"]+)" width="34" height="34"><circle cx="17" cy="17" r="0.65" fill="([^"]+)"\/><\/pattern><\/defs><rect width="3000" height="2000" fill="url\(#\1\)"\/>/,
    )!;
  expect(pattern).not.toBeNull();
  expect(out.match(/r="0\.65"/g)).toHaveLength(1);
  // The pattern's dot has the canvas dots' colour and lands on the first canvas dot, and every canvas dot is a whole number of steps from it.
  expect([...canvas.colors]).toEqual([pattern[4]]);
  const [px, py] = [Number(pattern[2]) + 17, Number(pattern[3]) + 17],
    [fx, fy] = canvas.dots[0].split(",").map(Number);
  expect([px, py]).toEqual([fx, fy]);
  for (const key of canvas.dots) {
    const [x, y] = key.split(",").map(Number);
    expect(Math.abs(((x - px) / 34) % 1)).toBeLessThan(1e-9);
    expect(Math.abs(((y - py) / 34) % 1)).toBeLessThan(1e-9);
  }
});
it("keeps an SVG export small however far apart its nodes are", () => {
  stubDocument();
  const near = exportScene(graph(), false, "svg", null),
    far = exportScene(graph(1000000), false, "svg", null);
  expect(far.width).toBeGreaterThan(1000000);
  expect(far.data.length).toBeLessThan(near.data.length + 4096);
  expect(far.data).toMatch(/fill="url\(#axiom-grid-[0-9a-z]+\)"/);
});
it("names each grid's pattern after its contents, so inlined diagrams keep their own grids", () => {
  stubDocument();
  const id = (svg: string) => svg.match(/<pattern id="([^"]+)"/)![1],
    light = exportScene(graph(), false, "svg", null).data;
  expect(id(exportScene(graph(), false, "svg", null).data)).toBe(id(light));
  expect(id(exportScene(graph(), true, "svg", null).data)).not.toBe(id(light));
});
it("prints a PDF's grid as vector dots up to 250,000 of them, and as the pattern past that", () => {
  stubDocument();
  const svg = exportScene(graph(), false, "svg", null).data,
    near = exportScene(graph(), false, "svg", null, { format: "pdf" }).data,
    far = exportScene(graph(1000000), false, "svg", null, { format: "pdf" });
  // The PDF's dots are the pattern's lattice, one circle per point inside the drawing.
  const [, w, h] = svg.match(/<svg [^>]*width="(\d+)" height="(\d+)"/)!,
    [, x, y] = svg.match(/<pattern [^>]*x="([^"]+)" y="([^"]+)"/)!,
    points = (start: number, end: number) => {
      let n = 0;
      for (let v = start; v < end; v += 34) n++;
      return n;
    };
  expect(near).not.toContain("<pattern");
  expect(near.match(/<circle [^>]*r="0\.65"/g)).toHaveLength(
    points(Number(x) + 17, Number(w)) * points(Number(y) + 17, Number(h)),
  );
  expect((far.width / 34) * (far.height / 34)).toBeGreaterThan(250000);
  expect(far.data).toContain("<pattern");
  expect(far.data.match(/r="0\.65"/g)).toHaveLength(1);
});
it("draws the on-screen WebGL grid as dots, not as SVG text", () => {
  const canvas = recording();
  vi.stubGlobal("document", {
    createElement: () => ({ getContext: () => recording().ctx }),
  });
  // Every WebGL call succeeds and draws nothing.
  const gl = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "canvas" ? { width, height, dataset: {} } : () => ({}),
    },
  ) as unknown as WebGL2RenderingContext;
  const gpu = new GpuDraw(gl, width, height),
    circle = vi.spyOn(gpu, "circle");
  render(
    new Draw(canvas.ctx, width, height),
    graph(),
    camera,
    false,
    null,
    null,
    900,
  );
  gpu.beginFrame();
  render(gpu, graph(), camera, false, null, null, 900);
  gpu.endFrame();
  const dots = circle.mock.calls
    .filter(([, r]) => r === 0.65)
    .map(([p]) => p.x + "," + p.y);
  expect(gpu.parts).toEqual([]);
  expect(dots.length).toBeGreaterThan(4000);
  expect(dots.sort()).toEqual(canvas.dots.sort());
});
