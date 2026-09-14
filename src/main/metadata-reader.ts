import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { lstat, readlink, open } from "node:fs/promises";
import path from "node:path";
import type { FileEvidence, ProvenanceOptions } from "../shared/provenance";
export class MetadataReader {
  private helper?: ChildProcessWithoutNullStreams;
  private pending?: { resolve: (v: any) => void; reject: (e: Error) => void };
  private error = "";
  private children = new Set<ChildProcessWithoutNullStreams>();
  constructor(
    private directory: string,
    private options: ProvenanceOptions,
    private signal: AbortSignal,
  ) {}
  close() {
    this.pending?.reject(Error("Collection cancelled."));
    this.pending = undefined;
    for (const child of this.children) child.kill();
    this.children.clear();
    this.helper = undefined;
  }
  private async native(
    file: string,
    extra: Record<string, unknown> = {},
  ): Promise<any> {
    if (this.signal.aborted) throw Error("Collection cancelled.");
    if (!this.helper) {
      const powershell = path.join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      const env = { ...process.env };
      for (const key of Object.keys(env))
        if (key.toLowerCase() === "psmodulepath") delete env[key];
      const child = spawn(
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(this.directory, "windows-metadata.ps1"),
          "-NativeSource",
          path.join(this.directory, "windows-metadata.cs"),
        ],
        { windowsHide: true, stdio: "pipe", env },
      );
      this.helper = child;
      this.children.add(child);
      this.error = "";
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        try {
          const data = JSON.parse(line);
          this.pending?.resolve(data);
          this.pending = undefined;
        } catch {
          this.error += (line + "\n").slice(0, 1000);
        }
      });
      child.stderr.on("data", (b) => {
        this.error = (this.error + b.toString()).slice(-8000);
      });
      child.on("error", (e) => this.pending?.reject(e));
      child.on("close", () => {
        this.children.delete(child);
        this.helper = undefined;
        this.pending?.reject(
          Error(this.error || "Windows metadata helper exited."),
        );
        this.pending = undefined;
      });
    }
    const child = this.helper;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        this.helper = undefined;
        child.kill();
        reject(Error("Windows metadata collection timed out."));
      }, this.options.timeoutSeconds * 1000);
      this.pending = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      child.stdin.write(
        JSON.stringify({
          path: file,
          readOffline: this.options.readOffline,
          ...extra,
        }) + "\n",
      );
    });
  }
  private async embedded(file: string): Promise<unknown> {
    if (this.signal.aborted) throw Error("Collection cancelled.");
    const executable = path.join(this.directory, "exiftool", "exiftool.exe");
    const args = [
      "-config",
      "",
      "-json",
      "-G0:1:4",
      "-a",
      "-u",
      "-U",
      "-struct",
      "-ee3",
      "-api",
      "RequestAll=3",
      "-api",
      "LargeFileSupport=1",
      "-e",
      "-n",
      "-b",
      "-charset",
      "filename=UTF8",
      "--",
      file,
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true,
        stdio: "pipe",
      });
      this.children.add(child);
      child.stdin.end();
      const chunks: Buffer[] = [];
      let size = 0,
        error = "",
        failure = "";
      const timer = setTimeout(() => {
        failure = "Embedded metadata collection timed out.";
        child.kill();
      }, this.options.timeoutSeconds * 1000);
      child.stdout.on("data", (b: Buffer) => {
        size += b.length;
        if (size > 64 * 1024 * 1024) {
          failure =
            "Embedded metadata exceeded the 64 MB per-file output limit.";
          child.kill();
        } else chunks.push(b);
      });
      child.stderr.on("data", (b) => {
        error = (error + b.toString()).slice(-8000);
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        this.children.delete(child);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        this.children.delete(child);
        if (failure || this.signal.aborted) {
          reject(Error(failure || "Collection cancelled."));
          return;
        }
        try {
          resolve({
            status: code === 0 ? "collected" : "partial",
            tool: "ExifTool",
            arguments: args.slice(0, -1),
            exitCode: code,
            diagnostics: error,
            values: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          });
        } catch {
          reject(Error(error || "Embedded metadata reader returned no JSON."));
        }
      });
    });
  }
  private async hash(file: string) {
    const handle = await open(file, "r");
    try {
      const hash = createHash("sha256"),
        buffer = Buffer.alloc(1024 * 1024);
      let bytes = 0;
      const started = Date.now();
      for (;;) {
        if (this.signal.aborted) throw Error("Collection cancelled.");
        if (Date.now() - started > this.options.timeoutSeconds * 1000)
          throw Error("Content hashing timed out.");
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead));
        bytes += bytesRead;
      }
      return {
        algorithm: "SHA-256",
        value: hash.digest("hex"),
        bytesRead: String(bytes),
      };
    } finally {
      await handle.close();
    }
  }
  async journal(root: string, fileIds: string[]) {
    return this.native(root, {
      mode: "journal",
      fileIds,
      timeoutSeconds: Math.max(5, this.options.timeoutSeconds - 5),
    });
  }
  async collect(file: string, parent?: string): Promise<FileEvidence> {
    const evidence: FileEvidence = {
      path: file,
      parent,
      observedAt: new Date().toISOString(),
      directory: false,
      reparse: false,
      metadata: {},
      issues: [],
    };
    const capture = async (name: string, fn: () => Promise<unknown>) => {
      try {
        const value = await fn();
        evidence.metadata[name] = value;
        return value;
      } catch (e) {
        const message = (e as Error).message;
        evidence.metadata[name] = { status: "unavailable", message };
        evidence.issues.push(name + ": " + message);
        return undefined;
      }
    };
    const before = (await capture("statBefore", async () => {
      const s = await lstat(file, { bigint: true });
      evidence.directory = s.isDirectory();
      evidence.reparse = s.isSymbolicLink();
      return JSON.parse(
        JSON.stringify(s, (_, v) => (typeof v === "bigint" ? String(v) : v)),
      );
    })) as any;
    if (!before) return evidence;
    const windows = (await capture("windows", () => this.native(file))) as any;
    const attrs = Number(windows?.native?.value?.basic?.value?.attributes ?? 0);
    evidence.reparse = evidence.reparse || !!(attrs & 0x400);
    if (evidence.reparse) await capture("linkTarget", () => readlink(file));
    const offline = !!(attrs & 0x441000),
      canRead =
        !evidence.directory &&
        !evidence.reparse &&
        (!offline || this.options.readOffline);
    if (canRead) {
      await capture("embedded", () => this.embedded(file));
      await capture("contentHash", () => this.hash(file));
    } else {
      const reason = evidence.directory
        ? "Directory"
        : evidence.reparse
          ? "Reparse target is outside this entry's metadata scope"
          : "Offline or recall-on-access content was not requested";
      evidence.metadata.embedded = { status: "not-read", reason };
      evidence.metadata.contentHash = { status: "not-read", reason };
      if (!evidence.directory) evidence.issues.push(reason);
    }
    const streams = windows?.streams?.value;
    if (Array.isArray(streams) && canRead) {
      const hashes = [];
      for (const stream of streams) {
        const name = String(stream.name);
        if (name === ":$DATA" || name === "::$DATA") continue;
        if (name.includes("\\") || name.includes("/") || name.includes("\0"))
          continue;
        try {
          hashes.push({ name, ...(await this.hash(file + ":" + name)) });
        } catch (e) {
          hashes.push({
            name,
            status: "unavailable",
            message: (e as Error).message,
          });
          evidence.issues.push("Alternate stream could not be hashed: " + name);
        }
      }
      evidence.metadata.streamHashes = hashes;
    }
    const after = (await capture("statAfter", async () =>
      JSON.parse(
        JSON.stringify(await lstat(file, { bigint: true }), (_, v) =>
          typeof v === "bigint" ? String(v) : v,
        ),
      ),
    )) as any;
    if (after) {
      const changed = ["size", "mtimeNs", "ctimeNs", "ino", "dev"].some(
        (k) => after[k] !== before[k],
      );
      evidence.metadata.consistency = {
        changedDuringCollection: changed,
        accessTimeChanged: after.atimeNs !== before.atimeNs,
      };
      if (changed)
        evidence.issues.push(
          "File changed during collection; the fields are observations taken at different times.",
        );
    }
    findIssues(windows, "Windows", evidence.issues);
    findIssues(evidence.metadata.embedded, "Embedded", evidence.issues);
    return evidence;
  }
}
function findIssues(value: any, prefix: string, issues: string[]) {
  if (!value || typeof value !== "object") return;
  if (
    ["unavailable", "partial", "not-read", "error", "unsupported"].includes(
      value.status,
    )
  )
    issues.push(
      prefix + ": " + (value.message ?? value.reason ?? value.status),
    );
  for (const [key, v] of Object.entries(value))
    if (typeof v === "object") findIssues(v, prefix + "/" + key, issues);
}
