import { it, expect } from "vitest";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { NS, SUBCLASS, type Triple } from "../../src/domain/model";
import {
  synonymContext,
  validateSynonyms,
  closeSynonymForm,
} from "../../src/domain/synonyms";
import {
  buildSynonymPrompt,
  synonymDefinition,
  sampleSynonymTerms,
} from "../../src/shared/synonyms";
import { SuggestionService } from "../../src/main/suggestion-service";
import type {
  SuggestionValue,
  SuggestionDocument,
} from "../../src/shared/suggestions";
import type { DomainMethod } from "../../src/shared/protocol";
import { readPreferences } from "../../src/shared/preferences";
const base = "https://example.org/synonyms#";
const prefixes =
  "@prefix : <" +
  base +
  ">. @prefix owl: <" +
  NS.owl +
  ">. @prefix rdfs: <" +
  NS.rdfs +
  ">. @prefix skos: <" +
  NS.skos +
  ">. ";
const body =
  ':Course a owl:Class; rdfs:label "Course"; rdfs:seeAlso "CRS". ' +
  ':English a owl:Class; rdfs:label "English"; rdfs:subClassOf :Course; rdfs:seeAlso "ENG", :LanguageResource. ' +
  ':LanguageResource rdfs:label "Language reference". ' +
  ':BasicEnglish a owl:Class; rdfs:label "Basic English"; rdfs:comment "English at the basic level."; rdfs:subClassOf :English; rdfs:seeAlso "BASIC ENG"@en. ' +
  ':AdvancedEnglish a owl:Class; rdfs:label "Advanced English"; rdfs:subClassOf :English; rdfs:seeAlso "ADV ENG". ' +
  ':SpokenBasicEnglish a owl:Class; rdfs:label "Spoken Basic English"; rdfs:subClassOf :BasicEnglish; rdfs:seeAlso "Spoken Basic Engl.". ' +
  ':Unrelated a owl:Class; rdfs:label "Private branch"; rdfs:seeAlso "Do not send this". ';
const values = (...items: string[]): SuggestionValue[] =>
  items.map((value) => ({
    value,
    label: value,
    reason: "A wording variant preserving the full scope.",
  }));
const fixture = async (extra = "") =>
  storeFromRdf(
    (await parseRdf(prefixes + body + extra, "synonyms.ttl", base)).triples,
    "Synonyms",
  );

it("includes hierarchy meaning and literal/link seeAlso context without unrelated branches", async () => {
  const store = await fixture();
  const c = synonymContext(store, base + "BasicEnglish", 4);
  expect(c.selected.description).toBe("English at the basic level.");
  expect(c.selected.seeAlso).toContainEqual({
    value: "BASIC ENG",
    literal: true,
    language: "en",
  });
  expect(c.ancestors.map((v) => v.label)).toEqual(["English", "Course"]);
  expect(c.ancestors[0].seeAlso).toContainEqual({
    value: base + "LanguageResource",
    literal: false,
    label: "Language reference",
  });
  expect(c.children[0].seeAlso[0].value).toBe("Spoken Basic Engl.");
  expect(c.siblings[0].seeAlso[0].value).toBe("ADV ENG");
  const prompt = buildSynonymPrompt(c);
  expect(prompt).toContain(
    "same scope, subject, level, population and qualifiers",
  );
  expect(prompt).toContain("sibling label");
  expect(prompt).toContain("rdfs:seeAlso string literals");
  expect(prompt).toContain("BASIC ENG");
  expect(prompt).toContain("ADV ENG");
  expect(prompt).not.toContain("Do not send this");
  expect(c.datasetEpoch).toBe(4);
  expect(c.version).toBe(store.version);
});
it("samples children, descendants and siblings independently and includes omitted annotated relatives", async () => {
  const extra = Array.from(
    { length: 45 },
    (_, i) =>
      ":Child" +
      i +
      ' a owl:Class; rdfs:subClassOf :BasicEnglish; rdfs:seeAlso "child alias ' +
      i +
      '". :Sibling' +
      i +
      ' a owl:Class; rdfs:subClassOf :English; rdfs:seeAlso "sibling alias ' +
      i +
      '".',
  ).join(" ");
  const store = await fixture(extra);
  const c = synonymContext(store, base + "BasicEnglish", 0, () => 0);
  expect(c.children).toHaveLength(20);
  expect(c.descendants).toHaveLength(20);
  expect(c.siblings).toHaveLength(20);
  expect(c.totals).toMatchObject({
    children: 46,
    descendants: 46,
    siblings: 46,
  });
  expect(c.additionalSeeAlso).toHaveLength(20);
  const included = new Set(
    [...c.children, ...c.descendants, ...c.siblings].map((v) => v.iri),
  );
  expect(
    c.additionalSeeAlso.every((v) => !included.has(v.iri) && v.seeAlso.length),
  ).toBe(true);
  expect(new Set(c.children.map((v) => v.iri)).size).toBe(20);
  const another = synonymContext(store, base + "BasicEnglish", 0, () => 0.99);
  expect(another.children).not.toEqual(c.children);
  expect(buildSynonymPrompt(c)).toContain("20 of 46");
  expect(sampleSynonymTerms([1, 2, 3])).toEqual([1, 2, 3]);
});
it("handles multiple inheritance and cycles without repeating the selected entity", async () => {
  const store = await fixture(
    ":Course rdfs:subClassOf :English. :BasicEnglish rdfs:subClassOf :Unrelated.",
  );
  const c = synonymContext(store, base + "BasicEnglish", 1);
  expect(new Set(c.ancestors.map((v) => v.iri)).size).toBe(c.ancestors.length);
  expect(c.ancestors.map((v) => v.label)).toContain("Private branch");
  expect(c.ancestors.map((v) => v.iri)).not.toContain(base + "BasicEnglish");
});
it("includes the types and peers of a named individual", async () => {
  const store = await fixture(
    ':BasicEnglish101 a :BasicEnglish; rdfs:label "Basic English 101". :BasicEnglish102 a :BasicEnglish; rdfs:label "Basic English 102"; rdfs:seeAlso "BE 102".',
  );
  const c = synonymContext(store, base + "BasicEnglish101", 1);
  expect(c.ancestors.map((v) => v.label)).toEqual([
    "Basic English",
    "English",
    "Course",
  ]);
  expect(c.siblings.map((v) => v.label)).toEqual(["Basic English 102"]);
  expect(c.children).toEqual([]);
});
it.each([
  ["English Basics", "Basic English", true],
  ["Basic Engl.", "Basic English", true],
  ["Computer Sci.", "Computer Science", true],
  ["CS", "Computer Science", true],
  ["B.Sc.", "Bachelor of Science", true],
  ["Behavioral Science", "Behavioural Science", true],
  ["Color Theory", "Colour Theory", true],
  ["Pediatrics", "Paediatrics", true],
  ["Health-care", "Health Care", true],
  ["Advanced English", "Basic English", false],
  ["English", "Basic English", false],
  ["Introductory English", "Basic English", false],
  ["Information Technology", "Computer Science", false],
  ["Data Sciences", "Data Science", true],
])("checks close lexical forms: %s / %s", (candidate, label, accepted) => {
  expect(closeSynonymForm(candidate, label)).toBe(accepted);
});
it("excludes existing names, aliases and unrelated wording, while retaining safe variants", async () => {
  const store = await fixture(
    ':AdvancedEnglish skos:altLabel "English Basics". :Unrelated rdfs:seeAlso "Basic Engl.".',
  );
  const result = validateSynonyms(
    store,
    base + "BasicEnglish",
    values(
      "English Basics",
      "Basic Engl.",
      "basic eng",
      "English",
      "Advanced English",
      "Basic, English",
      "Introductory English",
      "https://example.org/BasicEnglish",
    ),
  );
  expect(result.values).toEqual([]);
  expect(
    validateSynonyms(
      await fixture(),
      base + "BasicEnglish",
      values("Basic, English"),
    ).values.map((v) => v.value),
  ).toEqual(["Basic, English"]);
  expect(
    result.excluded.find((v) => v.value === "English Basics")?.reason,
  ).toContain("Advanced English");
  expect(
    result.excluded.find((v) => v.value === "Basic Engl.")?.reason,
  ).toContain("Private branch");
  expect(
    result.excluded.find((v) => v.value === "basic eng")?.reason,
  ).toContain("Already");
});
it("checks names outside the hierarchy sample and refreshes its index after edits", async () => {
  const store = await fixture();
  const candidates = values("English Basics");
  expect(
    validateSynonyms(store, base + "BasicEnglish", candidates).values,
  ).toHaveLength(1);
  const iri = base + "Unrelated";
  store.updateEntity(iri, [
    ...store.entityStatements(iri),
    {
      subject: iri,
      predicate: NS.rdfs + "seeAlso",
      object: { literal: true, value: "ENGLISH-BASICS" },
    },
  ]);
  expect(
    validateSynonyms(store, base + "BasicEnglish", candidates).excluded[0]
      .reason,
  ).toContain("Private branch");
  store.undo();
  expect(
    validateSynonyms(store, base + "BasicEnglish", candidates).values,
  ).toHaveLength(1);
});
it("retains synonym pane targets through preference validation", () => {
  const target = {
    iri: base + "BasicEnglish",
    namespace: base,
    mode: "synonyms",
  };
  expect(
    readPreferences({ version: 1, panelState: { "taxonomy.target": target } })
      .panelState?.["taxonomy.target"],
  ).toEqual(target);
});

async function serviceFixture(
  raw: unknown = {
    suggestions: values(
      "English Basics",
      "Basic Engl.",
      "Advanced English",
      "English",
      "BASIC ENG",
      "Introductory English",
    ),
  },
) {
  const store = await fixture();
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-synonyms-"));
  const script = path.join(root, "mock.cjs"),
    capture = path.join(root, "prompt.txt");
  await writeFile(
    script,
    'const fs=require("fs");let p="";process.stdin.on("data",d=>p+=d);process.stdin.on("end",()=>{fs.writeFileSync(' +
      JSON.stringify(capture) +
      ',p);fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],' +
      JSON.stringify(JSON.stringify(raw)) +
      ");});",
  );
  let epoch = 1,
    changes = 0;
  const document = (): SuggestionDocument => ({
    entity: structuredClone(store.entities.get(base + "BasicEnglish")!),
    statements: structuredClone(store.entityStatements(base + "BasicEnglish")),
    version: store.version,
    datasetEpoch: epoch,
  });
  const request = async <T>(
    method: DomainMethod,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    if (method === "state")
      return { ontology: { namespace: base }, datasetEpoch: epoch } as T;
    if (method === "entityDocument") return document() as T;
    if (method === "synonymContext")
      return synonymContext(store, String(args?.iri), epoch, () => 0) as T;
    if (method === "validateSynonyms" || method === "updateEntity") {
      if (args?.version !== store.version || args.datasetEpoch !== epoch)
        throw Error("The ontology changed.");
      if (method === "validateSynonyms")
        return validateSynonyms(
          store,
          String(args.iri),
          args.values as SuggestionValue[],
        ) as T;
      changes++;
      return store.updateEntity(
        String(args.iri),
        args.statements as Triple[],
      ) as T;
    }
    throw Error(method);
  };
  const discover = async () => [
    { id: "codex" as const, file: process.execPath, args: [script] },
  ];
  const service = new SuggestionService(root, request, discover);
  const run = () =>
    service.run({
      iri: base + "BasicEnglish",
      mode: "synonyms",
      provider: "codex",
    });
  return {
    store,
    service,
    root,
    request,
    discover,
    document,
    run,
    capture,
    get changes() {
      return changes;
    },
    changeWorkspace() {
      epoch++;
    },
  };
}
it("sends exact context, retains exclusions and applies only reviewed string literals with undo", async () => {
  const f = await serviceFixture(),
    before = f.document().statements;
  const run = await f.run();
  expect(await readFile(f.capture, "utf8")).toContain(run.prompt);
  expect(run.synonymContext?.siblings[0].label).toBe("Advanced English");
  expect(run.values.map((v) => v.value)).toEqual([
    "English Basics",
    "Basic Engl.",
  ]);
  expect(run.excluded).toHaveLength(4);
  expect(f.changes).toBe(0);
  await f.service.apply(run.id, [0]);
  expect(f.document().statements).toEqual([
    ...before,
    {
      subject: base + "BasicEnglish",
      predicate: NS.rdfs + "seeAlso",
      object: { literal: true, value: "English Basics" },
    },
  ]);
  expect(f.store.entities.get(base + "BasicEnglish")?.parents).toEqual([
    base + "English",
  ]);
  await expect(f.service.apply(run.id, [0])).rejects.toThrow(/available/);
  await f.service.apply(run.id, [1]);
  expect(f.document().statements.at(-1)?.object).toEqual({
    literal: true,
    value: "Basic Engl.",
  });
  f.store.undo();
  expect(f.document().statements).toHaveLength(before.length + 1);
});
it("preserves history and exact prompts after restart without changing the built-in definition", async () => {
  const f = await serviceFixture(),
    run = await f.run();
  const restored = new SuggestionService(f.root, f.request, f.discover);
  expect((await restored.history())[0]).toEqual(run);
  expect(await restored.listDefinitions()).toEqual([]);
  await restored.apply(run.id, [0]);
  expect(f.document().statements.at(-1)?.predicate).toBe(
    synonymDefinition.predicate,
  );
  expect((await restored.history())[0].applied).toEqual([0]);
});
it("rechecks new sibling aliases before applying a prior run", async () => {
  const f = await serviceFixture(),
    run = await f.run(),
    iri = base + "AdvancedEnglish";
  f.store.updateEntity(iri, [
    ...f.store.entityStatements(iri),
    {
      subject: iri,
      predicate: NS.rdfs + "seeAlso",
      object: { literal: true, value: "English Basics" },
    },
  ]);
  await expect(f.service.apply(run.id, [0])).rejects.toThrow(/another entity/);
  expect(f.changes).toBe(0);
  expect(
    f.document().statements.some((t) => t.object.value === "English Basics"),
  ).toBe(false);
});
it("rejects changed workspaces and changed selected entities before applying", async () => {
  const f = await serviceFixture(),
    run = await f.run();
  f.changeWorkspace();
  await expect(f.service.apply(run.id, [0])).rejects.toThrow(/changed/);
  expect(f.changes).toBe(0);
});
it("accepts empty results and retains malformed responses as failed runs", async () => {
  const empty = await serviceFixture({ suggestions: [] });
  expect((await empty.run()).state).toBe("completed");
  expect(empty.changes).toBe(0);
  const invalid = await serviceFixture({
    suggestions: [{ value: "English Basics" }],
  });
  await expect(invalid.run()).rejects.toThrow(/reason/);
  const failed = (await invalid.service.history())[0];
  expect(failed.state).toBe("failed");
  expect(failed.prompt).toContain("Basic English");
  expect(failed.synonymContext?.selected.seeAlso).toHaveLength(1);
  expect(invalid.changes).toBe(0);
});

it("rejects reordered and inflected forms of a different entity's alias", async () => {
  const store = await fixture(
    ':AdvancedEnglish skos:altLabel "English Basic".',
  );
  const result = validateSynonyms(
    store,
    base + "BasicEnglish",
    values("English Basics"),
  );
  expect(result.values).toEqual([]);
  expect(result.excluded[0].reason).toContain("Advanced English");
});
it("rejects ontology edits made while the assistant is running and retains the failed run", async () => {
  const f = await serviceFixture();
  const service = new SuggestionService(f.root, f.request, async () => {
    f.store.createClass("Another English class", base + "English");
    return f.discover();
  });
  await expect(
    service.run({
      iri: base + "BasicEnglish",
      mode: "synonyms",
      provider: "codex",
    }),
  ).rejects.toThrow(/changed/);
  expect((await service.history())[0].state).toBe("failed");
  expect(f.changes).toBe(0);
});
it("rejects changes to the selected entity before applying a prior run", async () => {
  const f = await serviceFixture(),
    run = await f.run(),
    iri = base + "BasicEnglish";
  f.store.updateEntity(iri, [
    ...f.store.entityStatements(iri),
    {
      subject: iri,
      predicate: NS.rdfs + "comment",
      object: { literal: true, value: "A changed meaning." },
    },
  ]);
  await expect(f.service.apply(run.id, [0])).rejects.toThrow(/entity changed/);
  expect(f.changes).toBe(0);
});
