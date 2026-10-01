import { describe, expect, it } from "vitest";
import { parseNumberDraft } from "../../src/renderer/number-draft";

describe("numeric editing syntax", () => {
  it.each([
    ["", undefined],
    [" ", undefined],
    ["-", undefined],
    ["+", undefined],
    [".", undefined],
    ["1e", undefined],
    ["1e-", undefined],
    ["12,50", undefined],
    ["12px", undefined],
    ["0x10", undefined],
    ["Infinity", undefined],
    ["NaN", undefined],
    ["1e999", undefined],
    ["2", 2],
    ["02", 2],
    ["2.", 2],
    [".25", 0.25],
    ["2.50", 2.5],
    ["1e2", 100],
    ["1e-2", 0.01],
    ["+4", 4],
    [" 4 ", 4],
    ["-0", -0],
    ["0", 0],
  ])("parses %j without replacing the user's draft", (text, expected) => {
    expect(parseNumberDraft(text as string, { min: 0, max: 100 })).toBe(
      expected,
    );
  });
});

describe.each([
  ["scale", 0.25, 8, false],
  ["quality", 1, 100, true],
  ["margin", 0, 40, false],
  ["entry limit", 0, 1000000, true],
  ["timeout", 10, 600, true],
  ["diameter", 6, 120, true],
  ["weight", 0, 100, true],
  ["line width", 0, 12, true],
  ["node limit", 100, 15000, true],
] as const)("%s constraints", (_label, min, max, integer) => {
  const range = { min, max, integer };
  it.each(["", " ", "-", ".", "abc", "NaN", "1e999"])(
    "does not apply %j",
    (text) => {
      expect(parseNumberDraft(text, range)).toBeUndefined();
    },
  );
  it("accepts both boundaries", () => {
    expect(parseNumberDraft(String(min), range)).toBe(min);
    expect(parseNumberDraft(String(max), range)).toBe(max);
  });
  it("rejects numbers just outside either boundary", () => {
    expect(parseNumberDraft(String(min - 0.001), range)).toBeUndefined();
    expect(parseNumberDraft(String(max + 0.001), range)).toBeUndefined();
  });
  it("applies the field's fractional-value rule", () => {
    const value = Math.ceil(min) + 0.5;
    expect(parseNumberDraft(String(value), range)).toBe(
      integer ? undefined : value,
    );
  });
  it("accepts a complete replacement after an empty or invalid draft", () => {
    expect(parseNumberDraft("", range)).toBeUndefined();
    expect(parseNumberDraft("invalid", range)).toBeUndefined();
    expect(parseNumberDraft(String(max), range)).toBe(max);
  });
});
