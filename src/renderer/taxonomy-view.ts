import { useMemo, useSyncExternalStore } from "react";
import { command, panel, savePanel, state } from "./client";
import { SuggestionStarts } from "./suggestion-starts";
export interface TaxonomyTarget {
  iri: string;
  mode: string;
  namespace: string;
  runId?: string;
  revision?: number;
}
const listeners = new Set<() => void>();
let targetRevision = 0;
export const suggestionStarts = new SuggestionStarts<TaxonomyTarget>();
export function useSuggestionStart(paneId: string) {
  const revision = useSyncExternalStore(
    suggestionStarts.subscribe,
    suggestionStarts.snapshot,
  );
  const pending = suggestionStarts.get(paneId);
  return useMemo(
    () => (pending ? { ...pending, revision } : undefined),
    [pending, revision],
  );
}
export function openTaxonomy(
  iri: string,
  mode: string,
  runId?: string,
  paneId = "taxonomy",
  start = true,
) {
  const target = {
    iri,
    mode,
    runId,
    namespace: state?.ontology.namespace ?? "",
    revision: ++targetRevision,
  };
  savePanel(paneId + ".target", target, false);
  suggestionStarts.request(paneId, target, state?.datasetEpoch ?? -1, start);
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
