import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Actions,
  DockLocation,
  Model,
  TabNode,
  type IJsonTabNode,
} from "flexlayout-react";
import { emptyTabHistory } from "../../src/shared/tab-history";
import type { Preferences } from "../../src/shared/protocol";
const mocks = vi.hoisted(() => ({
  preferences: {} as Preferences,
  persist: vi.fn(),
}));
vi.mock("../../src/renderer/client", () => ({
  ...mocks,
  state: undefined,
  command: vi.fn(),
}));
vi.mock("../../src/renderer/find-state", () => ({
  findState: vi.fn(),
  updateFind: vi.fn(),
}));
vi.mock("../../src/renderer/sparsity-view", () => ({
  updateSparsity: vi.fn(),
}));
import {
  availableTabName,
  ensureTabMetadata,
  normalizeDefaultTabNames,
  renameTab,
} from "../../src/renderer/tab-history";

const createdAt = "2026-10-01T12:00:00.000Z";
const tab = (
  id: string,
  name: string,
  named = false,
  component = "details",
): IJsonTabNode => ({
  type: "tab",
  id,
  name,
  component,
  config: { axiomTab: { createdAt, defaultName: name, named } },
});
const model = (tabs: IJsonTabNode[]) =>
  Model.fromJson({
    layout: {
      type: "row",
      children: [{ type: "tabset", id: "group", children: tabs }],
    },
  });
const node = (m: Model, id: string) => m.getNodeById(id) as TabNode;

// craigtrim/axiom#113: exercise the actual layout traversal and persisted metadata.
describe("available names across the workbench", () => {
  beforeEach(() => {
    mocks.preferences.tabHistory = emptyTabHistory();
    mocks.preferences.tabHistory.counters.details = 40;
  });
  it("counts user names in borders and detached windows and excludes only the new tab", () => {
    const m = Model.fromJson({
      borders: [
        {
          type: "border",
          location: "left",
          children: [tab("border", "Details", true, "find")],
        },
      ],
      layout: {
        type: "row",
        children: [{ type: "tabset", children: [tab("new", "Details")] }],
      },
      subLayouts: {
        detached: {
          type: "window",
          layout: {
            type: "row",
            children: [
              {
                type: "tabset",
                children: [tab("detached", "Details_2", true, "graph")],
              },
            ],
          },
        },
      },
    });
    expect(availableTabName(m, "details", node(m, "new"))).toBe("Details_3");
    m.doAction(Actions.deleteTab("detached"));
    expect(availableTabName(m, "details", node(m, "new"))).toBe("Details_2");
  });
  it("normalizes in layout order while reserving user names first", () => {
    const m = model([
      tab("old", "Details_6"),
      tab("other", "Details_3"),
      tab("user", "Details", true, "graph"),
      tab("user2", "Details_3", true, "find"),
      tab("subject", "Touchpoints, Mercury", false, "touchpoints"),
    ]);
    normalizeDefaultTabNames(m);
    expect(node(m, "old").getName()).toBe("Details_2");
    expect(node(m, "other").getName()).toBe("Details_4");
    expect(node(m, "user").getName()).toBe("Details");
    expect(node(m, "subject").getName()).toBe("Touchpoints, Mercury");
    expect(node(m, "old").getConfig().axiomTab).toEqual({
      createdAt,
      defaultName: "Details_2",
      named: false,
    });
    expect(mocks.preferences.tabHistory!.counters.details).toBe(40);
    const normalized = m.toJson();
    normalizeDefaultTabNames(m);
    expect(m.toJson()).toEqual(normalized);
  });
  it("reclaims the plain name for a lone default tab and keeps user renames", () => {
    const m = model([tab("details", "Details_6")]);
    normalizeDefaultTabNames(m);
    expect(node(m, "details").getName()).toBe("Details");
    renameTab(m, "details", "My details");
    normalizeDefaultTabNames(m);
    expect(node(m, "details").getName()).toBe("My details");
    expect(node(m, "details").getConfig().axiomTab.named).toBe(true);
  });
  it("reuses a closed number without changing names of tabs that remain open", () => {
    const m = model([
      tab("one", "Details"),
      tab("two", "Details_2"),
      tab("three", "Details_3"),
    ]);
    m.doAction(Actions.deleteTab("two"));
    m.doAction(
      Actions.addTab(
        { type: "tab", component: "details", id: "new", name: "Details" },
        "group",
        DockLocation.CENTER,
        -1,
      ),
    );
    ensureTabMetadata(m, node(m, "new"));
    expect(node(m, "new").getName()).toBe("Details_2");
    expect(node(m, "three").getName()).toBe("Details_3");
    expect(mocks.preferences.tabHistory!.counters.details).toBe(40);
  });
});
