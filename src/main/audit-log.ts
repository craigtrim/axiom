import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  cleanErrorMessage,
  type AuditRecord,
  type AuditSummary,
} from "../shared/audit";
const failures = new WeakMap<object, string>();
export const auditFailureId = (error: unknown) =>
  error && typeof error === "object" ? failures.get(error) : undefined;
const contexts = new AsyncLocalStorage<AuditRecord>();
const limit = 262144;
export function redactDiagnostic(text: string) {
  return text
    .replace(/\b(Bearer\s+)[^\s"'<>]+/gi, "$1[redacted]")
    .replace(
      /\b(sk-(?:ant-)?[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/g,
      "[redacted]",
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|authorization)["']?\s*[:=]\s*["']?)([^\s"',}]+)/gi,
      "$1[redacted]",
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@");
}
const bounded = (text: string) =>
  text.length > limit
    ? text.slice(0, limit) + "\n[Truncated after " + limit + " characters]"
    : text;
export function auditId() {
  return contexts.getStore()?.id;
}
export function auditStep(stage: string, detail?: string) {
  const record = contexts.getStore();
  if (!record) return;
  record.stage = stage;
  if (record.events.length < 200)
    record.events.push({ time: new Date().toISOString(), stage, detail });
}
export function auditDetail(name: string, value: unknown) {
  const record = contexts.getStore();
  if (!record) return;
  const text =
    typeof value === "string"
      ? value
      : (JSON.stringify(value, null, 2) ?? String(value));
  record.details[name] = bounded(text);
}
export function auditMetadata(values: AuditRecord["metadata"]) {
  const record = contexts.getStore();
  if (record) Object.assign(record.metadata, values);
}
function summary(e: AuditRecord): AuditSummary {
  const { events, details, metadata, ...rest } = e;
  return {
    ...rest,
    provider:
      typeof metadata.provider === "string" ? metadata.provider : undefined,
    entity: typeof metadata.entity === "string" ? metadata.entity : undefined,
  };
}
export class AuditLog {
  private entries = new Map<string, AuditRecord>();
  private ready?: Promise<void>;
  constructor(
    private root: string,
    private notify: (summary: AuditSummary) => void = () => {},
  ) {
    this.root = path.resolve(root);
  }
  private load() {
    return (this.ready ??= (async () => {
      await mkdir(this.root, { recursive: true });
      for (const file of await readdir(this.root)) {
        if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
        try {
          const e = JSON.parse(
            await readFile(path.join(this.root, file), "utf8"),
          );
          if (
            e.format !== 1 ||
            typeof e.record?.id !== "string" ||
            e.record.id + ".json" !== file ||
            typeof e.record.message !== "string" ||
            !Array.isArray(e.record.events) ||
            !e.record.details ||
            !e.record.metadata
          )
            continue;
          if (!this.entries.has(e.record.id))
            this.entries.set(e.record.id, {
              ...e.record,
              file: path.join(this.root, file),
            });
        } catch {
          /* Other error records remain available when one file is damaged. */
        }
      }
    })());
  }
  async list() {
    await this.load().catch(() => {});
    return [...this.entries.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(summary);
  }
  async read(id: string) {
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
      throw Error("Invalid error-log reference.");
    await this.load().catch(() => {});
    const entry = this.entries.get(id);
    if (!entry)
      throw Error(
        "This error log is unavailable. Older Axiom versions did not retain these details.",
      );
    return entry;
  }
  async run<T>(
    operation: string,
    metadata: AuditRecord["metadata"],
    work: () => Promise<T> | T,
  ): Promise<T> {
    const record: AuditRecord = {
      id: randomUUID(),
      operation,
      metadata,
      startedAt: new Date().toISOString(),
      completedAt: "",
      outcome: "failed",
      message: "",
      stage: operation,
      events: [],
      details: {},
    };
    return contexts.run(record, async () => {
      auditStep(operation);
      try {
        return await work();
      } catch (error) {
        record.completedAt = new Date().toISOString();
        record.message = cleanErrorMessage(error);
        record.outcome = /cancelled|canceled/i.test(record.message)
          ? "cancelled"
          : "failed";
        auditDetail(
          "Technical error",
          error instanceof Error ? (error.stack ?? error.message) : error,
        );
        await this.save(record);
        if (error && typeof error === "object") failures.set(error, record.id);
        throw error;
      }
    });
  }
  async record(
    message: string,
    operation: string,
    metadata: AuditRecord["metadata"] = {},
  ) {
    const error = Error(message);
    try {
      await this.run(operation, metadata, () => {
        throw error;
      });
    } catch {
      return auditFailureId(error)!;
    }
    return "";
  }
  private async save(raw: AuditRecord) {
    // Redact string values before anything is saved, surfaced or copied. Never capture environment variables.
    const entry = JSON.parse(
      JSON.stringify(raw, (_key, value) =>
        typeof value === "string" ? redactDiagnostic(value) : value,
      ),
    ) as AuditRecord;
    const file = path.join(this.root, entry.id + ".json");
    const temporary = file + ".tmp";
    try {
      await this.load();
      entry.file = file;
      await writeFile(
        temporary,
        JSON.stringify({ format: 1, record: entry }, null, 2),
        "utf8",
      );
      await rename(temporary, file);
    } catch (error) {
      delete entry.file;
      entry.storageError =
        "Could not save this log to disk: " + cleanErrorMessage(error);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    this.entries.set(entry.id, entry);
    try {
      this.notify(summary(entry));
    } catch {
      /* The window may have closed while the log was saved. */
    }
  }
}
