import { afterEach, expect, it, vi } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { buildStore } from "../../src/domain/fixture";
import { NS, type Triple } from "../../src/domain/model";
import { statementKey } from "../../src/domain/rdf-model";
import {
  analysisSubjects,
  textAnalysisUpdate,
} from "../../src/main/text-analysis-update";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
import {
  MutatocClient,
  mutatocExecutable,
} from "../../src/main/mutatoc-client";

// craigtrim/axiom#137: compare incremental results with independent fresh loads.
let executable = "";
try {
  executable = mutatocExecutable(process.cwd(), "", false);
} catch {}
afterEach(() => vi.restoreAllMocks());
const base = "https://example.org/update#";
const turtle = `@prefix : <https://example.org/update#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
:Animal a owl:Class; rdfs:label "Animal" .
:Dog a owl:Class; rdfs:subClassOf :Animal; rdfs:label "Dog"; skos:altLabel "canine" .
:Cat a owl:Class; rdfs:label "Cat" .
<https://other.test/#Dog> a owl:Class; rdfs:label "Hound" .`;
const fixture = async () =>
  storeFromRdf((await parseRdf(turtle, "update.ttl", base)).triples, "update");
const keys = (statements: Triple[]) =>
  statements
    .map((t) =>
      statementKey({
        ...t,
        object: t.object.literal
          ? {
              ...t.object,
              datatype:
                t.object.datatype ||
                (t.object.language ? NS.rdf + "langString" : NS.xsd + "string"),
            }
          : t.object,
      }),
    )
    .sort();

it("exports the same named-graph union for full loads and updates without mutating the store", async () => {
  const store = await fixture();
  const dog = store.tbox.find(
    (t) => t.subject === base + "Dog" && t.predicate === NS.rdfs + "label",
  )!;
  store.tbox.push(
    { ...dog, graph: "urn:first" },
    { ...dog, graph: "urn:second" },
  );
  const before = structuredClone(store.tbox);
  const context = await textAnalysisContext(store, 1);
  expect(
    keys((await parseRdf(context.turtle, "union.ttl", base)).triples),
  ).toEqual(keys(context.statements!));
  expect(
    context.statements!.filter(
      (t) => t.subject === dog.subject && t.predicate === dog.predicate,
    ),
  ).toHaveLength(1);
  expect(store.tbox).toEqual(before);
  dog.object.value = "Changed after capture";
  expect(
    context.statements!.find(
      (t) => t.subject === dog.subject && t.predicate === dog.predicate,
    )!.object.value,
  ).toBe("Dog");
});

it("diffs the built-in demo's restricted export and preserves complete subject statements", async () => {
  const store = buildStore(10);
  const before = await textAnalysisContext(store, 1);
  const iri = [...store.entities.keys()].find((id) =>
    id.endsWith("Margherita"),
  )!;
  expect(iri).toBeTruthy();
  store.updateEntity(
    iri,
    store
      .entityStatements(iri)
      .map((t) =>
        t.predicate === NS.rdfs + "label"
          ? { ...t, object: { literal: true, value: "Garden Pizza" } }
          : t,
      ),
  );
  const after = await textAnalysisContext(store, 1);
  const update = await textAnalysisUpdate(
    analysisSubjects(before.statements)!,
    analysisSubjects(after.statements)!,
  );
  expect(Object.keys(update!.replace)).toEqual([
    iri,
    NS.owl + "Class",
    NS.owl + "ObjectProperty",
    NS.owl + "DatatypeProperty",
  ]);
  expect(update!.remove).toEqual([]);
  const replacement = (
    await parseRdf(update!.replace[iri], "subject.ttl", base)
  ).triples;
  expect(keys(replacement)).toEqual(
    keys(after.statements!.filter((t) => t.subject === iri)),
  );
  const generated = store.individuals[0].iri;
  expect([...store.scan()].some((t) => t.subject === generated)).toBe(true);
  expect(after.statements!.some((t) => t.subject === generated)).toBe(false);
});

it.skipIf(!executable)(
  "sends one label edit as update and refreshes matches, span rules and metadata",
  async () => {
    const store = await fixture();
    const service = new TextAnalysisService(
      () => executable,
      () => textAnalysisContext(store, 1),
    );
    const request = vi.spyOn(MutatocClient.prototype, "request");
    const parse = (text: string) =>
      service.parse({ text, datasetEpoch: 1, version: store.version });
    try {
      await parse("Dog");
      request.mockClear();
      store.updateEntity(
        base + "Dog",
        store
          .entityStatements(base + "Dog")
          .map((t) =>
            t.predicate === NS.rdfs + "label"
              ? { ...t, object: { literal: true, value: "Silver Wolf" } }
              : t,
          ),
      );
      const result = await parse("😀 Silver Wolf");
      expect(request.mock.calls.map(([call]) => call.op)).toEqual([
        "update",
        "query",
        "parse",
      ]);
      expect(result.entities).toMatchObject([
        { label: "dog", method: "exact", start: 3, end: 14 },
      ]);
      expect(
        result.concepts!.dog.find((c) => c.iri === base + "Dog")!.label,
      ).toBe("Silver Wolf");
      expect((await parse("Silver Wolf")).entities).toMatchObject([
        { label: "dog", method: "exact" },
      ]);
      store.updateEntity(
        base + "Dog",
        store.entityStatements(base + "Dog"),
        base + "Silver_Wolf",
      );
      expect((await parse("Wolf little silver")).entities).toMatchObject([
        {
          label: "silver_wolf",
          method: "spans",
          matchedWords: ["Wolf", "silver"],
        },
      ]);
    } finally {
      service.close();
    }
  },
);

it.skipIf(!executable)(
  "matches fresh loads after replacements, renames, removals, Undo and Redo",
  async () => {
    const store = await fixture();
    const service = new TextAnalysisService(
      () => executable,
      () => textAnalysisContext(store, 1),
    );
    const request = vi.spyOn(MutatocClient.prototype, "request");
    const texts = [
      "Dog Cat canine Hound",
      "silver little wolf",
      "😀 Garden Cat\nAnimal",
      'feline "café"',
      "Bird",
      "Cat Dog Cat",
    ];
    const compare = async () => {
      const fresh = new TextAnalysisService(
        () => executable,
        () => textAnalysisContext(store, 1),
      );
      try {
        for (const text of texts) {
          const input = { text, datasetEpoch: 1, version: store.version };
          const { milliseconds: _a, ...incremental } =
            await service.parse(input);
          const { milliseconds: _b, ...reloaded } = await fresh.parse(input);
          expect(incremental).toEqual(reloaded);
        }
      } finally {
        fresh.close();
      }
    };
    try {
      await compare();
      store.updateEntity(
        base + "Dog",
        store
          .entityStatements(base + "Dog")
          .map((t) =>
            t.predicate === NS.rdfs + "label"
              ? { ...t, object: { literal: true, value: "Silver Wolf" } }
              : t,
          ),
      );
      await compare();
      store.updateEntity(
        base + "Cat",
        [
          ...store.entityStatements(base + "Cat"),
          {
            subject: base + "Cat",
            predicate: NS.skos + "altLabel",
            object: { literal: true, value: 'feline "café"', language: "fr" },
          },
        ],
        base + "Garden_Cat",
      );
      await compare();
      store.replaceRdf([
        ...store.tbox,
        ...store.entityStatements(base + "Dog").map((t) => ({
          ...t,
          subject: base + "Bird",
          object:
            t.predicate === NS.rdfs + "label"
              ? { literal: true, value: "Bird" }
              : t.object,
        })),
      ]);
      await compare();
      store.deleteClass(base + "Animal");
      await compare();
      store.deleteClass(base + "Dog");
      await compare();
      store.undo();
      await compare();
      store.redo();
      await compare();
      store.replaceRdf([]);
      await compare();
      store.undo();
      await compare();
      const incrementalClient = request.mock.contexts[0];
      const operations = request.mock.calls
        .filter((_, i) => request.mock.contexts[i] === incrementalClient)
        .map(([call]) => call.op);
      expect(operations.filter((op) => op === "load")).toHaveLength(1);
      expect(operations.filter((op) => op === "update")).toHaveLength(9);
    } finally {
      service.close();
    }
  },
);

it.skipIf(!executable)(
  "recovers real matching after an invalid native update with exactly one full load",
  async () => {
    const store = await fixture();
    const service = new TextAnalysisService(
      () => executable,
      () => textAnalysisContext(store, 1),
    );
    const original = MutatocClient.prototype.request;
    const request = vi.spyOn(MutatocClient.prototype, "request");
    try {
      await service.parse({
        text: "Dog",
        version: store.version,
        datasetEpoch: 1,
      });
      store.updateEntity(
        base + "Dog",
        store
          .entityStatements(base + "Dog")
          .map((t) =>
            t.predicate === NS.rdfs + "label"
              ? { ...t, object: { literal: true, value: "Silver Wolf" } }
              : t,
          ),
      );
      request.mockClear();
      request.mockImplementationOnce(function (this: MutatocClient) {
        return original.call(this, {
          op: "update",
          replace: { [base + "Dog"]: "invalid Turtle" },
        });
      });
      const result = await service.parse({
        text: "Silver Wolf",
        version: store.version,
        datasetEpoch: 1,
      });
      expect(request.mock.calls.map(([call]) => call.op)).toEqual([
        "update",
        "load",
        "query",
        "parse",
      ]);
      expect(result.entities).toMatchObject([
        { label: "dog", method: "exact" },
      ]);
    } finally {
      service.close();
    }
  },
);
