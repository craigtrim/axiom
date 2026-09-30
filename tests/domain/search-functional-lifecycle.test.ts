import { describe, expect, it } from "vitest";
import { NS, THING } from "../../src/domain/model";
import {
  findEntities,
  indexFor,
  resourceSuggestions,
} from "../../src/domain/resource-search";
import { findGraphNodes } from "../../src/domain/find-graph";
import { concepts } from "../fixtures/search/catalog";
import {
  declaration,
  fromTriples,
  iri,
  literal,
} from "../fixtures/search/fixture";

describe("functional search: edits, undo, redo and store isolation", () => {
  it.each(concepts)(
    "RENAME-$id | $label updates every search surface across undo and redo",
    (concept) => {
      const subject = iri(concept.localName);
      const store = fromTriples(declaration(subject, concept.label));
      const old = { text: concept.label, fields: ["name"] };
      const replacement = "Replacement ZXQO";
      expect(findEntities(store, old).rows.map((r) => r.iri)).toEqual([
        subject,
      ]);
      expect(indexFor(store).semanticTexts(["name"])).toContain(concept.label);
      store.updateEntity(subject, declaration(subject, replacement));
      const checkNew = () => {
        expect(findEntities(store, old).rows).toEqual([]);
        expect(
          findEntities(store, { text: replacement }).rows[0],
        ).toMatchObject({ iri: subject, name: replacement });
        expect(resourceSuggestions(store, replacement, true)[0]?.iri).toBe(
          subject,
        );
        expect(findGraphNodes(store, { text: replacement }).matches).toEqual([
          subject,
        ]);
        expect(indexFor(store).semanticTexts(["name"])).not.toContain(
          concept.label,
        );
        expect(indexFor(store).semanticTexts(["name"])).toContain(replacement);
      };
      checkNew();
      store.undo();
      expect(findEntities(store, old).rows[0]?.name).toBe(concept.label);
      expect(findEntities(store, { text: replacement }).rows).toEqual([]);
      expect(indexFor(store).semanticTexts(["name"])).toContain(concept.label);
      store.redo();
      checkNew();
    },
  );
  it.each(concepts)(
    "ALIAS-EDIT-$id | $alias can be added, removed, undone and redone",
    (concept) => {
      const subject = iri(concept.localName);
      const store = fromTriples(declaration(subject, concept.label));
      const options = { text: concept.alias, fields: ["name"] };
      expect(findEntities(store, options).rows).toEqual([]);
      store.updateEntity(subject, [
        ...store.entityStatements(subject),
        literal(subject, NS.skos + "altLabel", concept.alias),
      ]);
      expect(findEntities(store, options).rows.map((r) => r.iri)).toEqual([
        subject,
      ]);
      expect(resourceSuggestions(store, concept.alias, true)[0]?.iri).toBe(
        subject,
      );
      expect(indexFor(store).semanticTexts(["name"])).toContain(concept.alias);
      store.updateEntity(
        subject,
        store
          .entityStatements(subject)
          .filter((t) => t.predicate !== NS.skos + "altLabel"),
      );
      expect(findEntities(store, options).rows).toEqual([]);
      expect(indexFor(store).semanticTexts(["name"])).not.toContain(
        concept.alias,
      );
      store.undo();
      expect(findEntities(store, options).rows.map((r) => r.iri)).toEqual([
        subject,
      ]);
      store.redo();
      expect(findEntities(store, options).rows).toEqual([]);
    },
  );
  it.each(concepts)(
    "DELETE-$id | $label disappears and is restored without stale suggestions",
    (concept) => {
      const subject = iri(concept.localName);
      const store = fromTriples(declaration(subject, concept.label));
      const options = { text: concept.label, fields: ["name"] };
      expect(findEntities(store, options).rows[0]?.iri).toBe(subject);
      store.deleteClass(subject);
      expect(findEntities(store, options).rows).toEqual([]);
      expect(resourceSuggestions(store, concept.label, true)).toEqual([]);
      expect(indexFor(store).semanticTexts(["name"])).not.toContain(
        concept.label,
      );
      store.undo();
      expect(findEntities(store, options).rows[0]?.iri).toBe(subject);
      expect(resourceSuggestions(store, concept.label, true)[0]?.iri).toBe(
        subject,
      );
      store.redo();
      expect(findEntities(store, options).rows).toEqual([]);
    },
  );
  it.each(concepts)(
    "IRI-EDIT-$id | $label keeps its label match under a new identity",
    (concept) => {
      const subject = iri(concept.localName),
        renamed = iri("Relocated_Opaque");
      const store = fromTriples(declaration(subject, concept.label));
      const options = { text: concept.label, fields: ["name"] };
      expect(findEntities(store, options).rows[0]?.iri).toBe(subject);
      store.updateEntity(subject, store.entityStatements(subject), renamed);
      expect(findEntities(store, options).rows.map((r) => r.iri)).toEqual([
        renamed,
      ]);
      expect(resourceSuggestions(store, concept.label, true)[0]?.iri).toBe(
        renamed,
      );
      expect(indexFor(store).semanticTexts(["iri"])).not.toContain(subject);
      expect(indexFor(store).semanticTexts(["iri"])).toContain(renamed);
      store.undo();
      expect(findEntities(store, options).rows.map((r) => r.iri)).toEqual([
        subject,
      ]);
      store.redo();
      expect(findEntities(store, options).rows.map((r) => r.iri)).toEqual([
        renamed,
      ]);
    },
  );
  it.each(concepts)(
    "FIELD-EDIT-$id | new predicates update the field catalog and semantic corpus",
    (concept) => {
      const subject = iri(concept.localName),
        field = iri("notes");
      const store = fromTriples(declaration(subject, concept.label));
      const options = { text: "Distinctive Annotation", fields: [field] };
      expect(findEntities(store, options).rows).toEqual([]);
      expect(indexFor(store).semanticTexts([field])).toEqual([]);
      store.updateEntity(subject, [
        ...store.entityStatements(subject),
        literal(subject, field, options.text),
      ]);
      expect(findEntities(store, options).rows.map((r) => r.iri)).toEqual([
        subject,
      ]);
      expect(
        findEntities(store, options).fields.find((f) => f.id === field)?.count,
      ).toBe(1);
      expect(indexFor(store).semanticTexts([field])).toEqual([options.text]);
      store.undo();
      expect(findEntities(store, options).rows).toEqual([]);
      expect(
        findEntities(store, options).fields.find((f) => f.id === field),
      ).toBeUndefined();
      expect(indexFor(store).semanticTexts([field])).toEqual([]);
      store.redo();
      expect(findEntities(store, options).rows.map((r) => r.iri)).toEqual([
        subject,
      ]);
    },
  );
  it("a newly created class becomes searchable after the index has already been used", () => {
    const store = fromTriples(declaration(iri("Existing"), "Existing Concept"));
    const options = { text: "Created Concept", fields: ["name"] };
    // OR search may already match Existing Concept, so assert the new identity explicitly.
    findEntities(store, options);
    const created = store.createClass("Created Concept", THING);
    expect(findEntities(store, options).rows[0]?.iri).toBe(created);
    expect(resourceSuggestions(store, "created concept", true)[0]?.iri).toBe(
      created,
    );
    store.undo();
    expect(findEntities(store, options).rows.map((r) => r.iri)).not.toContain(
      created,
    );
    store.redo();
    expect(findEntities(store, options).rows[0]?.iri).toBe(created);
  });
  it("stores with equal version numbers keep independent results and semantic corpora", () => {
    const a = fromTriples(declaration(iri("target"), "Reading Comprehension"));
    const b = fromTriples(declaration(iri("target"), "Marine Ecology"));
    expect(a.version).toBe(b.version);
    for (let n = 0; n < 3; n++) {
      expect(findEntities(a, { text: "reading" }).total).toBe(1);
      expect(findEntities(b, { text: "reading" }).total).toBe(0);
      expect(indexFor(a).semanticTexts(["name"])).not.toContain(
        "Marine Ecology",
      );
      expect(indexFor(b).semanticTexts(["name"])).not.toContain(
        "Reading Comprehension",
      );
    }
  });
  it("searching, paging, suggestions and semantic corpus reads leave ontology data unchanged", () => {
    const store = fromTriples(
      declaration(iri("target"), "Reading Comprehension"),
    );
    const before = structuredClone({
      version: store.version,
      triples: store.tbox,
      entities: [...store.entities],
    });
    for (const concept of concepts) {
      findEntities(store, { text: concept.label, offset: 99, limit: 1 });
      resourceSuggestions(store, concept.alias);
      indexFor(store).semanticTexts(["*"]);
    }
    expect({
      version: store.version,
      triples: store.tbox,
      entities: [...store.entities],
    }).toEqual(before);
  });
});
