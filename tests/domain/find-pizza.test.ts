import { describe, expect, it } from "vitest";
import { buildStore } from "../../src/domain/fixture";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import {
  createFindEntity,
  previewFindCreation,
} from "../../src/domain/find-creation";
import { NS, THING } from "../../src/domain/model";
import { emptyFindDraft } from "../../src/shared/find-create";

describe("FIX-105 Pizza Find acceptance", () => {
  const store = buildStore(0),
    index = new EntitySearchIndex(store);
  it.each([
    ["Margherita", NS.pizza + "Margherita"],
    ["margherit", NS.pizza + "Margherita"],
    ["Marghertita", NS.pizza + "Margherita"],
    ["cheese topping", NS.pizza + "CheeseTopping"],
    ["Mozzarella Topping", NS.pizza + "MozzarellaTopping"],
  ])("names, prefixes and typos: %s", (text, expected) => {
    expect(
      index.find({ text, fields: ["name"], diagnostics: true }).rows[0].iri,
    ).toBe(expected);
  });
  it("universal is a scoped miss whose all-fields remedy finds Thing", () => {
    const result = index.find({
      text: "universal",
      fields: ["name"],
      kinds: ["classes"],
      diagnostics: true,
    });
    expect(result.total).toBe(0);
    expect(result.fields.find((f) => f.id === NS.rdfs + "comment")?.count).toBe(
      1,
    );
    expect(result.remedies?.find((r) => r.id === "fields")?.count).toBe(1);
    expect(
      index.find({ text: "universal", fields: ["*"], kinds: ["classes"] })
        .rows[0].iri,
    ).toBe(THING);
  });
  it("checks a duplicate Pizza against the store even when the query has no fields", async () => {
    const result = index.find({ text: "Pizza", fields: [], diagnostics: true });
    expect(result.total).toBe(0);
    const preview = await previewFindCreation(
      store,
      emptyFindDraft("Pizza"),
      1,
    );
    expect(preview.collisions.some((c) => c.iri === NS.pizza + "Pizza")).toBe(
      true,
    );
  });
  it("adds Astral Flatbread under Pizza without changing the baseline fixture and undoes it", () => {
    const fresh = buildStore(0),
      before = [...fresh.scan()].length;
    const iri = createFindEntity(
      fresh,
      { ...emptyFindDraft("Astral Flatbread"), parents: [NS.pizza + "Pizza"] },
      1,
    );
    expect(fresh.entities.get(iri)?.parents).toEqual([NS.pizza + "Pizza"]);
    expect(
      new EntitySearchIndex(fresh).find({
        text: "Astral Flatbread",
        diagnostics: true,
      }).rows[0].iri,
    ).toBe(iri);
    fresh.undo();
    expect([...fresh.scan()]).toHaveLength(before);
    expect(fresh.exists(iri)).toBe(false);
  });
});
