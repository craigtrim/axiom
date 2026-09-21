import {
  TabHistoryPanel,
  TabHistorySettings,
  RenameTabDialog,
} from "./TabHistoryPanel";
import {
  captureTab,
  ensureTabMetadata,
  syncTabHistory,
  renameTab,
  tabHistory,
  restoreTabState,
  notifyTabHistory,
} from "./tab-history";
import { emptyTabHistory, type SavedTab } from "../shared/tab-history";
import { ContextMenu } from "./ContextMenu";
import { setState } from "./client";
import type { Snapshot } from "../shared/protocol";
import { SparsityPanel } from "./SparsityPanel";
import { captureWorkspaceDrafts } from "./workspace-drafts";
import { syncFindEpoch } from "./find-state";
import { FindDialog, FindPanel } from "./FindPanel";
import { WindowChrome } from "./WindowChrome";
import { ErrorLogPanel } from "./ErrorLogPanel";
import { ErrorDetailsButton } from "./ErrorNotice";
import { selectAudit } from "./audit-state";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { openTaxonomy, suggestionStarts } from "./taxonomy-view";
import { instanceAction } from "../shared/action-state";
import { showInstances } from "./instance-report";
import {
  AssistantTabActivity,
  useAssistantActivityPolling,
} from "./AssistantActivity";
import { AdaptivePane } from "./AdaptivePane";
import { syncEditorEpoch } from "./editor-drafts";
import { graphQueryResults } from "./query-results";
import {
  queryResultId,
  type QueryResultDocument,
} from "../shared/query-history";
import { flushQueryHistory, historyState } from "./query-history";
import { beginCreation, takeEditorIri } from "./authoring";
import { ProvenancePanel } from "./ProvenancePanel";
import { DetailsPanel } from "./EntityEditor";
import { startInlineRename } from "./InlineRename";
import { StylesDialog } from "./StylesDialog";
import { ResearchPanel } from "./ResearchPanel";
import { layoutOptions } from "../shared/layout-options";
import { commandDefinitions } from "../shared/commands";
import { shortcutText } from "../shared/shortcuts";
import { installKeyboard, keyHint } from "./keyboard";
import { KeyboardDialog } from "./KeyboardDialog";
import { KeyboardHelp } from "./KeyboardHelp";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  Layout,
  Model,
  Actions,
  DockLocation,
  TabNode,
  TabSetNode,
  RowNode,
  Orientation,
  type IJsonModel,
} from "flexlayout-react";
import { GraphPanel } from "./GraphPanel";
import { HierarchyPanel } from "./HierarchyPanel";
import { InspectorPanel } from "./InspectorPanel";
import { IndividualsPanel } from "./IndividualsPanel";
const SourcePanel = lazy(() =>
  import("./SourcePanel").then((m) => ({ default: m.SourcePanel })),
);
const QueryResultsPanel = lazy(() =>
  import("./QueryResultsPanel").then((m) => ({ default: m.QueryResultsPanel })),
);
const QueryPanel = lazy(() =>
  import("./QueryPanel").then((m) => ({ default: m.QueryPanel })),
);
import { EditDialog, Modal, Palette, type EntityDialog } from "./Dialogs";
import {
  useSnapshot,
  state,
  useNotice,
  preferences,
  persist,
  savePanel,
  onCommand,
  command,
  act,
  request,
  report,
  setPreferences,
  queueQuery,
  queueResearchCommand,
  workbenchDocuments,
  focusedDocument,
  rememberDocument,
  recordUiChange,
  flushUiHistory,
} from "./client";
import examples from "../domain/data/examples.json";
import tokens from "../domain/data/tokens.json";
const names: Record<string, string> = {
  hierarchy: "Hierarchy",
  graph: "Graph",
  inspector: "Inspector",
  details: "Details",
  individuals: "Individuals",
  query: "Query",
  research: "Research",
  taxonomy: "Suggestions",
  errorlog: "Error log",
  find: "Find",
  tabhistory: "Tab History",
  sparsity: "Sparsity",
  provenance: "Filesystem provenance",
  source: "Source",
};
const tab = (id: string) => ({
  type: "tab" as const,
  id,
  component: id.startsWith("graph:")
    ? "graph"
    : id.startsWith("taxonomy:")
      ? "taxonomy"
      : id,
  name: id.startsWith("graph:")
    ? "Graph " + (Object.keys(state?.graphs ?? {}).indexOf(id) + 1)
    : id.startsWith("taxonomy:")
      ? "Suggestions"
      : names[id],
});

export function defaultLayout(
  profile: "standard" | "wide" = "standard",
): IJsonModel {
  const top = {
    type: "row" as const,
    id: "upper",
    weight: profile === "wide" ? 58 : 60,
    children: [
      {
        type: "tabset" as const,
        id: "hierarchy-group",
        weight: profile === "wide" ? 16 : 21,
        children: [tab("hierarchy")],
      },
      {
        type: "tabset" as const,
        id: "graph-group",
        weight: profile === "wide" ? 66 : 57,
        active: true,
        children: [
          tab(
            state?.graphs && !state.graphs.graph
              ? (state.activeGraphId ?? "graph")
              : "graph",
          ),
        ],
      },
      {
        type: "tabset" as const,
        id: "inspector-group",
        weight: profile === "wide" ? 18 : 22,
        children: [tab("inspector"), tab("research")],
      },
    ],
  };
  return {
    global: {
      rootOrientationVertical: true,
      tabEnableFloat: true,
      tabEnableFloatIcon: false,
      tabEnablePopout: true,
      tabEnablePopoutIcon: true,
      tabEnablePin: true,
      tabEnableRename: true,
      tabEnableClose: true,
      tabEnableScrollbars: false,
      tabSetMinWidth: 180,
      tabSetMinHeight: 120,
    },
    layout: {
      type: "row",
      id: "root",
      children: [
        top,
        profile === "wide"
          ? {
              type: "row",
              id: "lower",
              weight: 42,
              children: [
                {
                  type: "tabset",
                  id: "individuals-group",
                  weight: 60,
                  children: [tab("individuals")],
                },
                {
                  type: "tabset",
                  id: "query-group",
                  weight: 40,
                  children: [tab("query")],
                },
              ],
            }
          : {
              type: "tabset",
              id: "data-group",
              weight: 40,
              children: [tab("individuals"), tab("query")],
            },
      ],
    },
  };
}
export const screenProfile = (
  width = window.innerWidth,
  height = window.innerHeight,
): "standard" | "wide" =>
  width >= 1600 && width / height >= 1.7 ? "wide" : "standard";
export function restoreLayout(value: unknown): Model {
  try {
    if (!value)
      return Model.fromJson(
        defaultLayout(
          preferences.arrangement === "wide"
            ? "wide"
            : preferences.arrangement === "standard"
              ? "standard"
              : screenProfile(),
        ),
      );
    const v = structuredClone(value) as IJsonModel;
    v.global = { ...v.global, tabEnableRename: true };
    if (!v.layout || JSON.stringify(v).length > 100000) throw Error();
    const model = Model.fromJson(v),
      seen = new Set<string>(),
      details: TabNode[] = [],
      staleGraphs: TabNode[] = [];
    model.visitNodes((n) => {
      if (n instanceof TabNode) {
        const id = n.getComponent() ?? "";
        if (id === "entity") {
          if (typeof n.getConfig()?.iri !== "string") throw Error();
          details.push(n);
          return;
        }
        if (id === "details") {
          details.push(n);
          return;
        }
        if (id === "queryResults") {
          if (
            typeof n.getConfig()?.resultId !== "string" ||
            n.getConfig().resultId.length > 100
          )
            throw Error();
          return;
        }
        if (id === "graph" && /^graph(?::[a-zA-Z0-9-]+)?$/.test(n.getId())) {
          if (
            state?.graphs &&
            !state.graphs[n.getId()] &&
            n.getId() !== "graph"
          )
            staleGraphs.push(n);
          return;
        }
        if (
          id === "taxonomy" &&
          /^taxonomy(?::[a-f0-9-]{36})?$/.test(n.getId())
        )
          return;
        if (!names[id] || seen.has(id)) throw Error();
        seen.add(id);
      }
    });
    for (const n of staleGraphs) model.doAction(Actions.deleteTab(n.getId()));
    // Older workspaces kept a separate tab for each entity. Reuse their first
    // location for the selection-following Details pane.
    const retained = details.find((n) => n.getId() === "details") ?? details[0];
    for (const n of details) {
      if (n === retained)
        model.doAction(
          Actions.updateNodeAttributes(n.getId(), {
            component: "details",
            name: n.getComponent() === "entity" ? "Details" : n.getName(),
            config: n.getComponent() === "entity" ? {} : n.getConfig(),
          }),
        );
      else model.doAction(Actions.deleteTab(n.getId()));
    }
    return model;
  } catch {
    report(
      "The saved pane layout could not be read. Restored the default layout.",
      true,
    );
    return Model.fromJson(defaultLayout());
  }
}
function rearrangedLayout(profile: "standard" | "wide", previous: Model) {
  const next = Model.fromJson(defaultLayout(profile));
  const target = next.getNodeById(
    profile === "wide" ? "individuals-group" : "graph-group",
  )!;
  previous.visitNodes((n) => {
    if (!(n instanceof TabNode)) return;
    const existing = next.getNodeById(n.getId());
    if (existing)
      next.doAction(
        Actions.updateNodeAttributes(n.getId(), {
          name: n.getName(),
          config: n.getConfig(),
        }),
      );
    else
      next.doAction(
        Actions.addTab(
          n.toJson(),
          target.getId(),
          DockLocation.CENTER,
          -1,
          false,
        ),
      );
  });
  return next;
}
function widthRow(node: TabNode) {
  let branch = node.getParent();
  while (branch) {
    const row = branch.getParent();
    if (
      row instanceof RowNode &&
      row.getOrientation() === Orientation.HORZ &&
      row.getChildren().length > 1
    )
      return { row, branch };
    branch = row;
  }
  return undefined;
}
const documents = workbenchDocuments;
export function applyTheme(doc: Document = document) {
  const dark =
      preferences.theme === "dark" ||
      (preferences.theme === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches),
    root = doc.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  root.className = dark ? "flexlayout__theme_dark" : "flexlayout__theme_light";
  for (const [k, v] of Object.entries({
    ...tokens.base,
    ...tokens[dark ? "dark" : "light"],
  }))
    root.style.setProperty("--" + k, v);
}
export function App() {
  useAssistantActivityPolling();
  const items = commandDefinitions.map((c) => {
    const action =
      c.id === "entity.showInstances"
        ? instanceAction(state?.entities.find((e) => e.iri === state?.selected))
        : undefined;
    return {
      id: c.id,
      label: c.group + ": " + (action?.label ?? c.label),
      enabled:
        action?.enabled ??
        (c.id === "graph.expand"
          ? !!state?.graph.nodes.find((n) => n.iri === state?.selected)
              ?.degree || !!state?.graph.selectedEdge
          : c.id === "graph.collapse"
            ? !!state?.graph.nodes.find((n) => n.iri === state?.selected)
                ?.shownDegree
            : undefined),
      title: action?.title,
      shortcut: shortcutText(c.id, preferences.keyboard),
    };
  });
  const s = useSnapshot()!,
    notice = useNotice(),
    [model, setModel] = useState(() => restoreLayout(preferences.layout)),
    modelRef = useRef(model),
    [edit, setEdit] = useState<EntityDialog | null>(null),
    [search, setSearch] = useState(false),
    [styles, setStyles] = useState<false | "visual" | "advanced">(false),
    [palette, setPalette] = useState(false),
    [shortcuts, setShortcuts] = useState(false),
    [keyboardSettings, setKeyboardSettings] = useState(false),
    [tabSettings, setTabSettings] = useState(false),
    [tabRename, setTabRename] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [tabMenu, setTabMenu] = useState<{
      id: string;
      document: Document;
      x: number;
      y: number;
    } | null>(null),
    tabOperations = useRef(new Set<Promise<unknown>>()),
    [regenerate, setRegenerate] = useState<number | null>(null),
    [themeVersion, setThemeVersion] = useState(0),
    active = useRef("graph"),
    pendingLayout = useRef<unknown>(null);
  modelRef.current = model;
  useEffect(() => {
    syncEditorEpoch(s.datasetEpoch);
    syncFindEpoch(s.datasetEpoch);
    suggestionStarts.clearOtherEpochs(s.datasetEpoch);
  }, [s.datasetEpoch]);

  const updatePaneMenu = () => {
    const m = modelRef.current,
      n = m.getNodeById(active.current),
      valid = n instanceof TabNode,
      parent = n?.getParent(),
      resize = valid && !!widthRow(n) && !m.getMaximizedTabset(n.getLayoutId());
    const count = [...documents]
      .flatMap((d) => [...d.querySelectorAll<HTMLElement>("[data-panel]")])
      .filter(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          e.getBoundingClientRect().height > 0,
      ).length;
    window.axiom.menuState({
      ...Object.fromEntries(
        ["left", "right", "top", "bottom"].map((d) => [
          "pane.move." + d,
          valid,
        ]),
      ),
      "pane.next": count > 1,
      "pane.nextTab": valid && (parent?.getChildren().length ?? 0) > 1,
      "pane.previousTab": valid && (parent?.getChildren().length ?? 0) > 1,
      "pane.previous": count > 1,
      "pane.close": valid,
      "pane.float": valid && n.getLayoutId() === Model.MAIN_LAYOUT_ID,
      "pane.detach": valid && n.getWindow() === window,
      "pane.group":
        valid &&
        !!m.getNodeById("graph") &&
        m.getNodeById("graph")?.getParent() !== parent,
      "pane.wider": resize,
      "pane.narrower": resize,
      "pane.maximise": parent instanceof TabSetNode,
      "pane.reattach": Object.keys(m.toJson().subLayouts ?? {}).length > 0,
    });
  };
  const saveLayout = (m: Model) => {
    syncTabHistory(m);
    if (pendingLayout.current) {
      preferences.arrangement = "custom";
      recordUiChange("layout", pendingLayout.current, {
        layout: m.toJson(),
        arrangement: "custom",
      });
      pendingLayout.current = null;
    }
    updatePaneMenu();
    setTimeout(updatePaneMenu, 0);
    preferences.layout = m.toJson();
    persist();
  };
  const closeTab = (id: string) => {
    const m = modelRef.current,
      node = m.getNodeById(id),
      epoch = state!.datasetEpoch;
    if (!(node instanceof TabNode)) return;
    syncTabHistory(m);
    captureTab(node);
    const operation = (async () => {
      if (node.getComponent() === "graph") {
        await request("graphArchive", {
          id,
          retain: tabHistory().entries.some((t) => t.id === id),
          datasetEpoch: epoch,
        });
        setState(await request<Snapshot>("state"));
      }
      if (state?.datasetEpoch !== epoch) return;
      m.doAction(Actions.deleteTab(id));
      saveLayout(m);
    })();
    tabOperations.current.add(operation);
    void operation
      .catch((e) => report(e.message, true))
      .finally(() => tabOperations.current.delete(operation));
    return operation;
  };
  const openSavedTab = async (saved: SavedTab, restore = true) => {
    const m = modelRef.current;
    if (m.getNodeById(saved.id)) {
      if (saved.type === "graph") {
        await request("graphActivate", { id: saved.id });
        setState(await request<Snapshot>("state"));
      }
      show(saved.id);
      return;
    }
    if (saved.type === "graph") {
      await request("graphRestore", {
        id: saved.id,
        datasetEpoch: state!.datasetEpoch,
      });
      setState(await request<Snapshot>("state"));
    }
    if (restore) restoreTabState(saved);
    if (
      restore &&
      saved.type !== "graph" &&
      saved.selected &&
      state?.entities.some((e) => e.iri === saved.selected)
    )
      await request("select", { iri: saved.selected });
    const target =
      m.getNodeById("graph")?.getParent() ??
      m.getNodeById("hierarchy")?.getParent() ??
      m.getRootRow()!;
    m.doAction(
      Actions.addTab(
        {
          type: "tab",
          id: saved.id,
          component: saved.type,
          name: saved.name,
          config: saved.config,
        },
        target.getId(),
        DockLocation.CENTER,
        -1,
      ),
    );
    show(saved.id);
    saveLayout(m);
  };
  const show = (id: string, focusPanel = true) => {
    if (id === "graph") id = state?.activeGraphId ?? "graph";
    const m = modelRef.current;
    let n = m.getNodeById(id);
    if (id === "details") {
      m.visitNodes((candidate) => {
        if (
          candidate instanceof TabNode &&
          candidate.getComponent() === "details"
        )
          n = candidate;
      });
      if (n) id = n.getId();
    }
    if (!n) {
      const saved = tabHistory().entries.find((t) => t.id === id);
      if (saved) {
        void openSavedTab(saved, false).catch((e) => report(e.message, true));
        return;
      }
      const dataSibling = id.startsWith("graph:")
        ? m.getNodeById("graph")?.getParent()
        : id === "query"
          ? m.getNodeById("individuals")?.getParent()
          : id === "individuals"
            ? m.getNodeById("query")?.getParent()
            : undefined;
      const target =
        dataSibling ??
        (id === "tabhistory" ||
        id === "sparsity" ||
        id === "find" ||
        id === "errorlog" ||
        id === "taxonomy" ||
        id.startsWith("taxonomy:") ||
        id === "provenance" ||
        id === "source" ||
        id === "details"
          ? (m.getNodeById("graph")?.getParent() ??
            m.getNodeById("hierarchy")?.getParent() ??
            m.getRootRow()!)
          : id === "research"
            ? (m.getNodeById("inspector")?.getParent() ?? m.getRootRow()!)
            : m.getRootRow()!);
      m.doAction(
        Actions.addTab(
          tab(id),
          target.getId(),
          dataSibling ||
            id === "tabhistory" ||
            id === "sparsity" ||
            id === "find" ||
            id === "errorlog" ||
            id === "taxonomy" ||
            id.startsWith("taxonomy:") ||
            id === "research" ||
            id === "provenance" ||
            id === "source" ||
            id === "details"
            ? DockLocation.CENTER
            : id === "inspector"
              ? DockLocation.RIGHT
              : id === "hierarchy"
                ? DockLocation.LEFT
                : DockLocation.BOTTOM,
          -1,
        ),
      );
      n = m.getNodeById(id);
    }
    if (n) {
      const maximised = m.getMaximizedTabset(n.getLayoutId());
      if (maximised && maximised !== n.getParent())
        m.doAction(Actions.maximizeToggle(maximised.getId(), n.getLayoutId()));
      if (focusPanel) n.getWindow()?.focus();
      m.doAction(Actions.selectTab(n.getId()));
      if (!focusPanel) {
        saveLayout(m);
        return;
      }
      active.current = id;
      const focus = () => {
        if (active.current !== id) return;
        const content = n
          ?.getDocument()
          ?.querySelector<HTMLElement>(
            id.startsWith("graph:")
              ? '[data-graph-id="' + id + '"]'
              : '[data-panel="' + id + '"]',
          );
        const recovery = content
          ?.closest('.adaptive-pane[data-pane-recovery="true"]')
          ?.querySelector<HTMLElement>(".pane-recovery button");
        const target =
          recovery ??
          content?.querySelector<HTMLElement>(
            id === "query" || id === "source"
              ? ".monaco-editor textarea"
              : id === "graph" || id.startsWith("graph:")
                ? "canvas"
                : 'input:not(:disabled),button:not(:disabled),[tabindex="0"]',
          );
        if (target && target.getBoundingClientRect().width > 0) target.focus();
        return !!target && target.getBoundingClientRect().width > 0;
      };
      if (!focus()) setTimeout(focus, 40);
      saveLayout(m);
    }
  };
  const openResults = (result: QueryResultDocument) => {
    const m = modelRef.current,
      id = "results:" + result.id;
    if (!m.getNodeById(id)) {
      let existing: TabNode | undefined;
      m.visitNodes((n) => {
        if (
          n instanceof TabNode &&
          n.getComponent() === "queryResults" &&
          n.getLayoutId() === Model.MAIN_LAYOUT_ID
        )
          existing = n;
      });
      const individuals = m.getNodeById("individuals")?.getParent();
      const query = m.getNodeById("query")?.getParent();
      const target =
        existing?.getParent() ??
        (individuals && individuals !== query
          ? individuals
          : (m.getNodeById("graph")?.getParent() ?? m.getRootRow()!));
      m.doAction(
        Actions.addTab(
          {
            type: "tab",
            id,
            component: "queryResults",
            name: "Query results · " + result.sequence,
            helpText:
              result.title +
              (result.completedAt
                ? " · " + new Date(result.completedAt).toLocaleString()
                : ""),
            config: { resultId: result.id },
          },
          target.getId(),
          DockLocation.CENTER,
          -1,
        ),
      );
    }
    show(id);
  };
  const openEditor = async (iri: string) => {
    if (!state?.entities.some((e) => e.iri === iri)) {
      report(
        "This entity is unavailable or is a read-only generated sample record.",
        true,
      );
      return;
    }
    const epoch = state.datasetEpoch;
    try {
      if (state.selected !== iri) await request("select", { iri });
      if (state?.datasetEpoch === epoch) show("details");
    } catch (e) {
      report((e as Error).message, true);
    }
  };
  const focusPane = (direction: number) => {
    const panels = [
        ...[...documents].flatMap((d) => [
          ...d.querySelectorAll<HTMLElement>("[data-pane-id]"),
        ]),
      ].filter(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          e.getBoundingClientRect().height > 0,
      ),
      index = panels.findIndex((e) => e.dataset.paneId === active.current),
      next = panels[(index + direction + panels.length) % panels.length];
    if (next) {
      active.current = next.dataset.paneId!;
      (
        [
          ...next.querySelectorAll<HTMLElement>(
            'input:not(:disabled),button:not(:disabled),canvas,[tabindex="0"]',
          ),
        ].find((el) => el.checkVisibility() && !el.closest("[inert]")) ?? next
      ).focus();
    }
  };
  const pane = (id: string) => {
    if (
      ![
        "pane.next",
        "pane.previous",
        "pane.nextTab",
        "pane.previousTab",
      ].includes(id)
    )
      pendingLayout.current = {
        layout: modelRef.current.toJson(),
        arrangement: preferences.arrangement ?? "auto",
      };
    const m = modelRef.current,
      n = m.getNodeById(active.current);
    if (id === "pane.reattach") {
      for (const key of Object.keys(m.toJson().subLayouts ?? {})) {
        m.doAction(Actions.closePopout(key));
        m.doAction(
          Actions.dockFloatToLayout(
            key,
            m.getRootRow()!.getId(),
            DockLocation.RIGHT,
            -1,
          ),
        );
      }
      saveLayout(m);
      return;
    }
    if (id === "pane.next" || id === "pane.previous") {
      focusPane(id === "pane.next" ? 1 : -1);
      return;
    }
    if (id === "pane.nextTab" || id === "pane.previousTab") {
      if (n instanceof TabNode) {
        const tabs =
            n
              .getParent()
              ?.getChildren()
              .filter((t) => t instanceof TabNode) ?? [],
          index = tabs.indexOf(n),
          next =
            tabs[
              (index + (id === "pane.nextTab" ? 1 : -1) + tabs.length) %
                tabs.length
            ];
        if (next) show(next.getId());
      }
      return;
    }
    if (!(n instanceof TabNode)) {
      pendingLayout.current = null;
      return;
    }
    const parent = n.getParent();
    if (id.startsWith("pane.move.")) {
      const loc = {
        left: DockLocation.LEFT,
        right: DockLocation.RIGHT,
        top: DockLocation.TOP,
        bottom: DockLocation.BOTTOM,
      }[id.slice(10)];
      if (loc)
        m.doAction(
          Actions.moveNode(n.getId(), m.getRootRow()!.getId(), loc, -1),
        );
    }
    if (id === "pane.group") {
      const target = m.getNodeById("graph")?.getParent();
      if (target && target !== parent)
        m.doAction(
          Actions.moveNode(n.getId(), target.getId(), DockLocation.CENTER, -1),
        );
    }
    if (id === "pane.close") {
      void closeTab(n.getId());
      return;
    }
    if (id === "pane.float" || id === "pane.detach")
      m.doAction(
        Actions.popoutTab(n.getId(), id === "pane.float" ? "float" : "window"),
      );
    if (id === "pane.maximise" && parent instanceof TabSetNode)
      m.doAction(Actions.maximizeToggle(parent.getId(), parent.getLayoutId()));
    if (
      (id === "pane.wider" || id === "pane.narrower") &&
      parent instanceof TabSetNode
    ) {
      const width = widthRow(n);
      if (width) {
        const { row, branch } = width;
        m.doAction(
          Actions.adjustWeights(
            row.getId(),
            (row.getChildren() as (RowNode | TabSetNode)[]).map((c) =>
              Math.max(
                5,
                c.getWeight() *
                  (c === branch ? (id === "pane.wider" ? 1.25 : 0.8) : 1),
              ),
            ),
          ),
        );
      }
    }
    saveLayout(m);
  };
  useEffect(() => {
    const initialMenuTimer = setTimeout(updatePaneMenu, 100);
    const off = onCommand((id) => {
      if (
        id.startsWith("graph.") &&
        ![...documents].some((d) => d.querySelector('[data-panel="graph"]'))
      ) {
        show("graph");
        setTimeout(() => command(id), 40);
        return;
      }
      if (id.startsWith("audit.open:")) {
        selectAudit(id.slice(11));
        show("errorlog");
      }
      if (id.startsWith("view.")) show(id.slice(5));
      if (id.startsWith("pane.")) pane(id);
      if (id === "palette") setPalette(true);
      if (id === "tabs.settings") setTabSettings(true);
      if (id === "tabs.capture") {
        syncTabHistory(modelRef.current);
        persist();
      }
      if (id === "taxonomy.reveal.open") show("hierarchy", false);
      if (id === "graph.styles") setStyles("advanced");
      if (id === "graph.appearance") setStyles("visual");
      if (id === "research.open") show("research");
      if (/^research\.(run|cancel|refresh|source\.)/.test(id)) {
        queueResearchCommand(id.slice(9));
        show("research");
      }
      if (id === "ui.restore:layout") {
        setModel(restoreLayout(preferences.layout));
        return;
      }
      if (id === "ui.restore:theme") {
        for (const d of documents) applyTheme(d);
        setThemeVersion((n) => n + 1);
        return;
      }
      if (id.startsWith("arrangement.")) {
        const mode = id.slice(12) as "auto" | "standard" | "wide";
        pendingLayout.current = {
          layout: modelRef.current.toJson(),
          arrangement: preferences.arrangement ?? "auto",
        };
        const before = pendingLayout.current;
        const m = rearrangedLayout(
          mode === "auto" ? screenProfile() : mode,
          modelRef.current,
        );
        preferences.arrangement = mode;
        pendingLayout.current = null;
        setModel(m);
        saveLayout(m);
        recordUiChange("layout", before, {
          layout: m.toJson(),
          arrangement: mode,
        });
        return;
      }
      if (id === "layout.reset") {
        command("arrangement.auto");
      }
      if (id.startsWith("theme.")) {
        recordUiChange("theme", preferences.theme, id.slice(6));
        preferences.theme = id.slice(6) as typeof preferences.theme;
        for (const d of documents) applyTheme(d);
        persist();
        setThemeVersion((n) => n + 1);
      }
      if (
        id === "workspace.new" ||
        id === "workspace.example" ||
        id === "workspace.imported"
      ) {
        preferences.tabHistory = emptyTabHistory();
        const fresh = Model.fromJson(defaultLayout());
        modelRef.current = fresh;
        setModel(fresh);
        notifyTabHistory();
        preferences.panelState = {
          ...preferences.panelState,
          "query.text":
            id !== "workspace.example"
              ? "SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object . } LIMIT 100"
              : examples[0].Text,
          "query.example": 0,
          "hierarchy.tab": "classes",
          "hierarchy.open": [],
        };
        delete preferences.panelState["graph.camera"];
        delete preferences.panelState["query.view"];
        persist();
        command("query.reset");
        command("hierarchy.reset");
        show("hierarchy");
        show("graph");
        setEdit(null);
        setSearch(false);
        setRegenerate(null);
      }
      if (id === "workspace.capture") {
        void Promise.all([
          ...tabOperations.current,
          flushQueryHistory(),
          flushUiHistory(),
        ])
          .then(() => {
            syncTabHistory(modelRef.current);
            preferences.layout = modelRef.current.toJson();
          })
          .then(() => captureWorkspaceDrafts())
          .then((drafts) =>
            window.axiom.preferences.save(preferences, true, drafts),
          )
          .catch((e) => report(e.message, true));
      }
      if (id === "workspace.preferences")
        void window.axiom.preferences.load().then((p) => {
          setPreferences(p);
          notifyTabHistory();
          command("query.reset");
          setModel(restoreLayout(p.layout));
          for (const d of documents) applyTheme(d);
          setThemeVersion((n) => n + 1);
        });
      if (id === "subclasses.suggest" && state?.selected)
        openTaxonomy(state.selected, "parents");
      if (id === "file.provenance") show("provenance");
      if (id === "entity.search") {
        setSearch(true);
      } else if (id === "entity.newGraph") {
        void request<string>("graphCreate", {
          iris: state?.selected ? [state.selected] : [],
        })
          .then((id) => {
            show(id);
            command("graph.fit");
          })
          .catch((e) => report(e.message, true));
      } else if (id === "entity.showGraph") {
        show("graph");
        if (state?.selected)
          void act("seed", { iris: [state.selected] }).then(() =>
            command("graph.fit"),
          );
      } else if (id === "entity.showInstances") {
        if (state?.selected) showInstances(state.selected);
      } else if (id === "entity.rename") {
        const iri = state?.selected;
        if (iri && !startInlineRename(iri)) {
          show("inspector");
          let remaining = 30;
          const epoch = state?.datasetEpoch;
          const attempt = () => {
            if (state?.selected !== iri || state.datasetEpoch !== epoch) return;
            if (!startInlineRename(iri) && --remaining > 0)
              setTimeout(attempt, 30);
          };
          attempt();
        }
      } else if (id === "entity.createClass") beginCreation("Class");
      else if (id === "entity.createIndividual") beginCreation("Individual");
      else if (id === "entity.createProperty") beginCreation("ObjectProperty");
      else if (id === "entity.edit") {
        const iri = takeEditorIri();
        if (iri) void openEditor(iri);
        else if (state?.graph.selectedEdge) show("details");
      } else if (id === "entity.delete") setEdit("delete");
      if (id === "keyboard.settings") setKeyboardSettings(true);
      if (id === "keyboard.changed") setThemeVersion((n) => n + 1);
      if (id === "help.shortcuts") setShortcuts(true);
      if (id === "search") {
        const focused = focusedDocument().activeElement;
        if (focused?.closest('[data-panel="source"] .monaco-editor'))
          command("source.find");
        else if (focused?.closest(".monaco-editor")) command("query.find");
        else setSearch(true);
      }
      if (id === "query.format" || id === "query.generate") {
        savePanel("query.pending", id, false);
        show("query");
        command("query.authoring");
      }
      if (id.startsWith("query.results:")) {
        void window.axiom.queryHistory
          .result(id.slice("query.results:".length))
          .then((result) => {
            if (result) openResults(result);
            else
              report(
                "The saved query for these results could not be found.",
                true,
              );
          })
          .catch((e) => report(e.message, true));
      }
      if (id === "query.cancel") void act("cancelQuery");
      if (id === "query.graph") {
        const n = modelRef.current.getNodeById(active.current);
        const last = historyState().view?.current.lastRun;
        const resultId =
          n instanceof TabNode && n.getComponent() === "queryResults"
            ? n.getConfig().resultId
            : last
              ? queryResultId(last)
              : undefined;
        if (resultId) {
          void window.axiom.queryHistory
            .result(resultId)
            .then((r) => {
              if (r) return graphQueryResults(r);
            })
            .catch((e) => report(e.message, true));
        } else
          report("Run a query before sending its results to the graph.", true);
      }
      if (id === "query.run") {
        queueQuery();
        show("query");
        command("query.execute");
      }
      if (id === "edit.undo" || id === "edit.redo") {
        const el = focusedDocument().activeElement;
        if (!el?.closest(".monaco-editor")) {
          if (
            el?.matches("input:not([type=range]):not([type=checkbox]),textarea")
          ) {
            focusedDocument().execCommand(id === "edit.undo" ? "undo" : "redo");
          } else void act(id === "edit.undo" ? "undo" : "redo");
        }
      }
    });
    let resizeTimer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (
          (preferences.arrangement ??
            (preferences.layout ? "custom" : "auto")) !== "auto"
        )
          return;
        const wide = screenProfile() === "wide",
          present = !!modelRef.current.getNodeById("query-group");
        if (wide !== present) {
          const m = rearrangedLayout(
            wide ? "wide" : "standard",
            modelRef.current,
          );
          setModel(m);
          saveLayout(m);
        }
      }, 250);
    };
    window.addEventListener("resize", resize);
    resize();
    const removeKeyboard = installKeyboard(document);
    const system = matchMedia("(prefers-color-scheme: dark)"),
      change = () => {
        for (const d of documents) applyTheme(d);
        setThemeVersion((n) => n + 1);
      };
    system.addEventListener("change", change);
    const motion = matchMedia("(prefers-reduced-motion: reduce)"),
      motionChange = () => void act("motion", { reduced: motion.matches });
    motion.addEventListener("change", motionChange);
    syncTabHistory(modelRef.current);
    const flush = () => {
      syncTabHistory(modelRef.current);
      preferences.layout = modelRef.current.toJson();
      void window.axiom.preferences.save(preferences);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      clearTimeout(initialMenuTimer);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", resize);
      off();
      removeKeyboard();
      system.removeEventListener("change", change);
      motion.removeEventListener("change", motionChange);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
  const run = (id: string) => window.axiom.command(id);
  return (
    <main
      className="workbench"
      data-arrangement={model.getNodeById("query-group") ? "wide" : "standard"}
      onFocusCapture={(e) => {
        rememberDocument((e.target as HTMLElement).ownerDocument);
        const p = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-pane-id]",
        );
        if (p) active.current = p.dataset.paneId!;
        updatePaneMenu();
      }}
      onPointerDownCapture={(e) => {
        rememberDocument((e.target as HTMLElement).ownerDocument);
        const p = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-pane-id]",
        );
        if (p) active.current = p.dataset.paneId!;
        updatePaneMenu();
      }}
    >
      <WindowChrome />
      {s.ontology.example && (
        <div className="command-bar">
          <label className="dataset-label">
            Dataset{" "}
            <select
              aria-label="Dataset size"
              disabled={!s.ontology.example}
              value={s.orderCount}
              onChange={(e) => setRegenerate(+e.target.value)}
            >
              {[1000, 12000, 50000, 100000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString("en-GB")} orders
                </option>
              ))}
              {![1000, 12000, 50000, 100000].includes(s.orderCount) && (
                <option value={s.orderCount}>
                  {s.orderCount.toLocaleString("en-GB")} orders
                </option>
              )}
            </select>
          </label>
        </div>
      )}
      <div className="docking-workspace">
        <Layout
          model={model}
          onContextMenu={(node, e) => {
            if (!(node instanceof TabNode)) return;
            e.preventDefault();
            setTabMenu({
              id: node.getId(),
              document: (e.target as HTMLElement).ownerDocument,
              x: e.clientX,
              y: e.clientY,
            });
          }}
          onRenderTab={(node, values) => {
            values.leading = <AssistantTabActivity paneId={node.getId()} />;
          }}
          factory={(n) => (
            <AdaptivePane
              name={n.getName()}
              paneId={n.getId()}
              visual={n.getComponent() === "graph"}
              maximize={() => {
                const owner = n.getWindow();
                if (owner && owner !== window) {
                  void window.axiom
                    .maximizeWindow(owner.location.href)
                    .catch((error) => report(error.message, true));
                  return;
                }
                const parent = n.getParent();
                if (parent instanceof TabSetNode) {
                  model.doAction(
                    Actions.maximizeToggle(
                      parent.getId(),
                      parent.getLayoutId(),
                    ),
                  );
                  saveLayout(model);
                }
              }}
            >
              {
                {
                  provenance: <ProvenancePanel />,
                  source: (
                    <Suspense
                      fallback={
                        <div className="startup">Opening source editor...</div>
                      }
                    >
                      <SourcePanel />
                    </Suspense>
                  ),
                  details: <DetailsPanel panelId={n.getId()} />,
                  hierarchy: <HierarchyPanel />,
                  graph: <GraphPanel graphId={n.getId()} />,
                  inspector: <InspectorPanel />,
                  research: <ResearchPanel />,
                  taxonomy: <SuggestionsPanel paneId={n.getId()} />,
                  errorlog: <ErrorLogPanel />,
                  find: <FindPanel />,
                  tabhistory: (
                    <TabHistoryPanel
                      open={openSavedTab}
                      openIds={() => {
                        const ids = new Set<string>();
                        modelRef.current.visitNodes((n) => {
                          if (n instanceof TabNode) ids.add(n.getId());
                        });
                        return ids;
                      }}
                    />
                  ),
                  sparsity: <SparsityPanel />,
                  individuals: <IndividualsPanel />,
                  queryResults: (
                    <Suspense
                      fallback={
                        <div className="startup">Opening query results...</div>
                      }
                    >
                      <QueryResultsPanel
                        resultId={n.getConfig()?.resultId ?? ""}
                        panelId={n.getId()}
                      />
                    </Suspense>
                  ),
                  query: (
                    <Suspense
                      fallback={
                        <div className="startup">Opening query editor...</div>
                      }
                    >
                      <QueryPanel />
                    </Suspense>
                  ),
                }[n.getComponent() ?? "graph"]
              }
            </AdaptivePane>
          )}
          onModelChange={saveLayout}
          supportsPopout={true}
          popoutURL="app://axiom/popout.html"
          popoutWindowName="Axiom pane"
          realtimeResize={true}
          invalidateTabContentOnParentRender={true}
          onPopoutOpen={(_m, _w, d) => {
            documents.add(d);
            d.defaultView?.addEventListener("focus", () => rememberDocument(d));
            applyTheme(d);
            const remove = installKeyboard(d);
            d.defaultView?.addEventListener("unload", remove, { once: true });
          }}
          onPopoutClose={(_m, _w, d) => {
            documents.delete(d);
            updatePaneMenu();
            setTimeout(updatePaneMenu, 0);
          }}
          onAction={(a) => {
            if (a.type === Actions.RENAME_TAB) {
              try {
                renameTab(modelRef.current, a.data.node, a.data.text);
              } catch (e) {
                report((e as Error).message, true);
              }
              return undefined;
            }
            if (a.type === Actions.DELETE_TAB) {
              void closeTab(a.data.node);
              return undefined;
            }
            if (
              ![Actions.SELECT_TAB, Actions.SET_ACTIVE_TABSET].includes(a.type)
            )
              pendingLayout.current ??= {
                layout: modelRef.current.toJson(),
                arrangement: preferences.arrangement ?? "auto",
              };
            if (a.type === Actions.SELECT_TAB) {
              active.current = a.data.tabNode;
              const n = modelRef.current.getNodeById(a.data.tabNode);
              if (n instanceof TabNode && n.getComponent() === "graph")
                void act("graphActivate", { id: n.getId() });
            }
            return a;
          }}
        />
      </div>
      <footer className={"status-bar" + (notice.error ? " error" : "")}>
        <span className="status-counts">
          {s.classCount} classes · {s.individualCount.toLocaleString("en-GB")}{" "}
          individuals · {s.tripleCount.toLocaleString("en-GB")} triples
        </span>
        <span
          className="status-message"
          role={notice.error ? "alert" : "status"}
          title={notice.text}
        >
          {notice.text}
        </span>
        {notice.error && <ErrorDetailsButton error={notice.text} />}
        <button onClick={() => command("help.shortcuts")}>Shortcuts</button>
      </footer>
      {styles && (
        <StylesDialog
          advanced={styles === "advanced"}
          close={() => setStyles(false)}
        />
      )}
      {edit && <EditDialog kind={edit} close={() => setEdit(null)} />}
      {search && <FindDialog close={() => setSearch(false)} />}
      {palette && (
        <Palette items={items} close={() => setPalette(false)} run={run} />
      )}
      {tabMenu && (
        <ContextMenu
          label="Tab actions"
          {...tabMenu}
          close={() => setTabMenu(null)}
          actions={[
            {
              label: "Rename tab",
              key: "R",
              run: () => {
                const n = modelRef.current.getNodeById(tabMenu.id);
                if (n instanceof TabNode)
                  setTabRename({ id: n.getId(), name: n.getName() });
              },
            },
            { label: "Tab History", key: "H", run: () => show("tabhistory") },
            null,
            { label: "Close tab", key: "C", run: () => closeTab(tabMenu.id) },
          ]}
        />
      )}
      {tabRename && (
        <RenameTabDialog
          name={tabRename.name}
          close={() => setTabRename(null)}
          rename={(name) => renameTab(modelRef.current, tabRename.id, name)}
        />
      )}
      {tabSettings && (
        <TabHistorySettings close={() => setTabSettings(false)} />
      )}
      {keyboardSettings && (
        <KeyboardDialog close={() => setKeyboardSettings(false)} />
      )}
      {shortcuts && (
        <KeyboardHelp
          close={() => setShortcuts(false)}
          customize={() => {
            setShortcuts(false);
            setKeyboardSettings(true);
          }}
        />
      )}
      {regenerate && (
        <Modal title="Regenerate dataset" close={() => setRegenerate(null)}>
          <p>
            Replace generated orders and customers with{" "}
            {regenerate.toLocaleString("en-GB")} seeded orders? This clears edit
            history and previous query results. Schema edits remain.
          </p>
          <footer>
            <button onClick={() => setRegenerate(null)}>Cancel</button>
            <button
              className="primary"
              onClick={() => {
                void act("regenerate", {
                  size: regenerate,
                }).then(() => command("graph.fit"));
                setRegenerate(null);
              }}
            >
              Regenerate
            </button>
          </footer>
        </Modal>
      )}
    </main>
  );
}
