// craigtrim/axiom#207: ontology data lives in plain Node outside Electron's heap cage.
import {
  fork,
  type ChildProcess,
  type ForkOptions,
  type Serializable,
} from "node:child_process";
import { EventEmitter } from "node:events";
import { totalmem } from "node:os";
import { decodeDomainPacket } from "./domain-wire";

export function heapCeilingMiB(totalBytes: number) {
  if (!Number.isFinite(totalBytes) || totalBytes < 1024 * 1024)
    throw new RangeError("Physical memory must be at least one MiB.");
  return Math.floor(totalBytes / (1024 * 1024));
}

export class DomainProcess extends EventEmitter {
  readonly child: ChildProcess;
  private stderrText = "";
  private exited = false;
  private finished = false;
  private exitCode = 0;
  private stopping?: Promise<number>;

  constructor(entryFile: string, options: { execPath: string }) {
    super();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    const childOptions: ForkOptions & { windowsHide: boolean } = {
      execPath: options.execPath,
      execArgv: ["--max-old-space-size=" + heapCeilingMiB(totalmem())],
      serialization: "json",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
      env,
    };
    this.child = fork(entryFile, [], childOptions);
    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk: string) => {
      this.stderrText = (this.stderrText + chunk).slice(-65536);
    });
    this.child.on("message", (packet) => {
      let decoded: unknown;
      try {
        decoded = decodeDomainPacket(packet);
      } catch (error) {
        this.emit(
          "error",
          error instanceof Error ? error : Error(String(error)),
        );
        return;
      }
      this.emit("message", decoded);
    });
    this.child.on("error", (error) => this.emit("error", error));
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.finished) return;
      this.finished = this.exited = true;
      this.exitCode = code ?? (signal ? 1 : 0);
      this.emit("exit", code, signal);
    };
    this.child.on("exit", (code, signal) => {
      this.exited = true;
      this.exitCode = code ?? (signal ? 1 : 0);
      const stderr = this.child.stderr;
      if (!stderr || stderr.readableEnded || stderr.destroyed)
        finish(code, signal);
      else {
        // A locally disconnected IPC pipe can prevent Node's aggregate close event.
        // The process exit and drained stderr are sufficient, including its final error.
        stderr.once("end", () => finish(code, signal));
        stderr.once("close", () => finish(code, signal));
      }
    });
    // Spawn failure can emit close without a process exit event.
    this.child.on("close", finish);
  }

  get pid() {
    return this.child.pid;
  }

  get diagnostics() {
    return this.stderrText;
  }

  postMessage(packet: unknown, onError?: (error: Error) => void) {
    const failed = (error: Error) => {
      if (onError) onError(error);
      else this.emit("error", error);
    };
    if (this.exited || this.stopping || !this.child.connected) {
      failed(Error("The data service is no longer connected."));
      return;
    }
    try {
      this.child.send(packet as Serializable, (error) => {
        if (error) failed(error);
      });
    } catch (error) {
      failed(error instanceof Error ? error : Error(String(error)));
    }
  }

  terminate(): Promise<number> {
    if (this.exited) return Promise.resolve(this.exitCode);
    if (this.stopping) return this.stopping;
    this.stopping = new Promise((resolve) => {
      const force = setTimeout(() => this.child.kill(), 2500);
      force.unref();
      this.once("exit", () => {
        clearTimeout(force);
        resolve(this.exitCode);
      });
      try {
        if (!this.child.connected) this.child.kill();
        else
          this.child.send({ control: "shutdown" }, (error) => {
            if (error) this.child.kill();
          });
      } catch {
        this.child.kill();
      }
    });
    return this.stopping;
  }
}
