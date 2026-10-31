// craigtrim/axiom#188: the preload checks each export write before IPC copies it into the main process.
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { MAX_STREAM_CHUNK } from "../../src/shared/raster-layout";
import type { AxiomBridge } from "../../src/shared/protocol";
const mocks = vi.hoisted(() => ({
  bridge: undefined as unknown,
  invoke: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (_key: string, value: unknown) => {
      mocks.bridge = value;
    },
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));
let axiom: AxiomBridge;
beforeAll(async () => {
  await import("../../src/main/preload");
  axiom = mocks.bridge as AxiomBridge;
});
beforeEach(() => mocks.invoke.mockReset());
it("sends an export write as its own bytes when it views a larger buffer", async () => {
  mocks.invoke.mockResolvedValue(undefined);
  const buffer = new Uint8Array(1024).map((_, i) => i & 255);
  await axiom.exportWrite("id", buffer.subarray(10, 13));
  const [channel, id, sent] = mocks.invoke.mock.calls[0];
  expect([channel, id]).toEqual(["export:write", "id"]);
  expect(sent.buffer.byteLength).toBe(3);
  expect([...sent]).toEqual([10, 11, 12]);
});
it("refuses empty, oversized and non-byte writes without sending them", async () => {
  for (const chunk of [
    new Uint8Array(0),
    new Uint8Array(MAX_STREAM_CHUNK + 1),
    "bytes" as unknown as Uint8Array,
  ])
    await expect(axiom.exportWrite("id", chunk)).rejects.toThrow(
      "Invalid export data.",
    );
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it("keeps one export write in flight", async () => {
  let finish!: () => void;
  mocks.invoke.mockReturnValueOnce(
    new Promise<void>((resolve) => (finish = resolve)),
  );
  const first = axiom.exportWrite("id", new Uint8Array(1));
  await expect(axiom.exportWrite("id", new Uint8Array(1))).rejects.toThrow(
    "Wait for the previous export write.",
  );
  finish();
  await first;
  mocks.invoke.mockResolvedValue(undefined);
  await axiom.exportWrite("id", new Uint8Array(1));
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
});
it("no longer offers the old whole-image export route", () => {
  expect("exportFile" in axiom).toBe(false);
});
