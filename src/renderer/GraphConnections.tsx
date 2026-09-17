import { GraphScope, useGraphScope } from "./GraphScope";
import { useEffect, useRef, useState, useId, type RefObject } from "react";
import { report } from "./client";
import { connectionTarget } from "./connection-geometry";
import { connectionPredicate } from "./connection-predicate";
import { screenPoint, type Camera, type Rect } from "./scene";
import { styledRadius } from "../domain/graph-style";
import { edgeKey } from "../domain/viewport";
import { expand, shorten } from "../domain/model";
import type { Point } from "./edge-geometry";

interface Draft {
  source?: string;
  target?: string;
  epoch: number;
  version: number;
  bends: Point[];
}
export interface ConnectionController {
  start: (source?: string, point?: Point) => void;
  active: () => boolean;
  move: (point: Point) => void;
  release: (point: Point) => void;
  cancel: () => void;
  key: (event: React.KeyboardEvent) => void;
}
export function GraphConnections({
  canvas,
  camera,
  labels,
  controller,
}: {
  canvas: RefObject<HTMLCanvasElement | null>;
  camera: RefObject<Camera>;
  labels: RefObject<Map<string, Rect>>;
  controller: RefObject<ConnectionController | null>;
}) {
  const { graph, state, request, act, useSnapshot } = useGraphScope();
  const s = useSnapshot()!,
    [token] = useState(() => crypto.randomUUID()),
    marker = useId().replaceAll(":", "");
  const [draft, setDraft] = useState<Draft | null>(null),
    current = useRef<Draft | null>(null),
    [candidate, setCandidate] = useState<string>(),
    target = useRef<string | undefined>(undefined),
    pointer = useRef<Point | undefined>(undefined),
    path = useRef<SVGPathElement>(null),
    ring = useRef<SVGRectElement>(null),
    picker = useRef<HTMLFormElement>(null),
    [predicate, setPredicate] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    submitting = useRef(false);
  const active = (value: Draft | null) => {
    current.current = value;
    setDraft(value);
  };
  const hover = (iri?: string) => {
    target.current = iri;
    setCandidate(iri);
  };
  const cancel = () => {
    if (submitting.current) return;
    active(null);
    hover();
    pointer.current = undefined;
    setError("");
    canvas.current?.focus();
  };
  const start = (source?: string, point?: Point) => {
    if (!state || submitting.current) return;
    hover();
    pointer.current = point;
    setError("");
    setPredicate("");
    active({
      source:
        source &&
        state.entities.some(
          (e) => e.iri === source && e.kind !== "Intersection",
        )
          ? source
          : undefined,
      epoch: state.datasetEpoch,
      version: state.version,
      bends: [],
    });
    canvas.current?.focus();
  };
  const hit = (point: Point) =>
    graph &&
    connectionTarget(
      graph.nodes,
      point,
      camera.current,
      graph.stylesheet,
      current.current?.source,
      new Set(
        state?.entities
          .filter((e) => e.kind !== "Intersection")
          .map((e) => e.iri),
      ),
      labels.current,
    );
  const move = (point: Point) => {
    if (!current.current || current.current.target) return;
    pointer.current = point;
    hover(hit(point)?.iri);
  };
  const commit = async (d: Draft, relationship: string) => {
    if (submitting.current || !d.source || !d.target) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const key = edgeKey({
        source: d.source,
        predicate: relationship,
        target: d.target,
      });
      if (graph?.edges.some((e) => edgeKey(e) === key)) {
        await request("selectEdge", { key });
        report("This relationship already exists.");
      } else
        await request("createEdge", {
          datasetEpoch: d.epoch,
          version: d.version,
          statement: {
            subject: d.source,
            predicate: relationship,
            object: { literal: false, value: d.target },
          },
          bends: d.bends,
        });
      active(null);
      hover();
      canvas.current?.focus();
    } catch (e) {
      const message = (e as Error).message.replace(
        /^Error invoking remote method '[^']+': Error: /,
        "",
      );
      report(message, true);
      setError(message);
      if (
        d.epoch !== state?.datasetEpoch ||
        d.version !== state?.version ||
        !picker.current
      ) {
        active(null);
        hover();
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const choose = (iri?: string, point?: Point) => {
    const d = current.current;
    if (!d || d.target || submitting.current) return;
    if (d.epoch !== state?.datasetEpoch || d.version !== state?.version) {
      cancel();
      report("The ontology changed. Draw the edge again.", true);
      return;
    }
    if (!d.source) {
      if (iri) {
        active({ ...d, source: iri });
        hover();
      }
      return;
    }
    if (iri) {
      const next = { ...d, target: iri };
      active(next);
      hover(iri);
      const relationship = connectionPredicate(
        state.entities.find((e) => e.iri === d.source),
        state.entities.find((e) => e.iri === iri),
      );
      if (relationship) void commit(next, relationship);
      // Other entity pairs need the user's property choice; the attached preview stays in place.
    } else if (point && d.bends.length < 64) {
      const bend = {
        x: (point.x - camera.current.x) / camera.current.zoom,
        y: (point.y - camera.current.y) / camera.current.zoom,
      };
      active({ ...d, bends: [...d.bends, bend] });
    }
  };
  controller.current = {
    start,
    active: () => !!current.current,
    move,
    release: (point) => choose(hit(point)?.iri, point),
    cancel,
    key: (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }
      if (current.current?.target) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const choices =
          graph?.nodes.filter(
            (n) =>
              n.iri !== current.current?.source &&
              state?.entities.some(
                (e) => e.iri === n.iri && e.kind !== "Intersection",
              ),
          ) ?? [];
        const index = choices.findIndex((n) => n.iri === target.current),
          delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
        hover(
          choices[
            index < 0
              ? delta > 0
                ? 0
                : choices.length - 1
              : (index + delta + choices.length) % choices.length
          ]?.iri,
        );
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose(target.current);
      }
    },
  };
  useEffect(() => {
    active(null);
    hover();
  }, [s.datasetEpoch]);
  useEffect(() => {
    if (!draft) return;
    const epoch = draft.epoch,
      node = canvas.current;
    if (!node) return;
    node.dataset.graphConnecting = "true";
    void request("graphInteraction", {
      token,
      active: true,
      datasetEpoch: epoch,
    }).catch((e) => report(e.message, true));
    return () => {
      delete node.dataset.graphConnecting;
      void request("graphInteraction", {
        token,
        active: false,
        datasetEpoch: epoch,
      }).catch(() => {});
    };
  }, [!!draft, draft?.epoch]);
  useEffect(() => {
    if (
      current.current &&
      !submitting.current &&
      (current.current.version !== s.version ||
        (current.current.source &&
          !s.graph.nodes.some((n) => n.iri === current.current!.source)))
    )
      cancel();
  }, [s.version, s.graph.revision]);
  useEffect(() => {
    if (
      draft?.target &&
      !connectionPredicate(
        s.entities.find((e) => e.iri === draft.source),
        s.entities.find((e) => e.iri === draft.target),
      )
    )
      picker.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [draft?.target]);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const win = node.ownerDocument.defaultView!;
    let frame = 0;
    const paint = () => {
      if (!node.isConnected) return;
      frame = win.requestAnimationFrame(paint);
      const d = current.current;
      if (!d) return;
      if (!node.clientWidth || !node.clientHeight) {
        cancel();
        return;
      }
      const a = graph?.nodes.find((n) => n.iri === d.source),
        b = graph?.nodes.find((n) => n.iri === (d.target ?? target.current));
      if (ring.current) {
        ring.current.style.display = b ? "" : "none";
        if (b) {
          const p = screenPoint(b, camera.current),
            r = styledRadius(b, graph?.stylesheet) * camera.current.zoom + 4;
          for (const [key, value] of Object.entries({
            x: p.x - r,
            y: p.y - r,
            width: r * 2,
            height: r * 2,
          }))
            ring.current.setAttribute(key, String(value));
        }
      }
      if (path.current) {
        const end = b ? screenPoint(b, camera.current) : pointer.current;
        if (a && end) {
          const points = [
            screenPoint(a, camera.current),
            ...d.bends.map((p) => screenPoint(p, camera.current)),
            end,
          ];
          const trim = (index: number, towards: number, radius: number) => {
            const p = points[index],
              q = points[towards],
              dx = q.x - p.x,
              dy = q.y - p.y,
              length = Math.hypot(dx, dy);
            if (length) {
              const r = Math.min(length / 2, radius);
              points[index] = {
                x: p.x + (dx / length) * r,
                y: p.y + (dy / length) * r,
              };
            }
          };
          trim(0, 1, styledRadius(a, graph?.stylesheet) * camera.current.zoom);
          if (b)
            trim(
              points.length - 1,
              points.length - 2,
              styledRadius(b, graph?.stylesheet) * camera.current.zoom + 2,
            );
          path.current.setAttribute(
            "d",
            points.map((p, i) => (i ? "L " : "M ") + p.x + " " + p.y).join(" "),
          );
        } else path.current.setAttribute("d", "");
      }
      if (picker.current && b) {
        const p = screenPoint(b, camera.current),
          box = picker.current;
        box.style.left =
          Math.max(
            4,
            Math.min(node.clientWidth - box.offsetWidth - 4, p.x + 18),
          ) + "px";
        box.style.top =
          Math.max(
            4,
            Math.min(node.clientHeight - box.offsetHeight - 4, p.y + 18),
          ) + "px";
      }
    };
    paint();
    return () => win.cancelAnimationFrame(frame);
  }, []);
  const name = (iri?: string) =>
    graph?.nodes.find((n) => n.iri === iri)?.label ?? "node";
  const needsProperty =
    !!draft?.target &&
    !connectionPredicate(
      s.entities.find((e) => e.iri === draft.source),
      s.entities.find((e) => e.iri === draft.target),
    );
  return (
    <>
      {draft && (
        <>
          <svg
            className="graph-connect-preview"
            data-testid="edge-preview"
            data-source-iri={draft.source ?? ""}
            data-target-iri={draft.target ?? candidate ?? ""}
            aria-hidden="true"
          >
            <defs>
              <marker
                id={marker}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0 0 L7 3.5 L0 7 Z" />
              </marker>
            </defs>
            <path
              ref={path}
              className="connection-line"
              markerEnd={"url(#" + marker + ")"}
            />
            <rect ref={ring} className="connection-target" />
          </svg>
          <span className="sr-only" role="status">
            {draft.source
              ? "Draw from " +
                name(draft.source) +
                " to " +
                name(draft.target ?? candidate) +
                ". Release to attach. Escape cancels."
              : "Choose a source node. Arrow keys and Enter select endpoints. Escape cancels."}
          </span>
          {needsProperty && (
            <form
              className="edge-property-picker"
              ref={picker}
              aria-label="Connection relationship"
              onSubmit={(e) => {
                e.preventDefault();
                if (predicate.trim())
                  void commit(
                    draft,
                    expand(predicate.trim().replace(/^<|>$/g, "")),
                  );
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancel();
                }
              }}
              data-graph-connecting="true"
            >
              <label>
                Relationship
                <input
                  aria-label="Connection relationship"
                  placeholder="Property or IRI"
                  list={marker + "-properties"}
                  value={predicate}
                  onChange={(e) => setPredicate(e.target.value)}
                  disabled={busy}
                />
              </label>
              <datalist id={marker + "-properties"}>
                {s.entities
                  .filter((e) => e.kind.endsWith("Property"))
                  .map((e) => (
                    <option key={e.iri} value={shorten(e.iri)}>
                      {e.label}
                    </option>
                  ))}
              </datalist>
              {error && <span role="alert">{error}</span>}
              <div>
                <button
                  type="submit"
                  className="primary"
                  disabled={busy || !predicate.trim()}
                >
                  Attach
                </button>
                <button type="button" disabled={busy} onClick={cancel}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </>
  );
}
