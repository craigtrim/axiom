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
const dictionaries = {
  contractions: { "can't": ["can", "not"] },
  abbreviations: { "apt.": "apartment" },
};
const leaf = (text: string, ent = ""): MutatocToken => ({ text, ent });
const match = (canon: string, ...tokens: MutatocToken[]): MutatocToken => ({
  text: tokens.map((t) => t.text).join(""),
  swaps: { canon, type: "exact", tokens },
});
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
afterEach(() => vi.useRealTimers());

describe("original text highlighting", () => {
  it("maps literal periods and tildes without substituting source characters", () => {
    const text = "😀 U.S. History to 1865 ~~ U.S.A.";
    const tokens = [
      leaf("😀 "),
      match(
        "course",
        leaf("U"),
        leaf("."),
        leaf("S"),
        leaf(". "),
        leaf("History "),
        leaf("to "),
        leaf("1865"),
      ),
      leaf(" ~"),
      leaf("~ "),
      match(
        "country",
        leaf("U"),
        leaf("."),
        leaf("S"),
        leaf("."),
        leaf("A"),
        leaf("."),
      ),
    ];
    expect(
      textEntities(text, tokens, dictionaries).map((e) => [
        e.start,
        e.end,
        text.slice(e.start, e.end),
      ]),
    ).toEqual([
      [3, 23, "U.S. History to 1865"],
      [27, 33, "U.S.A."],
    ]);
  });
  it("decodes legacy abbreviation dictionary periods without changing literal tildes", () => {
    expect(
      textEntities("dr.", [match("doctor", leaf("dr"), leaf("."))], {
        contractions: {},
        abbreviations: { "dr.": "dr~~" },
      })[0],
    ).toMatchObject({ start: 0, end: 3 });
  });
  it("keeps UTF-16 positions through emoji, repeated spaces, tabs and line breaks", () => {
    const text = "😀  Dog\n\tCat Dog";
    const tokens = [
      leaf("😀 "),
      match("dog", leaf("Dog")),
      leaf(" \t "),
      match("cat", leaf("Cat ")),
      match("dog", leaf("Dog")),
    ];
    const entities = textEntities(text, tokens, dictionaries);
    expect(
      entities.map((e) => [e.start, e.end, text.slice(e.start, e.end)]),
    ).toEqual([
      [4, 7, "Dog"],
      [9, 12, "Cat"],
      [13, 16, "Dog"],
    ]);
  });
  it("uses nested swap leaves rather than canonical text for multiword matches", () => {
    const text = "the big\ncat";
    const tokens = [
      leaf("the "),
      match("lion", match("big", leaf("big ")), leaf("cat")),
    ];
    const [entity] = textEntities(text, tokens, dictionaries);
    expect(text.slice(entity.start, entity.end)).toBe("big\ncat");
    expect(entity.label).toBe("lion");
  });
  it("maps expanded final abbreviations and contractions to their complete source", () => {
    expect(
      textEntities(
        "apt.",
        [match("apartment", leaf("apartment"))],
        dictionaries,
      )[0],
    ).toMatchObject({ start: 0, end: 4 });
    const [entity] = textEntities(
      "can't",
      [match("cannot", leaf("can "), leaf("not"))],
      dictionaries,
    );
    expect(entity).toMatchObject({ start: 0, end: 5 });
    expect(
      textEntities("can't ", [match("cannot", leaf("can't "))], dictionaries)[0]
        .end,
    ).toBe(5);
  });
  it("keeps named entities grouped and lets ontology matches take precedence", () => {
    const text = "Alice Smith saw Dog in New York";
    const entities = textEntities(
      text,
      [
        leaf("Alice ", "PERSON"),
        leaf("Smith ", "PERSON"),
        leaf("saw "),
        match("dog", leaf("Dog ", "PERSON")),
        leaf("in "),
        leaf("New ", "GPE"),
        leaf("York", "GPE"),
      ],
      dictionaries,
    );
    expect(
      entities.map((e) => [e.source, e.label, text.slice(e.start, e.end)]),
    ).toEqual([
      ["model", "Person", "Alice Smith"],
      ["ontology", "dog", "Dog"],
      ["model", "Place", "New York"],
    ]);
  });
  it("rejects an unmappable token instead of highlighting a later duplicate", () => {
    expect(() =>
      textEntities(
        "Dog cat Dog",
        [leaf("cat "), match("dog", leaf("Dog"))],
        dictionaries,
      ),
    ).toThrow(/mapped/);
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
