import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// craigtrim/axiom#40: the one runtime version Text Analysis accepts.
export const MUTATOC_VERSION = "0.4.0";

export class MutatocError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
  }
}

export function mutatocExecutable(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
) {
  const executable = process.platform === "win32" ? "mutatoc.exe" : "mutatoc";
  const configured = process.env.AXIOM_MUTATOC_HOME;
  const candidates = configured
    ? [path.resolve(configured, executable)]
    : packaged
      ? [path.join(resourcesPath, "mutatoc", executable)]
      : [
          path.join(appPath, "vendor", "mutatoc", executable),
          path.resolve(
            appPath,
            `../mutatos/mutatoc/dist/mutatoc-win-x64-${MUTATOC_VERSION}`,
            executable,
          ),
        ];
  const found = candidates.find((file) => existsSync(file));
  if (!found)
    throw Error(
      "The Text Analysis runtime is missing. Install the complete mutatoc package in vendor/mutatoc or set AXIOM_MUTATOC_HOME to its folder, then reopen this view.",
    );
  return found;
}

/** One native engine for the lifetime of the view's analysis service. */
export class MutatocClient {
  private child?: ChildProcessWithoutNullStreams;
  private waiting?: {
    resolve(value: any): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
  };
  private output = "";
  private diagnostics = "";
  constructor(
    private executable: string,
    private timeout = 125_000,
  ) {}
  private start() {
    if (this.child) return;
    const child = spawn(this.executable, ["--serve"], {
      cwd: path.dirname(this.executable),
      windowsHide: true,
      stdio: "pipe",
    });
    this.child = child;
    this.output = "";
    this.diagnostics = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (s: string) => {
      this.diagnostics = (this.diagnostics + s).slice(-4000);
    });
    const failed = (error: Error) => {
      if (this.child !== child) return;
      this.stop(error);
    };
    child.on("error", failed);
    child.stdin.on("error", failed);
    child.on("exit", (code) =>
      failed(
        Error(
          `Text Analysis stopped (${code ?? "signal"}). ${this.diagnostics}`.trim(),
        ),
      ),
    );
    child.stdout.on("data", (chunk: string) => {
      if (this.child !== child) return;
      this.output += chunk;
      if (this.output.length > 64 * 1024 * 1024) {
        failed(Error("The Text Analysis response exceeded 64 MiB."));
        return;
      }
      let end: number;
      while ((end = this.output.indexOf("\n")) >= 0) {
        const line = this.output.slice(0, end);
        this.output = this.output.slice(end + 1);
        const pending = this.waiting;
        if (!pending) {
          failed(Error("Unexpected Text Analysis response."));
          return;
        }
        let response: {
          ok: boolean;
          result?: unknown;
          error?: { message?: string; code?: number };
        };
        try {
          response = JSON.parse(line);
        } catch {
          failed(Error("Text Analysis returned invalid JSON."));
          return;
        }
        if (!response || typeof response.ok !== "boolean") {
          failed(Error("Text Analysis returned an invalid response."));
          return;
        }
        clearTimeout(pending.timer);
        this.waiting = undefined;
        if (response.ok === true) pending.resolve(response.result);
        else
          pending.reject(
            new MutatocError(
              response.error?.message || "Text Analysis failed.",
              response.error?.code,
            ),
          );
      }
    });
  }
  request<T>(input: Record<string, unknown>): Promise<T> {
    if (this.waiting)
      return Promise.reject(
        Error("Concurrent mutatoc requests are not supported."),
      );
    this.start();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.stop(
            Error("Text Analysis timed out. Edit the text to try again."),
          ),
        this.timeout,
      );
      this.waiting = { resolve, reject, timer };
      this.child!.stdin.write(JSON.stringify(input) + "\n", "utf8", (error) => {
        if (error) this.stop(error);
      });
    });
  }
  close() {
    this.stop(Error("Text Analysis closed."));
  }
  private stop(error: Error) {
    const child = this.child;
    this.child = undefined;
    if (this.waiting) {
      clearTimeout(this.waiting.timer);
      this.waiting.reject(error);
      this.waiting = undefined;
    }
    this.output = "";
    if (!child) return;
    child.stdin.end();
    // Closing stdin lets the engine dispose of its loaded ontology.
    const timer = setTimeout(() => child.kill(), 1500);
    timer.unref();
    child.once("exit", () => clearTimeout(timer));
  }
}
