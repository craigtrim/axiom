import { expect, it } from "vitest";
import { extendControl, extendRelations } from "../../src/shared/entity-extend";
import type { Kind } from "../../src/domain/model";
const matrix: [Kind, string[]][] = [
  ["Class", ["subclass", "sibling", "instance"]],
  ["Defined", ["subclass", "sibling", "instance"]],
  ["ObjectProperty", ["subproperty"]],
  ["DataProperty", ["subproperty"]],
  ["AnnotationProperty", ["subproperty"]],
  ["Individual", []],
  ["Resource", []],
  ["Datatype", []],
  ["Intersection", []],
];
it.each(matrix)("offers only valid relations for %s", (kind, expected) => {
  expect(extendRelations(kind).map((r) => r.door)).toEqual(expected);
  if (kind.endsWith("Property"))
    expect(extendRelations(kind)[0].kind).toBe(kind);
});
for (const [kind, relations] of matrix) {
  for (const narrow of [false, true]) {
    it.each([
      "",
      "  ",
      "https://example.test/a",
      "rdfs:label",
      "/term/i",
      "^term",
      "a|b",
      "x".repeat(257),
    ])(`${kind} narrow=${narrow} withdraws an invalid synonym %s`, (query) => {
      const control = extendControl(kind, query, "available", narrow);
      expect(control.synonym).toBe(false);
      expect(control.form).toBe(relations.length ? "folded" : "empty");
    });
    it.each(["label", "exists", "available"] as const)(
      `${kind} narrow=${narrow} keeps %s synonyms available`,
      (status) => {
        expect(extendControl(kind, "new term", status, narrow).form).toBe(
          narrow ? "folded" : relations.length ? "split" : "main",
        );
      },
    );
    it(`${kind} narrow=${narrow} withholds editing when the subject is unavailable`, () => {
      expect(extendControl(kind, "new term", undefined, narrow).form).toBe(
        relations.length ? "folded" : "empty",
      );
    });
  }
}
