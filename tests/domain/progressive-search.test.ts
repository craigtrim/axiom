import { afterEach, expect, it, vi } from "vitest";
import { progressiveSearch } from "../../src/renderer/progressive-search";
afterEach(() => vi.useRealTimers());
it("publishes lexical results before semantic work and retains them on model failure", async () => {
  vi.useFakeTimers();
  const request = vi.fn(async (method) => {
    if (method === "findSemantic") throw Error("missing model");
    return ["lexical"];
  });
  const receive = vi.fn(),
    failed = vi.fn();
  progressiveSearch(request as never, "find", {}, receive, failed);
  await vi.advanceTimersByTimeAsync(0);
  expect(receive).toHaveBeenCalledWith(["lexical"]);
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(180);
  expect(receive).toHaveBeenCalledTimes(1);
  expect(failed).not.toHaveBeenCalled();
});
it("cancels queued enrichment and suppresses late lexical or semantic responses", async () => {
  vi.useFakeTimers();
  let resolve!: (rows: string[]) => void;
  const request = vi.fn(async (method) =>
    method === "findSemantic"
      ? new Promise<string[]>((r) => {
          resolve = r;
        })
      : ["lexical"],
  );
  const receive = vi.fn();
  const cancel = progressiveSearch(
    request as never,
    "find",
    { consumer: "find", searchId: "old" },
    receive,
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(180);
  cancel();
  resolve(["stale"]);
  await vi.advanceTimersByTimeAsync(0);
  expect(receive.mock.calls).toEqual([[["lexical"]]]);
  expect(request).toHaveBeenLastCalledWith("cancelSearch", {
    consumer: "find",
    searchId: "old",
  });
  const receiveLate = vi.fn();
  const cancelEarly = progressiveSearch(
    request as never,
    "find",
    {},
    receiveLate,
    vi.fn(),
  );
  cancelEarly();
  await vi.advanceTimersByTimeAsync(500);
  expect(receiveLate).not.toHaveBeenCalled();
});
