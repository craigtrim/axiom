import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
let app: ElectronApplication, page: Page;
const errors: string[] = [];
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/sparql-ui-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await page.evaluate(() => window.axiom.command("view.query"));
  await expect(page.locator(".monaco-editor")).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
  expect(errors).toEqual([]);
});
async function run(text: string, count: number) {
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
  await page.getByRole("button", { name: "Run", exact: false }).click();
  await expect(
    page.locator(".query-results-panel:visible .query-summary"),
  ).toContainText(count + " displayed / " + count + " result rows");
  await expect(page.locator(".query-error")).toHaveCount(0);
}
test("ASK renders false as a result and SELECT preserves unbound columns", async () => {
  await run("ASK { VALUES ?x { 1 } FILTER(?x = 2) }", 1);
  const grid = page.locator(".query-results-panel:visible .ag-root");
  await expect(grid.getByRole("columnheader")).toContainText(["?boolean"]);
  await expect(grid.getByRole("gridcell")).toContainText(["false"]);
  await run(
    'SELECT ?x ?missing WHERE { VALUES ?x { "present" } OPTIONAL { ?x <urn:absent> ?missing } }',
    1,
  );
  await expect(grid.getByRole("columnheader")).toContainText([
    "?x",
    "?missing",
  ]);
  await expect(grid.getByRole("gridcell")).toContainText(["present", ""]);
});
test("CONSTRUCT and DESCRIBE render graph results without changing the ontology", async () => {
  await run(
    "CONSTRUCT { <urn:result> <urn:value> ?n } WHERE { VALUES ?n { 1 1 2 } }",
    2,
  );
  const grid = page.locator(".query-results-panel:visible .ag-root");
  await expect(grid.getByRole("columnheader")).toContainText([
    "?subject",
    "?predicate",
    "?object",
  ]);
  await run("ASK { <urn:result> <urn:value> ?n }", 1);
  await expect(grid.getByRole("gridcell")).toContainText(["false"]);
  await run("DESCRIBE <urn:absent>", 0);
});
test("query worker refreshes its dataset after edits and recovers from query errors", async () => {
  const query =
    'SELECT ?c WHERE { ?c a owl:Class FILTER(STRSTARTS(REPLACE(STR(?c), "^.*[/#]", ""), "QueryCache")) }';
  await run(query, 0);
  await page.evaluate(() =>
    window.axiom.request("createClass", {
      name: "Query Cache Check",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await expect(
    page.locator(".query-results-panel:visible .query-summary"),
  ).toContainText("Data changed since this run");
  await run(query, 1);
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText("INSERT DATA { <urn:a> <urn:b> <urn:c> }");
  await page.getByRole("button", { name: "Run", exact: false }).click();
  await expect(page.locator(".query-error")).toContainText("does not modify");
  await run("SELECT (COUNT(*) AS ?count) WHERE { VALUES ?x { 1 2 3 } }", 1);
  await expect(
    page.locator(".query-results-panel:visible .ag-root").getByRole("gridcell"),
  ).toContainText(["3"]);
});
