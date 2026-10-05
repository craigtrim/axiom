import { expect, it } from "vitest";
import { NS, TYPE, SUBCLASS, SUBPROPERTY } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  createFindEntity,
  previewFindCreation,
} from "../../src/domain/find-creation";
import {
  emptyFindDraft,
  findCreationKinds,
  creationType,
  creationRelation,
} from "../../src/shared/find-create";
const base = "https://example.test/extend#";
const make = async () =>
  storeFromRdf(
    (
      await parseRdf(
        `
@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
:Class a owl:Class; rdfs:label "Class target".
:ObjectProperty a owl:ObjectProperty; rdfs:label "Object target".
:DataProperty a owl:DatatypeProperty; rdfs:label "Data target".
:AnnotationProperty a owl:AnnotationProperty; rdfs:label "Annotation target".
:Existing a owl:Class; rdfs:label "Taken label".
`,
        "fixture.ttl",
        base,
      )
    ).triples,
    "Extend",
  );
it.each(findCreationKinds)(
  "creates %s with its actual relation, IRI, comment, statements and one Undo",
  async (kind) => {
    const store = await make(),
      before = structuredClone(store.tbox),
      history = store.undoStack.length;
    const target = base + (kind === "Individual" ? "Class" : kind);
    const input = {
      ...emptyFindDraft("new entity"),
      kind,
      iri: base + "Custom",
      comment: "A description",
      parents: [target],
      statements: [{ id: "one", predicate: "rdfs:seeAlso", value: "Alias" }],
    };
    const preview = await previewFindCreation(store, input, 1);
    expect(preview.errors).toEqual([]);
    const created = createFindEntity(store, input, 1);
    expect(created).toBe(input.iri);
    expect(store.resolve(created)?.kind).toBe(kind);
    const rows = store.entityStatements(created);
    expect(rows).toContainEqual(
      expect.objectContaining({
        predicate: creationRelation(kind),
        object: expect.objectContaining({ literal: false, value: target }),
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        predicate: TYPE,
        object: expect.objectContaining({ value: creationType(kind) }),
      }),
    );
    expect(
      rows.some(
        (t) =>
          t.predicate === NS.rdfs + "comment" &&
          t.object.value === "A description",
      ),
    ).toBe(true);
    expect(
      rows.some(
        (t) =>
          t.predicate === NS.rdfs + "seeAlso" && t.object.value === "Alias",
      ),
    ).toBe(true);
    if (kind !== "Class")
      expect(rows.some((t) => t.predicate === SUBCLASS)).toBe(false);
    if (!kind.endsWith("Property"))
      expect(rows.some((t) => t.predicate === SUBPROPERTY)).toBe(false);
    expect(
      (await parseRdf(preview.source, "preview.rdf", base)).triples,
    ).toHaveLength(rows.length);
    expect(store.undoStack).toHaveLength(history + 1);
    store.undo();
    expect(store.tbox).toEqual(before);
    expect(store.exists(created)).toBe(false);
    store.redo();
    expect(store.entityStatements(created)).toEqual(rows);
  },
);
for (const kind of findCreationKinds.filter((k) => k !== "Class")) {
  it.each(
    [
      [],
      [base + "Missing"],
      [base + "Created"],
      [base + (kind === "Individual" ? "ObjectProperty" : "Class")],
    ].map((parents) => ({ parents })),
  )(
    `${kind} rejects a missing, stale, self or incompatible target: %j`,
    async ({ parents }) => {
      const store = await make(),
        before = structuredClone(store.tbox);
      const input = {
        ...emptyFindDraft("Created"),
        kind,
        parents,
        iri: base + "Created",
      };
      expect(
        (await previewFindCreation(store, input, 1)).errors.some(
          (e) => e.field === "parents",
        ),
      ).toBe(true);
      expect(() => createFindEntity(store, input, 1)).toThrow();
      expect(store.tbox).toEqual(before);
      expect(store.undoStack).toHaveLength(0);
    },
  );
  it(`${kind} checks whole-ontology collisions and revalidates before commit`, async () => {
    const store = await make(),
      target = base + (kind === "Individual" ? "Class" : kind);
    const input = {
      ...emptyFindDraft(),
      label: "Taken label",
      kind,
      parents: [target],
    };
    expect(() => createFindEntity(store, input, 1)).toThrow(/exists/);
    input.label = "Free label";
    expect((await previewFindCreation(store, input, 1)).errors).toEqual([]);
    store.entities.delete(target);
    expect(() => createFindEntity(store, input, 1)).toThrow();
  });
}
it.each(["ObjectProperty", "DataProperty", "AnnotationProperty"] as const)(
  "the shared %s command accepts a parent and undoes it together",
  async (kind) => {
    const store = await make(),
      before = structuredClone(store.tbox);
    const created = store.createProperty("Specialized", kind, base + kind);
    expect(store.entityStatements(created)).toContainEqual({
      subject: created,
      predicate: SUBPROPERTY,
      object: { literal: false, value: base + kind },
    });
    store.undo();
    expect(store.tbox).toEqual(before);
  },
);
