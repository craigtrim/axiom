import { instanceAction } from "../shared/action-state";
import { useSyncExternalStore } from "react";
import { command, state } from "./client";
interface InstanceTarget {
  iri: string;
  datasetEpoch: number;
}
let target: InstanceTarget | null = null;
const listeners = new Set<() => void>();
export const useInstanceTarget = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => target,
  );
export function showInstances(iri: string) {
  const entity = state?.entities.find((e) => e.iri === iri);
  if (!instanceAction(entity).enabled) return;
  target = { iri, datasetEpoch: state!.datasetEpoch };
  for (const fn of listeners) fn();
  command("view.individuals");
}
export function clearInstanceReport() {
  target = null;
  for (const fn of listeners) fn();
}
