import { useSyncExternalStore } from "react";
import type { AuditSummary } from "../shared/audit";
let entries: AuditSummary[] = [];
let selected = "";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function rememberAudit(entry: AuditSummary) {
  entries = [entry, ...entries.filter((e) => e.id !== entry.id)].slice(0, 500);
  for (const listener of listeners) listener();
}
export function selectAudit(id: string) {
  selected = id;
  for (const listener of listeners) listener();
}
export const useAuditErrors = () =>
  useSyncExternalStore(subscribe, () => entries);
export const useAuditSelection = () =>
  useSyncExternalStore(subscribe, () => selected);
