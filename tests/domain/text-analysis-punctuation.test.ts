import { expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
import { mutatocExecutable } from "../../src/main/mutatoc-client";

let executable = "";
try {
  executable = mutatocExecutable(process.cwd(), "", false);
} catch {
  // The dedicated test:text-analysis command requires the runtime.
}
const prefixes = `@prefix : <https://example.org/punctuation#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .`;
const abbreviations = [
  "U.S.",
  "U.K.",
  "E.U.",
  "U.N.",
  "D.C.",
  "B.C.",
  "A.D.",
  "U.S.A.",
  "N.A.T.O.",
];
const separators = [" ", "  ", "\t", "\n", "\r\n", "\u00a0", "\u2003"];
const frames = [
  ["", ""],
  ["(", ")"],
  ["[", "]"],
  ['"', '"'],
  ["😀 ", " café"],
  ["\n\t", "\r\n"],
  ["~ ", " ~~"],
  ["prefix: ", "; suffix"],
];

// Mutatoc 0.3.1 indexes the tokenized form of punctuated synonyms. These
// expectations describe whole original-text ranges, independently of native
// canonical output, including competition from shorter vocabulary entries.
const punctuatedSynonyms = [
  "Well/Health/Physical Education",
  "PE:PE",
  "Calc (Honors)",
  "Math Lab [Remedial]",
  "Computer-Aided Manufacturing",
];
const punctuatedOntology = (predicate: string) =>
  prefixes +
  '\n:Health a owl:Class; rdfs:label "Health" .\n' +
  ':Calc a owl:Class; rdfs:label "Calc" .\n' +
  ':Lab a owl:Class; rdfs:label "Lab" .\n' +
  ':Manufacturing a owl:Class; rdfs:label "Manufacturing" .\n' +
  punctuatedSynonyms
    .map(
      (phrase, index) =>
        `:Course${index} a owl:Class; ${predicate} ${JSON.stringify(phrase)} .`,
    )
    .join("\n");

it.skipIf(!executable)(
  "maps 135 punctuated synonym variants to one complete exact match",
  async () => {
    let context: Awaited<ReturnType<typeof textAnalysisContext>>;
    let version = 0;
    let checked = 0;
    const service = new TextAnalysisService(
      () => executable,
      async () => context,
    );
    try {
      for (const predicate of ["rdfs:label", "rdfs:seeAlso", "skos:altLabel"]) {
        const parsed = await parseRdf(
          punctuatedOntology(predicate),
          "punctuated-synonyms.ttl",
          "https://example.org/punctuation#",
        );
        context = {
          ...(await textAnalysisContext(
            storeFromRdf(parsed.triples, "punctuated-synonyms"),
            1,
          )),
          version: ++version,
        };
        for (const [index, phrase] of punctuatedSynonyms.entries()) {
          const spaced = phrase
            .replace(/[/:()[\]-]/g, " $& ")
            .replace(/\s+/g, " ")
            .trim();
          for (const layout of [
            phrase,
            spaced,
            spaced.replace(/ /g, "\t\r\n"),
          ]) {
            for (const surface of [
              layout,
              layout.toLowerCase(),
              layout.toUpperCase(),
            ]) {
              const before = "😀 prefix: ";
              const text = `${before}${surface}; suffix`;
              const result = await service.parse({
                text,
                datasetEpoch: 1,
                version,
              });
              expect(
                result.entities,
                `${predicate}: ${JSON.stringify(text)}`,
              ).toEqual([
                {
                  start: before.length,
                  end: before.length + surface.length,
                  key: `ontology:course${index}`,
                  label: `course${index}`,
                  source: "ontology",
                  method: "exact",
                },
              ]);
              expect(
                text.slice(result.entities[0].start, result.entities[0].end),
              ).toBe(surface);
              expect(
                result.concepts?.[`course${index}`]?.map(
                  (concept) => concept.iri,
                ),
              ).toEqual([`https://example.org/punctuation#Course${index}`]);
              checked++;
            }
          }
        }
      }
      expect(checked).toBe(135);
    } finally {
      service.close();
    }
  },
  60_000,
);

it.skipIf(!executable)(
  "keeps repeated punctuated matches distinct and rejects changed punctuation or words",
  async () => {
    const parsed = await parseRdf(
      punctuatedOntology("rdfs:seeAlso"),
      "punctuated-synonyms.ttl",
      "https://example.org/punctuation#",
    );
    const context = await textAnalysisContext(
      storeFromRdf(parsed.triples, "punctuated-synonyms"),
      1,
    );
    const service = new TextAnalysisService(
      () => executable,
      async () => context,
    );
    const parse = (text: string) =>
      service.parse({ text, datasetEpoch: 1, version: context.version });
    try {
      for (const [index, phrase] of punctuatedSynonyms.entries()) {
        const text = `😀 ${phrase}\r\n${phrase}`;
        const result = await parse(text);
        expect(
          result.entities.map(({ start, end, label, method }) => ({
            start,
            end,
            label,
            method,
          })),
        ).toEqual([
          {
            start: 3,
            end: 3 + phrase.length,
            label: `course${index}`,
            method: "exact",
          },
          {
            start: 5 + phrase.length,
            end: 5 + 2 * phrase.length,
            label: `course${index}`,
            method: "exact",
          },
        ]);
      }
      for (const text of [
        "Well/Health/Education",
        "PE/PE",
        "Calc (Advanced)",
        "Math Lab [Optional]",
        "Computer-Aided Accounting",
      ]) {
        expect(
          (await parse(text)).entities.filter((entity) =>
            /^course\d$/.test(entity.label),
          ),
          text,
        ).toEqual([]);
      }
    } finally {
      service.close();
    }
  },
);

it.skipIf(!executable)(
  "maps 1,512 real punctuation matches to complete original UTF-16 ranges",
  async () => {
    let context: Awaited<ReturnType<typeof textAnalysisContext>>;
    let version = 0;
    let checked = 0;
    const service = new TextAnalysisService(
      () => executable,
      async () => context,
    );
    try {
      for (const predicate of ["rdfs:label", "rdfs:seeAlso", "skos:altLabel"]) {
        const turtle =
          prefixes +
          '\n:History a owl:Class; rdfs:label "History" .\n' +
          abbreviations
            .map(
              (abbr, i) =>
                `:Course${i} a owl:Class; rdfs:subClassOf :History; ${predicate} ${JSON.stringify(`${abbr} History to 1865`)} .`,
            )
            .join("\n");
        const parsed = await parseRdf(
          turtle,
          "punctuation.ttl",
          "https://example.org/punctuation#",
        );
        const store = storeFromRdf(parsed.triples, "punctuation.ttl");
        context = {
          ...(await textAnalysisContext(store, 1)),
          version: ++version,
        };
        for (const [i, abbr] of abbreviations.entries()) {
          for (const [gapIndex, gap] of separators.entries()) {
            for (const [before, after] of frames) {
              let phrase = [abbr, "History", "to", "1865"].join(gap);
              if (gapIndex % 3 === 1) phrase = phrase.toLowerCase();
              if (gapIndex % 3 === 2) phrase = phrase.toUpperCase();
              const text = before + phrase + after;
              const result = await service.parse({
                text,
                datasetEpoch: 1,
                version,
              });
              const ontology = result.entities.filter(
                (e) => e.source === "ontology",
              );
              expect(ontology, `${predicate}: ${JSON.stringify(text)}`).toEqual(
                [
                  {
                    start: before.length,
                    end: before.length + phrase.length,
                    key: `ontology:course${i}`,
                    label: `course${i}`,
                    source: "ontology",
                    method: "exact",
                  },
                ],
              );
              expect(text.slice(ontology[0].start, ontology[0].end)).toBe(
                phrase,
              );
              expect(result.concepts?.[`course${i}`]?.[0].iri).toBe(
                `https://example.org/punctuation#Course${i}`,
              );
              checked++;
            }
          }
        }
      }
      expect(checked).toBe(1512);
      console.log(
        `Punctuation highlighting: ${checked} native matches with complete UTF-16 ranges and ontology identities.`,
      );
    } finally {
      service.close();
    }
  },
  180_000,
);

it.skipIf(!executable)(
  "keeps repeated course matches separate and rejects the wrong year",
  async () => {
    const turtle =
      prefixes +
      `
:History a owl:Class; rdfs:label "History" .
:American a owl:Class; rdfs:label "American History"; rdfs:seeAlso "U.S. History" .
:Course a owl:Class; rdfs:label "American History To 1865"; rdfs:seeAlso "U.S. History to 1865" .`;
    const parsed = await parseRdf(
      turtle,
      "courses.ttl",
      "https://example.org/punctuation#",
    );
    const context = await textAnalysisContext(
      storeFromRdf(parsed.triples, "courses.ttl"),
      1,
    );
    const service = new TextAnalysisService(
      () => executable,
      async () => context,
    );
    try {
      const phrase = "U.S. History to 1865";
      const text = `😀 ${phrase}\r\n${phrase}\nU.S. History to 1866`;
      const result = await service.parse({
        text,
        datasetEpoch: 1,
        version: context.version,
      });
      const courses = result.entities.filter((e) => e.label === "course");
      expect(
        courses.map((e) => [e.start, e.end, text.slice(e.start, e.end)]),
      ).toEqual([
        [3, 3 + phrase.length, phrase],
        [5 + phrase.length, 5 + 2 * phrase.length, phrase],
      ]);
    } finally {
      service.close();
    }
  },
);
