import { describe, it, expect } from "vitest";
import { readPreferences } from "../../src/shared/preferences";
import { buildStore } from "../../src/domain/fixture";
import { Viewport } from "../../src/domain/viewport";
import { NS } from "../../src/domain/model";
describe("workbench preferences", () => {
  it("retains exact graph limits and valid filters", () =>
    expect(
      readPreferences({
        version: 1,
        theme: "dark",
        panelState: {
          "graph.limit": 357,
          "table.filter": {
            query: "Joanna",
            sort: "price",
            direction: -1,
            branch: "Camden",
          },
        },
      }),
    ).toMatchObject({
      theme: "dark",
      panelState: {
        "graph.limit": 357,
        "table.filter": {
          query: "Joanna",
          sort: "price",
          direction: -1,
          branch: "Camden",
        },
      },
    }));
  it("drops invalid camera and editor state safely", () =>
    expect(
      readPreferences({
        version: 1,
        theme: "wrong",
        panelState: {
          "graph.camera": { x: 0, y: 0, zoom: 0 },
          "hierarchy.open": {},
          "query.example": 999,
          "query.view": {},
          "table.accessible": "true",
        },
      }),
    ).toEqual({
      version: 1,
      theme: "light",
      panelState: {},
      tabSavePolicy: "named",
      tabHistory: { version: 1, entries: [], counters: {} },
    }));
  it("retains independent pane zoom and drops invalid values", () => {
    expect(
      readPreferences({
        version: 1,
        panelState: {
          "pane.zoom.individuals": 1.25,
          "pane.zoom.hierarchy": 0.75,
          "pane.zoom.entity-1": 2,
          "pane.zoom.query": 0.1,
          "pane.zoom.source": Infinity,
          "pane.zoom.research": "1.5",
          "pane.zoom.inspector": 10,
          "pane.zoom.graph": 2,
          "pane.zoom.": 1,
        },
      }).panelState,
    ).toEqual({
      "pane.zoom.individuals": 1.25,
      "pane.zoom.hierarchy": 0.75,
      "pane.zoom.entity-1": 2,
    });
  });
  it("rejects unsupported settings files", () => {
    expect(() => readPreferences({ version: 2 })).toThrow();
    expect(() => readPreferences(null)).toThrow();
  });
  it("enforces a non-rounded display limit through expansion and reduction", () => {
    const v = new Viewport(buildStore());
    v.setBudget(357);
    v.seed([NS.pizza + "Margherita"]);
    expect(v.budget).toBe(357);
    expect(v.nodes.size).toBe(357);
    for (const n of [...v.nodes.values()].slice(0, 12)) v.expand(n.iri);
    expect(v.nodes.size).toBeLessThanOrEqual(357);
    v.setBudget(123);
    expect(v.nodes.size).toBeLessThanOrEqual(123);
  });
});
