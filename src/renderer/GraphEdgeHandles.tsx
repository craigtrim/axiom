import { useEffect, useRef, type RefObject } from "react";
import { graph, state, act } from "./client";
import { edgeRoute, routeMiddle, type Point } from "./edge-geometry";
import { styledRadius } from "../domain/graph-style";
import type { Camera } from "./scene";
import { edgeKey, type GraphEdge } from "../domain/viewport";
export function GraphEdgeHandles({
  edgeId,
  canvas,
  camera,
  dirty,
  reconnect,
}: {
  edgeId: string;
  canvas: RefObject<HTMLCanvasElement | null>;
  camera: RefObject<Camera>;
  dirty: RefObject<boolean>;
  reconnect: (
    key: string,
    endpoint: "source" | "target",
    point?: Point,
  ) => void;
}) {
  const source = useRef<HTMLButtonElement>(null),
    target = useRef<HTMLButtonElement>(null),
    middle = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    edge: GraphEdge;
    before?: Point;
    epoch: number;
    start: Point;
    moved: boolean;
  } | null>(null);
  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.x, y: e.clientY - r.y };
  };
  const current = () => graph?.edges.find((e) => edgeKey(e) === edgeId);
  const restore = () => {
    const d = drag.current;
    if (d) {
      d.edge.bend = d.before;
      dirty.current = true;
    }
    drag.current = null;
  };
  useEffect(() => {
    const win = canvas.current!.ownerDocument.defaultView!;
    let frame = 0;
    const paint = () => {
      frame = win.requestAnimationFrame(paint);
      const edge = current(),
        a = graph?.nodes.find((n) => n.iri === edge?.source),
        b = graph?.nodes.find((n) => n.iri === edge?.target);
      if (!edge || !a || !b) return;
      const route = edgeRoute(edge, a, b, camera.current, graph!.mode),
        mid = routeMiddle(route);
      const endpoint = (p: Point, towards: Point, radius: number) => {
        const dx = towards.x - p.x,
          dy = towards.y - p.y,
          len = Math.max(1, Math.hypot(dx, dy));
        const r = radius * camera.current.zoom + 18;
        return { x: p.x + (dx / len) * r, y: p.y + (dy / len) * r };
      };
      const p = route.points[0],
        q = route.q;
      const positions = [
        endpoint(
          p,
          route.control ?? route.points[1],
          styledRadius(a, graph!.stylesheet),
        ),
        endpoint(q, route.anchor, styledRadius(b, graph!.stylesheet)),
        mid,
      ];
      [source, target, middle].forEach((ref, i) => {
        if (ref.current) {
          ref.current.style.left = positions[i].x + "px";
          ref.current.style.top = positions[i].y + "px";
        }
      });
    };
    paint();
    return () => {
      win.cancelAnimationFrame(frame);
      restore();
    };
  }, [edgeId]);
  const endpointStart = useRef<Point | null>(null);
  return (
    <div className="graph-edge-handles" aria-label="Selected edge handles">
      {(["source", "target"] as const).map((end, i) => (
        <button
          key={end}
          type="button"
          ref={i === 0 ? source : target}
          className="graph-edge-handle endpoint"
          aria-label={"Reconnect edge " + end}
          title={"Drag onto a node, or activate then select the new " + end}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            endpointStart.current = point(e);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            const p = point(e),
              start = endpointStart.current;
            endpointStart.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (start)
              reconnect(
                edgeId,
                end,
                Math.hypot(p.x - start.x, p.y - start.y) > 3 ? p : undefined,
              );
          }}
          onPointerCancel={() => {
            endpointStart.current = null;
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.detail === 0) reconnect(edgeId, end);
          }}
        />
      ))}
      <button
        type="button"
        ref={middle}
        className="graph-edge-handle bend"
        aria-label="Bend edge"
        title="Drag to reroute; arrow keys move the bend; Escape cancels a drag"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const edge = current();
          if (!edge) return;
          drag.current = {
            edge,
            before: edge.bend ? { ...edge.bend } : undefined,
            epoch: state!.datasetEpoch,
            start: point(e),
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const p = point(e);
          d.moved ||= Math.hypot(p.x - d.start.x, p.y - d.start.y) > 3;
          if (!d.moved) return;
          const a = graph!.nodes.find((n) => n.iri === d.edge.source)!,
            b = graph!.nodes.find((n) => n.iri === d.edge.target)!;
          const x = (p.x - camera.current.x) / camera.current.zoom,
            y = (p.y - camera.current.y) / camera.current.zoom;
          d.edge.bend =
            d.edge.source === d.edge.target
              ? { x, y }
              : { x: 2 * x - (a.x + b.x) / 2, y: 2 * y - (a.y + b.y) / 2 };
          dirty.current = true;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d) return;
          const bend = d.edge.bend;
          restore();
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (d.moved)
            void act("routeEdge", { key: edgeId, bend, datasetEpoch: d.epoch });
        }}
        onPointerCancel={restore}
        onLostPointerCapture={restore}
        onKeyDown={(e) => {
          if (e.key === "Escape" && drag.current) {
            e.preventDefault();
            e.stopPropagation();
            restore();
            return;
          }
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              e.key,
            ) ||
            e.altKey ||
            e.ctrlKey ||
            e.metaKey
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          const edge = current(),
            a = graph?.nodes.find((n) => n.iri === edge?.source),
            b = graph?.nodes.find((n) => n.iri === edge?.target);
          if (!edge || !a || !b) return;
          const route = edgeRoute(
              edge,
              a,
              b,
              { x: 0, y: 0, zoom: 1 },
              graph!.mode,
            ),
            mid = routeMiddle(route),
            delta = (e.shiftKey ? 1 : 10) / camera.current.zoom;
          const p =
            edge.bend ??
            (edge.source === edge.target
              ? mid
              : {
                  x: 2 * mid.x - (a.x + b.x) / 2,
                  y: 2 * mid.y - (a.y + b.y) / 2,
                });
          void act("routeEdge", {
            key: edgeId,
            bend: {
              x:
                p.x +
                (e.key === "ArrowLeft"
                  ? -delta
                  : e.key === "ArrowRight"
                    ? delta
                    : 0),
              y:
                p.y +
                (e.key === "ArrowUp"
                  ? -delta
                  : e.key === "ArrowDown"
                    ? delta
                    : 0),
            },
            datasetEpoch: state!.datasetEpoch,
          });
        }}
      />
    </div>
  );
}
