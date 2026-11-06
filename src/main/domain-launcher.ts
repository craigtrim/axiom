// craigtrim/axiom#207: only this Chromium-launched relay forks the plain Node owner.
import path from "node:path";
import type { Serializable } from "node:child_process";
import { DomainProcess } from "./domain-process";
import type {
  DomainLauncherMessage,
  DomainLauncherRequest,
  LauncherError,
} from "./domain-service";

const channel = "axiom-domain-v1";
const parent = process.parentPort;
const [entrypoint, execPath, owner] = process.argv.slice(2);
const browserPid = Number(owner);
if (
  !parent ||
  !entrypoint ||
  !execPath ||
  !path.isAbsolute(entrypoint) ||
  !path.isAbsolute(execPath) ||
  !Number.isSafeInteger(browserPid) ||
  browserPid <= 0
)
  throw Error(
    "The data launcher requires its trusted runtime paths and owner.",
  );

const child = new DomainProcess(entrypoint, { execPath });
let stopping = false;
let ownerWatch: ReturnType<typeof setInterval> | undefined;
let nodeExitCode: number | undefined;
function send(message: DomainLauncherMessage) {
  parent.postMessage(message);
}
function errorData(error: unknown): LauncherError {
  const value = error instanceof Error ? error : Error(String(error));
  const code = (value as NodeJS.ErrnoException).code;
  return {
    message: value.message.slice(-65536),
    stack: value.stack?.slice(-65536),
    ...(code ? { code } : {}),
  };
}
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(ownerWatch);
  void child.terminate().catch(() => child.child.kill());
}

child.on("message", (packet: unknown) => {
  // Both sides of this port use Electron's V8; Float64Array frames clone directly.
  send({ channel, type: "packet", packet });
});
child.child.stderr?.on("data", (chunk: string) => {
  send({ channel, type: "stderr", text: chunk.slice(-65536) });
});
child.on("error", (error: unknown) => {
  send({
    channel,
    type: "error",
    error: errorData(error),
    connected: child.child.connected,
    diagnostics: child.diagnostics,
  });
});
child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
  nodeExitCode = code ?? (signal ? 1 : 0);
  // The browser acknowledges this envelope before the relay exits; loss of its
  // parent must still let the relay stop without waiting for an acknowledgment.
  setTimeout(() => process.exit(nodeExitCode), 1000);
  send({ channel, type: "exit", code, signal, diagnostics: child.diagnostics });
});
parent.on("message", ({ data }: { data: DomainLauncherRequest }) => {
  if (!data || data.channel !== channel) return;
  if (data.type === "shutdown") {
    shutdown();
    return;
  }
  if (data.type === "exit-ack") {
    if (nodeExitCode !== undefined) process.exit(nodeExitCode);
    return;
  }
  if (data.type !== "request") return;
  const { serial, packet } = data;
  const acknowledged = (error: Error | null) => {
    send({
      channel,
      type: "sent",
      serial,
      ...(error ? { error: errorData(error) } : {}),
    });
  };
  if (stopping || !child.child.connected) {
    acknowledged(Error("The data service is no longer connected."));
    return;
  }
  try {
    // ChildProcess.send's completion callback reports asynchronous write failures.
    child.child.send(packet as Serializable, acknowledged);
  } catch (error) {
    acknowledged(error instanceof Error ? error : Error(String(error)));
  }
});

// parentPort has no close event. Browser loss still must not leave the Node owner alive.
ownerWatch = setInterval(() => {
  try {
    process.kill(browserPid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") shutdown();
  }
}, 1000);
ownerWatch.unref();
const fatal = (error: unknown) => {
  const detail = errorData(error);
  process.stderr.write((detail.stack ?? detail.message) + "\n");
  try {
    send({
      channel,
      type: "error",
      error: detail,
      connected: false,
      diagnostics: child.diagnostics,
    });
  } catch {
    // Cleanup remains necessary when the parent cannot accept another message.
  }
  shutdown();
};
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
process.once("exit", () => {
  if (child.child.exitCode === null && child.child.signalCode === null)
    child.child.kill();
});
child.child.once("spawn", () => {
  send({ channel, type: "ready", pid: child.pid! });
});
