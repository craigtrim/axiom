import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { NS, TYPE, SUBCLASS, THING } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import type { SuggestionDocument } from "../../src/shared/suggestions";
import type { SuggestionRun } from "../../src/shared/suggestions";
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
  ':AmericanHistory a owl:Class; rdfs:label "American History To 1877".\n' +
  ':SystemsAdministration a owl:Class; rdfs:label "Systems Administration".\n' +
  ':SystemAdministration a owl:Class; rdfs:label "System Administration".\n' +
  ':Sociology a owl:Class; rdfs:label "Sociology".\n' +
  ':Workplace a owl:Class; rdfs:label "Multiculturalism at Work"; rdfs:subClassOf owl:Thing.\n' +
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
    'import fs from "node:fs";let p="";process.stdin.on("data",d=>p+=d);process.stdin.on("end",()=>{const values=p.startsWith("Suggest synonyms for "+JSON.stringify("American History To 1877"))?["American History to 1877","American History To 1877","US History to 1877","us history TO 1877","American History Before 1877","American History To 1877."]:p.startsWith("Suggest synonyms for "+JSON.stringify("Systems Administration"))?["System Admin","Systems Admin","System Administration"]:["English Basics","Basic Engl.","Advanced English","English","BASIC ENG","Introductory English"];const result=p.startsWith("Suggest parents for")?{suggestions:p.split("\\n").filter(l=>l.startsWith("[\\\"c")).map(l=>JSON.parse(l)).filter(r=>["Alpha Gamma","Beta Gamma","Sociology"].includes(r[1])).map(r=>({value:r[0],reason:"The class belongs within this broader subject."}))}:{suggestions:values.map(value=>({value,reason:"A proposed wording variant."}))};setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],JSON.stringify(result)),1800);});',
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

test("finds synonyms from hierarchy context, reviews literal edits, leaves synonym decisions to the user and supports undo", async () => {
  await suggest("Basic English", "Find Synonyms");
  await expect(
    view().getByRole("button", { name: "Edit definition", exact: true }),
  ).toHaveCount(0);
  await expect(view().locator(".assistant-activity")).toContainText(
    "Find Synonyms",
  );
  await expect(
    page.locator('[data-pane-id="hierarchy"] .assistant-activity'),
  ).toHaveCount(0);
  const candidate = view().getByRole("checkbox", {
    name: "Select English Basics",
    exact: true,
  });
  await expect(candidate).toBeVisible();
  await expect(candidate).not.toBeChecked();
  await expect(view().getByRole("checkbox")).toHaveCount(7);
  await expect(
    view().getByRole("button", { name: "Already exist 1", exact: true }),
  ).toBeVisible();
  await expect(
    view().getByRole("checkbox", {
      name: "BASIC ENG, Exists, cannot be added",
    }),
  ).toBeDisabled();
  const table = view().getByRole("table", { name: "Suggested synonyms" });
  const box = await table.boundingBox();
  await view().getByRole("button", { name: "Context", exact: true }).click();
  const context = page.getByRole("dialog", {
    name: "Context sent to the assistant",
  });
  await context.getByText("Exact prompt", { exact: true }).click();
  const prompt = context.getByRole("textbox", { name: "Synonym prompt" });
  for (const text of ["BASIC ENG", "ADV ENG", "CRS", "plain text variant"])
    await expect(prompt).toHaveValue(new RegExp(text));
  expect(await table.boundingBox()).toEqual(box);
  await page.keyboard.press("Escape");
  await view().getByRole("button", { name: "Analysis", exact: true }).click();
  const analysis = page.getByRole("dialog", {
    name: "Why Codex proposed these",
  });
  await expect(analysis).toContainText("Choose the synonyms you want to add.");
  await page.keyboard.press("Escape");
  await view()
    .getByRole("button", { name: "Available 5", exact: true })
    .click();
  await view().getByRole("searchbox").fill("Basics");
  await view()
    .getByRole("checkbox", { name: "Select all available suggestions" })
    .check();
  await expect(candidate).toBeChecked();
  await view().getByRole("searchbox").clear();
  await expect(
    view().getByRole("checkbox", { name: "Select Basic Engl.", exact: true }),
  ).not.toBeChecked();
  await view().getByRole("button", { name: "All 6", exact: true }).click();
  const before = await doc();
  await candidate.check();
  await view()
    .getByRole("button", { name: "Add 1 synonym", exact: true })
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
  await expect(
    view().getByRole("checkbox", {
      name: "English Basics, Added, cannot be added",
    }),
  ).toBeDisabled();
  await expect(view()).toContainText("1 synonym added to Basic English");
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
  await expect(
    view().getByRole("checkbox", {
      name: "Select English Basics",
      exact: true,
    }),
  ).toBeVisible();
  const firstRun = await page.evaluate(
    async () => (await window.axiom.suggestions.history())[0],
  );
  await view()
    .getByRole("combobox", { name: "Suggestion type", exact: true })
    .selectOption("parents");
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("parents");
  await view()
    .getByRole("combobox", { name: "Suggestion type", exact: true })
    .selectOption("synonyms");
  await expect(
    view().getByRole("checkbox", {
      name: "Select English Basics",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.suggestions.history())).filter(
          (r) => r.mode === "synonyms" && r.state !== "running",
        ).length,
    )
    .toBe(2);
  const synonymRuns = await page.evaluate(async () =>
    (await window.axiom.suggestions.history()).filter(
      (r) => r.mode === "synonyms",
    ),
  );
  expect(synonymRuns.some((r) => r.id === firstRun.id)).toBe(true);
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
  await expect
    .poll(
      async () => await page.evaluate(() => window.axiom.suggestions.status()),
    )
    .toBeUndefined();
  const beforeRestart = await page.evaluate(() =>
    window.axiom.suggestions.history(),
  );
  await app.close();
  await launch();
  await menu("view.taxonomy");
  await expect(
    view().getByRole("combobox", { name: "Suggestion type", exact: true }),
  ).toHaveValue("synonyms");
  await expect(
    view().getByRole("checkbox", {
      name: "Select English Basics",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.axiom.suggestions.history())).toEqual(
    beforeRestart,
  );
  await view()
    .getByRole("checkbox", { name: "Select Basic Engl.", exact: true })
    .check();
  await view()
    .getByRole("button", { name: "Add 1 synonym", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await doc()).statements.some(
        (t) => t.object.literal && t.object.value === "Basic Engl.",
      ),
    )
    .toBe(true);
});
test("allows a user-selected synonym even when a sibling acquires it after the run", async () => {
  await suggest("Basic English", "Find Synonyms");
  await expect(
    view().getByRole("checkbox", {
      name: "Select English Basics",
      exact: true,
    }),
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
    .getByRole("checkbox", { name: "Select English Basics", exact: true })
    .check();
  await view()
    .getByRole("button", { name: "Add 1 synonym", exact: true })
    .click();
  await expect(
    view().getByRole("checkbox", {
      name: "English Basics, Added, cannot be added",
    }),
  ).toBeDisabled();
  expect(
    (await doc()).statements.some((t) => t.object.value === "English Basics"),
  ).toBe(true);
});

test("restores formerly rejected Systems Administration synonyms and sorts distance without blocking additions", async () => {
  await suggest("Systems Administration", "Find Synonyms");
  await expect(
    view().getByRole("button", { name: "Available 3", exact: true }),
  ).toBeVisible();
  const run = await page.evaluate(
    async () => (await window.axiom.suggestions.history())[0],
  );
  const legacy: SuggestionRun = {
    ...run,
    values: [],
    excluded: [
      {
        value: "System Administration",
        reason: 'Names or aliases another entity: "System Administration".',
      },
      {
        value: "Systems Admin",
        reason:
          "Not a close spelling, abbreviation or word-order variation of the selected name.",
      },
      {
        value: "System Admin",
        reason:
          "Not a close spelling, abbreviation or word-order variation of the selected name.",
      },
    ],
  };
  await app.close();
  await writeFile(
    path.join(profile, "suggestion-history", run.id + ".json"),
    JSON.stringify(legacy),
  );
  await launch();
  await menu("view.taxonomy");
  await expect(
    view().getByRole("combobox", { name: "Run history" }),
  ).toHaveValue(run.id);
  await expect(
    view().getByRole("button", { name: "Available 3", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.axiom.suggestions.history()),
  ).toHaveLength(1);
  await expect(view()).not.toContainText("Not a close");
  await expect(view()).not.toContainText("Names or aliases another entity");
  expect(await view().locator(".ac-distance-cell").allTextContents()).toEqual([
    "1",
    "9",
    "10",
  ]);
  const header = view().getByRole("columnheader", {
    name: "Levenshtein distance",
    exact: true,
  });
  const sort = view().getByRole("button", {
    name: "Levenshtein distance",
    exact: true,
  });
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await sort.click();
  expect(await view().locator(".ac-name").allTextContents()).toEqual([
    "System Admin",
    "Systems Admin",
    "System Administration",
  ]);
  expect(await view().locator(".ac-distance-cell").allTextContents()).toEqual([
    "10",
    "9",
    "1",
  ]);
  for (const name of ["System Administration", "Systems Admin", "System Admin"])
    await expect(
      view().getByRole("checkbox", { name: "Select " + name, exact: true }),
    ).toBeEnabled();
  await view()
    .getByRole("checkbox", { name: "Select all available suggestions" })
    .check();
  const before = await state();
  await view()
    .getByRole("button", { name: "Add 3 synonyms", exact: true })
    .click();
  await expect(
    view().getByRole("button", { name: "Added 3", exact: true }),
  ).toBeVisible();
  const document = () =>
    page.evaluate(
      (iri) =>
        window.axiom.request<SuggestionDocument>("entityDocument", { iri }),
      base + "SystemsAdministration",
    );
  expect(
    (await document()).statements
      .filter((t) => t.predicate === NS.rdfs + "seeAlso")
      .map((t) => t.object),
  ).toEqual([
    { literal: true, value: "System Administration" },
    { literal: true, value: "Systems Admin" },
    { literal: true, value: "System Admin" },
  ]);
  expect((await state()).classCount).toBe(before.classCount);
  await page.screenshot({ path: "artifacts/testing/synonyms-user-choice.png" });
  await menu("edit.undo");
  await expect
    .poll(async () =>
      (await document()).statements.filter(
        (t) => t.predicate === NS.rdfs + "seeAlso",
      ),
    )
    .toEqual([]);
  await view().getByRole("button", { name: "New run", exact: true }).click();
  await expect(
    view().getByRole("button", { name: "Available 3", exact: true }),
  ).toBeVisible();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  expect(await view().locator(".ac-distance-cell").allTextContents()).toEqual([
    "1",
    "9",
    "10",
  ]);
  await sort.click();
  await view()
    .getByRole("combobox", { name: "Run history" })
    .selectOption(run.id);
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  expect(await view().locator(".ac-distance-cell").allTextContents()).toEqual([
    "1",
    "9",
    "10",
  ]);
});

test("shows local full-precision cosine distances and sorts meanings without rejecting candidates", async () => {
  await suggest("Systems Administration", "Find Synonyms");
  await expect(
    view().getByRole("button", { name: "Available 3", exact: true }),
  ).toBeVisible();
  await expect(view().locator(".ac-semantic-cell").first()).toHaveText(
    /^\d\.\d{3}$/,
    { timeout: 30000 },
  );
  const names = await view().locator(".ac-name").allTextContents();
  const result = await page.evaluate(
    (texts) =>
      window.axiom.request<{ similarities: number[] }>("semanticSimilarity", {
        query: "Systems Administration",
        texts,
      }),
    names,
  );
  expect(await view().locator(".ac-semantic-cell").allTextContents()).toEqual(
    result.similarities.map((s) => (1 - s).toFixed(3)),
  );
  const sort = view().getByRole("button", {
    name: "Cosine distance",
    exact: true,
  });
  await sort.click();
  await expect(
    view().getByRole("columnheader", { name: "Cosine distance", exact: true }),
  ).toHaveAttribute("aria-sort", "ascending");
  const distances = (
    await view().locator(".ac-semantic-cell").allTextContents()
  ).map(Number);
  expect(distances).toEqual([...distances].sort((a, b) => a - b));
  for (const name of names)
    await expect(
      view().getByRole("checkbox", { name: "Select " + name, exact: true }),
    ).toBeEnabled();
  await page.screenshot({ path: "artifacts/testing/synonyms-mpnet.png" });
});

test("omits case variants and zero distances from new and retained synonym runs", async () => {
  await suggest("American History To 1877", "Find Synonyms");
  await expect(
    view().getByRole("button", { name: "All 3", exact: true }),
  ).toBeVisible();
  await expect(
    view().getByRole("button", { name: "Available 3", exact: true }),
  ).toBeVisible();
  const run = await page.evaluate(
    async () => (await window.axiom.suggestions.history())[0],
  );
  const accepted = [
    "US History to 1877",
    "American History Before 1877",
    "American History To 1877.",
  ];
  expect(run.values.map((v) => v.value)).toEqual(accepted);
  const legacy: SuggestionRun = {
    ...run,
    values: [
      "American History to 1877",
      "American History To 1877",
      "US History to 1877",
      "us history TO 1877",
      "American History Before 1877",
      "American History To 1877.",
    ].map((value) => ({ value, label: value, reason: "Suggested wording." })),
  };
  await app.close();
  await writeFile(
    path.join(profile, "suggestion-history", run.id + ".json"),
    JSON.stringify(legacy),
  );
  await launch();
  await menu("view.taxonomy");
  await expect(
    view().getByRole("button", { name: "All 3", exact: true }),
  ).toBeVisible();
  expect(await view().locator(".ac-name").allTextContents()).toEqual(
    expect.arrayContaining(accepted),
  );
  const distances = (
    await view().locator(".ac-distance-cell").allTextContents()
  ).map(Number);
  expect(distances).toHaveLength(3);
  expect(distances.every((d) => d > 0)).toBe(true);
  expect(distances[0]).toBe(1);
  await expect(
    view()
      .getByRole("combobox", { name: "Run history" })
      .locator("option:checked"),
  ).toContainText("3 suggestions");
  await view()
    .getByRole("checkbox", { name: "Select all available suggestions" })
    .check();
  await view()
    .getByRole("button", { name: "Add 3 synonyms", exact: true })
    .click();
  await expect(
    view().getByRole("button", { name: "Added 3", exact: true }),
  ).toBeVisible();
  const document = () =>
    page.evaluate(
      (iri) =>
        window.axiom.request<SuggestionDocument>("entityDocument", { iri }),
      base + "AmericanHistory",
    );
  expect(
    (await document()).statements
      .filter((t) => t.predicate === NS.rdfs + "seeAlso")
      .map((t) => t.object.value),
  ).toEqual(accepted);
  expect(
    (await page.evaluate(() => window.axiom.suggestions.history()))[0].applied,
  ).toEqual([2, 4, 5]);
  await page.screenshot({
    path: "artifacts/testing/synonyms-case-insensitive.png",
  });
  await menu("edit.undo");
  await expect
    .poll(async () =>
      (await document()).statements.filter(
        (t) => t.predicate === NS.rdfs + "seeAlso",
      ),
    )
    .toEqual([]);
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
  await expect(
    view().getByRole("checkbox", {
      name: "Select English Basics",
      exact: true,
    }),
  ).toBeVisible();
  await view().getByRole("button", { name: "New run", exact: true }).click();
  await expect(view().locator(".assistant-activity")).toBeVisible();
  await expect(view().locator(".assistant-activity")).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        (await window.axiom.suggestions.history()).filter(
          (r) => r.mode === "synonyms",
        ).length,
    ),
  ).toBe(2);
});

test("reuses active synonyms and starts a queued parent search without a second click", async () => {
  await suggest("Basic English", "Find Synonyms");
  await expect
    .poll(
      async () => await page.evaluate(() => window.axiom.suggestions.status()),
    )
    .toMatchObject({ mode: "synonyms" });
  await suggest("Basic English", "Find Synonyms");
  await suggest("Alpha Beta Gamma", "Add Parents");
  await expect(view()).toContainText(
    "Waiting for the current suggestions to finish",
  );
  await expect(
    view().getByRole("checkbox", { name: "Select Alpha Gamma", exact: true }),
  ).toBeVisible();
  const runs = await page.evaluate(() => window.axiom.suggestions.history());
  expect(runs).toHaveLength(2);
  expect(runs.map((r) => r.state)).toEqual(["completed", "completed"]);
  expect(runs.map((r) => r.mode).sort()).toEqual(["parents", "synonyms"]);
  await view().getByRole("button", { name: "Open another view" }).click();
  const other = page.locator('.suggestions-view[data-panel^="taxonomy:"]');
  await expect(
    other.getByRole("checkbox", { name: "Select Alpha Gamma", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.axiom.suggestions.history())).toEqual(
    runs,
  );
  await menu("view.taxonomy");
  await view()
    .getByRole("combobox", { name: "Suggestion type", exact: true })
    .selectOption("synonyms");
  await expect(view().getByRole("heading", { level: 2 })).toHaveText(
    "Find synonyms for Alpha Beta Gamma",
  );
  await expect(
    view().getByRole("button", { name: "Previous target" }),
  ).toBeEnabled();
  await view().getByRole("button", { name: "Previous target" }).click();
  await expect
    .poll(
      async () => await page.evaluate(() => window.axiom.suggestions.status()),
    )
    .toBeUndefined();
  await view()
    .getByRole("combobox", { name: "Run history" })
    .selectOption(runs.find((r) => r.mode === "synonyms")!.id);
  await expect(
    view().getByRole("checkbox", {
      name: "Select English Basics",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.axiom.suggestions.history())).filter(
      (r) => runs.some((old) => old.id === r.id),
    ),
  ).toEqual(runs);
});

for (const mode of ["parents", "synonyms"] as const) {
  test(`${mode} review supports individual additions and a narrow detached view`, async () => {
    const parents = mode === "parents";
    const name = parents ? "Alpha Gamma" : "English Basics";
    await suggest(
      parents ? "Alpha Beta Gamma" : "Basic English",
      parents ? "Add Parents" : "Find Synonyms",
    );
    await view()
      .getByRole("button", { name: "Details for " + name, exact: true })
      .click();
    await view()
      .getByRole("button", {
        name: parents ? "Add this parent" : "Add this synonym",
        exact: true,
      })
      .click();
    await expect(
      view().getByRole("checkbox", {
        name: name + ", Added, cannot be added",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      view().getByRole("button", { name: "Details for " + name, exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    const waiting = app.waitForEvent("window");
    await menu("pane.detach");
    const child = await waiting;
    child.on("pageerror", (e) => errors.push(e.message));
    const detached = child.locator(".suggestions-view");
    await expect(detached).toBeVisible();
    const win = await app.browserWindow(child);
    await win.evaluate((w) => {
      w.setMinimumSize(320, 240);
      w.webContents.setZoomFactor(1);
      w.setContentSize(1400, 900);
    });
    for (const theme of ["light", "dark"]) {
      await menu("theme." + theme);
      await child.screenshot({
        path: `artifacts/testing/${mode}-${theme}.png`,
      });
      const audit = await new AxeBuilder({ page: child })
        .setLegacyMode(true)
        .include(".suggestions-view")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
    }
    await win.evaluate((w) => w.setContentSize(375, 720));
    await expect(
      detached.getByRole("columnheader", {
        name: parents ? "Definition" : "Explanation",
        exact: true,
      }),
    ).toBeHidden();
    expect(
      await detached.evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      await detached
        .locator(".ac-scroll")
        .evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
    await detached
      .getByRole("button", { name: "Context", exact: true })
      .click();
    const popover = child.getByRole("dialog");
    await expect(popover).toBeVisible();
    const box = await popover.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await child.screenshot({
      path: `artifacts/testing/${mode}-375-context.png`,
    });
    await child.keyboard.press("Escape");
    await expect(
      detached.getByRole("button", { name: "Context", exact: true }),
    ).toBeFocused();
  });
}

test("assistant parent suggestions expose the exact prompt and can add parents with no shared words", async () => {
  await suggest("Multiculturalism at Work", "Add Parents");
  await expect(
    view().getByRole("checkbox", { name: "Select Sociology", exact: true }),
  ).toBeVisible();
  await expect(
    view().getByRole("combobox", { name: "Taxonomy assistant" }),
  ).toBeEnabled();
  await expect(
    view().getByRole("combobox", { name: "Taxonomy assistant" }),
  ).toHaveValue("codex");
  const [run] = await page.evaluate(() => window.axiom.suggestions.history());
  expect(run.provider).toBe("codex");
  expect(run.prompt).toContain("Complete class catalog");
  await view().getByRole("button", { name: "Prompt", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Parent prompt" }),
  ).toHaveValue(run.prompt);
  await page.screenshot({
    path: "artifacts/testing/parent-assistant-prompt.png",
  });
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    run.prompt,
  );
  await page.getByRole("button", { name: "Close Prompt", exact: true }).click();
  await view()
    .getByRole("checkbox", { name: "Select Sociology", exact: true })
    .check();
  await view()
    .getByRole("button", { name: "Add 1 parent", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "Workplace")
          ?.parents,
    )
    .toEqual([base + "Sociology"]);
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "Workplace")
          ?.parents,
    )
    .toEqual([THING]);
  await app.close();
  await launch();
  await expect(
    view().getByRole("combobox", { name: "Run history" }),
  ).toHaveValue(run.id);
  await view().getByRole("button", { name: "Prompt", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Parent prompt" }),
  ).toHaveValue(run.prompt);
  await page.getByRole("button", { name: "Close Prompt", exact: true }).click();
  await view().getByRole("combobox", { name: "Run history" }).selectOption("");
  await view().getByRole("button", { name: "Prompt", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Parent prompt" }),
  ).toContainText("Suggest parents for");
});
