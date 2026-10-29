// craigtrim/axiom#182: crashes leave a detailed record, including across a crash of main itself.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditEvent } from "../shared/audit";

export interface Activity {
  method: string;
  args: string;
  startedAt: string;
  ms?: number;
  outcome?: "ok" | "failed";
  error?: string;
}
export interface ProcessMetric {
  pid: number;
  type: string;
  name?: string;
  serviceName?: string;
  cpu?: { percentCPUUsage: number };
  memory?: {
    workingSetSize: number;
    peakWorkingSetSize: number;
    privateBytes?: number;
  };
}
export interface CrashState {
  activity: ActivityTrail;
  metrics?: ProcessMetric[];
  memory?: NodeJS.MemoryUsage;
  heapLimit?: number;
  system?: { total: number; free: number };
  window?: {
    bounds: { x: number; y: number; width: number; height: number };
    maximized: boolean;
    fullScreen: boolean;
    visible: boolean;
  };
  entities?: number;
  storeVersion?: number;
}
export interface RunRecord {
  runId: string;
  pid: number;
  startedAt: string;
  updatedAt: string;
  workspace: string;
  processes: string;
  activity: Activity[];
}
export interface CrashDump {
  file: string;
  size: number;
  time: string;
}

const mb = (bytes: number) =>
  (bytes / 1048576).toLocaleString("en-US", { maximumFractionDigits: 0 }) +
  " MB";
const kb = (kilobytes: number) => mb(kilobytes * 1024);
const ms = (n: number) => Math.round(n).toLocaleString("en-US") + " ms";

export function summariseArgs(args: unknown) {
  if (!args || typeof args !== "object") return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args))
    if (["string", "number", "boolean"].includes(typeof value))
      parts.push(
        key +
          "=" +
          (typeof value === "string"
            ? JSON.stringify(
                value.length > 80 ? value.slice(0, 80) + "..." : value,
              )
            : String(value)),
      );
    else if (Array.isArray(value))
      parts.push(key + "=[" + value.length + " items]");
  const text = parts.join(" ");
  return text.length > 300 ? text.slice(0, 297) + "..." : text;
}

/** The last requests main sent to the domain worker, finished or still running. */
export class ActivityTrail {
  private entries: Activity[] = [];
  constructor(
    private limit = 100,
    private changed: () => void = () => {},
  ) {}
  begin(method: string, args?: unknown) {
    const entry: Activity = {
      method,
      args: summariseArgs(args),
      startedAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    if (this.entries.length > this.limit)
      this.entries.splice(0, this.entries.length - this.limit);
    this.changed();
    return (error?: unknown) => {
      entry.ms = Date.now() - Date.parse(entry.startedAt);
      entry.outcome = error === undefined ? "ok" : "failed";
      if (error !== undefined)
        entry.error = (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 300);
      this.changed();
    };
  }
  list() {
    return this.entries.map((e) => ({ ...e }));
  }
}
export function activityEvents(
  entries: Activity[],
  now = Date.now(),
): AuditEvent[] {
  return entries.map((e) => ({
    time: e.startedAt,
    stage: e.method,
    detail: [
      e.args,
      e.outcome
        ? ms(e.ms ?? 0) + ", " + e.outcome + (e.error ? ": " + e.error : "")
        : "still running after " + ms(now - Date.parse(e.startedAt)),
    ]
      .filter(Boolean)
      .join(", "),
  }));
}
export function processTable(metrics: ProcessMetric[]) {
  return metrics
    .map(
      (m) =>
        `${m.type}${m.name ? " (" + m.name + ")" : ""} pid ${m.pid}: ` +
        (m.memory
          ? `working set ${kb(m.memory.workingSetSize)}, peak ${kb(m.memory.peakWorkingSetSize)}` +
            (m.memory.privateBytes
              ? `, private ${kb(m.memory.privateBytes)}`
              : "")
          : "no memory figures") +
        (m.cpu ? `, CPU ${m.cpu.percentCPUUsage.toFixed(1)}%` : ""),
    )
    .join("\n");
}
export function crashDetails(s: CrashState, now = Date.now()) {
  const details: Record<string, string> = {};
  const running = s.activity.list().filter((e) => !e.outcome);
  if (running.length)
    details["Requests in flight"] = activityEvents(running, now)
      .map((e) => e.time + "  " + e.stage + ", " + e.detail)
      .join("\n");
  if (s.metrics?.length) details["Axiom processes"] = processTable(s.metrics);
  if (s.memory)
    details["Main process memory"] = [
      "rss " + mb(s.memory.rss),
      "heap used " + mb(s.memory.heapUsed) + " of " + mb(s.memory.heapTotal),
      ...(s.heapLimit ? ["V8 heap limit " + mb(s.heapLimit)] : []),
      "external " + mb(s.memory.external),
      "array buffers " + mb(s.memory.arrayBuffers),
    ].join("\n");
  if (s.system)
    details["System memory"] =
      `${kb(s.system.free)} free of ${kb(s.system.total)}`;
  if (s.window) {
    const { bounds: b } = s.window;
    details.Window = [
      `${b.width} x ${b.height} at ${b.x}, ${b.y}`,
      s.window.maximized ? "maximized" : "not maximized",
      s.window.fullScreen ? "full screen" : "not full screen",
      s.window.visible ? "visible" : "hidden",
    ].join(", ");
  }
  if (s.entities !== undefined)
    details.Workspace = `${s.entities.toLocaleString("en-US")} entities, store version ${s.storeVersion ?? 0}`;
  return details;
}

/** Records each distinct failure once, and at most `limit` failures in a session. */
export class FailureGate {
  private seen = new Set<string>();
  constructor(private limit = 20) {}
  admit(message: string, stack?: string) {
    const frame =
      stack
        ?.split("\n")
        .find((line) => /^\s+at /.test(line))
        ?.trim() ?? "";
    const key = message + "\n" + frame;
    if (this.seen.has(key) || this.seen.size >= this.limit) return false;
    this.seen.add(key);
    return true;
  }
}

/**
 * Keeps this run's activity on disk. A run counts as closed only when its id is in the
 * closed marker, which is written synchronously, so a pending activity write cannot undo it.
 */
export class RunLog {
  readonly runId = randomUUID();
  private readonly startedAt = new Date().toISOString();
  private writing?: Promise<void>;
  private dirty = false;
  private closed = false;
  constructor(
    private folder: string,
    private snapshot: () => Omit<
      RunRecord,
      "runId" | "pid" | "startedAt" | "updatedAt"
    >,
  ) {}
  private get file() {
    return path.join(this.folder, "crash-activity.json");
  }
  private get marker() {
    return path.join(this.folder, "crash-activity.closed");
  }
  /** The previous run's record, when it did not close. Call before the first touch. */
  previous(): RunRecord | undefined {
    try {
      const run = JSON.parse(readFileSync(this.file, "utf8")) as RunRecord;
      let closed = "";
      try {
        closed = readFileSync(this.marker, "utf8").trim();
      } catch {
        /* No run has closed in this folder yet. */
      }
      return typeof run.runId === "string" &&
        run.runId !== closed &&
        Array.isArray(run.activity)
        ? run
        : undefined;
    } catch {
      return undefined;
    }
  }
  touch() {
    this.dirty = true;
    this.writing ??= this.flush();
  }
  private async flush() {
    while (this.dirty && !this.closed) {
      this.dirty = false;
      const temporary = this.file + "." + process.pid + ".tmp";
      try {
        await writeFile(
          temporary,
          JSON.stringify({
            runId: this.runId,
            pid: process.pid,
            startedAt: this.startedAt,
            updatedAt: new Date().toISOString(),
            ...this.snapshot(),
          } satisfies RunRecord),
          "utf8",
        );
        await rename(temporary, this.file);
      } catch {
        /* Activity is diagnostic only; a failed write never interrupts the request. */
      }
      // A burst of requests rewrites the file at most four times a second.
      if (this.dirty) await new Promise((r) => setTimeout(r, 250).unref?.());
    }
    this.writing = undefined;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      writeFileSync(this.marker, this.runId, "utf8");
    } catch {
      /* The next start reports this run as unexpected, which is the safe reading. */
    }
  }
}

/** Minidumps under `folder` that no earlier record named, oldest first. */
export async function unreportedDumps(folder: string, reportedFile: string) {
  let reported: string[] = [];
  try {
    reported = JSON.parse(await readFile(reportedFile, "utf8"));
  } catch {
    /* Nothing has been reported from this folder yet. */
  }
  const found: CrashDump[] = [];
  async function visit(directory: string, depth: number) {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return;
    }
    for (const name of names) {
      const file = path.join(directory, name);
      const info = await stat(file).catch(() => undefined);
      if (info?.isDirectory() && depth < 2) await visit(file, depth + 1);
      else if (info?.isFile() && name.toLowerCase().endsWith(".dmp"))
        found.push({ file, size: info.size, time: info.mtime.toISOString() });
    }
  }
  await visit(folder, 0);
  const dumps = found
    .filter((d) => !reported.includes(path.relative(folder, d.file)))
    .sort((a, b) => a.time.localeCompare(b.time));
  return {
    dumps,
    remember: () =>
      writeFile(
        reportedFile,
        JSON.stringify(
          [
            ...reported,
            ...dumps.map((d) => path.relative(folder, d.file)),
          ].slice(-200),
        ),
        "utf8",
      ).catch(() => {}),
  };
}
export function dumpList(dumps: CrashDump[]) {
  return dumps.map((d) => `${d.time}  ${d.file}  (${mb(d.size)})`).join("\n");
}
