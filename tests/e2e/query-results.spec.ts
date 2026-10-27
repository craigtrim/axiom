// craigtrim/axiom#88: independent results use shared actions, context and empty states.
import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
  type Locator,
  _electron,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
let app: ElectronApplication, page: Page, env: Record<string, string>;
const errors: string[] = [];
async function launch(restart = false) {
  app = await (
    restart
      ? (options: Parameters<typeof _electron.launch>[0]) =>
          _electron.launch(options)
      : launchExample
  )({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".workbench")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
}
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
const results = () => page.locator(".query-results-panel:visible");
const history = () => page.evaluate(() => window.axiom.queryHistory.load());
const text = async () => (await history()).current.text;
async function enter(value: string) {
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(value);
  await expect.poll(text).toBe(value);
}
const first = 'SELECT ?value WHERE { VALUES ?value { "first-result" } }';
const second =
  'SELECT ?value WHERE { VALUES ?value { "second-result" "another-result" } }';
async function run(query = first) {
  const prior = JSON.stringify((await history()).current.lastRun);
  await enter(query);
  await page
    .locator(".query-panel")
    .getByRole("button", { name: "Run", exact: true })
    .click();
  await expect
    .poll(async () => JSON.stringify((await history()).current.lastRun))
    .not.toBe(prior);
  const summary = (await history()).current.lastRun!.summary;
  await expect(results().locator(".state")).toContainText(
    summary.rowCount + (summary.rowCount === 1 ? " row" : " rows"),
  );
  return results().getAttribute("data-panel");
}
async function resultAction(name: string, panel: Locator = results()) {
  await panel
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await panel.getByRole("menuitem", { name, exact: true }).click();
}
async function selectDocument(offset: number) {
  const view = await history(),
    index = view.entries.findIndex((e) => e.id === view.activeId);
  const query = page.locator(".query-panel");
  await query.getByRole("button", { name: "History", exact: true }).click();
  await query
    .locator(`.hist [data-action="${view.entries[index + offset].id}"]`)
    .click();
}
async function reopenResults() {
  const view = await history(),
    summary = view.current.lastRun!.summary;
  // Saved tabs reopen through the existing shell history rather than rerunning.
  await menu("view.tabhistory");
  // #165: the current history separates selecting a saved tab from activating it.
  const tabHistory = page.locator('[data-panel="tabhistory"]');
  const tab = tabHistory
    .locator(".leaf")
    .filter({ hasText: "Query results" });
  await tab.click();
  await tabHistory.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(results().locator(".state")).toContainText(
    String(summary.rowCount),
  );
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  env = {
    ...process.env,
    AXIOM_USER_DATA: await mkdtemp(
      path.resolve("artifacts/testing/query-results-ui-"),
    ),
  } as Record<string, string>;
  env.AXIOM_CACHE_HOME = path.join(env.AXIOM_USER_DATA, "cache");
  await writeFile(
    path.join(env.AXIOM_USER_DATA, "workbench.json"),
    JSON.stringify({ version: 1, tabSavePolicy: "all" }),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  await launch();
  await menu("view.query");
  await expect(page.locator(".monaco-editor")).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
  expect(errors).toEqual([]);
});
test("results are a workbench tab and reopen their query after the editor closes", async () => {
  const id = await run();
  const origin = (await history()).activeId;
  await expect(
    page
      .locator(".flexlayout__tab_button")
      .filter({ hasText: "Query results" }),
  ).toBeVisible();
  await expect(page.locator('[data-panel="query"] .query-results')).toHaveCount(
    0,
  );
  const box = (await results().boundingBox())!,
    editor = (await page.locator('[data-panel="query"]').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(editor.y + 2);
  await page.locator(".monaco-editor textarea").focus();
  await menu("pane.close");
  await expect(page.locator('[data-panel="query"]')).toHaveCount(0);
  await expect(results().locator(".query-results")).toContainText(
    "first-result",
  );
  await expect(results().locator(".ctx .q")).toHaveAttribute("title", first);
  await page.screenshot({
    path: "artifacts/testing/query-results-editor-closed.png",
  });
  await resultAction("Open query");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect.poll(text).toBe(first);
  expect((await history()).activeId).toBe(origin);
  await page.getByRole("tab", { name: "Query results", exact: true }).click();
  expect(await results().getAttribute("data-panel")).toBe(id);
});
test("reruns keep separate rows and Open query preserves an unfinished newer draft", async () => {
  const count = (await history()).entries.length;
  const id = await run();
  await run(second);
  await expect(
    page
      .locator(".flexlayout__tab_button")
      .filter({ hasText: "Query results" }),
  ).toHaveCount(2);
  await expect(results().locator(".query-results")).toContainText(
    "second-result",
  );
  await enter("SELECT ?unfinished WHERE {");
  await page
    .locator(".flexlayout__tab_button")
    .filter({ hasText: /^Query results$/ })
    .click();
  await expect(results().locator(".query-results")).toContainText(
    "first-result",
  );
  expect(await results().getAttribute("data-panel")).toBe(id);
  await resultAction("Open query");
  await expect.poll(text).toBe(first);
  const view = await history();
  expect(view.entries).toHaveLength(count + 1);
  await selectDocument(-1);
  await expect.poll(text).toBe("SELECT ?unfinished WHERE {");
  await selectDocument(1);
  await page.getByRole("tab", { name: "Query results", exact: true }).click();
  expect(await results().getAttribute("data-panel")).toBe(id);
  await expect(results().locator(".query-results")).toContainText(
    "first-result",
  );
});
test("closing and reopening a results tab retains its rows and layout changes retain its identity", async () => {
  const id = await run();
  await results()
    .getByRole("button", { name: "More actions", exact: true })
    .focus();
  await menu("pane.close");
  await expect(results()).toHaveCount(0);
  await reopenResults();
  await expect(results().locator(".query-results")).toContainText(
    "first-result",
  );
  expect(await results().getAttribute("data-panel")).toBe(id);
  await menu("arrangement.wide");
  await page.getByRole("tab", { name: "Query results", exact: true }).click();
  await expect(results().locator(".query-results")).toContainText(
    "first-result",
  );
  expect(await results().getAttribute("data-panel")).toBe(id);
  await menu("arrangement.standard");
  await page.getByRole("tab", { name: "Query results", exact: true }).click();
  await expect(results().locator(".query-results")).toContainText(
    "first-result",
  );
  expect(await results().getAttribute("data-panel")).toBe(id);
});
test("saved result tabs keep their executed query after restart and identify expired rows", async () => {
  const id = await run();
  await page.locator(".monaco-editor textarea").focus();
  await menu("pane.close");
  await app.close();
  await launch(true);
  await expect(results().locator(".empty")).toContainText(
    "rows are no longer retained",
  );
  expect(await results().getAttribute("data-panel")).toBe(id);
  await expect(page.locator('[data-panel="query"]')).toHaveCount(0);
  await results()
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await expect(
    results().getByRole("menuitem", { name: "Send results to graph" }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await resultAction("Open query");
  await expect.poll(text).toBe(first);
  await run();
  await expect(results().locator(".query-results")).toContainText(
    "first-result",
  );
});
test("results detach and resize independently, and Open query returns to the main editor", async () => {
  await run();
  await results()
    .getByRole("button", { name: "More actions", exact: true })
    .focus();
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await waiting;
  child.on("pageerror", (e) => errors.push(e.message));
  await child.bringToFront();
  const panel = child.locator(".query-results-panel");
  await expect(panel.locator(".query-results")).toContainText("first-result");
  await (
    await app.browserWindow(child)
  ).evaluate((w) => {
    w.setMinimumSize(320, 300);
    w.setContentSize(480, 560);
  });
  await expect
    .poll(() => panel.evaluate((e) => e.clientWidth))
    .toBeLessThan(500);
  expect(await panel.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
    false,
  );
  await child.screenshot({
    path: "artifacts/testing/query-results-compact.png",
  });
  await (
    await app.browserWindow(child)
  ).evaluate((w) => w.setContentSize(1200, 760));
  await expect
    .poll(() => panel.evaluate((e) => e.clientWidth))
    .toBeGreaterThan(1000);
  await child.screenshot({
    path: "artifacts/testing/query-results-maximized.png",
  });
  await resultAction("Open query", panel);
  await expect(page.locator(".monaco-editor textarea")).toBeFocused();
  await expect.poll(text).toBe(first);
  await expect(panel.locator(".query-results")).toContainText("first-result");
});
test("sending an older results tab to the graph uses that execution", async () => {
  await run(
    "SELECT ?node WHERE { VALUES ?node { <http://www.co-ode.org/ontologies/pizza/pizza.owl#American> } }",
  );
  await run(
    "SELECT ?node WHERE { VALUES ?node { <http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita> } }",
  );
  await page
    .locator(".flexlayout__tab_button")
    .filter({ hasText: /^Query results$/ })
    .click();
  await results()
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await results()
    .getByRole("menuitem", { name: "Send results to graph" })
    .click();
  const graph = await page.evaluate(
    async () => (await window.axiom.request<any>("state")).graph,
  );
  expect(graph.nodes.map((n: { iri: string }) => n.iri)).toContain(
    "http://www.co-ode.org/ontologies/pizza/pizza.owl#American",
  );
  expect(graph.nodes.map((n: { iri: string }) => n.iri)).not.toContain(
    "http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita",
  );
});

test("the native graph action follows the focused results or query document", async () => {
  const american = "http://www.co-ode.org/ontologies/pizza/pizza.owl#American";
  const margherita =
    "http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita";
  await run("SELECT ?node WHERE { VALUES ?node { <" + american + "> } }");
  await run("SELECT ?node WHERE { VALUES ?node { <" + margherita + "> } }");
  await page
    .locator(".flexlayout__tab_button")
    .filter({ hasText: /^Query results$/ })
    .click();
  await results()
    .getByRole("button", { name: "More actions", exact: true })
    .focus();
  await menu("query.graph");
  const nodes = () =>
    page.evaluate(async () =>
      (await window.axiom.request<any>("state")).graph.nodes.map(
        (n: { iri: string }) => n.iri,
      ),
    );
  await expect.poll(nodes).toContain(american);
  expect(await nodes()).not.toContain(margherita);
  await page.locator(".monaco-editor textarea").focus();
  await menu("query.graph");
  await expect.poll(nodes).toContain(margherita);
  expect(await nodes()).not.toContain(american);
});
test("evicted results retain their executed query without displaying another run's rows", async () => {
  const count = (await history()).entries.length;
  await run();
  for (let i = 2; i <= 9; i++) {
    await run("SELECT ?value WHERE { VALUES ?value { " + i + " } }");
    await results()
      .getByRole("button", { name: "More actions", exact: true })
      .focus();
    await menu("pane.close");
  }
  await page.getByRole("tab", { name: "Query results", exact: true }).click();
  await expect(results().locator(".empty")).toContainText(
    "rows are no longer retained",
  );
  await expect(results().locator(".query-results")).toHaveCount(0);
  await resultAction("Open query");
  await expect.poll(text).toBe(first);
  expect((await history()).entries).toHaveLength(count + 1);
});
