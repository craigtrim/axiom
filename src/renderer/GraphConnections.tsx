import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useId, type RefObject } from "react";
import { graph, state, request, act, useSnapshot, report } from "./client";
import { CreateEdgeDialog, type ConnectionDraft } from "./CreateEdgeDialog";
import { connectionTarget } from "./connection-geometry";
import { screenPoint, type Camera, type Rect } from "./scene";
import { styledRadius } from "../domain/graph-style";
import type { Point } from "./edge-geometry";
export interface ConnectionController {
  start: (source?: string) => void;
}
export function GraphConnections({
  canvas,
  camera,
  labels,
  controller,
  toolbar,
  hidden,
}: {
  canvas: RefObject<HTMLCanvasElement | null>;
  camera: RefObject<Camera>;
  labels: RefObject<Map<string, Rect>>;
  controller: RefObject<ConnectionController | null>;
  toolbar: RefObject<HTMLDivElement | null>;
  hidden: boolean;
}) {
  const s = useSnapshot()!,
    [token] = useState(() => crypto.randomUUID()),
    marker = useId().replaceAll(":", "");
  const [mode, setMode] = useState<ConnectionDraft | null>(null),
    modeRef = useRef(mode),
    [dialog, setDialog] = useState<ConnectionDraft | null>(null),
    [candidate, setCandidate] = useState<string>(),
    candidateRef = useRef<string | undefined>(undefined),
    pointer = useRef<Point | undefined>(undefined),
    overlay = useRef<HTMLDivElement>(null),
    handle = useRef<HTMLButtonElement>(null),
    preview = useRef<SVGPathElement>(null),
    ring = useRef<SVGCircleElement>(null),
    origin = useRef<SVGCircleElement>(null),
    drag = useRef<Point | null>(null);
  const eligible = new Set(s.entities.map((e) => e.iri));
  const selected = graph?.nodes.find(
    (n) => n.iri === s.selected && eligible.has(n.iri),
  );
  const setActive = (next: ConnectionDraft | null) => {
    modeRef.current = next;
    setMode(next);
  };
  const hover = (iri?: string) => {
    candidateRef.current = iri;
    setCandidate(iri);
  };
  const close = (focus = true) => {
    setActive(null);
    setDialog(null);
    hover();
    pointer.current = undefined;
    drag.current = null;
    if (focus) canvas.current?.focus();
  };
  const start = (source?: string) => {
    if (!state) return;
    setDialog(null);
    hover();
    pointer.current = undefined;
    setActive({
      source:
        source &&
        graph?.nodes.some((n) => n.iri === source) &&
        state.entities.some((e) => e.iri === source)
          ? source
          : undefined,
      epoch: state.datasetEpoch,
      version: state.version,
    });
  };
  controller.current = { start };
  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.x, y: e.clientY - r.y };
  };
  const hit = (p: Point) =>
    graph &&
    connectionTarget(
      graph.nodes,
      p,
      camera.current,
      graph.stylesheet,
      modeRef.current?.source,
      new Set(state?.entities.map((e) => e.iri)),
      labels.current,
    );
  const choose = (iri?: string) => {
    const current = modeRef.current;
    if (!current || !iri) return;
    if (
      current.epoch !== state?.datasetEpoch ||
      current.version !== state?.version
    ) {
      close();
      report("The ontology changed. Start the connection again.");
      return;
    }
    if (!current.source) {
      setActive({ ...current, source: iri });
      hover();
      void act("select", { iri });
    } else setDialog({ ...current, target: iri });
  };
  useEffect(() => {
    close(false);
  }, [s.datasetEpoch]);
  useEffect(() => {
    if (!mode) return;
    const epoch = mode.epoch;
    const bar = toolbar.current!;
    bar.dataset.connecting = "true";
    void request("graphInteraction", {
      token,
      active: true,
      datasetEpoch: epoch,
    }).catch((e) => report(e.message, true));
    overlay.current?.focus();
    return () => {
      delete bar.dataset.connecting;
      void request("graphInteraction", {
        token,
        active: false,
        datasetEpoch: epoch,
      }).catch(() => {});
    };
  }, [!!mode, mode?.epoch]);
  useEffect(() => {
    if (
      mode &&
      !dialog &&
      (mode.version !== s.version ||
        (mode.source &&
          (!s.entities.some((e) => e.iri === mode.source) ||
            !s.graph.nodes.some((n) => n.iri === mode.source))))
    )
      close();
  }, [s.version, s.graph.revision]);
  useEffect(() => {
    const win = canvas.current!.ownerDocument.defaultView!;
    let frame = 0;
    const circle = (el: SVGCircleElement | null, iri?: string) => {
      const node = graph?.nodes.find((n) => n.iri === iri);
      if (!el) return;
      el.style.display = node ? "" : "none";
      if (node) {
        const p = screenPoint(node, camera.current);
        el.setAttribute("cx", String(p.x));
        el.setAttribute("cy", String(p.y));
        el.setAttribute(
          "r",
          String(
            Math.max(
              22,
              styledRadius(node, graph?.stylesheet) * camera.current.zoom + 8,
            ),
          ),
        );
      }
    };
    const paint = () => {
      frame = win.requestAnimationFrame(paint);
      if (
        modeRef.current &&
        (!canvas.current!.clientWidth || !canvas.current!.clientHeight)
      ) {
        close(false);
        return;
      }
      const n = graph?.nodes.find((n) => n.iri === state?.selected);
      if (handle.current && n) {
        const p = screenPoint(n, camera.current),
          r = styledRadius(n, graph?.stylesheet) * camera.current.zoom;
        const width = canvas.current!.clientWidth,
          height = canvas.current!.clientHeight;
        handle.current.style.left =
          Math.max(18, Math.min(width - 18, p.x + r + 24)) + "px";
        handle.current.style.top =
          Math.max(18, Math.min(height - 18, p.y)) + "px";
        handle.current.style.visibility =
          p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height
            ? "visible"
            : "hidden";
      }
      const current = modeRef.current,
        source = graph?.nodes.find((n) => n.iri === current?.source),
        target = graph?.nodes.find((n) => n.iri === candidateRef.current);
      circle(origin.current, current?.source);
      circle(ring.current, candidateRef.current);
      if (preview.current) {
        const from = source && screenPoint(source, camera.current),
          to = target ? screenPoint(target, camera.current) : pointer.current;
        if (from && to) {
          const dx = to.x - from.x,
            dy = to.y - from.y,
            length = Math.max(1, Math.hypot(dx, dy)),
            trim = target
              ? Math.min(
                  length / 2,
                  styledRadius(target, graph?.stylesheet) *
                    camera.current.zoom +
                    4,
                )
              : 0;
          preview.current.setAttribute(
            "d",
            "M " +
              from.x +
              " " +
              from.y +
              " L " +
              (to.x - (dx / length) * trim) +
              " " +
              (to.y - (dy / length) * trim),
          );
        } else preview.current.setAttribute("d", "");
      }
    };
    paint();
    return () => win.cancelAnimationFrame(frame);
  }, []);
  const sourceName = graph?.nodes.find((n) => n.iri === mode?.source)?.label;
  return (
    <>
      {mode && (
        <div
          ref={overlay}
          className="graph-connect-overlay"
          data-graph-connecting="true"
          role="group"
          aria-label="Connect nodes"
          aria-describedby={marker + "-help"}
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button === 0 && e.target === e.currentTarget) {
              e.preventDefault();
              choose(hit(point(e))?.iri);
            }
          }}
          onPointerMove={(e) => {
            pointer.current = point(e);
            hover(hit(pointer.current)?.iri);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
              return;
            }
            if (e.target !== e.currentTarget) return;
            const choices =
              graph?.nodes.filter(
                (n) => eligible.has(n.iri) && n.iri !== mode.source,
              ) ?? [];
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              const index = choices.findIndex(
                (n) => n.iri === candidateRef.current,
              );
              const delta =
                e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
              const next =
                choices[
                  index < 0
                    ? delta > 0
                      ? 0
                      : choices.length - 1
                    : (index + delta + choices.length) % choices.length
                ];
              hover(next?.iri);
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(candidateRef.current);
            }
          }}
        >
          <svg className="graph-connect-preview" aria-hidden="true">
            <defs>
              <marker
                id={marker}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0 0 L8 4 L0 8 Z" />
              </marker>
            </defs>
            <circle ref={origin} className="connection-source" />
            <path
              ref={preview}
              className="connection-line"
              markerEnd={"url(#" + marker + ")"}
            />
            <circle
              ref={ring}
              className="connection-target"
              data-target-iri={candidate ?? ""}
            />
          </svg>
          {toolbar.current &&
            createPortal(
              <div
                className="connection-help"
                data-graph-connecting="true"
                id={marker + "-help"}
              >
                <div className="connection-instructions">
                  <span role="status">
                    {mode.source
                      ? "From " +
                        sourceName +
                        ". " +
                        (candidate
                          ? "To " +
                            graph?.nodes.find((n) => n.iri === candidate)
                              ?.label +
                            ". Click to continue."
                          : "Choose a target node.")
                      : "Choose the source node."}
                  </span>
                  <span className="muted">
                    Click a node or use arrow keys and Enter. Escape cancels.
                  </span>
                </div>
                <div>
                  <button onClick={() => setDialog({ ...mode })}>
                    Choose from list...
                  </button>
                  <button onClick={() => close()}>Cancel connection</button>
                </div>
              </div>,
              toolbar.current,
            )}
        </div>
      )}
      {selected && !hidden && (
        <button
          ref={handle}
          className="graph-connect-handle"
          data-graph-connecting="true"
          tabIndex={mode ? -1 : 0}
          aria-hidden={mode ? true : undefined}
          aria-label={"Connect from " + selected.label}
          title="Drag to another node, or click then choose a target"
          style={{
            opacity: mode ? 0 : 1,
            pointerEvents: mode ? "none" : "auto",
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            drag.current = point(e);
            e.currentTarget.setPointerCapture(e.pointerId);
            start(selected.iri);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            pointer.current = point(e);
            hover(hit(pointer.current)?.iri);
          }}
          onPointerUp={(e) => {
            const first = drag.current;
            drag.current = null;
            const p = point(e);
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (first && Math.hypot(p.x - first.x, p.y - first.y) > 4)
              choose(hit(p)?.iri);
          }}
          onPointerCancel={() => close()}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          onClick={(e) => {
            if (e.detail === 0) start(selected.iri);
          }}
        >
          <span aria-hidden="true">↗</span>
        </button>
      )}
      {dialog && (
        <CreateEdgeDialog
          draft={dialog}
          document={canvas.current!.ownerDocument}
          close={() => close()}
        />
      )}
    </>
  );
}
