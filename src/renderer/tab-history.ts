import { useSyncExternalStore } from "react";
import { Actions, Model, TabNode } from "flexlayout-react";
import {
  defaultTabName,
  emptyTabHistory,
  tabTypes,
  type SavedTab,
  type TabSavePolicy,
} from "../shared/tab-history";
import { preferences, state, persist, command } from "./client";
import { findState, updateFind } from "./find-state";
import { updateSparsity } from "./sparsity-view";
let revision = 0;
const listeners = new Set<() => void>();
export function notifyTabHistory() {
  revision++;
  for (const fn of listeners) fn();
}
export function useTabHistory() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => revision,
  );
  return (preferences.tabHistory ??= emptyTabHistory());
}
export const tabHistory = () => (preferences.tabHistory ??= emptyTabHistory());
let synchronizing = false;
const metadata = (n: TabNode) => {
  const v = n.getConfig()?.axiomTab;
  return v &&
    typeof v.createdAt === "string" &&
    Number.isFinite(Date.parse(v.createdAt)) &&
    typeof v.defaultName === "string" &&
    v.defaultName.length <= 120 &&
    typeof v.named === "boolean"
    ? (v as { createdAt: string; defaultName: string; named: boolean })
    : undefined;
};
export function ensureTabMetadata(model: Model, n: TabNode) {
  if (!Object.hasOwn(tabTypes, n.getComponent() ?? "")) return;
  if (metadata(n)) return;
  const type = n.getComponent()!;
  const history = tabHistory();
  const saved = history.entries.find((t) => t.id === n.getId());
  const sequence = (history.counters[type] = (history.counters[type] ?? 0) + 1);
  const defaultName = defaultTabName(type, sequence);
  model.doAction(
    Actions.updateNodeAttributes(n.getId(), {
      name: saved?.name ?? defaultName,
      config: {
        ...n.getConfig(),
        axiomTab: {
          createdAt: saved?.createdAt ?? new Date().toISOString(),
          defaultName,
          named: saved?.named ?? false,
        },
      },
    }),
  );
}
export function captureTab(n: TabNode) {
  const type = n.getComponent()!,
    meta = metadata(n);
  if (!meta || !Object.hasOwn(tabTypes, type)) return;
  const history = tabHistory();
  if (!meta.named && preferences.tabSavePolicy !== "all") return;
  const prefix =
    type === "individuals" ? "table" : type === "taxonomy" ? n.getId() : type;
  const panelState = Object.fromEntries(
    Object.entries(preferences.panelState ?? {}).filter(
      ([key]) =>
        key === "pane.zoom." + n.getId() ||
        (type === "graph"
          ? key ===
            (n.getId() === "graph"
              ? "graph.camera"
              : "graph.camera." + n.getId())
          : key.startsWith(prefix + ".")),
    ),
  );
  const record: SavedTab = {
    id: n.getId(),
    type,
    name: n.getName(),
    named: meta.named,
    createdAt: meta.createdAt,
    updatedAt: new Date().toISOString(),
    config: structuredClone(n.getConfig() ?? {}),
    panelState: structuredClone(panelState),
    selected: type === "find" ? findState().selected : state?.selected,
  };
  const old = history.entries.findIndex((t) => t.id === record.id);
  if (old < 0) history.entries.push(record);
  else history.entries[old] = record;
}
export function syncTabHistory(model: Model) {
  if (synchronizing) return;
  synchronizing = true;
  try {
    model.visitNodes((n) => {
      if (n instanceof TabNode) {
        ensureTabMetadata(model, n);
        captureTab(n);
      }
    });
  } finally {
    synchronizing = false;
  }
  notifyTabHistory();
}
export function renameTab(model: Model, id: string, text: string) {
  const n = model.getNodeById(id);
  if (!(n instanceof TabNode)) return;
  const name = text.trim();
  if (!name || name.length > 120)
    throw Error("Enter a tab name of 1 to 120 characters.");
  ensureTabMetadata(model, n);
  model.doAction(
    Actions.updateNodeAttributes(id, {
      name,
      config: {
        ...n.getConfig(),
        axiomTab: {
          ...metadata(n),
          named: name !== metadata(n)?.defaultName || !!metadata(n)?.named,
        },
      },
    }),
  );
  captureTab(n);
  preferences.layout = model.toJson();
  notifyTabHistory();
  persist();
}
export function setTabSavePolicy(policy: TabSavePolicy) {
  preferences.tabSavePolicy = policy;
  command("tabs.capture");
  notifyTabHistory();
  persist();
}
export function restoreTabState(saved: SavedTab) {
  preferences.panelState = {
    ...preferences.panelState,
    ...structuredClone(saved.panelState),
  };
  if (saved.type === "find")
    updateFind(saved.panelState["find.view"] ?? {}, saved.selected ?? "");
  if (saved.type === "sparsity")
    updateSparsity(saved.panelState["sparsity.view"] ?? {});
  if (saved.type === "query") command("query.reset");
  if (saved.type === "hierarchy") command("hierarchy.reset");
  persist();
}
