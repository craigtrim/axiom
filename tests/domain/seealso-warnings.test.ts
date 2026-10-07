import { expect, it, vi } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { NS } from "../../src/domain/model";
import { seeAlsoMatches } from "../../src/domain/seealso-warnings";
import { addFindSynonym } from "../../src/domain/find-synonyms";
import { readPreferences } from "../../src/shared/preferences";
import {
  seeAlsoOccurrence,
  readSeeAlsoWarnings,
} from "../../src/shared/seealso-warnings";

const base = "https://warnings.test/",
  predicate = NS.rdfs + "seeAlso";
const term = (value: string, literal = true) => ({ value, literal });
async function fixture() {
  return storeFromRdf(
    (
      await parseRdf(
        `
    @prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .
    : a owl:Ontology .
    :A a owl:Class; rdfs:label "Shared"; rdfs:seeAlso "Shared", "Unique", <https://resource.test/Shared> .
    :B a owl:Class; rdfs:label "Second"; rdfs:seeAlso " shared "@en, "Shared"@fr .
    :C a owl:Class; rdfs:label "Shared"; rdfs:comment "Shared" .
  `,
        "warnings.ttl",
        base,
      )
    ).triples,
    "Warnings",
  );
}
it("reports other subjects once, without treating labels or unrelated predicates as duplicates", async () => {
  const store = await fixture();
  expect(seeAlsoMatches(store, base + "A", term("SHARED"))).toEqual({
    total: 1,
    entities: [{ iri: base + "B", label: "Second" }],
  });
  expect(seeAlsoMatches(store, base + "A", term("Unique")).total).toBe(0);
  expect(seeAlsoMatches(store, base + "C", term("Shared")).total).toBe(2);
  expect(seeAlsoMatches(store, base + "C", term("Share")).total).toBe(0);
  expect(seeAlsoMatches(store, base + "C", term(" ")).total).toBe(0);
});
it("allows overlapping values and refreshes warnings with add, Undo and Redo", async () => {
  const store = await fixture();
  expect(addFindSynonym(store, base + "C", "Shared").added).toBe(true);
  expect(seeAlsoMatches(store, base + "A", term("Shared")).total).toBe(2);
  store.undo();
  expect(seeAlsoMatches(store, base + "A", term("Shared")).total).toBe(1);
  store.redo();
  expect(seeAlsoMatches(store, base + "A", term("Shared")).total).toBe(2);
  const version = store.version;
  expect(addFindSynonym(store, base + "C", "Shared").added).toBe(false);
  expect(store.version).toBe(version);
});
it("distinguishes resource IRIs from literal text and preserves case-sensitive resources", async () => {
  const store = await fixture();
  expect(
    seeAlsoMatches(
      store,
      base + "B",
      term("https://resource.test/Shared", false),
    ).total,
  ).toBe(1);
  expect(
    seeAlsoMatches(
      store,
      base + "B",
      term("https://resource.test/shared", false),
    ).total,
  ).toBe(0);
  expect(
    seeAlsoMatches(store, base + "B", term("https://resource.test/Shared"))
      .total,
  ).toBe(0);
});
it("permits an untagged synonym alongside a tagged literal and keeps exact writes idempotent", async () => {
  const store = await fixture();
  expect(addFindSynonym(store, base + "B", "Shared").added).toBe(true);
  expect(
    store.bySubject.get(base + "B")!.filter((t) => t.predicate === predicate),
  ).toHaveLength(3);
  expect(addFindSynonym(store, base + "B", "Shared").added).toBe(false);
});
it("reuses its predicate index during typing and caps a large set of matches truthfully", async () => {
  const store = await fixture();
  for (let n = 0; n < 30; n++) store.createClass("Extra " + n, base + "A");
  for (const entity of store.entities.values())
    if (entity.name.startsWith("Extra"))
      store.addSynonym(entity.iri, "Shared", predicate);
  const scan = vi.spyOn(store.byPredicate, "get");
  expect(seeAlsoMatches(store, base + "C", term("Shared"))).toMatchObject({
    total: 32,
  });
  expect(
    seeAlsoMatches(store, base + "C", term("Shared")).entities,
  ).toHaveLength(20);
  seeAlsoMatches(store, base + "C", term("Unique"));
  expect(scan).toHaveBeenCalledTimes(1);
});
it("persists independent occurrence dismissals and the global opt-out, rejecting malformed settings", () => {
  const key = seeAlsoOccurrence(base, base + "A", term("Shared"));
  expect(key).not.toBe(seeAlsoOccurrence(base, base + "B", term("Shared")));
  expect(key).not.toBe(seeAlsoOccurrence(base, base + "A", term("Different")));
  expect(key).not.toBe(
    seeAlsoOccurrence("urn:other", base + "A", term("Shared")),
  );
  const saved = readPreferences({
    version: 1,
    panelState: {
      "warnings.seeAlso": { enabled: false, dismissed: [key, key, null, 1] },
    },
  });
  expect(saved.panelState!["warnings.seeAlso"]).toEqual({
    enabled: false,
    dismissed: [key],
  });
  expect(
    readPreferences(JSON.parse(JSON.stringify(saved))).panelState![
      "warnings.seeAlso"
    ],
  ).toEqual(saved.panelState!["warnings.seeAlso"]);
});
it("retains long annotations while bounding serialized preferences and favoring recent dismissals", () => {
  const keys = Array.from({ length: 50 }, (_, i) =>
    seeAlsoOccurrence(base, base + i, term('"'.repeat(50000))),
  );
  const settings = readSeeAlsoWarnings({ enabled: true, dismissed: keys });
  expect(settings.dismissed.at(-1)).toBe(keys.at(-1));
  expect(settings.dismissed.length).toBeGreaterThan(0);
  expect(settings.dismissed.length).toBeLessThan(keys.length);
  expect(JSON.stringify(settings).length).toBeLessThan(1000100);
});
