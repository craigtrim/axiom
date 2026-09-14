import { commandById } from "../shared/commands";
import {
  ShortcutResolver,
  eventStroke,
  shortcutText,
  type KeyboardContext,
} from "../shared/shortcuts";
import { preferences, command, rememberDocument, report } from "./client";
export function keyboardContext(doc: Document): KeyboardContext {
  const el = doc.activeElement as HTMLElement | null;
  return {
    scope:
      (el?.closest<HTMLElement>("[data-panel]")?.dataset
        .panel as KeyboardContext["scope"]) ?? "app",
    text: !!el?.closest(
      "input,textarea,select,[contenteditable=true],.monaco-editor",
    ),
    modal: !!doc.querySelector("dialog[open],[role=menu]"),
  };
}
export function installKeyboard(doc: Document) {
  const resolver = new ShortcutResolver(),
    win = doc.defaultView!;
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (resolver.pending) report("Shortcut sequence cancelled.");
    resolver.clear();
    clearTimeout(chordTimer);
  };
  const keydown = (e: KeyboardEvent) => {
    rememberDocument(doc);
    if (
      (e.target as HTMLElement)?.closest(
        "[data-shortcut-recorder],[data-inline-rename],.inline-create",
      )
    )
      return;
    const context = keyboardContext(doc);
    if (context.modal) {
      clear();
      return;
    }
    if (
      e.key === "F10" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
      (win.axiom ?? window.axiom).keyboard.menu();
      return;
    }
    const stroke = eventStroke(e);
    if (!stroke) return;
    const waiting = !!resolver.pending;
    const match = resolver.resolve(stroke, context, preferences.keyboard);
    clearTimeout(chordTimer);
    if (waiting && !match.pending)
      report(
        match.command
          ? commandById.get(match.command)!.label
          : "Shortcut sequence cancelled.",
      );
    if (match.pending) {
      e.preventDefault();
      e.stopImmediatePropagation();
      report(
        match.pending + " pressed. Waiting for the second shortcut key...",
      );
      chordTimer = setTimeout(() => {
        resolver.clear();
        report("Shortcut sequence timed out.");
      }, 1800);
      return;
    }
    if (!match.command) return;
    // Let the focused editor process its standard text keys synchronously.
    if (
      context.text &&
      ["role.cut", "role.copy", "role.paste", "role.selectAll"].includes(
        match.command,
      ) &&
      commandById.get(match.command)?.defaults.some((b) => b.keys === stroke)
    )
      return;
    if (
      e.repeat &&
      !match.command.startsWith("graph.pan.") &&
      !match.command.startsWith("graph.zoom.")
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (
      match.command === "entity.search" &&
      doc.activeElement?.closest(".monaco-editor")
    )
      command("query.find");
    else if (match.command === "edit.undo" || match.command === "edit.redo")
      command(match.command);
    else (win.axiom ?? window.axiom).command(match.command);
  };
  win.addEventListener("keydown", keydown, true);
  win.addEventListener("blur", clear);
  return () => {
    clear();
    win.removeEventListener("keydown", keydown, true);
    win.removeEventListener("blur", clear);
  };
}
export const keyHint = (id: string) => shortcutText(id, preferences.keyboard);
