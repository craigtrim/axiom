import { describe, expect, it } from "vitest";
import {
  singleHierarchySelection,
  selectHierarchyRow,
  pruneHierarchySelection,
} from "../../src/renderer/hierarchy-selection";

const rows = ["root", "parent", "child", "grandchild", "sibling", "other"];
describe("explicit hierarchy selection", () => {
  it("selects a parent without implicitly selecting any descendants", () => {
    expect(
      selectHierarchyRow(singleHierarchySelection(null), "parent", rows).ids,
    ).toEqual(["parent"]);
  });
  it("adds discontiguous nodes and removes a selected node with Ctrl", () => {
    let selection = singleHierarchySelection("parent");
    selection = selectHierarchyRow(selection, "other", rows, { toggle: true });
    expect(selection.ids).toEqual(["parent", "other"]);
    selection = selectHierarchyRow(selection, "parent", rows, { toggle: true });
    expect(selection.ids).toEqual(["other"]);
    expect(
      selectHierarchyRow(selection, "other", rows, { toggle: true }).ids,
    ).toEqual([]);
  });
  it("replaces a previous set on an ordinary click", () => {
    const selection = selectHierarchyRow(
      singleHierarchySelection("parent"),
      "other",
      rows,
      { toggle: true },
    );
    expect(selectHierarchyRow(selection, "child", rows)).toEqual(
      singleHierarchySelection("child"),
    );
  });
  it.each([
    ["parent", "sibling"],
    ["sibling", "parent"],
  ])("selects a visible range from %s to %s", (from, to) => {
    expect(
      selectHierarchyRow(singleHierarchySelection(from), to, rows, {
        range: true,
      }).ids,
    ).toEqual(rows.slice(1, 5));
  });
  it("shrinks a range while retaining its original anchor", () => {
    let selection = selectHierarchyRow(
      singleHierarchySelection("parent"),
      "other",
      rows,
      { range: true },
    );
    selection = selectHierarchyRow(selection, "child", rows, { range: true });
    expect(selection.ids).toEqual(["parent", "child"]);
    expect(selection.anchor).toBe("parent");
  });
  it("adds a range to discontiguous selections without duplicates", () => {
    const selection = selectHierarchyRow(
      { ids: ["other", "parent"], anchor: "parent", focus: "parent" },
      "child",
      rows,
      { range: true, toggle: true },
    );
    expect(selection.ids).toEqual(["other", "parent", "child"]);
  });
  it("uses only visible rows for a range across collapsed branches", () => {
    expect(
      selectHierarchyRow(
        singleHierarchySelection("parent"),
        "sibling",
        ["root", "parent", "sibling"],
        { range: true },
      ).ids,
    ).toEqual(["parent", "sibling"]);
  });
  it("moves keyboard focus independently of the selection", () => {
    const selection = selectHierarchyRow(
      singleHierarchySelection("parent"),
      "other",
      rows,
      { focusOnly: true },
    );
    expect(selection).toEqual({
      ids: ["parent"],
      anchor: "parent",
      focus: "other",
    });
  });
  it("starts a new range when its anchor is no longer visible", () => {
    expect(
      selectHierarchyRow(singleHierarchySelection("missing"), "other", rows, {
        range: true,
      }),
    ).toEqual(singleHierarchySelection("other"));
  });
  it("clears hidden selections after filtering, collapsing or switching tabs", () => {
    const selection = {
      ids: ["parent", "child", "other"],
      anchor: "child",
      focus: "child",
    };
    expect(
      pruneHierarchySelection(selection, ["root", "parent", "other"]),
    ).toEqual({ ids: ["parent", "other"], anchor: "parent", focus: "parent" });
    expect(pruneHierarchySelection(selection, [])).toEqual(
      singleHierarchySelection(null),
    );
    expect(pruneHierarchySelection(selection, ["property"])).toEqual({
      ids: [],
      anchor: "property",
      focus: "property",
    });
  });
  it("keeps selection identity when unrelated data changes", () => {
    const selection = singleHierarchySelection("parent");
    expect(pruneHierarchySelection(selection, rows)).toBe(selection);
  });
});
