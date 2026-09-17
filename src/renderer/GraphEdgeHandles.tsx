import { GraphScope, useGraphScope } from "./GraphScope";
import { useEffect, useRef, type RefObject } from "react";

import { edgeRoute, routeMiddle, type Point } from "./edge-geometry";
import type { Camera } from "./scene";
import { edgeKey, type GraphEdge, type EdgeBend } from "../domain/viewport";
export function GraphEdgeHandles({
  edgeId,
  canvas,
  camera,
  dirty,
}: {
  edgeId: string;
  canvas: RefObject<HTMLCanvasElement | null>;
  camera: RefObject<Camera>;
  dirty: RefObject<boolean>;
}) {
  const { graph, state, act } = useGraphScope();
  const middle = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    edge: GraphEdge;
    before?: EdgeBend;
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
      if (middle.current) {
        middle.current.style.left = mid.x + "px";
        middle.current.style.top = mid.y + "px";
      }
    };
    paint();
    return () => {
      win.cancelAnimationFrame(frame);
      restore();
    };
  }, [edgeId]);
  return (
    <div className="graph-edge-handles" aria-label="Selected edge handles">
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
          d.edge.bend = d.before?.points
            ? {
                x: d.before.x + (p.x - d.start.x) / camera.current.zoom,
                y: d.before.y + (p.y - d.start.y) / camera.current.zoom,
                points: d.before.points.map((v) => ({
                  x: v.x + (p.x - d.start.x) / camera.current.zoom,
                  y: v.y + (p.y - d.start.y) / camera.current.zoom,
                })),
              }
            : d.edge.source === d.edge.target
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
              ...(edge.bend?.points
                ? {
                    points: edge.bend.points.map((p) => ({
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
                    })),
                  }
                : {}),
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
