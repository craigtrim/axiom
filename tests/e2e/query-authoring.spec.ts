import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
let app: ElectronApplication, page: Page, bridgePage: Page;
const errors: string[] = [];
let launchEnv: Record<string, string>;
async function launch() {
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env: launchEnv,
  });
  page = await app.firstWindow();
  // Keep physical desktop input out of optional background validation runs.
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((win) => win.setFocusable(false));
  bridgePage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
}
const query = "select ?s ?p ?o where { ?s ?p ?o . } limit 7";
const text = () =>
  bridgePage.evaluate(async () =>
    String(
      (await window.axiom.preferences.load()).panelState?.["query.text"] ?? "",
    ).replaceAll("\r\n", "\n"),
  );
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function queryOptions() {
  const more = page.getByRole("button", { name: "More query actions" });
  if (
    (await more.isVisible()) &&
    (await more.getAttribute("aria-expanded")) !== "true"
  )
    await more.click();
}
async function formatQuery() {
  await queryOptions();
  await page.getByRole("button", { name: "Format", exact: true }).click();
}
async function enter(value: string) {
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(value);
  await expect.poll(text).toBe(value);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/testing/query-authoring-"),
  );
  const bin = path.join(profile, "bin"),
    folder = path.join(bin, "node_modules/@openai/codex/bin");
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, "codex.js"),
    `import fs from "node:fs";let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const match=s.match(/REQUEST\\n(.*)\\nONTOLOGY/);const input=JSON.parse(match[1]);const instructions=input.instructions;let r={status:"query",sparql:${JSON.stringify(query)},explanation:"Lists seven asserted triples.",assumptions:[]};if(instructions.includes("unsupported"))r={status:"unsupported",sparql:"",explanation:"Remote SERVICE is unavailable in local queries.",assumptions:[]};if(instructions.includes("invalid"))r.sparql="SELECT ?s WHERE { ?s <http://invented.org/property> ?o }";setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],JSON.stringify(r)),instructions.includes("cancel")?20000:instructions.includes("slow")?2500:50);});`,
  );
  await writeFile(path.join(folder, "package.json"), '{"type":"module"}');
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  const originalPath = env.PATH ?? env.Path ?? "";
  delete env.Path;
  env.PATH = bin + path.delimiter + originalPath;
  delete env.ELECTRON_RUN_AS_NODE;
  launchEnv = env;
  await launch();
  await menu("view.query");
  await expect(page.locator(".monaco-editor")).toBeVisible();
});
test.afterEach(async () => {
  if (app) await app.close();
  expect(errors).toEqual([]);
});

test("formats with the toolbar and keyboard, supports Undo, and identifies custom queries", async () => {
  await enter(query);
  await queryOptions();
  await expect(
    page.getByRole("combobox", { name: "Example query" }),
  ).toHaveValue("-1");
  await formatQuery();
  await expect
    .poll(text)
    .toBe("SELECT ?s ?p ?o\nWHERE {\n  ?s ?p ?o .\n}\nLIMIT 7");
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(query);
  await page.keyboard.press("Alt+Shift+f");
  await expect.poll(text).toContain("\n  ?s ?p ?o");
  await enter("SELECT ?s WHERE {");
  await formatQuery();
  await expect(page.locator(".query-error")).toContainText("Could not format");
  await expect.poll(text).toBe("SELECT ?s WHERE {");
});
const history = () => page.evaluate(() => window.axiom.queryHistory.load());
const composer = () =>
  page.getByRole("region", { name: "Compose a SPARQL query" });
async function compose(instructions: string) {
  if (!(await composer().isVisible()))
    await page
      .getByRole("button", { name: "Compose query", exact: true })
      .click();
  await composer()
    .getByRole("textbox", { name: "Describe your query" })
    .fill(instructions);
  await composer()
    .getByRole("button", { name: /^Generate (query|again)$/ })
    .click();
}
async function closeComposer() {
  if (await composer().isVisible())
    await composer()
      .getByRole("button", { name: "Close query composer" })
      .click();
}
async function run(expected: string) {
  await page.getByRole("button", { name: /^Run(?: |$)/ }).click();
  await expect(
    bridgePage.locator(".query-results-panel:visible .query-summary"),
  ).toContainText(expected);
  await expect(page.locator(".query-error")).toHaveCount(0);
}
test("opens generated SPARQL in the main editor, preserves the source and keeps independent Undo", async () => {
  const original = "SELECT ?s WHERE { ?s ?p ?o . } LIMIT 2";
  await enter(original);
  const first = await history();
  await compose("List seven triples");
  await expect.poll(text).toContain("LIMIT 7");
  await expect(
    page.getByRole("button", { name: "Use query", exact: true }),
  ).toHaveCount(0);
  await expect(
    composer().locator("pre[aria-label='Generated SPARQL']"),
  ).toHaveCount(0);
  await expect(page.locator(".query-main .monaco-editor")).toBeVisible();
  await expect(page.locator(".query-run-status")).toContainText(
    "Generated query ready",
  );
  expect((await history()).entries).toHaveLength(first.entries.length + 1);
  await closeComposer();
  const generated = await text();
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("x");
  await expect.poll(text).toBe(generated + "x");
  await page
    .getByRole("button", { name: "Previous query", exact: true })
    .click();
  await expect.poll(text).toBe(original);
  await page.getByRole("button", { name: "Next query", exact: true }).click();
  await expect.poll(text).toBe(generated + "x");
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(generated);
  await run("7 displayed");
});
test("a delayed agent response preserves newer edits and offers the new query", async () => {
  await enter(query);
  await compose("slow query");
  await closeComposer();
  await enter(query + "0");
  await expect(
    page.getByRole("button", { name: "Open generated query" }),
  ).toBeVisible();
  await expect.poll(text).toBe(query + "0");
  await page.getByRole("button", { name: "Open generated query" }).click();
  await expect.poll(text).toContain("LIMIT 7");
  await expect(
    page.getByRole("button", { name: "Open generated query" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous query", exact: true })
    .click();
  await expect.poll(text).toBe(query + "0");
});
test("unsupported requests keep the current query; invalid drafts open for correction", async () => {
  await enter(query);
  const before = await history();
  await compose("unsupported remote SERVICE");
  await expect(
    composer().getByText("Remote SERVICE is unavailable in local queries.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await history()).entries).toHaveLength(before.entries.length);
  await expect.poll(text).toBe(query);
  await compose("invalid property");
  await expect(page.locator(".query-main .query-error")).toContainText(
    "absent from the supplied context",
  );
  await expect(
    page.getByRole("button", { name: /^Run(?: |$)/ }),
  ).toBeDisabled();
  await formatQuery();
  await expect(
    page.getByRole("button", { name: /^Run(?: |$)/ }),
  ).toBeDisabled();
  await page.keyboard.press("Control+Enter");
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).toHaveCount(0);
  await closeComposer();
  await enter(query);
  await expect(page.getByRole("button", { name: /^Run(?: |$)/ })).toBeEnabled();
  await run("7 displayed");
});
test("cancels an agent and restores the composer when reopened", async () => {
  await compose("cancel generation");
  await expect(
    page.getByRole("button", { name: "Cancel generation", exact: true }),
  ).toBeVisible();
  await closeComposer();
  await page
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel generation", exact: true })
    .click();
  await expect(composer().getByRole("alert")).toContainText("cancelled");
  await expect(
    composer().getByRole("textbox", { name: "Describe your query" }),
  ).toHaveValue("cancel generation");
  await composer()
    .getByRole("textbox", { name: "Describe your query" })
    .fill("Try again");
  await expect(
    composer().getByRole("button", { name: "Generate query", exact: true }),
  ).toBeEnabled();
});
test("shows generation context and flags later ontology changes", async () => {
  await enter(query);
  await page
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await composer()
    .getByRole("textbox", { name: "Describe your query" })
    .fill("List classes");
  await composer()
    .getByRole("checkbox", { name: "Refine the current query" })
    .check();
  await composer().locator(".query-context-details summary").click();
  await expect(composer().locator(".query-context")).toContainText(query);
  await composer()
    .getByRole("button", { name: "Generate query", exact: true })
    .click();
  await expect.poll(text).toContain("LIMIT 7");
  await page.evaluate(() =>
    window.axiom.request("createClass", {
      name: "Review changed",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await expect(page.locator(".query-generation-details summary")).toContainText(
    "Review ontology context",
  );
  await page.locator(".query-generation-details summary").click();
  await expect(page.locator(".query-generation-details")).toContainText(
    "Review it before running",
  );
});
test("New query and examples preserve forward history, and the chooser searches full query text", async () => {
  const first = "SELECT ?n WHERE { VALUES ?n { 1 } }";
  const second = "# second draft\nSELECT ?rareTerm WHERE {}";
  await enter(first);
  await page.getByRole("button", { name: "New query", exact: true }).click();
  await expect.poll(text).toBe("");
  await enter(second);
  await page
    .getByRole("button", { name: "Previous query", exact: true })
    .click();
  await expect.poll(text).toBe(first);
  await page.getByRole("button", { name: "New query", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Browse query history" }),
  ).toHaveText("3 / 3");
  await page
    .getByRole("button", { name: "Previous query", exact: true })
    .click();
  await expect.poll(text).toBe(second);
  await queryOptions();
  await page.getByRole("combobox", { name: "Example query" }).selectOption("0");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Browse query history" }),
  ).toHaveText("4 / 4");
  await page.getByRole("button", { name: "Browse query history" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Query history",
    exact: true,
  });
  await expect(
    dialog.getByRole("searchbox", { name: "Find queries" }),
  ).toBeFocused();
  await dialog
    .getByRole("searchbox", { name: "Find queries" })
    .fill("rareTerm");
  await expect(dialog.locator(".query-history-list button")).toHaveCount(1);
  await dialog.locator(".query-history-list button").click();
  await expect.poll(text).toBe(second);
  await expect(
    page.getByRole("button", { name: "Browse query history" }),
  ).toHaveText("2 / 4");
  await page.getByRole("button", { name: "Browse query history" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Browse query history" }),
  ).toBeFocused();
});
test("paging can reopen the correct results tab and identifies edits made after execution", async () => {
  await enter('SELECT ?value WHERE { VALUES ?value { "first-result" } }');
  await run("1 displayed");
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).toContainText("first-result");
  await page.getByRole("button", { name: "New query", exact: true }).click();
  await enter(
    'SELECT ?value WHERE { VALUES ?value { "second-result" "another-result" } }',
  );
  await run("2 displayed");
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).toContainText("second-result");
  await page
    .getByRole("button", { name: "Previous query", exact: true })
    .click();
  await page.getByRole("button", { name: "Open results", exact: true }).click();
  await expect(
    page.locator(".query-results-panel:visible .query-summary"),
  ).toContainText("1 displayed");
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).toContainText("first-result");
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).not.toContainText("second-result");
  await enter("ASK {}");
  await expect(page.locator(".query-run-status")).toContainText(
    "These results are from its previous run",
  );
  await page.getByRole("button", { name: "Next query", exact: true }).click();
  await page.getByRole("button", { name: "Open results", exact: true }).click();
  await expect(
    page.locator(".query-results-panel:visible .query-summary"),
  ).toContainText("2 displayed");
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).toContainText("second-result");
});
test("drafts survive an immediate close and restart without executing queries", async () => {
  await enter(query);
  await page.getByRole("button", { name: "New query", exact: true }).click();
  await expect.poll(text).toBe("");
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.insertText(
    "# unfinished draft\nSELECT ?preserved WHERE {",
  );
  await app.close();
  await launch();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect.poll(text).toBe("# unfinished draft\nSELECT ?preserved WHERE {");
  await expect(
    page.getByRole("button", { name: "Browse query history" }),
  ).toHaveText("2 / 2");
  await page
    .getByRole("button", { name: "Previous query", exact: true })
    .click();
  await expect.poll(text).toBe(query);
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).toHaveCount(0);
});
test("compact and maximized panes keep one editor and accessible history controls", async () => {
  await page.locator(".monaco-editor textarea").focus();
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const mainPage = page;
  page = await waiting;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.bringToFront();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await (
    await app.browserWindow(page)
  ).evaluate((child) => {
    child.setMinimumSize(320, 300);
    child.setContentSize(520, 660);
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(860);
  await expect(page.locator(".query-panel")).toHaveClass(/is-compact/);
  await compose("List seven triples");
  await expect.poll(text).toContain("LIMIT 7");
  await expect(composer()).toHaveCount(0);
  await expect(page.locator(".query-main .monaco-editor")).toBeVisible();
  await run("7 displayed");
  await page.screenshot({
    path: "artifacts/testing/query-history-compact.png",
  });
  const overflow = await page
    .locator(".query-panel")
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
  const arrows = page.locator(".query-arrow");
  for (const arrow of await arrows.all()) {
    const box = (await arrow.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  await (
    await app.browserWindow(page)
  ).evaluate((child) => child.setContentSize(1320, 840));
  await expect(page.locator(".query-panel")).not.toHaveClass(/is-compact/);
  await page
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await expect(composer()).toBeVisible();
  await expect(page.locator(".query-main .monaco-editor")).toBeVisible();
  const left = (await composer().boundingBox())!,
    right = (await page.locator(".query-main").boundingBox())!;
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width - 1);
  await page.screenshot({ path: "artifacts/testing/query-history-wide.png" });
  await closeComposer();
  await page
    .getByRole("button", { name: "Previous query", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Browse query history" }),
  ).toHaveText("1 / 2");
  await menu("pane.reattach");
  page = mainPage;
  await expect.poll(() => app.windows().length).toBe(1);
  await page.locator(".monaco-editor textarea").focus();
  await menu("pane.maximise");
  await expect(page.locator(".query-panel")).not.toHaveClass(/is-compact/);
  await page.screenshot({
    path: "artifacts/testing/query-history-maximized.png",
  });
});

test("formatting and comments keep results current while substantive edits and data changes remain visible", async () => {
  const original =
    'select ?value where { values ?value { "first result" } } limit 1';
  await enter(original);
  await run("1 displayed");
  const executed = (await history()).current.lastRun;
  const changed = page
    .locator(".query-run-status .stale")
    .filter({ hasText: "The query changed." });
  await formatQuery();
  await expect.poll(text).toContain("\nLIMIT 1");
  await expect(changed).toHaveCount(0);
  await expect(
    page.locator(".query-results-panel:visible .query-results"),
  ).toContainText("first result");
  expect((await history()).current.lastRun).toEqual(executed);
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(original);
  await expect(changed).toHaveCount(0);
  await page.keyboard.press("Alt+Shift+f");
  await expect.poll(text).toContain("\nLIMIT 1");
  await expect(changed).toHaveCount(0);

  // A single real edit has its own Undo entry and must still make the old rows stale.
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("0");
  await expect.poll(text).toContain("LIMIT 10");
  await expect(changed).toBeVisible();
  await formatQuery();
  await expect(changed).toBeVisible();
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+z");
  await expect.poll(text).toMatch(/LIMIT 1$/);
  await expect(changed).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await expect(changed).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(changed).toHaveCount(0);

  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n# explain the query without changing it");
  await expect.poll(text).toContain("# explain the query");
  await expect(changed).toHaveCount(0);
  expect((await history()).current.lastRun).toEqual(executed);
  await page.evaluate(() =>
    window.axiom.request("createClass", {
      name: "Data changed",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await expect(
    page.locator(".query-results-panel:visible .query-summary .stale"),
  ).toContainText("Data changed");
  await formatQuery();
  await expect(changed).toHaveCount(0);
  await expect(
    page.locator(".query-results-panel:visible .query-summary .stale"),
  ).toContainText("Data changed");
  expect((await history()).current.lastRun).toEqual(executed);
});
