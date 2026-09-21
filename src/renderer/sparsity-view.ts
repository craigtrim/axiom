import { useSyncExternalStore } from "react";
import { command, panel, savePanel, state } from "./client";
import {
  defaultSparsityOptions,
  readSparsityOptions,
  type SparsityOptions,
} from "../shared/sparsity";
const listeners = new Set<() => void>();
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
  updateSparsity({ iri, namespace: state?.ontology.namespace ?? "", text: "" });
  command("view.sparsity");
}
export function useSparsityOptions() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, sparsityOptions);
}
