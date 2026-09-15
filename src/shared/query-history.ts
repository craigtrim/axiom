import type { QuerySummary } from "./protocol";
import type { QueryAssistantResponse } from "./query-assistant";
export interface QueryRunRecord {
  summary: QuerySummary;
  text: string;
  datasetEpoch: number;
  session: string;
  title?: string;
  queryKey?: string;
  origin?: string;
  namespace?: string;
}
export interface QueryResultDocument {
  id: string;
  sequence: number;
  queryId: string;
  title: string;
  completedAt: string;
  origin: string;
  namespace: string;
  run: QueryRunRecord;
}
export const queryResultId = (run: QueryRunRecord) =>
  run.session + ":" + run.summary.id;
export interface QueryEntry {
  id: string;
  title: string;
  text: string;
  source: "manual" | "example" | "agent";
  createdAt: string;
  createdSession?: string;
  updatedAt: string;
  editVersion: number;
  origin: string;
  namespace: string;
  viewState?: unknown;
  generation?: QueryAssistantResponse;
  lastRun?: QueryRunRecord;
  restoredRunId?: string;
}
export type QueryEntrySummary = Pick<
  QueryEntry,
  "id" | "title" | "source" | "createdAt" | "updatedAt" | "origin"
> & { preview: string; rows?: number };
export interface QueryHistoryView {
  revision: number;
  session: string;
  activeId: string;
  pendingId?: string;
  entries: QueryEntrySummary[];
  current: QueryEntry;
}
export type QueryHistoryAction =
  | { type: "edit"; id: string; text: string; viewState?: unknown }
  | { type: "view"; id: string; viewState: unknown }
  | { type: "select"; id: string; pendingId?: string }
  | {
      type: "add";
      text: string;
      title?: string;
      source?: "manual" | "example";
      origin: string;
      namespace: string;
    }
  | { type: "run"; id: string; run: QueryRunRecord }
  | { type: "open-run"; resultId: string };
export interface QueryHistoryData {
  version: 1;
  revision: number;
  activeId: string;
  pendingId?: string;
  entries: QueryEntry[];
  results?: QueryResultDocument[];
}
export const queryTitle = (text: string) =>
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s && !/^(?:#|PREFIX\b|BASE\b)/i.test(s))
    ?.slice(0, 90) || "New query";
