// Issue #86 preserves the ranked search contract and reveals new rows within their scope.
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  individualCensus,
  individualGridPage,
} from "../../src/domain/individual-columns";
import { NS } from "../../src/domain/model";
const base = "http://devry.edu/school-names#";
const source = readFileSync(
  "tests/fixtures/individuals-visual/visual-reference-v2.html",
  "utf8",
);
const rows = JSON.parse(source.match(/var ROWS = (\[.*?\n\]);/s)![1]) as {
  id: string;
  p: Record<string, string[]>;
}[];
const parsed = await parseRdf(
  readFileSync("tests/fixtures/individuals-visual/five-hundred.ttl", "utf8"),
  "schools.ttl",
  base,
);
const store = storeFromRdf(parsed.triples, "Schools");
const shown = [
  "subject",
  base + "hasType",
  NS.rdfs + "comment",
  base + "establishedYear",
  base + "hasWebsite",
];
it("retains every value from the 500-row reference in its Turtle fixture", () => {
  expect(rows).toHaveLength(500);
  const actual = individualCensus(store, base + "School").rows;
  expect(actual).toHaveLength(500);
  for (const row of rows) {
    const found = actual.find((r) => r.local === row.id)!;
    for (const [key, values] of Object.entries(row.p)) {
      const iri = key.startsWith(":")
        ? base + key.slice(1)
        : key.startsWith("rdfs:")
          ? NS.rdfs + key.slice(5)
          : key.startsWith("owl:")
            ? NS.owl + key.slice(4)
            : NS.rdf + key.slice(4);
      expect(found.values[iri], `${row.id} ${key}`).toEqual(values);
    }
  }
});
it("keeps the independently recorded lexical order for the reference's polytechnic query", () => {
  const result = individualGridPage(store, { query: "polytechnic", shown });
  expect(result.total).toBe(16);
  expect(result.rows.map((r) => r.local)).toEqual(
    JSON.parse(
      readFileSync(
        "tests/fixtures/individuals-visual/polytechnic-order.json",
        "utf8",
      ),
    ),
  );
});
it("reveals a new row on its sorted page and ignores an out-of-scope reveal", () => {
  const local = storeFromRdf(parsed.triples, "Schools");
  const iri = local.createNamedIndividual(
    "Zzz newly created",
    base + "School",
    "",
  );
  const result = individualGridPage(local, {
    scope: base + "School",
    sort: "subject",
    page: 1,
    reveal: iri,
  });
  expect(result.page).toBe(6);
  expect(result.rows.map((r) => r.iri)).toEqual([iri]);
  const descending = individualGridPage(local, {
    scope: base + "School",
    sort: "subject",
    direction: -1,
    page: 6,
    reveal: iri,
  });
  expect(descending.page).toBe(1);
  expect(descending.rows[0].iri).toBe(iri);
  const other = local.createNamedIndividual("Outside", NS.owl + "Thing", "");
  expect(
    individualGridPage(local, {
      scope: base + "School",
      page: 2,
      reveal: other,
    }).page,
  ).toBe(2);
});
