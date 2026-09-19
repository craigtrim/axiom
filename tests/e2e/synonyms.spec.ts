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
  ':Course a owl:Class; rdfs:label "Course"; rdfs:seeAlso "CRS".\n' +
  ':English a owl:Class; rdfs:label "English"; rdfs:subClassOf :Course; rdfs:seeAlso "ENG".\n' +
  ':BasicEnglish a owl:Class; rdfs:subClassOf :English; rdfs:label "Basic English"; rdfs:seeAlso "BASIC ENG"@en.\n' +
  ':AdvancedEnglish a owl:Class; rdfs:label "Advanced English"; rdfs:subClassOf :English; rdfs:seeAlso "ADV ENG".\n' +
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
        : action === "Find Synonyms"
          ? "synonyms"
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
  profile = await mkdtemp(path.resolve("artifacts/testing/synonyms-"));
  file = path.join(profile, "courses.ttl");
  await writeFile(file, ttl);
  const bin = path.join(profile, "bin"),
    folder = path.join(bin, "node_modules/@openai/codex/bin");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(folder, "codex.js"),
    'import fs from "node:fs";let p="";process.stdin.on("data",d=>p+=d);process.stdin.on("end",()=>{const values=["English Basics","Basic Engl.","Advanced English","English","BASIC ENG","Introductory English"];const result={suggestions:values.map(value=>({value,reason:"A proposed wording variant."}))};setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],JSON.stringify(result)),1800);});',
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

test("finds synonyms from hierarchy context, reviews literal edits, excludes siblings and supports undo", async () => {
  await suggest("Basic English", "Find Synonyms");
  await expect(
    view().getByRole("button", { name: "Edit definition", exact: true }),
  ).toHaveCount(0);
  await view()
    .getByRole("button", { name: "Find synonyms", exact: true })
    .click();
  await expect(view().getByRole("status")).toContainText("Find Synonyms");
  await expect(
    page.locator('[data-pane-id="hierarchy"] .assistant-activity'),
  ).toHaveCount(0);
  const candidate = view().getByRole("checkbox", {
    name: "Add English Basics",
    exact: true,
  });
  await expect(candidate).toBeVisible();
  await expect(candidate).not.toBeChecked();
  await expect(view().getByRole("checkbox")).toHaveCount(2);
  await view()
    .getByText("Instructions and context for this run", { exact: true })
    .click();
  const prompt = view().locator(".suggestion-prompt");
  await expect(prompt).toContainText("BASIC ENG");
  await expect(prompt).toContainText("ADV ENG");
  await expect(prompt).toContainText("CRS");
  await expect(prompt).toContainText("plain text variant");
  await view()
    .getByText("Instructions and context for this run", { exact: true })
    .click();
  await view().getByText("Excluded suggestions (4)", { exact: true }).click();
  await expect(
    view().getByText(/Names or aliases another entity: "Advanced English"/),
  ).toBeVisible();
  const before = await doc();
  await candidate.check();
  await view()
    .getByRole("button", { name: /Add selected synonyms/ })
    .click();
  await expect
    .poll(async () =>
      (await doc()).statements.some(
        (t) =>
          t.predicate === NS.rdfs + "seeAlso" &&
          t.object.literal &&
          t.object.value === "English Basics",
      ),
    )
    .toBe(true);
  await expect(candidate).toBeDisabled();
  expect((await doc()).entity.parents).toEqual(before.entity.parents);
  expect(
    (await doc()).statements.filter((t) => t.predicate !== NS.rdfs + "seeAlso"),
  ).toEqual(
    before.statements.filter((t) => t.predicate !== NS.rdfs + "seeAlso"),
  );
  const ax = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".suggestions-view")
    .analyze();
  expect(ax.violations).toEqual([]);
  await page.screenshot({ path: "artifacts/testing/synonyms-review.png" });
  await menu("edit.undo");
  await expect
    .poll(async () => (await doc()).statements)
    .toEqual(before.statements);
});
test("retains synonym runs, independent views and mode through closing and reopening Axiom", async () => {
  await suggest("Basic English", "Find Synonyms");
  await view()
    .getByRole("button", { name: "Find synonyms", exact: true })
    .click();
  await expect(
    view().getByRole("checkbox", { name: "Add English Basics", exact: true }),
  ).toBeVisible();
  const run = await page.evaluate(
    async () => (await window.axiom.suggestions.history())[0],
  );
  await view()
    .getByRole("button", { name: "Previous suggestion type" })
    .click();
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("parents");
  await view().getByRole("button", { name: "Next suggestion type" }).click();
  await expect(
    view().getByRole("checkbox", { name: "Add English Basics", exact: true }),
  ).toBeVisible();
  await view().getByRole("button", { name: "Open another view" }).click();
  const other = page.locator('.suggestions-view[data-panel^="taxonomy:"]');
  await expect(other).toBeVisible();
  await other
    .getByRole("combobox", { name: "Suggestion type", exact: true })
    .selectOption("parents");
  await menu("view.taxonomy");
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("synonyms");
  await app.close();
  await launch();
  await menu("view.taxonomy");
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("synonyms");
  await expect(
    view().getByRole("checkbox", { name: "Add English Basics", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await window.axiom.suggestions.history())[0],
    ),
  ).toEqual(run);
  await view()
    .getByRole("checkbox", { name: "Add Basic Engl.", exact: true })
    .check();
  await view()
    .getByRole("button", { name: /Add selected synonyms/ })
    .click();
  await expect
    .poll(async () =>
      (await doc()).statements.some(
        (t) => t.object.literal && t.object.value === "Basic Engl.",
      ),
    )
    .toBe(true);
});
test("blocks a stale candidate when a sibling acquires its alias after the run", async () => {
  await suggest("Basic English", "Find Synonyms");
  await view()
    .getByRole("button", { name: "Find synonyms", exact: true })
    .click();
  await expect(
    view().getByRole("checkbox", { name: "Add English Basics", exact: true }),
  ).toBeVisible();
  await page.evaluate(
    async ({ iri, predicate }) => {
      const d = await window.axiom.request<SuggestionDocument>(
        "entityDocument",
        { iri },
      );
      await window.axiom.request("updateEntity", {
        iri,
        nextIri: iri,
        version: d.version,
        datasetEpoch: d.datasetEpoch,
        preserveSelection: true,
        statements: [
          ...d.statements,
          {
            subject: iri,
            predicate,
            object: { literal: true, value: "English Basics" },
          },
        ],
      });
    },
    { iri: base + "AdvancedEnglish", predicate: NS.rdfs + "seeAlso" },
  );
  await view()
    .getByRole("checkbox", { name: "Add English Basics", exact: true })
    .check();
  await view()
    .getByRole("button", { name: /Add selected synonyms/ })
    .click();
  await expect(
    view().getByText(/These suggestions no longer pass the synonym checks/),
  ).toBeVisible();
  expect(
    (await doc()).statements.some((t) => t.object.value === "English Basics"),
  ).toBe(false);
});

test("opens Find Synonyms from the graph node menu and offers a separate new run", async () => {
  await page.evaluate(async (iri) => {
    await window.axiom.request("seed", { iris: [iri], expand: false });
    await window.axiom.request("select", { iri });
  }, base + "BasicEnglish");
  await menu("view.graph");
  await menu("graph.fit");
  const canvas = page.getByTestId("graph-canvas");
  await canvas.focus();
  await canvas.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Graph node actions" })
    .getByRole("menuitem", { name: "Suggest", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Find Synonyms", exact: true })
    .click();
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("synonyms");
  await view()
    .getByRole("button", { name: "Find synonyms", exact: true })
    .click();
  await expect(
    view().getByRole("checkbox", { name: "Add English Basics", exact: true }),
  ).toBeVisible();
  await view().getByRole("button", { name: "New run", exact: true }).click();
  await expect(view().getByRole("status")).toBeVisible();
  await expect(view().getByRole("status")).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        (await window.axiom.suggestions.history()).filter(
          (r) => r.mode === "synonyms",
        ).length,
    ),
  ).toBe(2);
});
