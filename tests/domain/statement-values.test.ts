// craigtrim/axiom#94: imported generic RDF properties must not block ordinary label edits.
import { expect, it } from "vitest";
import { NS, type Triple } from "../../src/domain/model";
import {
  completeEditorStatement,
  resourcePredicate,
} from "../../src/shared/statement-values";
const literal = (predicate: string, value: string): Triple => ({
  subject: "https://example.org/Subject",
  predicate,
  object: { literal: true, value, language: "en" },
});
it.each(["label", "comment"])(
  "accepts a changed rdfs:%s when rdf:Property was projected as ObjectProperty",
  (name) => {
    const predicate = NS.rdfs + name;
    expect(resourcePredicate(predicate, "ObjectProperty")).toBe(false);
    expect(
      completeEditorStatement(
        literal(predicate, "Edited text"),
        [literal(predicate, "Original text")],
        "ObjectProperty",
      ),
    ).toBe(true);
  },
);
it.each([NS.rdfs + "subClassOf", "https://example.org/relatedTo"])(
  "still blocks unfinished literal input for resource predicate %s",
  (predicate) => {
    const original = literal(predicate, "Imported malformed assertion");
    expect(resourcePredicate(predicate, "ObjectProperty")).toBe(true);
    expect(
      completeEditorStatement(original, [original], "ObjectProperty"),
    ).toBe(true);
    expect(
      completeEditorStatement(
        literal(predicate, "Unresolved resource"),
        [original],
        "ObjectProperty",
      ),
    ).toBe(false);
    expect(
      completeEditorStatement(
        {
          ...original,
          object: { literal: false, value: "https://example.org/Parent" },
        },
        [original],
        "ObjectProperty",
      ),
    ).toBe(true);
  },
);
