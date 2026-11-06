// craigtrim/axiom#207: Chromium launches the relay with an explicit Windows handle list.
import { EventEmitter } from "node:events";
import type { ForkOptions, UtilityProcess } from "electron";

export const DOMAIN_LAUNCHER_CHANNEL = "axiom-domain-v1";

export type DomainLauncher = Pick<
  UtilityProcess,
  "on" | "once" | "postMessage" | "kill" | "pid" | "stderr"
>;
export type DomainLauncherFork = (
  entrypoint: string,
  args: string[],
  options: ForkOptions,
) => DomainLauncher;

export type LauncherError = { message: string; stack?: string; code?: string };
export type DomainLauncherRequest = {
  channel: typeof DOMAIN_LAUNCHER_CHANNEL;
} & (
  | { type: "request"; serial: number; packet: unknown }
  | { type: "shutdown" }
  | { type: "exit-ack" }
);
export type DomainLauncherMessage = {
  channel: typeof DOMAIN_LAUNCHER_CHANNEL;
} & (
  | { type: "ready"; pid: number }
  | { type: "packet"; packet: unknown }
  | { type: "sent"; serial: number; error?: LauncherError }
  | {
      type: "error";
      error: LauncherError;
      connected: boolean;
      diagnostics: string;
    }
  | { type: "stderr"; text: string }
  | {
      type: "exit";
      code: number | null;
      signal: NodeJS.Signals | null;
      diagnostics: string;
    }
);

function restoreError(value: LauncherError) {
  const error = Error(value.message);
  if (value.stack) error.stack = value.stack;
  if (value.code) Object.assign(error, { code: value.code });
  return error;
}

/** The relay owns plain Node; the Electron process only receives application packets. */
export class DomainService extends EventEmitter {
  readonly launcher: DomainLauncher;
  private nodePid?: number;
  private stderrText = "";
  private connectedState = true;
  private exited = false;
  private exitCode = 0;
  private nodeExit?: {
    code: number | null;
    signal: NodeJS.Signals | null;
  };
  private stopping?: Promise<number>;
  private ready = false;
  private queued: DomainLauncherRequest[] = [];
  private serial = 0;
  private sends = new Map<number, (error: Error) => void>();

  constructor(
    entryFile: string,
    options: {
      execPath: string;
      launcher: string;
      fork: DomainLauncherFork;
    },
  ) {
    super();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    this.launcher = options.fork(
      options.launcher,
      [entryFile, options.execPath, String(process.pid)],
      {
        env,
        stdio: ["ignore", "ignore", "pipe"],
        serviceName: "Axiom data launcher",
      },
    );
    this.launcher.stderr?.on("data", (chunk: Buffer | string) => {
      this.appendDiagnostics(String(chunk));
    });
    this.launcher.on("message", (message: DomainLauncherMessage) => {
      if (
        this.exited ||
        !message ||
        message.channel !== DOMAIN_LAUNCHER_CHANNEL
      )
        return;
      switch (message.type) {
        case "ready":
          this.nodePid = message.pid;
          if (!this.ready) {
            this.ready = true;
            const queued = this.queued;
            this.queued = [];
            for (const request of queued) this.send(request);
          }
          break;
        case "packet":
          this.emit("message", message.packet);
          break;
        case "sent": {
          const failed = this.sends.get(message.serial);
          this.sends.delete(message.serial);
          if (message.error) failed?.(restoreError(message.error));
          break;
        }
        case "stderr":
          this.appendDiagnostics(message.text);
          break;
        case "error":
          this.connectedState = message.connected;
          this.stderrText = message.diagnostics.slice(-65536);
          this.emit("error", restoreError(message.error));
          break;
        case "exit":
          this.connectedState = false;
          this.nodeExit = { code: message.code, signal: message.signal };
          this.stderrText = message.diagnostics.slice(-65536);
          // Keep the relay alive until the final Node status has reached its owner.
          this.send({ channel: DOMAIN_LAUNCHER_CHANNEL, type: "exit-ack" });
          break;
      }
    });
    this.launcher.on(
      "error",
      (type: unknown, location?: string, report?: string) => {
        // Preserve an ordinary Error injected by supervision tests or a recoverable source.
        if (type instanceof Error) {
          this.emit("error", type);
          return;
        }
        this.connectedState = false;
        if (report) this.appendDiagnostics(String(report));
        this.emit(
          "error",
          Error(
            `The data launcher failed: ${type}${location ? " at " + location : ""}.`,
          ),
        );
      },
    );
    this.launcher.on("exit", (code) => {
      if (this.exited) return;
      this.exited = true;
      this.connectedState = false;
      // utility.kill() returns zero on Windows even when the Node owner never exited.
      const result = this.nodeExit ?? {
        code: code || 1,
        signal: null,
      };
      this.exitCode = result.code ?? (result.signal ? 1 : 0);
      const failure = Error("The data service is no longer connected.");
      const sends = [...this.sends.values()];
      this.sends.clear();
      this.queued = [];
      try {
        // Main records the pending RPCs before send callbacks remove them.
        this.emit("exit", result.code, result.signal);
      } finally {
        for (const failed of sends) failed(failure);
      }
    });
  }

  private appendDiagnostics(text: string) {
    this.stderrText = (this.stderrText + text).slice(-65536);
  }

  private send(message: DomainLauncherRequest) {
    try {
      this.launcher.postMessage(message);
    } catch (error) {
      if (message.type === "request") {
        const failed = this.sends.get(message.serial);
        this.sends.delete(message.serial);
        failed?.(error instanceof Error ? error : Error(String(error)));
      } else this.launcher.kill();
    }
  }

  private enqueue(message: DomainLauncherRequest) {
    if (this.ready) this.send(message);
    else this.queued.push(message);
  }

  get pid() {
    return this.nodePid;
  }

  get connected() {
    return this.connectedState && !this.stopping;
  }

  get diagnostics() {
    return this.stderrText;
  }

  postMessage(packet: unknown, onError?: (error: Error) => void) {
    const failed = (error: Error) => {
      if (onError) onError(error);
      else this.emit("error", error);
    };
    if (!this.connected) {
      failed(Error("The data service is no longer connected."));
      return;
    }
    const serial = ++this.serial;
    this.sends.set(serial, failed);
    this.enqueue({
      channel: DOMAIN_LAUNCHER_CHANNEL,
      type: "request",
      serial,
      packet,
    });
  }

  terminate(): Promise<number> {
    if (this.exited) return Promise.resolve(this.exitCode);
    if (this.stopping) return this.stopping;
    this.stopping = new Promise((resolve) => {
      // DomainProcess gives its owned Node child 2.5 seconds before forcing it down.
      const force = setTimeout(() => this.launcher.kill(), 4000);
      force.unref();
      this.once("exit", () => {
        clearTimeout(force);
        resolve(this.exitCode);
      });
      this.enqueue({ channel: DOMAIN_LAUNCHER_CHANNEL, type: "shutdown" });
    });
    return this.stopping;
  }
}
