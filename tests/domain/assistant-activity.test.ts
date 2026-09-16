import { it, expect, vi } from "vitest";
import {
  AssistantActivityStore,
  type AssistantKind,
  type AssistantActivity,
} from "../../src/renderer/assistant-activity";
function deferred<T = void>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it.each(["research", "query", "taxonomy"] as AssistantKind[])(
  "reserves %s synchronously against 100 repeated invocations",
  async (kind) => {
    const store = new AssistantActivityStore(),
      work = deferred<string>();
    const run = vi.fn(() => work.promise),
      cancel = vi.fn(async () => {});
    const pending = store.run(kind, "Codex working", run, cancel);
    const duplicates = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        store.run(kind, "duplicate", run, cancel),
      ),
    );
    expect(duplicates.every((r) => r.status === "rejected")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.get(kind)?.label).toBe("Codex working");
    work.resolve("done");
    await expect(pending).resolves.toBe("done");
    expect(store.get(kind)).toBeUndefined();
  },
);
it("rejects stale idle and running polls across launch and completion", async () => {
  const store = new AssistantActivityStore(),
    idle = deferred<AssistantActivity | undefined>();
  const poll = store.reconcile("research", () => idle.promise);
  const work = deferred();
  const pending = store.run(
    "research",
    "Researching Thing",
    () => work.promise,
    async () => {},
  );
  idle.resolve(undefined);
  await poll;
  expect(store.get("research")?.label).toBe("Researching Thing");
  const read = vi.fn(async () => undefined);
  await store.reconcile("research", read);
  expect(read).not.toHaveBeenCalled();
  work.resolve();
  await pending;
  const late = deferred<AssistantActivity | undefined>();
  const latePoll = store.reconcile("research", () => late.promise);
  await store.run(
    "research",
    "next",
    async () => {},
    async () => {},
  );
  late.resolve({ label: "old", startedAt: 1 });
  await latePoll;
  expect(store.get("research")).toBeUndefined();
});
it("cancels during preparation without launching, holds the lock until settled, then permits retry", async () => {
  const store = new AssistantActivityStore(),
    preparation = deferred(),
    launch = vi.fn();
  const cancel = vi.fn(async () => {});
  const pending = store.run(
    "query",
    "Preparing",
    async (check) => {
      await preparation.promise;
      check();
      launch();
    },
    cancel,
  );
  const rejected = expect(pending).rejects.toThrow(/cancelled/);
  await store.cancel("query");
  await store.cancel("query");
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(store.get("query")?.cancelling).toBe(true);
  await expect(
    store.run("query", "duplicate", async () => {}, cancel),
  ).rejects.toThrow(/already running/);
  preparation.resolve();
  await rejected;
  expect(launch).not.toHaveBeenCalled();
  await store.run("query", "Retry", async () => launch(), cancel);
  expect(launch).toHaveBeenCalledTimes(1);
});
it("retains a job with no subscribers and releases it on failure", async () => {
  const store = new AssistantActivityStore(),
    work = deferred();
  const listener = vi.fn(),
    unsubscribe = store.subscribe(listener);
  const pending = store.run(
    "taxonomy",
    "Finding instances",
    () => work.promise,
    async () => {},
  );
  const rejected = expect(pending).rejects.toThrow("failed");
  unsubscribe();
  expect(store.get("taxonomy")).toBeDefined();
  work.reject(Error("failed"));
  await rejected;
  expect(store.get("taxonomy")).toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(1);
});
it("keeps tasks in different panes independent", async () => {
  const store = new AssistantActivityStore(),
    first = deferred(),
    second = deferred();
  const research = store.run(
    "research",
    "Research",
    () => first.promise,
    async () => {},
  );
  const query = store.run(
    "query",
    "Query",
    () => second.promise,
    async () => {},
  );
  first.resolve();
  await research;
  expect(store.get("query")).toBeDefined();
  second.resolve();
  await query;
});
it("keeps cancellation failures visible and allows another cancellation attempt", async () => {
  const store = new AssistantActivityStore(),
    work = deferred();
  const cancel = vi
    .fn()
    .mockRejectedValueOnce(Error("could not cancel"))
    .mockResolvedValue(undefined);
  const pending = store.run("research", "Research", () => work.promise, cancel);
  await store.cancel("research");
  expect(store.get("research")?.error).toBe("could not cancel");
  expect(store.get("research")?.cancelling).not.toBe(true);
  await store.cancel("research");
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(store.get("research")?.cancelling).toBe(true);
  work.resolve();
  await pending;
});
