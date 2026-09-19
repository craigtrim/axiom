export interface AuditEvent {
  time: string;
  stage: string;
  detail?: string;
}
export interface AuditRecord {
  id: string;
  operation: string;
  startedAt: string;
  completedAt: string;
  outcome: "failed" | "cancelled";
  message: string;
  stage: string;
  metadata: Record<string, string | number | boolean | null>;
  events: AuditEvent[];
  details: Record<string, string>;
  file?: string;
  storageError?: string;
}
export type AuditSummary = Omit<
  AuditRecord,
  "events" | "details" | "metadata"
> & {
  provider?: string;
  entity?: string;
};
export function cleanErrorMessage(error: unknown): string {
  let text = error instanceof Error ? error.message : String(error);
  text = text.replace(/^Error:\s*/, "");
  return text.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    "",
  );
}
export function auditReport(record: AuditRecord) {
  return [
    "Axiom error log",
    "Reference: " + record.id,
    "Operation: " + record.operation,
    "Started: " + record.startedAt,
    "Finished: " + record.completedAt,
    "Outcome: " + record.outcome,
    "Stage: " + record.stage,
    "Error: " + record.message,
    ...(record.file ? ["Log file: " + record.file] : []),
    ...(record.storageError ? ["Storage: " + record.storageError] : []),
    "",
    ...Object.entries(record.metadata).map(([k, v]) => k + ": " + v),
    "",
    "Timeline",
    ...record.events.map(
      (e) => e.time + "  " + e.stage + (e.detail ? ": " + e.detail : ""),
    ),
    ...Object.entries(record.details).flatMap(([k, v]) => ["", k, v]),
  ].join("\n");
}
