// Issue 87 exposes in-flight corrections so the shell reports scan freshness accurately.
import { useSyncExternalStore } from "react";
import { request } from "./client";
import type { QualityReport, QualityStatus } from "../shared/ontology-quality";
let status: QualityStatus | undefined;
let applying: QualityStatus | undefined;
const listeners = new Set<() => void>();
const applyingListeners = new Set<() => void>();
function publishApplying(value: QualityStatus | undefined) {
  applying = value;
  for (const fn of applyingListeners) fn();
}
export const useQualityApplying = () =>
  useSyncExternalStore(
    (fn) => {
      applyingListeners.add(fn);
      return () => {
        applyingListeners.delete(fn);
      };
    },
    () => applying,
  );
function publish(value: QualityStatus) {
  status = value;
  for (const fn of listeners) fn();
  for (const fn of staleListeners) fn();
}
export async function applyQualityFinding(findingId: string) {
  const job = status;
  if (!job?.report || job.state !== "complete")
    throw Error("Run the scan again before applying a correction.");
  publishApplying(job);
  try {
    const next = await request<QualityStatus>("qualityApplyFinding", {
      id: job.id,
      findingId,
      datasetEpoch: job.report.datasetEpoch,
      version: job.report.version,
    });
    if (status?.id === job.id) publish(next);
    return next;
  } finally {
    publishApplying(undefined);
  }
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
// #165: a previous report's deferred stale flag must not taint a corrected report.
let staleReport: QualityReport | undefined;
const staleListeners = new Set<() => void>();
export function publishQualityStale(
  value: boolean,
  report: QualityReport | undefined,
) {
  if (stale === value && staleReport === report) return;
  stale = value;
  staleReport = report;
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
    () => stale && staleReport === (status?.report ?? status?.partial),
  );
