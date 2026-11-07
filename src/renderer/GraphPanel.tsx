import { openSimilar } from "./find-state";
import { openSparsity } from "./sparsity-view";
import { openTaxonomy } from "./taxonomy-view";
import { MAX_VISIBLE_NODES } from "../shared/graph-limits";
import { GraphSpacing } from "./GraphSpacing";
import { GraphClusters } from "./GraphClusters";
import { DEFAULT_CLUSTER_LOOSENESS } from "../shared/graph-clusters";
import { GraphScope, useGraphScope } from "./GraphScope";
import { revealInTaxonomy } from "./taxonomy-navigation";
import { clusterColorsAction, instanceAction } from "../shared/action-state";
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
import { keyHint, keyLabel } from "./keyboard";
import { SharedActionRow, type SharedMenuItem } from "./SharedPane";
import { evictionPolicies } from "../shared/commands";
import { styledRadius } from "../domain/graph-style";
import { layoutOptions } from "../shared/layout-options";
import { kindLabel } from "../domain/model";
import { GpuDraw } from "./GpuDraw";
import { useEffect, useId, useRef, useState } from "react";
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
import { NumberField } from "./NumberField";
import { handTool, onHandTool, setHandTool, useHandTool } from "./graph-hand";
/** Opens below the anchor, right-aligned, inside the window that owns it. */
function placeFlyout(popup: HTMLElement, anchor: HTMLElement | null) {
  const win = popup.ownerDocument.defaultView!,
    box = (anchor ?? popup.ownerDocument.body).getBoundingClientRect(),
    w = popup.offsetWidth,
    h = popup.offsetHeight;
  popup.style.left =
    Math.max(4, Math.min(box.right - w, win.innerWidth - w - 4)) + "px";
  popup.style.top =
    (box.bottom + 2 + h <= win.innerHeight - 4
      ? box.bottom + 2
      : Math.max(4, box.top - h - 2)) + "px";
}
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
  // craigtrim/axiom#189: with Hand on, a drag moves the node under it or the view; switching drops an unfinished edge.
  const hand = useHandTool();
  const reconnectRun = useRef(0);
  useEffect(
    () =>
      onHandTool(() => {
        if (connectRef.current?.active()) connectRef.current.cancel(false);
        reconnectRun.current++;
        setReconnecting(null);
      }),
    [],
  );
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
    const run = ++reconnectRun.current;
    try {
      const doc = await request<EdgeDocument>("edgeDocument", { key });
      if (run !== reconnectRun.current) return;
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
        // Issue 85: a closed shared popover must not suppress graph shortcuts.
        doc.querySelector(
          "dialog[open],[role=menu]:not([popover]),[role=menu]:popover-open",
        )
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
      // #165: the live graph proxy can advance ahead of this render's selection.
      // Wait for one coherent snapshot containing the newly placed node.
      !snapshot.graph.nodes.some((n) => n.iri === pendingRename.iri)
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
  }, [pendingRename, snapshot]);
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
  const setLimit = async (value: number) => {
    try {
      await request("budget", { value });
      savePanel("graph.limit", value);
    } catch (e) {
      report((e as Error).message, true);
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
  // The command row's two flyouts: display settings and the edge picker.
  const rowMore = useRef<HTMLButtonElement>(null),
    displayTrigger = useRef<HTMLButtonElement>(null),
    displayFlyout = useRef<HTMLDivElement>(null),
    edgeFlyout = useRef<HTMLDivElement>(null),
    edgeList = useRef<HTMLSelectElement>(null);
  const [displayOpen, setDisplayOpen] = useState(false),
    [edgePickerOpen, setEdgePickerOpen] = useState(false),
    [edgeFilter, setEdgeFilter] = useState("");
  const displayId = useId(),
    edgePickerId = useId();
  const openFlyout = (popup: HTMLElement | null) => {
    if (popup && !popup.matches(":popover-open")) popup.showPopover();
  };
  // An overflowed Display button is hidden, so its flyout opens under More.
  const displayAnchor = () => {
    const t = displayTrigger.current;
    return t && !t.closest('[data-overflowed="true"]') ? t : rowMore.current;
  };
  const closeEdgePicker = () => {
    edgeFlyout.current?.hidePopover();
    canvasRef.current?.focus();
  };
  const expanding = useRef(false);
  const expandToLimit = async () => {
    if (expanding.current) return;
    expanding.current = true;
    setExpandingMax(true);
    try {
      await act("expandMax");
    } finally {
      expanding.current = false;
      setExpandingMax(false);
    }
  };
  const showEdges = (visible: boolean) => {
    hoveredEdge.current = null;
    setEdgeContext(null);
    setReconnecting(null);
    void act("edgeVisibility", { visible });
  };
  const relayout = () => void act("layout", { mode: graph?.choice ?? "auto" });
  const chooseLayout = (mode: string) =>
    void act("layout", { mode }).then(() => fitNow());
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
          ?.querySelector(":scope > .graph-command-layer"),
        nextToolbarHeight = toolbar?.getBoundingClientRect().height ?? 0;
      // The command row does not wrap, but its height still follows zoom.
      // Keep a held node fixed in the window as well as the graph.
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
      // #123: the import checkpoint includes the rendered camera before idle ticks.
      if (
        id === "workspace.captureViews" &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0
      ) {
        if (needsFit.current) {
          fitNow();
          needsFit.current = false;
        } else savePanel(cameraKey, camera.current, false);
      }
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
      // Settings that once lived only in the toolbar and footer.
      if (id === "graph.expandToLimit") void expandToLimit();
      if (id === "graph.hand") setHandTool(!handTool());
      if (id === "graph.showEdges") showEdges(graph?.edgesVisible === false);
      if (id === "graph.showLabels")
        void act("labelVisibility", {
          visible: graph?.labelsVisible === false,
        });
      if (id === "graph.showCounts")
        void act("countVisibility", {
          visible: graph?.countsVisible === false,
        });
      if (id === "graph.clusterColors" && (graph?.clusterCount ?? 0) > 1)
        void act("clusterColors", { enabled: graph?.clusterColors !== true });
      if (id.startsWith("graph.eviction."))
        void act("eviction", { mode: id.slice(15) });
      if (id === "graph.display" || id === "graph.selectEdge") {
        command("view.graph");
        win.requestAnimationFrame(() =>
          openFlyout(
            id === "graph.display" ? displayFlyout.current : edgeFlyout.current,
          ),
        );
      }
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
    edge?: string;
    epoch: number;
    x: number;
    y: number;
    ox: number;
    oy: number;
    // The latest pointer position for the node; position broadcasts can rewind d.node mid-drag.
    wx: number;
    wy: number;
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
        x: d.wx,
        y: d.wy,
        dragging: false,
      });
    if (d?.connect) connectRef.current?.cancel();
    if (d && hand) canvasRef.current!.style.cursor = "grab";
    savePanel(cameraKey, camera.current);
  };
  const selected = state?.selected;
  const selectedEdge =
    graph?.edgesVisible === false
      ? undefined
      : graph?.edges.find((e) => edgeKey(e) === graph?.selectedEdge);
  const clusterAction = clusterColorsAction(info);
  const nodeNames = new Map(info?.nodes.map((n) => [n.iri, n.label]));
  // Detaching or returning a pane moves this component to another window
  // without remounting it, so both checks repeat on every render. Detached
  // panes have no status bar, so their row carries the node count.
  const ownerDocument = canvasRef.current?.ownerDocument;
  const detached = !!ownerDocument && ownerDocument !== document;
  useEffect(() => {
    // The move closes an open flyout without a toggle event.
    if (displayOpen && !displayFlyout.current?.matches(":popover-open"))
      setDisplayOpen(false);
    if (edgePickerOpen && !edgeFlyout.current?.matches(":popover-open"))
      setEdgePickerOpen(false);
  });
  const shown = info?.nodes.length ?? 0,
    budget = info?.budget ?? 1000;
  const expandDisabled =
    expandingMax || !shown || shown >= budget || info?.hidden === 0;
  const expandTitle =
    "Expand all visible nodes breadth-first until the node limit is reached or no more connected nodes remain.";
  const edgeReason =
    info?.edgesVisible === false
      ? "Show edges to select a relationship."
      : !info?.edges.length
        ? "The graph shows no relationships."
        : "Choose a relationship by name (" +
          keyLabel("edge.next") +
          " cycles edges on the canvas).";
  const rowState = reconnecting
    ? "Click the new " + reconnecting.endpoint + " node. Escape cancels."
    : detached
      ? shown.toLocaleString("en-GB") +
        " of " +
        budget.toLocaleString("en-GB") +
        " nodes"
      : undefined;
  const edgeChoices = edgePickerOpen
    ? (info?.edgesVisible === false ? [] : (info?.edges ?? []))
        .map((e) => ({
          key: edgeKey(e),
          name:
            nodeNames.get(e.source) +
            " → " +
            shorten(e.predicate) +
            " → " +
            nodeNames.get(e.target),
        }))
        .filter((e) =>
          e.name.toLowerCase().includes(edgeFilter.trim().toLowerCase()),
        )
    : [];
  // One row of chrome: view-level commands only; objects use their context menus.
  const rowCommands = [
    {
      id: "expand",
      priority: 7,
      content: (
        <button
          type="button"
          className="btn"
          disabled={expandDisabled}
          title={expandTitle}
          onClick={() => void expandToLimit()}
        >
          {expandingMax ? "Expanding..." : "Expand to limit"}
        </button>
      ),
      overflow: [
        {
          id: "expand",
          label: "Expand to limit",
          disabled: expandDisabled,
          reason: expandTitle,
          run: () => void expandToLimit(),
        },
      ],
    },
    {
      id: "hand",
      priority: 4,
      content: (
        <button
          type="button"
          className="btn graph-toggle graph-hand"
          data-native-activation
          aria-pressed={hand}
          title="Drag a node to move it, or drag anywhere else to move the view"
          onClick={() => setHandTool(!hand)}
        >
          Hand
        </button>
      ),
      overflow: [
        {
          id: "hand",
          label: "Hand",
          checkbox: true,
          checked: hand,
          run: () => setHandTool(!hand),
        },
      ],
    },
    {
      id: "fit",
      priority: 3,
      content: (
        <button
          type="button"
          className="btn"
          disabled={!shown}
          title={"Fit graph (" + keyLabel("graph.fit") + ")"}
          onClick={() => fitNow(true)}
        >
          Fit
        </button>
      ),
      overflow: [
        {
          id: "fit",
          label: "Fit graph",
          shortcut: keyLabel("graph.fit"),
          disabled: !shown,
          run: () => fitNow(true),
        },
      ],
    },
    {
      id: "center",
      priority: 8,
      content: (
        <button
          type="button"
          className="btn"
          disabled={!shown}
          title="Center the view on the central node, keeping the current zoom"
          onClick={centerNow}
        >
          Center
        </button>
      ),
      overflow: [
        {
          id: "center",
          label: "Center graph",
          disabled: !shown,
          run: centerNow,
        },
      ],
    },
    {
      id: "relayout",
      priority: 5,
      content: (
        <button
          type="button"
          className="btn"
          disabled={!shown}
          title={"Relayout (" + keyLabel("graph.relayout") + ")"}
          onClick={relayout}
        >
          Relayout
        </button>
      ),
      overflow: [
        {
          id: "relayout",
          label: "Relayout",
          shortcut: keyLabel("graph.relayout"),
          disabled: !shown,
          run: relayout,
        },
      ],
    },
    {
      id: "layout",
      priority: 6,
      content: (
        <select
          className="sel"
          aria-label="Graph layout"
          value={info?.choice ?? "auto"}
          onChange={(e) => chooseLayout(e.target.value)}
        >
          {layoutOptions.map((m) => (
            <option key={m.id} value={m.id} title={m.description}>
              {m.label}
            </option>
          ))}
        </select>
      ),
      overflow: layoutOptions.map((m) => ({
        id: "layout-" + m.id,
        label: m.label,
        radio: true,
        checked: (info?.choice ?? "auto") === m.id,
        run: () => chooseLayout(m.id),
      })),
    },
    {
      id: "freeze",
      priority: 6,
      content: (
        <button
          type="button"
          className="btn graph-toggle"
          aria-pressed={info?.frozen ?? false}
          disabled={!shown}
          title={"Freeze layout (" + keyLabel("graph.freeze") + ")"}
          onClick={() => void act("freeze")}
        >
          Freeze layout
        </button>
      ),
      overflow: [
        {
          id: "freeze",
          label: "Freeze layout",
          checkbox: true,
          checked: !!info?.frozen,
          shortcut: keyLabel("graph.freeze"),
          disabled: !shown,
          run: () => void act("freeze"),
        },
      ],
    },
    ...(info?.layoutPending
      ? [
          {
            id: "cancel",
            priority: 0,
            content: (
              <button
                type="button"
                className="btn"
                onClick={() => void act("cancelLayout")}
              >
                Cancel layout
              </button>
            ),
            overflow: [
              {
                id: "cancel",
                label: "Cancel running layout",
                run: () => void act("cancelLayout"),
              },
            ],
          },
        ]
      : []),
    {
      id: "display",
      priority: 1,
      content: (
        <button
          ref={displayTrigger}
          type="button"
          className="btn graph-dropdown"
          popoverTarget={displayId}
          aria-haspopup="dialog"
          aria-expanded={displayOpen}
          title="Edges, labels, counts, spacing and the visible node limit"
        >
          Display
          <svg
            className="od-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ),
      overflow: [
        {
          id: "display",
          label: "Display options",
          run: () => openFlyout(displayFlyout.current),
        },
      ],
    },
    {
      id: "export",
      priority: 2,
      content: (
        <button
          type="button"
          className="btn"
          disabled={!shown}
          title={"Export (" + keyLabel("graph.export") + ")"}
          onClick={() => void exportGraph()}
        >
          Export
        </button>
      ),
      overflow: [
        {
          id: "export",
          label: "Export...",
          shortcut: keyLabel("graph.export"),
          disabled: !shown,
          run: () => exportGraph(),
        },
      ],
    },
  ];
  const rowItems: SharedMenuItem[] = [
    {
      id: "select-edge",
      label: "Select edge...",
      disabled: info?.edgesVisible === false || !info?.edges.length,
      reason: edgeReason,
      run: () => openFlyout(edgeFlyout.current),
    },
    { id: "style-separator", separator: true },
    {
      id: "appearance",
      label: "Graph appearance...",
      run: () => command("graph.appearance"),
    },
    {
      id: "stylesheet",
      label: "Graph stylesheet...",
      run: () => command("graph.styles"),
    },
    { id: "clear-separator", separator: true },
    {
      id: "clear",
      label: "Clear graph",
      disabled: !shown,
      run: () => void act("clear"),
    },
  ];
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
      <div className="shared-layer graph-command-layer">
        <SharedActionRow
          label="Graph actions"
          moreRef={rowMore}
          primary={
            <button
              type="button"
              className="btn"
              title={
                "Add a class or instance at the graph center (" +
                keyLabel("graph.create") +
                ")"
              }
              onClick={() => createAt("Class")}
            >
              Add entity
            </button>
          }
          state={rowState}
          commands={rowCommands}
          items={rowItems}
          separateOverflow
        />
      </div>
      <div className="canvas-host">
        <canvas
          ref={canvasRef}
          aria-label={
            "Ontology graph, " +
            (info?.nodes.length ?? 0) +
            " nodes. " +
            (hand
              ? "Hand tool on: drag a node to move it; drag anywhere else to move the view."
              : "Click a node before dragging to move it; drag from an unselected node to connect.") +
            " Arrows select nodes and edges, E cycles edges, Alt+arrows pan, plus and minus zoom, Enter expands a node or edits an edge, Delete removes the selection, F fits."
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
                  : undefined,
              panFromEdge = hand && !reconnecting;
            if (edge && !panFromEdge) {
              void act("selectEdge", { key: edgeKey(edge) });
              return;
            }
            e.preventDefault();
            canvasRef.current!.setPointerCapture(e.pointerId);
            if (hand) canvasRef.current!.style.cursor = "grabbing";
            const world = {
              x: (p.x - camera.current.x) / camera.current.zoom,
              y: (p.y - camera.current.y) / camera.current.zoom,
            };
            drag.current = {
              node,
              connect: !hand && !!node && state?.selected !== node.iri,
              label: !!label,
              edge: edge ? edgeKey(edge) : undefined,
              epoch: state!.datasetEpoch,
              x: p.x,
              y: p.y,
              ox: node ? node.x - world.x : 0,
              oy: node ? node.y - world.y : 0,
              wx: node?.x ?? 0,
              wy: node?.y ?? 0,
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
              if (hand) canvasRef.current!.style.cursor = "crosshair";
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
                d.wx = (p.x - camera.current.x) / camera.current.zoom + d.ox;
                d.wy = (p.y - camera.current.y) / camera.current.zoom + d.oy;
                d.node.x = d.wx;
                d.node.y = d.wy;
                if (performance.now() - d.last > 20) {
                  d.last = performance.now();
                  void act("drag", {
                    iri: d.node.iri,
                    x: d.wx,
                    y: d.wy,
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
                  " neighbors. " +
                  (hand || state?.selected === n.iri
                    ? "Drag to move."
                    : "Click to select; drag to connect.")
                : edge
                  ? edgeName(edge)
                  : hand
                    ? "Drag to move the view. Click empty space to deselect."
                    : "Click empty space to deselect.";
              canvasRef.current!.style.cursor = reconnecting
                ? "crosshair"
                : hand
                  ? "grab"
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
                  x: d.wx,
                  y: d.wy,
                  dragging: false,
                });
              else if (!d.moved && d.edge)
                void act("selectEdge", { key: d.edge });
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
            if (d && hand) canvasRef.current!.style.cursor = "grab";
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
              e.key === "ContextMenu" ||
              (e.shiftKey && e.key === "F10")
            ) {
              e.preventDefault();
              const n = graph.nodes.find((n) => n.iri === state?.selected),
                r = e.currentTarget.getBoundingClientRect();
              if (n) {
                const p = screenPoint(n, camera.current);
                setContext({ iri: n.iri, x: r.x + p.x, y: r.y + p.y });
                // With nothing selected, the menu belongs to the canvas, opened at its center.
              } else if (!state?.selected) {
                const p = { x: r.width / 2, y: r.height / 2 };
                setBlankMenu({ x: r.x + p.x, y: r.y + p.y, point: p });
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
              {n.label}, {kindLabel(n.kind)}, {n.degree} neighbors
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
      {/* Display settings: the controls the footer used to hold, one click away. */}
      <div
        ref={displayFlyout}
        id={displayId}
        popover="auto"
        role="dialog"
        aria-label="Display options"
        className="shared-layer graph-flyout graph-display"
        onToggle={(event) => {
          const open = event.newState === "open";
          setDisplayOpen(open);
          if (open) {
            placeFlyout(event.currentTarget, displayAnchor());
            event.currentTarget.querySelector<HTMLElement>("input")?.focus();
          }
        }}
      >
        <label className="graph-flyout-check graph-edge-visibility">
          <input
            type="checkbox"
            checked={info?.edgesVisible !== false}
            onChange={(event) => showEdges(event.target.checked)}
          />
          Show edges
        </label>
        {/* craigtrim/axiom#187: hides the name under every node; nodes keep their places. */}
        <label
          className="graph-flyout-check"
          title="Show the name under each node."
        >
          <input
            type="checkbox"
            checked={info?.labelsVisible !== false}
            onChange={(event) =>
              void act("labelVisibility", { visible: event.target.checked })
            }
          />
          Show labels
        </label>
        <label
          className="graph-flyout-check"
          title="Show the +N badges for neighbors not displayed in this graph."
        >
          <input
            type="checkbox"
            checked={info?.countsVisible !== false}
            onChange={(event) =>
              void act("countVisibility", { visible: event.target.checked })
            }
          />
          Show counts
        </label>
        {/* craigtrim/axiom#200: always shown, disabled with its reason below two clusters (#185). */}
        <label
          className="graph-flyout-check graph-cluster-colors"
          title={clusterAction.title}
        >
          <input
            type="checkbox"
            title={clusterAction.title}
            disabled={!clusterAction.enabled}
            checked={info?.clusterColors === true}
            onChange={(event) =>
              void act("clusterColors", { enabled: event.target.checked })
            }
          />
          Color clusters
        </label>
        {/* craigtrim/axiom#205: the setting remains available while colors are off. */}
        <GraphClusters
          value={info?.clusterLooseness ?? DEFAULT_CLUSTER_LOOSENESS}
          epoch={snapshot.datasetEpoch}
          disabled={!info?.nodes.length}
        />
        <div className="graph-flyout-sep" role="separator" />
        <GraphSpacing
          value={info?.spacing ?? 1}
          epoch={snapshot.datasetEpoch}
        />
        <label className="graph-flyout-field graph-node-limit">
          <span>Visible node limit</span>
          <span className="graph-flyout-controls">
            <input
              aria-label="Visible node limit slider"
              type="range"
              min="100"
              max={MAX_VISIBLE_NODES}
              step="1"
              value={budget}
              onChange={(e) => void setLimit(+e.target.value)}
            />
            <NumberField
              key={snapshot.datasetEpoch + ":" + graphId}
              className="node-limit fld"
              aria-label="Visible node limit"
              min={100}
              max={MAX_VISIBLE_NODES}
              integer
              value={budget}
              change={(value) => void setLimit(value)}
            />
          </span>
          <output>
            {shown.toLocaleString("en-GB")} of {budget.toLocaleString("en-GB")}{" "}
            displayed
          </output>
        </label>
        <label className="graph-flyout-field">
          <span>Eviction policy</span>
          <select
            className="sel"
            aria-label="Eviction policy"
            value={info?.evictionMode ?? "degree"}
            onChange={(e) => void act("eviction", { mode: e.target.value })}
          >
            {evictionPolicies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* Choosing a relationship by name; arrows and E stay the canvas keyboard path. */}
      <div
        ref={edgeFlyout}
        id={edgePickerId}
        popover="auto"
        role="dialog"
        aria-label="Select edge"
        className="shared-layer graph-flyout graph-edge-picker"
        onToggle={(event) => {
          const open = event.newState === "open";
          setEdgePickerOpen(open);
          if (open) {
            setEdgeFilter("");
            placeFlyout(event.currentTarget, rowMore.current);
            event.currentTarget.querySelector<HTMLElement>("input")?.focus();
          }
        }}
      >
        <label className="graph-flyout-field">
          <span>Filter</span>
          <input
            className="fld"
            type="search"
            aria-label="Filter edges"
            value={edgeFilter}
            onChange={(e) => setEdgeFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                edgeList.current?.focus();
              }
            }}
          />
        </label>
        <select
          ref={edgeList}
          className="graph-edge-list"
          size={10}
          aria-label="Edges"
          value={info?.selectedEdge ?? ""}
          onChange={(e) => {
            if (e.target.value) void act("selectEdge", { key: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              closeEdgePicker();
            }
          }}
        >
          {edgeChoices.slice(0, 500).map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}
            </option>
          ))}
        </select>
        <output className="graph-flyout-note">
          {edgeChoices.length > 500
            ? "First 500 of " +
              edgeChoices.length.toLocaleString("en-GB") +
              " matches. Type to narrow."
            : edgeChoices.length.toLocaleString("en-GB") +
              (edgeChoices.length === 1 ? " relationship" : " relationships")}
        </output>
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
              default: true,
              accelerator: keyLabel("graph.expand"),
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
              key: "G",
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
              key: "M",
              accelerator: keyLabel("graph.remove"),
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
          // The canvas is the graph view itself, so its menu holds the view commands.
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
            null,
            {
              label: "Fit graph",
              key: "F",
              accelerator: keyLabel("graph.fit"),
              enabled: !!shown,
              run: () => fitNow(true),
            },
            {
              label: "Center graph",
              key: "T",
              enabled: !!shown,
              run: centerNow,
            },
            {
              label: "Relayout",
              key: "R",
              accelerator: keyLabel("graph.relayout"),
              enabled: !!shown,
              run: relayout,
            },
            {
              label: "Freeze layout",
              key: "Z",
              accelerator: keyLabel("graph.freeze"),
              enabled: !!shown,
              checked: !!info?.frozen,
              run: () => act("freeze"),
            },
            null,
            {
              label: "Show",
              key: "W",
              run: () => {},
              children: [
                {
                  label: "Show edges",
                  key: "E",
                  checked: info?.edgesVisible !== false,
                  run: () => showEdges(info?.edgesVisible === false),
                },
                {
                  label: "Show labels",
                  key: "L",
                  checked: info?.labelsVisible !== false,
                  run: () =>
                    act("labelVisibility", {
                      visible: info?.labelsVisible === false,
                    }),
                },
                {
                  label: "Show counts",
                  key: "C",
                  checked: info?.countsVisible !== false,
                  run: () =>
                    act("countVisibility", {
                      visible: info?.countsVisible === false,
                    }),
                },
                {
                  label: "Color clusters",
                  key: "R",
                  title: clusterAction.title,
                  enabled: clusterAction.enabled,
                  checked: info?.clusterColors === true,
                  run: () =>
                    act("clusterColors", {
                      enabled: info?.clusterColors !== true,
                    }),
                },
              ],
            },
            {
              label: "Display options",
              key: "D",
              // Through the command, so the flyout opens after the menu returns focus.
              run: () => command("graph.display"),
            },
            null,
            {
              label: "Export...",
              key: "X",
              accelerator: keyLabel("graph.export"),
              enabled: !!shown,
              run: () => exportGraph(),
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
              default: true,
              accelerator: keyLabel(
                graph?.nodes.find((n) => n.iri === context.iri)?.expanded
                  ? "graph.collapse"
                  : "graph.expand",
              ),
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
              accelerator: keyLabel("graph.remove"),
              run: () => act("remove", { iri: context.iri }),
            },
            {
              label: "Rename",
              key: "N",
              accelerator: keyLabel("entity.rename"),
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
              accelerator: keyLabel("entity.edit"),
              enabled: !!state?.entities.some((e) => e.iri === context.iri),
              run: () => editEntity(context.iri),
            },
            {
              label: "Show in Hierarchy",
              key: "Y",
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
            null,
            {
              label: "Analyze",
              key: "A",
              visible: !!snapshot?.entities.some(
                (e) =>
                  e.iri === context.iri &&
                  ["Class", "Defined"].includes(e.kind),
              ),
              run: () => {},
              children: [
                {
                  label: "Sparsity",
                  key: "S",
                  enabled: !context.iri.startsWith("_:"),
                  run: () => openSparsity(context.iri),
                },
              ],
            },
            {
              label: "Find",
              key: "F",
              run: () => {},
              children: [
                {
                  label: "Similar",
                  key: "S",
                  run: () => {
                    const iri = context.iri;
                    const name =
                      graph?.nodes.find((n) => n.iri === iri)?.label ?? iri;
                    setContext(null);
                    openSimilar(name, iri);
                  },
                },
                {
                  label: "Synonyms",
                  key: "Y",
                  enabled: !context.iri.startsWith("_:"),
                  run: () => openTaxonomy(context.iri, "synonyms"),
                },
                {
                  label: "Touchpoints",
                  key: "T",
                  enabled: !context.iri.startsWith("_:"),
                  run: () => {
                    const iri = context.iri;
                    setContext(null);
                    void request("select", { iri }).then(() =>
                      command("touchpoints.open"),
                    );
                  },
                },
              ],
            },
            {
              label: "Suggest",
              key: "G",
              run: () => {},
              children: [
                {
                  label: "Add children",
                  enabled: !!snapshot?.entities.some(
                    (e) =>
                      e.iri === context.iri &&
                      ["Class", "Defined"].includes(e.kind),
                  ),
                  key: "C",
                  run: () => openTaxonomy(context.iri, "children"),
                },
                {
                  label: "Add parents",
                  enabled: !!snapshot?.entities.some(
                    (e) =>
                      e.iri === context.iri &&
                      ["Class", "Defined"].includes(e.kind),
                  ),
                  key: "P",
                  run: () => openTaxonomy(context.iri, "parents"),
                },
                {
                  label: "Define new",
                  key: "N",
                  run: () => openTaxonomy(context.iri, "define"),
                },
              ],
            },
            null,
            {
              label: "Pin in graph",
              key: "P",
              accelerator: keyLabel("graph.pin"),
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
