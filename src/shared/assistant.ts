export type AssistantId = "codex" | "claude";
export interface AssistantInfo {
  id: AssistantId;
  name: string;
  available: boolean;
  path?: string;
  message?: string;
}
export interface AssistantCallMetadata {
  cli: { version: string | null; path: string };
  model: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  providerReport: Record<string, unknown> | null;
}
export interface AssistantRunResult {
  reply: unknown;
  metadata: AssistantCallMetadata;
}
export interface AssistantCacheInfo {
  hit: boolean;
  completedAt: string;
  model: string | null;
}
