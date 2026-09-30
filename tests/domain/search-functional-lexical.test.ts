import { describe, expect, it } from "vitest";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { normalizeSearchText } from "../../src/domain/cosine";
import { findGraphNodes } from "../../src/domain/find-graph";
import {
  findEntities,
  resourceSuggestions,
} from "../../src/domain/resource-search";
import { aliasCases, concepts, lexicalCases } from "../fixtures/search/catalog";
import { catalogStore, iri } from "../fixtures/search/fixture";

const store = catalogStore();
const index = new EntitySearchIndex(store);
describe("functional search: preferred labels in a competing vocabulary", () => {
  it.each(lexicalCases)(
    "$id | $purpose | query=$query",
    ({ query, concept }) => {
      const expected = iri(concept.localName),
        competitor = iri("Extended_" + concept.localName);
      const found = index.find({ text: query, limit: 100 });
      expect(found.rows[0]?.iri).toBe(expected);
      expect(found.rows.map((r) => r.iri)).toContain(competitor);
      expect(new Set(found.rows.map((r) => r.iri)).size).toBe(
        found.rows.length,
      );
      expect(index.search(query, true)[0]?.iri).toBe(expected);
    },
  );
});
describe("functional search: aliases from all four supported predicates", () => {
  it.each(aliasCases)("$id | $purpose | query=$query", ({ query, concept }) => {
    const expected = iri(concept.localName);
    expect(index.find({ text: query, fields: ["name"] }).rows[0]?.iri).toBe(
      expected,
    );
    expect(index.search(query, true)[0]?.iri).toBe(expected);
  });
});
describe("functional search: public entry points and graph membership", () => {
  it.each(concepts)(
    "GRAPH-$id | $label includes matches across pages and their ancestors",
    (concept) => {
      const options = {
        text: concept.label,
        fields: ["name"],
        limit: 1,
        offset: 1,
      };
      const expected = iri(concept.localName);
      const all = findEntities(store, { ...options, offset: 0, limit: 100 });
      const graph = findGraphNodes(store, options);
      expect(graph.matches).toEqual(all.rows.map((row) => row.iri));
      expect(graph.matches).toContain(expected);
      expect(graph.iris).toContain(iri("Root"));
      expect(resourceSuggestions(store, concept.label, true)[0].iri).toBe(
        expected,
      );
      expect(new Set(graph.iris).size).toBe(graph.iris.length);
    },
  );
});
it("has at least 1,000 distinct query strings and unique, reproducible case IDs", () => {
  const cases = [...lexicalCases, ...aliasCases];
  expect(new Set(cases.map((c) => c.query)).size).toBeGreaterThanOrEqual(1000);
  expect(
    new Set(cases.map((c) => normalizeSearchText(c.query))).size,
  ).toBeGreaterThanOrEqual(1000);
  expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  expect(concepts).toHaveLength(64);
});
