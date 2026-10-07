import { beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import type { Store } from "../../src/domain/store";
import {
  individualCensus,
  individualGridPage,
} from "../../src/domain/individual-columns";
import {
  columnReasons,
  defaultIndividualColumns,
  restoreIndividualColumns,
} from "../../src/shared/individual-columns";
import { NS, TYPE } from "../../src/domain/model";
import { touchpointContext } from "../../src/domain/touchpoints";
import { readPreferences } from "../../src/shared/preferences";
let store: Store;
const base = "http://devry.edu/school-names#";
beforeAll(async () => {
  const data = gunzipSync(
    readFileSync("tests/fixtures/individuals-visual/schools.ttl.gz"),
  );
  expect(createHash("sha256").update(data).digest("hex")).toBe(
    "5d7423ebf20410a24c27b005bc73561ebd52c21fbcd7b77776bd5cf7da193c63",
  );
  store = storeFromRdf(
    (await parseRdf(data.toString(), "schools.ttl", base)).triples,
    "Schools",
  );
}, 30000);
it("measures the escape-aware census and derives the reference defaults", () => {
  const { rows, columns } = individualCensus(store, base + "School");
  expect(rows).toHaveLength(21461);
  expect(
    columns.map((c) => [c.label, c.fill, c.distinct, c.maxValues]),
  ).toEqual([
    ["Individual", 21461, 21461, 1],
    ["rdf:type", 21461, 1, 1],
    [":hasType", 21461, 323, 1],
    ["rdfs:label", 20517, 20265, 1],
    ["rdfs:comment", 17517, 11589, 1],
    ["rdfs:seeAlso", 10281, 20194, 29],
    [":establishedYear", 17589, 499, 1],
    [":hasCountry", 20470, 289, 1],
    [":locatedIn", 17118, 7144, 1],
    [":hasCoordinates", 14534, 14337, 1],
    [":hasWebsite", 16286, 16117, 1],
    [":hasLanguage", 61, 13, 1],
    [":hasQID", 21461, 21461, 1],
    ["owl:sameAs", 21461, 21461, 1],
    ["IRI", 21461, 21461, 1],
  ]);
  const defaults = defaultIndividualColumns(columns, rows.length);
  expect(
    columns.filter((c) => defaults.visible.includes(c.key)).map((c) => c.label),
  ).toEqual([
    "Individual",
    ":hasType",
    "rdfs:comment",
    ":establishedYear",
    ":hasWebsite",
  ]);
  expect(columns.filter((c) => c.identifiers).map((c) => c.label)).toEqual([
    ":hasCountry",
    ":locatedIn",
    ":hasLanguage",
  ]);
  expect(columnReasons(columns[3], rows.length)).toEqual([
    { text: "shown as Individual" },
  ]);
  expect(
    defaultIndividualColumns(
      columns.map((c) => (c.key === TYPE ? { ...c, distinct: 2 } : c)),
      rows.length,
    ).visible,
  ).toContain(TYPE);
});
it("filters only shown fields, including every alias value when enabled", () => {
  const normal = individualGridPage(store, {
    query: "higher education institution",
  });
  expect(normal.total).toBe(1271);
  const { columns, rows } = individualCensus(store);
  const shown = defaultIndividualColumns(columns, rows.length).visible.filter(
    (k) => k !== NS.rdfs + "comment",
  );
  expect(
    individualGridPage(store, { query: "higher education institution", shown })
      .total,
  ).toBe(2);
  expect(
    individualGridPage(store, {
      query: "Q736674",
      shown: ["subject"],
    }).rows.map((r) => r.iri),
  ).toContain(base + "Q736674");
});
it("sorts numeric values and keeps blanks last in both directions", () => {
  for (const direction of [1, -1]) {
    const page = individualGridPage(store, {
      sort: base + "establishedYear",
      direction,
      page: 999,
    });
    expect(page.rows.at(-1)!.values[base + "establishedYear"]).toBeUndefined();
  }
  const a = individualGridPage(store, {
    sort: base + "establishedYear",
    direction: 1,
  });
  const b = individualGridPage(store, {
    sort: base + "establishedYear",
    direction: -1,
  });
  expect(Number(a.rows[0].values[base + "establishedYear"][0])).toBeLessThan(
    Number(b.rows[0].values[base + "establishedYear"][0]),
  );
});
it("restores valid layout settings while retiring missing columns", () => {
  const { columns, rows } = individualCensus(store);
  const saved = {
    order: ["missing", columns[2].key, "subject"],
    visible: ["missing", columns[2].key],
    widths: { [columns[2].key]: 999 },
  };
  const restored = restoreIndividualColumns(columns, rows.length, saved);
  expect(restored.order.slice(0, 2)).toEqual(["subject", columns[2].key]);
  expect(restored.visible).toEqual(["subject", columns[2].key]);
  expect(restored.widths[columns[2].key]).toBe(720);
});
it("recognizes xsd:anyURI literals as existing touchpoint links", () => {
  expect(touchpointContext(store, base + "Q736674", 1).links).toContainEqual({
    predicate: NS.owl + "sameAs",
    iri: "http://www.wikidata.org/entity/Q736674",
  });
});
it("serializes per-class layouts and filters through the workspace preference boundary", () => {
  const { columns, rows } = individualCensus(store);
  const layout = defaultIndividualColumns(columns, rows.length);
  layout.widths.subject = 400;
  const panelState = {
    "table.individuals.layouts": { [base + "School"]: layout },
    "table.individuals.scope": base + "School",
    "table.individuals.query": "Colorado",
    "table.individuals.page": 2,
    "table.individuals.sort": { key: "subject", direction: -1 },
    ["table.individuals.scroll." + base + "School"]: { top: 120, left: 80 },
  };
  expect(readPreferences({ version: 1, panelState }).panelState).toMatchObject(
    panelState,
  );
});
