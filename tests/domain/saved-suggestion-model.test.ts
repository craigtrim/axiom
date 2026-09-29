import { describe, expect, it } from "vitest";
import { entity } from "../../src/domain/model";
import type { SuggestionRun } from "../../src/shared/suggestions";
import { savedSuggestions } from "../../src/renderer/saved-suggestion-model";
import {
  selectVisibleSuggestions,
  visibleSuggestions,
} from "../../src/renderer/suggestion-workbench-model";

describe("parent and synonym review rows", () => {
  it("distinguishes available parents, existing relations, recorded additions and deleted classes", () => {
    const target = entity("urn:target", "Class");
    target.parents = ["urn:existing", "urn:added"];
    const available = entity("urn:available", "Class");
    available.comment = "A broader category.";
    const run = {
      mode: "parents",
      iri: target.iri,
      applied: [2],
      values: ["available", "existing", "added", "deleted"].map((name) => ({
        value: "urn:" + name,
        label: name,
        reason: "Name match.",
      })),
    } as SuggestionRun;
    const rows = savedSuggestions(run, [
      target,
      available,
      entity("urn:existing", "Class"),
      entity("urn:added", "Class"),
    ]);
    expect(rows.map((r) => r.status)).toEqual([
      "available",
      "exists",
      "added",
      "unavailable",
    ]);
    expect(rows[0].definition).toBe("A broader category.");
    expect([...selectVisibleSuggestions(new Set(), rows, true)]).toEqual([
      "value:urn:available",
    ]);
  });

  it("preserves selection indices while sorting by distance and only disables recorded synonyms", () => {
    const run = {
      mode: "synonyms",
      iri: "urn:basic",
      label: "Basic English",
      applied: [0],
      values: ["English Basics", "Basic Engl.", "Advanced English"].map(
        (value) => ({
          value,
          label: value,
          reason: "A wording variation.",
        }),
      ),
      excluded: [
        { value: "BASIC ENG", reason: "Already recorded for this entity." },
      ],
    } as SuggestionRun;
    const rows = savedSuggestions(run, []);
    expect(rows.map((r) => r.status)).toEqual([
      "added",
      "available",
      "available",
      "exists",
    ]);
    const visible = visibleSuggestions(rows, "all", "", {
      column: "distance",
      direction: "descending",
    });
    const selected = selectVisibleSuggestions(new Set(), visible, true);
    expect(rows.filter((r) => selected.has(r.id)).map((r) => r.index)).toEqual([
      1, 2,
    ]);
    expect(visible.map((r) => r.distance)).toEqual(
      rows.map((r) => r.distance).sort((a, b) => b! - a!),
    );
  });

  it("hides zero distances and groups case variants without changing retained application indices", () => {
    const run = {
      mode: "synonyms",
      iri: "urn:history",
      label: "American History To 1877",
      applied: [3],
      values: [
        "American History To 1877",
        "American History to 1877",
        "US History to 1877",
        "us history TO 1877",
        "American History To 1877.",
      ].map((value) => ({
        value,
        label: value,
        reason: "Alternative wording.",
      })),
      excluded: [
        {
          value: "AMERICAN HISTORY TO 1877",
          reason: "Already recorded for this entity.",
        },
      ],
    } as SuggestionRun;
    const rows = savedSuggestions(run, []);
    expect(rows.map((r) => [r.index, r.status])).toEqual([
      [3, "added"],
      [4, "available"],
    ]);
    expect(rows.every((r) => r.distance! > 0)).toBe(true);
    expect(rows[1].distance).toBe(1);
    const selected = selectVisibleSuggestions(new Set(), rows, true);
    expect(rows.filter((r) => selected.has(r.id)).map((r) => r.index)).toEqual([
      4,
    ]);
  });
});
