import { updateIntersectionRoutes } from "../domain/intersection-routing";
import { assistantActivities } from "./assistant-activity";
import { useSyncExternalStore } from "react";
import type {
  Snapshot,
  Preferences,
  DomainMethod,
  GraphSnapshot,
} from "../shared/protocol";
export let state: Snapshot | null = null;
export let preferences: Preferences = {
  version: 1,
  theme: "light",
  panelState: {},
};
export let graph: GraphSnapshot | null = null;
export let notice = { text: "Loading the ontology...", error: false };
const stateListeners = new Set<() => void>(),
  graphListeners = new Set<() => void>(),
  noticeListeners = new Set<() => void>(),
  commands = new Set<(id: string) => void>();
export const useSnapshot = () =>
  useSyncExternalStore(
    (fn) => {
      stateListeners.add(fn);
      return () => stateListeners.delete(fn);
    },
    () => state,
  );
export const useNotice = () =>
  useSyncExternalStore(
    (fn) => {
      noticeListeners.add(fn);
      return () => noticeListeners.delete(fn);
    },
    () => notice,
  );
export const onGraph = (fn: () => void) => {
  graphListeners.add(fn);
  return () => {
    graphListeners.delete(fn);
  };
};
export const onCommand = (fn: (id: string) => void) => {
  commands.add(fn);
  return () => {
    commands.delete(fn);
  };
};
export const command = (id: string) => {
  for (const fn of commands) fn(id);
};
export function report(text: string, error = false) {
  notice = { text, error };
  for (const fn of noticeListeners) fn();
}
export const request = <T = unknown>(
  method: DomainMethod,
  args?: Record<string, unknown>,
) =>
  ([
    "uiHistory",
    "state",
    "inspector",
    "instances",
    "table",
    "queryPage",
    "queryActivate",
    "queryResult",
    "select",
    "selectEdge",
    "edgeDocument",
    "graphInteraction",
    "motion",
  ].includes(method)
    ? Promise.resolve()
    : flushUiHistory()
  ).then(() => window.axiom.request<T>(method, args));
export async function act(
  method: DomainMethod,
  args?: Record<string, unknown>,
) {
  try {
    return await request(method, args);
  } catch (e) {
    report(e instanceof Error ? e.message : String(e), true);
  }
}
export function setState(s: Snapshot) {
  if (state && state.datasetEpoch !== s.datasetEpoch) {
    pendingUi.length = 0;
    clearTimeout(uiTimer);
  }
  preferences.panelState ??= {};
  preferences.panelState["graph.limit"] = s.graph.budget;
  preferences.panelState["graph.stylesheet"] = s.graph.stylesheet ?? "";
  state = s;
  graph = s.graph;
  report(s.message);
  for (const fn of stateListeners) fn();
  for (const fn of graphListeners) fn();
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () =>
      void window.axiom.preferences
        .save(preferences)
        .catch((e) => report("Could not save layout: " + e.message, true)),
    250,
  );
}
export function savePanel(key: string, value: unknown, record = true) {
  preferences.panelState ??= {};
  const before = preferences.panelState[key];
  if (
    record &&
    before !== undefined &&
    [
      "graph.camera",
      "hierarchy.open",
      "hierarchy.tab",
      "table.filter",
      "research.templates",
    ].includes(key)
  )
    recordUiChange(key, before, value);
  preferences.panelState[key] = value;
  persist();
}
export function panel<T>(key: string, fallback: T): T {
  return (preferences.panelState?.[key] as T) ?? fallback;
}
export async function initialise() {
  preferences = await window.axiom.preferences.load();
  preferences.arrangement ??= preferences.layout ? "custom" : "auto";
  preferences.panelState ??= {};
  window.axiom.onCommand(command);
  window.axiom.onEvent(({ type, data }) => {
    if (type === "keyboard-changed") {
      preferences.keyboard = data;
      command("keyboard.changed");
    }
    if (type === "restore-ui") {
      if (data.key === "layout") {
        preferences.layout = data.value.layout ?? data.value;
        preferences.arrangement = data.value.arrangement ?? "custom";
      } else if (data.key === "theme") preferences.theme = data.value;
      else if (data.key === "arrangement") preferences.arrangement = data.value;
      else {
        preferences.panelState ??= {};
        preferences.panelState[data.key] = data.value;
      }
      persist();
      command("ui.restore:" + data.key);
    }
    if (type === "layout-finished") command("graph.fit");
    if (type === "layout-error") report(data.message, true);
    if (type === "state") setState(data as Snapshot);
    if (type === "selection" && state) {
      graph = { ...state.graph, selectedEdge: null };
      state = { ...state, selected: data.iri, graph };
      for (const fn of stateListeners) fn();
      for (const fn of graphListeners) fn();
    }
    if (type === "positions" && graph && data.revision === graph.revision) {
      const positions = data.positions as Float64Array;
      graph.nodes.forEach((n, i) => {
        n.x = positions[i * 2];
        n.y = positions[i * 2 + 1];
      });
      updateIntersectionRoutes(positionedGraph.nodes, positionedGraph.edges);
      for (const fn of graphListeners) fn();
    }
  });
  const desiredStyle = panel("graph.stylesheet", "");
  const limit = panel<number | null>("graph.limit", null);
  if (limit !== null) await request("budget", { value: limit, record: false });
  if (desiredStyle)
    await request("stylesheet", { text: desiredStyle, record: false });
  setState(await request<Snapshot>("state"));
  void act("motion", {
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
}

export function setPreferences(p: Preferences) {
  preferences = p;
  preferences.panelState ??= {};
}

let pendingQuery = false;
export function queueQuery() {
  pendingQuery = true;
}
export function takeQuery() {
  const requested = pendingQuery;
  pendingQuery = false;
  return requested;
}

export const workbenchDocuments = new Set<Document>([document]);
let interactionDocument = document;
export const rememberDocument = (d: Document) => {
  interactionDocument = d;
};
export const focusedDocument = () =>
  interactionDocument.defaultView?.closed ? document : interactionDocument;

const pendingUi: {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
}[] = [];
let uiTimer: ReturnType<typeof setTimeout> | undefined;
export function recordUiChange(
  key: string,
  before: unknown,
  after: unknown,
  label?: string,
) {
  if (before === undefined || JSON.stringify(before) === JSON.stringify(after))
    return;
  const last = pendingUi.at(-1);
  if (
    last?.key === key &&
    ["graph.camera", "table.filter", "research.templates"].includes(key)
  )
    last.after = structuredClone(after);
  else
    pendingUi.push({
      key,
      before: structuredClone(before),
      after: structuredClone(after),
      label:
        label ??
        (
          {
            "graph.camera": "Pan or zoom graph",
            "hierarchy.open": "Expand or collapse taxonomy",
            "hierarchy.tab": "Switch taxonomy",
            "table.filter": "Filter or sort individuals",
            layout: "Arrange panes",
            theme: "Change theme",
            arrangement: "Change workbench arrangement",
            "research.templates": "Edit research prompts",
          } as Record<string, string>
        )[key] ??
        key,
    });
  clearTimeout(uiTimer);
  uiTimer = setTimeout(
    () => void flushUiHistory().catch((e) => report(String(e), true)),
    300,
  );
}
export async function flushUiHistory() {
  clearTimeout(uiTimer);
  const entries = pendingUi.splice(0);
  for (const entry of entries) await window.axiom.request("uiHistory", entry);
}

const researchCommands: string[] = [];
export function queueResearchCommand(action: string) {
  if (
    action === "run" &&
    (assistantActivities.get("research") || researchCommands.includes("run"))
  )
    return;
  researchCommands.push(action);
  command("research.pending");
}
export const takeResearchCommand = () => researchCommands.shift();
