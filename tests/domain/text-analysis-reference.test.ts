import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import reference from "../fixtures/text-analysis/reference.json";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
import { mutatocExecutable } from "../../src/main/mutatoc-client";

// Mutatoc 0.2.2 treats whitespace between exact phrase tokens consistently.
// These six source cases retain their canonical text and source positions;
// only the method changes from the old fallback span match to an exact match.
// Keep the original Python fixture unchanged and identify every correction.
const exactWhitespaceCases = new Set([
  "plus-033",
  "plus-035",
  "plus-037",
  "plus-039",
  "plus-041",
  "plus-043",
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
            const expected = exactWhitespaceCases.has(id)
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
            expect(actual.canonical).toBe(canonical);
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
