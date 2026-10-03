import { useSyncExternalStore } from "react";
import { request } from "./client";
import type { QualityStatus } from "../shared/ontology-quality";
let status: QualityStatus | undefined;
const listeners = new Set<() => void>();
function publish(value: QualityStatus) {
  status = value;
  for (const fn of listeners) fn();
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
