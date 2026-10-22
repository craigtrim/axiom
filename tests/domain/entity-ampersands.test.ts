import { describe, expect, it } from "vitest";
import { buildEmptyStore } from "../../src/domain/workspace";
import { NS, THING, type Triple } from "../../src/domain/model";
import {
  entityIdentifier,
  entityNameKey,
  normalizeEntityName,
  entityAmpersandSynonym,
} from "../../src/shared/entity-names";
import { findCreationKinds } from "../../src/shared/find-create";
import {
  previewFindCreation,
  createFindEntity,
} from "../../src/domain/find-creation";
import {
  createTextAnalysisHierarchy,
  planTextAnalysisHierarchy,
} from "../../src/domain/text-analysis-authoring";
import { parseRdf } from "../../src/domain/rdf-io";
import { statementKey } from "../../src/domain/rdf-model";
import { plannedEntitySource } from "../../src/shared/add-entity";
import { checkAddEntity, createAddEntity } from "../../src/domain/add-entity";
const canonical = (t: Triple) =>
  statementKey({
    ...t,
    object: {
      ...t.object,
      datatype: !t.object.literal
        ? undefined
        : t.object.language
          ? NS.rdf + "langString"
          : !t.object.datatype || t.object.datatype === "string"
            ? NS.xsd + "string"
            : t.object.datatype,
    },
  });

// Issue 157: every creation path agrees on the canonical label, IRI and synonym.
describe("ampersands in created names", () => {
  for (const kind of ["class", "individual"] as const) {
    it.each(["Law & Society", "Law and Society"])(
      `shared Add entity ${kind} source agrees with save for %s`,
      async (label) => {
        const store = buildEmptyStore();
        const input = {
          kind,
          root: {
            label,
            comment: "",
            parents: [{ iri: THING }],
            statements: [
              {
                predicate: NS.rdfs + "seeAlso",
                object: { literal: true, value: " Law & Society " },
              },
            ],
          },
        };
        expect(checkAddEntity(store, input, 1).findings).toEqual([]);
        const source = plannedEntitySource(input, store.ontology.namespace);
        const parsed = (
          await parseRdf(
            `<rdf:RDF xmlns:rdf="${NS.rdf}" xmlns:rdfs="${NS.rdfs}" xmlns:owl="${NS.owl}">${source}</rdf:RDF>`,
            "preview.rdf",
            store.ontology.namespace,
          )
        ).triples;
        const { iri } = createAddEntity(store, input, 1);
        const statements = store.entityStatements(iri);
        expect(statements.map(canonical).sort()).toEqual(
          parsed.map(canonical).sort(),
        );
        expect(
          statements.filter((t) => t.predicate === NS.rdfs + "seeAlso"),
        ).toHaveLength(1);
        expect(
          checkAddEntity(
            store,
            { ...input, root: { ...input.root, label: "Law & Society" } },
            1,
          ).findings.some((f) => f.kind === "bad2"),
        ).toBe(true);
      },
    );
  }
  it.each([
    ["Law & Society", "Law and Society", "LawAndSociety", "Law & Society"],
    ["Law and Society", "Law and Society", "LawAndSociety", "Law & Society"],
    [
      "Research AND Development and Testing",
      "Research AND Development and Testing",
      "ResearchAndDevelopmentAndTesting",
      "Research & Development & Testing",
    ],
    ["A & B & C", "A and B and C", "AAndBAndC", "A & B & C"],
    [
      "Law\t&\tSociety",
      "Law\tand\tSociety",
      "LawAndSociety",
      "Law\t&\tSociety",
    ],
    ["R&D", "R&D", "RD", undefined],
    ["AT&T", "AT&T", "AtT", undefined],
    ["Candy and", "Candy and", "CandyAnd", undefined],
  ])(
    "normalizes %s only at standalone word boundaries",
    (input, name, id, alias) => {
      expect(normalizeEntityName(input)).toBe(name);
      expect(entityIdentifier(input)).toBe(id);
      expect(entityAmpersandSynonym(name)).toBe(alias);
    },
  );

  for (const kind of findCreationKinds) {
    it.each(["Law & Society", "Law and Society"])(
      `direct ${kind} creation saves %s and supports Undo/Redo`,
      (name) => {
        const store = buildEmptyStore();
        const before = structuredClone(store.tbox);
        const iri =
          kind === "Class"
            ? store.createClass(name, THING)
            : kind === "Individual"
              ? store.createNamedIndividual(name, THING)
              : store.createProperty(name, kind);
        expect(iri).toBe(store.ontology.namespace + "LawAndSociety");
        const statements = store.entityStatements(iri);
        expect(statements).toContainEqual(
          expect.objectContaining({
            predicate: NS.rdfs + "label",
            object: expect.objectContaining({
              literal: true,
              value: "Law and Society",
            }),
          }),
        );
        expect(
          statements.filter((t) => t.predicate === NS.rdfs + "seeAlso"),
        ).toEqual([
          {
            subject: iri,
            predicate: NS.rdfs + "seeAlso",
            object: {
              literal: true,
              value: "Law & Society",
              datatype: NS.xsd + "string",
            },
          },
        ]);
        store.undo();
        expect(store.tbox).toEqual(before);
        store.redo();
        expect(store.entityStatements(iri)).toEqual(statements);
      },
    );

    for (const manual of [false, true]) {
      it.each(["Law & Society", "Law and Society"])(
        `Find ${kind} preview and save agree for %s (manual synonym ${manual})`,
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
            comment: "",
            statements: manual
              ? [{ predicate: "rdfs:seeAlso", value: "Law & Society" }]
              : [],
          };
          const preview = await previewFindCreation(store, input, 1);
          expect(preview.errors).toEqual([]);
          expect(preview.label).toBe("Law and Society");
          expect(preview.iri).toBe(store.ontology.namespace + "LawAndSociety");
          const parsed = (
            await parseRdf(
              preview.source,
              "preview.rdf",
              store.ontology.namespace,
            )
          ).triples;
          expect(parsed).toHaveLength(preview.statementCount);
          const iri = createFindEntity(store, input, 1);
          const saved = store.entityStatements(iri);
          expect(saved.map(canonical).sort()).toEqual(
            parsed.map(canonical).sort(),
          );
          expect(
            saved.filter((t) => t.predicate === NS.rdfs + "seeAlso"),
          ).toHaveLength(1);
          const duplicate = await previewFindCreation(
            store,
            { ...input, label: "Law & Society" },
            1,
          );
          expect(duplicate.collisions).toContainEqual(
            expect.objectContaining({ iri, kind: "exact" }),
          );
          expect(() =>
            createFindEntity(store, { ...input, label: "Law & Society" }, 1),
          ).toThrow(/already exists/);
        },
      );
    }
  }

  it("preserves an explicit Subject and keeps embedded ampersands unchanged", async () => {
    const store = buildEmptyStore();
    const iri = store.ontology.namespace + "CUSTOM_ID";
    const input = {
      label: "Law & Society",
      iri,
      parents: [THING],
      comment: "",
      statements: [],
    };
    expect((await previewFindCreation(store, input, 1)).iri).toBe(iri);
    expect(createFindEntity(store, input, 1)).toBe(iri);
    const rd = store.createClass("R&D", THING);
    expect(rd).toBe(store.ontology.namespace + "RD");
    expect(store.label(rd)).toBe("R&D");
    expect(
      store
        .entityStatements(rd)
        .filter((t) => t.predicate === NS.rdfs + "seeAlso"),
    ).toEqual([]);
    expect(entityNameKey("Law & Society")).toBe(
      entityNameKey("Law and Society"),
    );
  });

  it("plans nested canonical labels and one synonym per new class", () => {
    const store = buildEmptyStore();
    const input = {
      label: "Law & Society",
      comment: "",
      parents: [
        {
          create: {
            label: "Research and Development and Testing",
            comment: "",
            parents: [{ iri: THING }],
          },
        },
      ],
    };
    const plan = planTextAnalysisHierarchy(store, input);
    const iri = createTextAnalysisHierarchy(store, input);
    expect(iri).toBe(store.ontology.namespace + "LawAndSociety");
    expect(store.label(iri)).toBe("Law and Society");
    expect(
      plan.statements
        .filter((t) => t.predicate === NS.rdfs + "seeAlso")
        .map((t) => t.object.value)
        .sort(),
    ).toEqual(["Law & Society", "Research & Development & Testing"]);
    expect(() => createTextAnalysisHierarchy(store, input)).toThrow(
      /already names/,
    );
  });
});
