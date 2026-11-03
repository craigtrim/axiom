// craigtrim/axiom#93: validate complete drafts against real RDF and atomic undo history.
import { describe, expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { NS, THING, TYPE, SUBCLASS } from "../../src/domain/model";
import { statementKey } from "../../src/domain/rdf-model";
import {
  applyAddEntity,
  checkAddEntity,
  createAddEntity,
} from "../../src/domain/add-entity";
import {
  plannedEntitySource,
  readSavedAddEntity,
  type AddEntityNode,
  type AddEntityInput,
} from "../../src/shared/add-entity";
const base = "https://example.org/add#";
const node = (
  label: string,
  parents: AddEntityNode["parents"] = [],
): AddEntityNode => ({ label, comment: "", parents });
const input = (
  root: AddEntityNode,
  kind: AddEntityInput["kind"] = "class",
): AddEntityInput => ({ root, kind });
const fixture = async () =>
  storeFromRdf(
    (
      await parseRdf(
        `@prefix : <${base}> .
@prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> .
: a owl:Ontology . :Engineering a owl:Class; rdfs:label "Engineering"; skos:altLabel "Technical Studies", "Culture, Media Studies" .
:Seminar a owl:ObjectProperty . :Person a owl:NamedIndividual .
:Mention rdfs:seeAlso :ObjectOnly . :Mention :PredicateOnly "value" .
:SubjectOnly rdfs:comment "untyped" .`,
        "add.ttl",
        base,
      )
    ).triples,
    "add",
  );
describe("Add entity transactions", () => {
  // #169: a blank preview is neutral, but it must never become a transaction.
  it.each(["class", "individual"] as const)(
    "shows no finding for an empty %s root",
    async (kind) => {
      const store = await fixture(),
        before = [...store.scan()],
        version = store.version;
      expect(checkAddEntity(store, input(node(""), kind), 3).findings).toEqual(
        [],
      );
      expect(store.version).toBe(version);
      expect([...store.scan()]).toEqual(before);
    },
  );
  it.each([
    ["class", ""],
    ["class", " \t "],
    ["individual", ""],
    ["individual", " \t "],
  ] as const)(
    "refuses an empty %s root %j without writing its named parent",
    async (kind, label) => {
      const store = await fixture(),
        before = [...store.scan()],
        version = store.version,
        draft = input(
          node(label, [{ create: node("Unwritten Parent") }]),
          kind,
        );
      expect(() => createAddEntity(store, draft, 3)).toThrow(
        "A name is required before this can be created.",
      );
      expect(store.version).toBe(version);
      expect([...store.scan()]).toEqual(before);
    },
  );
  it.each(["", "Named Root"])(
    "still reports an unnamed parent under root %j",
    async (label) => {
      const store = await fixture();
      expect(
        checkAddEntity(store, input(node(label, [{ create: node("") }])), 3)
          .findings,
      ).toEqual([
        {
          kind: "bad2",
          message: "A drafted parent needs a name.",
          reveal: undefined,
        },
      ]);
    },
  );
  it("retains the whitespace warning when the root contains only whitespace", async () => {
    const store = await fixture();
    expect(checkAddEntity(store, input(node(" \t ")), 3).findings).toEqual([
      {
        kind: "wrn2",
        message:
          "Leading, trailing or repeated whitespace is removed from the name before it becomes an IRI.",
      },
    ]);
  });
  it("writes a recursive hierarchy as one undoable edit", async () => {
    const store = await fixture(),
      before = [...store.scan()],
      version = store.version;
    const draft = input(
      node("Technical Writing", [
        { iri: base + "Engineering" },
        { create: node("Writing Skills", [{ create: node("Communication") }]) },
      ]),
    );
    draft.root.comment = "Clear & precise <writing>";
    draft.root.statements = [
      {
        predicate: NS.skos + "altLabel",
        object: { literal: true, value: "Technical, Writing" },
      },
    ];
    expect(checkAddEntity(store, draft, 8)).toMatchObject({
      version,
      datasetEpoch: 8,
      findings: [],
    });
    expect([...store.scan()]).toEqual(before);
    const result = createAddEntity(store, draft, 8);
    expect(result.created).toEqual([
      base + "TechnicalWriting",
      base + "WritingSkills",
      base + "Communication",
    ]);
    expect(store.version).toBe(version + 1);
    const triples = [...store.scan()].filter((t) =>
      result.created.includes(t.subject),
    );
    expect(triples).toContainEqual({
      subject: result.iri,
      predicate: NS.rdfs + "label",
      object: expect.objectContaining({
        literal: true,
        value: "Technical Writing",
        language: "en",
      }),
    });
    expect(triples).toContainEqual({
      subject: result.iri,
      predicate: NS.rdfs + "comment",
      object: expect.objectContaining({
        value: draft.root.comment,
        language: "en",
      }),
    });
    expect(triples).toContainEqual({
      subject: base + "WritingSkills",
      predicate: SUBCLASS,
      object: expect.objectContaining({
        value: base + "Communication",
        literal: false,
      }),
    });
    expect(triples).toContainEqual({
      subject: base + "Communication",
      predicate: SUBCLASS,
      object: expect.objectContaining({ value: THING, literal: false }),
    });
    store.undo();
    expect([...store.scan()]).toEqual(before);
    store.redo();
    expect(store.exists(result.iri)).toBe(true);
    expect(store.exists(base + "Communication")).toBe(true);
  });
  it.each([
    "Seminar",
    "Person",
    "Object Only",
    "Predicate Only",
    "Subject Only",
  ])(
    "rejects occupied IRI %s without silently minting a suffix",
    async (name) => {
      const store = await fixture(),
        before = [...store.scan()],
        version = store.version;
      expect(() => createAddEntity(store, input(node(name)), 1)).toThrow(
        /occupied/,
      );
      expect(store.version).toBe(version);
      expect([...store.scan()]).toEqual(before);
    },
  );
  it("uses whole aliases, retains punctuation warnings and ranks the default parent", async () => {
    const store = await fixture();
    expect(
      checkAddEntity(store, input(node("culture, media studies")), 3)
        .findings[0],
    ).toMatchObject({ kind: "bad2", reveal: { iri: base + "Engineering" } });
    expect(
      checkAddEntity(store, input(node("Media Studies")), 3).findings,
    ).toEqual([]);
    expect(
      checkAddEntity(store, input(node("Advanced Engineering")), 3)
        .defaultParent,
    ).toBe(base + "Engineering");
    expect(
      checkAddEntity(store, input(node("  AT&T  Labs ")), 3).findings.map(
        (f) => f.kind,
      ),
    ).toEqual(["wrn2", "wrn2"]);
  });
  it.each(["duplicate", "occupied", "invalid-parent", "invalid-statement"])(
    "rolls back a whole nested hierarchy on %s",
    async (fault) => {
      const store = await fixture(),
        version = store.version,
        before = [...store.scan()];
      const child = node("Root", [
        {
          create: node("Child", [
            {
              create: node(
                fault === "duplicate"
                  ? "root"
                  : fault === "occupied"
                    ? "Seminar"
                    : "Grandparent",
              ),
            },
          ]),
        },
      ]);
      if (fault === "invalid-parent")
        child.parents.push({ iri: base + "Person" });
      if (fault === "invalid-statement")
        child.statements = [
          {
            predicate: NS.skos + "altLabel",
            object: { literal: true, value: "invalid", language: "not valid" },
          },
        ];
      expect(() => createAddEntity(store, input(child), 4)).toThrow();
      expect(store.version).toBe(version);
      expect([...store.scan()]).toEqual(before);
    },
  );
  it.each(["class", "individual"] as const)(
    "the %s preview parses to exactly the committed triples",
    async (kind) => {
      const store = await fixture();
      const draft = input(
        node("Widget & Gear", [
          { iri: THING },
          { iri: base + "Engineering" },
          { iri: base + "Engineering" },
          { create: node("New Parent") },
        ]),
        kind,
      );
      draft.root.comment = 'A <tag> & "quote"';
      draft.root.statements = [
        {
          predicate: NS.skos + "altLabel",
          object: { literal: true, value: "comma, whole" },
        },
        {
          predicate: NS.rdfs + "seeAlso",
          object: { literal: false, value: "  https://example.org/?a=1&b=2  " },
        },
        {
          predicate: NS.skos + "definition",
          object: { literal: true, value: "Une définition", language: "fr" },
        },
        {
          predicate: NS.dc + "source",
          object: { literal: true, value: "7", datatype: NS.xsd + "integer" },
        },
      ];
      const preview = plannedEntitySource(draft, base);
      expect(preview.indexOf('rdf:about="' + base + 'NewParent"')).toBeLessThan(
        // Issue 157: a standalone ampersand contributes "And" to the ID.
        preview.indexOf('rdf:about="' + base + 'WidgetAndGear"'),
      );
      const parsed = await parseRdf(
        `<rdf:RDF ${Object.entries(NS)
          .map(([p, uri]) => `xmlns:${p}="${uri}"`)
          .join(" ")}>${preview}</rdf:RDF>`,
        "preview.rdf",
        base,
      );
      const result = createAddEntity(store, draft, 9);
      const normalize = (ts: typeof parsed.triples) =>
        ts
          .map((t) =>
            JSON.stringify({
              s: t.subject,
              p: t.predicate,
              v: t.object.value,
              l: t.object.literal,
              lang: t.object.language ?? "",
              type: t.object.literal
                ? t.object.language
                  ? NS.rdf + "langString"
                  : (t.object.datatype ?? NS.xsd + "string")
                : "",
            }),
          )
          .sort();
      expect(
        normalize(
          [...store.scan()].filter((t) => result.created.includes(t.subject)),
        ),
      ).toEqual(normalize(parsed.triples));
      if (kind === "individual")
        expect(
          [...store.scan()]
            .filter((t) => t.subject === result.iri && t.predicate === TYPE)
            .map((t) => t.object.value),
        ).toContain(THING);
    },
  );
  it("creates an untyped individual with only owl:NamedIndividual", async () => {
    const store = await fixture(),
      result = createAddEntity(store, input(node("Ada"), "individual"), 1);
    expect(
      [...store.scan()]
        .filter((t) => t.subject === result.iri && t.predicate === TYPE)
        .map((t) => t.object.value),
    ).toEqual([NS.owl + "NamedIndividual"]);
  });
  it("round trips the entire recursive draft, including pending picker text", () => {
    const root = node("Unsaved", [
      { create: { ...node("Nested"), manualParents: true, pickerText: "Doc" } },
    ]);
    const saved = {
      ...input(root, "individual"),
      phrase: "UNSAVED",
      origin: "find" as const,
      error: "Retained error",
      created: [base + "Prior"],
      // #177: root identity persists independently of other entities created together.
      createdRootIris: [base + "Prior"],
    };
    expect(readSavedAddEntity(JSON.parse(JSON.stringify(saved)))).toEqual(
      saved,
    );
    expect(() =>
      readSavedAddEntity({
        ...saved,
        root: { ...root, parents: [{ create: root, iri: THING }] },
      }),
    ).toThrow();
    expect(() =>
      readSavedAddEntity({ ...saved, createdRootIris: [42] }),
    ).toThrow("Invalid saved Add entity draft.");
    root.parents.push({ create: root });
    expect(() => readSavedAddEntity(saved)).toThrow();
  });
  it.each(["language", "datatype"])(
    "rejects malformed saved literal %s before rendering its source",
    (field) => {
      const root = node("Retained Draft");
      const saved = {
        ...input(root),
        phrase: "Retained Draft",
        origin: "selection",
        root: {
          ...root,
          statements: [
            {
              predicate: NS.skos + "altLabel",
              object: { literal: true, value: "An alias", [field]: 42 },
            },
          ],
        },
      };
      expect(() => readSavedAddEntity(saved)).toThrow(
        "Invalid additional statements",
      );
    },
  );
});

// craigtrim/axiom#203: after Create, the draft edits the entity it created.
describe("Add entity edits after Create", () => {
  const seeAlso = {
    predicate: NS.rdfs + "seeAlso",
    object: { literal: true, value: "Ethics in Accounting" },
  };
  const created = async () => {
    const store = await fixture(),
      draft = input(node("Speed Reading", [{ iri: base + "Engineering" }]));
    const result = createAddEntity(store, draft, 4),
      target = { iri: result.iri, applied: result.applied };
    return { store, draft, result, target };
  };
  const values = (store: Awaited<ReturnType<typeof fixture>>, iri: string) =>
    store
      .entityStatements(iri)
      .map((t) => [t.predicate, t.object.value])
      .sort();
  it("reports nothing to apply right after Create", async () => {
    const { store, draft, result, target } = await created();
    expect(result.parents).toEqual([base + "Engineering"]);
    const check = checkAddEntity(store, draft, 4, target);
    expect(check.findings.some((f) => f.createOnly)).toBe(true);
    expect(check.apply).toEqual({ changed: false, findings: [] });
  });
  it("adds a statement to the created class in one undo step", async () => {
    const { store, draft, result, target } = await created();
    const before = values(store, result.iri),
      version = store.version;
    draft.root.statements = [seeAlso];
    expect(checkAddEntity(store, draft, 4, target).apply).toEqual({
      changed: true,
      findings: [],
    });
    expect(() => createAddEntity(store, draft, 4)).toThrow("already exists");
    const applied = applyAddEntity(store, draft, 4, target, false);
    expect(applied).toMatchObject({ iri: result.iri, created: [] });
    expect(store.version).toBe(version + 1);
    expect(values(store, result.iri)).toContainEqual([
      seeAlso.predicate,
      seeAlso.object.value,
    ]);
    expect(
      [...store.entities.values()].filter((e) => e.label === "Speed Reading"),
    ).toHaveLength(1);
    expect(
      checkAddEntity(store, draft, 4, {
        iri: result.iri,
        applied: applied.applied,
      }).apply,
    ).toEqual({ changed: false, findings: [] });
    store.undo();
    expect(values(store, result.iri)).toEqual(before);
  });
  it("replaces the comment and parent it last wrote", async () => {
    const { store, draft, result, target } = await created();
    draft.root.comment = "Reading quickly";
    draft.root.parents = [{ iri: THING }];
    applyAddEntity(store, draft, 4, target, false);
    const statements = store.entityStatements(result.iri);
    expect(
      statements.filter((t) => t.predicate === NS.rdfs + "comment"),
    ).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({ value: "Reading quickly" }),
      }),
    ]);
    expect(
      statements
        .filter((t) => t.predicate === SUBCLASS)
        .map((t) => t.object.value),
    ).toEqual([THING]);
  });
  it("keeps a statement added in Details after Create", async () => {
    const { store, draft, result, target } = await created();
    const definition = {
      subject: result.iri,
      predicate: NS.skos + "definition",
      object: { literal: true, value: "Reading at speed" },
    };
    store.updateEntity(result.iri, [
      ...store.entityStatements(result.iri),
      definition,
    ]);
    expect(checkAddEntity(store, draft, 4, target).apply?.changed).toBe(false);
    draft.root.statements = [seeAlso];
    applyAddEntity(store, draft, 4, target, false);
    expect(values(store, result.iri)).toEqual(
      expect.arrayContaining([
        [definition.predicate, definition.object.value],
        [seeAlso.predicate, seeAlso.object.value],
      ]),
    );
  });
  it("creates a drafted parent in the same undo step", async () => {
    const { store, draft, result, target } = await created();
    const version = store.version;
    draft.root.parents.push({ create: node("Study Skills") });
    expect(checkAddEntity(store, draft, 4, target).apply?.changed).toBe(true);
    const applied = applyAddEntity(store, draft, 4, target, false);
    expect(applied.created).toEqual([base + "StudySkills"]);
    expect(applied.parents).toEqual([
      base + "Engineering",
      base + "StudySkills",
    ]);
    expect(store.entities.get(base + "StudySkills")?.label).toBe(
      "Study Skills",
    );
    expect(store.entities.get(result.iri)?.parents).toEqual(
      expect.arrayContaining([base + "Engineering", base + "StudySkills"]),
    );
    expect(store.version).toBe(version + 1);
    store.undo();
    expect(store.entities.has(base + "StudySkills")).toBe(false);
    expect(store.entities.get(result.iri)?.parents).toEqual([
      base + "Engineering",
    ]);
  });
  it("keeps the Undo of a parent the last Apply created", async () => {
    const { store, draft, result, target } = await created();
    draft.root.parents.push({ create: node("Study Skills") });
    const first = applyAddEntity(store, draft, 4, target, false);
    draft.root.parents = first.parents.map((iri) => ({ iri }));
    const next = { iri: result.iri, applied: first.applied };
    store.undo();
    expect(store.entities.has(base + "StudySkills")).toBe(false);
    expect(checkAddEntity(store, draft, 4, next).apply).toEqual({
      changed: false,
      findings: [],
    });
    draft.root.comment = "Reading at speed";
    applyAddEntity(store, draft, 4, next, false);
    expect(store.entities.has(base + "StudySkills")).toBe(false);
    expect(store.entities.get(result.iri)?.parents).toEqual([
      base + "Engineering",
    ]);
    expect(store.entities.get(result.iri)?.comment).toBe("Reading at speed");
  });
  it("renames after the Undo of a parent the last Apply created", async () => {
    const { store, draft, result, target } = await created();
    draft.root.parents.push({ create: node("Study Skills") });
    const first = applyAddEntity(store, draft, 4, target, false);
    draft.root.parents = first.parents.map((iri) => ({ iri }));
    store.undo();
    draft.root.label = "Speed Readings";
    applyAddEntity(
      store,
      draft,
      4,
      { iri: result.iri, applied: first.applied },
      true,
    );
    expect(store.entities.get(result.iri)?.label).toBe("Speed Readings");
    expect(store.entities.has(base + "StudySkills")).toBe(false);
  });
  it("renames again after an undone Rename", async () => {
    const { store, draft, result, target } = await created();
    draft.root.label = "Speed Readings";
    const renamed = applyAddEntity(store, draft, 4, target, true);
    store.undo();
    draft.root.label = "Speed Reading Skills";
    const next = { iri: result.iri, applied: renamed.applied };
    expect(checkAddEntity(store, draft, 4, next).apply?.findings).toEqual([]);
    applyAddEntity(store, draft, 4, next, true);
    expect(store.entities.get(result.iri)?.label).toBe("Speed Reading Skills");
    draft.root.label = "Speed Reading Drills";
    draft.root.comment = "Timed passages";
    applyAddEntity(store, draft, 4, next, true);
    expect(store.entities.get(result.iri)).toMatchObject({
      label: "Speed Reading Drills",
      comment: "Timed passages",
    });
  });
  it.each([
    ["a drafted parent", "drafted"],
    ["an existing descendant", "descendant"],
  ])("refuses a cycle through %s", async (_, via) => {
    const { store, draft, result, target } = await created();
    if (via === "drafted")
      draft.root.parents.push({
        create: node("Study Skills", [{ iri: result.iri }]),
      });
    else {
      createAddEntity(store, input(node("Skimming", [{ iri: result.iri }])), 4);
      draft.root.parents.push({ iri: base + "Skimming" });
    }
    const version = store.version;
    expect(checkAddEntity(store, draft, 4, target).apply).toEqual({
      changed: true,
      findings: [
        { kind: "bad2", message: "A class cannot be its own ancestor." },
      ],
    });
    expect(() => applyAddEntity(store, draft, 4, target, false)).toThrow(
      "own ancestor",
    );
    expect(store.version).toBe(version);
  });
  it("renames with the draft's other edits in one undo step", async () => {
    const { store, draft, result, target } = await created();
    const version = store.version;
    draft.root.label = "Speed Readings";
    draft.root.statements = [seeAlso];
    const applied = applyAddEntity(store, draft, 4, target, true);
    expect(applied.iri).toBe(result.iri);
    expect(store.entities.get(result.iri)?.label).toBe("Speed Readings");
    expect(values(store, result.iri)).toContainEqual([
      seeAlso.predicate,
      seeAlso.object.value,
    ]);
    expect(store.version).toBe(version + 1);
    store.undo();
    expect(store.entities.get(result.iri)?.label).toBe("Speed Reading");
  });
  it("renames alone through the existing rename", async () => {
    const { store, draft, result, target } = await created();
    draft.root.label = "Speed Readings";
    const applied = applyAddEntity(store, draft, 4, target, true);
    expect(store.undoStack.at(-1)?.label).toMatch(/^Rename /);
    expect(store.entities.get(result.iri)?.label).toBe("Speed Readings");
    expect(
      checkAddEntity(store, draft, 4, {
        iri: result.iri,
        applied: applied.applied,
      }).apply,
    ).toEqual({ changed: false, findings: [] });
  });
  it("refuses the created class as its own parent", async () => {
    const { store, draft, result, target } = await created();
    draft.root.parents.push({ iri: result.iri });
    expect(checkAddEntity(store, draft, 4, target).apply).toEqual({
      changed: true,
      findings: [
        { kind: "bad2", message: "A class cannot be its own ancestor." },
      ],
    });
    expect(() => applyAddEntity(store, draft, 4, target, false)).toThrow(
      "own ancestor",
    );
  });
  it("adopts the unedited plan for a draft saved before Apply", async () => {
    const { store, draft, result } = await created();
    const check = checkAddEntity(store, draft, 4, { iri: result.iri });
    expect(check.apply).toMatchObject({ changed: false, findings: [] });
    expect(check.apply?.adopted?.statements.map(statementKey).sort()).toEqual(
      result.applied.statements.map(statementKey).sort(),
    );
  });
  it("rejects a malformed saved last write", () => {
    const saved = {
      ...input(node("Speed Reading")),
      phrase: "Speed Reading",
      origin: "selection",
    };
    expect(
      readSavedAddEntity({
        ...saved,
        applied: { iri: base + "SpeedReading", statements: [] },
      }).applied,
    ).toEqual({ iri: base + "SpeedReading", statements: [] });
    expect(() =>
      readSavedAddEntity({
        ...saved,
        applied: { iri: base + "SpeedReading", statements: [{ subject: 1 }] },
      }),
    ).toThrow("Invalid saved Add entity draft.");
  });
});
