import { describe, expect, it, vi } from "vitest";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { NS } from "../../src/domain/model";
import {
  declaration,
  fromTriples,
  iri,
  labelledStore,
  literal,
} from "../fixtures/search/fixture";

describe("functional search: deterministic semantic eligibility", () => {
  it.each([
    { score: -1, included: false },
    { score: 0, included: false },
    { score: 0.499999, included: false },
    { score: 0.5, included: true },
    { score: 0.500001, included: true },
    { score: 0.9, included: true },
    { score: 1, included: true },
    { score: NaN, included: false },
    { score: Infinity, included: false },
    { score: -Infinity, included: false },
  ])(
    "SEMANTIC-CUTOFF score=$score included=$included",
    ({ score, included }) => {
      const index = new EntitySearchIndex(
        labelledStore([{ id: "target", label: "Related Concept" }]),
      );
      const result = index.find(
        { text: "zzqvopaque", fields: ["name"] },
        new Map([["Related Concept", score]]),
      );
      expect(result.rows.map((r) => r.iri)).toEqual(
        included ? [iri("target")] : [],
      );
      if (included)
        expect(result.rows[0]).toMatchObject({
          similarity: score,
          matchedField: "name",
          matchedValue: "Related Concept",
        });
    },
  );
  it.each([
    { score: 0.749999, included: false },
    { score: 0.75, included: true },
    { score: 0.750001, included: true },
    { score: 0.89, included: true },
  ])(
    "SEMANTIC-RELATIVE score=$score against best=.9 included=$included",
    ({ score, included }) => {
      const index = new EntitySearchIndex(
        labelledStore([
          { id: "best", label: "Best Concept" },
          { id: "next", label: "Next Concept" },
        ]),
      );
      const rows = index.find(
        { text: "zzqvopaque" },
        new Map([
          ["Best Concept", 0.9],
          ["Next Concept", score],
        ]),
      ).rows;
      expect(rows.map((r) => r.iri)).toEqual(
        included ? [iri("best"), iri("next")] : [iri("best")],
      );
    },
  );
  it.each(Array.from({ length: 13 }, (_, lexicalCount) => ({ lexicalCount })))(
    "SEMANTIC-FILL lexical=$lexicalCount preserves lexical hits and fills only available slots",
    ({ lexicalCount }) => {
      const lexical = Array.from({ length: lexicalCount }, (_, n) => ({
        id: `lex${n}`,
        label: `Needle ${n}`,
      }));
      const semantic = Array.from({ length: 14 }, (_, n) => ({
        id: `sem${n}`,
        label: `Related ${n}`,
      }));
      const index = new EntitySearchIndex(
        labelledStore([...lexical, ...semantic]),
      );
      const scores = new Map(
        semantic.map((r, n) => [r.label, 0.99 - n * 0.005]),
      );
      const result = index.find({ text: "needle", fields: ["name"] }, scores);
      const expectedFill = Math.max(0, 10 - lexicalCount);
      expect(result.total).toBe(lexicalCount + expectedFill);
      expect(
        new Set(result.rows.slice(0, lexicalCount).map((r) => r.iri)),
      ).toEqual(new Set(lexical.map((r) => iri(r.id))));
      expect(result.rows.slice(lexicalCount).map((r) => r.iri)).toEqual(
        semantic.slice(0, expectedFill).map((r) => iri(r.id)),
      );
      expect(
        index.search("needle", false, [], 50, scores).map((r) => r.iri),
      ).toEqual(result.rows.map((r) => r.iri));
    },
  );
  it("counts only selected categories when determining semantic fill", () => {
    const rows = Array.from({ length: 12 }, (_, n) => ({
      id: `class${n}`,
      label: `Needle ${n}`,
    }));
    const index = new EntitySearchIndex(
      labelledStore([
        ...rows,
        { id: "instance", label: "Related Instance", kind: "Individual" },
      ]),
    );
    expect(
      index
        .find(
          { text: "needle", kinds: ["individuals"] },
          new Map([["Related Instance", 0.9]]),
        )
        .rows.map((r) => r.iri),
    ).toEqual([iri("instance")]);
  });
  it("excludes ineligible high scores before computing the relative score cutoff", () => {
    const index = new EntitySearchIndex(
      labelledStore([
        { id: "excluded", label: "Dominant Concept" },
        { id: "property", label: "Dominant Property", kind: "ObjectProperty" },
        { id: "target", label: "Modest Concept" },
      ]),
    );
    const scores = new Map([
      ["Dominant Concept", 0.99],
      ["Dominant Property", 0.98],
      ["Modest Concept", 0.6],
    ]);
    expect(
      index
        .find(
          {
            text: "zzqvopaque",
            kinds: ["classes"],
            excludeIri: iri("excluded"),
          },
          scores,
        )
        .rows.map((r) => r.iri),
    ).toEqual([iri("target")]);
    expect(
      index
        .search("zzqvopaque", true, [iri("excluded")], 24, scores)
        .map((r) => r.iri),
    ).toEqual([iri("target")]);
  });
  it("does not let semantic scores suppress a weak lexical match", () => {
    const index = new EntitySearchIndex(
      labelledStore([
        { id: "lex", label: "Needle" },
        { id: "sem", label: "Related" },
      ]),
    );
    expect(
      index
        .find(
          { text: "needle" },
          new Map([
            ["Needle", -1],
            ["Related", 0.99],
          ]),
        )
        .rows.map((r) => r.iri),
    ).toEqual([iri("lex"), iri("sem")]);
  });
  it("keeps preferred exact and prefix matches above aliases even when aliases score higher", () => {
    const index = new EntitySearchIndex(
      fromTriples([
        ...declaration(iri("exact"), "Reading"),
        ...declaration(iri("prefix"), "Reading Skills"),
        ...declaration(iri("alias"), "Language Arts"),
        literal(iri("alias"), NS.skos + "altLabel", "Reading"),
      ]),
    );
    const rows = index.find(
      { text: "reading", fields: ["name"] },
      new Map([
        ["Language Arts", 0.99],
        ["Reading Skills", 0.6],
        ["Reading", 0.51],
      ]),
    ).rows;
    expect(rows.map((r) => r.iri)).toEqual([
      iri("exact"),
      iri("prefix"),
      iri("alias"),
    ]);
  });
  it("fuses semantic and lexical ranks within a lexical tier", () => {
    const index = new EntitySearchIndex(
      labelledStore([
        { id: "a", label: "Alpha Needle" },
        { id: "b", label: "Bravo Needle" },
        { id: "c", label: "Charlie Needle" },
      ]),
    );
    const options = { text: "needle", fields: ["name"] };
    expect(index.find(options).rows.map((r) => r.iri)).toEqual([
      iri("a"),
      iri("b"),
      iri("c"),
    ]);
    expect(
      index
        .find(options, new Map([["Charlie Needle", 0.99]]))
        .rows.map((r) => r.iri),
    ).toEqual([iri("c"), iri("a"), iri("b")]);
    expect(index.find(options).rows.map((r) => r.iri)).toEqual([
      iri("a"),
      iri("b"),
      iri("c"),
    ]);
  });
  it("term coverage outranks semantic preference within the same lexical tier", () => {
    const index = new EntitySearchIndex(
      labelledStore([
        { id: "full", label: "Applied Reading Comprehension" },
        { id: "partial", label: "Applied Reading" },
      ]),
    );
    expect(
      index
        .find(
          { text: "comprehension reading", fields: ["name"] },
          new Map([["Applied Reading", 0.99]]),
        )
        .rows.map((r) => r.iri),
    ).toEqual([iri("full"), iri("partial")]);
  });
  it("ignores unindexed score keys and matches an entity only once across several scored values", () => {
    const target = iri("target"),
      note = iri("notes");
    const index = new EntitySearchIndex(
      fromTriples([
        ...declaration(target, "Principal Heading"),
        literal(target, NS.skos + "altLabel", "Alternate Wording"),
        literal(target, note, "Annotation Passage"),
      ]),
    );
    const scores = new Map([
      ["Principal Heading", 0.6],
      ["Alternate Wording", 0.8],
      ["Annotation Passage", 0.9],
      ["Unindexed Phrase", 1],
    ]);
    const names = index.find({ text: "zzqvopaque", fields: ["name"] }, scores);
    expect(names.rows).toHaveLength(1);
    expect(names.rows[0]).toMatchObject({
      iri: target,
      similarity: 0.8,
      matchedValue: "Alternate Wording",
      matchedField: "name",
    });
    const all = index.find({ text: "zzqvopaque", fields: ["*"] }, scores);
    expect(all.rows).toHaveLength(1);
    expect(all.rows[0]).toMatchObject({
      similarity: 0.9,
      matchedValue: "Annotation Passage",
      matchedField: note,
    });
    expect(
      index.find({ text: "zzqvopaque", fields: ["iri"] }, scores).rows,
    ).toEqual([]);
    expect(index.find({ text: "zzqvopaque", fields: [] }, scores).rows).toEqual(
      [],
    );
    expect(scores.size).toBe(4);
  });
  it.each([undefined, new Map<string, number>()])(
    "NO-SCORES %j retains the complete lexical result",
    (scores) => {
      const index = new EntitySearchIndex(
        labelledStore([{ id: "target", label: "Reading" }]),
      );
      expect(
        index.find({ text: "reading" }, scores).rows.map((r) => r.iri),
      ).toEqual([iri("target")]);
    },
  );
  it("passes normalized query text and only selected corpus values to the scorer", async () => {
    const target = iri("target"),
      note = iri("notes");
    const index = new EntitySearchIndex(
      fromTriples([
        ...declaration(target, "Principal Heading"),
        literal(target, note, "Annotation Passage"),
      ]),
    );
    const scores = new Map([["Annotation Passage", 0.9]]);
    const scorer = vi.fn(async () => scores);
    expect(
      await index.semanticScores(
        { text: "  CAFE\u0301 Reading!  ", fields: [note] },
        scorer,
      ),
    ).toBe(scores);
    expect(scorer).toHaveBeenCalledExactlyOnceWith("café reading!", [
      "Annotation Passage",
    ]);
    scorer.mockClear();
    await index.semanticScores({ text: "!!!" }, scorer);
    expect(scorer).not.toHaveBeenCalled();
  });
});
