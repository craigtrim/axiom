import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
import { mutatocExecutable } from "../../src/main/mutatoc-client";
import { NS } from "../../src/domain/model";

let executable = "";
try {
  executable = mutatocExecutable(process.cwd(), "", false);
} catch {
  // The dedicated test:text-analysis command requires the native runtime.
}
const base = "https://example.org/boundaries#";
const turtle = `@prefix : <${base}> .
@prefix owl: <${NS.owl}> .
@prefix rdfs: <${NS.rdfs}> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
:Glacier_Survey a owl:Class; rdfs:label "Glacier Survey" .
:FieldOperations a owl:Class; rdfs:label "Field Operations" .
:renal_trauma a owl:Class; skos:altLabel "kidney injury" .
:Acute a owl:Class; rdfs:label "acute" .
:Condition a owl:Class; skos:altLabel "renal_trauma+acute" .`;

// craigtrim/axiom#135: expectations use synthetic text and original UTF-16 positions.
describe.skipIf(!executable)("native line boundaries", () => {
  let service: TextAnalysisService;
  let store: ReturnType<typeof storeFromRdf>;
  beforeAll(async () => {
    store = storeFromRdf(
      (await parseRdf(turtle, "boundaries.ttl", base)).triples,
      "boundaries",
    );
    service = new TextAnalysisService(
      () => executable,
      () => textAnalysisContext(store, 1),
    );
  });
  afterAll(() => service?.close());
  const parse = (text: string) =>
    service.parse({ text, datasetEpoch: 1, version: store.version });
  const matches = async (text: string) => {
    const result = await parse(text);
    expect(result.text).toBe(text);
    return result.entities
      .filter((entity) => entity.source === "ontology")
      .map(({ start, end, label, method }) => ({ start, end, label, method }));
  };
  it.each([
    "\n",
    "\r",
    "\r\n",
    "\v",
    "\f",
    "\u0085",
    "\u2028",
    "\u2029",
    "\n\n",
    "\r\n\r\n",
  ])(
    "rejects split exact phrases, reversed spans and nested spans at %j",
    async (gap) => {
      expect(await matches(`Glacier${gap}Survey`)).toEqual([]);
      expect(await matches(`Survey${gap}Glacier`)).toEqual([]);
      const text = `😀 kidney injury${gap}blah acute`;
      const start = text.indexOf("acute");
      expect(await matches(text)).toEqual([
        { start: 3, end: 16, label: "renal_trauma", method: "exact" },
        { start, end: start + 5, label: "acute", method: "exact" },
      ]);
    },
  );
  it.each([" ", "  ", "\t", " \t  "])(
    "retains exact and span matches separated by %j on one line",
    async (gap) => {
      const exact = `Glacier${gap}Survey`;
      const span = `Survey${gap}Glacier`;
      expect(await matches(exact)).toEqual([
        {
          start: 0,
          end: exact.length,
          label: "glacier_survey",
          method: "exact",
        },
      ]);
      expect(await matches(span)).toEqual([
        {
          start: 0,
          end: span.length,
          label: "glacier_survey",
          method: "spans",
        },
      ]);
    },
  );
  it("retains an exact entry between span words on separate list lines", async () => {
    const text = "😀 Survey\r\nnotes\r\nField Operations\r\nGlacier";
    const start = text.indexOf("Field Operations");
    expect(await matches(text)).toEqual([
      { start, end: start + 16, label: "fieldoperations", method: "exact" },
    ]);
    expect((await parse(text)).concepts?.fieldoperations?.[0].iri).toBe(
      base + "FieldOperations",
    );
  });
  it("finds a later same-line span after rejecting a crossing candidate", async () => {
    const text = "😀 Survey\nGlacier\r\nSurvey glacier";
    const start = text.lastIndexOf("Survey");
    expect(await matches(text)).toEqual([
      { start, end: text.length, label: "glacier_survey", method: "spans" },
    ]);
  });
  it("retains boundaries through incremental subject edits, Undo and Redo", async () => {
    const iri = base + "FieldOperations";
    store.updateEntity(iri, [
      ...store.entityStatements(iri),
      {
        subject: iri,
        predicate: NS.rdfs + "seeAlso",
        object: { literal: true, value: "camp duties" },
      },
    ]);
    const text = "camp\nduties\ncamp duties";
    const expected = [
      { start: 12, end: 23, label: "fieldoperations", method: "exact" },
    ];
    expect(await matches(text)).toEqual(expected);
    store.undo();
    expect(await matches(text)).toEqual([]);
    store.redo();
    expect(await matches(text)).toEqual(expected);
    store.undo();
  });
  it("keeps blank-ontology text and line breaks unchanged", async () => {
    const empty = new TextAnalysisService(
      () => executable,
      async () => ({ turtle: "", name: "empty", datasetEpoch: 2, version: 0 }),
    );
    try {
      const text = "😀 Survey\r\n\nField Operations\rGlacier";
      const result = await empty.parse({ text, datasetEpoch: 2, version: 0 });
      expect(result.text).toBe(text);
      expect(result.canonical).toBe(text);
      expect(result.entities).toEqual([]);
    } finally {
      empty.close();
    }
  });
});
