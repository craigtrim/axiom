// craigtrim/axiom#207: the relay preserves request delivery and the owned process lifetime.
import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  DOMAIN_LAUNCHER_CHANNEL,
  DomainService,
  type DomainLauncher,
  type DomainLauncherFork,
  type DomainLauncherMessage,
  type DomainLauncherRequest,
} from "../../src/main/domain-service";

type WithoutChannel<T> = T extends { channel: string }
  ? Omit<T, "channel">
  : never;

class FakeUtility extends EventEmitter {
  pid = 81001;
  stderr = new PassThrough();
  postMessage = vi.fn<(message: DomainLauncherRequest) => void>();
  kill = vi.fn(() => true);

  message(message: WithoutChannel<DomainLauncherMessage>) {
    this.emit("message", { channel: DOMAIN_LAUNCHER_CHANNEL, ...message });
  }
}

const utilities: FakeUtility[] = [];
afterEach(() => {
  for (const utility of utilities.splice(0)) {
    utility.emit("exit", 1);
    utility.stderr.destroy();
  }
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function fixture() {
  const utility = new FakeUtility();
  utilities.push(utility);
  const fork = vi.fn<DomainLauncherFork>(
    () => utility as unknown as DomainLauncher,
  );
  const service = new DomainService("C:\\application\\domain-worker.cjs", {
    execPath: "C:\\application\\node.exe",
    launcher: "C:\\application\\domain-launcher.cjs",
    fork,
  });
  const errors = vi.fn();
  const exits = vi.fn();
  service.on("error", errors);
  service.on("exit", exits);
  const ready = () => utility.message({ type: "ready", pid: 81002 });
  const requests = () =>
    utility.postMessage.mock.calls.flatMap(([message]) =>
      message.type === "request" ? [message] : [],
    );
  return { utility, fork, service, errors, exits, ready, requests };
}

it("starts the trusted helper with runtime paths and removes inherited Node flags", () => {
  vi.stubEnv("ELECTRON_RUN_AS_NODE", "1");
  vi.stubEnv("NODE_OPTIONS", "--inspect");
  const f = fixture();
  expect(f.fork).toHaveBeenCalledOnce();
  const [entrypoint, args, options] = f.fork.mock.calls[0];
  expect(entrypoint).toBe("C:\\application\\domain-launcher.cjs");
  expect(args).toEqual([
    "C:\\application\\domain-worker.cjs",
    "C:\\application\\node.exe",
    String(process.pid),
  ]);
  expect(options.env).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
  expect(options.env).not.toHaveProperty("NODE_OPTIONS");
  expect(options.stdio).toEqual(["ignore", "ignore", "pipe"]);
  expect(f.service.pid).toBeUndefined();
  f.ready();
  expect(f.service.pid).toBe(81002);
  expect(f.service.pid).not.toBe(f.utility.pid);
});

it("delivers an immediate configure request exactly once and in order after helper readiness", () => {
  const f = fixture();
  const configure = {
    id: 1,
    method: "configureDataService",
    args: { directory: "scratch" },
  };
  const select = { id: 2, method: "select", args: { iri: "urn:School" } };
  f.service.postMessage(configure);
  f.service.postMessage(select);
  expect(f.utility.postMessage).not.toHaveBeenCalled();
  f.ready();
  expect(f.requests().map((request) => request.packet)).toEqual([
    configure,
    select,
  ]);
  expect(new Set(f.requests().map((request) => request.serial)).size).toBe(2);
  f.ready();
  expect(f.requests().map((request) => request.packet)).toEqual([
    configure,
    select,
  ]);
});

it("forwards already cloned position frames without decoding their typed data again", () => {
  const f = fixture();
  const received = vi.fn();
  f.service.on("message", received);
  const positions = new Float64Array([
    0.25,
    -0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]);
  const packet = {
    event: {
      type: "positions",
      data: { positions, graphId: "graph", revision: 1 },
    },
  };
  f.utility.message({ type: "packet", packet });
  expect(received).toHaveBeenCalledOnce();
  expect(received.mock.calls[0][0]).toBe(packet);
  expect(received.mock.calls[0][0].event.data.positions).toBe(positions);
  f.utility.emit("message", {
    channel: "unrelated-channel",
    type: "packet",
    packet,
  });
  expect(received).toHaveBeenCalledOnce();
});

it("clears acknowledged sends and reports each asynchronous write failure only once", () => {
  const f = fixture();
  f.ready();
  const delivered = vi.fn();
  const failed = vi.fn();
  const abandoned = vi.fn();
  f.service.postMessage({ id: 1 }, delivered);
  f.service.postMessage({ id: 2 }, failed);
  f.service.postMessage({ id: 3 }, abandoned);
  const [first, second] = f.requests();
  f.utility.message({ type: "sent", serial: first.serial });
  const rejection = {
    type: "sent" as const,
    serial: second.serial,
    error: { message: "The native pipe closed.", code: "EPIPE" },
  };
  f.utility.message(rejection);
  f.utility.message(rejection);
  expect(failed).toHaveBeenCalledOnce();
  expect(failed.mock.calls[0][0]).toMatchObject({
    message: "The native pipe closed.",
    code: "EPIPE",
  });
  expect(failed.mock.calls[0][0]).toBeInstanceOf(Error);
  f.utility.emit("exit", 9);
  f.utility.emit("exit", 9);
  expect(delivered).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledOnce();
  expect(abandoned).toHaveBeenCalledOnce();
  expect(abandoned.mock.calls[0][0].message).toContain("no longer connected");
  expect(f.exits).toHaveBeenCalledOnce();
});

it("cleans up a synchronously failed send and uses the error event when no callback was supplied", () => {
  const f = fixture();
  f.ready();
  const failed = vi.fn();
  f.utility.postMessage.mockImplementationOnce(() => {
    throw Error("Relay port closed.");
  });
  f.service.postMessage({ id: 1 }, failed);
  expect(failed).toHaveBeenCalledOnce();
  expect(failed.mock.calls[0][0].message).toBe("Relay port closed.");
  f.utility.postMessage.mockImplementationOnce(() => {
    throw Error("Second write failed.");
  });
  f.service.postMessage({ id: 2 });
  expect(f.errors).toHaveBeenCalledOnce();
  expect(f.errors.mock.calls[0][0].message).toBe("Second write failed.");
  f.utility.emit("exit", 8);
  expect(failed).toHaveBeenCalledOnce();
  expect(f.errors).toHaveBeenCalledOnce();
});

it("rejects startup work if the helper exits before ready and never restarts it", () => {
  const f = fixture();
  const order: string[] = [];
  const failed = vi.fn(() => {
    order.push("request failure");
  });
  f.service.once("exit", () => {
    order.push("exit diagnostics");
  });
  f.service.postMessage({ id: 1, method: "configureDataService" }, failed);
  f.utility.emit("error", Error("Helper could not start."));
  f.utility.emit("exit", 7);
  expect(failed).toHaveBeenCalledOnce();
  expect(order).toEqual(["exit diagnostics", "request failure"]);
  expect(f.errors.mock.calls[0][0].message).toBe("Helper could not start.");
  expect(f.exits).toHaveBeenCalledExactlyOnceWith(7, null);
  expect(f.service.connected).toBe(false);
  f.ready();
  expect(f.utility.postMessage).not.toHaveBeenCalled();
  const later = vi.fn();
  f.service.postMessage({ id: 2 }, later);
  expect(later).toHaveBeenCalledOnce();
  expect(later.mock.calls[0][0].message).toContain("no longer connected");
  expect(f.fork).toHaveBeenCalledOnce();
});

it("reports Node's fatal code and final diagnostics once after the helper exits", () => {
  const f = fixture();
  f.ready();
  f.utility.stderr.emit("data", Buffer.from("x".repeat(80000)));
  expect(f.service.diagnostics.length).toBeLessThanOrEqual(65536);
  f.utility.message({
    type: "exit",
    code: 12,
    signal: null,
    diagnostics: "Final ontology failure.",
  });
  expect(f.service.connected).toBe(false);
  expect(f.exits).not.toHaveBeenCalled();
  f.utility.emit("exit", 0);
  f.utility.emit("exit", 0);
  expect(f.exits).toHaveBeenCalledExactlyOnceWith(12, null);
  expect(f.service.diagnostics).toBe("Final ontology failure.");
});

it("treats an unexplained zero helper exit as failure", () => {
  const f = fixture();
  f.ready();
  f.utility.emit("exit", 0);
  expect(f.exits).toHaveBeenCalledExactlyOnceWith(1, null);
});

it("ignores late relay packets and ready messages after the terminal helper exit", () => {
  const f = fixture();
  f.ready();
  const received = vi.fn();
  f.service.on("message", received);
  f.utility.emit("exit", 7);
  const sendsBeforeLatePackets = f.utility.postMessage.mock.calls.length;
  f.utility.message({ type: "ready", pid: 99999 });
  f.utility.message({
    type: "packet",
    packet: { id: 1, value: "late result" },
  });
  f.utility.message({
    type: "error",
    error: { message: "Late failure." },
    connected: true,
    diagnostics: "Late diagnostics.",
  });
  f.utility.message({ type: "exit", code: 0, signal: null, diagnostics: "" });
  expect(f.service.pid).toBe(81002);
  expect(f.service.connected).toBe(false);
  expect(received).not.toHaveBeenCalled();
  expect(f.errors).not.toHaveBeenCalled();
  expect(f.exits).toHaveBeenCalledExactlyOnceWith(7, null);
  expect(f.utility.postMessage).toHaveBeenCalledTimes(sendsBeforeLatePackets);
});

it("waits for the helper's actual exit after requesting one graceful shutdown", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.ready();
  const stopped = vi.fn();
  const termination = f.service.terminate();
  void termination.then(stopped);
  expect(f.service.terminate()).toBe(termination);
  expect(
    f.utility.postMessage.mock.calls.map(([message]) => message.type),
  ).toEqual(["shutdown"]);
  f.utility.message({ type: "exit", code: 0, signal: null, diagnostics: "" });
  await Promise.resolve();
  expect(stopped).not.toHaveBeenCalled();
  f.utility.emit("exit", 0);
  await expect(termination).resolves.toBe(0);
  expect(f.utility.kill).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("queues shutdown until a starting helper can receive it", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const termination = f.service.terminate();
  expect(f.utility.postMessage).not.toHaveBeenCalled();
  f.ready();
  f.ready();
  expect(
    f.utility.postMessage.mock.calls.map(([message]) => message.type),
  ).toEqual(["shutdown"]);
  f.utility.message({ type: "exit", code: 0, signal: null, diagnostics: "" });
  f.utility.emit("exit", 0);
  await expect(termination).resolves.toBe(0);
  expect(f.utility.kill).not.toHaveBeenCalled();
});

it("forces an unresponsive helper after twelve seconds and still waits for its exit event", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.ready();
  const stopped = vi.fn();
  const termination = f.service.terminate();
  void termination.then(stopped);
  await vi.advanceTimersByTimeAsync(11999);
  expect(f.utility.kill).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.utility.kill).toHaveBeenCalledOnce();
  expect(stopped).not.toHaveBeenCalled();
  f.utility.emit("exit", 0);
  await expect(termination).resolves.toBe(1);
  await vi.advanceTimersByTimeAsync(12000);
  expect(f.utility.kill).toHaveBeenCalledOnce();
});

// craigtrim/axiom#208: abandoned framed sends must remain visible in the crash timeline.
it("retains late send failures after Node exit until the helper's terminal snapshot", () => {
  const f = fixture();
  f.ready();
  const order: string[] = [];
  f.service.on("exit", () => order.push("exit"));
  f.service.postMessage({ id: 1 }, () => order.push("pending rejected"));
  const serial = f.requests()[0].serial;
  f.utility.message({
    type: "exit",
    code: 7,
    signal: null,
    diagnostics: "Node failed",
  });
  f.utility.message({
    type: "sent",
    serial,
    error: { message: "The data service is no longer connected." },
  });
  expect(order).toEqual([]);
  f.utility.emit("exit", 0);
  expect(order).toEqual(["exit", "pending rejected"]);
  expect(f.exits).toHaveBeenCalledExactlyOnceWith(7, null);
});
