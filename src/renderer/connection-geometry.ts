import type { GraphNode } from "../domain/viewport";
import { styledRadius } from "../domain/graph-style";
import { screenPoint, type Camera, type Rect } from "./scene";
import type { Point } from "./edge-geometry";

export function connectionTarget(
  nodes: GraphNode[],
  point: Point,
  camera: Camera,
  stylesheet?: string,
  excluded?: string,
  eligible?: Set<string>,
  labels?: Map<string, Rect>,
) {
  const candidates = nodes.filter(
    (n) => n.iri !== excluded && (!eligible || eligible.has(n.iri)),
  );
  const nearest = (padding: boolean) =>
    candidates
      .map((n) => {
        const p = screenPoint(n, camera);
        return {
          n,
          distance: Math.hypot(point.x - p.x, point.y - p.y),
          radius: styledRadius(n, stylesheet) * camera.zoom,
        };
      })
      .filter(
        (v) => v.distance <= (padding ? Math.max(24, v.radius + 12) : v.radius),
      )
      .sort((a, b) => a.distance - b.distance)[0]?.n;
  return (
    nearest(false) ??
    candidates.find((n) => {
      const r = labels?.get(n.iri);
      return (
        r &&
        point.x >= r.x &&
        point.x <= r.x + r.width &&
        point.y >= r.y &&
        point.y <= r.y + r.height
      );
    }) ??
    nearest(true)
  );
}
