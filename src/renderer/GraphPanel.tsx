import { openSimilar } from "./find-state";
import { openTaxonomy } from "./taxonomy-view";
import { MAX_VISIBLE_NODES } from "../shared/graph-limits";
import { GraphSpacing } from "./GraphSpacing";
import { GraphScope, useGraphScope } from "./GraphScope";
import { revealInTaxonomy } from "./taxonomy-navigation";
import { instanceAction } from "../shared/action-state";
import { showInstances } from "./instance-report";
import {
  GraphConnections,
  type ConnectionController,
} from "./GraphConnections";
import { connectionTarget } from "./connection-geometry";
import { GraphEdgeHandles } from "./GraphEdgeHandles";
import { nearestEdge, edgeRoute, routeMiddle } from "./edge-geometry";
import { inspectEdge, removeEdge, resetEdgeRoute } from "./edge-actions";
import { edgeKey, type GraphEdge } from "../domain/viewport";
import type { EdgeDocument } from "../shared/protocol";
import { shorten, THING } from "../domain/model";
import { displayName } from "../domain/rdf-model";
import { placeGraphCallout } from "./graph-callout";
import { ExportDialog } from "./ExportDialog";
import { InlineCreate } from "./InlineCreate";
import {
  creationDraft,
  editEntity,
  type Creation,
  type CreationKind,
} from "./authoring";
import {
  InlineRenameInput,
  onInlineRename,
  startInlineRename,
} from "./InlineRename";
import { ContextMenu } from "./ContextMenu";
import { keyHint } from "./keyboard";
import { styledRadius } from "../domain/graph-style";
import { layoutOptions } from "../shared/layout-options";
import { kindLabel } from "../domain/model";
import { GpuDraw } from "./GpuDraw";
import { useEffect, useRef, useState } from "react";
import { onGraph, panel, savePanel, report, command } from "./client";
import {
  Draw,
  render,
  fit,
  zoomAt,
  bounds,
  screenPoint,
  exportScene,
  type Camera,
  type Rect,
} from "./scene";
import type { GraphNode } from "../domain/viewport";
export function GraphPanel({ graphId = "graph" }: { graphId?: string }) {
  return (
    <GraphScope.Provider value={graphId}>
      <GraphContent />
    </GraphScope.Provider>
  );
}
function GraphContent() {
  const {
    id: graphId,
    graph,
    state,
    request,
    act,
    onCommand,
    useSnapshot,
  } = useGraphScope();
  const cameraKey =
    graphId === "graph" ? "graph.camera" : "graph.camera." + graphId;
  const snapshot = useSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null),
    miniRef = useRef<HTMLCanvasElement>(null),
    camera = useRef<Camera>(panel(cameraKey, { x: 0, y: 0, zoom: 1 })),
    needsFit = useRef(!panel(cameraKey, null)),
    dirty = useRef(true),
    hover = useRef<string | null>(null),
    [info, setInfo] = useState(graph),
    [context, setContext] = useState<{
      x: number;
      y: number;
      iri: string;
    } | null>(null);
  const [renaming, setRenaming] = useState<{
      iri: string;
      name: string;
      keepNameIfEmpty?: boolean;
    } | null>(null),
    renameHost = useRef<HTMLDivElement>(null);
  const labelRects = useRef(new Map<string, Rect>());
  const connectRef = useRef<ConnectionController | null>(null);
  const beginConnection = (iri?: string) => {
    setCreating(null);
    setRenaming(null);
    setReconnecting(null);
    setContext(null);
    setEdgeContext(null);
    setBlankMenu(null);
    connectRef.current?.start(iri);
  };
  const creatingNode = useRef(false);
  const [expandingMax, setExpandingMax] = useState(false);
  const [pendingRename, setPendingRename] = useState<{
    iri: string;
    name: string;
    epoch: number;
  } | null>(null);
  const hoveredEdge = useRef<string | null>(null);
  const [edgeContext, setEdgeContext] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);
  const [reconnecting, setReconnecting] = useState<{
    doc: EdgeDocument;
    endpoint: "source" | "target";
  } | null>(null);
  useEffect(() => {
    setReconnecting(null);
    setEdgeContext(null);
  }, [snapshot?.datasetEpoch]);
  const edgeName = (edge: GraphEdge) =>
    (graph?.nodes.find((n) => n.iri === edge.source)?.label ?? edge.source) +
    " → " +
    shorten(edge.predicate) +
    " → " +
    (graph?.nodes.find((n) => n.iri === edge.target)?.label ?? edge.target);
  const applyReconnect = async (
    doc: EdgeDocument,
    endpoint: "source" | "target",
    node: GraphNode,
  ) => {
    setReconnecting(null);
    const original = doc.statements[0];
    await act("editEdge", {
      key: edgeKey(doc.edge),
      original,
      replacement: {
        ...original,
        ...(endpoint === "source"
          ? { subject: node.iri }
          : { object: { literal: false, value: node.iri } }),
      },
      datasetEpoch: doc.datasetEpoch,
      version: doc.version,
    });
  };
  const reconnect = async (key: string, endpoint: "source" | "target") => {
    try {
      const doc = await request<EdgeDocument>("edgeDocument", { key });
      if (doc.statements.length !== 1) {
        report(
          doc.reason ??
            "Choose the statement graph in Details to reconnect this relationship.",
        );
        inspectEdge();
        return;
      }
      setReconnecting({ doc, endpoint });
      canvasRef.current?.focus();
    } catch (e) {
      report((e as Error).message, true);
    }
  };
  const [exportDialog, setExportDialog] = useState<string | null>(null);
  const createHost = useRef<HTMLDivElement>(null),
    createLink = useRef<SVGPathElement>(null),
    spotlight = useRef<string | null>(null);
  const [creating, setCreating] = useState<
      (Creation & { anchorIri?: string; linked: boolean }) | null
    >(null),
    [blankMenu, setBlankMenu] = useState<{
      x: number;
      y: number;
      point: { x: number; y: number };
    } | null>(null);
  useEffect(() => {
    spotlight.current = creating?.anchorIri ?? context?.iri ?? null;
    dirty.current = true;
  }, [creating, context]);
  useEffect(() => {
    if (!creating) return;
    const host = createHost.current!,
      canvas = canvasRef.current!,
      win = host.ownerDocument.defaultView!;
    let frame = 0;
    const place = () => {
      const n = graph?.nodes.find((n) => n.iri === creating.anchorIri);
      if (creating.anchorIri && !n) {
        setCreating(null);
        return;
      }
      const width = Math.min(320, Math.max(1, canvas.clientWidth - 16));
      host.style.width = width + "px";
      const height = (host.firstElementChild as HTMLElement).scrollHeight + 2;
      if (n) {
        const anchor = {
          ...screenPoint(n, camera.current),
          radius:
            styledRadius(n, graph!.stylesheet, n.iri) * camera.current.zoom,
          labelWidth: Math.min(240, n.label.length * 7 + 16),
        };
        if (
          anchor.x + anchor.radius < 0 ||
          anchor.y + anchor.radius < 0 ||
          anchor.x - anchor.radius > canvas.clientWidth ||
          anchor.y - anchor.radius > canvas.clientHeight
        ) {
          setCreating(null);
          return;
        }
        const box = placeGraphCallout(
          { width: canvas.clientWidth, height: canvas.clientHeight },
          { width, height },
          anchor,
        );
        host.style.width = box.width + "px";
        host.style.maxHeight = box.height + "px";
        host.classList.toggle("compact-callout", box.height < 120);
        host.style.left = box.x + "px";
        host.style.top = box.y + "px";
        host.dataset.side = box.side;
        createLink.current?.setAttribute(
          "d",
          `M ${box.start.x} ${box.start.y} L ${box.end.x} ${box.end.y}`,
        );
      } else {
        const p = screenPoint(
          creating.position ?? { x: 0, y: 0 },
          camera.current,
        );
        host.style.maxHeight = Math.max(1, canvas.clientHeight - 16) + "px";
        host.style.left =
          Math.max(8, Math.min(canvas.clientWidth - width - 8, p.x)) + "px";
        host.style.top =
          Math.max(8, Math.min(canvas.clientHeight - height - 8, p.y)) + "px";
      }
      frame = win.requestAnimationFrame(place);
    };
    place();
    return () => win.cancelAnimationFrame(frame);
  }, [creating]);
  const closeCreation = () => {
    setCreating(null);
    canvasRef.current?.focus();
  };
  useEffect(() => {
    if (!creating) return;
    const host = createHost.current!,
      doc = host.ownerDocument;
    const outside = (event: PointerEvent) => {
      if (!host.contains(event.target as Node)) setCreating(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.isComposing ||
        event.defaultPrevented ||
        doc.querySelector("dialog[open],[role=menu]")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      closeCreation();
    };
    doc.addEventListener("pointerdown", outside, true);
    doc.addEventListener("keydown", escape, true);
    return () => {
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("keydown", escape, true);
    };
  }, [creating]);
  const positionBeside = (iri: string) => {
    const n = graph?.nodes.find((n) => n.iri === iri),
      canvas = canvasRef.current!;
    if (!n) return undefined;
    const p = screenPoint(n, camera.current),
      offset =
        styledRadius(n, graph!.stylesheet, iri) * camera.current.zoom + 80;
    return {
      x:
        n.x +
        (p.x < canvas.clientWidth / 2 ? offset : -offset) / camera.current.zoom,
      y: n.y,
    };
  };
  const createAt = (
    kind: CreationKind,
    p?: { x: number; y: number },
    anchorIri?: string,
  ) => {
    const canvas = canvasRef.current!;
    p ??= { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    const draft = creationDraft(
      kind,
      anchorIri
        ? positionBeside(anchorIri)
        : {
            x: (p.x - camera.current.x) / camera.current.zoom,
            y: (p.y - camera.current.y) / camera.current.zoom,
          },
    );
    setCreating({
      ...draft,
      parent: anchorIri ?? draft.parent,
      anchorIri,
      linked: !!anchorIri,
    });
    setBlankMenu(null);
  };
  const createAndRenameAt = async (p: { x: number; y: number }) => {
    if (creatingNode.current) return;
    creatingNode.current = true;
    const canvas = canvasRef.current!,
      draft = creationDraft("Class", {
        x: (p.x - camera.current.x) / camera.current.zoom,
        y: (p.y - camera.current.y) / camera.current.zoom,
      }),
      names = new Set(state?.entities.map((e) => e.label ?? e.name));
    let name = "New class";
    for (let suffix = 2; names.has(name); suffix++)
      name = "New class " + suffix;
    setCreating(null);
    setContext(null);
    setBlankMenu(null);
    try {
      const iri = await request<string>("createClass", {
        name,
        parent: draft.parent,
        position: draft.position,
        datasetEpoch: draft.epoch,
      });
      if (canvas.isConnected && state?.datasetEpoch === draft.epoch)
        setPendingRename({ iri, name, epoch: draft.epoch });
    } catch (e) {
      report((e as Error).message, true);
    } finally {
      creatingNode.current = false;
    }
  };
  useEffect(() => {
    if (!pendingRename) return;
    const canvas = canvasRef.current!;
    if (snapshot?.datasetEpoch !== pendingRename.epoch) {
      setPendingRename(null);
      return;
    }
    if (
      !snapshot.entities.some((e) => e.iri === pendingRename.iri) ||
      !info?.nodes.some((n) => n.iri === pendingRename.iri)
    )
      return;
    if (
      canvas.ownerDocument.activeElement === canvas &&
      snapshot.selected === pendingRename.iri
    )
      setRenaming({
        iri: pendingRename.iri,
        name: pendingRename.name,
        keepNameIfEmpty: true,
      });
    setPendingRename(null);
  }, [pendingRename, snapshot, info]);
  useEffect(
    () =>
      onInlineRename(canvasRef.current!, () => {
        if (state?.activeGraphId && state.activeGraphId !== graphId) return;
        const e = state?.entities.find((e) => e.iri === state?.selected),
          n = graph?.nodes.find((n) => n.iri === e?.iri),
          canvas = canvasRef.current!;
        if (!e || !n) return;
        const p = screenPoint(n, camera.current);
        if (
          p.x < 100 ||
          p.x > canvas.clientWidth - 100 ||
          p.y < 30 ||
          p.y > canvas.clientHeight - 70
        ) {
          camera.current = {
            ...camera.current,
            x: canvas.clientWidth / 2 - n.x * camera.current.zoom,
            y: canvas.clientHeight / 2 - n.y * camera.current.zoom,
          };
          dirty.current = true;
          savePanel(cameraKey, camera.current);
        }
        setRenaming({ iri: e.iri, name: e.name });
      }),
    [],
  );
  useEffect(() => {
    if (!renaming) return;
    const win = canvasRef.current!.ownerDocument.defaultView!;
    let frame = 0;
    const place = () => {
      const el = renameHost.current,
        canvas = canvasRef.current,
        n = graph?.nodes.find((n) => n.iri === renaming.iri);
      if (!el || !canvas || !n) {
        setRenaming(null);
        return;
      }
      const width = Math.min(240, canvas.clientWidth - 16),
        p = screenPoint(n, camera.current);
      el.style.width = width + "px";
      el.style.left =
        Math.max(8, Math.min(canvas.clientWidth - width - 8, p.x - width / 2)) +
        "px";
      el.style.top =
        Math.max(
          8,
          Math.min(
            canvas.clientHeight - el.offsetHeight - 8,
            p.y +
              styledRadius(n, graph!.stylesheet, n.iri) * camera.current.zoom +
              4,
          ),
        ) + "px";
      frame = win.requestAnimationFrame(place);
    };
    place();
    return () => win.cancelAnimationFrame(frame);
  }, [renaming]);
  const [limitText, setLimitText] = useState(String(graph?.budget ?? 1000));
  useEffect(() => setLimitText(String(info?.budget ?? 1000)), [info?.budget]);
  const setLimit = async (value: number) => {
    try {
      await request("budget", { value });
      savePanel("graph.limit", value);
    } catch (e) {
      report((e as Error).message, true);
      setLimitText(String(graph?.budget ?? 1000));
    }
  };
  const fitNow = (record = false) => {
    const el = canvasRef.current;
    if (graph && el) {
      camera.current = fit(graph, el.clientWidth, el.clientHeight);
      dirty.current = true;
      savePanel(cameraKey, camera.current, record);
    }
  };
  const centerNow = () => {
    const el = canvasRef.current;
    if (!graph?.nodes.length || !el) return;
    const nodes = new Map(graph.nodes.map((n) => [n.iri, n]));
    const central =
      graph.focus.map((iri) => nodes.get(iri)).find((n) => n !== undefined) ??
      graph.nodes.reduce((best, n) =>
        n.shownDegree > best.shownDegree ? n : best,
      );
    camera.current = {
      ...camera.current,
      x: el.clientWidth / 2 - central.x * camera.current.zoom,
      y: el.clientHeight / 2 - central.y * camera.current.zoom,
    };
    dirty.current = true;
    savePanel(cameraKey, camera.current);
  };
  const exportGraph = (format = "png") => setExportDialog(format);
  useEffect(() => {
    const canvas = canvasRef.current!,
      win = canvas.ownerDocument.defaultView!,
      gl = canvas.getContext("webgl2", {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
      }),
      ctx = gl ? null : canvas.getContext("2d")!;
    let draw: Draw = gl ? new GpuDraw(gl, 1, 1) : new Draw(ctx, 1, 1),
      contextLost = false;
    canvas.dataset.backend = gl ? "webgl2" : "canvas2d";
    const lost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      report("Restoring the graph graphics context...");
    };
    const restored = () => {
      if (gl) {
        draw = new GpuDraw(gl, w, h);
        contextLost = false;
        dirty.current = true;
        report("Graph graphics context restored.");
      }
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    let raf = 0,
      w = 0,
      h = 0,
      last = 0,
      frameCount = 0,
      toolbarHeight: number | undefined;
    const samples: number[] = [];
    const paint = () => {
      raf = win.requestAnimationFrame(paint);
      if (
        contextLost ||
        !dirty.current ||
        !graph ||
        canvas.clientWidth < 1 ||
        canvas.clientHeight < 1
      )
        return;
      const start = performance.now(),
        ratio = win.devicePixelRatio || 1;
      width();
      const toolbar = canvas
          .closest(".graph-panel")
          ?.querySelector(":scope > .panel-toolbar"),
        nextToolbarHeight = toolbar?.getBoundingClientRect().height ?? 0;
      // Relationship choices and an external layout's cancel action can wrap
      // the toolbar. Keep a held node fixed in the window as well as the graph.
      if (
        toolbarHeight !== undefined &&
        nextToolbarHeight !== toolbarHeight &&
        graph.nodes.some((node) => node.layoutFixed) &&
        !needsFit.current
      ) {
        camera.current = {
          ...camera.current,
          y: camera.current.y + toolbarHeight - nextToolbarHeight,
        };
        savePanel(cameraKey, camera.current, false);
      }
      toolbarHeight = nextToolbarHeight;
      if (needsFit.current) {
        fitNow();
        needsFit.current = false;
      }
      draw.width = w;
      draw.height = h;
      if (draw instanceof GpuDraw) draw.beginFrame();
      else ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      labelRects.current.clear();
      render(
        draw,
        graph,
        camera.current,
        canvas.ownerDocument.documentElement.dataset.theme === "dark",
        spotlight.current ?? state?.selected ?? null,
        spotlight.current ? null : hover.current,
        900,
        {
          spotlight: spotlight.current ?? undefined,
          selectedEdge: graph.selectedEdge,
          hoveredEdge: hoveredEdge.current,
          onLabel: (iri, rect) => labelRects.current.set(iri, rect),
        },
      );
      canvas.dataset.spotlight = spotlight.current ?? "";
      if (draw instanceof GpuDraw) draw.endFrame();
      drawMini();
      dirty.current = false;
      samples.push(performance.now() - start);
      if (samples.length > 600) samples.shift();
      canvas.dispatchEvent(
        new CustomEvent("axiom:frame", {
          detail: {
            milliseconds: samples.at(-1),
            time: performance.now(),
          },
        }),
      );
      frameCount++;
      canvas.dataset.draws = String(frameCount);
      canvas.dataset.p95 = String(
        samples.slice().sort((a, b) => a - b)[
          Math.floor(samples.length * 0.95)
        ] ?? 0,
      );
      last = performance.now();
    };
    const width = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      const ratio = win.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(w * ratio) ||
        canvas.height !== Math.round(h * ratio)
      ) {
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
      }
    };
    const drawMini = () => {
      const mini = miniRef.current;
      if (!mini || !graph) return;
      const m = mini.getContext("2d")!,
        b = bounds(graph, 20),
        k = Math.min(144 / b.width, 94 / b.height),
        x = (150 - b.width * k) / 2 - b.x * k,
        y = (100 - b.height * k) / 2 - b.y * k;
      m.clearRect(0, 0, 150, 100);
      m.fillStyle = "#6cb8f6";
      for (const n of graph.nodes) {
        m.beginPath();
        m.arc(n.x * k + x, n.y * k + y, 1.4, 0, 2 * Math.PI);
        m.fill();
      }
      m.strokeStyle = "#d19a43";
      m.lineWidth = 1;
      m.strokeRect(
        (-camera.current.x / camera.current.zoom) * k + x,
        (-camera.current.y / camera.current.zoom) * k + y,
        (w / camera.current.zoom) * k,
        (h / camera.current.zoom) * k,
      );
    };
    const ro = new ResizeObserver(() => {
      dirty.current = true;
    });
    ro.observe(canvas);
    let metadata = graph,
      epoch = state?.datasetEpoch;
    const un = onGraph(() => {
      if (epoch !== state?.datasetEpoch) {
        epoch = state?.datasetEpoch;
        needsFit.current = true;
      }
      dirty.current = true;
      if (metadata !== graph) {
        metadata = graph;
        setInfo(graph);
      }
    });
    raf = win.requestAnimationFrame(paint);
    const theme = new MutationObserver(() => {
      dirty.current = true;
    });
    theme.observe(canvas.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const off = onCommand((id) => {
      if (id === "ui.restore:" + cameraKey) {
        camera.current = panel(cameraKey, camera.current);
        dirty.current = true;
      }
      if (id === "graph.fit" || id === "graph.fit.manual") {
        command("view.graph");
        win.requestAnimationFrame(() => fitNow(id === "graph.fit.manual"));
      }
      if (id === "graph.center") {
        command("view.graph");
        win.requestAnimationFrame(centerNow);
      }
      if (id.startsWith("graph.pan.")) {
        const dir = id.slice(10);
        camera.current = {
          ...camera.current,
          x:
            camera.current.x +
            (dir === "left" ? 40 : dir === "right" ? -40 : 0),
          y: camera.current.y + (dir === "up" ? 40 : dir === "down" ? -40 : 0),
        };
        dirty.current = true;
        savePanel(cameraKey, camera.current);
      }
      if (id.startsWith("graph.zoom.")) {
        camera.current = zoomAt(
          camera.current,
          { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
          id.endsWith(".out") ? 1 / 1.2 : 1.2,
        );
        dirty.current = true;
        savePanel(cameraKey, camera.current);
      }
      if (id === "graph.create") {
        command("view.graph");
        win.requestAnimationFrame(() => createAt("Class"));
      }
      if (id === "graph.connect") {
        command("view.graph");
        win.requestAnimationFrame(() =>
          beginConnection(state?.selected ?? undefined),
        );
      }
      if (id === "edge.edit") inspectEdge();
      if (id === "edge.remove" && graph?.selectedEdge)
        void removeEdge(graph.selectedEdge);
      if (id === "edge.resetRoute" && graph?.selectedEdge)
        void resetEdgeRoute(graph.selectedEdge);
      if (
        (id === "edge.next" || id === "edge.previous") &&
        graph?.edges.length &&
        graph.edgesVisible !== false
      ) {
        const index = graph.edges.findIndex(
          (e) => edgeKey(e) === graph?.selectedEdge,
        );
        const next =
          index < 0
            ? 0
            : (index + (id === "edge.next" ? 1 : -1) + graph.edges.length) %
              graph.edges.length;
        void act("selectEdge", { key: edgeKey(graph.edges[next]) });
        canvas.focus();
      }
      if (graph?.selectedEdge && id === "graph.expand") inspectEdge();
      if (graph?.selectedEdge && id === "graph.remove")
        void removeEdge(graph.selectedEdge);
      if (id === "graph.relayout" && graph)
        void act("layout", { mode: graph.choice });
      if (id.startsWith("graph.layout."))
        void act("layout", { mode: id.slice(13) }).then(() => fitNow());
      if (id === "graph.cancelLayout") void act("cancelLayout");
      if (id === "graph.freeze") void act("freeze");
      if (id === "graph.clear") void act("clear");
      if (
        [
          "graph.expand",
          "graph.collapse",
          "graph.pin",
          "graph.remove",
        ].includes(id) &&
        state?.selected
      )
        void act(id.slice(6) as "expand", { iri: state.selected });
      if (id === "graph.export") exportGraph();
      if (id === "graph.export.svg") void exportGraph("svg");
      if (id === "graph.export.png") void exportGraph("png");
    });
    return () => {
      win.cancelAnimationFrame(raf);
      if (draw instanceof GpuDraw) draw.dispose();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      ro.disconnect();
      theme.disconnect();
      un();
      off();
      savePanel(cameraKey, camera.current, false);
    };
  }, []);
  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hit = (p: { x: number; y: number }): GraphNode | undefined => {
    if (!graph) return;
    let best: GraphNode | undefined,
      dist = Infinity;
    for (const n of graph.nodes) {
      const s = screenPoint(n, camera.current),
        d = Math.hypot(p.x - s.x, p.y - s.y);
      if (
        d <=
          Math.max(
            9,
            styledRadius(n, graph.stylesheet, state?.selected) *
              camera.current.zoom +
              4,
          ) &&
        d < dist
      ) {
        best = n;
        dist = d;
      }
    }
    return best;
  };
  const hitLabel = (p: { x: number; y: number }) => {
    for (const [iri, rect] of labelRects.current)
      if (
        p.x >= rect.x &&
        p.x <= rect.x + rect.width &&
        p.y >= rect.y &&
        p.y <= rect.y + rect.height
      )
        return graph?.nodes.find((n) => n.iri === iri);
  };
  const drag = useRef<{
    node?: GraphNode;
    connect: boolean;
    label: boolean;
    epoch: number;
    x: number;
    y: number;
    cx: number;
    cy: number;
    moved: boolean;
    last: number;
  } | null>(null);
  const finishDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.node && d.moved && !d.connect)
      void act("drag", {
        iri: d.node.iri,
        x: d.node.x,
        y: d.node.y,
        dragging: false,
      });
    if (d?.connect) connectRef.current?.cancel();
    savePanel(cameraKey, camera.current);
  };
  const selected = state?.selected;
  const selection = graph?.nodes.find((n) => n.iri === selected);
  const instances = instanceAction(
    snapshot?.entities.find((e) => e.iri === selection?.iri),
  );
  const selectedEdge =
    graph?.edgesVisible === false
      ? undefined
      : graph?.edges.find((e) => edgeKey(e) === graph?.selectedEdge);
  const nodeNames = new Map(info?.nodes.map((n) => [n.iri, n.label]));
  return (
    <section
      className="panel graph-panel"
      aria-label="Graph panel"
      data-panel="graph"
      data-graph-id={graphId}
      onPointerDownCapture={() => {
        if ((snapshot?.activeGraphId ?? "graph") !== graphId)
          void act("graphActivate", { id: graphId });
      }}
      onFocusCapture={() => {
        if ((snapshot?.activeGraphId ?? "graph") !== graphId)
          void act("graphActivate", { id: graphId });
      }}
    >
      <div className="panel-toolbar">
        <button
          onClick={() => createAt("Class")}
          title="Add a class or instance at the graph center (Insert)"
        >
          Add entity
        </button>
        <button
          disabled={
            expandingMax ||
            !info?.nodes.length ||
            info.nodes.length >= info.budget ||
            info.hidden === 0
          }
          title="Expand all visible nodes breadth-first until the node limit is reached or no more connected nodes remain."
          onClick={async () => {
            if (expandingMax) return;
            setExpandingMax(true);
            try {
              await act("expandMax");
            } finally {
              setExpandingMax(false);
            }
          }}
        >
          {expandingMax ? "Expanding..." : "Expand max"}
        </button>
        <select
          aria-label="Select edge"
          title={
            info?.edgesVisible === false
              ? "Show edges to select a relationship"
              : "Select a relationship (E cycles edges)"
          }
          disabled={info?.edgesVisible === false}
          value={info?.selectedEdge ?? ""}
          onChange={(e) => {
            if (e.target.value) void act("selectEdge", { key: e.target.value });
          }}
        >
          <option value="">Select edge…</option>
          {info?.edges.map((e) => (
            <option key={edgeKey(e)} value={edgeKey(e)}>
              {nodeNames.get(e.source)} → {shorten(e.predicate)} →{" "}
              {nodeNames.get(e.target)}
            </option>
          ))}
        </select>
        <button
          onClick={centerNow}
          disabled={!info?.nodes.length}
          title="Center the view on the central node, keeping the current zoom"
        >
          Center
        </button>
        <button
          onClick={() => fitNow(true)}
          title={"Fit graph (" + keyHint("graph.fit") + ")"}
        >
          Fit
        </button>
        <button
          onClick={() => void act("layout", { mode: graph?.choice ?? "auto" })}
        >
          Relayout
        </button>
        <select
          aria-label="Graph layout"
          value={info?.choice ?? "auto"}
          onChange={(e) =>
            void act("layout", { mode: e.target.value }).then(() => fitNow())
          }
        >
          {layoutOptions.map((m) => (
            <option key={m.id} value={m.id} title={m.description}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          aria-pressed={info?.frozen ?? false}
          onClick={() => void act("freeze")}
        >
          {info?.frozen ? "Resume" : "Freeze"}
        </button>
        <button onClick={() => command("graph.appearance")}>Styles</button>
        {info?.layoutPending && (
          <button onClick={() => void act("cancelLayout")}>
            Cancel layout
          </button>
        )}
        <span className="toolbar-spacer" />
        <button
          disabled={!info?.nodes.length}
          onClick={() => void exportGraph()}
        >
          Export
        </button>
      </div>
      <div className="canvas-host">
        <canvas
          ref={canvasRef}
          aria-label={
            "Ontology graph, " +
            (info?.nodes.length ?? 0) +
            " nodes. Click a node before dragging to move it; drag from an unselected node to connect. Arrows select nodes and edges, E cycles edges, Alt+arrows pan, plus and minus zoom, Enter expands a node or edits an edge, Delete removes the selection, F fits."
          }
          role="listbox"
          aria-activedescendant={
            selectedEdge
              ? "graph-edge-option-" +
                info?.edges.findIndex(
                  (e) => edgeKey(e) === edgeKey(selectedEdge),
                )
              : info?.nodes.some((n) => n.iri === selected)
                ? "graph-option-" +
                  info.nodes.findIndex((n) => n.iri === selected)
                : undefined
          }
          tabIndex={0}
          data-testid="graph-canvas"
          data-selected-edge={info?.selectedEdge ?? ""}
          data-rename-iri={
            info?.nodes.some((n) => n.iri === selected) ? selected : undefined
          }
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            setContext(null);
            setEdgeContext(null);
            setBlankMenu(null);
            const p = point(e),
              body = hit(p),
              label = body ? undefined : hitLabel(p),
              node =
                reconnecting && graph
                  ? connectionTarget(
                      graph.nodes,
                      p,
                      camera.current,
                      graph.stylesheet,
                      undefined,
                      new Set(
                        state?.entities
                          .filter((e) => e.kind !== "Intersection")
                          .map((e) => e.iri),
                      ),
                      labelRects.current,
                    )
                  : (body ?? label);
            canvasRef.current!.focus();
            if (connectRef.current?.active()) {
              e.preventDefault();
              return;
            }
            if (reconnecting && node) {
              void applyReconnect(
                reconnecting.doc,
                reconnecting.endpoint,
                node,
              );
              return;
            }
            const edge =
              !node && graph
                ? nearestEdge(graph, p, camera.current)
                : undefined;
            if (edge) {
              void act("selectEdge", { key: edgeKey(edge) });
              return;
            }
            e.preventDefault();
            canvasRef.current!.setPointerCapture(e.pointerId);
            drag.current = {
              node,
              connect: !!node && state?.selected !== node.iri,
              label: !!label,
              epoch: state!.datasetEpoch,
              x: p.x,
              y: p.y,
              cx: camera.current.x,
              cy: camera.current.y,
              moved: false,
              last: 0,
            };
          }}
          onPointerMove={(e) => {
            const p = point(e),
              d = drag.current;
            if (connectRef.current?.active()) {
              connectRef.current.move(p);
              return;
            }
            if (d) {
              if (d.epoch !== state?.datasetEpoch) {
                drag.current = null;
                return;
              }
              d.moved ||= Math.hypot(p.x - d.x, p.y - d.y) > 3;
              if (!d.moved) return;
              if (d.node && d.connect) {
                if (
                  !state?.entities.some(
                    (n) => n.iri === d.node!.iri && n.kind !== "Intersection",
                  )
                ) {
                  report(
                    "Select a named ontology entity to create a relationship.",
                  );
                  drag.current = null;
                  return;
                }
                connectRef.current?.start(d.node.iri, { x: d.x, y: d.y });
                connectRef.current?.move(p);
                return;
              }
              if (d.node) {
                d.node.x = (p.x - camera.current.x) / camera.current.zoom;
                d.node.y = (p.y - camera.current.y) / camera.current.zoom;
                if (performance.now() - d.last > 20) {
                  d.last = performance.now();
                  void act("drag", {
                    iri: d.node.iri,
                    x: d.node.x,
                    y: d.node.y,
                    dragging: true,
                  });
                }
              } else
                camera.current = {
                  ...camera.current,
                  x: d.cx + p.x - d.x,
                  y: d.cy + p.y - d.y,
                };
              dirty.current = true;
            } else {
              const label = hitLabel(p),
                n = hit(p) ?? label,
                edge =
                  !n && graph
                    ? nearestEdge(graph, p, camera.current)
                    : undefined,
                edgeId = edge ? edgeKey(edge) : null;
              if (hoveredEdge.current !== edgeId) {
                hoveredEdge.current = edgeId;
                dirty.current = true;
              }
              if (hover.current !== n?.iri) {
                hover.current = n?.iri ?? null;
                dirty.current = true;
              }
              canvasRef.current!.title = n
                ? n.label +
                  " · " +
                  n.degree +
                  " neighbours. " +
                  (state?.selected === n.iri
                    ? "Drag to move."
                    : "Click to select; drag to connect.")
                : edge
                  ? edgeName(edge)
                  : "Click empty space to deselect.";
              canvasRef.current!.style.cursor = reconnecting
                ? "crosshair"
                : n
                  ? state?.selected === n.iri
                    ? "grab"
                    : "crosshair"
                  : edge
                    ? "pointer"
                    : "default";
            }
          }}
          onPointerLeave={() => {
            if (hover.current || hoveredEdge.current) {
              hover.current = null;
              hoveredEdge.current = null;
              dirty.current = true;
            }
            canvasRef.current!.title = "";
          }}
          onPointerCancel={() => {
            finishDrag();
            connectRef.current?.cancel();
          }}
          onLostPointerCapture={finishDrag}
          onPointerUp={(e) => {
            if (e.button !== 0) return;
            const d = drag.current;
            drag.current = null;
            if (connectRef.current?.active())
              connectRef.current.release(point(e));
            else if (d && d.epoch === state?.datasetEpoch) {
              if (d.node && d.moved && !d.connect)
                void act("drag", {
                  iri: d.node.iri,
                  x: d.node.x,
                  y: d.node.y,
                  dragging: false,
                });
              else if (!d.moved) {
                const selectedBefore = state?.selected;
                void request("select", { iri: d.node?.iri ?? null })
                  .then(() => {
                    if (
                      d.label &&
                      d.node &&
                      d.node.iri === selectedBefore &&
                      d.node.iri !== THING &&
                      state?.selected === d.node.iri &&
                      state.entities.some(
                        (e) =>
                          e.iri === d.node!.iri && e.kind !== "Intersection",
                      )
                    )
                      setRenaming({
                        iri: d.node.iri,
                        name: displayName(
                          state.entities.find((e) => e.iri === d.node!.iri)!,
                        ),
                      });
                  })
                  .catch((e) => report(e.message, true));
              }
            }
            if (canvasRef.current!.hasPointerCapture(e.pointerId))
              canvasRef.current!.releasePointerCapture(e.pointerId);
            savePanel(cameraKey, camera.current);
          }}
          onDoubleClick={(e) => {
            if (connectRef.current?.active()) return;
            const p = point(e),
              n = hitLabel(p) ?? hit(p);
            if (n?.kind === "Intersection") {
              void act("select", { iri: n.iri });
              return;
            }
            if (n)
              void act("select", { iri: n.iri }).then(() =>
                startInlineRename(n.iri, {
                  document: canvasRef.current!.ownerDocument,
                  panel: "graph",
                }),
              );
            else {
              const edge = graph
                ? nearestEdge(graph, p, camera.current)
                : undefined;
              if (edge)
                void act("selectEdge", { key: edgeKey(edge) }).then(
                  inspectEdge,
                );
              else void createAndRenameAt(p);
            }
          }}
          onWheel={(e) => {
            e.currentTarget.dataset.wheels = String(
              +(e.currentTarget.dataset.wheels ?? 0) + 1,
            );
            camera.current = zoomAt(
              camera.current,
              point(e),
              Math.exp(-e.deltaY * 0.0015),
            );
            dirty.current = true;
            savePanel(cameraKey, camera.current);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (connectRef.current?.active()) {
              drag.current = null;
              connectRef.current.cancel();
              return;
            }
            e.currentTarget.focus();
            const n = hitLabel(point(e)) ?? hit(point(e));
            if (n) {
              void act("select", { iri: n.iri });
              setContext({
                x: e.clientX,
                y: e.clientY,
                iri: n.iri,
              });
            } else {
              const edge = graph
                ? nearestEdge(graph, point(e), camera.current)
                : undefined;
              if (edge) {
                canvasRef.current!.focus();
                void act("selectEdge", { key: edgeKey(edge) });
                setEdgeContext({
                  key: edgeKey(edge),
                  x: e.clientX,
                  y: e.clientY,
                });
              } else
                setBlankMenu({ x: e.clientX, y: e.clientY, point: point(e) });
            }
          }}
          onKeyDown={(e) => {
            if (!graph) return;
            if (connectRef.current?.active()) {
              if (e.key === "Escape") drag.current = null;
              connectRef.current.key(e);
              return;
            }
            if (e.key === "Escape") {
              setReconnecting(null);
              setEdgeContext(null);
              void act("select", { iri: null });
              return;
            }
            if (
              (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) &&
              graph.selectedEdge
            ) {
              e.preventDefault();
              const edge = graph.edges.find(
                  (e) => edgeKey(e) === graph!.selectedEdge,
                )!,
                a = graph.nodes.find((n) => n.iri === edge.source)!,
                b = graph.nodes.find((n) => n.iri === edge.target)!,
                p = routeMiddle(
                  edgeRoute(edge, a, b, camera.current, graph.mode),
                ),
                r = canvasRef.current!.getBoundingClientRect();
              setEdgeContext({
                key: graph.selectedEdge,
                x: r.x + p.x,
                y: r.y + p.y,
              });
              return;
            }
            const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
            if (keys.includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
              const choices = [
                ...graph.nodes.map((n) => ({ iri: n.iri, key: "" })),
                ...(graph.edgesVisible === false ? [] : graph.edges).map(
                  (edge) => ({ iri: "", key: edgeKey(edge) }),
                ),
              ];
              const index = choices.findIndex((item) =>
                graph!.selectedEdge
                  ? item.key === graph!.selectedEdge
                  : item.iri === state?.selected,
              );
              const next =
                choices[
                  (Math.max(0, index) +
                    (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) +
                    choices.length) %
                    choices.length
                ];
              if (next)
                void act(
                  next.key ? "selectEdge" : "select",
                  next.key ? { key: next.key } : { iri: next.iri },
                );
            } else if (
              (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) &&
              state?.selected
            ) {
              e.preventDefault();
              const n = graph.nodes.find((n) => n.iri === state?.selected);
              if (n) {
                const p = screenPoint(n, camera.current),
                  r = e.currentTarget.getBoundingClientRect();
                setContext({ iri: n.iri, x: r.x + p.x, y: r.y + p.y });
              }
            } else if (e.key === "Escape") setContext(null);
          }}
        >
          {info?.nodes.map((n, i) => (
            <span
              key={n.iri}
              id={"graph-option-" + i}
              role="option"
              aria-selected={n.iri === selected}
            >
              {n.label}, {kindLabel(n.kind)}, {n.degree} neighbours
              {n.pinned ? ", pinned" : ""}
            </span>
          ))}
          {(info?.edgesVisible === false ? [] : info?.edges)?.map((edge, i) => (
            <span
              key={edgeKey(edge)}
              id={"graph-edge-option-" + i}
              role="option"
              aria-selected={edgeKey(edge) === info.selectedEdge}
            >
              {edgeName(edge)}, edge
            </span>
          ))}
        </canvas>
        {snapshot && (
          <GraphConnections
            canvas={canvasRef}
            camera={camera}
            labels={labelRects}
            controller={connectRef}
          />
        )}
        {selectedEdge && (
          <GraphEdgeHandles
            key={snapshot?.datasetEpoch + edgeKey(selectedEdge)}
            edgeId={edgeKey(selectedEdge)}
            canvas={canvasRef}
            camera={camera}
            dirty={dirty}
          />
        )}
        {creating && (
          <>
            {creating.anchorIri && (
              <svg className="graph-create-link" aria-hidden="true">
                <path ref={createLink} />
              </svg>
            )}
            <div
              className="graph-create"
              ref={createHost}
              data-anchor-iri={creating.anchorIri}
            >
              <InlineCreate
                draft={creating}
                dismissible
                close={closeCreation}
                getPosition={() =>
                  creating.anchorIri
                    ? positionBeside(creating.anchorIri)
                    : creating.position
                }
                onRelationshipChange={(kind, parent) =>
                  setCreating((current) =>
                    current
                      ? {
                          ...current,
                          anchorIri:
                            current.linked &&
                            (kind === "Class" || kind === "Individual") &&
                            graph?.nodes.some((n) => n.iri === parent)
                              ? parent
                              : undefined,
                        }
                      : null,
                  )
                }
              />
            </div>
          </>
        )}
        {renaming && (
          <div className="graph-inline-rename" ref={renameHost}>
            <InlineRenameInput
              key={renaming.iri}
              iri={renaming.iri}
              name={renaming.name}
              keepNameIfEmpty={renaming.keepNameIfEmpty}
              finish={(restore) => {
                setRenaming(null);
                if (restore) canvasRef.current?.focus();
              }}
            />
          </div>
        )}
        {!info?.nodes.length && (
          <div className="empty-canvas">
            <strong>The graph is empty</strong>
            <p>Choose a class in the hierarchy, then show it in the graph.</p>
            <button
              onClick={() =>
                void act("seed", {
                  iris: [
                    state?.ontology.example
                      ? NS_PIZZA
                      : "http://www.w3.org/2002/07/owl#Thing",
                  ],
                })
              }
            >
              Show {state?.ontology.example ? "Pizza" : "Thing"}
            </button>
          </div>
        )}
        <canvas
          ref={miniRef}
          width={150}
          height={100}
          className="minimap"
          aria-label="Graph minimap"
          onClick={(e) => {
            if (!graph) return;
            const b = bounds(graph, 20),
              k = Math.min(144 / b.width, 94 / b.height),
              r = e.currentTarget.getBoundingClientRect(),
              wx = (e.clientX - r.left - (150 - b.width * k) / 2) / k + b.x,
              wy = (e.clientY - r.top - (100 - b.height * k) / 2) / k + b.y;
            camera.current = {
              ...camera.current,
              x: canvasRef.current!.clientWidth / 2 - wx * camera.current.zoom,
              y: canvasRef.current!.clientHeight / 2 - wy * camera.current.zoom,
            };
            dirty.current = true;
            savePanel(cameraKey, camera.current);
          }}
        />
      </div>
      <div className="graph-footer">
        <label className="graph-edge-visibility">
          <input
            type="checkbox"
            checked={info?.edgesVisible !== false}
            onChange={(event) => {
              hoveredEdge.current = null;
              setEdgeContext(null);
              setReconnecting(null);
              void act("edgeVisibility", { visible: event.target.checked });
            }}
          />
          Show edges
        </label>
        <label title="Show the +N badges for neighbours not displayed in this graph.">
          <input
            type="checkbox"
            checked={info?.countsVisible !== false}
            onChange={(event) =>
              void act("countVisibility", { visible: event.target.checked })
            }
          />
          Show counts
        </label>
        <GraphSpacing
          value={info?.spacing ?? 1}
          epoch={snapshot.datasetEpoch}
        />
        <label>
          Visible node limit{" "}
          <input
            aria-label="Visible node limit slider"
            type="range"
            min="100"
            max={MAX_VISIBLE_NODES}
            step="1"
            value={info?.budget ?? 1000}
            onChange={(e) => void setLimit(+e.target.value)}
          />
          <input
            className="node-limit"
            type="number"
            aria-label="Visible node limit"
            min="100"
            max={MAX_VISIBLE_NODES}
            step="1"
            value={limitText}
            onChange={(e) => setLimitText(e.target.value)}
            onBlur={() => void setLimit(Number(limitText))}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.preventDefault();
                setLimitText(String(info?.budget ?? 1000));
              }
            }}
          />
          <output>
            {info?.nodes.length.toLocaleString("en-GB") ?? 0} /
            {info?.budget.toLocaleString("en-GB") ?? 1000} displayed
          </output>
        </label>
        <select
          aria-label="Eviction policy"
          value={info?.evictionMode ?? "degree"}
          onChange={(e) => void act("eviction", { mode: e.target.value })}
        >
          <option value="degree">Distant, low degree</option>
          <option value="lru">Least recently used</option>
          <option value="refuse">Refuse new nodes</option>
        </select>
        <span>
          {info?.mode} · {info?.edges.length.toLocaleString("en-GB")}{" "}
          relationships · {info?.hidden.toLocaleString("en-GB")} held back
        </span>
      </div>
      <div className="graph-selection" aria-live="polite">
        {selectedEdge ? (
          <>
            <strong>{edgeName(selectedEdge)}</strong>
            <button onClick={inspectEdge}>Details</button>
            <button onClick={() => void removeEdge(edgeKey(selectedEdge))}>
              Remove edge
            </button>
            <button
              disabled={!selectedEdge.bend}
              onClick={() => void resetEdgeRoute(edgeKey(selectedEdge))}
            >
              Reset route
            </button>
            {reconnecting && (
              <span>
                Click the new {reconnecting.endpoint} node. Escape cancels.
              </span>
            )}
          </>
        ) : selection ? (
          <>
            <strong>{selection.label}</strong>
            <button
              onClick={() => {
                revealInTaxonomy(selection.iri);
                canvasRef.current?.focus();
              }}
              disabled={
                !snapshot?.entities.some(
                  (e) =>
                    e.iri === selection.iri &&
                    (["Class", "Defined"].includes(e.kind) ||
                      e.kind.endsWith("Property")),
                )
              }
            >
              Find in taxonomy
            </button>
            <button onClick={() => command("research.open")}>Research</button>
            {instances.visible && (
              <button
                disabled={!instances.enabled}
                title={instances.title}
                onClick={() => showInstances(selection.iri)}
              >
                {instances.label}
              </button>
            )}
            <span>{selection.degree} neighbours</span>
            <button
              disabled={selection.degree === 0}
              onClick={() => void act("expand", { iri: selection.iri })}
            >
              Expand
            </button>
            <button
              disabled={selection.shownDegree === 0}
              onClick={() => void act("collapse", { iri: selection.iri })}
            >
              Collapse
            </button>
            <button
              aria-pressed={selection.pinned}
              onClick={() => void act("pin", { iri: selection.iri })}
            >
              {selection.pinned ? "Unpin" : "Pin"}
            </button>
          </>
        ) : (
          <span>
            Click a node to select it for moving. Drag from an unselected node
            to connect.
          </span>
        )}
      </div>
      {exportDialog && graph && (
        <ExportDialog
          graph={{ ...graph }}
          camera={{ ...camera.current }}
          size={{
            width: canvasRef.current!.clientWidth,
            height: canvasRef.current!.clientHeight,
          }}
          initialFormat={exportDialog}
          close={() => setExportDialog(null)}
        />
      )}
      {edgeContext && info?.edgesVisible !== false && (
        <ContextMenu
          document={canvasRef.current!.ownerDocument}
          x={edgeContext.x}
          y={edgeContext.y}
          label="Graph edge actions"
          close={() => setEdgeContext(null)}
          actions={[
            {
              label: "Details",
              key: "T",
              run: () => {
                setEdgeContext(null);
                inspectEdge();
              },
            },
            {
              label: "Reconnect source",
              key: "S",
              run: () => {
                const key = edgeContext.key;
                setEdgeContext(null);
                void reconnect(key, "source");
              },
            },
            {
              label: "Reconnect target",
              key: "T",
              run: () => {
                const key = edgeContext.key;
                setEdgeContext(null);
                void reconnect(key, "target");
              },
            },
            null,
            {
              label: "Reset route",
              key: "R",
              enabled: !!selectedEdge?.bend,
              run: () => {
                void resetEdgeRoute(edgeContext.key);
                setEdgeContext(null);
              },
            },
            null,
            {
              label: "Remove edge",
              key: "D",
              run: () => {
                void removeEdge(edgeContext.key);
                setEdgeContext(null);
              },
            },
          ]}
        />
      )}
      {blankMenu && (
        <ContextMenu
          document={canvasRef.current!.ownerDocument}
          x={blankMenu.x}
          y={blankMenu.y}
          label="Graph canvas actions"
          close={() => setBlankMenu(null)}
          actions={[
            {
              label: "New class here",
              key: "C",
              run: () => createAt("Class", blankMenu.point),
            },
            {
              label: "New instance here",
              key: "I",
              run: () => createAt("Individual", blankMenu.point),
            },
          ]}
        />
      )}
      {context && (
        <ContextMenu
          document={canvasRef.current?.ownerDocument ?? document}
          x={context.x}
          y={context.y}
          label="Graph node actions"
          close={() => setContext(null)}
          actions={[
            {
              label: graph?.nodes.find((n) => n.iri === context.iri)?.expanded
                ? "Collapse"
                : "Expand",
              key: graph?.nodes.find((n) => n.iri === context.iri)?.expanded
                ? "C"
                : "E",
              enabled: !!graph?.nodes.find((n) => n.iri === context.iri)
                ?.degree,
              run: () =>
                act(
                  graph?.nodes.find((n) => n.iri === context.iri)?.expanded
                    ? "collapse"
                    : "expand",
                  { iri: context.iri },
                ),
            },
            {
              label: "Hide",
              key: "H",
              run: () => act("remove", { iri: context.iri }),
            },
            {
              label: "Rename",
              key: "N",
              enabled:
                !!state?.entities.some(
                  (e) => e.iri === context.iri && e.kind !== "Intersection",
                ) && context.iri !== THING,
              run: () => {
                setContext(null);
                startInlineRename(context.iri, {
                  document: canvasRef.current!.ownerDocument,
                  panel: "graph",
                });
              },
            },
            {
              label: "Details",
              key: "T",
              enabled: !!state?.entities.some((e) => e.iri === context.iri),
              run: () => editEntity(context.iri),
            },
            {
              label: "Find in taxonomy",
              key: "F",
              enabled: !!snapshot?.entities.some(
                (e) =>
                  e.iri === context.iri &&
                  (["Class", "Defined"].includes(e.kind) ||
                    e.kind.endsWith("Property")),
              ),
              run: () => {
                const iri = context.iri;
                setContext(null);
                void request("select", { iri }).then(() => {
                  revealInTaxonomy(iri);
                  canvasRef.current?.focus();
                });
              },
            },
            null,
            {
              label: "Find similar",
              key: "M",
              run: () => {
                const iri = context.iri;
                const name =
                  graph?.nodes.find((n) => n.iri === iri)?.label ?? iri;
                setContext(null);
                openSimilar(name, iri);
              },
            },
            {
              label: "New instance",
              key: "W",
              visible: !!state?.entities.some(
                (e) =>
                  e.iri === context.iri &&
                  ["Class", "Defined"].includes(e.kind),
              ),
              run: () => createAt("Individual", undefined, context.iri),
            },
            {
              ...instanceAction(
                snapshot?.entities.find((e) => e.iri === context.iri),
              ),
              key: "O",
              run: () => showInstances(context.iri),
            },
            {
              label: "Suggest",
              key: "G",
              run: () => {},
              children: [
                {
                  label: "Add Children",
                  enabled: !!snapshot?.entities.some(
                    (e) =>
                      e.iri === context.iri &&
                      ["Class", "Defined"].includes(e.kind),
                  ),
                  key: "C",
                  run: () => openTaxonomy(context.iri, "children"),
                },
                {
                  label: "Add Parents",
                  enabled: !!snapshot?.entities.some(
                    (e) =>
                      e.iri === context.iri &&
                      ["Class", "Defined"].includes(e.kind),
                  ),
                  key: "P",
                  run: () => openTaxonomy(context.iri, "parents"),
                },
                {
                  label: "Find Synonyms",
                  key: "S",
                  enabled: !context.iri.startsWith("_:"),
                  run: () => openTaxonomy(context.iri, "synonyms"),
                },
                {
                  label: "Define New",
                  key: "N",
                  run: () => openTaxonomy(context.iri, "define"),
                },
              ],
            },
            {
              label: "Research...",
              key: "S",
              run: () => command("research.open"),
            },
            null,
            {
              label: "Pin in graph",
              key: "P",
              checked: !!graph?.nodes.find((n) => n.iri === context.iri)
                ?.pinned,
              run: () => act("pin", { iri: context.iri }),
            },
            {
              label: "Copy IRI",
              key: "I",
              run: () => window.axiom.copy(context.iri),
            },
          ]}
        />
      )}
    </section>
  );
}
const NS_PIZZA = "http://www.co-ode.org/ontologies/pizza/pizza.owl#Pizza";
