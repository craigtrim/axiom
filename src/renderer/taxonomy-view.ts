import { useSyncExternalStore } from "react";
import { command, panel, savePanel, state } from "./client";
export interface TaxonomyTarget {
  iri: string;
  mode: string;
  namespace: string;
  runId?: string;
  revision?: number;
}
const listeners = new Set<() => void>();
export function openTaxonomy(
  iri: string,
  mode: string,
  runId?: string,
  paneId = "taxonomy",
) {
  const target = {
    iri,
    mode,
    runId,
    namespace: state?.ontology.namespace ?? "",
    revision: Date.now(),
  };
  savePanel(paneId + ".target", target, false);
  for (const listener of listeners) listener();
  command("view." + paneId);
}
export function useTaxonomyTarget(paneId = "taxonomy") {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => panel<TaxonomyTarget | null>(paneId + ".target", null),
  );
}
