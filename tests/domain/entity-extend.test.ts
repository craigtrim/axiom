import { expect, it } from "vitest";
import { extendControl, extendRelations } from "../../src/shared/entity-extend";
import type { Kind } from "../../src/domain/model";
const matrix: [Kind, string[]][] = [
  ["Class", ["subclass", "instance"]],
  ["Defined", ["subclass", "instance"]],
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
    it.each(["label", "exists", undefined] as const)(
      `${kind} narrow=${narrow} withdraws %s synonyms`,
      (status) => {
        expect(extendControl(kind, "new term", status, narrow).form).toBe(
          relations.length ? "folded" : "empty",
        );
      },
    );
    it(`${kind} narrow=${narrow} shows the right form before and after adding`, () => {
      expect(extendControl(kind, " new term ", "available", narrow).form).toBe(
        narrow ? "folded" : relations.length ? "split" : "main",
      );
      expect(
        extendControl(kind, "new term", "available", narrow, true).form,
      ).toBe(relations.length ? "folded" : "empty");
    });
  }
}
