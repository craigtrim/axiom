import { describe, expect, it } from "vitest";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { findEntities } from "../../src/domain/resource-search";
import { NS, SUBCLASS, THING } from "../../src/domain/model";
import { findKinds } from "../../src/shared/find";
import { declaration, fromTriples, iri, labelledStore, literal, reference } from "../fixtures/search/fixture";

const triples = [
  ...declaration(iri("Cobalt"), "Cobalt Studies"),
  ...declaration(iri("Crimson"), "Crimson Lesson"),
  ...declaration(iri("Property"), "Cobalt Relation", NS.owl + "ObjectProperty"),
  ...declaration(iri("Student"), "Cobalt Student", NS.owl + "NamedIndividual"),
  ...declaration(iri("Other"), "Saffron Archive", NS.rdfs + "Datatype"),
  literal(iri("Crimson"), NS.rdfs + "comment", "Saffron manuscripts"),
  literal(iri("Crimson"), NS.skos + "altLabel", "Cobalt Alternatives"),
  literal(iri("Property"), NS.rdfs + "comment", "Crimson archive"),
  reference(iri("Crimson"), SUBCLASS, iri("Cobalt")),
];
const store = fromTriples(triples), index = new EntitySearchIndex(store);
const scopeOptions = [[], ["name"], ["iri"], [NS.rdfs + "comment"], [NS.skos + "altLabel"], ["name", NS.rdfs + "comment"], ["*"], ["unknown"]];
const queries = ["", "Cobalt", "saffron", "the crimson lesson", "Cblt", "Altern", "無関係", "!!!"];
const kinds = Array.from({ length: 16 }, (_, mask) => findKinds.filter((_, i) => mask & (1 << i)));
const matrix = queries.flatMap(text => scopeOptions.flatMap(fields => kinds.map(kinds => ({ text, fields, kinds }))));
describe("Find scope counts and remedies", () => {
  it.each(matrix)("query=$text fields=$fields kinds=$kinds", options => {
    // Each diagnostic is checked against the actual search that its control will run.
    // The main ranker and the diagnostic union evaluator are separate code paths.
    const input = { ...options, browse: true, diagnostics: true };
    const result = index.find(input);
    for (const field of result.fields) {
      const expected = options.text ? index.find({ ...input, diagnostics: false, fields: [field.id] }).total
        : index.find({ text: "", browse: true }).fields.find(f => f.id === field.id)!.count;
      expect(field.count, field.id).toBe(expected);
    }
    for (const kind of result.kinds)
      expect(kind.count, kind.id).toBe(index.find({ ...input, diagnostics: false, kinds: [kind.id] }).total);
    for (const remedy of result.remedies!) {
      const widened = remedy.id === "fields" ? { fields: ["*"] } : remedy.id === "types" ? { kinds: findKinds } : { fields: ["*"], kinds: findKinds };
      expect(remedy.count, remedy.id).toBe(index.find({ ...input, ...widened, diagnostics: false }).total);
    }
    expect(result.storeTotal).toBe(index.find({ text: "", browse: true }).total);
  });
  it.each(matrix.filter(m => m.text))("semantic yields: query=$text fields=$fields kinds=$kinds", options => {
    const scores = new Map([["Crimson Lesson", .95], ["Cobalt Student", .79], ["Saffron Archive", .83], ["Saffron manuscripts", .6], ["Crimson archive", Number.NaN]]);
    const input = { ...options, diagnostics: true, browse: true };
    const result = index.find(input, scores);
    for (const field of result.fields) expect(field.count).toBe(index.find({ ...input, fields: [field.id], diagnostics: false }, scores).total);
    for (const kind of result.kinds) expect(kind.count).toBe(index.find({ ...input, kinds: [kind.id], diagnostics: false }, scores).total);
    for (const remedy of result.remedies!) {
      const widened = remedy.id === "fields" ? { fields: ["*"] } : remedy.id === "types" ? { kinds: findKinds } : { fields: ["*"], kinds: findKinds };
      expect(remedy.count).toBe(index.find({ ...input, ...widened, diagnostics: false }, scores).total);
    }
  });
  it("counts a field independently even when it is unchecked and distinguishes kinds from absence", () => {
    const result = index.find({ text: "Saffron manuscripts", fields: [], kinds: ["classes"], diagnostics: true });
    expect(result.total).toBe(0);
    expect(result.fields.find(f => f.id === NS.rdfs + "comment")!.count).toBe(1);
    expect(result.remedies).toEqual([{ id: "fields", count: 1 }, { id: "types", count: 0 }, { id: "reset", count: 2 }]);
    expect(index.find({ text: "Student", fields: ["name"], kinds: ["classes"], diagnostics: true }).emptyCause).toBe("filters");
    expect(index.find({ text: "unfindablezz", diagnostics: true }).emptyCause).toBe("query");
  });
  it("blank browsing ignores field scope but respects entity kinds and exclusion", () => {
    const result = index.find({ text: "  ", fields: [], kinds: ["properties"], excludeIri: iri("Property"), browse: true, diagnostics: true });
    expect(result.total).toBe(0);
    expect(result.storeTotal).toBeGreaterThan(4);
    expect(index.find({ text: "", fields: [], kinds: ["properties"], browse: true }).rows.map(r => r.iri)).toContain(iri("Property"));
    expect(index.find({ text: "", fields: [] }).total).toBe(0); // Quick Find remains a typeahead.
  });
  it("reports ancestry, aliases, and field evidence without introducing reference-only entities", () => {
    const result = index.find({ text: "manuscripts", fields: [NS.rdfs + "comment"], diagnostics: true });
    expect(result.rows[0]).toMatchObject({ iri: iri("Crimson"), path: "Cobalt Studies", aliases: ["Cobalt Alternatives"], matchedField: NS.rdfs + "comment", matchedValue: "Saffron manuscripts" });
    const labels = index.find({ browse: true, limit: 100, diagnostics: true }).rows;
    expect(labels.some(r => r.iri === NS.rdfs + "label")).toBe(false);
  });
  it.each([10, 25, 50])("reveals an existing result on its real page with size %s", limit => {
    const large = new EntitySearchIndex(labelledStore(Array.from({ length: 137 }, (_, i) => ({ id: `Class${i}`, label: `Class ${String(i).padStart(3, "0")}` }))));
    const result = large.find({ text: "Class", sort: "name", limit, revealIri: iri("Class136"), diagnostics: true });
    expect(result.offset).toBe(Math.floor(136 / limit) * limit);
    expect(result.rows.at(-1)?.iri).toBe(iri("Class136"));
    expect(result.total).toBe(137);
    expect(large.find({ text: "absentzz", revealIri: iri("Class136") }).total).toBe(0);
  });
  it("refreshes count caches on add, undo and redo", () => {
    const s = fromTriples(triples), query = { text: "Unicorn", diagnostics: true };
    expect(findEntities(s, query).total).toBe(0);
    s.createClass("Unicorn", THING);
    expect(findEntities(s, query).kinds.find(k => k.id === "classes")?.count).toBe(1);
    s.undo(); expect(findEntities(s, query).total).toBe(0);
    s.redo(); expect(findEntities(s, query).total).toBe(1);
  });
});
