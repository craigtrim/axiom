import {
  createContext,
  useContext,
  useLayoutEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { edgeKey } from "../domain/viewport";
import { displayName } from "../domain/rdf-model";
import type { Snapshot } from "../shared/protocol";
import { request, report, state, useSnapshot } from "./client";

type Place =
  | { kind: "node"; iri: string }
  | { kind: "edge"; key: string; graphId: string };
const same = (a: Place | null, b: Place | null) =>
  JSON.stringify(a) === JSON.stringify(b);
const selectedPlace = (s: Snapshot): Place | null =>
  s.graph.selectedEdge
    ? {
        kind: "edge",
        key: s.graph.selectedEdge,
        graphId: s.activeGraphId ?? "graph",
      }
    : s.selected && s.entities.some((e) => e.iri === s.selected)
      ? { kind: "node", iri: s.selected }
      : null;
function available(place: Place, s: Snapshot) {
  if (place.kind === "node") return s.entities.some((e) => e.iri === place.iri);
  const graph =
    s.graphs?.[place.graphId] ??
    ((s.activeGraphId ?? "graph") === place.graphId ? s.graph : undefined);
  return !!graph?.edges.some((e) => edgeKey(e) === place.key);
}
// One Details pane is shared across selections and survives docking/remounting.
const history = {
  epoch: -1,
  current: null as Place | null,
  past: [] as Place[],
};
function observe(s: Snapshot) {
  if (history.epoch !== s.datasetEpoch) {
    history.epoch = s.datasetEpoch;
    history.current = null;
    history.past = [];
  }
  const next = selectedPlace(s);
  if (!same(next, history.current)) {
    if (history.current) history.past.push(history.current);
    history.current = next;
  }
  history.past = history.past
    .filter((p) => available(p, s))
    .filter((p, i, all) => !i || !same(p, all[i - 1]))
    .slice(-100);
  while (history.past.length && same(history.past.at(-1)!, next))
    history.past.pop();
}
const Navigation = createContext<{
  back: () => void;
  title: string;
  disabled: boolean;
} | null>(null);
export function DetailsBack() {
  const navigation = useContext(Navigation);
  if (!navigation) return null;
  return (
    <button
      type="button"
      className="details-back"
      aria-keyshortcuts="Backspace"
      title={navigation.title}
      disabled={navigation.disabled}
      onClick={navigation.back}
    >
      <span aria-hidden="true">←</span> Back
    </button>
  );
}
export function DetailsNavigation({ children }: { children: ReactNode }) {
  const s = useSnapshot()!;
  const root = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [, update] = useReducer((n: number) => n + 1, 0);
  useLayoutEffect(() => {
    observe(s);
    update();
  }, [s]);
  const previous =
    history.epoch === s.datasetEpoch
      ? [...history.past].reverse().find((place) => available(place, s))
      : undefined;
  const title =
    previous?.kind === "node"
      ? "Back to " +
        displayName(s.entities.find((e) => e.iri === previous.iri)!) +
        " (Backspace)"
      : previous
        ? "Back to previous edge (Backspace)"
        : "No previous item";
  const back = async () => {
    if (busy.current || !state) return;
    observe(state);
    const previous = history.past.pop();
    if (!previous) return;
    const from = history.current;
    const epoch = history.epoch;
    history.current = previous;
    busy.current = true;
    root.current?.focus({ preventScroll: true });
    update();
    try {
      if (previous.kind === "node")
        await request("select", { iri: previous.iri });
      else
        await request("selectEdge", {
          key: previous.key,
          graphId: previous.graphId,
        });
    } catch (error) {
      if (history.epoch === epoch) {
        history.current = from;
        history.past.push(previous);
      }
      report((error as Error).message, true);
    } finally {
      busy.current = false;
      update();
    }
  };
  return (
    <Navigation.Provider
      value={{
        back: () => void back(),
        title,
        disabled: !previous || busy.current,
      }}
    >
      <div
        ref={root}
        className="details-navigation"
        tabIndex={-1}
        onMouseDown={(event) => {
          if (
            event.button === 0 &&
            !event.defaultPrevented &&
            !(event.target as HTMLElement).closest(
              "input,textarea,select,button,a,summary,.monaco-editor,[contenteditable],[role=dialog],[role=menu],[role=listbox],[role=option]",
            )
          )
            root.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            event.key !== "Backspace" ||
            event.defaultPrevented ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.nativeEvent.isComposing ||
            target.isContentEditable ||
            target.closest(
              "input,textarea,select,[contenteditable],.monaco-editor",
            ) ||
            target.ownerDocument.querySelector(
              "dialog[open],[role=menu],[popover]:popover-open",
            )
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) void back();
        }}
      >
        {children}
      </div>
    </Navigation.Provider>
  );
}
