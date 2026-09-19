import { launchExample } from "./example-fixture";
import {
  test,
  _electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { THING, TYPE, SUBCLASS } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication,
  page: Page,
  bridge: Page,
  profile: string,
  behavior: string,
  vehicle: string;
let launchEnv: Record<string, string>;
const errors: string[] = [];
const state = () =>
  bridge.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function open(mode = "children", keyboard = false, label = "Vehicle") {
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill(label);
  const row = page.locator(".tree-row").filter({
    has: page.locator(".tree-name", {
      hasText: new RegExp("^" + label + "$", "i"),
    }),
  });
  if (keyboard) {
    await row.focus();
    await page.keyboard.press("Shift+F10");
  } else await row.click({ button: "right" });
  if (mode === "children")
    await page.getByRole("menuitem", { name: "Suggest", exact: true }).click();
  await page
    .getByRole("menuitem", {
      name: mode === "children" ? "Add Children" : "Find instances",
      exact: true,
    })
    .click();
  const view = bridge.getByRole("region", { name: "Taxonomy suggestions" });
  await expect(view).toBeVisible();
  await expect(view.getByRole("heading")).toContainText(label);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return view;
}
async function ready(mode = "children", keyboard = false) {
  const view = await open(mode, keyboard);
  await view
    .getByRole("button", {
      name: mode === "children" ? "Find children" : "Find instances",
      exact: true,
    })
    .click();
  await expect(
    view.getByRole("button", { name: "New run", exact: true }),
  ).toBeEnabled();
  return view;
}

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/taxonomy-"));
  behavior = path.join(profile, "behavior.json");
  await writeFile(behavior, "{}");
  const bin = path.join(profile, "bin"),
    folder = path.join(bin, "node_modules/@openai/codex/bin");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(folder, "codex.js"),
    `import fs from "node:fs";let prompt="";process.stdin.on("data",d=>prompt+=d);process.stdin.on("end",()=>{
    fs.writeFileSync(${JSON.stringify(path.join(profile, "prompt.txt"))},prompt);
    fs.appendFileSync(${JSON.stringify(path.join(profile, "calls.txt"))},"run\\n");
    const behavior=JSON.parse(fs.readFileSync(${JSON.stringify(behavior)},"utf8"));
    if(process.argv.includes("--output-schema"))process.exit(3);
    const children=prompt.startsWith("Suggest useful additional types");
    const names=children?["Water vehicle","Air vehicle"]:["Apollo 15 rover"];
    if(behavior.duplicate)names.push("Car");
    const result="Summary: "+(behavior.empty?"No new additions are justified.":"Proposals for review.")+"\\nSuggestions:\\n"+(behavior.empty?"None.":names.map((label,i)=>(i+1)+". "+label+"\\nDescription: A proposed "+(children?"category":"named example")+".\\nReason: Fits the supplied background.").join("\\n\\n"));
    setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],behavior.invalid?"bad output":result),behavior.delay??20);
  });`,
  );
  // These fixtures exercise Codex explicitly; new profiles default to Claude.
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({
      version: 1,
      panelState: { "assistant.provider": "codex" },
    }),
  );
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  const prior = env.PATH ?? env.Path ?? "";
  delete env.Path;
  env.PATH = bin + path.delimiter + prior;
  delete env.ELECTRON_RUN_AS_NODE;
  launchEnv = env;
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        window.setFocusable(false);
    });
  page = await app.firstWindow();
  bridge = page;
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  const epoch = (await state()).datasetEpoch;
  await menu("file.new");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
  vehicle = await page.evaluate(async (root) => {
    const vehicle = await window.axiom.request<string>("createClass", {
      name: "Vehicle",
      parent: root,
    });
    const land = await window.axiom.request<string>("createClass", {
      name: "Land vehicle",
      parent: vehicle,
    });
    await window.axiom.request("createClass", { name: "Car", parent: land });
    await window.axiom.request("select", { iri: vehicle });
    return vehicle;
  }, THING);
  await menu("view.hierarchy");
});
test.afterEach(async ({}, info) => {
  if (app) {
    try {
      if (info.status !== info.expectedStatus && page && !page.isClosed())
        await info.attach("desktop", {
          body: await page.screenshot(),
          contentType: "image/png",
        });
    } finally {
      await app.close();
    }
  }
  expect(errors).toEqual([]);
});
test("reviews child classes, shows scoped prompt, adds normalized names and undoes the whole batch", async () => {
  const before = await state();
  const dialog = await ready();
  await page.screenshot({ path: "artifacts/testing/taxonomy-view.png" });
  expect((await state()).classCount).toBe(before.classCount);
  await dialog.getByText(/^Context sent to Codex/).click();
  await expect(dialog).toContainText("Thing");
  await expect(dialog).toContainText("Land vehicle");
  await expect(dialog).toContainText("depth 2");
  const prompt = await readFile(path.join(profile, "prompt.txt"), "utf8");
  expect(prompt).toContain("types that fit better inside an existing category");
  expect(prompt).not.toContain("parentIri");
  expect(prompt).not.toContain("rdfs:subClassOf");
  expect(prompt).toContain('"Car" is a kind of "Land vehicle"');
  expect(prompt).not.toContain("Pizza_");
  await dialog
    .getByRole("checkbox", { name: "Select all available suggestions" })
    .check();
  await dialog.getByRole("button", { name: /^Add selected children/ }).click();
  await expect(dialog).toContainText("2 added");
  await expect(
    dialog.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeDisabled();
  const after = await state();
  const created = after.entities.filter((e) =>
    ["Water vehicle", "Air vehicle"].includes(e.name),
  );
  expect(created).toHaveLength(2);
  expect(created.map((e) => e.parents)).toEqual([[vehicle], [vehicle]]);
  expect(created.every((e) => e.kind === "Class")).toBe(true);
  expect(created.map((e) => e.iri.split("#")[1])).toEqual([
    "WaterVehicle",
    "AirVehicle",
  ]);
  await expect(
    page.locator(".tree-name").filter({ hasText: /^Water vehicle$/ }),
  ).toBeVisible();
  expect(after.undoLabel).toBe("Add child classes");
  await menu("edit.undo");
  expect((await state()).classCount).toBe(before.classCount);
  await menu("edit.redo");
  expect((await state()).classCount).toBe(before.classCount + 2);
});
test("finds instances through a separate prompt and applies rdf:type without subclass assertions", async () => {
  const dialog = await ready("instances");
  expect(await readFile(path.join(profile, "prompt.txt"), "utf8")).toContain(
    "Suggest real, named examples",
  );
  await dialog
    .getByRole("checkbox", { name: "Add Apollo 15 rover", exact: true })
    .check();
  await dialog.getByRole("button", { name: /^Add selected instances/ }).click();
  const e = (await state()).entities.find((e) => e.name === "Apollo 15 rover")!;
  expect(e.kind).toBe("Individual");
  expect(e.types).toEqual([vehicle]);
  const document = await bridge.evaluate(
    (iri) =>
      window.axiom.request<{
        statements: { predicate: string; object: { value: string } }[];
      }>("entityDocument", { iri }),
    e.iri,
  );
  expect(
    document.statements.some(
      (t) => t.predicate === TYPE && t.object.value === vehicle,
    ),
  ).toBe(true);
  expect(document.statements.some((t) => t.predicate === SUBCLASS)).toBe(false);
});
test("accepts zero suggestions without adding anything", async () => {
  await writeFile(behavior, '{"empty":true}');
  const before = await state(),
    dialog = await ready();
  await expect(dialog).toContainText("No new direct children suggested.");
  await expect(
    dialog.getByRole("button", { name: /^Add selected/ }),
  ).toHaveCount(0);
  expect((await state()).version).toBe(before.version);
});
test("blocks duplicates and preserves the right-clicked parent when selection changes during generation", async () => {
  await writeFile(behavior, '{"duplicate":true,"delay":800}');
  const dialog = await open();
  await dialog
    .getByRole("button", { name: "Find children", exact: true })
    .click();
  await bridge.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    THING,
  );
  await expect(dialog.getByRole("button", { name: "New run" })).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "Add Car", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "Add Water vehicle", exact: true })
    .check();
  await dialog.getByRole("button", { name: /^Add selected/ }).click();
  expect(
    (await state()).entities.find((e) => e.name === "Water vehicle")?.parents,
  ).toEqual([vehicle]);
});
test("rejects stale proposals and retains the ontology when it changes during or after generation", async () => {
  const dialog = await ready();
  await dialog
    .getByRole("checkbox", { name: "Add Water vehicle", exact: true })
    .check();
  await bridge.evaluate(
    (root) =>
      window.axiom.request("createClass", {
        name: "External change",
        parent: root,
      }),
    THING,
  );
  await expect(
    dialog.getByRole("button", { name: /^Add selected/ }),
  ).toBeDisabled();
  await expect(dialog).toContainText("The ontology changed.");
  const status = await bridge.evaluate(() =>
    window.axiom.taxonomyAssistant.status(),
  );
  await expect(
    bridge.evaluate(
      (id) => window.axiom.taxonomyAssistant.apply(id, [0]),
      status.response!.id,
    ),
  ).rejects.toThrow(/ontology changed/);
  await writeFile(behavior, '{"delay":1500}');
  await dialog.getByRole("button", { name: "New run" }).click();
  await expect(
    bridge.locator(
      '[data-pane-id="taxonomy"] .taxonomy-panel > .assistant-activity',
    ),
  ).toContainText("Finding child classes");
  await menu("file.new");
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(false);
  await menu("view.taxonomy");
  await expect(dialog).toContainText("Right-click a class");
  expect((await state()).classCount).toBe(1);
});
test("cancels Codex, retries, and reports malformed responses without changing data", async () => {
  await writeFile(behavior, '{"delay":20000}');
  const dialog = await open();
  await dialog
    .getByRole("button", { name: "Find children", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(true);
  await bridge
    .locator('[data-pane-id="taxonomy"]')
    .getByRole("button", { name: "Cancel suggestions", exact: true })
    .click();
  await expect(dialog).toContainText("cancelled");
  await expect(dialog.getByRole("button", { name: "New run" })).toBeEnabled();
  await writeFile(behavior, '{"invalid":true}');
  await dialog.getByRole("button", { name: "New run" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "valid taxonomy proposal",
  );
  await writeFile(behavior, "{}");
  await dialog.getByRole("button", { name: "New run" }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
});
test("opens the dockable view from a keyboard context action in detached Hierarchy", async () => {
  const childPromise = app.waitForEvent("window");
  await menu("pane.detach");
  page = await childPromise;
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("popout"))!
      .setSize(400, 400),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  const dialog = await ready("children", true);
  await expect(bridge.getByRole("dialog")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("fits the dockable view in a small window and provides scrollable context", async ({}, info) => {
  const dialog = await ready();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(900, 640),
  );
  await dialog.getByText(/^Context sent to Codex/).click();
  await dialog.getByText("Exact prompt", { exact: true }).click();
  const box = await dialog.boundingBox();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(box!.width).toBeLessThan(viewport.width);
  expect(box!.height).toBeLessThan(viewport.height);
  await expect(
    dialog.getByRole("textbox", { name: "Taxonomy prompt" }),
  ).toHaveValue(/BACKGROUND/);
  await info.attach("compact-review", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("closing a running view keeps the job and restores its completed result", async () => {
  await writeFile(behavior, '{"delay":1800}');
  const view = await open();
  await view
    .getByRole("button", { name: "Find children", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(true);
  await menu("pane.close");
  await expect(view).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(false);
  const reopened = await open();
  await expect(
    reopened.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
  expect(
    (await readFile(path.join(profile, "calls.txt"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(1);
});

test("keeps separate histories, opens the latest run, and browses an earlier run on another node", async () => {
  const view = await ready();
  const first = await view
    .getByRole("combobox", { name: "Run history" })
    .inputValue();
  await writeFile(behavior, '{"empty":true}');
  await view.getByRole("button", { name: "New run" }).click();
  await expect(view).toContainText("No new direct children suggested.");
  const second = await view
    .getByRole("combobox", { name: "Run history" })
    .inputValue();
  expect(second).not.toBe(first);
  await open("children", false, "Land vehicle");
  await expect(
    view.getByRole("button", { name: "Find children", exact: true }),
  ).toBeEnabled();
  await expect(view).not.toContainText("No new direct children suggested.");
  // Browsing history does not run a provider or change selection in the ontology.
  await view.getByRole("combobox", { name: "Run history" }).selectOption(first);
  await expect(view.getByRole("heading")).toContainText("Vehicle");
  await expect(
    view.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
  await open();
  await expect(view.getByRole("combobox", { name: "Run history" })).toHaveValue(
    second,
  );
  await expect(view).toContainText("No new direct children suggested.");
  expect(
    (await readFile(path.join(profile, "calls.txt"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(2);
});

test("switching nodes during a run leaves the new node fresh and preserves the original result", async () => {
  await writeFile(behavior, '{"delay":1600}');
  const view = await open();
  await view
    .getByRole("button", { name: "Find children", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(true);
  await open("children", false, "Land vehicle");
  await expect(view.getByRole("heading")).toContainText("Land vehicle");
  await expect(
    view.getByRole("button", { name: "Find children", exact: true }),
  ).toBeDisabled();
  await expect(
    view.getByRole("button", { name: "Find children", exact: true }),
  ).toBeEnabled();
  await expect(
    view.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toHaveCount(0);
  await open();
  await expect(
    view.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
});

test("restores history after restart and applies a retained proposal without another assistant run", async () => {
  const view = await ready();
  const id = await view
    .getByRole("combobox", { name: "Run history" })
    .inputValue();
  const workspace = path.join(profile, "history.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, workspace);
  await menu("file.saveAs");
  await expect
    .poll(async () => {
      try {
        return (await readFile(workspace)).length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  await app.close();
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env: launchEnv,
  });
  page = await app.firstWindow();
  bridge = page;
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      BrowserWindow.getAllWindows().forEach((w) => w.setFocusable(false));
  });
  await expect(
    page.getByRole("region", { name: "Taxonomy suggestions" }),
  ).toBeVisible();
  const restored = page.getByRole("region", { name: "Taxonomy suggestions" });
  await expect(
    restored.getByRole("combobox", { name: "Run history" }),
  ).toHaveValue(id);
  await restored
    .getByRole("checkbox", { name: "Add Water vehicle", exact: true })
    .check();
  await restored
    .getByRole("button", { name: /^Add selected children/ })
    .click();
  await expect(restored).toContainText("1 added");
  expect(
    (await state()).entities.find((e) => e.name === "Water vehicle")?.parents,
  ).toEqual([vehicle]);
  expect(
    (await readFile(path.join(profile, "calls.txt"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(1);
});

test("detaches Suggestions with its history and keeps the run controls usable in a narrow view", async () => {
  await ready();
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await waiting;
  child.on("pageerror", (e) => errors.push(e.message));
  await (
    await app.browserWindow(child)
  ).evaluate((w) => {
    w.setMinimumSize(320, 240);
    w.setContentSize(500, 600);
    if (process.env.AXIOM_TEST_BACKGROUND === "1") w.setFocusable(false);
  });
  const view = child.getByRole("region", { name: "Taxonomy suggestions" });
  await expect(
    view.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
  const first = await view
    .getByRole("combobox", { name: "Run history" })
    .inputValue();
  await view.getByRole("button", { name: "New run", exact: true }).click();
  await expect(
    view.getByRole("button", { name: "New run", exact: true }),
  ).toBeEnabled();
  await expect(
    view.getByRole("combobox", { name: "Run history" }),
  ).not.toHaveValue(first);
  await view.getByRole("combobox", { name: "Run history" }).selectOption(first);
  await expect(
    view.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
  await child.screenshot({
    path: "artifacts/testing/taxonomy-view-detached.png",
  });
  expect(await view.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});

test("surfaces a failed run's audit on request and retains its raw reply after retry and restart", async () => {
  await writeFile(behavior, '{"invalid":true}');
  const view = await ready();
  await expect(view.getByRole("alert")).toContainText(
    "valid taxonomy proposal",
  );
  await expect(view.getByRole("alert")).not.toContainText(
    "Error invoking remote method",
  );
  await expect(
    page.getByRole("region", { name: "Error log", exact: true }),
  ).toHaveCount(0);
  const failedRun = await view
    .getByRole("combobox", { name: "Run history" })
    .inputValue();
  await view
    .getByRole("button", { name: "Error details", exact: true })
    .click();
  const logs = page.getByRole("region", { name: "Error log", exact: true });
  await expect(logs).toBeVisible();
  await expect(view).toBeHidden();
  await expect(logs).toContainText("Parsing taxonomy proposal");
  await page.screenshot({ path: "artifacts/testing/error-audit-summary.png" });
  const reference = await logs
    .getByRole("combobox", { name: "Error history" })
    .inputValue();
  const record = await bridge.evaluate(
    (id) => window.axiom.audit.read(id),
    reference,
  );
  expect(record.details["Assistant response"]).toBe("bad output");
  expect(record.metadata.entity).toBe("Vehicle");
  expect(record.metadata.exitCode).toBe(0);
  expect(path.isAbsolute(record.file!)).toBe(true);
  expect(JSON.parse(await readFile(record.file!, "utf8")).record.id).toBe(
    reference,
  );
  await expect(logs.getByText("bad output", { exact: true })).toBeHidden();
  await logs.getByText("Assistant response", { exact: true }).click();
  await expect(logs.getByText("bad output", { exact: true })).toBeVisible();
  await logs.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(
    logs.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied).toContain(reference);
  expect(copied).toContain("bad output");
  expect(copied).toContain("Suggest useful additional types");
  await app.evaluate(({ shell }) => {
    shell.showItemInFolder = (file) => {
      (globalThis as any).revealedAudit = file;
    };
  });
  await logs
    .getByRole("button", { name: "Show log file", exact: true })
    .click();
  expect(await app.evaluate(() => (globalThis as any).revealedAudit)).toBe(
    record.file,
  );
  await page.screenshot({ path: "artifacts/testing/error-audit-view.png" });
  await menu("view.taxonomy");
  await writeFile(behavior, "{}");
  await view.getByRole("button", { name: "New run", exact: true }).click();
  await expect(
    view.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
  const workspace = path.join(profile, "audited.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, workspace);
  await menu("file.saveAs");
  await expect
    .poll(async () => {
      try {
        return (await readFile(workspace)).length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  await app.close();
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env: launchEnv,
  });
  page = await app.firstWindow();
  bridge = page;
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      BrowserWindow.getAllWindows().forEach((w) => w.setFocusable(false));
  });
  const restored = page.getByRole("region", { name: "Taxonomy suggestions" });
  await expect(restored).toBeVisible();
  await restored
    .getByRole("combobox", { name: "Run history" })
    .selectOption(failedRun);
  await restored
    .getByRole("button", { name: "Error details", exact: true })
    .click();
  const restoredLogs = page.getByRole("region", {
    name: "Error log",
    exact: true,
  });
  await expect(
    restoredLogs.getByRole("combobox", { name: "Error history" }),
  ).toHaveValue(reference);
  await restoredLogs.getByText("Assistant response", { exact: true }).click();
  await expect(
    restoredLogs.getByText("bad output", { exact: true }),
  ).toBeVisible();
  expect(
    (await readFile(path.join(profile, "calls.txt"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(2);
});

test("exposes non-assistant operation failures through View Error log without changing the ontology", async () => {
  const before = await state();
  await expect(
    bridge.evaluate(() =>
      window.axiom.request("rename", { iri: "urn:missing", name: "Missing" }),
    ),
  ).rejects.toThrow();
  await menu("view.errorlog");
  const logs = page.getByRole("region", { name: "Error log", exact: true });
  await expect(logs).toContainText("Ontology: rename");
  const summaries = await bridge.evaluate(() => window.axiom.audit.list());
  expect(summaries.some((e) => e.operation === "Ontology: rename")).toBe(true);
  expect((await state()).version).toBe(before.version);
});

test("opens the matching audit from a native file-operation error dialog", async () => {
  const before = await state();
  const missing = path.join(profile, "missing-workspace.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async (
      windowOrOptions: Electron.BaseWindow | Electron.MessageBoxOptions,
      options?: Electron.MessageBoxOptions,
    ) => {
      const details =
        options ?? (windowOrOptions as Electron.MessageBoxOptions);
      if (details.type === "error") (globalThis as any).auditDialog = details;
      return { response: 1, checkboxChecked: false };
    };
  }, missing);
  await menu("file.open");
  const logs = page.getByRole("region", { name: "Error log", exact: true });
  await expect(logs).toBeVisible();
  await expect(logs).toContainText("missing-workspace.axiom");
  const dialog = await app.evaluate(() => (globalThis as any).auditDialog);
  expect(dialog.buttons).toEqual(["Close", "Error details"]);
  const reference = await logs
    .getByRole("combobox", { name: "Error history" })
    .inputValue();
  const record = await bridge.evaluate(
    (id) => window.axiom.audit.read(id),
    reference,
  );
  expect(record.message).toContain(missing);
  expect(record.details["Technical error"]).toContain("ENOENT");
  expect((await state()).version).toBe(before.version);
});

test("sends only 20 sampled children and 20 sampled descendants and retains the exact sample in history", async () => {
  const namespace = (await state()).ontology.namespace;
  const file = path.join(profile, "wide-branch.ttl");
  const triples = [
    "@prefix : <" +
      namespace +
      ">. @prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.",
    ':Vehicle a owl:Class; rdfs:label "Vehicle".',
    ...Array.from(
      { length: 143 },
      (_, i) =>
        ":Child" +
        i +
        ' a owl:Class; rdfs:label "Child ' +
        i +
        '"; rdfs:subClassOf :Vehicle.',
    ),
    ...Array.from(
      { length: 229 },
      (_, i) =>
        ":Deeper" +
        i +
        ' a owl:Class; rdfs:label "Deeper ' +
        i +
        '"; rdfs:subClassOf :Child' +
        (i % 143) +
        ".",
    ),
  ];
  await writeFile(file, triples.join("\n"));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("wide-branch.ttl");
  const view = await open();
  await expect(view.getByText(/^Context preview for Codex/)).toContainText(
    "20 of 143 children · 20 of 372 descendants",
  );
  await view
    .getByRole("button", { name: "Find children", exact: true })
    .click();
  await expect(
    view.getByRole("button", { name: "New run", exact: true }),
  ).toBeEnabled();
  await view.getByText(/^Context sent to Codex/).click();
  await expect(view.getByText(/^Context sent to Codex/)).toContainText(
    "20 of 143 children · 20 of 372 descendants",
  );
  const id = await view
    .getByRole("combobox", { name: "Run history" })
    .inputValue();
  const { entry, stale } = await page.evaluate(
    (id) => window.axiom.taxonomyAssistant.read(id),
    id,
  );
  expect(stale).toBe(false);
  expect(entry.context.directChildren).toHaveLength(20);
  expect(entry.context.descendants).toHaveLength(20);
  expect(entry.context.sample).toEqual({ children: 143, descendants: 372 });
  const sent = await readFile(path.join(profile, "prompt.txt"), "utf8");
  expect(sent).toBe(entry.prompt);
  expect(sent).toContain("20 of 143 direct children; 20 of 372 descendants");
  expect(sent).not.toContain("All narrower categories:");
  await view.getByText("Exact prompt", { exact: true }).click();
  await expect(
    view.getByRole("textbox", { name: "Taxonomy prompt" }),
  ).toHaveValue(sent);
  await page.screenshot({
    path: "artifacts/testing/taxonomy-sampled-context.png",
  });
  await view.getByRole("button", { name: "New run", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.taxonomyAssistant.history()))
          .length,
    )
    .toBe(2);
  await expect(
    view.getByRole("button", { name: "New run", exact: true }),
  ).toBeEnabled();
  await view.getByRole("combobox", { name: "Run history" }).selectOption(id);
  await expect(
    view.getByRole("textbox", { name: "Taxonomy prompt" }),
  ).toHaveValue(sent);
  await view
    .getByRole("checkbox", { name: "Add Water vehicle", exact: true })
    .check();
  await view.getByRole("button", { name: /^Add selected children/ }).click();
  await expect(view).toContainText("1 added");
});
