import { useSyncExternalStore } from "react";
import { onCommand, panel, savePanel, state, report } from "./client";
import {
  queryTitle,
  type QueryHistoryView,
  type QueryHistoryAction,
  type QueryEntry,
} from "../shared/query-history";
type ClientState = {
  view: QueryHistoryView | null;
  error: string;
  saving: boolean;
  runningId: string | null;
};
let current: ClientState = {
  view: null,
  error: "",
  saving: false,
  runningId: null,
};
const listeners = new Set<() => void>();
const drafts = new Map<string, { text: string; viewState?: unknown }>();
let connection: Promise<void> | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  queue: Promise<unknown> = Promise.resolve();
const emit = (patch: Partial<ClientState>) => {
  current = { ...current, ...patch };
  for (const fn of listeners) fn();
};
let restoring: { id: string; entry: QueryEntry; pendingId: string } | undefined;
let restoreTask: Promise<unknown> = Promise.resolve();
function accept(view: QueryHistoryView) {
  if (
    current.view &&
    current.view.session === view.session &&
    current.view.revision > view.revision
  )
    return;
  const previous = current.view;
  if (
    !restoring &&
    previous &&
    view.activeId !== previous.activeId &&
    view.current.source === "agent" &&
    drafts.has(previous.activeId) &&
    !previous.entries.some((e) => e.id === view.activeId)
  ) {
    const target = {
      id: previous.activeId,
      entry: previous.current,
      pendingId: view.activeId,
    };
    restoring = target;
    // Delivery can arrive inside the local save debounce. Keep the editor in place
    // until both the last keystroke and the retained selection reach the main process.
    restoreTask = flushQueryHistory()
      .then(() =>
        window.axiom.queryHistory.apply({
          type: "select",
          id: target.id,
          pendingId: target.pendingId,
        }),
      )
      .then((saved) => {
        restoring = undefined;
        accept(saved);
      })
      .catch((error) => {
        restoring = undefined;
        emit({ error: error.message });
      });
  }
  if (restoring) {
    if (view.activeId === restoring.id) restoring = undefined;
    else
      view = {
        ...view,
        activeId: restoring.id,
        pendingId: restoring.pendingId,
        current:
          previous?.current.id === restoring.id
            ? previous.current
            : restoring.entry,
      };
  }
  const draft = drafts.get(view.activeId);
  if (draft)
    view = {
      ...view,
      current: {
        ...view.current,
        ...draft,
        title:
          view.current.source === "manual"
            ? queryTitle(draft.text)
            : view.current.title,
      },
    };
  savePanel("query.text", view.current.text, false);
  emit({ view, saving: drafts.size > 0 });
}
let subscribed = false;
export function connectQueryHistory() {
  if (!subscribed) {
    subscribed = true;
    window.axiom.onEvent(({ type, data }) => {
      if (type === "query-history") accept(data);
      if (type === "query-state")
        emit({
          runningId: data.running
            ? (current.runningId ?? current.view?.activeId ?? "running")
            : null,
        });
    });
  }
  return (connection ??= window.axiom.queryHistory
    .load()
    .then((view) => {
      accept(view);
      emit({ error: "" });
    })
    .catch((error) => {
      connection = undefined;
      emit({ error: "Could not load query history: " + error.message });
      throw error;
    }));
}
export const useQueryHistory = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
export const historyState = () => current;
export function editQuery(id: string, text: string, viewState?: unknown) {
  drafts.set(id, { text, viewState });
  if (current.view?.activeId === id)
    accept({ ...current.view, current: { ...current.view.current, text } });
  emit({ saving: true, error: "" });
  clearTimeout(timer);
  timer = setTimeout(() => void flushQueryHistory().catch(() => {}), 250);
}
export function flushQueryHistory(): Promise<void> {
  clearTimeout(timer);
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (!drafts.size) return;
      await connectQueryHistory();
      while (drafts.size) {
        const [id, draft] = drafts.entries().next().value!;
        const view = await window.axiom.queryHistory.apply({
          type: "edit",
          id,
          ...draft,
        });
        if (drafts.get(id) === draft) drafts.delete(id);
        accept(view);
      }
      emit({ error: "", saving: false });
    })
    .catch((error) => {
      emit({
        error: "Could not save query history: " + error.message,
        saving: drafts.size > 0,
      });
      throw error;
    });
  queue = task;
  return task;
}
export async function changeQueryHistory(action: QueryHistoryAction) {
  await connectQueryHistory();
  await flushQueryHistory();
  await restoreTask;
  try {
    const view = await window.axiom.queryHistory.apply(action);
    accept(view);
    return view;
  } catch (error) {
    emit({ error: (error as Error).message });
    throw error;
  }
}
export const selectQuery = (id: string) =>
  changeQueryHistory({ type: "select", id });
export const addQuery = (
  text = "",
  title?: string,
  source: "manual" | "example" = "manual",
) =>
  changeQueryHistory({
    type: "add",
    text,
    title,
    source,
    origin: state?.ontology.name ?? "",
    namespace: state?.ontology.namespace ?? "",
  });
export function saveQueryView(id: string, viewState: unknown) {
  const draft = drafts.get(id);
  if (draft) {
    drafts.set(id, { ...draft, viewState });
    return;
  }
  void changeQueryHistory({ type: "view", id, viewState }).catch(() => {});
}
export function beginQueryRun(id: string) {
  emit({ runningId: id });
}
export function endQueryRun() {
  emit({ runningId: null });
}
export function rememberQueryRun(
  id: string,
  run: NonNullable<QueryEntry["lastRun"]>,
) {
  return changeQueryHistory({ type: "run", id, run });
}
// This subscription survives closing or detaching the Query pane.
onCommand((id) => {
  if (id === "query.reset") {
    void addQuery(
      panel("query.text", "SELECT ?s ?p ?o WHERE { ?s ?p ?o . } LIMIT 100"),
    ).catch((e) => report(e.message, true));
  }
});
