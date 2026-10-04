import { describe, expect, it } from "vitest";
import { menuKeys } from "../../src/shared/menu-keys";

describe("context menu access keys", () => {
  it("uses the same familiar letters in each editor", () => {
    expect(menuKeys(["Cut", "Copy", "Find", "Paste", "Add entity"])).toEqual([
      "T",
      "C",
      "F",
      "P",
      "A",
    ]);
  });
  it("reserves familiar keys ahead of fallback labels", () => {
    expect(
      menuKeys(["Create", "Copy", "Format Document", "Find", "Add entity"]),
    ).toEqual(["R", "C", "D", "F", "A"]);
  });
  it.each([
    ["Cut", "Copy", "Paste"],
    ["Undo", "Redo", "Select All", "Find", "Format Document"],
    ["Minimap", "Render Characters", "Vertical size", "Slider", "Side"],
    ["Copy", "Copy", "Copy"],
    ["", "---", "123"],
  ])("assigns distinct letters present in their labels: %j", (...labels) => {
    const keys = menuKeys(labels);
    const assigned = keys.filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
    keys.forEach((key, i) => {
      if (key) expect(labels[i].toUpperCase()).toContain(key);
    });
  });
  it("does not invent letters when none remain", () => {
    expect(menuKeys(["A", "A", ""])).toEqual(["A", undefined, undefined]);
  });
});
