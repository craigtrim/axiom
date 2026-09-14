import {
  commandDefinitions,
  commandById,
  accessEntries,
  accessById,
  scopes,
  type ShortcutBinding,
  type ShortcutScope,
} from "./commands";
export interface KeyboardSettings {
  version: 1;
  bindings: Record<string, ShortcutBinding[]>;
  accessKeys: Record<string, string>;
}
export const emptyKeyboardSettings = (): KeyboardSettings => ({
  version: 1,
  bindings: {},
  accessKeys: {},
});
const aliases: Record<string, string> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  esc: "Escape",
  escape: "Escape",
  return: "Enter",
  enter: "Enter",
  space: "Space",
  spacebar: "Space",
  left: "Left",
  arrowleft: "Left",
  right: "Right",
  arrowright: "Right",
  up: "Up",
  arrowup: "Up",
  down: "Down",
  arrowdown: "Down",
  delete: "Delete",
  del: "Delete",
  backspace: "Backspace",
  insert: "Insert",
  ins: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  tab: "Tab",
  plus: "Plus",
  add: "Plus",
  minus: "Minus",
  subtract: "Minus",
  equal: "Plus",
  equals: "Plus",
  comma: "Comma",
  period: "Period",
};
export function normalizeStroke(input: string) {
  const parts = input
    .trim()
    .split("+")
    .map((s) => s.trim());
  if (parts.some((s) => !s))
    throw Error("Use Plus for the + key, for example Ctrl+Plus.");
  const canonical = parts.map(
    (s) =>
      aliases[s.toLowerCase()] ??
      (/^[a-z0-9]$/i.test(s)
        ? s.toUpperCase()
        : /^f([1-9]|1[0-9]|2[0-4])$/i.test(s)
          ? s.toUpperCase()
          : undefined),
  );
  if (canonical.some((s) => !s))
    throw Error(
      "Use letters, digits, function keys or named keys such as Enter and Plus.",
    );
  const modifiers = canonical.filter((s) =>
      ["Ctrl", "Alt", "Shift"].includes(s!),
    ),
    keys = canonical.filter((s) => !["Ctrl", "Alt", "Shift"].includes(s!));
  if (keys.length !== 1 || new Set(modifiers).size !== modifiers.length)
    throw Error("A shortcut needs one key and distinct modifiers.");
  return [
    ...["Ctrl", "Alt", "Shift"].filter(
      (m) =>
        modifiers.includes(m) &&
        !(m === "Shift" && ["Plus", "Minus"].includes(keys[0]!)),
    ),
    keys[0],
  ].join("+");
}
export function normalizeShortcut(input: string) {
  const strokes = input.trim().split(/\s+/);
  if (strokes.length < 1 || strokes.length > 2)
    throw Error("Use one shortcut or a two-stroke chord.");
  return strokes.map(normalizeStroke).join(" ");
}
export interface KeyboardInput {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  getModifierState?: (key: string) => boolean;
}
export function eventStroke(e: KeyboardInput) {
  if (
    e.isComposing ||
    e.key === "Dead" ||
    e.key === "Process" ||
    e.metaKey ||
    e.getModifierState?.("AltGraph") ||
    (e.ctrlKey && e.altKey)
  )
    return;
  if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(e.key)) return;
  let key =
    e.key === " "
      ? "Space"
      : e.key === "+" || e.key === "="
        ? "Plus"
        : e.key === "-" || e.key === "_"
          ? "Minus"
          : e.key === ","
            ? "Comma"
            : e.key === "."
              ? "Period"
              : e.key;
  const shift = e.shiftKey && !["Plus", "Minus"].includes(key);
  try {
    return normalizeStroke(
      [
        e.ctrlKey ? "Ctrl" : "",
        e.altKey ? "Alt" : "",
        shift ? "Shift" : "",
        key,
      ]
        .filter(Boolean)
        .join("+"),
    );
  } catch {
    return;
  }
}
export function effectiveBindings(
  id: string,
  settings?: KeyboardSettings,
): ShortcutBinding[] {
  return settings?.bindings[id] ?? commandById.get(id)?.defaults ?? [];
}
export function accessKey(id: string, settings?: KeyboardSettings) {
  return settings?.accessKeys[id] ?? accessById.get(id)?.key ?? "";
}
export function accessPath(id: string, settings?: KeyboardSettings) {
  const entry = accessById.get(id);
  if (!entry) return "";
  const keys = [...entry.path, id].map((id) => accessKey(id, settings));
  return "Alt+" + keys.join(", ");
}
export function mnemonicLabel(
  id: string,
  label: string,
  settings?: KeyboardSettings,
) {
  const key = accessKey(id, settings),
    at = label.toUpperCase().indexOf(key);
  const escape = (s: string) => s.replaceAll("&", "&&");
  return at < 0
    ? escape(label) + " (&" + key + ")"
    : escape(label.slice(0, at)) + "&" + escape(label.slice(at));
}
export function shortcutText(id: string, settings?: KeyboardSettings) {
  return effectiveBindings(id, settings)
    .map((b) => b.keys + (b.scope === "app" ? "" : " (" + b.scope + ")"))
    .join(" / ");
}
export interface KeyboardIssue {
  message: string;
  command?: string;
  other?: string;
}
export function keyboardIssues(settings: KeyboardSettings): KeyboardIssue[] {
  const issues: KeyboardIssue[] = [],
    bindings: { id: string; b: ShortcutBinding }[] = [];
  for (const c of commandDefinitions)
    for (const b of effectiveBindings(c.id, settings)) {
      const strokes = b.keys.split(" ");
      for (const stroke of strokes) {
        if (stroke.includes("Ctrl+Alt+"))
          issues.push({
            command: c.id,
            message:
              "Ctrl+Alt can generate AltGr text. Choose another combination.",
          });
        if (/^Alt\+(?:Shift\+)?[A-Z0-9]$/.test(stroke))
          issues.push({
            command: c.id,
            message:
              "Alt+letters and digits are reserved for menu access keys.",
          });
        if (
          [
            "Alt+Tab",
            "Alt+Shift+Tab",
            "Alt+Space",
            "Ctrl+Escape",
            "Ctrl+Shift+Escape",
            "Ctrl+Alt+Delete",
            "F10",
            "Shift+F10",
            "Escape",
          ].includes(stroke)
        )
          issues.push({
            command: c.id,
            message:
              stroke + " is reserved for Windows or standard navigation.",
          });
        if (stroke === "Alt+F4" && (c.id !== "app.quit" || strokes.length > 1))
          issues.push({
            command: c.id,
            message: "Alt+F4 is the Windows close-window command.",
          });
        if (
          b.scope === "app" &&
          !/(Ctrl|Alt)\+/.test(stroke) &&
          !/^(Shift\+)?F\d+$/.test(stroke)
        )
          issues.push({
            command: c.id,
            message: "Unmodified typing and navigation keys need a pane scope.",
          });
        if (
          strokes.length > 1 &&
          !/(Ctrl|Alt)\+/.test(stroke) &&
          !/^F\d+$/.test(stroke)
        )
          issues.push({
            command: c.id,
            message: "Chord strokes must use Ctrl, Alt or a function key.",
          });
      }
      bindings.push({ id: c.id, b });
    }
  for (let i = 0; i < bindings.length; i++)
    for (let j = i + 1; j < bindings.length; j++) {
      const a = bindings[i],
        b = bindings[j],
        overlap =
          a.b.scope === b.b.scope || a.b.scope === "app" || b.b.scope === "app";
      if (
        overlap &&
        (a.b.keys === b.b.keys ||
          a.b.keys.startsWith(b.b.keys + " ") ||
          b.b.keys.startsWith(a.b.keys + " "))
      )
        issues.push({
          command: a.id,
          other: b.id,
          message:
            a.b.keys +
            " conflicts with " +
            commandById.get(b.id)!.label +
            " (" +
            b.b.scope +
            ").",
        });
    }
  const used = new Map<string, string>();
  for (const entry of accessEntries) {
    if (!entry.parent && !/^[A-Z]$/.test(accessKey(entry.id, settings)))
      issues.push({
        command: entry.id,
        message: "Top-level menu access keys must use letters A through Z.",
      });
    const key = entry.parent + ":" + accessKey(entry.id, settings),
      other = used.get(key);
    if (other)
      issues.push({
        command: entry.id,
        other,
        message:
          "Menu letter " +
          accessKey(entry.id, settings) +
          " is already used by " +
          accessById.get(other)!.label +
          " in this menu.",
      });
    else used.set(key, entry.id);
  }
  return issues;
}
export function readKeyboardSettings(input: unknown): KeyboardSettings {
  const r = input as KeyboardSettings;
  if (
    !r ||
    r.version !== 1 ||
    !r.bindings ||
    typeof r.bindings !== "object" ||
    Array.isArray(r.bindings) ||
    !r.accessKeys ||
    typeof r.accessKeys !== "object" ||
    Array.isArray(r.accessKeys) ||
    JSON.stringify(r).length > 100000
  )
    throw Error("Invalid keyboard settings file.");
  const result = emptyKeyboardSettings();
  for (const [id, values] of Object.entries(r.bindings)) {
    if (!commandById.has(id) || !Array.isArray(values) || values.length > 4)
      throw Error("Unknown command or too many shortcuts: " + id);
    result.bindings[id] = values.map((v) => {
      if (
        !v ||
        typeof v.keys !== "string" ||
        v.keys.length > 100 ||
        !scopes.includes(v.scope)
      )
        throw Error("Invalid shortcut for " + id);
      return { keys: normalizeShortcut(v.keys), scope: v.scope };
    });
  }
  for (const [id, key] of Object.entries(r.accessKeys)) {
    if (
      !accessById.has(id) ||
      typeof key !== "string" ||
      !/^[A-Z0-9]$/i.test(key)
    )
      throw Error("Invalid menu access key: " + id);
    result.accessKeys[id] = key.toUpperCase();
  }
  const issues = keyboardIssues(result);
  if (issues.length) throw Error(issues[0].message);
  return result;
}
export interface KeyboardContext {
  scope: ShortcutScope;
  text: boolean;
  modal: boolean;
}
export class ShortcutResolver {
  pending = "";
  private since = 0;
  clear() {
    this.pending = "";
    this.since = 0;
  }
  resolve(
    stroke: string,
    context: KeyboardContext,
    settings?: KeyboardSettings,
    now = Date.now(),
  ): { command?: string; pending?: string } {
    if (context.modal) {
      this.clear();
      return {};
    }
    if (stroke === "Escape") {
      this.clear();
      return {};
    }
    if (now - this.since > 1800) this.clear();
    const available = commandDefinitions.flatMap((c) =>
      effectiveBindings(c.id, settings)
        .filter(
          (b) =>
            (b.scope === "app" || b.scope === context.scope) &&
            (!context.text ||
              /^(Ctrl|Alt)\+|^F\d+$|^Shift\+F\d+$/.test(b.keys)),
        )
        .map((b) => ({ id: c.id, keys: b.keys })),
    );
    const key = this.pending ? this.pending + " " + stroke : stroke;
    const match = available.find((b) => b.keys === key);
    if (match) {
      this.clear();
      return { command: match.id };
    }
    if (available.some((b) => b.keys.startsWith(key + " "))) {
      this.pending = key;
      this.since = now;
      return { pending: key };
    }
    const hadPending = !!this.pending;
    this.clear();
    return hadPending ? this.resolve(stroke, context, settings, now) : {};
  }
}
export function shortcutCommand(
  key: string,
  control: boolean,
  shift: boolean,
  alt: boolean,
) {
  const stroke = eventStroke({
    key,
    ctrlKey: control,
    shiftKey: shift,
    altKey: alt,
  });
  return stroke
    ? new ShortcutResolver().resolve(stroke, {
        scope: "app",
        text: false,
        modal: false,
      }).command
    : undefined;
}
