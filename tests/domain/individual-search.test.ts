import { describe, expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  individualGridPage,
  individualGridFindOptions,
} from "../../src/domain/individual-columns";
import { instancePage } from "../../src/domain/instances";
import {
  findEntities,
  findEntityIris,
  indexFor,
} from "../../src/domain/resource-search";
import { NS } from "../../src/domain/model";
import { readFindOptions } from "../../src/shared/find";
import { buildStore } from "../../src/domain/fixture";

const base = "http://devry.edu/school-names#",
  school = base + "School";
const hamburger = base + "Q1000206",
  mercy = base + "Q2";
const shown = ["subject", NS.rdfs + "seeAlso"];
const fixture = `@prefix : <${base}> .
@prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> . @prefix owl: <${NS.owl}> .
:Q1000206 a :School ; rdfs:label "Hamburger University"@en ;
  rdfs:seeAlso "Hamburger College"@en, "McDonald's University"@en .
:Q2 a :Hospital ; rdfs:label "Mercy Hospital"@en ;
  rdfs:seeAlso "McDonald's University"@en .`;
const load = async (extra = "") =>
  storeFromRdf(
    (await parseRdf(fixture + extra, "individual-search.ttl", base)).triples,
    "Individuals search",
  );

describe("issue 59: shared ranked instance search", () => {
  it("finds both alias matches in the grid and only direct School instances in the report", async () => {
    const store = await load();
    expect(
      new Set(
        individualGridPage(store, { query: "McDonald's", shown }).rows.map(
          (r) => r.iri,
        ),
      ),
    ).toEqual(new Set([hamburger, mercy]));
    expect(instancePage(store, school, "McDonald's")).toMatchObject({
      total: 1,
      filtered: 1,
      rows: [{ iri: hamburger }],
    });
    expect(
      individualGridPage(store, {
        query: "McDonald's",
        shown,
        scope: school,
      }).rows.map((r) => r.iri),
    ).toEqual([hamburger]);
  });

  it.each([
    "hamburgr university",
    "university hamburger",
    "university for hamburger",
    "hamb univ",
  ])(
    "ranks the best match first for %s even with an alphabetically earlier distractor",
    async (query) => {
      const store = await load(
        `:Q3 a :School; rdfs:label "A campus annex"; rdfs:seeAlso "Hamburger University annex" .`,
      );
      expect(individualGridPage(store, { query, shown }).rows[0].iri).toBe(
        hamburger,
      );
      expect(instancePage(store, school, query).rows[0].iri).toBe(hamburger);
    },
  );

  it("lists every in-scope instance when the query is empty", async () => {
    const store = await load();
    expect(individualGridPage(store, {}).total).toBe(2);
    expect(
      individualGridPage(store, { scope: school, query: "  " }).rows.map(
        (r) => r.iri,
      ),
    ).toEqual([hamburger]);
    expect(instancePage(store, school, "  ").rows.map((r) => r.iri)).toEqual([
      hamburger,
    ]);
  });

  it("uses Find's OR retrieval rather than requiring every query word", async () => {
    const store = await load();
    const input = { query: "university culinary", shown };
    const expected = findEntityIris(
      store,
      individualGridFindOptions(store, input),
    );
    expect(expected).toHaveLength(2);
    expect(individualGridPage(store, input).rows.map((r) => r.iri)).toEqual(
      expected,
    );
  });

  it("does not let a literal match outside the class remove a scoped fuzzy match", async () => {
    const store = await load(
      `:Q3 a :Hospital; rdfs:label "Hamburgr University" .`,
    );
    expect(
      individualGridPage(store, {
        query: "hamburgr university",
        shown,
        scope: school,
      }).rows.map((r) => r.iri),
    ).toEqual([hamburger]);
    expect(
      instancePage(store, school, "hamburgr university").rows.map((r) => r.iri),
    ).toEqual([hamburger]);
  });

  it("keeps hidden aliases and namespace text out while searching local names with the same fuzzy engine", async () => {
    const store = await load(
      `:HamburgerCampus a :School; rdfs:label "McDonald Training Centre" .`,
    );
    const grid = (query: string, columns = ["subject"]) =>
      individualGridPage(store, { query, shown: columns });
    expect(
      grid("McDonald's").rows.some(
        (r) => r.iri === hamburger || r.iri === mercy,
      ),
    ).toBe(false);
    expect(grid("devry").total).toBe(0);
    expect(grid("devry", ["subject", "iri"]).total).toBe(3);
    expect(grid("hamburgr campus").rows[0].iri).toBe(base + "HamburgerCampus");
    expect(grid("Q10002").rows.map((r) => r.iri)).toContain(hamburger);
  });

  it.each([
    NS.rdfs + "seeAlso",
    NS.skos + "altLabel",
    NS.skos + "prefLabel",
    NS.rdfs + "label",
  ])(
    "searches additional literal values of %s only when the column is shown",
    async (predicate) => {
      const store = await load(`:Q1000206 <${predicate}> "Zebra Training" .`);
      const query = store.label(hamburger).includes("Zebra")
        ? "hamburger"
        : "zebra";
      expect(
        individualGridPage(store, { query, shown: ["subject"] }).total,
      ).toBe(0);
      expect(
        individualGridPage(store, {
          query,
          shown: ["subject", predicate],
        }).rows.map((r) => r.iri),
      ).toEqual([hamburger]);
      expect(instancePage(store, school, query).rows.map((r) => r.iri)).toEqual(
        [hamburger],
      );
    },
  );

  it("limits semantic admission and its relative cutoff to direct class members", async () => {
    const store = await load(
      Array.from(
        { length: 12 },
        (_, n) => `:Outside${n} a :Hospital; rdfs:label "Opaquequery ${n}" .`,
      ).join("\n"),
    );
    const scores = new Map([
      ["Mercy Hospital", 0.99],
      ["Hamburger University", 0.6],
    ]);
    expect(
      individualGridPage(
        store,
        { query: "opaquequery", scope: school, shown },
        scores,
      ).rows.map((r) => r.iri),
    ).toEqual([hamburger]);
    expect(
      instancePage(store, school, "opaquequery", 0, scores).rows.map(
        (r) => r.iri,
      ),
    ).toEqual([hamburger]);
    const find = findEntities(
      store,
      { text: "opaquequery", instanceOf: school, diagnostics: true },
      scores,
    );
    expect(find.total).toBe(1);
    expect(find.storeTotal).toBe(1);
    expect(find.kinds.find((k) => k.id === "individuals")?.count).toBe(1);
    expect(find.remedies?.every((r) => r.count === 1)).toBe(true);
  });

  it("does not admit semantic matches from hidden fields or require the model for lexical results", async () => {
    const store = await load();
    const scores = new Map([["McDonald's University", 0.9]]);
    expect(
      individualGridPage(
        store,
        { query: "opaquequery", shown: ["subject"] },
        scores,
      ).total,
    ).toBe(0);
    expect(
      individualGridPage(store, { query: "opaquequery", shown }, scores).total,
    ).toBe(2);
    expect(instancePage(store, school, "opaquequery", 0, scores).filtered).toBe(
      1,
    );
    expect(
      instancePage(store, school, "hamburgr university", 0, undefined).rows[0]
        .iri,
    ).toBe(hamburger);
    expect(
      indexFor(store).semanticTexts(
        individualGridFindOptions(store, { shown: ["subject"] }).fields,
      ),
    ).not.toContain("McDonald's University");
  });

  it("does not let generated example rows consume the named grid's semantic admission", () => {
    const store = buildStore(1000);
    const type = store.individuals[0].type;
    const named = store.createNamedIndividual("Related campus", type);
    const scores = new Map([
      ["Related campus", 0.6],
      [store.individuals[0].reference, 0.99],
    ]);
    expect(
      individualGridPage(
        store,
        { query: "opaquequery", scope: type, shown: ["subject"] },
        scores,
      ).rows.map((r) => r.iri),
    ).toEqual([named]);
  });

  it("retains explicit column ordering and returns to alphabetical browsing without a query", async () => {
    const store = await load(
      `:Q3 a :School; rdfs:label "A campus annex"; rdfs:seeAlso "Hamburger University annex" .`,
    );
    const input = { query: "hamburgr university", shown };
    expect(individualGridPage(store, input).rows[0].iri).toBe(hamburger);
    expect(
      individualGridPage(store, { ...input, sort: "subject" }).rows[0].iri,
    ).toBe(base + "Q3");
    expect(individualGridPage(store, { shown }).rows[0].iri).toBe(base + "Q3");
  });

  it("pages the complete ranked set without losing or duplicating matches", async () => {
    const store = await load(
      Array.from(
        { length: 215 },
        (_, n) => `:Campus${n} a :School; rdfs:label "Campus ${n}" .`,
      ).join("\n"),
    );
    const input = { query: "campus", scope: school, shown: ["subject"] };
    const expected = findEntityIris(
      store,
      individualGridFindOptions(store, input),
    );
    const grid = [1, 2, 3].flatMap((page) =>
      individualGridPage(store, { ...input, page }).rows.map((r) => r.iri),
    );
    expect(expected).toHaveLength(215);
    expect(grid).toEqual(expected);
    const report = [0, 100, 200].flatMap((start) =>
      instancePage(store, school, "campus", start).rows.map((r) => r.iri),
    );
    expect(report).toEqual(
      findEntityIris(store, {
        text: "campus",
        instanceOf: school,
        kinds: ["individuals"],
      }),
    );
    expect(individualGridPage(store, { ...input, page: 999 }).page).toBe(3);
    expect(instancePage(store, school, "campus", 999).start).toBe(200);
  });

  it("does not include subclass instances and invalidates class membership with the store index", async () => {
    const store = await load(
      `:Academy rdfs:subClassOf :School . :Q3 a :Academy; rdfs:label "Hamburger Academy" .`,
    );
    expect(
      findEntities(store, { text: "Hamburger", instanceOf: school }).rows.map(
        (r) => r.iri,
      ),
    ).toEqual([hamburger]);
    store.entities.get(base + "Q3")!.types.push(school);
    store.rebuildSchema();
    store.version++;
    expect(
      new Set(findEntityIris(store, { text: "Hamburger", instanceOf: school })),
    ).toEqual(new Set([hamburger, base + "Q3"]));
    expect(
      findEntities(store, { text: "Hamburger", instanceOf: base + "Unknown" })
        .total,
    ).toBe(0);
  });

  it("keeps Find's default field catalog and validates its optional class scope", async () => {
    const store = await load();
    const result = findEntities(store, { text: "McDonald's" });
    expect(result.rows.filter((r) => r.kind === "Individual")).toHaveLength(2);
    expect(result.fields.some((f) => f.id.startsWith("$"))).toBe(false);
    expect(readFindOptions({ instanceOf: school }).instanceOf).toBe(school);
    expect(readFindOptions({ instanceOf: 1 }).instanceOf).toBeUndefined();
  });
});
