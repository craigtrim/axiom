import { describe, expect, it } from "vitest";
import { Parser } from "n3";
import { NS, type Triple } from "../../src/domain/model";
import { turtleEvidence, turtleLines } from "../../src/renderer/quality-turtle";

const base = "https://quality.test/#";
const prefixes = Object.entries({ ...NS, "": base })
  .map(([prefix, iri]) => `@prefix ${prefix}: <${iri}> .`)
  .join("\n");

describe.each([
  ["evidence", turtleEvidence],
  ["preview", turtleLines],
] as const)("quality statement display %s", (_name, render) => {
  it.each([
    ["Course", 'Quotes " and backslash \\'],
    ["Course", "Line one\nLine two"],
    ["Course", "Line one\r\nLine two"],
    ["Course", "Tabbed\tlabel\b\f"],
    ["Course.", "Trailing dot in the exact identifier"],
    ["Course_é", "Café 日本語"],
  ])(
    "round trips %s and %j without changing the asserted RDF term",
    (name, value) => {
      const triple: Triple = {
        subject: base + name,
        predicate: NS.rdfs + "label",
        object: {
          literal: true,
          value,
          language: "en",
          datatype: NS.rdf + "langString",
        },
        graph: base + "Source.",
      };
      const result = new Parser({ format: "TriG" }).parse(
        prefixes + "\n" + render([triple], base),
      );
      expect(result).toHaveLength(1);
      expect(result[0].subject.value).toBe(triple.subject);
      expect(result[0].predicate.value).toBe(triple.predicate);
      expect(result[0].object.value).toBe(value);
      expect(result[0].object).toMatchObject({
        language: "en",
        datatype: { value: NS.rdf + "langString" },
      });
      expect(result[0].graph.value).toBe(triple.graph);
    },
  );
});
