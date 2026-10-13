import { describe, expect, it } from "vitest";
import { entityIdentifier } from "../../src/shared/entity-names";
import {
  findCreationKinds,
  creationRelation,
} from "../../src/shared/find-create";
import { THING, NS } from "../../src/domain/model";
import { buildEmptyStore } from "../../src/domain/workspace";
import {
  createFindEntity,
  previewFindCreation,
} from "../../src/domain/find-creation";
import {
  createTextAnalysisHierarchy,
  planTextAnalysisHierarchy,
} from "../../src/domain/text-analysis-authoring";

// #70: assert generated IDs independently of labels and existing identifiers.
describe("PascalCase entity creation IDs", () => {
  it.each([
    ["CREATIVE THINKING", "CreativeThinking"],
    ["creative thinking", "CreativeThinking"],
    ["Creative Thinking", "CreativeThinking"],
    ["CreativeThinking", "CreativeThinking"],
    ["creativeThinking", "CreativeThinking"],
    ["XMLParser", "XmlParser"],
    ["  CRÉATIVE---THINKING  ", "CréativeThinking"],
    ["123 CREDITS", "Entity123Credits"],
    ["NewObjectProperty2", "NewObjectProperty2"],
  ])("normalizes %s to %s", (label, expected) => {
    expect(entityIdentifier(label)).toBe(expected);
  });

  for (const kind of findCreationKinds) {
    it.each(["CREATIVE THINKING", "creative thinking", "Creative Thinking"])(
      `previews and saves ${kind} %s with its original label`,
      async (label) => {
        const store = buildEmptyStore();
        const parent =
          kind === "Class" || kind === "Individual"
            ? THING
            : store.createProperty("Parent", kind);
        const input = {
          kind,
          label,
          parents: [parent],
          comment: "KEEP THIS COMMENT",
          statements: [],
        };
        const expected = store.ontology.namespace + "CreativeThinking";
        const preview = await previewFindCreation(store, input, 1);
        expect(preview.errors).toEqual([]);
        expect(preview.iri).toBe(expected);
        const saved = createFindEntity(store, input, 1);
        expect(saved).toBe(expected);
        expect(store.entities.get(saved)).toMatchObject({
          label,
          comment: input.comment,
        });
        expect(store.entityStatements(saved)).toContainEqual(
          expect.objectContaining({
            predicate: creationRelation(kind),
            object: expect.objectContaining({ value: parent, literal: false }),
          }),
        );
      },
    );
  }

  it("keeps collisions and explicit IDs consistent with the preview", async () => {
    const store = buildEmptyStore();
    const existing = store.createClass("Creative Thinking", THING);
    const input = {
      label: "CREATIVE THINKING",
      parents: [THING],
      comment: "",
      statements: [],
    };
    const preview = await previewFindCreation(store, input, 1);
    expect(preview.iri).toBe(existing + "2");
    expect(createFindEntity(store, input, 1)).toBe(existing + "2");
    expect(store.entities.get(existing)?.label).toBe("Creative Thinking");
    store.undo();
    const overridden = {
      ...input,
      iri: store.ontology.namespace + "KEEP_MY_ID",
    };
    expect((await previewFindCreation(store, overridden, 1)).iri).toBe(
      overridden.iri,
    );
    expect(createFindEntity(store, overridden, 1)).toBe(overridden.iri);
    expect(store.entities.get(overridden.iri)?.label).toBe(input.label);
  });

  it("uses normalized IDs for an Add entity hierarchy without changing its labels", () => {
    const store = buildEmptyStore();
    const input = {
      label: "CREATIVE THINKING",
      comment: "",
      parents: [
        {
          create: {
            label: "NEW PARENT",
            comment: "",
            parents: [{ iri: THING }],
          },
        },
      ],
    };
    const expected = store.ontology.namespace + "CreativeThinking";
    const parent = store.ontology.namespace + "NewParent";
    const plan = planTextAnalysisHierarchy(store, input);
    expect(plan.statements).toContainEqual(
      expect.objectContaining({
        subject: expected,
        predicate: NS.rdfs + "label",
        object: expect.objectContaining({ value: input.label }),
      }),
    );
    expect(createTextAnalysisHierarchy(store, input)).toBe(expected);
    expect(store.entities.get(expected)?.parents).toEqual([parent]);
    expect(store.entities.get(parent)?.label).toBe("NEW PARENT");
  });

  it("normalizes direct creation and placeholder labels while preserving established IDs", () => {
    const creators = [
      (s: ReturnType<typeof buildEmptyStore>) =>
        s.createClass("CREATIVE THINKING", THING),
      (s: ReturnType<typeof buildEmptyStore>) =>
        s.createNamedIndividual("CREATIVE THINKING", THING),
      (s: ReturnType<typeof buildEmptyStore>) =>
        s.createProperty("CREATIVE THINKING", "ObjectProperty"),
      (s: ReturnType<typeof buildEmptyStore>) =>
        s.rename(s.createClass("New class", THING), "CREATIVE THINKING"),
    ];
    for (const create of creators) {
      const store = buildEmptyStore();
      const saved = create(store);
      expect(saved).toBe(store.ontology.namespace + "CreativeThinking");
      expect(store.entities.get(saved)?.label).toBe("CREATIVE THINKING");
      expect(store.rename(saved, "A DIFFERENT LABEL")).toBe(saved);
    }
  });
});
