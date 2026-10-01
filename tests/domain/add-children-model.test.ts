import { describe, expect, it } from "vitest";
import { childSuggestions } from "../../src/renderer/add-children-model";
import {
  selectVisibleSuggestions,
  visibleSuggestions,
} from "../../src/renderer/suggestion-workbench-model";
import type { TaxonomyHistoryEntry } from "../../src/shared/taxonomy-assistant";
const entry = (labels = ["Water vehicle", "Air vehicle", "Car"]) =>
  ({
    applied: [1],
    response: {
      issues: [
        null,
        null,
        "An entity with this label or normalized name already exists. It will not be duplicated or moved.",
      ],
      result: {
        suggestions: labels.map((label) => ({
          label,
          definition: "A transport category",
          reason: "Rationale only",
          parentIri: "urn:vehicle",
          kind: "class",
        })),
      },
    },
  }) as TaxonomyHistoryEntry;

describe("Add Children review model", () => {
  it("retains original service indices when normalized labels collide", () => {
    const value = entry(["Water vehicle", "Water-vehicle", "Air vehicle"]);
    value.applied = [];
    value.response!.issues = [
      null,
      "This duplicates another suggestion.",
      null,
    ];
    expect(childSuggestions(value).map((r) => [r.id, r.index])).toEqual([
      ["water vehicle", 0],
      ["air vehicle", 2],
    ]);
  });
  it("keeps distinct Unicode labels distinct", () => {
    const value = entry(["航空", "车辆"]);
    value.applied = [];
    value.response!.issues = [];
    expect(childSuggestions(value)).toHaveLength(2);
  });
  it("gives recorded additions precedence over subsequent duplicate validation", () => {
    const value = entry();
    value.response!.issues[1] = value.response!.issues[2];
    expect(childSuggestions(value).map((r) => r.status)).toEqual([
      "available",
      "added",
      "exists",
    ]);
  });
  it("never treats invalid parent or kind as available or as an existing entity", () => {
    const value = entry();
    value.response!.issues[0] = "The proposal targets a different parent.";
    expect(childSuggestions(value)[0].status).toBe("unavailable");
    expect(
      selectVisibleSuggestions(new Set(), childSuggestions(value), true).size,
    ).toBe(0);
  });
  it("filters by status and case-insensitive label or definition, without searching rationale", () => {
    const rows = childSuggestions(entry());
    expect(
      visibleSuggestions(rows, "all", " AIR ", null).map((r) => r.label),
    ).toEqual(["Air vehicle"]);
    expect(
      visibleSuggestions(rows, "available", "transport", null),
    ).toHaveLength(1);
    expect(visibleSuggestions(rows, "exists", "water", null)).toEqual([]);
    expect(visibleSuggestions(rows, "all", "Rationale", null)).toEqual([]);
    expect(rows).toHaveLength(3);
  });
  it("orders status groups and restores the retained proposal order without mutating it", () => {
    const rows = childSuggestions(entry());
    expect(
      visibleSuggestions(rows, "all", "", {
        column: "label",
        direction: "ascending",
      }).map((r) => r.index),
    ).toEqual([1, 2, 0]);
    expect(
      visibleSuggestions(rows, "all", "", {
        column: "status",
        direction: "descending",
      }).map((r) => r.index),
    ).toEqual([2, 1, 0]);
    expect(
      visibleSuggestions(rows, "all", "", null).map((r) => r.index),
    ).toEqual([0, 1, 2]);
  });
  it("selects only visible available rows, preserving hidden selections and protecting duplicates", () => {
    const value = entry();
    value.applied = [];
    const rows = childSuggestions(value),
      hidden = new Set(["water vehicle"]);
    const filtered = visibleSuggestions(rows, "all", "Air", null);
    const selected = selectVisibleSuggestions(hidden, filtered, true);
    expect([...selected]).toEqual(["water vehicle", "air vehicle"]);
    expect([...selectVisibleSuggestions(selected, filtered, false)]).toEqual([
      "water vehicle",
    ]);
    expect([...selectVisibleSuggestions(new Set(), rows, true)]).toEqual([
      "water vehicle",
      "air vehicle",
    ]);
    expect([...hidden]).toEqual(["water vehicle"]);
  });
});

it("keeps labels ascending within equal status groups even when status is descending", () => {
  const value = entry(["Water vehicle", "Air vehicle", "Car"]);
  value.applied = [];
  expect(
    visibleSuggestions(childSuggestions(value), "all", "", {
      column: "status",
      direction: "descending",
    }).map((row) => row.label),
  ).toEqual(["Car", "Air vehicle", "Water vehicle"]);
});
