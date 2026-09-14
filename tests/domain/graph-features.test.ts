import { it, expect } from "vitest";
import {
  parseGraphStyle,
  nodeStyle,
  edgeStyle,
  graphBackground,
  styledRadius,
} from "../../src/domain/graph-style";
import { History } from "../../src/domain/history";
import { buildEmptyStore } from "../../src/domain/workspace";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { THING } from "../../src/domain/model";
it("cascades graph styles by specificity and state", () => {
  const v = new Viewport(buildEmptyStore());
  v.seed([THING]);
  const n = v.nodes.get(THING)!;
  const rules = parseGraphStyle(
    'node.Class {fill:#abc;size:40px} node {fill:#fff} node:selected {stroke:#123456;shape:diamond} graph[theme="dark"]{background:#101112} edge {opacity:0.5;line-style:dashed}',
  );
  expect(nodeStyle(rules, n, THING)).toMatchObject({
    fill: "#aabbcc",
    size: 40,
    shape: "diamond",
    stroke: "#123456",
  });
  expect(nodeStyle(rules, n, null).shape).toBeUndefined();
  expect(graphBackground(rules, true, "#fff")).toBe("#101112");
  expect(styledRadius(n, "node {size:80px}")).toBe(40);
  expect(
    edgeStyle(rules, {
      source: "x",
      target: "y",
      predicate: "p",
      parallelCount: 1,
      parallelIndex: 0,
    }),
  ).toMatchObject({ opacity: 0.5, "line-style": "dashed" });
});
it.each([
  "node {fill:url(https://example.com)}",
  "node {size:400px}",
  "edge {shape:circle}",
  "node.Banana {fill:#fff}",
  'graph[theme="other"]{background:#fff}',
  "node {unknown:1}",
  "node {opacity:2}",
  "node {fill:#ff}",
])("rejects invalid stylesheet %s", (text) =>
  expect(() => parseGraphStyle(text)).toThrow(),
);
it("keeps circular layouts finite and honors pinned nodes", () => {
  const s = buildEmptyStore(),
    a = s.createClass("A", THING),
    b = s.createClass("B", THING),
    v = new Viewport(s);
  v.seed([THING, a, b]);
  v.nodes.get(a)!.pinned = true;
  v.nodes.get(a)!.x = 17;
  const l = new Layouts(v, s);
  l.choice = "circle";
  l.run();
  expect(v.nodes.get(a)!.x).toBe(17);
  expect(
    [...v.nodes.values()].every(
      (n) => Number.isFinite(n.x) && Number.isFinite(n.y),
    ),
  ).toBe(true);
  expect(v.nodes.size).toBe(3);
});
it("bounds history memory, supports redo and drops abandoned redo branches", () => {
  const h = new History(3, 12);
  let value = 0;
  const add = (v: number) => {
    const before = value;
    value = v;
    h.push({
      label: String(v),
      bytes: 5,
      undo: () => {
        value = before;
      },
      redo: () => {
        value = v;
      },
    });
  };
  add(1);
  add(2);
  add(3);
  expect(h.undoStack).toHaveLength(2);
  h.undo();
  expect(value).toBe(2);
  h.redo();
  expect(value).toBe(3);
  h.undo();
  add(4);
  expect(h.redo()).toBe(false);
  h.clear();
  expect(h.undo()).toBe(false);
});
