import { describe, expect, it } from "vitest";
import { NS, TYPE, SUBCLASS, iriTerm, literal } from "../../src/domain/model";
import { predicateOptions } from "../../src/domain/predicate-options";
import { orderPredicates } from "../../src/shared/predicates";
import { storeFromRdf, parseRdf } from "../../src/domain/rdf-io";
import { buildStore, generate } from "../../src/domain/fixture";

const base = "https://example.org/";

describe("predicate ordering", () => {
  it("puts prior, entity order, usage counts and the alphabetical remainder in separate tiers", () => {
    const known = [
      { iri: base + "unused", count: 0 },
      { iri: base + "zFrequent", count: 12 },
      { iri: base + "bTie", count: 3 },
      { iri: base + "aTie", count: 3 },
      { iri: SUBCLASS, count: 30 },
    ];
    const ordered = orderPredicates(
      [SUBCLASS, NS.rdfs + "label"],
      known,
      NS.rdfs + "seeAlso",
    );
    expect(ordered.slice(0, 6)).toEqual([
      NS.rdfs + "seeAlso",
      SUBCLASS,
      NS.rdfs + "label",
      base + "zFrequent",
      base + "aTie",
      base + "bTie",
    ]);
    expect(ordered.slice(6)).toEqual(ordered.slice(6).sort());
    expect(ordered.slice(6)).toContain(base + "unused");
  });

  it("deduplicates at the highest tier and excludes rdf:type and blank rows from every tier", () => {
    const label = NS.rdfs + "label";
    const known = [
      { iri: label, count: 10 },
      { iri: TYPE, count: 100 },
    ];
    const ordered = orderPredicates(
      [SUBCLASS, label, label, TYPE, ""],
      known,
      label,
    );
    expect(ordered.slice(0, 2)).toEqual([label, SUBCLASS]);
    expect(ordered.filter((iri) => iri === label)).toHaveLength(1);
    expect(ordered).not.toContain(TYPE);
    expect(ordered).not.toContain("");
    expect(orderPredicates([TYPE], known, TYPE)).not.toContain(TYPE);
    expect(orderPredicates([], [])).not.toContain(TYPE);
  });
});

describe("workspace predicate counts", () => {
  it("counts all named graphs and keeps declared but unused properties at zero", async () => {
    const store = storeFromRdf(
      (
        await parseRdf(
          `
      @prefix : <${base}> . @prefix owl: <${NS.owl}> .
      :unused a owl:AnnotationProperty .
      :s :related :o .
      :g1 { :s :related :o . }
      :g2 { :s :related :o; :note "text" . }
    `,
          "predicates.trig",
          base,
        )
      ).triples,
      "Predicates",
    );
    expect(predicateOptions(store)).toEqual(
      expect.arrayContaining([
        { iri: base + "related", count: 3 },
        { iri: base + "note", count: 1 },
        { iri: base + "unused", count: 0 },
      ]),
    );
    expect(predicateOptions(store).some(({ iri }) => iri === TYPE)).toBe(false);
  });

  it("updates counts after editing, undo and redo, and isolates a new store", () => {
    const iri = base + "Class";
    const store = storeFromRdf(
      [{ subject: iri, predicate: TYPE, object: iriTerm(NS.owl + "Class") }],
      "Predicates",
    );
    const hasNote = () =>
      predicateOptions(store).find((p) => p.iri === base + "note");
    expect(hasNote()).toBeUndefined();
    store.updateEntity(iri, [
      ...store.entityStatements(iri),
      { subject: iri, predicate: base + "note", object: literal("A note") },
    ]);
    expect(hasNote()?.count).toBe(1);
    store.undo();
    expect(hasNote()).toBeUndefined();
    store.redo();
    expect(hasNote()?.count).toBe(1);
    expect(predicateOptions(storeFromRdf([], "Empty"))).toEqual([]);
  });

  it("includes generated individual predicates and refreshes after regeneration", () => {
    const store = buildStore(1000);
    expect(predicateOptions(store)).toContainEqual({
      iri: NS.demo + "priceGBP",
      count: 1000,
    });
    expect(predicateOptions(store)).toContainEqual({
      iri: NS.rdfs + "label",
      count:
        (store.byPredicate.get(NS.rdfs + "label")?.length ?? 0) +
        store.customers.length,
    });
    const generated = generate(12000);
    store.loadGenerated(generated.individuals, generated.customers);
    expect(predicateOptions(store)).toContainEqual({
      iri: NS.demo + "priceGBP",
      count: 12000,
    });
  });
});
