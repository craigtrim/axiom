import { useSyncExternalStore } from "react";
import { request } from "./client";
import type { QualityStatus } from "../shared/ontology-quality";
let status: QualityStatus | undefined;
const listeners = new Set<() => void>();
function publish(value: QualityStatus) {
  status = value;
  for (const fn of listeners) fn();
}
export async function applyQualityFinding(findingId: string) {
  const job = status;
  if (!job?.report || job.state !== "complete")
    throw Error("Run the scan again before applying a correction.");
  const next = await request<QualityStatus>("qualityApplyFinding", {
    id: job.id,
    findingId,
    datasetEpoch: job.report.datasetEpoch,
    version: job.report.version,
  });
  if (status?.id === job.id) publish(next);
  return next;
}
export const useQualityStatus = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => status,
  );
export async function startQuality(options: unknown) {
  const job = await request<QualityStatus>("qualityStart", { options });
  publish(job);
  const poll = async () => {
    if (status?.id !== job.id || status.state !== "running") return;
    try {
      const next = await request<QualityStatus>("qualityStatus", {
        id: job.id,
      });
      if (status?.id !== job.id || status.state !== "running") return;
      publish(next);
      if (next.state === "running") setTimeout(() => void poll(), 100);
    } catch (e) {
      if (status?.id === job.id)
        publish({ ...job, state: "failed", error: (e as Error).message });
    }
  };
  setTimeout(() => void poll(), 100);
}
export async function cancelQuality() {
  if (status)
    publish(await request<QualityStatus>("qualityCancel", { id: status.id }));
}
// Tools > Check ontology... opens the settings block; View > Ontology Quality
// keeps whatever the pane last showed (craigtrim/axiom#44).
let settingsRequests = 0,
  settingsPending = false;
const settingsListeners = new Set<() => void>();
export function requestQualitySettings() {
  settingsRequests++;
  settingsPending = true;
  for (const fn of settingsListeners) fn();
}
/** True once per request, so a pane mounted by the request still honours it. */
export function takeQualitySettingsRequest() {
  const pending = settingsPending;
  settingsPending = false;
  return pending;
}
export const useQualitySettingsRequests = () =>
  useSyncExternalStore(
    (fn) => {
      settingsListeners.add(fn);
      return () => {
        settingsListeners.delete(fn);
      };
    },
    () => settingsRequests,
  );
// The pane publishes whether its report is stale, so recovery never shows a
// stale or untested result as current (craigtrim/axiom#44).
let stale = false;
const staleListeners = new Set<() => void>();
export function publishQualityStale(value: boolean) {
  if (stale === value) return;
  stale = value;
  for (const fn of staleListeners) fn();
}
export const useQualityStale = () =>
  useSyncExternalStore(
    (fn) => {
      staleListeners.add(fn);
      return () => {
        staleListeners.delete(fn);
      };
    },
    () => stale,
  );
