import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import reference from "../fixtures/text-analysis/reference.json";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
import { mutatocExecutable } from "../../src/main/mutatoc-client";

// Mutatoc 0.2.2 treats whitespace between exact phrase tokens consistently.
// These three single-line source cases retain their canonical text and source positions;
// only the method changes from the old fallback span match to an exact match.
// Keep the original Python fixture unchanged and identify every correction.
const exactWhitespaceCases = new Set(["plus-033", "plus-035", "plus-043"]);

// craigtrim/axiom#52: Mutatoc 0.5.1 uses the closest occurrence of a repeated
// span word, where the Python reference used the last one. That trims a match
// that ran past its own words and finds a pair the last occurrence hid.
const closestOccurrenceCases = new Map([
  [
    "plus-088",
    {
      python: "pair",
      canonical: "pair beta",
      entities: [
        {
          start: 0,
          end: 15,
          label: "pair",
          method: "spans",
          surface: "alpha blah beta",
        },
      ],
    },
  ],
  [
    "plus-092",
    {
      python: "beta alpha blah blah blah blah beta",
      canonical: "pair blah blah blah blah beta",
      entities: [
        {
          start: 0,
          end: 10,
          label: "pair",
          method: "spans",
          surface: "beta alpha",
        },
      ],
    },
  ],
]);

// craigtrim/axiom#135: retain historical Python fixtures and explicitly record
// the nine intentional changes caused by Axiom's line-boundary policy.
const lineBoundaryCases = new Map<
  string,
  Pick<
    (typeof reference.profiles)[number]["cases"][number],
    "canonical" | "entities"
  >
>([
  ...["plus-037", "plus-039", "plus-041"].map<
    [string, { canonical: string; entities: never[] }]
  >((id) => [id, { canonical: "alpha beta", entities: [] }]),
  ...["plus-038", "plus-040", "plus-042"].map<
    [string, { canonical: string; entities: never[] }]
  >((id) => [id, { canonical: "beta alpha", entities: [] }]),
  ["plus-102", { canonical: "alpha blah beta", entities: [] }],
  [
    "nested-026",
    {
      canonical: "😀 renal_trauma blah acute .",
      entities: [
        {
          start: 3,
          end: 16,
          label: "renal_trauma",
          method: "exact",
          surface: "kidney injury",
        },
        {
          start: 22,
          end: 27,
          label: "acute",
          method: "exact",
          surface: "acute",
        },
      ],
    },
  ],
  [
    "nested-027",
    {
      canonical: "kidney injury blah acute",
      entities: [
        {
          start: 19,
          end: 24,
          label: "acute",
          method: "exact",
          surface: "acute",
        },
      ],
    },
  ],
]);

let executable: string | undefined;
try {
  executable = mutatocExecutable(process.cwd(), "", false);
} catch {
  // Ordinary app tests can run without the Windows runtime. The dedicated
  // test:text-analysis command checks the runtime before starting any tests.
}

describe.skipIf(!executable)(
  "Python reference OWL through Axiom and the packaged C engine",
  () => {
    for (const profile of reference.profiles) {
      describe(profile.name, () => {
        let service: TextAnalysisService;
        let version: number;
        beforeAll(async () => {
          const turtle = readFileSync(
            path.resolve("tests/fixtures/text-analysis", profile.owl),
            "utf8",
          );
          const parsed = await parseRdf(
            turtle,
            profile.owl,
            "https://example.org/spans#",
            "turtle",
          );
          const store = storeFromRdf(parsed.triples, profile.name);
          version = store.version;
          service = new TextAnalysisService(
            () => executable!,
            () => textAnalysisContext(store, 1),
          );
        });
        afterAll(() => service?.close());
        it.each(profile.cases)(
          "$id: $text",
          async ({ id, text, canonical, entities }) => {
            const closest = closestOccurrenceCases.get(id);
            if (closest) expect(canonical).toBe(closest.python);
            const corrected = lineBoundaryCases.get(id) ?? closest;
            const expected = corrected
              ? corrected.entities
              : exactWhitespaceCases.has(id)
                ? entities.map((entity) => {
                    expect(entity.method).toBe("spans");
                    expect(entity.label).toBe("pair");
                    return { ...entity, method: "exact" };
                  })
                : entities;
            const actual = await service.parse({
              text,
              datasetEpoch: 1,
              version,
            });
            expect(actual.superseded).toBeUndefined();
            expect(actual.text).toBe(text);
            expect(actual.canonical).toBe(corrected?.canonical ?? canonical);
            expect(
              actual.entities
                .filter((e) => e.source === "ontology")
                .map((e) => ({
                  start: e.start,
                  end: e.end,
                  label: e.label,
                  method: e.method,
                  surface: text.slice(e.start, e.end),
                })),
            ).toEqual(expected);
            for (const entity of actual.entities) {
              if (entity.source === "ontology")
                expect(actual.concepts?.[entity.label]?.length).toBeGreaterThan(
                  0,
                );
              expect(entity.start).toBeGreaterThanOrEqual(0);
              expect(entity.end).toBeLessThanOrEqual(text.length);
              expect(entity.start).toBeLessThan(entity.end);
            }
          },
        );
      });
    }
  },
);
