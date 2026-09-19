import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { emptyKeyboardSettings } from "../../src/shared/shortcuts";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page, profile: string, errors: string[];
async function launch() {
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  app.on("window", (w) => w.on("pageerror", (e) => errors.push(e.message)));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
}
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    item.click({} as never, win, win.webContents as never);
  }, id);
}
async function settings() {
  await menu("keyboard.settings");
  const d = page.getByRole("dialog", { name: "Customize keyboard shortcuts" });
  await expect(d).toBeVisible();
  return d;
}
async function saveBinding(
  command: string,
  keys: string,
  scope: "app" | "graph" | "query" = "app",
) {
  const s = emptyKeyboardSettings();
  s.bindings[command] = [{ keys, scope }];
  await page.evaluate((s) => window.axiom.keyboard.save(s), s);
}
test.beforeEach(async () => {
  errors = [];
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/keyboard-profile-"));
  await launch();
});
test.afterEach(async () => {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await app.close();
  expect(errors).toEqual([]);
});
test("Alt menu paths, dialog access keys and keyboard context menus work", async () => {
  await nativeKeys(["%e", "k"]);
  const d = page.getByRole("dialog", { name: "Customize keyboard shortcuts" });
  await expect(d).toBeVisible();
  await page.keyboard.press("Escape");
  await nativeKeys(["{F10}", "e", "k"]);
  await expect(d).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+N");
  const create = page.getByRole("form", { name: "Create entity" });
  await expect(create).toBeVisible();
  await create
    .getByRole("textbox", { name: "New entity label", exact: true })
    .fill("Keyboard class");
  await page.keyboard.press("Enter");
  await expect(create).toHaveCount(0);
  const iri = (await state()).graph.nodes[0].iri;
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  await page.getByTestId("graph-canvas").focus();
  await page.keyboard.press("Shift+F10");
  const context = page.getByRole("menu", { name: "Graph node actions" });
  await expect(context).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    context.getByRole("menuitem", { name: "Copy IRI" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
});
test("the shortcut editor records bindings, reports collisions and removes the old graph key", async () => {
  const d = await settings();
  await d
    .getByRole("textbox", { name: "Search keyboard commands" })
    .fill("graph.pin");
  await d
    .getByRole("listbox", { name: "Keyboard commands" })
    .getByRole("option")
    .click();
  await d.getByRole("button", { name: "Clear bindings", exact: true }).click();
  await d.getByRole("button", { name: "Record shortcut", exact: true }).click();
  await page.keyboard.press("Control+Shift+b");
  await page.keyboard.press("Escape");
  await expect(d.getByRole("textbox", { name: "Shortcut keys" })).toHaveValue(
    "Ctrl+Shift+B",
  );
  await d
    .getByRole("combobox", { name: "Shortcut scope" })
    .selectOption("graph");
  await d.getByRole("button", { name: "Add binding" }).click();
  await d.getByRole("textbox", { name: "Shortcut keys" }).fill("Ctrl+S");
  await d.getByRole("button", { name: "Add binding" }).click();
  await expect(d.getByRole("alert")).toContainText("conflicts");
  await expect(
    d.getByRole("button", { name: "Save shortcuts", exact: true }),
  ).toBeDisabled();
  await d
    .getByRole("button", {
      name: "Remove Ctrl+S from Pin / unpin selected node",
    })
    .click();
  await d.getByRole("button", { name: "Save shortcuts", exact: true }).click();
  await expect(d).toHaveCount(0);
  const iri = (await state()).graph.nodes[0].iri;
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  const pinned = async () =>
    (await state()).graph.nodes.find((n) => n.iri === iri)!.pinned;
  const before = await pinned();
  await page.getByTestId("graph-canvas").focus();
  await page.keyboard.press("p");
  expect(await pinned()).toBe(before);
  await page.keyboard.press("Control+Shift+b");
  await expect.poll(pinned).toBe(!before);
  const filter = page.getByRole("textbox", { name: "Filter hierarchy" });
  await filter.fill("p");
  await page.keyboard.press("Control+Shift+b");
  expect(await pinned()).toBe(!before);
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()!.getMenuItemById("graph.pin")!.accelerator,
      ),
    )
    .toBe("Ctrl+Shift+B");
  await page.screenshot({ path: "artifacts/testing/keyboard-remapped.png" });
});
test("chords execute once, time out, and do not consume ordinary typing", async () => {
  await saveBinding("graph.pin", "Ctrl+K Ctrl+P", "graph");
  const iri = (await state()).graph.nodes[0].iri;
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  const pinned = async () =>
      (await state()).graph.nodes.find((n) => n.iri === iri)!.pinned,
    before = await pinned();
  await page.getByTestId("graph-canvas").focus();
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Control+p");
  await expect.poll(pinned).toBe(!before);
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+p");
  expect(await pinned()).toBe(!before);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1900);
  await page.keyboard.press("Control+p");
  expect(await pinned()).toBe(!before);
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill("Pizza");
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Topping");
  await expect(
    page.getByRole("textbox", { name: "Filter hierarchy" }),
  ).toHaveValue("Topping");
});
test("menu letters and imported shortcuts persist across restart and workspace opens", async () => {
  const exported = path.join(profile, "keyboard.json"),
    workspace = path.join(profile, "ontology.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, workspace);
  await menu("file.save");
  await expect
    .poll(async () => {
      try {
        return (await readFile(workspace, "utf8")).length > 0;
      } catch {
        return false;
      }
    })
    .toBe(true);
  const d = await settings();
  await d
    .getByRole("button", { name: "Menu access keys", exact: true })
    .click();
  await d
    .getByRole("textbox", { name: "Menu letter for menu.file", exact: true })
    .fill("A");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exported);
  await d.getByRole("button", { name: "Export...", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(exported, "utf8")).accessKeys[
          "menu.file"
        ];
      } catch {
        return "";
      }
    })
    .toBe("A");
  await d.getByRole("button", { name: "Save shortcuts", exact: true }).click();
  await expect(d).toHaveCount(0);
  await app.close();
  await launch();
  expect(
    await page.evaluate(
      async () =>
        (await window.axiom.preferences.load()).keyboard?.accessKeys[
          "menu.file"
        ],
    ),
  ).toBe("A");
  await nativeKeys(["%a", "n"]);
  await expect.poll(async () => (await state()).classCount).toBe(1);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, workspace);
  await menu("file.open");
  await expect.poll(async () => (await state()).classCount).toBeGreaterThan(1);
  expect(
    await page.evaluate(
      async () =>
        (await window.axiom.preferences.load()).keyboard?.accessKeys[
          "menu.file"
        ],
    ),
  ).toBe("A");
  const reset = await settings();
  await reset.getByRole("button", { name: "Reset all", exact: true }).click();
  await reset
    .getByRole("button", { name: "Save shortcuts", exact: true })
    .click();
  await expect(reset).toHaveCount(0);
  const imp = await settings();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, exported);
  await imp.getByRole("button", { name: "Import...", exact: true }).click();
  await expect(
    imp.getByRole("button", { name: "Save shortcuts", exact: true }),
  ).toBeEnabled();
  await writeFile(
    exported,
    '{"version":1,"bindings":{"unknown":[]},"accessKeys":{}}',
  );
  await imp.getByRole("button", { name: "Import...", exact: true }).click();
  await expect(imp.getByRole("alert")).toContainText("Unknown command");
  await imp
    .getByRole("button", { name: "Save shortcuts", exact: true })
    .click();
  await expect(imp).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        (await window.axiom.preferences.load()).keyboard?.accessKeys[
          "menu.file"
        ],
    ),
  ).toBe("A");
});
test("remapped shortcuts work inside detached panes and dialogs stay with their owner", async () => {
  await saveBinding("graph.pin", "Ctrl+Shift+B", "graph");
  const iri = (await state()).graph.nodes[0].iri;
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  const before = (await state()).graph.nodes.find((n) => n.iri === iri)!.pinned;
  await menu("view.graph");
  const childPromise = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await childPromise;
  await expect(child.getByTestId("graph-canvas")).toBeVisible();
  await child.getByTestId("graph-canvas").focus();
  await child.keyboard.press("Control+Shift+b");
  await expect
    .poll(
      async () =>
        (await state()).graph.nodes.find((n) => n.iri === iri)!.pinned,
    )
    .toBe(!before);
  await child.keyboard.press("Control+Shift+k");
  await expect(
    child.getByRole("dialog", { name: "Customize keyboard shortcuts" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await child.keyboard.press("Escape");
  await expect(child.getByTestId("graph-canvas")).toBeFocused();
  await menu("pane.reattach");
});
test("keyboard help and palette show current shortcuts and pane navigation works", async () => {
  await page.keyboard.press("Control+3");
  await expect(page.locator('[data-panel="inspector"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.closest<HTMLElement>("[data-panel]")?.dataset
            .panel,
      ),
    )
    .toBe("inspector");
  await page.keyboard.press("Control+Tab");
  await expect(page.locator('[data-panel="research"]')).toBeVisible();
  await page.keyboard.press("Control+Shift+Tab");
  await expect(page.locator('[data-panel="inspector"]')).toBeVisible();
  await page.keyboard.press("F6");
  expect(
    await page.evaluate(
      () =>
        document.activeElement?.closest<HTMLElement>("[data-panel]")?.dataset
          .panel,
    ),
  ).not.toBe("inspector");
  await saveBinding("query.run", "Ctrl+Shift+J");
  await page.keyboard.press("F1");
  const help = page.getByRole("dialog", {
    name: "Keyboard shortcuts",
    exact: true,
  });
  await expect(help).toContainText("Ctrl+Shift+J");
  await help.getByRole("button", { name: "Customize...", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Customize keyboard shortcuts" });
  await expect(d).toBeVisible();
  await page.screenshot({ path: "artifacts/testing/keyboard-settings.png" });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+P");
  await page.getByRole("textbox", { name: "Find a command" }).fill("query run");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toContainText("Ctrl+Shift+J");
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".query-results-panel:visible .query-summary"),
  ).toContainText("103 displayed");
});

async function nativeKeys(keys: string[]) {
  const handle = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (w) => !w.webContents.getURL().includes("popout"),
    )!;
    w.focus();
    return w.getNativeWindowHandle().readBigInt64LE().toString();
  });
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class KeyboardTestWindow { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p); [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId(); [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach); [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h); [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int command); [DllImport("user32.dll", EntryPoint="GetWindowThreadProcessId")] static extern uint WindowProcess(IntPtr h, out uint id); public static bool OwnsForeground(IntPtr h) { uint expected, actual; WindowProcess(h, out expected); var foreground=GetForegroundWindow(); WindowProcess(foreground, out actual); return foreground!=IntPtr.Zero && expected!=0 && actual==expected; } public static void Focus(IntPtr h) { uint current=GetCurrentThreadId(), foreground=GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero); bool attached=foreground!=0 && foreground!=current && AttachThreadInput(current,foreground,true); try { ShowWindow(h,9); BringWindowToTop(h); SetForegroundWindow(h); } finally { if(attached) AttachThreadInput(current,foreground,false); } } }\'',
    "$targetHandle=[IntPtr]::new(" + handle + ")",
    "for($attempt=0; $attempt -lt 10 -and [KeyboardTestWindow]::GetForegroundWindow() -ne $targetHandle; $attempt++){[KeyboardTestWindow]::Focus($targetHandle); Start-Sleep -Milliseconds 100}",
    'if([KeyboardTestWindow]::GetForegroundWindow() -ne $targetHandle){throw "Axiom test window is not foreground; no keys were sent."}',
    ...keys.flatMap((k) => [
      'if(-not [KeyboardTestWindow]::OwnsForeground($targetHandle)){throw "Axiom lost focus; no keys were sent."}',
      "[System.Windows.Forms.SendKeys]::SendWait('" +
        k.replaceAll("'", "''") +
        "')",
      "Start-Sleep -Milliseconds 120",
    ]),
  ].join("\n");
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 15000 },
  );
}
