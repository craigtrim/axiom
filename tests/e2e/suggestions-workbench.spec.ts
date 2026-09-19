import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { NS, TYPE, SUBCLASS } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import type { SuggestionDocument } from "../../src/shared/suggestions";
import AxeBuilder from "@axe-core/playwright";
const base = "https://example.org/courses#";
const ttl =
  "@prefix : <" +
  base +
  ">. @prefix owl: <" +
  NS.owl +
  ">. @prefix rdfs: <" +
  NS.rdfs +
  ">.\n" +
  ':Course a owl:Class; rdfs:label "Course".\n' +
  ':English a owl:Class; rdfs:label "English"; rdfs:subClassOf :Course.\n' +
  ':BasicEnglish a owl:Class; rdfs:subClassOf :English; rdfs:label "Basic English"; rdfs:seeAlso "BASIC ENG"@en.\n' +
  ':AlphaGamma a owl:Class; rdfs:label "Alpha Gamma".\n' +
  ':BetaGamma a owl:Class; rdfs:label "Beta Gamma".\n' +
  ':AlphaBetaGamma a owl:Class; rdfs:label "Alpha Beta Gamma".\n';
let app: ElectronApplication,
  page: Page,
  profile: string,
  file: string,
  env: Record<string, string>;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const view = (id = "taxonomy") =>
  page.locator('[data-panel="' + id + '"].suggestions-view');
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
async function launch() {
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      BrowserWindow.getAllWindows()[0].setFocusable(false);
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file + ".axiom",
    });
  }, file);
}
async function suggest(name: string, action: string) {
  await menu("view.hierarchy");
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill(name);
  const row = page.locator(".tree-row").filter({
    has: page.locator(".tree-name", {
      hasText: new RegExp("^" + name + "$"),
    }),
  });
  await row.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Suggest Sub Classes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Suggest", exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
  await expect(view()).toBeVisible();
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue(
    action === "Add Children"
      ? "children"
      : action === "Add Parents"
        ? "parents"
        : "define",
  );
}
async function doc() {
  return page.evaluate(
    (iri) =>
      window.axiom.request<SuggestionDocument>("entityDocument", { iri }),
    base + "BasicEnglish",
  );
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(
    path.resolve("artifacts/testing/suggestions-workbench-"),
  );
  file = path.join(profile, "courses.ttl");
  await writeFile(file, ttl);
  const bin = path.join(profile, "bin"),
    folder = path.join(bin, "node_modules/@openai/codex/bin");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(folder, "codex.js"),
    'import fs from "node:fs";let p="";process.stdin.on("data",d=>p+=d);process.stdin.on("end",()=>{const custom=p.startsWith("Propose values");const result=custom?JSON.stringify({suggestions:[{value:"Foundations of English",reason:"Clear alternative wording."}]}):"Summary: Useful child class.\\nSuggestions:\\n1. Conversational English\\nDescription: English for conversation.\\nReason: Fits immediately below the selected class.";setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],result),1800);});',
  );
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({
      version: 1,
      panelState: { "assistant.provider": "codex" },
    }),
  );
  env = { ...process.env, AXIOM_USER_DATA: profile } as Record<string, string>;
  const prior = env.PATH ?? env.Path ?? "";
  delete env.Path;
  env.PATH = bin + path.delimiter + prior;
  delete env.ELECTRON_RUN_AS_NODE;
  await launch();
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "BasicEnglish"),
    )
    .toBe(true);
});
test.afterEach(async ({}, info) => {
  if (app) {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    await app.close();
  }
  expect(errors).toEqual([]);
});
test("uses a native-menu title bar with the absolute path and keeps palette shortcuts", async () => {
  await expect(page.getByTestId("window-titlebar")).toContainText(
    "Axiom | " + file,
  );
  await expect(
    page.getByTestId("window-titlebar").locator("strong"),
  ).toHaveText("courses.ttl");
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getTitle(),
    ),
  ).toContain("Axiom | " + file);
  for (const name of [
    "New class",
    "New individual",
    "Undo",
    "Redo",
    "Save",
    "Command palette",
  ])
    await expect(
      page.locator(".command-bar").getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Application menus" })
      .getByRole("button", { name: "View", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+Shift+P");
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await menu("palette");
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await menu("keyboard.settings");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/testing/suggestions-title.png" });
});
test("orders current predicates first, excludes rdf:type and saves seeAlso text or links", async () => {
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "BasicEnglish",
  );
  await menu("view.details");
  const details = page.getByRole("region", { name: "Details", exact: true });
  const existing = details
    .locator('tr[data-predicate="' + NS.rdfs + 'seeAlso"]')
    .getByRole("combobox", { name: /Value/ });
  await existing.fill("Basic English reference");
  await existing.press("Enter");
  await expect
    .poll(
      async () =>
        (await doc()).statements.find(
          (t) => t.object.value === "Basic English reference",
        )?.object.language,
    )
    .toBe("en");
  await details.getByRole("button", { name: "Add row", exact: true }).click();
  const row = details.locator("tbody tr").last(),
    predicate = row.getByRole("combobox", { name: /Predicate/ });
  expect(
    await predicate.locator("option").evaluateAll((opts) =>
      opts
        .map((o) => (o as HTMLOptionElement).value)
        .filter(Boolean)
        .slice(0, 3),
    ),
  ).toEqual([SUBCLASS, NS.rdfs + "label", NS.rdfs + "seeAlso"]);
  await expect(predicate.locator('option[value="' + TYPE + '"]')).toHaveCount(
    0,
  );
  await predicate.selectOption(NS.rdfs + "seeAlso");
  const input = row.getByRole("combobox", { name: /Value/ });
  await input.fill("Preparatory English");
  await input.press("Enter");
  await expect
    .poll(async () =>
      (await doc()).statements.some(
        (t) =>
          t.predicate === NS.rdfs + "seeAlso" &&
          t.object.literal &&
          t.object.value === "Preparatory English",
      ),
    )
    .toBe(true);
  await details.getByRole("button", { name: "Add row", exact: true }).click();
  const link = details.locator("tbody tr").last();
  await link
    .getByRole("combobox", { name: /Predicate/ })
    .selectOption(NS.rdfs + "seeAlso");
  await link.getByRole("combobox", { name: /Value/ }).fill("Alpha Gamma");
  await page
    .getByRole("listbox", { name: /Value .* matches/ })
    .getByRole("option", { name: /^Alpha Gamma/ })
    .click();
  await expect
    .poll(async () =>
      (await doc()).statements.some(
        (t) =>
          t.predicate === NS.rdfs + "seeAlso" &&
          !t.object.literal &&
          t.object.value === base + "AlphaGamma",
      ),
    )
    .toBe(true);
  await menu("file.save");
  await expect.poll(async () => (await state()).dirty).toBe(false);
});
test("uses local parent matching in the shared view, keeps histories and opens another view", async () => {
  await suggest("Alpha Beta Gamma", "Add Parents");
  await view()
    .getByRole("button", { name: "Find parents", exact: true })
    .click();
  await expect(
    view().getByRole("checkbox", { name: "Add Alpha Gamma", exact: true }),
  ).toBeVisible();
  await view()
    .getByRole("checkbox", { name: "Add Alpha Gamma", exact: true })
    .check();
  await view()
    .getByRole("button", { name: /Add selected parents/ })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "AlphaBetaGamma")
          ?.parents,
    )
    .toContain(base + "AlphaGamma");
  await view()
    .getByRole("button", { name: "Previous suggestion type" })
    .click();
  await expect(view().getByRole("heading")).toContainText("Add children");
  await view().getByRole("button", { name: "Next suggestion type" }).click();
  await expect(
    view().getByRole("checkbox", { name: "Add Alpha Gamma", exact: true }),
  ).toBeDisabled();
  await view().getByRole("button", { name: "Open another view" }).click();
  const other = page.locator('.suggestions-view[data-panel^="taxonomy:"]');
  await expect(other).toBeVisible();
  await other
    .getByRole("combobox", { name: "Suggestion type", exact: true })
    .selectOption("children");
  await menu("view.taxonomy");
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("parents");
  await menu("file.save");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  // Opening saves the active workspace first. Keep a separate snapshot to test restoration.
  await writeFile(file + ".saved.axiom", await readFile(file + ".axiom"));
  await view()
    .getByRole("combobox", { name: "Suggestion type", exact: true })
    .selectOption("children");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file + ".saved.axiom"],
    });
  }, file);
  await menu("file.open");
  await menu("view.taxonomy");
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("parents");
  await app.close();
  await launch();
  await menu("view.taxonomy");
  await expect(
    view().getByRole("checkbox", { name: "Add Alpha Gamma", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Suggestions", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("tab", { name: "Suggestions", exact: true })
    .nth(1)
    .click();
  await expect(
    page
      .locator('.suggestions-view[data-panel^="taxonomy:"]')
      .getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("children");
});
test("saves custom suggestions globally, reviews values and confines child progress to Suggestions", async () => {
  await suggest("Basic English", "Define New");
  const form = view().locator("form");
  await form.getByLabel("Name", { exact: true }).fill("Alternative names");
  await form
    .getByLabel("Instructions", { exact: true })
    .fill("Suggest clear alternative names for this course.");
  await form
    .getByLabel("Examples (optional)", { exact: true })
    .fill("Short, readable wording.");
  await form
    .getByRole("combobox", { name: "Suggestion predicate", exact: true })
    .selectOption(NS.rdfs + "seeAlso");
  await form
    .getByRole("button", { name: "Save suggestion", exact: true })
    .click();
  await view()
    .getByRole("button", { name: "Find suggestions", exact: true })
    .click();
  await expect(
    view().getByRole("checkbox", {
      name: "Add Foundations of English",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await doc()).statements.some(
      (t) => t.object.value === "Foundations of English",
    ),
  ).toBe(false);
  await view()
    .getByRole("checkbox", { name: "Add Foundations of English", exact: true })
    .check();
  await view()
    .getByRole("button", { name: /Add selected values/ })
    .click();
  await expect
    .poll(async () =>
      (await doc()).statements.some(
        (t) => t.object.value === "Foundations of English" && t.object.literal,
      ),
    )
    .toBe(true);
  await view()
    .getByRole("combobox", { name: "Suggestion type", exact: true })
    .selectOption("children");
  await view()
    .getByRole("button", { name: "Find children", exact: true })
    .click();
  await expect(view().locator('[data-assistant="taxonomy"]')).toBeVisible();
  await expect(
    page.locator('[data-pane-id="hierarchy"] .assistant-activity'),
  ).toHaveCount(0);
  await expect(
    view().getByRole("checkbox", {
      name: "Add Conversational English",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/testing/suggestions-shared-view.png",
  });
  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".suggestions-view")
    .analyze();
  expect(results.violations).toEqual([]);
  const epoch = (await state()).datasetEpoch;
  await menu("file.new");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
  expect(
    (await page.evaluate(() => window.axiom.suggestions.definitions()))[0].name,
  ).toBe("Alternative names");
  await app.close();
  await launch();
  expect(
    (await page.evaluate(() => window.axiom.suggestions.definitions()))[0].name,
  ).toBe("Alternative names");
  expect(
    JSON.parse(
      await readFile(path.join(profile, "axiom-properties.json"), "utf8"),
    ).suggestions,
  ).toHaveLength(1);
});
