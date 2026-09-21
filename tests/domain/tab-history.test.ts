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
    expect(defaultTabName("graph", 1)).toBe("Graph");
    expect(defaultTabName("graph", 2)).toBe("Graph_2");
    expect(defaultTabName("find", 3)).toBe("Find_3");
    expect(tabDate(new Date(2026, 8, 21, 12).toISOString())).toBe("2026-09-21");
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
