import { expect, it, vi } from "vitest";
import { EmbeddingEngine } from "../../src/main/embedding-engine";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const vector = () => new Float32Array([1, 0]);
it("keeps one inference active, drops stale queued searches, and preserves explicit comparisons", async () => {
  const gate = deferred<Float32Array[]>();
  let running = 0,
    max = 0;
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    calls.push(texts);
    max = Math.max(max, ++running);
    const values = calls.length === 1 ? await gate.promise : texts.map(vector);
    running--;
    return values;
  };
  const engine = new EmbeddingEngine(embed, 2);
  const ready = engine.prepare("scope", ["A", "B", "C"]);
  const stale = engine.search("scope", "stale", "find");
  const latest = engine.search("scope", "latest", "find");
  const explicit = engine.compare("synonym", ["term"]);
  expect(await stale).toBeUndefined();
  gate.resolve([vector(), vector()]);
  expect(await explicit).toEqual([1]);
  expect(await ready).toBe(true);
  expect(await latest).toEqual([1, 1, 1]);
  expect(calls).toEqual([["A", "B"], ["synonym", "term"], ["C"], ["latest"]]);
  expect(max).toBe(1);
});
it("scores subsequent queries against resident vectors and keeps consumers independent", async () => {
  const embed = vi.fn(async (texts: string[]) => texts.map(vector));
  const engine = new EmbeddingEngine(embed);
  await engine.prepare("scope", ["A", "B"]);
  await Promise.all([
    engine.search("scope", "one", "dialog"),
    engine.search("scope", "two", "resource"),
  ]);
  await engine.prepare("scope", ["A", "B"]);
  await engine.search("scope", "three", "dialog");
  expect(embed.mock.calls.map((c) => c[0])).toEqual([
    ["A", "B"],
    ["one"],
    ["two"],
    ["three"],
  ]);
});
it("ignores in-flight results after cancellation, dataset replacement, and scope eviction", async () => {
  const gate = deferred<Float32Array[]>();
  const engine = new EmbeddingEngine(async (texts) =>
    texts[0] === "slow" ? gate.promise : texts.map(vector),
  );
  await engine.prepare("scope", ["A"]);
  const stale = engine.search("scope", "slow", "find");
  engine.cancel("find");
  engine.reset();
  const ready = engine.prepare("new", ["B"]);
  const latest = engine.search("new", "fast", "find");
  gate.resolve([vector()]);
  expect(await stale).toBeUndefined();
  await ready;
  expect(await latest).toEqual([1]);
  engine.release("new");
  expect(await engine.search("new", "fast", "find")).toBeUndefined();
  expect(await engine.prepare("new", ["B"])).toBe(true);
});
it("degrades optional searches when the model is missing but reports explicit comparison errors", async () => {
  const engine = new EmbeddingEngine(async () => {
    throw Error("missing model");
  });
  expect(await engine.prepare("scope", ["A"])).toBe(false);
  expect(await engine.search("scope", "car", "find")).toBeUndefined();
  await expect(engine.compare("car", ["automobile"])).rejects.toThrow(
    "missing model",
  );
});

it("groups corpus values by length while retaining original score positions", async () => {
  const embed = vi.fn(async (texts: string[]) =>
    texts.map((text) => new Float32Array(text === "short" ? [0, 1] : [1, 0])),
  );
  const engine = new EmbeddingEngine(embed, 1);
  await engine.prepare("scope", ["a much longer value", "short"]);
  expect(await engine.search("scope", "query", "find")).toEqual([1, 0]);
  expect(embed.mock.calls.map((call) => call[0])).toEqual([
    ["short"],
    ["a much longer value"],
    ["query"],
  ]);
});
