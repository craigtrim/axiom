import type { AssistantId } from "./assistant";
import type { Entity } from "../domain/model";

export const batchModes = {
  children: "Add Children",
  synonyms: "Find Synonyms",
  parents: "Add Parents",
  instances: "Find Instances",
} as const;
export type BatchMode = keyof typeof batchModes;
export type BatchRunState =
  "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export interface BatchRun {
  id: string;
  iri: string;
  label: string;
  state: BatchRunState;
  startedAt?: number;
  finishedAt?: number;
  count?: number;
  error?: string;
  reviewable?: boolean;
}
export interface SuggestionBatch {
  id: string;
  namespace: string;
  datasetEpoch: number;
  mode: BatchMode;
  provider: AssistantId;
  createdAt: number;
  runs: BatchRun[];
}
export interface BatchRequest {
  iris: string[];
  mode: BatchMode;
  provider: AssistantId;
  datasetEpoch: number;
}
export function supportsBatchMode(entity: Entity | undefined, mode: BatchMode) {
  return (
    !!entity &&
    !entity.iri.startsWith("_:") &&
    (mode === "synonyms" || ["Class", "Defined"].includes(entity.kind))
  );
}
export const pendingBatchRun = (run: BatchRun) =>
  run.state === "queued" || run.state === "running";

export class SuggestionBusyError extends Error {}
