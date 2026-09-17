import { describe, it, expect } from "vitest";
import {
  commandDefinitions,
  accessEntries,
  menuTree,
} from "../../src/shared/commands";
import {
  emptyKeyboardSettings,
  readKeyboardSettings,
  keyboardIssues,
  effectiveBindings,
  accessPath,
  mnemonicLabel,
  normalizeShortcut,
  eventStroke,
  ShortcutResolver,
  type KeyboardContext,
} from "../../src/shared/shortcuts";
const graph: KeyboardContext = { scope: "graph", text: false, modal: false };
describe("keyboard conventions and settings", () => {
  it("assigns unique letters throughout every menu and a discoverable path to every command", () => {
    expect(new Set(commandDefinitions.map((c) => c.id)).size).toBe(
      commandDefinitions.length,
    );
    expect(keyboardIssues(emptyKeyboardSettings())).toEqual([]);
    for (const c of commandDefinitions) {
      expect(accessEntries.filter((e) => e.id === c.id)).toHaveLength(1);
      expect(accessPath(c.id)).toMatch(/^Alt+[+]?[A-Z0-9]/);
    }
    expect(menuTree.map((m) => m.key)).toEqual([
      "F",
      "E",
      "V",
      "G",
      "Q",
      "R",
      "W",
      "H",
    ]);
    expect(accessPath("file.new")).toBe("Alt+F, N");
    expect(accessPath("file.open")).toBe("Alt+F, O, W");
    expect(accessPath("file.example")).toBe("Alt+F, O, E, P");
    expect(accessPath("file.saveAs")).toBe("Alt+F, A");
    expect(accessPath("keyboard.settings")).toBe("Alt+E, K");
  });
  it("escapes literal ampersands while exposing remapped menu letters", () => {
    const s = emptyKeyboardSettings();
    s.accessKeys["file.new"] = "Z";
    expect(mnemonicLabel("file.new", "New & nice", s)).toBe("New && nice (&Z)");
    s.accessKeys["menu.file"] = "A";
    expect(accessPath("file.new", s)).toBe("Alt+A, Z");
  });
  it.each([
    ["shift+control+s", "Ctrl+Shift+S"],
    ["ctrl+k ctrl+s", "Ctrl+K Ctrl+S"],
    ["alt+arrowLeft", "Alt+Left"],
    ["ctrl+plus", "Ctrl+Plus"],
    ["shift+f6", "Shift+F6"],
  ])("normalizes %s", (input, result) =>
    expect(normalizeShortcut(input)).toBe(result),
  );
  it.each([
    "Ctrl++",
    "Ctrl+Ctrl+A",
    "Ctrl+Alt",
    "Win+A",
    "Ctrl+K Ctrl+S Ctrl+X",
    "💡",
  ])("rejects invalid syntax %s", (key) =>
    expect(() => normalizeShortcut(key)).toThrow(),
  );
  it("preserves AltGr, IME, dead keys and Windows keys", () => {
    const base = { key: "e", ctrlKey: false, altKey: false, shiftKey: false };
    for (const p of [
      { key: "Dead" },
      { key: "Process" },
      { isComposing: true },
      { metaKey: true },
      { ctrlKey: true, altKey: true },
      { getModifierState: (k: string) => k === "AltGraph" },
    ])
      expect(eventStroke({ ...base, ...p })).toBeUndefined();
    expect(
      eventStroke({ ...base, key: "+", ctrlKey: true, shiftKey: true }),
    ).toBe("Ctrl+Plus");
  });
  it("detects duplicate, chord-prefix and overlapping-scope conflicts", () => {
    const s = emptyKeyboardSettings();
    s.bindings["graph.pin"] = [{ keys: "Ctrl+S", scope: "graph" }];
    expect(keyboardIssues(s).some((i) => i.other === "graph.pin")).toBe(true);
    s.bindings["graph.pin"] = [{ keys: "Ctrl+K", scope: "graph" }];
    s.bindings["file.save"] = [{ keys: "Ctrl+K Ctrl+S", scope: "app" }];
    expect(keyboardIssues(s).some((i) => i.message.includes("conflicts"))).toBe(
      true,
    );
    s.bindings["file.save"] = [{ keys: "Ctrl+K", scope: "query" }];
    expect(keyboardIssues(s)).toEqual([]);
  });
  it.each([
    "Alt+A",
    "Ctrl+Alt+E",
    "Alt+Tab",
    "F10",
    "Shift+F10",
    "Alt+F4",
    "Escape",
    "Q",
  ])("protects platform and text input from %s", (keys) => {
    const s = emptyKeyboardSettings();
    s.bindings["graph.pin"] = [{ keys, scope: "app" }];
    expect(() => readKeyboardSettings(s)).toThrow();
  });
  it("validates imported command IDs, scopes, menu letters and binding limits atomically", () => {
    const s = emptyKeyboardSettings();
    s.bindings["bad"] = [];
    expect(() => readKeyboardSettings(s)).toThrow("Unknown command");
    delete s.bindings.bad;
    s.accessKeys["menu.file"] = "E";
    expect(() => readKeyboardSettings(s)).toThrow("already used");
    s.accessKeys = {};
    s.bindings["file.save"] = Array.from({ length: 5 }, () => ({
      keys: "Ctrl+K",
      scope: "app",
    }));
    expect(() => readKeyboardSettings(s)).toThrow();
    expect(effectiveBindings("file.save")).toEqual([
      { keys: "Ctrl+S", scope: "app" },
    ]);
  });
  it("applies clears and restores defaults by removing overrides", () => {
    const s = emptyKeyboardSettings();
    s.bindings["graph.pin"] = [];
    expect(effectiveBindings("graph.pin", s)).toEqual([]);
    delete s.bindings["graph.pin"];
    expect(effectiveBindings("graph.pin", s)[0].keys).toBe("P");
  });
});
it("canonicalizes shifted zoom keys and rejects numeric top-level menus", () => {
  expect(normalizeShortcut("Ctrl+Shift+Plus")).toBe("Ctrl+Plus");
  const s = emptyKeyboardSettings();
  s.accessKeys["menu.file"] = "1";
  expect(() => readKeyboardSettings(s)).toThrow("Top-level menu");
});
describe("keyboard resolution", () => {
  it("distinguishes graph removal, class deletion and ordinary text", () => {
    const r = new ShortcutResolver();
    expect(r.resolve("Delete", graph).command).toBe("graph.remove");
    expect(r.resolve("Delete", { ...graph, scope: "hierarchy" }).command).toBe(
      "entity.delete",
    );
    expect(r.resolve("Delete", { ...graph, text: true })).toEqual({});
    expect(r.resolve("P", { ...graph, text: true })).toEqual({});
    expect(r.resolve("Ctrl+S", { ...graph, text: true }).command).toBe(
      "file.save",
    );
    expect(r.resolve("Ctrl+S", { ...graph, modal: true })).toEqual({});
  });
  it("supports two-stroke chords, cancellation and expiry", () => {
    const r = new ShortcutResolver(),
      s = emptyKeyboardSettings();
    s.bindings["file.save"] = [{ keys: "Ctrl+K Ctrl+S", scope: "app" }];
    expect(r.resolve("Ctrl+K", graph, s, 100).pending).toBe("Ctrl+K");
    expect(r.resolve("Ctrl+S", graph, s, 200).command).toBe("file.save");
    r.resolve("Ctrl+K", graph, s, 300);
    r.resolve("Escape", graph, s, 400);
    expect(r.resolve("Ctrl+S", graph, s, 500)).toEqual({});
    r.resolve("Ctrl+K", graph, s, 600);
    expect(r.resolve("Ctrl+S", graph, s, 2500)).toEqual({});
  });
  it("never falls back to an old application binding after remapping", () => {
    const s = emptyKeyboardSettings();
    s.bindings["graph.pin"] = [{ keys: "Ctrl+Shift+B", scope: "graph" }];
    const r = new ShortcutResolver();
    expect(r.resolve("P", graph, s)).toEqual({});
    expect(r.resolve("Ctrl+Shift+B", graph, s).command).toBe("graph.pin");
    expect(r.resolve("Ctrl+Shift+B", { ...graph, scope: "query" }, s)).toEqual(
      {},
    );
  });
});
