// craigtrim/axiom#136: explanations must distinguish matching terms from covered gaps.
import { expect, it } from "vitest";
import {
  indexSpanRules,
  textEntities,
  type MutatocToken,
} from "../../src/main/text-analysis-spans";
import {
  textEntityHover,
  textCoveredLabels,
  textMatchExplanation,
  type TextEntity,
  type TextAnalysisResult,
  type TextAnalysisConcept,
} from "../../src/shared/text-analysis";
const concept = (iri: string, label: string): TextAnalysisConcept => ({
  iri,
  label,
  kind: "Class",
  comment: "",
  parents: [],
  taxonomy: true,
});
const entity: TextEntity = {
  start: 0,
  end: 21,
  key: "ontology:owlclass_123",
  label: "owlclass_123",
  source: "ontology",
  method: "exact",
};
const result: TextAnalysisResult = {
  text: "Psychology Behavioral",
  canonical: "owlclass_123",
  entities: [entity],
  milliseconds: 0,
  datasetEpoch: 1,
  version: 1,
  concepts: {
    owlclass_123: [
      concept("https://one/#x", "Behavioral Psychology"),
      concept("https://two/#x", "Behavior Study"),
    ],
    psychology: [
      concept("https://one/#p", "Psychology"),
      concept("https://two/#p", "Mind Study"),
    ],
  },
};
it("shows all actual entry labels and plain exact wording without internal names", () => {
  expect(textEntityHover(result, entity)).toBe(
    "Behavioral Psychology  \nBehavior Study  \nExact phrase  \nCtrl\\+click for Details",
  );
  expect(textEntityHover(result, entity)).not.toMatch(
    /owlclass_|exact|spans|Covers:/,
  );
});
it("shares span wording and resolves recursive covered names without repetitions", () => {
  const span = {
    ...entity,
    method: "spans",
    matchedWords: ["Psychology", "Behavioral"],
    covered: ["psychology", "psychology", "owlclass_123", "unresolved"],
  };
  expect(textMatchExplanation(span)).toBe(
    "Words found near each other: Psychology, Behavioral",
  );
  expect(textCoveredLabels(result, span)).toEqual([
    "Psychology",
    "Mind Study",
    "unresolved",
  ]);
  expect(textEntityHover(result, span)).toContain(
    "Covers: Psychology, Mind Study, unresolved",
  );
});
it("uses neutral wording for missing provenance and unfamiliar methods, preserving annotation types", () => {
  expect(textMatchExplanation({ ...entity, method: "spans" })).toBe(
    "Words found near each other",
  );
  expect(textMatchExplanation({ ...entity, method: "hierarchy" })).toBe(
    "Ontology match",
  );
  const annotation = {
    ...entity,
    source: "model" as const,
    label: "PERSON",
    method: "ner",
    covered: ["psychology"],
  };
  expect(textEntityHover(result, annotation)).toBe(
    "PERSON  \nNamed entity  \nCtrl\\+click for Details",
  );
  expect(textEntityHover({ ...result, concepts: {} }, entity)).toContain(
    "owlclass\\_123",
  );
});
it("escapes label and matched-word markup and keeps label line breaks out of the fact layout", () => {
  const label = "[Open](command:evil) <img> &copy;\n# Heading *bold*";
  const hover = textEntityHover(
    { ...result, concepts: { owlclass_123: [concept("x", label)] } },
    { ...entity, method: "spans", matchedWords: ["[term](command:bad)"] },
  );
  expect(hover).toContain("\\[Open\\]\\(command:evil\\)");
  expect(hover).toContain("\\<img\\>");
  expect(hover).toContain("&amp;copy;");
  expect(hover).toContain("\\[term\\]\\(command:bad\\)");
  expect(hover.split("\n")).toHaveLength(3);
});
const rule = (content: string[]) => ({
  canon: "topic",
  content,
  distance: 4,
  forward: true,
  reverse: true,
});
it("does not guess which rule or repeated occurrence caused a span", () => {
  const text = "alpha gamma beta";
  const tokens: MutatocToken[] = [
    {
      text,
      x: 0,
      y: text.length,
      swaps: {
        canon: "topic",
        type: "spans",
        tokens: [
          { text: "alpha ", normal: "alpha", x: 0, y: 5 },
          { text: "gamma ", normal: "gamma", x: 6, y: 11 },
          { text: "beta", normal: "beta", x: 12, y: 16 },
        ],
      },
    },
  ];
  expect(
    textEntities(text, tokens, indexSpanRules({ alpha: [rule(["beta"])] }))[0]
      .matchedWords,
  ).toEqual(["alpha", "beta"]);
  expect(
    textEntities(
      text,
      tokens,
      indexSpanRules({ alpha: [rule(["beta"]), rule(["gamma", "beta"])] }),
    )[0].matchedWords,
  ).toBeUndefined();
  const repeated = "alpha alpha beta";
  tokens[0].text = repeated;
  tokens[0].swaps!.tokens[1] = { text: "alpha ", normal: "alpha", x: 6, y: 11 };
  expect(
    textEntities(
      repeated,
      tokens,
      indexSpanRules({ alpha: [rule(["beta"])] }),
    )[0].matchedWords,
  ).toBeUndefined();
});
it("walks nested matches in text order and keeps only distinct covered canonical names", () => {
  const text = "alpha beta";
  const matched = (
    canon: string,
    children: MutatocToken[] = [],
  ): MutatocToken => ({
    text,
    x: 0,
    y: 10,
    swaps: { canon, type: "exact", tokens: children },
  });
  expect(
    textEntities(text, [
      matched("outer", [
        matched("middle", [matched("inner")]),
        matched("inner"),
        matched("outer"),
      ]),
    ])[0].covered,
  ).toEqual(["middle", "inner"]);
});
