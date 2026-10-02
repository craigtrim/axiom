import { describe, expect, it } from "vitest";
import {
  createFindEntity,
  previewFindCreation,
} from "../../src/domain/find-creation";
import {
  createTextAnalysisHierarchy,
  planTextAnalysisHierarchy,
} from "../../src/domain/text-analysis-authoring";
import { entityNameKey, entityIdentifier } from "../../src/shared/entity-names";
import { emptyFindDraft } from "../../src/shared/find-create";
import { entityNameCollisions } from "../../src/domain/entity-name-index";
import { parseRdf } from "../../src/domain/rdf-io";
import { NS, SUBCLASS, THING, TYPE } from "../../src/domain/model";
import {
  base,
  declaration,
  fromTriples,
  iri,
  literal,
  reference,
} from "../fixtures/search/fixture";

const fixture = () =>
  fromTriples([
    ...declaration(iri("Root"), "Foundation"),
    ...declaration(iri("Existing"), "Café Studies"),
    ...declaration(iri("Prop"), "Public Property", NS.owl + "ObjectProperty"),
    ...declaration(iri("Other"), "Greek Alpha", NS.rdfs + "Datatype"),
    ...declaration(iri("Person"), "Alice Example", NS.owl + "NamedIndividual"),
    reference(iri("Existing"), SUBCLASS, iri("Root")),
    literal(iri("Existing"), NS.skos + "altLabel", "Legacy Course"),
  ]);
const draft = (label = "New Subject") => ({ ...emptyFindDraft(), label });
const canonical = (triples: import("../../src/domain/model").Triple[]) =>
  triples
    .map((t) =>
      JSON.stringify([
        t.subject,
        t.predicate,
        t.object.value,
        t.object.literal,
        t.object.language ?? "",
        t.object.literal
          ? !t.object.datatype || t.object.datatype === "string"
            ? NS.xsd + "string"
            : t.object.datatype
          : "",
      ]),
    )
    .sort();
describe("Find creation", () => {
  it.each([101, 1001])(
    "saves %i values in insertion order through Find and the shared authoring path",
    async (count) => {
      const store = fixture();
      const input = {
        ...draft("Many Values"),
        statements: Array.from({ length: count }, (_, i) => ({
          id: String(i),
          predicate: "rdfs:seeAlso",
          value: `Value ${count - i}:PE,PE`,
        })),
      };
      const preview = await previewFindCreation(store, input, 1);
      expect(preview.errors).toEqual([]);
      const parsed = await parseRdf(preview.source, "group.rdf", base);
      const values = input.statements.map((s) => s.value);
      expect(
        parsed.triples
          .filter((t) => t.predicate === NS.rdfs + "seeAlso")
          .map((t) => t.object.value),
      ).toEqual(values);
      const subject = createFindEntity(store, input, 1);
      expect(
        store
          .entityStatements(subject)
          .filter((t) => t.predicate === NS.rdfs + "seeAlso")
          .map((t) => t.object.value),
      ).toEqual(values);
      store.undo();
      expect(store.entities.has(subject)).toBe(false);
      store.redo();
      expect(
        store
          .entityStatements(subject)
          .filter((t) => t.predicate === NS.rdfs + "seeAlso"),
      ).toHaveLength(count);
    },
  );
  it.each([
    ["Café Studies", "exact"],
    ["Public Property", "exact"],
    ["Greek Alpha", "exact"],
    ["Alice Example", "exact"],
  ])("blocks whole-store collision %s (%s)", async (label, kind) => {
    const store = fixture(),
      before = canonical([...store.scan()]);
    const preview = await previewFindCreation(store, draft(label), 7);
    expect(preview.collisions[0].kind).toBe(kind);
    expect(() => createFindEntity(store, draft(label), 7)).toThrow(/exists/);
    expect(canonical([...store.scan()])).toEqual(before);
  });
  it.each(["CAFE\u0301 STUDIES", "Café---Studies", "Legacy Course"])(
    "warns without blocking the normalized name %s",
    async (label) => {
      const store = fixture();
      const preview = await previewFindCreation(store, draft(label), 7);
      expect(preview.collisions[0]).toMatchObject({
        kind: "normalized",
        path: "Foundation",
      });
      expect(createFindEntity(store, draft(label), 7)).toBe(preview.iri);
      expect(store.entities.get(preview.iri)?.label).toBe(
        label.replace(/\s+/gu, " ").trim(),
      );
    },
  );
  it("allocates a distinct automatic IRI for a normalized name and keeps preview, commit and undo consistent", async () => {
    const store = fixture();
    const original = createFindEntity(store, draft("Reading Comprehension"), 1);
    const input = draft("reading comprehension");
    const preview = await previewFindCreation(store, input, 1);
    expect(preview.iri).toBe(original + "2");
    expect(preview.collisions).toEqual([
      expect.objectContaining({ iri: original, kind: "normalized" }),
    ]);
    const added = createFindEntity(store, input, 1);
    expect(added).toBe(preview.iri);
    expect(store.entities.get(original)?.label).toBe("Reading Comprehension");
    store.undo();
    expect(store.exists(original)).toBe(true);
    expect(store.exists(added)).toBe(false);
    store.redo();
    expect(store.entities.get(added)?.label).toBe(input.label);
  });
  it("blocks a manually occupied IRI even when its label is only a normalized match", async () => {
    const store = fixture(),
      input = { ...draft("café studies"), iri: iri("Existing") };
    expect(
      (await previewFindCreation(store, input, 1)).collisions[0].kind,
    ).toBe("iri");
    expect(() => createFindEntity(store, input, 1)).toThrow(/exists/);
  });
  it("blocks exact alternate RDF labels and canonically equivalent Unicode labels", async () => {
    const store = fromTriples([
      ...declaration(iri("Multi"), "Primary"),
      literal(iri("Multi"), NS.rdfs + "label", "Café Studies"),
    ]);
    expect(
      (await previewFindCreation(store, draft("Cafe\u0301 Studies"), 1))
        .collisions[0].kind,
    ).toBe("exact");
    expect(() =>
      createFindEntity(store, draft("Cafe\u0301 Studies"), 1),
    ).toThrow(/exists/);
  });
  it("carries the Find warning policy into Add entity without weakening ordinary authoring", async () => {
    const store = fixture(),
      preview = await previewFindCreation(store, draft("café studies"), 1);
    expect(() =>
      planTextAnalysisHierarchy(store, {
        ...preview.creation,
        allowSimilarName: false,
      }),
    ).toThrow(/collides/);
    const plan = planTextAnalysisHierarchy(store, preview.creation);
    expect(plan.statements.length).toBe(3);
    expect(createTextAnalysisHierarchy(store, preview.creation)).toBe(
      preview.iri,
    );
    expect(() => createTextAnalysisHierarchy(store, preview.creation)).toThrow(
      /collides/,
    );
  });
  it.each([
    "日本語",
    "Ελληνικά",
    "العربية",
    "हिन्दी",
    "中文",
    "한글",
    "naïve",
    "Crème brûlée",
    "cafe\u0301",
  ])(
    "retains a Unicode identity and detects a duplicate for %s",
    async (label) => {
      const store = fixture(),
        creation = draft(label);
      expect(entityNameKey(label)).not.toBe("");
      expect(entityIdentifier(label)).not.toBe("Entity");
      const preview = await previewFindCreation(store, creation, 1);
      const created = createFindEntity(store, creation, 1);
      expect(created).toBe(preview.iri);
      expect(store.entities.get(created)?.label).toBe(label);
      expect(() => createFindEntity(store, creation, 1)).toThrow(/exists/);
    },
  );
  it("does not collapse different non-Latin names or punctuation-only labels", () => {
    expect(entityNameKey("日本語")).not.toBe(entityNameKey("中文"));
    expect(entityNameKey("+")).not.toBe(entityNameKey("-"));
    const store = fixture();
    createFindEntity(store, draft("日本語"), 1);
    expect(entityNameCollisions(store, "中文").collisions).toEqual([]);
  });
  it("capitalises supplementary Unicode letters and caps identifiers at whole code points", () => {
    expect(entityIdentifier("𐐨 topic")).toBe("𐐀Topic");
    const name = entityIdentifier("x" + "𐐨".repeat(210));
    expect([...name]).toHaveLength(200);
    expect([...name].at(-1)).toBe("𐐨");
  });
  it("reports a referenced IRI conflict without promising a nonexistent Find row", async () => {
    const store = fixture();
    const preview = await previewFindCreation(
      store,
      { ...draft(), iri: NS.rdfs + "label" },
      1,
    );
    expect(preview.collisions[0]).toMatchObject({
      kind: "iri",
      openable: false,
    });
  });
  it("escapes source and saves the exact displayed subject and statements in one undo", async () => {
    const store = fixture(),
      before = canonical([...store.scan()]);
    const creation = {
      ...draft("A & B <Topic>"),
      iri: ":Chosen",
      comment: 'A < B & "quoted"',
      parents: [iri("Root"), iri("Existing")],
      statements: [
        { id: "a", predicate: "skos:altLabel", value: "Alt & <label>" },
        { id: "b", predicate: "owl:equivalentClass", value: ":Existing" },
        { id: "c", predicate: ":Prop", value: ":Root" },
        { id: "d", predicate: "rdfs:seeAlso", value: "" },
      ],
    };
    const preview = await previewFindCreation(store, creation, 5);
    expect(preview.errors).toEqual([]);
    expect(preview.iri).toBe(iri("Chosen"));
    expect(preview.statementCount).toBe(8);
    expect(preview.source).toContain("&amp;");
    expect(preview.source).toContain("&lt;");
    const parsed = await parseRdf(preview.source, "draft.rdf", base);
    const subject = createFindEntity(store, creation, 5);
    expect(canonical(store.entityStatements(subject))).toEqual(
      canonical(parsed.triples),
    );
    expect(store.entities.get(subject)?.parents).toEqual([
      iri("Root"),
      iri("Existing"),
    ]);
    store.undo();
    expect(canonical([...store.scan()])).toEqual(before);
    store.redo();
    expect(canonical(store.entityStatements(subject))).toEqual(
      canonical(parsed.triples),
    );
  });
  it("treats an omitted parent as owl:Thing and omits blank optional values", async () => {
    const store = fixture();
    const preview = await previewFindCreation(store, draft(), 2);
    expect(preview.statementCount).toBe(3);
    const subject = createFindEntity(store, draft(), 2);
    expect(store.entities.get(subject)?.parents).toEqual([THING]);
    expect(
      store
        .entityStatements(subject)
        .map((t) => t.predicate)
        .sort(),
    ).toEqual([TYPE, NS.rdfs + "label", SUBCLASS].sort());
  });
  it.each([
    { label: "" },
    { label: "x".repeat(257) },
    { comment: "x".repeat(10001) },
    { iri: "" },
    { iri: "space in IRI" },
    { iri: "_:blank" },
    { parents: [iri("missing")] },
    { parents: [iri("Prop")] },
    { parents: [123] },
    { statements: [{ predicate: TYPE, value: "owl:NamedIndividual" }] },
    { statements: [{ predicate: SUBCLASS, value: ":Root" }] },
    { statements: [{ predicate: "rdfs:label", value: "Other" }] },
    { statements: [{ predicate: "rdfs:comment", value: "Other" }] },
    { statements: [{ predicate: "not valid", value: "foo" }] },
    { statements: [{ predicate: "owl:equivalentClass", value: "bad value" }] },
    { statements: [{ predicate: "skos:altLabel", value: "x".repeat(10001) }] },
  ])(
    "invalid input is previewed and rejected atomically: %j",
    async (change) => {
      const store = fixture(),
        before = canonical([...store.scan()]);
      const input = { ...draft(), ...change };
      const preview = await previewFindCreation(store, input, 1);
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.source).toBe("");
      expect(() => createFindEntity(store, input, 1)).toThrow();
      expect(canonical([...store.scan()])).toEqual(before);
    },
  );
  it.each([iri("Root"), NS.rdfs + "label", NS.owl + "Class"])(
    "blocks an occupied subject %s even with a distinct label",
    async (subject) => {
      const store = fixture(),
        creation = { ...draft(), iri: subject };
      expect(
        (await previewFindCreation(store, creation, 1)).collisions,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ iri: subject, kind: "iri" }),
        ]),
      );
      expect(() => createFindEntity(store, creation, 1)).toThrow(/exists/);
    },
  );
  it("rechecks duplicates between preview and commit and after undo", async () => {
    const store = fixture(),
      input = draft();
    expect((await previewFindCreation(store, input, 1)).collisions).toEqual([]);
    store.createClass(input.label, THING);
    expect(() => createFindEntity(store, input, 1)).toThrow(/exists/);
    store.undo();
    expect((await previewFindCreation(store, input, 1)).collisions).toEqual([]);
  });
  it("carries IRI, annotations and nested parents through the full creation transaction", async () => {
    const store = fixture(),
      before = canonical([...store.scan()]);
    const preview = await previewFindCreation(
      store,
      {
        ...draft(),
        iri: ":Manual",
        statements: [
          { id: "a", predicate: "skos:altLabel", value: "Saved alias" },
        ],
      },
      1,
    );
    const input = {
      ...preview.creation,
      parents: [
        {
          create: {
            label: "New Parent",
            comment: "Parent comment",
            parents: [{ iri: THING }],
          },
        },
      ],
    };
    const plan = planTextAnalysisHierarchy(store, input);
    expect(canonical([...store.scan()])).toEqual(before);
    expect(
      plan.statements.some(
        (t) =>
          t.subject === iri("Manual") &&
          t.predicate === SUBCLASS &&
          t.object.value === iri("NewParent"),
      ),
    ).toBe(true);
    const created = createTextAnalysisHierarchy(store, input);
    expect(created).toBe(iri("Manual"));
    expect(store.entities.get(created)?.parents).toEqual([iri("NewParent")]);
    expect(
      store
        .entityStatements(created)
        .some((t) => t.object.value === "Saved alias"),
    ).toBe(true);
    expect(
      canonical([
        ...store.entityStatements(created),
        ...store.entityStatements(iri("NewParent")),
      ]),
    ).toEqual(canonical(plan.statements));
    store.undo();
    expect(canonical([...store.scan()])).toEqual(before);
  });
  it("inherits whole-ontology duplicate protection into new parents", async () => {
    const store = fixture(),
      preview = await previewFindCreation(store, draft(), 1);
    expect(() =>
      createTextAnalysisHierarchy(store, {
        ...preview.creation,
        parents: [
          {
            create: {
              label: "Public Property",
              comment: "",
              parents: [{ iri: THING }],
            },
          },
        ],
      }),
    ).toThrow(/collides/);
    expect(store.exists(preview.iri)).toBe(false);
  });
});
