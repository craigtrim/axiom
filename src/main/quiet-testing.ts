// #165: hidden rendering is opt-in and never qualifies native-window behavior.
import {
  app,
  dialog,
  Menu,
  type BrowserWindowConstructorOptions,
} from "electron";

export const quietTesting = process.env.AXIOM_TEST_QUIET === "1";

export function testWindowOptions(
  options: BrowserWindowConstructorOptions,
): BrowserWindowConstructorOptions {
  return quietTesting ? { ...options, show: false, focusable: false } : options;
}

export function installQuietTesting() {
  if (!quietTesting) return;
  if (app.isPackaged || !process.env.AXIOM_USER_DATA)
    throw Error(
      "Quiet testing requires a source launch and an isolated AXIOM_USER_DATA profile.",
    );

  // The fixture can inspect the entire lifetime, including construction before
  // Playwright obtains its first page. This property exists only in quiet mode.
  const audit = {
    created: [] as { id: number; visible: boolean; focused: boolean }[],
    violations: [] as string[],
  };
  Object.defineProperty(app, "axiomQuietAudit", { value: audit });
  app.on("browser-window-created", (_event, win) => {
    audit.created.push({
      id: win.id,
      visible: win.isVisible(),
      focused: win.isFocused(),
    });
    if (win.isVisible() || win.isFocused()) {
      audit.violations.push(`Window ${win.id} was not hidden at construction`);
      win.hide();
      throw Error("Unqualified window requires the normal Windows CI suite.");
    }
    win.on("show", () => audit.violations.push(`Window ${win.id}: show`));
    win.on("focus", () => audit.violations.push(`Window ${win.id}: focus`));
    // Suppress native activation only. DOM focus and Playwright input remain real.
    win.show = win.showInactive = win.focus = win.restore = () => {};
    win.webContents.focus = () => {};
    const setFocusable = win.setFocusable.bind(win);
    win.setFocusable = (value) => {
      if (value)
        throw Error("Focusable windows require the normal Windows CI suite.");
      setFocusable(false);
    };
  });
  // Existing test dialog fixtures may still supply their own deterministic
  // responses. An unexpected real native dialog must never appear locally.
  for (const method of [
    "showOpenDialog",
    "showOpenDialogSync",
    "showSaveDialog",
    "showSaveDialogSync",
    "showMessageBox",
    "showMessageBoxSync",
    "showErrorBox",
  ] as const)
    dialog[method] = (() => {
      throw Error(`${method} requires the normal Windows CI suite.`);
    }) as never;
  Menu.prototype.popup = () => {
    throw Error("Native menus require the normal Windows CI suite.");
  };
}
