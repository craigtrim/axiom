import {
  test,
  expect,
  _electron as electron,
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
async function open(mode = "children", keyboard = false) {
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill("Vehicle");
  const row = page
    .locator(".tree-row")
    .filter({ has: page.locator(".tree-name", { hasText: /^Vehicle$/ }) });
  if (keyboard) {
    await row.focus();
    await page.keyboard.press("Shift+F10");
  } else await row.click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: mode === "children" ? "Add children" : "Find instances",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name:
      mode === "children"
        ? "Add children to Vehicle"
        : "Find instances of Vehicle",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function ready(mode = "children", keyboard = false) {
  const dialog = await open(mode, keyboard);
  await expect(
    dialog.getByRole("button", { name: "Find suggestions again" }),
  ).toBeVisible();
  return dialog;
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
    const behavior=JSON.parse(fs.readFileSync(${JSON.stringify(behavior)},"utf8"));
    if(process.argv.includes("--output-schema"))process.exit(3);
    const children=prompt.startsWith("Suggest useful additional types");
    const names=children?["Water vehicle","Air vehicle"]:["Apollo 15 rover"];
    if(behavior.duplicate)names.push("Car");
    const result="Summary: "+(behavior.empty?"No new additions are justified.":"Proposals for review.")+"\\nSuggestions:\\n"+(behavior.empty?"None.":names.map((label,i)=>(i+1)+". "+label+"\\nDescription: A proposed "+(children?"category":"named example")+".\\nReason: Fits the supplied background.").join("\\n\\n"));
    setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],behavior.invalid?"bad output":result),behavior.delay??20);
  });`,
  );
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  const prior = env.PATH ?? env.Path ?? "";
  delete env.Path;
  env.PATH = bin + path.delimiter + prior;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
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
  await expect(dialog).toHaveCount(0);
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
  await bridge.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    THING,
  );
  await expect(
    dialog.getByRole("button", { name: "Find suggestions again" }),
  ).toBeVisible();
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
  await dialog.getByRole("button", { name: "Find suggestions again" }).click();
  await expect(dialog).toContainText("Finding child classes");
  await menu("file.new");
  await expect(
    dialog.getByRole("button", { name: "Find suggestions again" }),
  ).toBeVisible();
  await expect(dialog).toContainText("The ontology changed.");
  expect((await state()).classCount).toBe(1);
});
test("cancels Codex, retries, and reports malformed responses without changing data", async () => {
  await writeFile(behavior, '{"delay":20000}');
  const dialog = await open();
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toContainText("Cancelled. No entities were added.");
  await writeFile(behavior, '{"invalid":true}');
  await dialog.getByRole("button", { name: "Find suggestions again" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "valid taxonomy proposal",
  );
  await writeFile(behavior, "{}");
  await dialog.getByRole("button", { name: "Find suggestions again" }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
});
test("keeps keyboard context actions and dialogs in a detached taxonomy window", async () => {
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
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
test("fits the review dialog in a small window and provides scrollable context", async ({}, info) => {
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

test("closing an active review cancels its CLI and allows a fresh request", async () => {
  await writeFile(behavior, '{"delay":20000}');
  const before = await state();
  const dialog = await open();
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await bridge.evaluate(() => window.axiom.taxonomyAssistant.status()))
          .running,
    )
    .toBe(false);
  expect((await state()).version).toBe(before.version);
  await writeFile(behavior, "{}");
  const reopened = await ready();
  await expect(
    reopened.getByRole("checkbox", { name: "Add Water vehicle", exact: true }),
  ).toBeVisible();
});
