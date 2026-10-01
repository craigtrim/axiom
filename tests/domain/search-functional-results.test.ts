import { describe, expect, it } from "vitest";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { findGraphNodes } from "../../src/domain/find-graph";
import { readFindOptions, findKinds } from "../../src/shared/find";
import {
  declaration,
  fromTriples,
  iri,
  labelledStore,
} from "../fixtures/search/fixture";

// IRI order is deliberately opposite to label order; insertion order is scrambled.
const records = Array.from({ length: 32 }, (_, n) => ({
  id: `record-${String(31 - n).padStart(2, "0")}`,
  label: `Record ${String(n).padStart(2, "0")}`,
}));
const store = labelledStore(
  Array.from({ length: 32 }, (_, n) => records[(n * 7) % 32]),
);
const index = new EntitySearchIndex(store);
const pagePlans = [
  { limit: 1, offset: 0, start: 0, count: 1 },
  { limit: 1, offset: 1, start: 1, count: 1 },
  { limit: 1, offset: 31, start: 31, count: 1 },
  { limit: 1, offset: 32, start: 31, count: 1 },
  { limit: 5, offset: 0, start: 0, count: 5 },
  { limit: 5, offset: 1, start: 1, count: 5 },
  { limit: 5, offset: 5, start: 5, count: 5 },
  { limit: 5, offset: 30, start: 30, count: 2 },
  { limit: 5, offset: 9999, start: 30, count: 2 },
  { limit: 10, offset: 0, start: 0, count: 10 },
  { limit: 10, offset: 10, start: 10, count: 10 },
  { limit: 10, offset: 20, start: 20, count: 10 },
  { limit: 10, offset: 32, start: 30, count: 2 },
  { limit: 32, offset: 0, start: 0, count: 32 },
  { limit: 32, offset: 9999, start: 0, count: 32 },
  { limit: 100, offset: 9999, start: 0, count: 32 },
];
const sorts = ["relevance", "name", "name-desc", "iri"] as const;
const numericIndex = new EntitySearchIndex(
  labelledStore(
    Array.from({ length: 120 }, (_, n) => ({
      id: `Course_${5890 + n}`,
      label: `Laser Polymer Course ${5890 + n}`,
    })),
  ),
);
describe("functional search: complete results and stable pages", () => {
  it.each(Array.from({ length: 100 }, (_, n) => 5900 + n))(
    "NUMERIC-%s ranks the requested course above neighboring numbers",
    (number) => {
      const expected = iri(`Course_${number}`);
      expect(
        numericIndex.find({ text: `polymer ${number}`, fields: ["name"] })
          .rows[0]?.iri,
      ).toBe(expected);
      expect(numericIndex.search(`polymer ${number}`, true)[0]?.iri).toBe(
        expected,
      );
    },
  );
  it.each(sorts.flatMap((sort) => pagePlans.map((p) => ({ sort, ...p }))))(
    "PAGE-$sort-limit$limit-offset$offset starts at $start with $count rows",
    ({ sort, limit, offset, start, count }) => {
      const expected = (
        sort === "name-desc" || sort === "iri"
          ? [...records].reverse()
          : records
      ).map((r) => iri(r.id));
      const result = index.find({
        text: "record",
        fields: ["name"],
        sort,
        limit,
        offset,
      });
      expect(result.total).toBe(32);
      expect(result.offset).toBe(start);
      expect(result.rows.map((r) => r.iri)).toEqual(
        expected.slice(start, start + count),
      );
      expect(
        index.matchingIris({
          text: "record",
          fields: ["name"],
          sort,
          limit,
          offset,
        }),
      ).toEqual(expected);
    },
  );
  it.each([1, 3, 5, 7, 10, 16, 31, 32, 50, 100])(
    "WALK limit=%s reconstructs the full ordered set without duplicates or omissions",
    (limit) => {
      const seen: string[] = [];
      for (let offset = 0; offset < 32; offset += limit)
        seen.push(
          ...index
            .find({ text: "record", sort: "name", limit, offset })
            .rows.map((r) => r.iri),
        );
      expect(seen).toEqual(records.map((r) => iri(r.id)));
      expect(new Set(seen).size).toBe(32);
    },
  );
  it.each([1, 2, 7, 24, 32, 50, 100])(
    "SUGGESTION-LIMIT %s has a functional result bound",
    (limit) => {
      expect(index.search("record", false, [], limit)).toHaveLength(
        Math.min(limit, 32),
      );
    },
  );
  it("caps resource suggestions at 50 while Find retains every result", () => {
    const large = new EntitySearchIndex(
      labelledStore(
        Array.from({ length: 65 }, (_, n) => ({
          id: `r${n}`,
          label: `Record ${n}`,
        })),
      ),
    );
    expect(large.search("record", false, [], 100)).toHaveLength(50);
    expect(large.find({ text: "record", limit: 100 }).rows).toHaveLength(65);
  });
  it.each(sorts)(
    "TIE-%s breaks equal-label ties by IRI, regardless of insertion order",
    (sort) => {
      const rows = ["c", "a", "b"].map((id) => ({
        id,
        label: "Identical Label",
      }));
      for (const ordered of [rows, [...rows].reverse()]) {
        const search = new EntitySearchIndex(labelledStore(ordered));
        expect(
          search.find({ text: "identical", sort }).rows.map((r) => r.iri),
        ).toEqual([iri("a"), iri("b"), iri("c")]);
      }
    },
  );
  it("alternating sort orders does not mutate the cached relevance result", () => {
    const options = { text: "record", limit: 100 };
    const first = index.find(options);
    index.find({ ...options, sort: "name-desc" });
    index.find({ ...options, sort: "iri", limit: 5, offset: 5 });
    expect(index.find(options)).toEqual(first);
  });
  it("graph opening uses all matches and rejects a graph above the requested node limit", () => {
    const graphStore = fromTriples(
      records.flatMap((r) => declaration(iri(r.id), r.label)),
    );
    const options = { text: "record", limit: 1, offset: 20, sort: "name" };
    expect(findGraphNodes(graphStore, options, 100).matches).toEqual(
      records.map((r) => iri(r.id)),
    );
    expect(() => findGraphNodes(graphStore, options, 10)).toThrow();
    expect(() => findGraphNodes(graphStore, { text: "zzqvopaque" })).toThrow(
      "There are no search results",
    );
  });
});

describe("functional search: input validation and saved option migration", () => {
  it.each([
    { value: undefined, expected: 50 },
    { value: null, expected: 50 },
    { value: "10", expected: 50 },
    { value: NaN, expected: 50 },
    { value: Infinity, expected: 50 },
    { value: -Infinity, expected: 50 },
    { value: -5, expected: 1 },
    { value: 0, expected: 1 },
    { value: 1, expected: 1 },
    { value: 5.9, expected: 5 },
    { value: 100, expected: 100 },
    { value: 200, expected: 200 },
    { value: 201, expected: 200 },
    { value: 1000, expected: 200 },
  ])("OPTION-LIMIT $value -> $expected", ({ value, expected }) => {
    expect(readFindOptions({ limit: value }).limit).toBe(expected);
    expect(index.find({ text: "record", limit: value }).rows).toHaveLength(
      Math.min(expected, 32),
    );
  });
  it.each([
    { value: undefined, expected: 0 },
    { value: null, expected: 0 },
    { value: "5", expected: 0 },
    { value: NaN, expected: 0 },
    { value: Infinity, expected: 0 },
    { value: -Infinity, expected: 0 },
    { value: -5, expected: 0 },
    { value: 0, expected: 0 },
    { value: 1.9, expected: 1 },
    { value: 31, expected: 31 },
  ])("OPTION-OFFSET $value -> $expected", ({ value, expected }) => {
    expect(readFindOptions({ offset: value }).offset).toBe(expected);
    expect(
      index.find({ text: "record", limit: 1, offset: value }).rows[0]?.iri,
    ).toBe(iri(records[expected].id));
  });
  it.each([undefined, null, 3, true, "record", [], {}])(
    "INVALID-INPUT %j returns no Find matches",
    (input) => {
      expect(index.find(input).rows).toEqual([]);
    },
  );
  it.each(
    ["all", "any", "exact", "phrase", "cosine", "fuzzy"].flatMap((match) =>
      ["all", "name", "iri"].map((field) => ({ match, field })),
    ),
  )(
    "MIGRATION-$match-$field preserves automatic retrieval",
    ({ match, field }) => {
      expect(
        index.find({ text: "record", match, field, minimumSimilarity: 0.99 }),
      ).toEqual(index.find({ text: "record", field }));
    },
  );
  it.each(["all", "classes", "individuals", "properties"])(
    "LEGACY-KIND %s maps to supported selections",
    (kind) => {
      expect(readFindOptions({ kind }).kinds).toEqual(
        kind === "all" ? findKinds : [kind],
      );
    },
  );
  it("modern empty selections override legacy defaults", () => {
    expect(
      readFindOptions({
        kind: "classes",
        kinds: [],
        field: "name",
        fields: [],
      }),
    ).toMatchObject({ kinds: [], fields: [] });
    expect(index.find({ text: "record", fields: [] }).total).toBe(0);
    expect(index.find({ text: "record", kinds: [] }).total).toBe(0);
  });
  it("deduplicates valid scopes, rejects invalid values, and retains arbitrary predicate IRIs", () => {
    expect(
      readFindOptions({
        fields: [
          "name",
          "name",
          "",
          42,
          null,
          iri("predicate"),
          "x".repeat(10001),
        ],
        kinds: ["classes", "classes", "invalid", 42],
      }),
    ).toMatchObject({ fields: ["name", iri("predicate")], kinds: ["classes"] });
  });
  it("bounds saved strings and applies safe defaults to unknown option values", () => {
    const options = readFindOptions({
      text: "x".repeat(1000),
      excludeIri: "x".repeat(12000),
      sort: "invalid",
      kind: "invalid",
      field: "invalid",
    });
    expect(options.text).toHaveLength(256);
    expect(options.excludeIri).toHaveLength(10000);
    expect(options).toMatchObject({
      sort: "relevance",
      kinds: findKinds,
      fields: ["name", "iri"],
    });
  });
});
