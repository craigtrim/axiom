import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { entity } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import {
  batchModes,
  SuggestionBusyError,
  type BatchMode,
  type BatchRequest,
} from "../../src/shared/suggestion-batches";
import {
  SuggestionBatches,
  type BatchRunner,
} from "../../src/main/suggestion-batches";

let root: string, s: Snapshot, service: SuggestionBatches, runner: BatchRunner;
const services: SuggestionBatches[] = [];
const input = (
  iris = ["urn:parent", "urn:other"],
  mode: BatchMode = "children",
): BatchRequest => ({ iris, mode, provider: "codex", datasetEpoch: 1 });
const wait = async (states: string[]) => {
  await vi.waitFor(
    async () =>
      expect((await service.history())[0].runs.map((r) => r.state)).toEqual(
        states,
      ),
    { timeout: 4000, interval: 20 },
  );
};
function create() {
  const instance = new SuggestionBatches(
    root,
    async () => structuredClone(s),
    runner,
    () => {},
  );
  services.push(instance);
  return instance;
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "axiom-batches-"));
  s = {
    datasetEpoch: 1,
    version: 1,
    ontology: { namespace: "urn:test:" },
    entities: [
      {
        ...entity("urn:parent", "Class"),
        name: "Parent",
        children: ["urn:child"],
      },
      {
        ...entity("urn:child", "Class"),
        name: "Child",
        parents: ["urn:parent"],
        children: ["urn:grandchild"],
      },
      {
        ...entity("urn:grandchild", "Class"),
        name: "Grandchild",
        parents: ["urn:child"],
      },
      { ...entity("urn:other", "Defined"), name: "Other" },
      entity("urn:property", "ObjectProperty"),
    ],
  } as Snapshot;
  runner = {
    busy: () => false,
    run: vi.fn(async () => 3),
    cancel: vi.fn(),
    hasRun: async () => true,
  };
  service = create();
});
afterEach(() => {
  services.splice(0).forEach((s) => s.close());
});
describe("suggestions for explicit selected nodes", () => {
  it.each(Object.keys(batchModes) as BatchMode[])(
    "captures only selected targets for %s, deduplicated",
    async (mode) => {
      const batch = await service.enqueue(
        input(["urn:parent", "urn:other", "urn:parent"], mode),
      );
      await wait(["completed", "completed"]);
      expect(batch.runs.map((r) => r.iri)).toEqual(["urn:parent", "urn:other"]);
      const calls = vi.mocked(runner.run).mock.calls;
      expect(calls.map((c) => c[1].iri)).toEqual(["urn:parent", "urn:other"]);
      expect(calls.map((c) => c[0].mode)).toEqual([mode, mode]);
      const saved = JSON.parse(
        await readFile(path.join(root, batch.id + ".json"), "utf8"),
      );
      expect(saved.runs.map((r: { count: number }) => r.count)).toEqual([3, 3]);
    },
  );
  it("runs parent and explicitly selected child separately, but never the grandchild", async () => {
    await service.enqueue(input(["urn:parent", "urn:child"]));
    await wait(["completed", "completed"]);
    expect(vi.mocked(runner.run).mock.calls.map((c) => c[1].iri)).toEqual([
      "urn:parent",
      "urn:child",
    ]);
  });
  it("queues more than 100 selected nodes without truncation", async () => {
    runner.busy = () => true;
    s.entities = Array.from({ length: 250 }, (_, i) => ({
      ...entity("urn:node:" + i, "Class"),
      instances: 0,
      descendants: 0,
    }));
    const batch = await service.enqueue(input(s.entities.map((e) => e.iri)));
    expect(batch.runs).toHaveLength(250);
    expect(new Set(batch.runs.map((r) => r.id)).size).toBe(250);
  });
  it("waits for an existing single-node run and continues sequentially", async () => {
    let busy = true,
      resolve: (n: number) => void = () => {};
    runner.busy = () => busy;
    runner.run = vi.fn(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    await service.enqueue(input());
    await new Promise((r) => setTimeout(r, 220));
    expect(runner.run).not.toHaveBeenCalled();
    busy = false;
    await wait(["running", "queued"]);
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(1));
    resolve(0);
    await wait(["completed", "running"]);
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(2));
    resolve(2);
    await wait(["completed", "completed"]);
  });
  it("retries a busy reservation race without dropping or duplicating a target", async () => {
    vi.mocked(runner.run).mockRejectedValueOnce(
      new SuggestionBusyError("Wait"),
    );
    await service.enqueue(input(["urn:parent"]));
    await wait(["completed"]);
    expect(runner.run).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(runner.run).mock.calls;
    expect(calls[0][1].id).toBe(calls[1][1].id);
  });
  it("continues after one failure and distinguishes an empty successful result", async () => {
    vi.mocked(runner.run)
      .mockRejectedValueOnce(Error("Assistant unavailable"))
      .mockResolvedValueOnce(0);
    await service.enqueue(input());
    await wait(["failed", "completed"]);
    const runs = (await service.history())[0].runs;
    expect(runs[0].error).toBe("Assistant unavailable");
    expect(runs[1].count).toBe(0);
  });
  it("cancels a queued row without cancelling another active run", async () => {
    runner.busy = () => true;
    const batch = await service.enqueue(input());
    await service.cancel(batch.id, batch.runs[1].id);
    runner.busy = () => false;
    await wait(["completed", "cancelled"]);
    expect(runner.cancel).not.toHaveBeenCalled();
    expect(runner.run).toHaveBeenCalledTimes(1);
  });
  it("cancels an active request and all remaining rows without losing prior results", async () => {
    let resolve: (n: number) => void = () => {};
    vi.mocked(runner.run).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const batch = await service.enqueue(input());
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(1));
    await service.cancel(batch.id);
    resolve(1);
    await wait(["cancelled", "cancelled"]);
    expect(runner.cancel).toHaveBeenCalledTimes(1);
    expect(runner.run).toHaveBeenCalledTimes(1);
  });
  it("cancels pending work when the workspace changes, even with the same namespace", async () => {
    runner.busy = () => true;
    await service.enqueue(input());
    s.datasetEpoch = 2;
    service.workspaceChanged(2);
    runner.busy = () => false;
    await wait(["cancelled", "cancelled"]);
    expect(runner.run).not.toHaveBeenCalled();
  });
  it("uses fresh versions for later nodes and fails a removed target without invoking it", async () => {
    vi.mocked(runner.run).mockImplementationOnce(async () => {
      s.version = 9;
      s.entities = s.entities.filter((e) => e.iri !== "urn:other");
      return 1;
    });
    await service.enqueue(input());
    await wait(["completed", "failed"]);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect((await service.history())[0].runs[1].error).toMatch(/removed/);
  });
  it("restores history without restarting interrupted requests", async () => {
    runner.busy = () => true;
    const batch = await service.enqueue(input());
    service.close();
    service = create();
    const restored = (await service.history())[0];
    expect(restored.id).toBe(batch.id);
    expect(restored.runs.map((r) => r.state)).toEqual([
      "interrupted",
      "interrupted",
    ]);
    expect(runner.run).not.toHaveBeenCalled();
  });
  it("returns isolated histories that cannot mutate the queue", async () => {
    runner.busy = () => true;
    await service.enqueue(input());
    const history = await service.history();
    history[0].runs[0].iri = "urn:grandchild";
    expect((await service.history())[0].runs[0].iri).toBe("urn:parent");
  });
  it("cancels on namespace changes within the same dataset", async () => {
    runner.busy = () => true;
    await service.enqueue(input());
    s.ontology.namespace = "urn:changed:";
    runner.busy = () => false;
    await wait(["cancelled", "cancelled"]);
    expect(runner.run).not.toHaveBeenCalled();
  });
  it("reflects cancellation from an existing single-node review", async () => {
    vi.mocked(runner.run).mockRejectedValueOnce(
      Error("Suggestions cancelled."),
    );
    await service.enqueue(input());
    await wait(["cancelled", "completed"]);
  });
  it.each([
    { iris: [] },
    { iris: ["urn:missing"] },
    { iris: ["urn:property"] },
    { datasetEpoch: 2 },
    { mode: "define" },
    { provider: "unknown" },
  ])(
    "rejects invalid requests without partially queuing: %j",
    async (change) => {
      await expect(
        service.enqueue({ ...input(), ...change } as BatchRequest),
      ).rejects.toThrow();
      expect(await service.history()).toEqual([]);
    },
  );
  it("supports synonyms on properties but excludes anonymous nodes", async () => {
    await service.enqueue(input(["urn:property"], "synonyms"));
    await wait(["completed"]);
    s.entities.push({
      ...entity("_:anonymous", "Class"),
      instances: 0,
      descendants: 0,
    });
    await expect(
      service.enqueue(input(["urn:parent", "_:anonymous"], "synonyms")),
    ).rejects.toThrow();
  });
});
