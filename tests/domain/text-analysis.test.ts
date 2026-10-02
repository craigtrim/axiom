import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { Store } from "../../src/domain/store";
import { NS } from "../../src/domain/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  textEntities,
  type MutatocToken,
} from "../../src/main/text-analysis-spans";
import {
  LiveAnalysis,
  type LiveAnalysisState,
} from "../../src/renderer/live-analysis";
import type {
  TextAnalysisInput,
  TextAnalysisResult,
} from "../../src/shared/text-analysis";
import { readPreferences } from "../../src/shared/preferences";
// craigtrim/axiom#40: tokens carry Mutatoc 0.4.0 code point x/y offsets.
const leaf = (text: string, x: number, y: number): MutatocToken => ({
  text,
  x,
  y,
});
const match = (
  canon: string,
  text: string,
  x: number,
  y: number,
  ...tokens: MutatocToken[]
): MutatocToken => ({ text, x, y, swaps: { canon, type: "exact", tokens } });
const input = (text: string, version = 1): TextAnalysisInput => ({
  text,
  datasetEpoch: 1,
  version,
});
const result = (i: TextAnalysisInput): TextAnalysisResult => ({
  ...i,
  entities: [],
  canonical: i.text,
  milliseconds: 1,
});
const ranges = (text: string, tokens: MutatocToken[]) =>
  textEntities(text, tokens).map((e) => [
    e.start,
    e.end,
    text.slice(e.start, e.end),
  ]);
afterEach(() => vi.useRealTimers());

describe("original text highlighting", () => {
  it("maps literal periods and tildes from native code point offsets", () => {
    const text = "😀 U.S. History to 1865 ~~ U.S.A.";
    expect(
      ranges(text, [
        leaf("😀 ", 0, 1),
        match("course", "U.S. History to 1865", 2, 22),
        leaf(" ~", 22, 24),
        leaf("~ ", 24, 25),
        match("country", "U.S.A.", 26, 32),
      ]),
    ).toEqual([
      [3, 23, "U.S. History to 1865"],
      [27, 33, "U.S.A."],
    ]);
  });
  it("converts code points to UTF-16 through emoji, repeated spaces, tabs and line breaks", () => {
    const text = "😀😀  Dog\n\tCat Dog";
    expect(
      ranges(text, [
        leaf("😀", 0, 1),
        leaf("😀 ", 1, 2),
        match("dog", "Dog", 4, 7),
        match("cat", "Cat", 9, 12),
        match("dog", "Dog", 13, 16),
      ]),
    ).toEqual([
      [6, 9, "Dog"],
      [11, 14, "Cat"],
      [15, 18, "Dog"],
    ]);
  });
  it("uses a nested match's own range rather than its children or canonical text", () => {
    const text = "the big\ncat";
    expect(
      ranges(text, [
        leaf("the ", 0, 3),
        match(
          "lion",
          "big\ncat",
          4,
          11,
          match("big", "big", 4, 7),
          leaf("\n", 7, 7),
          leaf("cat", 8, 11),
        ),
      ]),
    ).toEqual([[4, 11, "big\ncat"]]);
  });
  it("keeps every highlight when the text ends in an abbreviation or contraction", () => {
    expect(
      ranges("Dog in the dept.", [
        match("dog", "Dog", 0, 3),
        leaf("in ", 4, 6),
        leaf("the ", 7, 10),
        leaf("dept", 11, 15),
        leaf(".", 15, 16),
      ]),
    ).toEqual([[0, 3, "Dog"]]);
    expect(
      ranges("Dog, I can't", [
        match("dog", "Dog", 0, 3),
        leaf(", ", 3, 4),
        leaf("I ", 5, 6),
        leaf("can't", 7, 12),
      ]),
    ).toEqual([[0, 3, "Dog"]]);
    expect(
      ranges("dr.", [match("doctor", "dr.", 0, 3, leaf("dr", 0, 2))]),
    ).toEqual([[0, 3, "dr."]]);
  });
  it("highlights a curly apostrophe exactly as typed", () => {
    expect(
      ranges("Driver’s Ed", [match("drivers_ed", "Driver’s Ed", 0, 11)]),
    ).toEqual([[0, 11, "Driver’s Ed"]]);
  });
  it("produces only ontology matches even when unmatched tokens carry labels", () => {
    const text = "Alice saw Dog";
    expect(
      textEntities(text, [
        { text: "Alice ", x: 0, y: 5, ner: "PERSON" },
        leaf("saw ", 6, 9),
        match("dog", "Dog", 10, 13),
      ]).map((e) => [e.source, e.label, text.slice(e.start, e.end)]),
    ).toEqual([["ontology", "dog", "Dog"]]);
  });
  it("rejects a match whose range does not slice its own text", () => {
    for (const token of [
      match("dog", "Dog", 4, 7),
      match("dog", "Dog", 8, 12),
      match("dog", "Dog", 3, 3),
      match("dog", "Dog", 0.5, 3),
      { ...match("dog", "Dog", 0, 3), x: undefined as unknown as number },
    ])
      expect(() => textEntities("Dog cat Dog", [token])).toThrow(/mapped/);
  });
  it("persists analysis text without allowing oversized saved values", () => {
    expect(
      readPreferences({
        version: 1,
        panelState: { "textanalysis.text": "Dog\nCat" },
      }).panelState?.["textanalysis.text"],
    ).toBe("Dog\nCat");
    expect(
      readPreferences({
        version: 1,
        panelState: { "textanalysis.text": "a".repeat(100001) },
      }).panelState?.["textanalysis.text"],
    ).toBeUndefined();
  });
});

describe("automatic parsing", () => {
  it("coalesces edits and never publishes stale results or errors", async () => {
    vi.useFakeTimers();
    const pending: {
      input: TextAnalysisInput;
      resolve: (r: TextAnalysisResult) => void;
      reject: (e: Error) => void;
    }[] = [];
    const parse = vi.fn(
      (input: TextAnalysisInput) =>
        new Promise<TextAnalysisResult>((resolve, reject) =>
          pending.push({ input, resolve, reject }),
        ),
    );
    const states: LiveAnalysisState[] = [];
    const live = new LiveAnalysis(parse, (s) => states.push(s));
    live.update(input("D"));
    live.update(input("Dog"));
    await vi.advanceTimersByTimeAsync(60);
    expect(parse).toHaveBeenCalledTimes(1);
    live.update(input("Cat"));
    live.update(input("Horse"));
    await vi.advanceTimersByTimeAsync(60);
    expect(parse).toHaveBeenCalledTimes(1);
    pending[0].resolve(result(pending[0].input));
    await vi.advanceTimersByTimeAsync(0);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(pending[1].input.text).toBe("Horse");
    expect(states.every((s) => s.status === "pending")).toBe(true);
    live.update(input("Horse", 2));
    await vi.advanceTimersByTimeAsync(60);
    pending[1].reject(Error("old failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.some((s) => s.status === "error")).toBe(false);
    pending[2].resolve(result(pending[2].input));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({
      status: "ready",
      result: { version: 2, text: "Horse" },
    });
    live.dispose();
  });
  it("clears highlights immediately when empty and ignores in-flight work after close", async () => {
    vi.useFakeTimers();
    let finish!: (r: TextAnalysisResult) => void;
    const states: LiveAnalysisState[] = [];
    const live = new LiveAnalysis(
      () =>
        new Promise((r) => {
          finish = r;
        }),
      (s) => states.push(s),
    );
    live.update(input("Dog"));
    await vi.advanceTimersByTimeAsync(60);
    live.update(input(""));
    expect(states.at(-1)?.status).toBe("idle");
    live.dispose();
    const count = states.length;
    finish(result(input("Dog")));
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toHaveLength(count);
  });
});

it("preserves imported individual labels and custom statements in the union of named graphs", async () => {
  const store = new Store();
  store.ontology = {
    name: "import",
    namespace: "https://example.org/",
    example: false,
    assertedOnly: true,
  };
  store.tbox = [
    {
      subject: "https://example.org/Alice",
      predicate: NS.rdfs + "label",
      object: { value: "Alice", literal: true },
      graph: "https://example.org/one",
    },
    {
      subject: "https://example.org/Alice",
      predicate: "https://example.org/custom",
      object: { value: "custom value", literal: true },
      graph: "https://example.org/two",
    },
  ];
  const before = structuredClone(store.tbox);
  const context = await textAnalysisContext(store, 17);
  expect(context.datasetEpoch).toBe(17);
  expect(context.turtle).toContain('"Alice"');
  expect(context.turtle).toContain('"custom value"');
  expect(context.turtle).not.toContain("https://example.org/one");
  expect(store.tbox).toEqual(before);
});

describe("live analysis boundaries", () => {
  it("debounces from the most recent keystroke", async () => {
    vi.useFakeTimers();
    const parse = vi.fn(async (i: TextAnalysisInput) => result(i));
    const live = new LiveAnalysis(parse, vi.fn());
    live.update(input("alpha"));
    await vi.advanceTimersByTimeAsync(59);
    live.update(input("alpha beta"));
    await vi.advanceTimersByTimeAsync(59);
    expect(parse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(parse).toHaveBeenCalledExactlyOnceWith(input("alpha beta"));
    live.dispose();
  });

  it("cancels pending work when cleared before the debounce completes", async () => {
    vi.useFakeTimers();
    const parse = vi.fn(async (i: TextAnalysisInput) => result(i));
    const publish = vi.fn();
    const live = new LiveAnalysis(parse, publish);
    live.update(input("alpha beta"));
    live.update(input("  "));
    await vi.advanceTimersByTimeAsync(100);
    expect(parse).not.toHaveBeenCalled();
    expect(publish).toHaveBeenLastCalledWith({ status: "idle" });
    live.dispose();
  });

  it("reports a current failure and recovers automatically on the next edit", async () => {
    vi.useFakeTimers();
    const parse = vi
      .fn(async (i: TextAnalysisInput) => result(i))
      .mockRejectedValueOnce(Error("worker exited"));
    const publish = vi.fn();
    const live = new LiveAnalysis(parse, publish);
    live.update(input("alpha"));
    await vi.advanceTimersByTimeAsync(60);
    expect(publish).toHaveBeenLastCalledWith({
      status: "error",
      message: "worker exited",
    });
    live.update(input("alpha beta"));
    await vi.advanceTimersByTimeAsync(60);
    expect(publish).toHaveBeenLastCalledWith({
      status: "ready",
      result: result(input("alpha beta")),
    });
    live.dispose();
  });

  it("rejects oversized text, cancels pending work, and resumes at the exact limit", async () => {
    vi.useFakeTimers();
    const parse = vi.fn(async (i: TextAnalysisInput) => result(i));
    const publish = vi.fn();
    const live = new LiveAnalysis(parse, publish);
    live.update(input("alpha beta"));
    live.update(input("x".repeat(100001)));
    await vi.advanceTimersByTimeAsync(60);
    expect(parse).not.toHaveBeenCalled();
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error" }),
    );
    live.update(input("x".repeat(100000)));
    await vi.advanceTimersByTimeAsync(60);
    expect(parse).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ready" }),
    );
    live.dispose();
  });

  it("does not publish a superseded native result", async () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const live = new LiveAnalysis(
      async (i) => ({ ...result(i), superseded: true }),
      publish,
    );
    live.update(input("alpha beta"));
    await vi.advanceTimersByTimeAsync(60);
    expect(publish).toHaveBeenCalledExactlyOnceWith({ status: "pending" });
    live.dispose();
  });

  it("ignores edits after disposal", async () => {
    vi.useFakeTimers();
    const parse = vi.fn(async (i: TextAnalysisInput) => result(i));
    const publish = vi.fn();
    const live = new LiveAnalysis(parse, publish);
    live.dispose();
    live.update(input("alpha beta"));
    await vi.advanceTimersByTimeAsync(60);
    expect(parse).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
