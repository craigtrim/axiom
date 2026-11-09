// craigtrim/axiom#223: save comparisons follow persisted metadata without aggregate strings.
import { expect, it, vi } from "vitest";
import { sameJsonValue } from "../../src/shared/json-equal";

it("ignores record property order and omitted optional fields", () => {
  expect(
    sameJsonValue(
      {
        theme: "dark",
        layout: { selected: 1, children: ["graph", "details"] },
        source: undefined,
      },
      {
        layout: { children: ["graph", "details"], selected: 1 },
        theme: "dark",
      },
    ),
  ).toBe(true);
  expect(sameJsonValue({ source: undefined }, {})).toBe(true);
  expect(sameJsonValue({ source: null }, {})).toBe(false);
  expect(sameJsonValue({ source: "draft" }, { source: undefined })).toBe(false);
  expect(sameJsonValue(undefined, null)).toBe(false);
});

it("retains array order and length while matching JSON null placeholders", () => {
  expect(sameJsonValue([, undefined, null], [null, null, null])).toBe(true);
  expect(sameJsonValue([1, 2], [2, 1])).toBe(false);
  expect(sameJsonValue([null], [])).toBe(false);
  expect(sameJsonValue(["graph"], { 0: "graph", length: 1 })).toBe(false);
});

it("compares the numbers and primitive types written by JSON", () => {
  expect(sameJsonValue(-0, 0)).toBe(true);
  expect(sameJsonValue({ value: NaN }, { value: null })).toBe(true);
  expect(sameJsonValue([Infinity, -Infinity], [null, null])).toBe(true);
  expect(sameJsonValue(1, "1")).toBe(false);
  expect(sameJsonValue(false, 0)).toBe(false);
  expect(sameJsonValue(2, 3)).toBe(false);
});

it("detects changed content without requiring optional properties to be present", () => {
  const baseline = {
    graph: { selected: "urn:first", positions: [{ x: 10, y: 20 }] },
    source: { text: "pending source", loaded: { text: "saved source" } },
  };
  expect(sameJsonValue(baseline, structuredClone(baseline))).toBe(true);
  expect(
    sameJsonValue(baseline, {
      ...baseline,
      source: { ...baseline.source, text: "changed source" },
    }),
  ).toBe(false);
  expect(
    sameJsonValue(baseline, {
      ...baseline,
      graph: { ...baseline.graph, selected: "urn:second" },
    }),
  ).toBe(false);
  expect(
    sameJsonValue(baseline, {
      ...baseline,
      graph: { ...baseline.graph, positions: [{ x: 11, y: 20 }] },
    }),
  ).toBe(false);
  expect(sameJsonValue(baseline, { graph: baseline.graph })).toBe(false);
});

it("compares long draft fields without calling JSON.stringify", () => {
  const text = 'source text with quotes " and escapes\n'.repeat(70000);
  const baseline = { source: { text, loaded: { text } } };
  const stringify = vi.spyOn(JSON, "stringify").mockImplementation(() => {
    throw Error("Metadata comparison must not encode a combined JSON string.");
  });
  let equal: boolean;
  let changed: boolean;
  try {
    equal = sameJsonValue(baseline, { source: { loaded: { text }, text } });
    changed = sameJsonValue(baseline, {
      source: { text: text + "changed", loaded: { text } },
    });
  } finally {
    stringify.mockRestore();
  }
  expect(equal).toBe(true);
  expect(changed).toBe(false);
});

it("compares null-prototype records without treating classes as captured JSON data", () => {
  const record = Object.assign(Object.create(null), { selected: "urn:first" });
  expect(sameJsonValue(record, { selected: "urn:first" })).toBe(true);
  expect(sameJsonValue(new Date(0), new Date(0))).toBe(false);
  expect(sameJsonValue(new Map(), {})).toBe(false);
  expect(sameJsonValue(1n, 1n)).toBe(false);
});
