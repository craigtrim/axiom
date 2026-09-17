import { updateIntersectionRoutes } from "../domain/intersection-routing";
import { EQUIVALENT_CLASS } from "../domain/class-expressions";
import { edgeRoute } from "./edge-geometry";
export { edgeRoute } from "./edge-geometry";
import {
  styleRules,
  nodeStyle,
  edgeStyle,
  graphBackground,
  styledRadius,
} from "../domain/graph-style";
import type { GraphSnapshot } from "../shared/protocol";
import type { GraphNode, GraphEdge } from "../domain/viewport";
import { hidden, edgeKey } from "../domain/viewport";
import { TYPE, SUBCLASS, kindLabel, type Kind } from "../domain/model";
import { isHierarchy } from "../domain/force";
import tokens from "../domain/data/tokens.json";
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const num = (n: number) => Math.round(n * 1000) / 1000;
export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
export const kindToken: Record<Kind, string> = {
  Class: "e-class",
  Defined: "e-defined",
  Intersection: "e-objprop",
  Individual: "e-individual",
  ObjectProperty: "e-objprop",
  DataProperty: "e-dataprop",
  AnnotationProperty: "e-dataprop",
  Resource: "e-individual",
  Datatype: "e-class",
};
export function bounds(g: GraphSnapshot, pad = 90): Rect {
  if (!g.nodes.length) return { x: -320, y: -120, width: 640, height: 240 };
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const n of g.nodes) {
    const radius = Math.max(
      styledRadius(n, g.stylesheet),
      styledRadius(n, g.stylesheet, n.iri),
    );
    x = Math.min(x, n.x - radius);
    y = Math.min(y, n.y - radius);
    right = Math.max(right, n.x + radius);
    bottom = Math.max(bottom, n.y + radius);
  }
  const nodes = new Map(g.nodes.map((n) => [n.iri, n]));
  for (const e of g.edgesVisible === false ? [] : g.edges) {
    if (!e.bend && e.source !== e.target && e.parallelCount <= 1) continue;
    const a = nodes.get(e.source),
      b = nodes.get(e.target);
    if (!a || !b) continue;
    const route = edgeRoute(
      e,
      { ...a, radius: styledRadius(a, g.stylesheet) },
      b,
      { x: 0, y: 0, zoom: 1 },
      g.mode,
    );
    for (const p of [
      ...route.points,
      ...(route.control ? [route.control] : []),
    ]) {
      x = Math.min(x, p.x - 8);
      y = Math.min(y, p.y - 8);
      right = Math.max(right, p.x + 8);
      bottom = Math.max(bottom, p.y + 8);
    }
  }
  return {
    x: x - pad,
    y: y - pad,
    width: right - x + 2 * pad,
    height: bottom - y + 2 * pad,
  };
}
export function fit(g: GraphSnapshot, w: number, h: number): Camera {
  const b = bounds(g, 0),
    zoom = Math.max(
      0.05,
      Math.min(1.9, (w - 88) / b.width, (h - 88) / b.height),
    );
  return {
    x: w / 2 - (b.x + b.width / 2) * zoom,
    y: h / 2 - (b.y + b.height / 2) * zoom,
    zoom,
  };
}
export const screenPoint = (n: Point, c: Camera) => ({
  x: n.x * c.zoom + c.x,
  y: n.y * c.zoom + c.y,
});
export class Draw {
  private batches: Map<
    string,
    {
      traces: ((c: CanvasRenderingContext2D) => void)[];
      color: string;
      stroke: number;
      dashed: boolean;
    }
  > | null = null;
  beginBatch() {
    if (this.context) this.batches = new Map();
  }
  endBatch() {
    const c = this.context;
    if (c && this.batches) {
      for (const b of this.batches.values()) {
        c.strokeStyle = b.color;
        c.fillStyle = b.color;
        c.lineWidth = b.stroke || 1;
        c.setLineDash(b.dashed ? [4, 3] : []);
        for (let start = 0; start < b.traces.length; start += 64) {
          c.beginPath();
          for (let i = start; i < Math.min(start + 64, b.traces.length); i++)
            b.traces[i](c);
          if (b.stroke) c.stroke();
          else c.fill();
        }
      }
      c.setLineDash([]);
    }
    this.batches = null;
  }
  private batchPath(color: string, stroke: number, dashed = false) {
    if (!this.batches) return null;
    const key = color + "|" + stroke + "|" + dashed;
    let b = this.batches.get(key);
    if (!b) {
      b = { traces: [], color, stroke, dashed };
      this.batches.set(key, b);
    }
    return b.traces;
  }
  parts: string[] = [];
  context: CanvasRenderingContext2D | null;
  measureContext: CanvasRenderingContext2D;
  private metrics = new Map<string, number>();

  constructor(
    ctx: CanvasRenderingContext2D | null,
    public width: number,
    public height: number,
    measureContext?: CanvasRenderingContext2D,
  ) {
    this.context = ctx;
    this.measureContext =
      measureContext ??
      ctx ??
      document.createElement("canvas").getContext("2d")!;
  }
  measure(text: string, size = 12, bold = false) {
    const key = size + "|" + bold + "|" + text;
    const old = this.metrics.get(key);
    if (old !== undefined) return old;
    this.measureContext.font =
      (bold ? "600 " : "400 ") + size + 'px "Segoe UI", sans-serif';
    const n = this.measureContext.measureText(text).width;
    if (this.metrics.size > 8192) this.metrics.clear();
    this.metrics.set(key, n);
    return n;
  }
  rect(r: Rect, color: string, radius = 0, stroke = 0) {
    const c = this.context;
    const batch = this.batchPath(color, stroke);
    if (batch) {
      batch.push((c) => {
        c.roundRect(
          r.x,
          r.y,
          Math.max(0, r.width),
          Math.max(0, r.height),
          Math.max(0, radius),
        );
      });
      return;
    }
    if (c) {
      c.beginPath();
      c.roundRect(
        r.x,
        r.y,
        Math.max(0, r.width),
        Math.max(0, r.height),
        Math.max(0, radius),
      );
      if (stroke) {
        c.strokeStyle = color;
        c.lineWidth = stroke;
        c.stroke();
      } else {
        c.fillStyle = color;
        c.fill();
      }
    } else
      this.parts.push(
        '<rect x="' +
          num(r.x) +
          '" y="' +
          num(r.y) +
          '" width="' +
          num(r.width) +
          '" height="' +
          num(r.height) +
          '" rx="' +
          num(radius) +
          '" ' +
          (stroke
            ? 'fill="none" stroke="' + color + '" stroke-width="' + stroke + '"'
            : 'fill="' + color + '"') +
          "/>",
      );
  }
  circle(p: Point, r: number, color: string, stroke = 0) {
    const c = this.context;
    const batch = this.batchPath(color, stroke);
    if (batch) {
      batch.push((c) => {
        c.moveTo(p.x + r, p.y);
        c.arc(p.x, p.y, Math.max(0, r), 0, Math.PI * 2);
      });
      return;
    }
    if (c) {
      c.beginPath();
      c.arc(p.x, p.y, Math.max(0, r), 0, Math.PI * 2);
      if (stroke) {
        c.strokeStyle = color;
        c.lineWidth = stroke;
        c.stroke();
      } else {
        c.fillStyle = color;
        c.fill();
      }
    } else
      this.parts.push(
        '<circle cx="' +
          num(p.x) +
          '" cy="' +
          num(p.y) +
          '" r="' +
          num(r) +
          '" ' +
          (stroke
            ? 'fill="none" stroke="' + color + '" stroke-width="' + stroke + '"'
            : 'fill="' + color + '"') +
          "/>",
      );
  }
  path(
    points: Point[],
    color: string,
    stroke = 1,
    fill = false,
    dashed = false,
    control?: Point,
  ) {
    if (!points.length) return;
    const batch = this.batchPath(color, fill ? 0 : stroke, dashed);
    if (batch) {
      batch.push((c) => {
        c.moveTo(points[0].x, points[0].y);
        if (control)
          c.quadraticCurveTo(control.x, control.y, points[1].x, points[1].y);
        else
          for (let i = 1; i < points.length; i++)
            c.lineTo(points[i].x, points[i].y);
        if (fill) c.closePath();
      });
      return;
    }
    const c = this.context;
    if (c) {
      c.beginPath();
      c.moveTo(points[0].x, points[0].y);
      if (control)
        c.quadraticCurveTo(control.x, control.y, points[1].x, points[1].y);
      else for (const p of points.slice(1)) c.lineTo(p.x, p.y);
      if (fill) {
        c.closePath();
        c.fillStyle = color;
        c.fill();
      } else {
        c.strokeStyle = color;
        c.lineWidth = stroke;
        c.setLineDash(dashed ? [4, 3] : []);
        c.stroke();
        c.setLineDash([]);
      }
    } else {
      let d = "M " + num(points[0].x) + " " + num(points[0].y);
      if (control)
        d +=
          " Q " +
          num(control.x) +
          " " +
          num(control.y) +
          " " +
          num(points[1].x) +
          " " +
          num(points[1].y);
      else
        for (const p of points.slice(1)) d += " L " + num(p.x) + " " + num(p.y);
      if (fill) d += " Z";
      this.parts.push(
        '<path d="' +
          d +
          '" ' +
          (fill
            ? 'fill="' + color + '"'
            : 'fill="none" stroke="' +
              color +
              '" stroke-width="' +
              stroke +
              '"') +
          (dashed ? ' stroke-dasharray="4 3"' : "") +
          "/>",
      );
    }
  }
  text(
    text: string,
    p: Point,
    color: string,
    size = 12,
    bold = false,
    centred = false,
    halo?: string,
  ) {
    const c = this.context;
    if (c) {
      c.font = (bold ? "600 " : "400 ") + size + 'px "Segoe UI", sans-serif';
      c.textAlign = centred ? "center" : "left";
      c.textBaseline = "top";
      if (halo) {
        c.strokeStyle = halo;
        c.lineWidth = 3.5;
        c.lineJoin = "round";
        c.strokeText(text, p.x, p.y);
      }
      c.fillStyle = color;
      c.fillText(text, p.x, p.y);
    } else
      this.parts.push(
        '<text x="' +
          num(p.x) +
          '" y="' +
          num(p.y) +
          '" dominant-baseline="text-before-edge" font-family="Segoe UI, sans-serif" font-size="' +
          size +
          '" font-weight="' +
          (bold ? 600 : 400) +
          '" fill="' +
          color +
          '"' +
          (centred ? ' text-anchor="middle"' : "") +
          (halo
            ? ' stroke="' +
              halo +
              '" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke"'
            : "") +
          ">" +
          esc(text) +
          "</text>",
      );
  }
  finish() {
    return (
      '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="' +
      Math.ceil(this.width) +
      '" height="' +
      Math.ceil(this.height) +
      '" viewBox="0 0 ' +
      num(this.width) +
      " " +
      num(this.height) +
      '"><title>Axiom ontology graph</title>' +
      this.parts.join("") +
      "</svg>"
    );
  }
}
function shape(
  d: Draw,
  kind: Kind,
  p: Point,
  r: number,
  color: string,
  stroke = 0,
) {
  if (kind === "Individual") d.circle(p, r, color, stroke);
  else if (kind === "Class" || kind === "Defined")
    d.rect(
      {
        x: p.x - r * 0.92,
        y: p.y - r * 0.92,
        width: r * 1.84,
        height: r * 1.84,
      },
      color,
      Math.min(5, r * 0.45),
      stroke,
    );
  else {
    const count = kind === "ObjectProperty" || kind === "Intersection" ? 4 : 6,
      start =
        kind === "ObjectProperty" || kind === "Intersection"
          ? -Math.PI / 2
          : Math.PI / 6,
      points = Array.from({ length: count }, (_, i) => ({
        x: p.x + Math.cos(start + (i * 2 * Math.PI) / count) * r,
        y: p.y + Math.sin(start + (i * 2 * Math.PI) / count) * r,
      }));
    if (stroke) points.push(points[0]);
    d.path(points, color, stroke || 1, !stroke);
  }
}
const alpha = (hex: string, a: number) =>
  hex +
  Math.round(a * 255)
    .toString(16)
    .padStart(2, "0");
export function render(
  d: Draw,
  g: GraphSnapshot,
  c: Camera,
  dark: boolean,
  selected: string | null,
  hover: string | null = null,
  maxLabels = 900,
  options: {
    transparent?: boolean;
    allLabels?: boolean;
    spotlight?: string;
    selectedEdge?: string | null;
    hoveredEdge?: string | null;
    onLabel?: (iri: string, rect: Rect) => void;
  } = {},
) {
  const visibleEdges = g.edgesVisible === false ? [] : g.edges;
  const rules = styleRules(g.stylesheet),
    styles = new Map(
      rules.length
        ? g.nodes.map((n) => [n.iri, nodeStyle(rules, n, selected)] as const)
        : [],
    );
  if (rules.length)
    g = {
      ...g,
      nodes: g.nodes.map((n) => ({
        ...n,
        radius: styledRadius(n, g.stylesheet, selected),
      })),
    };
  const palette = (dark ? tokens.dark : tokens.light) as Record<string, string>,
    C = (k: string) =>
      k === "canvas" ? graphBackground(rules, dark, palette[k]) : palette[k],
    k = c.zoom,
    { width: w, height: h } = d;
  if (!options.transparent)
    d.rect({ x: 0, y: 0, width: w, height: h }, C("canvas"));
  d.beginBatch();
  const step = 34 * k;
  if (step > 11 && !options.transparent)
    for (let x = c.x % step; x < w; x += step)
      for (let y = c.y % step; y < h; y += step)
        d.circle({ x, y }, 0.65, C("canvas-grid"));
  for (const r of g.rings)
    d.circle(screenPoint(g.ringOrigin, c), r * k, C("canvas-grid"), 1);
  for (const b of g.groups) {
    const p = screenPoint(b, c);
    d.rect(
      { ...p, width: b.width * k, height: b.height * k },
      C("stroke"),
      6 * k,
      1,
    );
  }
  d.endBatch();
  const near = new Set<string>();
  if (hover) {
    near.add(hover);
    for (const e of visibleEdges) {
      if (e.source === hover) near.add(e.target);
      if (e.target === hover) near.add(e.source);
    }
  }
  updateIntersectionRoutes(g.nodes, visibleEdges);
  const selectedBranch = visibleEdges.find(
    (e) => edgeKey(e) === options.selectedEdge,
  )?.intersection;
  const nodes = new Map(g.nodes.map((n) => [n.iri, n]));
  d.beginBatch();
  for (const e of visibleEdges) {
    const a = nodes.get(e.source),
      b = nodes.get(e.target);
    if (!a || !b) continue;
    const activeEdge =
        options.selectedEdge === edgeKey(e) ||
        !!(
          selectedBranch &&
          e.intersection &&
          JSON.stringify(selectedBranch.axiom) ===
            JSON.stringify(e.intersection.axiom)
        ),
      emphasis =
        activeEdge ||
        options.hoveredEdge === edgeKey(e) ||
        (hover && (a.iri === hover || b.iri === hover)),
      structural = isHierarchy(e.predicate),
      styled = edgeStyle(rules, e),
      color = alpha(
        emphasis ? C("accent") : (styled.stroke ?? C("stroke-strong")),
        emphasis
          ? 1
          : (styled.opacity ??
              (emphasis ? 1 : hover ? 0.18 : structural ? 0.72 : 0.48)),
      ),
      route = edgeRoute(e, a, b, c, g.mode);
    d.path(
      route.points,
      color,
      activeEdge
        ? Math.max(3, styled["stroke-width"] ?? 0)
        : (styled["stroke-width"] ?? (emphasis ? 2 : structural ? 1.15 : 1)),
      false,
      styled["line-style"]
        ? styled["line-style"] === "dashed"
        : e.predicate === TYPE,
      route.control,
    );
    if (k > 0.42) {
      const dx = route.q.x - route.anchor.x,
        dy = route.q.y - route.anchor.y,
        len = Math.max(1, Math.hypot(dx, dy)),
        ux = dx / len,
        uy = dy / len,
        p = {
          x: route.q.x - ux * (b.radius + 2.5) * k,
          y: route.q.y - uy * (b.radius + 2.5) * k,
        };
      d.path(
        [
          p,
          { x: p.x - ux * 6 - uy * 3, y: p.y - uy * 6 + ux * 3 },
          { x: p.x - ux * 6 + uy * 3, y: p.y - uy * 6 - ux * 3 },
        ],
        color,
        1,
        true,
      );
    }
  }
  d.endBatch();
  const captions = new Set<string>();
  if (k > 0.45)
    for (const e of visibleEdges) {
      const a = nodes.get(e.source),
        b = nodes.get(e.target);
      if (
        !a ||
        !b ||
        ![SUBCLASS, EQUIVALENT_CLASS].includes(e.predicate) ||
        !e.intersection
      )
        continue;
      if (
        visibleEdges.length > 18 &&
        ![selected, hover, ...g.focus].includes(a.iri) &&
        ![selected, hover, ...g.focus].includes(b.iri)
      )
        continue;
      const group = JSON.stringify(e.intersection!.axiom);
      if (captions.has(group)) continue;
      captions.add(group);
      const join = e.junction ?? b;
      const p = screenPoint(
        { x: (a.x + join.x) / 2, y: (a.y + join.y) / 2 },
        c,
      );
      d.text(
        e.predicate === SUBCLASS ? "subclass of all" : "equivalent to all",
        { x: p.x + 10, y: p.y - 5 },
        C("text-secondary"),
        10,
        false,
        false,
        C("canvas"),
      );
    }
  const focus = new Set(g.focus);
  d.beginBatch();
  for (const n of g.nodes) {
    const p = screenPoint(n, c),
      r = n.radius * k,
      style = styles.get(n.iri) ?? {},
      kind = style.shape
        ? (
            {
              circle: "Individual",
              square: "Class",
              diamond: "ObjectProperty",
              hexagon: "DataProperty",
            } as const
          )[style.shape]
        : n.kind;
    if (p.x + r < -40 || p.y + r < -40 || p.x - r > w + 40 || p.y - r > h + 40)
      continue;
    if (selected === n.iri) {
      const gap = r + 5;
      for (const [x, y] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ])
        d.rect(
          { x: p.x + x * gap - 2, y: p.y + y * gap - 2, width: 4, height: 4 },
          C("text"),
        );
    }
    shape(
      d,
      kind,
      p,
      r,
      alpha(
        style.fill ?? C(kindToken[n.kind]),
        (style.opacity ?? 1) * (hover && !near.has(n.iri) ? 0.25 : 1),
      ),
    );
    if (style.stroke || style["stroke-width"])
      shape(
        d,
        kind,
        p,
        r,
        style.stroke ?? C("text"),
        style["stroke-width"] ?? 1,
      );
    if (n.kind === "Defined") {
      d.path(
        [
          { x: p.x - r * 0.4, y: p.y },
          { x: p.x + r * 0.4, y: p.y },
        ],
        C("canvas"),
        2,
      );
      d.path(
        [
          { x: p.x, y: p.y - r * 0.4 },
          { x: p.x, y: p.y + r * 0.4 },
        ],
        C("canvas"),
        2,
      );
    }
    if (n.pinned)
      d.circle({ x: p.x - r * 0.8, y: p.y - r * 0.8 }, 3.4 + k, C("warn"));
  }
  d.endBatch();
  for (const n of g.nodes)
    if (n.kind === "Intersection" && k > 0.35) {
      const p = screenPoint(n, c);
      d.text(
        "AND",
        { x: p.x, y: p.y - Math.min(11, n.radius * k * 0.75) * 0.6 },
        C("canvas"),
        Math.min(11, n.radius * k * 0.75),
        true,
        true,
      );
    }
  const headings = g.groups
      .map((b) => ({ b, p: screenPoint({ x: b.x + 12, y: b.y + 8 }, c) }))
      .filter(
        ({ b }) =>
          k > 0.22 &&
          b.width * k > d.measure(b.label, 12, true) + 24 &&
          b.height * k > 56,
      ),
    reserved = headings.map(({ b, p }) => ({
      x: p.x - 3,
      y: p.y - 2,
      width: d.measure(b.label, 12, true) + 6,
      height: 32,
    }));
  const occupied = new Map<string, Rect[]>();
  const priority = (n: GraphNode) =>
    (focus.has(n.iri) ? 4000 : 0) +
    (selected === n.iri ? 3000 : 0) +
    (hover === n.iri ? 2000 : 0) +
    (n.pinned ? 900 : 0) +
    n.radius * 18 +
    n.shownDegree;
  let labels = 0;
  for (const n of g.nodes.slice().sort((a, b) => priority(b) - priority(a))) {
    if (labels >= maxLabels) break;
    const p = screenPoint(n, c);
    p.y += n.radius * k + 4;
    if (p.x < -240 || p.y < -40 || p.x > w + 240 || p.y > h + 40) continue;
    const style = styles.get(n.iri) ?? {};
    if (style.label === "none") continue;
    const label = style.label === "iri" ? n.iri : n.label;
    const text =
        !options.allLabels && label.length > 60
          ? label.slice(0, 58) + "…"
          : label,
      size = style["font-size"] ?? (n.kind === "Individual" ? 11 : 12.5),
      bold = n.kind !== "Individual",
      tw = d.measure(text, size, bold),
      rect = {
        x: p.x - tw / 2 - 3,
        y: p.y - 2,
        width: tw + 6,
        height: size * 1.35,
      };
    let overlap = reserved.some((r) => intersects(r, rect));
    const keys: string[] = [];
    for (
      let x = Math.floor(rect.x / 96);
      x <= Math.floor((rect.x + rect.width) / 96);
      x++
    )
      for (
        let y = Math.floor(rect.y / 96);
        y <= Math.floor((rect.y + rect.height) / 96);
        y++
      ) {
        const key = x + "," + y;
        keys.push(key);
        if (occupied.get(key)?.some((r) => intersects(r, rect))) overlap = true;
      }
    if (overlap && !options.allLabels) continue;
    for (const key of keys) {
      const b = occupied.get(key) ?? [];
      b.push(rect);
      occupied.set(key, b);
    }
    d.text(text, p, style.color ?? C("text"), size, bold, true, C("canvas"));
    options.onLabel?.(n.iri, rect);
    labels++;
  }
  const badges: { text: string; p: Point; rect: Rect }[] = [];
  if (g.countsVisible !== false && k > 0.3)
    for (const n of g.nodes) {
      const count = hidden(n);
      if (!count) continue;
      const p = screenPoint(n, c);
      p.x += n.radius * k * 0.92 + 3;
      p.y -= n.radius * k * 0.92 + 3;
      if (p.x < -40 || p.y < -20 || p.x > w + 40 || p.y > h + 20) continue;
      const text =
          "+" +
          (count > 9999
            ? Math.round(count / 1000) + "k"
            : count > 999
              ? (count / 1000).toFixed(1) + "k"
              : count),
        width = d.measure(text, 9.5, true) + 9,
        rect = { x: p.x - width / 2, y: p.y - 7, width, height: 14 };
      badges.push({ text, p, rect });
    }
  d.beginBatch();
  for (const { rect } of badges) {
    d.rect(rect, C("surface"), 7);
    d.rect(rect, C("stroke-strong"), 7, 1);
  }
  d.endBatch();
  for (const { text, p } of badges) {
    d.text(
      text,
      { x: p.x, y: p.y - 5.7 },
      C("text-secondary"),
      9.5,
      true,
      true,
    );
  }
  for (const { b, p } of headings) {
    d.text(b.label, p, C("text-secondary"), 12, true);
    d.text(
      b.count.toLocaleString("en-GB") + " nodes",
      { x: p.x, y: p.y + 15 },
      C("text-secondary"),
      10,
    );
  }
  const source = options.spotlight
    ? g.nodes.find((n) => n.iri === options.spotlight)
    : undefined;
  if (source) {
    // Dim the complete scene, including text and badges, then repaint the source.
    // The callout is transient UI; exportScene never supplies this option.
    d.rect({ x: 0, y: 0, width: w, height: h }, alpha(C("canvas"), 0.48));
    render(
      d,
      {
        ...g,
        nodes: [source],
        edges: [],
        groups: [],
        rings: [],
        focus: g.focus.filter((iri) => iri === source.iri),
      },
      c,
      dark,
      source.iri,
      null,
      1,
      { transparent: true, allLabels: true, onLabel: options.onLabel },
    );
  }
  return labels;
}
export function exportScene(
  g: GraphSnapshot,
  dark: boolean,
  format: "svg" | "png" | "png3" | "clipboard",
  selected: string | null,
  options: Partial<import("../shared/export").ExportOptions> & {
    viewport?: { width: number; height: number; camera: Camera };
  } = {},
) {
  const b = bounds(g),
    measurer = new Draw(null, 1, 1);
  if (options.allLabels && !options.viewport) {
    let left = b.x,
      right = b.x + b.width,
      bottom = b.y + b.height;
    const rules = styleRules(g.stylesheet);
    for (const n of g.nodes) {
      const style = nodeStyle(rules, n, selected);
      if (style.label === "none") continue;
      const size = style["font-size"] ?? (n.kind === "Individual" ? 11 : 12.5),
        text = style.label === "iri" ? n.iri : n.label,
        half = measurer.measure(text, size, n.kind !== "Individual") / 2 + 20;
      left = Math.min(left, n.x - half);
      right = Math.max(right, n.x + half);
      bottom = Math.max(
        bottom,
        n.y + styledRadius(n, g.stylesheet, selected) + size * 1.35 + 30,
      );
    }
    b.x = left;
    b.width = right - left;
    b.height = bottom - b.y;
  }
  const caption =
    g.mode +
    " layout · " +
    g.nodes.length.toLocaleString() +
    " nodes · " +
    g.edges.length.toLocaleString() +
    (g.edgesVisible === false
      ? " relationships (hidden) · node limit "
      : " relationships · node limit ") +
    g.budget +
    " · " +
    g.hidden.toLocaleString() +
    " neighbours held back";
  const header = options.caption === false ? 0 : 80,
    legendKinds = [...new Set(g.nodes.map((n) => n.kind))],
    measure = new Draw(null, 1, 1),
    width =
      options.viewport?.width ??
      Math.max(
        800,
        b.width,
        options.caption === false
          ? 0
          : Math.max(
              measure.measure(caption, 12),
              measure.measure(options.title ?? g.title ?? "Ontology", 20, true),
            ) + 56,
      ),
    legendColumns = Math.max(1, Math.min(4, Math.floor((width - 56) / 240))),
    footer =
      options.legend === false
        ? 0
        : Math.ceil(legendKinds.length / legendColumns) * 30 + 20,
    height =
      (options.viewport?.height ?? Math.max(240, b.height)) + header + footer;
  const camera = options.viewport
    ? { ...options.viewport.camera, y: options.viewport.camera.y + header }
    : { x: (width - b.width) / 2 - b.x, y: header - b.y, zoom: 1 };
  let canvas: HTMLCanvasElement | undefined,
    ctx: CanvasRenderingContext2D | null = null;
  if (format !== "svg") {
    canvas = document.createElement("canvas");
    const requested = options.scale ?? (format === "png3" ? 3 : 2),
      scale =
        options.scale === undefined
          ? Math.min(requested, 9000 / width, 9000 / height)
          : requested;
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      width * scale > 9000 ||
      height * scale > 9000 ||
      width * height * scale * scale > 40000000
    )
      throw Error(
        "The image is too large. Lower the scale or export the current view. Raster exports support up to 9,000 pixels per side and 40 megapixels.",
      );
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
  }
  const d = new Draw(ctx, width, height),
    p = dark ? tokens.dark : tokens.light,
    transparent = options.background === "transparent";
  render(
    d,
    g,
    camera,
    dark,
    selected,
    null,
    options.allLabels === false ? 900 : 4000,
    { transparent, allLabels: options.allLabels ?? false },
  );
  if (header) {
    if (!transparent) d.rect({ x: 0, y: 0, width, height: header }, p.surface);
    d.text(
      options.title ?? (g.title ?? "Ontology") + " | graph view",
      { x: 28, y: 18 },
      p.text,
      20,
      true,
    );
    d.text(caption, { x: 28, y: 49 }, p["text-secondary"]);
  }
  if (footer) {
    if (!transparent)
      d.rect({ x: 0, y: height - footer, width, height: footer }, p.surface);
    const legendRules = styleRules(g.stylesheet);
    legendKinds.forEach((kind, i) => {
      const variants = g.nodes
        .filter((n) => n.kind === kind)
        .map((n) => {
          const style = nodeStyle(legendRules, n, selected);
          return {
            fill: style.fill ?? (p as Record<string, string>)[kindToken[kind]],
            kind: style.shape
              ? (
                  {
                    circle: "Individual",
                    square: "Class",
                    diamond: "ObjectProperty",
                    hexagon: "DataProperty",
                  } as const
                )[style.shape]
              : kind,
          };
        });
      const uniform = variants.every(
        (v) => v.fill === variants[0].fill && v.kind === variants[0].kind,
      );
      const legend = uniform
        ? variants[0]
        : { fill: p["text-secondary"], kind };
      const x = 28 + ((i % legendColumns) * (width - 56)) / legendColumns,
        y = height - footer + 22 + Math.floor(i / legendColumns) * 30;
      shape(d, legend.kind, { x: x + 7, y }, 6.5, legend.fill);
      d.text(
        kindLabel(kind) + (uniform ? "" : " (varied styles)"),
        { x: x + 20, y: y - 8 },
        p["text-secondary"],
      );
    });
  }
  return {
    data: format === "svg" ? d.finish() : canvas!.toDataURL("image/png"),
    width: canvas?.width ?? width,
    height: canvas?.height ?? height,
    canvas,
  };
}
