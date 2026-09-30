import { describe, expect, it } from "vitest";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { NS, type Kind } from "../../src/domain/model";
import { findKinds } from "../../src/shared/find";
import {
  aliasPredicates,
  declaration,
  fromTriples,
  iri,
  labelledStore,
  literal,
  reference,
} from "../fixtures/search/fixture";

const target = iri("Subject_7301"),
  related = iri("Related_8426");
const note = iri("notes"),
  relation = iri("relatedTo");
const scopeStore = fromTriples([
  ...declaration(target, "Principal Heading"),
  ...declaration(related, "Connected Vocabulary"),
  literal(target, NS.skos + "altLabel", "Alternate Wording"),
  literal(target, NS.rdfs + "comment", "Documentation Passage"),
  literal(target, note, "Private Annotation"),
  reference(target, relation, related),
]);
const scopeIndex = new EntitySearchIndex(scopeStore);
const scopedQueries = [
  { id: "preferred", query: "Principal Heading", field: "name" },
  { id: "alias", query: "Alternate Wording", field: "name" },
  { id: "iri-local", query: "Subject_7301", field: "iri" },
  { id: "iri-compact", query: ":Subject_7301", field: "iri" },
  { id: "comment", query: "Documentation Passage", field: NS.rdfs + "comment" },
  { id: "custom-literal", query: "Private Annotation", field: note },
  { id: "resource-label", query: "Connected Vocabulary", field: relation },
  { id: "resource-compact", query: ":Related_8426", field: relation },
];
describe("functional search: fields and RDF values", () => {
  it.each(
    scopedQueries.flatMap((c) =>
      ["name", "iri", NS.rdfs + "comment", note, relation, "*", "missing"].map(
        (field) => ({ ...c, selected: field }),
      ),
    ),
  )("SCOPE-$id | $query in $selected", ({ query, field, selected }) => {
    const result = scopeIndex.find({ text: query, fields: [selected] });
    expect(result.rows.some((r) => r.iri === target)).toBe(
      selected === field || selected === "*",
    );
  });
  it.each(scopedQueries)(
    "CORPUS-$id includes selected values and excludes unrelated scopes",
    ({ query, field }) => {
      // Compact/local IRI forms are independently searchable; corpus assertions use stored values.
      const texts = scopeIndex.semanticTexts([field]);
      expect(texts.some((t) => t.includes(query.replace(/^:/, "")))).toBe(true);
      expect(scopeIndex.semanticTexts([])).toEqual([]);
      expect(scopeIndex.semanticTexts(["missing"])).toEqual([]);
    },
  );
  it.each(aliasPredicates)(
    "ALIAS-PREDICATE %s supports Find, suggestions, and field-specific search",
    (predicate) => {
      const index = new EntitySearchIndex(
        fromTriples([
          ...declaration(target, "Principal Heading"),
          literal(target, predicate, "Alternate Wording", "fr"),
        ]),
      );
      expect(
        index.find({ text: "alternate wording", fields: ["name"] }).rows[0]
          ?.iri,
      ).toBe(target);
      expect(
        index.find({ text: "alternate wording", fields: [predicate] }).rows[0]
          ?.iri,
      ).toBe(target);
      expect(index.search("alternate wording", true)[0]?.iri).toBe(target);
    },
  );
  it("does not treat an IRI-valued seeAlso as a name alias", () => {
    const index = new EntitySearchIndex(
      fromTriples([
        ...declaration(target, "Principal Heading"),
        ...declaration(related, "Connected Vocabulary"),
        reference(target, NS.rdfs + "seeAlso", related),
      ]),
    );
    expect(
      index
        .find({ text: "connected vocabulary", fields: ["name"] })
        .rows.map((r) => r.iri),
    ).toEqual([related]);
    expect(
      index
        .find({ text: "connected vocabulary", fields: [NS.rdfs + "seeAlso"] })
        .rows.map((r) => r.iri),
    ).toEqual([target]);
  });
  it.each(["", "en", "fr", "ja", "en-GB"])(
    "LITERAL language=%j preserves matching and deduplicates graph assertions",
    (language) => {
      const index = new EntitySearchIndex(
        fromTriples([
          ...declaration(target, "Principal Heading"),
          literal(
            target,
            note,
            "Distinctive Annotation",
            language,
            iri("GraphA"),
          ),
          literal(
            target,
            note,
            "Distinctive Annotation",
            language,
            iri("GraphB"),
          ),
        ]),
      );
      expect(
        index
          .find({ text: "distinctive annotation", fields: [note] })
          .rows.map((r) => r.iri),
      ).toEqual([target]);
      expect(index.semanticTexts([note])).toEqual(["Distinctive Annotation"]);
      expect(
        index
          .find({ text: "distinctive", fields: [note] })
          .fields.find((f) => f.id === note)?.count,
      ).toBe(1);
    },
  );
  it.each([
    NS.xsd + "string",
    NS.xsd + "integer",
    NS.xsd + "decimal",
    NS.xsd + "date",
  ])("DATATYPE %s searches the literal's lexical value", (datatype) => {
    const statement = literal(target, note, "2048");
    statement.object.datatype = datatype;
    const index = new EntitySearchIndex(
      fromTriples([...declaration(target, "Principal Heading"), statement]),
    );
    expect(
      index.find({ text: "2048", fields: [note] }).rows.map((r) => r.iri),
    ).toEqual([target]);
  });
  it("includes referenced-only IRIs in suggestions, while Find returns projected entities", () => {
    const unknown = iri("Unprojected_ZZQV"),
      blank = "_:HiddenZZQV";
    const store = labelledStore([
      { id: "Subject_7301", label: "Principal Heading" },
    ]);
    store.tbox = [
      reference(target, relation, unknown),
      reference(target, relation, blank),
    ];
    const index = new EntitySearchIndex(store);
    expect(index.search("Unprojected ZZQV").map((r) => r.iri)).toContain(
      unknown,
    );
    expect(index.find({ text: "Unprojected ZZQV" }).rows).toEqual([]);
    expect(index.search("Unprojected ZZQV", true)).toEqual([]);
    expect(index.search("HiddenZZQV").some((r) => r.iri.startsWith("_:"))).toBe(
      false,
    );
  });
  it("searches generated orders and customers with their own category and fields", () => {
    const store = labelledStore([]);
    store.loadGenerated(
      [
        {
          index: 0,
          iri: iri("order"),
          type: iri("Product"),
          reference: "Invoice Kappa",
          branch: "Branch Sigma",
          price: 12.5,
          timestamp: 1700000000000,
          rating: 4,
          customerIndex: 0,
        },
      ],
      [{ iri: iri("customer"), name: "Customer Omega" }],
    );
    const index = new EntitySearchIndex(store);
    for (const [text, expected] of [
      ["Invoice Kappa", "order"],
      ["Customer Omega", "customer"],
    ]) {
      expect(index.find({ text, kinds: ["individuals"] }).rows[0]?.iri).toBe(
        iri(expected),
      );
      expect(index.find({ text, kinds: ["classes"] }).rows).toEqual([]);
      expect(index.search(text, true)).toEqual([]);
    }
    expect(
      index
        .find({ text: "Branch Sigma", fields: [NS.demo + "branch"] })
        .rows.map((r) => r.iri),
    ).toEqual([iri("order")]);
  });
});

const kindRows: { id: string; label: string; kind: Kind; category: string }[] =
  [
    { id: "class", label: "Catalog Class", kind: "Class", category: "classes" },
    {
      id: "defined",
      label: "Catalog Definition",
      kind: "Defined",
      category: "classes",
    },
    {
      id: "individual",
      label: "Catalog Instance",
      kind: "Individual",
      category: "individuals",
    },
    {
      id: "object",
      label: "Catalog Object",
      kind: "ObjectProperty",
      category: "properties",
    },
    {
      id: "data",
      label: "Catalog Data",
      kind: "DataProperty",
      category: "properties",
    },
    {
      id: "annotation",
      label: "Catalog Annotation",
      kind: "AnnotationProperty",
      category: "properties",
    },
    {
      id: "resource",
      label: "Catalog Resource",
      kind: "Resource",
      category: "other",
    },
    {
      id: "datatype",
      label: "Catalog Datatype",
      kind: "Datatype",
      category: "other",
    },
    {
      id: "intersection",
      label: "Catalog Intersection",
      kind: "Intersection",
      category: "other",
    },
  ];
const kindIndex = new EntitySearchIndex(labelledStore(kindRows));
describe("functional search: category selection and facets", () => {
  const subsets = Array.from({ length: 16 }, (_, mask) => ({
    mask,
    kinds: findKinds.filter((_, bit) => (mask & (1 << bit)) !== 0),
  }));
  it.each(subsets)("KINDS-$mask | $kinds", ({ kinds }) => {
    const result = kindIndex.find({ text: "catalog", fields: ["name"], kinds });
    expect(result.rows.map((r) => r.iri).sort()).toEqual(
      kindRows
        .filter((r) => kinds.includes(r.category as (typeof kinds)[number]))
        .map((r) => iri(r.id))
        .sort(),
    );
    expect(result.total).toBe(result.rows.length);
    expect(result.kinds.map((f) => [f.id, f.count])).toEqual([
      ["classes", 2],
      ["individuals", 1],
      ["properties", 3],
      ["other", 3],
    ]);
  });
  it.each(kindRows)(
    "EXCLUDE-$id removes exactly one entity and adjusts its facet",
    (row) => {
      const result = kindIndex.find({
        text: "catalog",
        excludeIri: iri(row.id),
      });
      expect(result.total).toBe(8);
      expect(result.rows.map((r) => r.iri)).not.toContain(iri(row.id));
      expect(result.kinds.find((f) => f.id === row.category)?.count).toBe(
        kindRows.filter((r) => r.category === row.category).length - 1,
      );
      expect(
        kindIndex
          .search("catalog", false, [iri(row.id)])
          .map((r) => r.iri)
          .sort(),
      ).toEqual(
        kindRows
          .filter((r) => r.id !== row.id)
          .map((r) => iri(r.id))
          .sort(),
      );
    },
  );
  it("classes-only suggestions include ordinary and defined classes", () => {
    expect(
      kindIndex
        .search("catalog", true)
        .map((r) => r.iri)
        .sort(),
    ).toEqual([iri("class"), iri("defined")]);
  });
});
