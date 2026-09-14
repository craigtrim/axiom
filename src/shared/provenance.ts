export interface ProvenanceOptions {
  readOffline: boolean;
  maxEntries: number;
  timeoutSeconds: number;
}
export interface ProvenanceStatus {
  id?: string;
  root?: string;
  status: "idle" | "running" | "complete" | "cancelled" | "error";
  startedAt?: string;
  endedAt?: string;
  entries: number;
  files: number;
  directories: number;
  issues: number;
  current?: string;
  message?: string;
  evidencePath?: string;
  rdfPath?: string;
  recent: { path: string; status: string; issues: number }[];
}
export interface FileEvidence {
  path: string;
  parent?: string;
  observedAt: string;
  directory: boolean;
  reparse: boolean;
  metadata: Record<string, unknown>;
  issues: string[];
}
export const defaultProvenanceOptions: ProvenanceOptions = {
  readOffline: false,
  maxEntries: 0,
  timeoutSeconds: 120,
};
export function validateProvenanceOptions(input: unknown): ProvenanceOptions {
  const o = input as ProvenanceOptions;
  if (
    !o ||
    typeof o.readOffline !== "boolean" ||
    !Number.isInteger(o.maxEntries) ||
    o.maxEntries < 0 ||
    o.maxEntries > 1000000 ||
    !Number.isInteger(o.timeoutSeconds) ||
    o.timeoutSeconds < 10 ||
    o.timeoutSeconds > 600
  )
    throw Error("Invalid collection options.");
  return {
    readOffline: o.readOffline,
    maxEntries: o.maxEntries,
    timeoutSeconds: o.timeoutSeconds,
  };
}
