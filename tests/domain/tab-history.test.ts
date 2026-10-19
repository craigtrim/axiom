import { describe, it, expect } from "vitest";
import {
  readTabHistory,
  defaultTabName,
  tabDate,
} from "../../src/shared/tab-history";
import { readPreferences } from "../../src/shared/preferences";
const tab = {
  id: "graph:abc",
  type: "graph",
  name: "English overview",
  named: true,
  createdAt: "2026-09-21T15:30:00.000Z",
  updatedAt: "2026-09-21T16:00:00.000Z",
  config: {},
  panelState: { "graph.camera.graph:abc": { x: 30, y: 40, zoom: 0.4 } },
};
describe("workspace tab history", () => {
  // craigtrim/axiom#92: migrating generated titles must not overwrite a person's saved name.
  it("updates old Touchpoints titles and preserves deliberately named tabs", () => {
    for (const named of [false, true]) {
      const archive = readTabHistory({
        version: 1,
        counters: {},
        entries: [
          {
            ...tab,
            id: "touchpoints",
            type: "touchpoints",
            name: "Touchpoints · Mercury",
            named,
          },
        ],
      });
      expect(archive.entries[0].name).toBe(
        named ? "Touchpoints · Mercury" : "Touchpoints, Mercury",
      );
    }
  });
  it("migrates saved Research tabs without restoring retired prompts", () => {
    const archive = readTabHistory({
      version: 1,
      entries: [
        {
          ...tab,
          id: "research",
          type: "research",
          name: "Research",
          config: { instructions: "old prompt" },
          panelState: { "research.templates": [] },
        },
      ],
      counters: { research: 2 },
    });
    expect(archive.entries[0]).toMatchObject({
      id: "touchpoints",
      type: "touchpoints",
      name: "Find Touchpoints",
      config: {},
      panelState: {},
    });
    const custom = readTabHistory({
      version: 1,
      entries: [{ ...tab, type: "research" }],
      counters: {},
    });
    expect(custom.entries[0].name).toBe("English overview");
  });
  it("defaults to named tabs only and keeps archive state", () => {
    const defaults = readPreferences({ version: 1 });
    expect(defaults.tabSavePolicy).toBe("named");
    expect(defaults.tabHistory?.entries).toEqual([]);
    const p = readPreferences({
      version: 1,
      tabSavePolicy: "all",
      tabHistory: { version: 1, entries: [tab], counters: { graph: 3 } },
    });
    expect(p.tabSavePolicy).toBe("all");
    expect(p.tabHistory?.entries[0]).toEqual(tab);
    expect(p.tabHistory?.counters.graph).toBe(3);
  });
  it("uses stable type names and local calendar date groups", () => {
    expect(defaultTabName("graph", [])).toBe("Graph");
    expect(defaultTabName("graph", ["Graph"])).toBe("Graph_2");
    expect(defaultTabName("find", ["Find", "Find_2"])).toBe("Find_3");
    expect(tabDate(new Date(2026, 8, 21, 12).toISOString())).toBe("2026-09-21");
  });
  // craigtrim/axiom#113: closed numbers are available, even below higher open names.
  it.each([
    [[], "Details"],
    [["Details"], "Details_2"],
    [["Details", "Details_2"], "Details_3"],
    [["Details", "Details_3"], "Details_2"],
    [["Details_6"], "Details"],
    [["Details_2"], "Details"],
    [["Details", "Details_02", "Details_20", "Find_2"], "Details_2"],
  ])("chooses a free default with %j open", (names, expected) => {
    expect(defaultTabName("details", names)).toBe(expected);
  });
  it("rejects corrupt archive records rather than silently losing saved tabs", () => {
    const archive = (entries: unknown[]) => ({
      version: 1,
      entries,
      counters: {},
    });
    expect(() => readTabHistory(archive([tab, tab]))).toThrow("Duplicate");
    for (const change of [
      { type: "__proto__" },
      { id: "../../other" },
      { createdAt: "bad date" },
      { name: " " },
      { config: null },
    ])
      expect(() => readTabHistory(archive([{ ...tab, ...change }]))).toThrow(
        "Invalid",
      );
  });
});
