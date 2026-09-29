import { describe, expect, it } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  entitySource,
  applyEntitySource,
} from "../../src/domain/entity-source";
import { sourceDocument, applySource } from "../../src/domain/source";
import {
  NS,
  SUBCLASS,
  THING,
  TYPE,
  iriTerm,
  literal,
} from "../../src/domain/model";

function fixture() {
  const store = buildEmptyStore();
  const child = store.createClass("Multiculturalism at Work", THING);
  const parent = store.createClass("Multicultural Studies", THING);
  return { store, child, parent };
}

describe("owl:Thing as a fallback superclass", () => {
  it("removes only the fallback when Details adds a parent and restores it in one Undo", () => {
    const { store, child, parent } = fixture();
    const other = store.createClass("Sociology", THING);
    const annotations = [
      { subject: child, predicate: TYPE, object: iriTerm(THING) },
      {
        subject: child,
        predicate: NS.rdfs + "seeAlso",
        object: iriTerm(THING),
      },
      {
        subject: child,
        predicate: NS.rdfs + "comment",
        object: literal("Workplace cultures"),
      },
    ];
    store.updateEntity(child, [
      ...store.entityStatements(child),
      ...annotations,
    ]);
    expect(store.entities.get(child)?.parents).toEqual([THING]);
    const before = structuredClone(store.tbox),
      history = store.undoStack.length;
    store.updateEntity(child, [
      ...store.entityStatements(child),
      ...[parent, other].map((value) => ({
        subject: child,
        predicate: SUBCLASS,
        object: iriTerm(value),
      })),
    ]);
    expect(store.entities.get(child)?.parents).toEqual([parent, other]);
    expect(store.entities.get(THING)?.children).not.toContain(child);
    expect(store.entities.get(parent)?.children).toContain(child);
    expect(store.tbox).toEqual(expect.arrayContaining(annotations));
    expect(
      store
        .entityStatements(child)
        .filter((t) => t.predicate === SUBCLASS)
        .map((t) => t.object.value),
    ).toEqual([parent, other]);
    expect(store.undoStack).toHaveLength(history + 1);
    const after = structuredClone(store.tbox);
    store.undo();
    expect(store.tbox).toEqual(before);
    expect(store.entities.get(child)?.parents).toEqual([THING]);
    store.redo();
    expect(store.tbox).toEqual(after);
    expect(store.entities.get(child)?.parents).toEqual([parent, other]);
  });

  it("keeps a sole Thing parent when adding a different kind of relationship", () => {
    const { store, child, parent } = fixture();
    store.createEdge({
      subject: child,
      predicate: NS.rdfs + "seeAlso",
      object: iriTerm(parent),
    });
    expect(store.entities.get(child)?.parents).toEqual([THING]);
    expect(store.entityStatements(child)).toContainEqual({
      subject: child,
      predicate: SUBCLASS,
      object: iriTerm(THING),
    });
  });

  it("removes fallback assertions in named graphs only for the edited class", async () => {
    const base = "https://example.org/";
    const triples = (
      await parseRdf(
        `
      @prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
      :Parent a owl:Class.
      :Child a owl:Class; rdfs:subClassOf owl:Thing.
      :Unrelated a owl:Class; rdfs:subClassOf owl:Thing, :Parent.
      :original { :Child rdfs:subClassOf owl:Thing. }
    `,
        "parents.trig",
        base,
      )
    ).triples;
    const store = storeFromRdf(triples, "Parents");
    const unrelated = structuredClone(
      store.entityStatements(base + "Unrelated"),
    );
    const before = structuredClone(store.tbox);
    const edge = {
      subject: base + "Child",
      predicate: SUBCLASS,
      object: iriTerm(base + "Parent"),
      graph: base + "added",
    };
    store.createEdge(edge);
    expect(
      store
        .entityStatements(base + "Child")
        .filter((t) => t.predicate === SUBCLASS),
    ).toEqual([edge]);
    expect(store.entityStatements(base + "Unrelated")).toEqual(unrelated);
    store.undo();
    expect(store.tbox).toEqual(before);
  });

  it.each(["entity", "ontology"])(
    "normalizes %s source edits without modifying the original Undo snapshot",
    async (scope) => {
      const { store, child, parent } = fixture();
      const before = structuredClone(store.tbox);
      const text = `\n<${child}> <${SUBCLASS}> <${parent}> .`;
      if (scope === "entity") {
        const doc = await entitySource(store, 1, child);
        await applyEntitySource(store, 1, { ...doc, text: doc.text + text });
      } else {
        const doc = await sourceDocument(store, 1);
        await applySource(store, 1, { ...doc, text: doc.text + text });
      }
      expect(store.entities.get(child)?.parents).toEqual([parent]);
      expect(
        store
          .entityStatements(child)
          .filter((t) => t.predicate === SUBCLASS)
          .map((t) => t.object.value),
      ).toEqual([parent]);
      store.undo();
      expect(store.tbox).toEqual(before);
    },
  );

  it("omits Thing when creating a class with an existing or newly created parent", () => {
    const { store, parent } = fixture();
    const before = structuredClone(store.tbox);
    const created = store.createClassHierarchy([
      {
        id: "new-parent",
        name: "New Parent",
        comment: "",
        parents: [{ iri: THING }, { iri: parent }],
      },
      {
        id: "new-child",
        name: "New Child",
        comment: "",
        parents: [{ iri: THING }, { id: "new-parent" }],
      },
    ]);
    expect(store.entities.get(created.get("new-parent")!)?.parents).toEqual([
      parent,
    ]);
    expect(store.entities.get(created.get("new-child")!)?.parents).toEqual([
      created.get("new-parent"),
    ]);
    store.undo();
    expect(store.tbox).toEqual(before);
  });

  it("does not reintroduce Thing when deleting one of several parents", () => {
    const { store, child, parent } = fixture();
    const other = store.createClass("Sociology", THING);
    store.addClassParents(child, [parent, other]);
    const before = structuredClone(store.tbox);
    store.deleteClass(parent);
    expect(store.entities.get(child)?.parents).toEqual([other]);
    expect(
      store
        .entityStatements(child)
        .filter((t) => t.predicate === SUBCLASS)
        .map((t) => t.object.value),
    ).toEqual([other]);
    store.undo();
    expect(store.tbox).toEqual(before);
    store.deleteClass(parent);
    store.deleteClass(other);
    expect(store.entities.get(child)?.parents).toEqual([THING]);
  });
});
