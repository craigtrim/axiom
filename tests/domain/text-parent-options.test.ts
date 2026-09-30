import { describe, expect, it } from "vitest";
import {
  textParentOptions,
  selectionContext,
} from "../../src/renderer/text-parent-options";
import { buildStore } from "../../src/domain/fixture";
import { textAnalysisDraft } from "../../src/domain/text-analysis-authoring";
import type { Snapshot } from "../../src/shared/protocol";
import { Model } from "flexlayout-react";
import {
  setTextEntitySplit,
  textEntitySplit,
  textEntityWeights,
} from "../../src/renderer/text-entity-split";

describe("text entity parent picker", () => {
  const store = buildStore(0),
    entities = [...store.entities.values()] as Snapshot["entities"];
  it("groups phrase matches before assistant results and excludes selected or repeated IRIs", () => {
    const preview = textAnalysisDraft(store, "Smoked Pizza", 1);
    const pizza = preview.parents.find((p) => p.label === "Pizza")!;
    expect(pizza).toBeDefined();
    const suggestions = [
      { value: pizza.iri },
      { value: entities.find((e) => (e.label || e.name) === "Food")!.iri },
    ];
    const rows = textParentOptions(
      entities,
      [],
      "",
      preview.parents,
      suggestions,
      "Codex",
    );
    expect(rows[0]).toMatchObject({ iri: pizza.iri, group: "From the phrase" });
    expect(rows.filter((r) => r.iri === pizza.iri)).toHaveLength(1);
    expect(rows.find((r) => r.group === "Suggested by Codex")?.label).toBe(
      "Food",
    );
    expect(rows.filter((r) => r.group === "Existing classes")).toHaveLength(8);
    expect(
      textParentOptions(
        entities,
        [{ iri: pizza.iri }],
        "",
        preview.parents,
        suggestions,
        "Codex",
      ).some((r) => r.iri === pizza.iri),
    ).toBe(false);
    expect(
      textAnalysisDraft(store, "Pizzazz", 1).parents.some(
        (p) => p.iri === pizza.iri,
      ),
    ).toBe(false);
  });
  it("offers explicit creation only for new labels, including created-parent duplicates", () => {
    expect(
      textParentOptions(entities, [], " PIZZA ", [], [], "Claude").some(
        (p) => !p.iri,
      ),
    ).toBe(false);
    expect(
      textParentOptions(entities, [], " Smoked Pizza ", [], [], "Claude").at(
        -1,
      ),
    ).toEqual({ label: "Smoked Pizza", group: "Create" });
    expect(
      textParentOptions(
        entities,
        [
          {
            create: {
              label: "Smoked Pizza",
              comment: "",
              parents: [],
              manualParents: true,
            },
          },
        ],
        "smoked pizza",
        [],
        [],
        "Claude",
      ),
    ).toEqual([]);
  });
  it("retains the selected occurrence's source line and falls back when it cannot be located", () => {
    const text = "First: Smoked Pizza\nSecond: Smoked Pizza today";
    expect(
      selectionContext(text, "Smoked Pizza", text.lastIndexOf("Smoked")),
    ).toEqual({ before: "Second: ", after: " today" });
    expect(selectionContext(text, "Missing")).toEqual({
      before: "",
      after: "",
    });
  });
  it("uses a bounded split and restores the 52 percent default without changing other panes", () => {
    const model = Model.fromJson({
      global: {},
      layout: {
        type: "row",
        children: [
          {
            type: "row",
            children: [
              {
                type: "tabset",
                weight: 48,
                children: [
                  {
                    type: "tab",
                    id: "textanalysis",
                    component: "textanalysis",
                  },
                ],
              },
              {
                type: "tabset",
                weight: 52,
                children: [
                  {
                    type: "tab",
                    id: "textentities",
                    component: "textentities",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(textEntitySplit(model)).toBeDefined();
    expect(textEntityWeights(model, 0)).toEqual([78, 22]);
    expect(textEntityWeights(model, 100)![0]).toBeCloseTo(22);
    expect(textEntityWeights(model, 100)![1]).toBeCloseTo(78);
    setTextEntitySplit(model, 55);
    expect(textEntitySplit(model)!.lower.getWeight()).toBeCloseTo(55);
    setTextEntitySplit(model, 52);
    expect(textEntitySplit(model)!.lower.getWeight()).toBeCloseTo(52);
  });
});
