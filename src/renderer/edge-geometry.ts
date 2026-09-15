import type { GraphEdge, GraphNode } from "../domain/viewport";
import type { GraphSnapshot } from "../shared/protocol";
import { styledRadius } from "../domain/graph-style";
export interface Point {
  x: number;
  y: number;
}
interface Camera extends Point {
  zoom: number;
}
const screenPoint = (p: Point, c: Camera) => ({
  x: p.x * c.zoom + c.x,
  y: p.y * c.zoom + c.y,
});
export function edgeRoute(
  e: GraphEdge,
  a: GraphNode,
  b: GraphNode,
  c: Camera,
  mode: string,
) {
  const p = screenPoint(a, c),
    q = screenPoint(b, c);
  let points = [p, q],
    control: Point | undefined,
    anchor = p;
  if (e.source === e.target) {
    const bend = e.bend
      ? screenPoint(e.bend, c)
      : { x: p.x, y: p.y - (a.radius + 38 + e.parallelIndex * 22) * c.zoom };
    const width = Math.max(24, a.radius * c.zoom + 16);
    points = [
      p,
      { x: p.x - width, y: bend.y },
      bend,
      { x: p.x + width, y: bend.y },
      q,
    ];
    anchor = points[3];
  } else if (e.bend) {
    control = screenPoint(e.bend, c);
    anchor = control;
  } else if (
    mode === "hierarchy" &&
    e.parallelCount <= 1 &&
    Math.abs(a.y - b.y) > 24
  ) {
    const mid = (p.y + q.y) / 2;
    points = [p, { x: p.x, y: mid }, { x: q.x, y: mid }, q];
    anchor = points[2];
  } else if (e.parallelCount > 1) {
    const dx = q.x - p.x,
      dy = q.y - p.y,
      length = Math.max(1, Math.hypot(dx, dy)),
      offset =
        (e.parallelIndex - (e.parallelCount - 1) / 2) *
        22 *
        c.zoom *
        (e.source < e.target ? 1 : -1);
    control = {
      x: (p.x + q.x) / 2 - (dy / length) * offset,
      y: (p.y + q.y) / 2 + (dx / length) * offset,
    };
    anchor = control;
  }
  return { points, control, anchor, q };
}

export function routePoints(route: ReturnType<typeof edgeRoute>) {
  if (!route.control) return route.points;
  const p = route.points[0],
    q = route.q,
    c = route.control;
  const steps = Math.max(
    12,
    Math.min(
      128,
      Math.ceil(
        (Math.hypot(c.x - p.x, c.y - p.y) + Math.hypot(q.x - c.x, q.y - c.y)) /
          12,
      ),
    ),
  );
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps,
      u = 1 - t;
    return {
      x: u * u * p.x + 2 * u * t * c.x + t * t * q.x,
      y: u * u * p.y + 2 * u * t * c.y + t * t * q.y,
    };
  });
}
export function routeMiddle(route: ReturnType<typeof edgeRoute>) {
  if (route.control) {
    const p = route.points[0],
      q = route.q;
    return {
      x: (p.x + 2 * route.control.x + q.x) / 4,
      y: (p.y + 2 * route.control.y + q.y) / 4,
    };
  }
  const points = route.points;
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = remaining / (lengths[i] || 1);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    remaining -= lengths[i];
  }
  return points[0];
}
export function nearestEdge(
  g: GraphSnapshot,
  point: Point,
  camera: Camera,
  tolerance = 7,
) {
  const nodes = new Map(g.nodes.map((n) => [n.iri, n]));
  let best: GraphEdge | undefined,
    distance = tolerance;
  for (const edge of g.edges) {
    let a = nodes.get(edge.source),
      b = nodes.get(edge.target);
    if (!a || !b) continue;
    if (edge.source === edge.target)
      a = { ...a, radius: styledRadius(a, g.stylesheet) };
    const route = edgeRoute(edge, a, b, camera, g.mode),
      controls = [...route.points, ...(route.control ? [route.control] : [])];
    if (
      point.x < Math.min(...controls.map((p) => p.x)) - tolerance ||
      point.x > Math.max(...controls.map((p) => p.x)) + tolerance ||
      point.y < Math.min(...controls.map((p) => p.y)) - tolerance ||
      point.y > Math.max(...controls.map((p) => p.y)) + tolerance
    )
      continue;
    const points = routePoints(route);
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1],
        q = points[i],
        dx = q.x - p.x,
        dy = q.y - p.y;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - p.x) * dx + (point.y - p.y) * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      const d = Math.hypot(point.x - p.x - t * dx, point.y - p.y - t * dy);
      if (d < distance) {
        distance = d;
        best = edge;
      }
    }
  }
  return best;
}
