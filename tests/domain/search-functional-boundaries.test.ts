import { describe, expect, it } from "vitest";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { iri, labelledStore } from "../fixtures/search/fixture";

const normalizationCases = [
  ["accent-acute", "Café Society", "cafe society"],
  ["accent-decomposed", "Cafe\u0301 Society", "café society"],
  ["accent-circumflex", "Forêt Conservation", "foret conservation"],
  ["accent-umlaut", "Über Systems", "uber systems"],
  ["accent-tilde", "Niño Studies", "nino studies"],
  ["accent-ring", "Ångström Measurement", "angstrom measurement"],
  ["accent-cedilla", "Façade Design", "facade design"],
  ["compatibility-ligature", "Oﬃce Management", "office management"],
  ["compatibility-width", "Ｆｕｌｌ Width", "full width"],
  ["camel-case", "ReadingComprehension", "reading comprehension"],
  ["query-camel-case", "Reading Comprehension", "readingComprehension"],
  ["digits", "Module 2048", "2048 module"],
  ["nonbreaking-hyphen", "Reading‑Comprehension", "reading comprehension"],
  ["en-dash", "Reading–Comprehension", "reading comprehension"],
  ["em-dash", "Reading—Comprehension", "reading comprehension"],
  ["apostrophe", "Reader's Guide", "reader s guide"],
  ["curly-apostrophe", "Reader’s Guide", "reader s guide"],
  ["ampersand", "Reading & Comprehension", "reading comprehension"],
  ["parentheses", "Reading (Comprehension)", "reading comprehension"],
  ["brackets", "Reading [Comprehension]", "reading comprehension"],
  ["period", "Reading.Comprehension", "reading comprehension"],
  ["colon", "Reading:Comprehension", "reading comprehension"],
  ["backslash", "Reading\\Comprehension", "reading comprehension"],
  ["carriage-return", "Reading\r\nComprehension", "reading comprehension"],
  ["narrow-nbsp", "Reading\u202fComprehension", "reading comprehension"],
  ["zero-width-space", "Reading\u200bComprehension", "reading comprehension"],
  ["greek", "Ελληνική Γλώσσα", "ελληνικη γλωσσα"],
  ["cyrillic", "Русский Язык", "русский язык"],
  ["arabic", "اللغة العربية", "اللغة العربية"],
  ["hebrew", "שפה עברית", "שפה עברית"],
  ["chinese", "阅读理解", "阅读理解"],
  ["japanese", "読解 学習", "読解 学習"],
  ["korean", "읽기 이해", "읽기 이해"],
  ["emoji-boundary", "Reading 📚 Comprehension", "reading comprehension"],
  ["math-boundary", "Reading + Comprehension", "reading comprehension"],
  ["stopwords-label", "The Science of Reading", "science reading"],
  ["stopwords-only", "The", "the"],
  ["filler-query", "Reading Comprehension", "reading for the comprehension"],
];
describe("functional search: Unicode and token boundaries", () => {
  it.each(normalizationCases)(
    "NORMALIZE-%s | label=%s query=%s",
    (_id, label, query) => {
      const index = new EntitySearchIndex(
        labelledStore([
          { id: "target", label },
          { id: "noise", label: "ZZQV Unrelated" },
        ]),
      );
      expect(
        index.find({ text: query, fields: ["name"] }).rows.map((r) => r.iri),
      ).toEqual([iri("target")]);
      expect(index.search(query)[0]?.iri).toBe(iri("target"));
    },
  );
  it.each(["", " ", "\t\r\n", "!!!", "[]{}", "📚", "\u0301"])(
    "EMPTY-%j has no Find matches",
    (text) => {
      const index = new EntitySearchIndex(
        labelledStore([{ id: "target", label: "Reading" }]),
      );
      expect(index.find({ text }).total).toBe(0);
      expect(index.matchingIris({ text })).toEqual([]);
    },
  );
  it("blank resource input lists eligible choices", () => {
    const index = new EntitySearchIndex(
      labelledStore([
        { id: "class", label: "Reading" },
        { id: "person", label: "Reader", kind: "Individual" },
      ]),
    );
    expect(index.search("", true).map((r) => r.iri)).toEqual([iri("class")]);
    expect(index.search(" ", false, [iri("class")]).map((r) => r.iri)).toEqual([
      iri("person"),
    ]);
  });
  it.each([
    ["Café", "coffee"],
    ["Straße", "strasse"],
    ["Москва", "Moscow"],
    ["東京", "Tokyo"],
    ["Reading", "zzqvopaque"],
    ["cart", "art"],
  ])(
    "NEGATIVE label=%s does not match query=%s without semantic scores",
    (label, text) => {
      const index = new EntitySearchIndex(
        labelledStore([{ id: "target", label }]),
      );
      expect(index.find({ text, fields: ["name"] }).rows).toEqual([]);
    },
  );
});

// Change characters at the start: these cannot pass accidentally as prefixes.
const fuzzyCases = [3, 4, 7, 8, 12].flatMap((length) => {
  const query = "abcdefghijklm".slice(0, length);
  return [0, 1, 2, 3].map((distance) => ({
    id: `FUZZY-length${length}-edits${distance}`,
    query,
    label: "zqx".slice(0, distance) + query.slice(distance),
    matches: distance <= (length < 4 ? 0 : length <= 7 ? 1 : 2),
  }));
});
describe("functional search: bounded typo tolerance", () => {
  it.each(fuzzyCases)(
    "$id | $query -> $label matches=$matches",
    ({ query, label, matches }) => {
      const index = new EntitySearchIndex(
        labelledStore([{ id: "target", label }]),
      );
      expect(
        index.find({ text: query, fields: ["name"] }).rows.map((r) => r.iri),
      ).toEqual(matches ? [iri("target")] : []);
    },
  );
  it.each([
    ["abc", "xabc", false],
    ["abcd", "xabcd", true],
    ["abcdefg", "xyabcdefg", false],
    ["abcdefgh", "xyabcdefgh", true],
    ["abcdefgh", "xyzabcdefgh", false],
    ["abcd", "acd", true],
    ["abcdefgh", "abefgh", true],
    ["abcdefgh", "afgh", false],
  ])("EDIT query=%s label=%s matches=%s", (text, label, matches) => {
    const index = new EntitySearchIndex(
      labelledStore([{ id: "target", label }]),
    );
    expect(index.find({ text, fields: ["name"] }).total).toBe(matches ? 1 : 0);
  });
  it("precise matches precede fuzzy-only matches even with much stronger semantic evidence", () => {
    const index = new EntitySearchIndex(
      labelledStore([
        { id: "typo", label: "Xead" },
        { id: "precise", label: "Book Read" },
      ]),
    );
    expect(
      index
        .find({ text: "read", fields: ["name"] }, new Map([["Xead", 0.99]]))
        .rows.map((r) => r.iri),
    ).toEqual([iri("precise"), iri("typo")]);
  });
});
