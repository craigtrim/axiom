import { useSyncExternalStore } from "react";
import { command, panel, savePanel, state } from "./client";
import {
  defaultSparsityOptions,
  readSparsityOptions,
  type SparsityOptions,
} from "../shared/sparsity";
const listeners = new Set<() => void>();
// craigtrim/axiom#90: explicit requests survive opening the pane; restart restoration stays silent.
let notice: { request: number; first: boolean } | undefined;
export const sparsityOptions = () =>
  panel<SparsityOptions>("sparsity.view", defaultSparsityOptions);
export function updateSparsity(change: Partial<SparsityOptions>) {
  savePanel(
    "sparsity.view",
    readSparsityOptions({ ...sparsityOptions(), ...change }),
    false,
  );
  for (const listener of listeners) listener();
}
export function openSparsity(iri: string) {
  computeSparsity({
    iri,
    namespace: state?.ontology.namespace ?? "",
    text: "",
  });
  command("view.sparsity");
}
export function computeSparsity(change: Partial<SparsityOptions> = {}) {
  const current = sparsityOptions(),
    request = current.request + 1;
  notice = { request, first: !current.report };
  updateSparsity({ ...change, report: true, selected: "", page: 0, request });
}
export function takeSparsityNotice(request: number) {
  if (notice?.request !== request) return undefined;
  const result = notice;
  notice = undefined;
  return result;
}
export function useSparsityOptions() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, sparsityOptions);
}
