import { expect, it } from "vitest";
import { entity, THING } from "../../src/domain/model";
import {
  parentContext,
  buildParentPrompt,
  parseParentSuggestions,
  parentPromptLimit,
} from "../../src/shared/parent-suggestions";
import type { Snapshot } from "../../src/shared/protocol";
const base = "https://example.org/#";
const term = (id: string, label: string, parents: string[] = []) => ({
  ...entity(base + id, "Class"),
  name: label,
  parents: parents.map((p) => base + p),
  instances: 0,
  descendants: 0,
});
const snapshot = () =>
  ({
    ontology: { name: "Courses", namespace: base },
    version: 1,
    datasetEpoch: 2,
    entities: [
      term("Workplace", "Multiculturalism at Work"),
      term("Sociology", "Sociology"),
      term("Descendant", "Narrow workplace topic", ["Workplace"]),
      { ...term("Property", "A property"), kind: "ObjectProperty" },
      { ...term("Thing", "Thing"), iri: THING },
    ],
  }) as Snapshot;
it("offers meaning-based candidates without shared spelling and resolves IDs to the right IRI", () => {
  const context = parentContext(snapshot(), base + "Workplace");
  const sociology = context.classes.find((c) => c.label === "Sociology")!;
  const prompt = buildParentPrompt(context);
  expect(prompt).toContain("even when the names share no words");
  expect(prompt).toContain("Sociology");
  expect(prompt).not.toContain("A property");
  expect(
    parseParentSuggestions(
      {
        suggestions: [
          {
            value: sociology.id,
            reason: "Workplace cultures are a subject within sociology.",
          },
        ],
      },
      context,
    ),
  ).toEqual([
    {
      value: base + "Sociology",
      label: "Sociology",
      reason: "Workplace cultures are a subject within sociology.",
    },
  ]);
});
it("rejects invented IDs, self, existing parents and descendants including paths through expressions", () => {
  const s = snapshot();
  s.entities[0].parents = [base + "Sociology"];
  s.entities.push({
    ...term("Expression", "intersection", ["Workplace"]),
    kind: "Intersection",
  });
  s.entities[2].parents = [base + "Expression"];
  const context = parentContext(s, base + "Workplace");
  for (const c of context.classes) {
    expect(c.eligible).toBe(false);
    expect(() =>
      parseParentSuggestions(
        { suggestions: [{ value: c.id, reason: "Fits" }] },
        context,
      ),
    ).toThrow(/unavailable/);
  }
  expect(() =>
    parseParentSuggestions(
      { suggestions: [{ value: "c99999", reason: "Fits" }] },
      context,
    ),
  ).toThrow(/unknown class ID/);
});
it("keeps all classes in a 6,000-class catalog and shortens descriptions to fit", () => {
  const s = snapshot();
  s.entities = Array.from({ length: 6000 }, (_, i) => ({
    ...term(String(i), "Course topic " + i, i ? [String(i - 1)] : []),
    comment: "Description ".repeat(100),
  }));
  const context = parentContext(s, base + "0");
  const prompt = buildParentPrompt(context);
  expect(prompt.length).toBeLessThanOrEqual(parentPromptLimit);
  expect(prompt).toContain("Complete class catalog (6000 classes)");
  expect(prompt).toContain("Course topic 5999");
  expect(
    prompt.split("\n").filter((line) => line.startsWith('["c')),
  ).toHaveLength(6000);
});
