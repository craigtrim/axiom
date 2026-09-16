import { it, expect } from "vitest";
import { buildStore } from "../../src/domain/fixture";
import { buildEmptyStore } from "../../src/domain/workspace";
import { NS, THING, type Restriction } from "../../src/domain/model";
import {
  taxonomyContext,
  applyTaxonomySuggestions,
} from "../../src/domain/taxonomy-assistant";
import {
  buildTaxonomyPrompt,
  parseTaxonomyReply,
} from "../../src/shared/taxonomy-assistant";
import { assistantArguments } from "../../src/main/local-assistant";
const reply =
  "Summary: Familiar types of meat pizza.\nSuggestions:\n1. Pepperoni pizza\nDescription: Pizza topped with pepperoni.\nReason: A familiar type distinguished by its meat topping.";
it("asks about subject knowledge with readable context instead of ontology records", () => {
  const c = taxonomyContext(
      buildStore(),
      NS.pizza + "MeatyPizza",
      "children",
      3,
    ),
    p = buildTaxonomyPrompt(c);
  expect(p).toContain('Suggest useful additional types of "Meaty Pizza".');
  expect(p).toContain("Use your general subject knowledge");
  expect(p).toContain('"Meaty Pizza" is a kind of "Pizza"');
  expect(p).toContain('"Pizza" is a kind of "Food"');
  expect(p).toContain("at least one value is");
  expect(p).toContain("Matching definition combines all of:");
  expect(p).not.toContain('has the same meaning as "Pizza"');
  expect(p).not.toMatch(/rdfs:|parentIri|datasetEpoch|"namespace"|https?:\/\//);
});
it("preserves multiple parents, descendant levels, roots and all recorded connections", () => {
  const store = buildEmptyStore(),
    a = store.createClass("Vehicle", THING),
    b = store.createClass("Machine", THING),
    c = store.createClass("Car", a),
    d = store.createClass("Sedan", c);
  store.entities.get(c)!.parents.push(b);
  store.rebuildSchema();
  const p = buildTaxonomyPrompt(taxonomyContext(store, c, "children", 0));
  expect(p).toContain('"Car" is a kind of "Vehicle"');
  expect(p).toContain('"Car" is a kind of "Machine"');
  expect(p).toContain('"Machine" is a kind of "Thing"');
  expect(p).toContain('"Sedan" (1 step below the topic)');
  expect(p).toContain('"Sedan" is a kind of "Car"');
  expect(p).toContain('Broadest categories recorded: "Thing"');
});
it.each([
  [
    {
      shape: "restriction",
      property: "urn:p",
      quantifier: "some",
      fillers: ["urn:meat"],
    },
    '"topping": at least one value is "meat"',
  ],
  [
    {
      shape: "restriction",
      property: "urn:p",
      quantifier: "only",
      fillers: ["urn:meat"],
    },
    '"topping": every value is "meat" (does not require a value to exist)',
  ],
  [
    {
      shape: "restriction",
      property: "urn:p",
      quantifier: "value",
      fillers: ["urn:meat"],
    },
    '"topping": includes the specific value "meat"',
  ],
  [
    {
      shape: "restriction",
      property: "urn:p",
      quantifier: "min",
      cardinality: 1,
      fillers: [],
    },
    '"topping": at least 1 value',
  ],
  [
    {
      shape: "restriction",
      property: "urn:p",
      quantifier: "max",
      cardinality: 2,
      fillers: [],
    },
    '"topping": at most 2 values',
  ],
  [
    {
      shape: "restriction",
      property: "urn:p",
      quantifier: "exactly",
      cardinality: 3,
      fillers: [],
    },
    '"topping": exactly 3 values',
  ],
  [{ shape: "not", fillers: ["urn:meat"] }, 'excludes "meat"'],
] as [Restriction, string][])(
  "preserves condition meaning %#",
  (restriction, phrase) => {
    const c = taxonomyContext(buildEmptyStore(), THING, "children", 0);
    c.names = { "urn:p": "topping", "urn:meat": "meat" };
    c.selected.restrictions = [restriction];
    expect(buildTaxonomyPrompt(c)).toContain(phrase);
  },
);
it("preserves matching definitions and disjointness while distinguishing duplicate display names", () => {
  const c = taxonomyContext(buildEmptyStore(), THING, "children", 0);
  c.names = { "urn:a": "Same", "urn:b": "Same" };
  c.selected.equivalents = [{ shape: "class", fillers: ["urn:a"] }];
  c.selected.disjoint = ["urn:b"];
  const p = buildTaxonomyPrompt(c);
  expect(p).toContain('has the same meaning as "Same (reference 1)"');
  expect(p).toContain('Does not overlap with: "Same (reference 2)"');
});
it("keeps quoted multiline descriptions as data", () => {
  const c = taxonomyContext(buildEmptyStore(), THING, "children", 0);
  c.selected.comment = 'Description with a quote " and a new\nline';
  expect(buildTaxonomyPrompt(c)).toContain(JSON.stringify(c.selected.comment));
});
it("binds names and explanations to the captured parent and creates identifiers only when applied", () => {
  const store = buildEmptyStore(),
    parent = store.createClass("Meaty pizza", THING),
    c = taxonomyContext(store, parent, "children", 0);
  const result = parseTaxonomyReply(reply, c);
  expect(result.suggestions[0]).toMatchObject({
    kind: "class",
    parentIri: parent,
    label: "Pepperoni pizza",
  });
  expect(store.classCount).toBe(2);
  const [iri] = applyTaxonomySuggestions(
    store,
    parent,
    "children",
    result.suggestions,
  );
  expect(iri).toBe(store.ontology.namespace + "PepperoniPizza");
  expect(store.entities.get(iri)?.parents).toEqual([parent]);
});
it("assigns instance membership locally using the same plain response", () => {
  const c = taxonomyContext(buildEmptyStore(), THING, "instances", 0);
  const result = parseTaxonomyReply(
    reply.replace("Pepperoni pizza", "Apollo 15 rover"),
    c,
  );
  expect(result.suggestions[0]).toMatchObject({
    kind: "individual",
    parentIri: THING,
    label: "Apollo 15 rover",
  });
});
it.each([
  reply,
  reply
    .replace("1. Pepperoni pizza", "1) **Pepperoni pizza**")
    .replace("Description:", "**Description:**")
    .replace("Reason:", "**Why:**"),
  reply
    .replace("1. Pepperoni pizza", "- Name: Pepperoni pizza")
    .replace("Description:", "- Definition:")
    .replace("Reason:", "- Reason:"),
  reply
    .replace("Summary:", "## Summary\n")
    .replace("Suggestions:", "## Suggestions")
    .replaceAll("\n", "\r\n"),
  "```text\n" + reply + "\n```",
])("parses common text and Markdown outline formatting %#", (raw) => {
  const c = taxonomyContext(buildEmptyStore(), THING, "children", 0);
  expect(parseTaxonomyReply(raw, c).suggestions[0].label).toBe(
    "Pepperoni pizza",
  );
});
it("retains multiline descriptions and reasons", () => {
  const c = taxonomyContext(buildEmptyStore(), THING, "children", 0);
  const r = parseTaxonomyReply(
    reply.replace("Reason:", "A second description sentence.\nReason:") +
      "\nA second reason sentence.",
    c,
  );
  expect(r.suggestions[0].definition).toContain("second description");
  expect(r.suggestions[0].reason).toContain("second reason");
});
it("accepts an explicit empty answer without inventing a suggestion", () => {
  const c = taxonomyContext(buildEmptyStore(), THING, "children", 0);
  expect(
    parseTaxonomyReply(
      "Summary: All relevant categories are already listed.\nSuggestions: None.",
      c,
    ),
  ).toEqual({
    summary: "All relevant categories are already listed.",
    suggestions: [],
  });
});
it.each([
  null,
  "",
  "A vague response without a list.",
  reply.replace(/Reason:.*$/, ""),
  reply.replace(/Description:.*\n/, ""),
  '{"summary":"x","suggestions":[]}',
  "Summary: x\nSuggestions: None.\n" + reply.split("Suggestions:\n")[1],
  reply.replace("Pepperoni pizza", "!"),
  "Summary: x\nSuggestions:\n" +
    Array.from(
      { length: 13 },
      (_, i) => i + 1 + ". Name\nDescription: Meaning.\nReason: Fit.",
    ).join("\n"),
])("rejects ambiguous or incomplete replies %#", (raw) => {
  const c = taxonomyContext(buildEmptyStore(), THING, "children", 0);
  expect(() => parseTaxonomyReply(raw, c)).toThrow();
});
it("omits output schemas for text replies while retaining constrained runner arguments", () => {
  const args = assistantArguments("codex", "job", false, null);
  expect(args).not.toContain("--output-schema");
  expect(args).toContain("--output-last-message");
  expect(args).toContain("read-only");
  expect(assistantArguments("claude", "job", false, null)).not.toContain(
    "--json-schema",
  );
});
