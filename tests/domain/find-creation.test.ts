import { describe, expect, it } from "vitest";
import { createFindEntity, previewFindCreation } from "../../src/domain/find-creation";
import { createTextAnalysisHierarchy } from "../../src/domain/text-analysis-authoring";
import { entityNameKey, entityIdentifier } from "../../src/shared/entity-names";
import { emptyFindDraft } from "../../src/shared/find-create";
import { entityNameCollisions } from "../../src/domain/entity-name-index";
import { parseRdf } from "../../src/domain/rdf-io";
import { NS, SUBCLASS, THING, TYPE } from "../../src/domain/model";
import { base, declaration, fromTriples, iri, literal, reference } from "../fixtures/search/fixture";

const fixture = () => fromTriples([
  ...declaration(iri("Root"), "Foundation"),
  ...declaration(iri("Existing"), "Café Studies"),
  ...declaration(iri("Prop"), "Public Property", NS.owl + "ObjectProperty"),
  ...declaration(iri("Other"), "Greek Alpha", NS.rdfs + "Datatype"),
  ...declaration(iri("Person"), "Alice Example", NS.owl + "NamedIndividual"),
  reference(iri("Existing"), SUBCLASS, iri("Root")),
  literal(iri("Existing"), NS.skos + "altLabel", "Legacy Course"),
]);
const draft = (label = "New Subject") => ({ ...emptyFindDraft(), label });
const canonical = (triples: import("../../src/domain/model").Triple[]) => triples.map(t => JSON.stringify([t.subject, t.predicate, t.object.value, t.object.literal, t.object.language ?? "", t.object.literal ? t.object.datatype ?? NS.xsd + "string" : ""])).sort();
describe("Find creation", () => {
  it.each([
    ["Café Studies", "exact"], ["CAFE\u0301 STUDIES", "exact"], ["Café---Studies", "normalized"],
    ["Public Property", "exact"], ["Greek Alpha", "exact"], ["Alice Example", "exact"], ["Legacy Course", "normalized"],
  ])("blocks whole-store collision %s (%s)", async (label, kind) => {
    const store = fixture(), before = canonical([...store.scan()]);
    const preview = await previewFindCreation(store, draft(label), 7);
    expect(preview.collisions[0].kind).toBe(kind);
    expect(() => createFindEntity(store, draft(label), 7)).toThrow(/exists/);
    expect(canonical([...store.scan()])).toEqual(before);
  });
  it.each(["日本語", "Ελληνικά", "العربية", "हिन्दी", "中文", "한글", "naïve", "Crème brûlée", "cafe\u0301"])("retains a Unicode identity and detects a duplicate for %s", async label => {
    const store = fixture(), creation = draft(label);
    expect(entityNameKey(label)).not.toBe("");
    expect(entityIdentifier(label)).not.toBe("Entity");
    const preview = await previewFindCreation(store, creation, 1);
    const created = createFindEntity(store, creation, 1);
    expect(created).toBe(preview.iri);
    expect(store.entities.get(created)?.label).toBe(label);
    expect(() => createFindEntity(store, creation, 1)).toThrow(/exists/);
  });
  it("does not collapse different non-Latin names or punctuation-only labels", () => {
    expect(entityNameKey("日本語")).not.toBe(entityNameKey("中文"));
    expect(entityNameKey("+")).not.toBe(entityNameKey("-"));
    const store = fixture(); createFindEntity(store, draft("日本語"), 1);
    expect(entityNameCollisions(store, "中文").collisions).toEqual([]);
  });
  it("escapes source and saves the exact displayed subject and statements in one undo", async () => {
    const store = fixture(), before = canonical([...store.scan()]);
    const creation = { ...draft('A & B <Topic>'), iri: ":Chosen", comment: 'A < B & "quoted"', parents: [iri("Root"), iri("Existing")], statements: [
      { id: "a", predicate: "skos:altLabel", value: 'Alt & <label>' },
      { id: "b", predicate: "owl:equivalentClass", value: ":Existing" },
      { id: "c", predicate: ":Prop", value: ":Root" },
      { id: "d", predicate: "rdfs:seeAlso", value: "" },
    ] };
    const preview = await previewFindCreation(store, creation, 5);
    expect(preview.errors).toEqual([]); expect(preview.iri).toBe(iri("Chosen"));
    expect(preview.statementCount).toBe(8);
    expect(preview.source).toContain("&amp;"); expect(preview.source).toContain("&lt;");
    const parsed = await parseRdf(preview.source, "draft.rdf", base);
    const subject = createFindEntity(store, creation, 5);
    expect(canonical(store.entityStatements(subject))).toEqual(canonical(parsed.triples));
    expect(store.entities.get(subject)?.parents).toEqual([iri("Root"), iri("Existing")]);
    store.undo(); expect(canonical([...store.scan()])).toEqual(before);
    store.redo(); expect(canonical(store.entityStatements(subject))).toEqual(canonical(parsed.triples));
  });
  it("treats an omitted parent as owl:Thing and omits blank optional values", async () => {
    const store = fixture(); const preview = await previewFindCreation(store, draft(), 2);
    expect(preview.statementCount).toBe(3);
    const subject = createFindEntity(store, draft(), 2);
    expect(store.entities.get(subject)?.parents).toEqual([THING]);
    expect(store.entityStatements(subject).map(t => t.predicate).sort()).toEqual([TYPE, NS.rdfs + "label", SUBCLASS].sort());
  });
  it.each([
    { label: "" }, { label: "x".repeat(257) }, { comment: "x".repeat(10001) },
    { iri: "" }, { iri: "space in IRI" }, { iri: "_:blank" },
    { parents: [iri("missing")] }, { parents: [iri("Prop")] }, { parents: [123] },
    { statements: [{ predicate: TYPE, value: "owl:NamedIndividual" }] },
    { statements: [{ predicate: SUBCLASS, value: ":Root" }] },
    { statements: [{ predicate: "rdfs:label", value: "Other" }] },
    { statements: [{ predicate: "rdfs:comment", value: "Other" }] },
    { statements: [{ predicate: "not valid", value: "foo" }] },
    { statements: [{ predicate: "owl:equivalentClass", value: "bad value" }] },
    { statements: [{ predicate: "skos:altLabel", value: "x".repeat(10001) }] },
    { statements: Array.from({ length: 101 }, () => ({ predicate: "skos:altLabel", value: "A" })) },
  ])("invalid input is previewed and rejected atomically: %j", async change => {
    const store = fixture(), before = canonical([...store.scan()]);
    const input = { ...draft(), ...change };
    const preview = await previewFindCreation(store, input, 1);
    expect(preview.errors.length).toBeGreaterThan(0);
    expect(preview.source).toBe("");
    expect(() => createFindEntity(store, input, 1)).toThrow();
    expect(canonical([...store.scan()])).toEqual(before);
  });
  it.each([iri("Root"), NS.rdfs + "label", NS.owl + "Class"])("blocks an occupied subject %s even with a distinct label", async subject => {
    const store = fixture(), creation = { ...draft(), iri: subject };
    expect((await previewFindCreation(store, creation, 1)).collisions).toEqual(expect.arrayContaining([expect.objectContaining({ iri: subject, kind: "iri" })]));
    expect(() => createFindEntity(store, creation, 1)).toThrow(/exists/);
  });
  it("rechecks duplicates between preview and commit and after undo", async () => {
    const store = fixture(), input = draft();
    expect((await previewFindCreation(store, input, 1)).collisions).toEqual([]);
    store.createClass(input.label, THING);
    expect(() => createFindEntity(store, input, 1)).toThrow(/exists/);
    store.undo(); expect((await previewFindCreation(store, input, 1)).collisions).toEqual([]);
  });
  it("carries IRI, annotations and nested parents through the full creation transaction", async () => {
    const store = fixture(), before = canonical([...store.scan()]);
    const preview = await previewFindCreation(store, { ...draft(), iri: ":Manual", statements: [{ id: "a", predicate: "skos:altLabel", value: "Saved alias" }] }, 1);
    const input = { ...preview.creation, parents: [{ create: { label: "New Parent", comment: "Parent comment", parents: [{ iri: THING }] } }] };
    const created = createTextAnalysisHierarchy(store, input);
    expect(created).toBe(iri("Manual"));
    expect(store.entities.get(created)?.parents).toEqual([iri("NewParent")]);
    expect(store.entityStatements(created).some(t => t.object.value === "Saved alias")).toBe(true);
    store.undo(); expect(canonical([...store.scan()])).toEqual(before);
  });
  it("inherits whole-ontology duplicate protection into new parents", async () => {
    const store = fixture(), preview = await previewFindCreation(store, draft(), 1);
    expect(() => createTextAnalysisHierarchy(store, { ...preview.creation, parents: [{ create: { label: "Public Property", comment: "", parents: [{ iri: THING }] } }] })).toThrow(/collides/);
    expect(store.exists(preview.iri)).toBe(false);
  });
});
