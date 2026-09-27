import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
import { MutatocClient, MutatocError } from "../../src/main/mutatoc-client";

class Engine extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  written = "";
  kill = vi.fn(() => this.emit("exit", null));
  constructor() {
    super();
    this.stdin.on("data", (chunk) => {
      this.written += chunk.toString();
    });
  }
  reply(value: unknown) {
    this.stdout.write(JSON.stringify(value) + "\n");
  }
}
let engines: Engine[];
let client: MutatocClient;
beforeEach(() => {
  vi.useFakeTimers();
  engines = [];
  spawn.mockReset().mockImplementation(() => {
    const engine = new Engine();
    engines.push(engine);
    return engine;
  });
  client = new MutatocClient("C:/runtime/mutatoc.exe", 100);
});
afterEach(async () => {
  client.close();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe("native process protocol", () => {
  it("launches a hidden persistent engine and preserves Unicode and escaped text in both directions", async () => {
    const text = '😀 alpha\n"beta"\t';
    const first = client.request({ op: "parse", text });
    const engine = engines[0];
    expect(spawn).toHaveBeenCalledWith(
      "C:/runtime/mutatoc.exe",
      ["--serve"],
      expect.objectContaining({ windowsHide: true, stdio: "pipe" }),
    );
    expect(JSON.parse(engine.written.trim())).toEqual({ op: "parse", text });
    const response = Buffer.from(
      JSON.stringify({ ok: true, result: { text } }) + "\r\n",
    );
    const cut = response.indexOf(Buffer.from("😀")) + 2;
    engine.stdout.write(response.subarray(0, cut));
    engine.stdout.write(response.subarray(cut, response.length - 1));
    engine.stdout.write(response.subarray(response.length - 1));
    await expect(first).resolves.toEqual({ text });
    const next = client.request({ op: "parse", text: "next" });
    engine.reply({ ok: true, result: "next" });
    await expect(next).resolves.toBe("next");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("rejects concurrent requests without losing the pending response", async () => {
    const first = client.request({ op: "parse", text: "first" });
    await expect(
      client.request({ op: "parse", text: "second" }),
    ).rejects.toThrow("Concurrent");
    engines[0].reply({ ok: true, result: "first" });
    await expect(first).resolves.toBe("first");
    expect(engines[0].written.trim().split("\n")).toHaveLength(1);
  });

  it("preserves native error codes and accepts a later successful request", async () => {
    const failed = client.request({ op: "parse" });
    engines[0].reply({
      ok: false,
      error: { code: 4, message: "Empty ontology" },
    });
    await expect(failed).rejects.toMatchObject({
      code: 4,
      message: "Empty ontology",
    });
    await expect(failed).rejects.toBeInstanceOf(MutatocError);
    const next = client.request({ op: "tokenize", text: "London" });
    engines[0].reply({ ok: true, result: [] });
    await expect(next).resolves.toEqual([]);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it.each(["not json", "null", "[]", "{}", '{"ok":1}'])(
    "discards malformed envelope %s and restarts cleanly",
    async (line) => {
      const failed = client.request({ op: "parse" });
      engines[0].stdout.write(line + "\n");
      await expect(failed).rejects.toThrow(/invalid/);
      const next = client.request({ op: "parse" });
      engines[0].reply({ ok: true, result: "late old response" });
      engines[0].emit("error", Error("late old error"));
      engines[0].emit("exit", 1);
      engines[1].reply({ ok: true, result: "fresh response" });
      await expect(next).resolves.toBe("fresh response");
    },
  );

  it("times out a stalled request and ignores late output from that process", async () => {
    const failed = client.request({ op: "parse" });
    const assertion = expect(failed).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    const next = client.request({ op: "parse" });
    engines[0].reply({ ok: true, result: "late" });
    engines[1].reply({ ok: true, result: "current" });
    await expect(next).resolves.toBe("current");
    await vi.advanceTimersByTimeAsync(1500);
    expect(engines[0].kill).toHaveBeenCalledOnce();
  });

  it.each(["process", "stdin"])(
    "rejects %s errors and can restart",
    async (origin) => {
      const failed = client.request({ op: "parse" });
      (origin === "stdin" ? engines[0].stdin : engines[0]).emit(
        "error",
        Error("broken pipe"),
      );
      await expect(failed).rejects.toThrow("broken pipe");
      const next = client.request({ op: "parse" });
      engines[1].reply({ ok: true, result: [] });
      await expect(next).resolves.toEqual([]);
    },
  );

  it("reports bounded stderr diagnostics when the engine exits", async () => {
    const failed = client.request({ op: "parse" });
    engines[0].stderr.write("x".repeat(5000) + "model missing");
    engines[0].emit("exit", 7);
    const error = await failed.then(
      () => {
        throw Error("Expected the engine exit to reject the request");
      },
      (error: Error) => error,
    );
    expect(error.message).toContain("stopped (7)");
    expect(error.message).toContain("model missing");
    expect(error.message.length).toBeLessThan(4100);
  });

  it("rejects a pending request on close and terminates a process that does not exit", async () => {
    const failed = client.request({ op: "parse" });
    client.close();
    await expect(failed).rejects.toThrow("closed");
    expect(engines[0].stdin.writableEnded).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(engines[0].kill).toHaveBeenCalledOnce();
  });

  it("cancels forced termination when the engine exits after stdin closes", async () => {
    const request = client.request({ op: "parse" });
    engines[0].reply({ ok: true, result: [] });
    await request;
    client.close();
    engines[0].emit("exit", 0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(engines[0].kill).not.toHaveBeenCalled();
  });

  it("discards unsolicited output instead of using it for the next request", async () => {
    const request = client.request({ op: "parse" });
    engines[0].reply({ ok: true, result: "first" });
    await request;
    engines[0].reply({ ok: true, result: "unsolicited" });
    const next = client.request({ op: "parse" });
    engines[1].reply({ ok: true, result: "second" });
    await expect(next).resolves.toBe("second");
  });
});
