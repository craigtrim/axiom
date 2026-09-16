import { it, expect } from "vitest";
import { buildStore } from "../../src/domain/fixture";
import { buildEmptyStore } from "../../src/domain/workspace";
import { NS, THING } from "../../src/domain/model";
import { instancePage } from "../../src/domain/instances";
import { INSTANCE_PAGE_SIZE } from "../../src/shared/instances";

it("matches the hierarchy count and pages every Giardiniera instance without duplicating records", () => {
  const store = buildStore();
  const iri = NS.pizza + "Giardiniera";
  const version = store.version;
  const ids: string[] = [];
  const total = store.instanceCount(iri);
  expect(total).toBe(527);
  for (let start = 0; start < total; start += INSTANCE_PAGE_SIZE) {
    const page = instancePage(store, iri, "", start);
    expect(page.total).toBe(total);
    expect(page.filtered).toBe(total);
    expect(page.rows.length).toBeLessThanOrEqual(INSTANCE_PAGE_SIZE);
    ids.push(...page.rows.map((r) => r.iri));
  }
  expect(ids).toEqual(store.instanceIris(iri));
  expect(new Set(ids).size).toBe(total);
  expect(store.version).toBe(version);
});
it("includes manually created and generated instances in the same report", () => {
  const store = buildStore(1000),
    iri = NS.pizza + "American";
  const named = store.createNamedIndividual("A manually recorded pizza", iri);
  const page = instancePage(store, iri);
  expect(page.total).toBe(store.instanceCount(iri));
  expect(
    page.rows.some((r) => r.iri === named && r.reference === undefined),
  ).toBe(true);
  expect(page.rows.some((r) => r.reference && r.branch && r.price)).toBe(true);
});
it("shows direct membership only, including multiple explicit types, for ordinary ontologies", () => {
  const store = buildEmptyStore(),
    parent = store.createClass("Vehicle", THING),
    child = store.createClass("Car", parent),
    other = store.createClass("Machine", THING);
  store.createNamedIndividual("Car one", child);
  const direct = store.createNamedIndividual("Shared vehicle", parent);
  store.entities.get(direct)!.types.push(other);
  store.rebuildSchema();
  expect(instancePage(store, parent).rows.map((r) => r.iri)).toEqual([direct]);
  expect(instancePage(store, other).rows.map((r) => r.iri)).toEqual([direct]);
  expect(instancePage(store, THING).total).toBe(0);
});
it("reports generated customers and orders using the same membership rules as their counts", () => {
  const store = buildStore(1000);
  for (const iri of [
    NS.demo + "Customer",
    NS.demo + "Order",
    NS.pizza + "Country",
  ])
    expect(instancePage(store, iri).total).toBe(store.instanceCount(iri));
});
it("filters by name and identifier, retains the original total, and clamps an obsolete page", () => {
  const store = buildEmptyStore(),
    iri = store.createClass("Topic", THING);
  const id = store.createNamedIndividual("A specific example", iri);
  store.createNamedIndividual("Unrelated label", iri);
  const page = instancePage(store, iri, "SPECIFIC", 500);
  expect(page.total).toBe(2);
  expect(page.filtered).toBe(1);
  expect(page.start).toBe(0);
  expect(page.rows[0].iri).toBe(id);
  expect(instancePage(store, iri, id).filtered).toBe(1);
  expect(instancePage(store, iri, "no match")).toMatchObject({
    total: 2,
    filtered: 0,
    rows: [],
  });
});
it("returns a useful empty report for a class without direct instances", () => {
  const store = buildEmptyStore();
  expect(instancePage(store, THING)).toMatchObject({
    total: 0,
    start: 0,
    filtered: 0,
    rows: [],
  });
});
it.each([-1, 0.5, Number.NaN, 1000001])(
  "rejects invalid page offsets %s",
  (start) => {
    expect(() => instancePage(buildEmptyStore(), THING, "", start)).toThrow();
  },
);
it("rejects unknown classes, non-class targets and oversized searches", () => {
  const store = buildEmptyStore(),
    id = store.createNamedIndividual("Instance", THING);
  expect(() => instancePage(store, "urn:unknown")).toThrow();
  expect(() => instancePage(store, id)).toThrow();
  expect(() => instancePage(store, THING, "x".repeat(513))).toThrow();
});
