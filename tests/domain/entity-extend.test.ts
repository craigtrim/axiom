import { expect, it } from "vitest";
import {
  extendControl,
  extendRelations,
  extendGroup,
  readExtendPreferences,
  type ExtendAction,
} from "../../src/shared/entity-extend";
import { THING, type Kind } from "../../src/domain/model";
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
  it.each([
    "",
    "  ",
    "https://example.test/a",
    "rdfs:label",
    "/term/i",
    "^term",
    "a|b",
    "x".repeat(257),
  ])(`${kind} withdraws an invalid synonym %s`, (query) => {
    const control = extendControl(kind, query, "available");
    expect(control.synonym).toBe(false);
    expect(control.primary).toBe(relations[0]);
    expect(control.form).toBe(
      relations.length > 1 ? "split" : relations.length ? "main" : "empty",
    );
  });
  it.each(["label", "exists", "available"] as const)(
    `${kind} keeps %s synonyms available`,
    (status) => {
      const control = extendControl(kind, "new term", status);
      expect(control.primary).toBe("synonym");
      expect(control.form).toBe(relations.length ? "split" : "main");
    },
  );
  it(`${kind} withholds synonyms when the subject is unavailable`, () => {
    expect(extendControl(kind, "new term", undefined).form).toBe(
      relations.length > 1 ? "split" : relations.length ? "main" : "empty",
    );
  });
  it.each([
    "synonym",
    "subclass",
    "sibling",
    "instance",
    "subproperty",
  ] as ExtendAction[])(
    `${kind} resolves preferred %s against available actions`,
    (preferred) => {
      expect(
        extendControl(kind, "new term", "available", preferred).primary,
      ).toBe(
        preferred === "synonym" || relations.includes(preferred)
          ? preferred
          : "synonym",
      );
    },
  );
}
it("falls back on owl:Thing without altering the remembered sibling preference", () => {
  const preferences = readExtendPreferences({ classes: "sibling" });
  const control = extendControl(
    "Class",
    "Thing",
    "label",
    preferences.classes,
    THING,
  );
  expect(control.primary).toBe("synonym");
  expect(control.relations.map((r) => r.door)).toEqual([
    "subclass",
    "instance",
  ]);
  expect(
    extendControl("Class", "", "available", preferences.classes, THING).primary,
  ).toBe("subclass");
  expect(preferences.classes).toBe("sibling");
  expect(
    extendControl(
      "Defined",
      "new term",
      "available",
      preferences.classes,
      "https://example.test/Class",
    ).primary,
  ).toBe("sibling");
});
it("shares action memory within classes and properties while separating individuals", () => {
  expect(["Class", "Defined"].map((k) => extendGroup(k as Kind))).toEqual([
    "classes",
    "classes",
  ]);
  expect(
    ["ObjectProperty", "DataProperty", "AnnotationProperty"].map((k) =>
      extendGroup(k as Kind),
    ),
  ).toEqual(["properties", "properties", "properties"]);
  expect(extendGroup("Individual")).toBe("individuals");
  expect(extendGroup("Resource")).toBe("other");
});
it("restores only supported preferences", () => {
  const preferences = {
    classes: "instance",
    properties: "subproperty",
    individuals: "synonym",
  };
  expect(
    readExtendPreferences(JSON.parse(JSON.stringify(preferences))),
  ).toEqual(preferences);
  expect(
    readExtendPreferences({
      classes: "subproperty",
      properties: "instance",
      individuals: "sibling",
      other: "subclass",
      injected: "synonym",
    }),
  ).toEqual({});
  expect(readExtendPreferences(null)).toEqual({});
  expect(readExtendPreferences([])).toEqual({});
});
