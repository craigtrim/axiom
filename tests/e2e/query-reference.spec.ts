// craigtrim/axiom#88: exercise the composed interface through native Electron.
import { test, expect } from "@playwright/test";
import {
  launchQuery,
  starter,
  queryMenu,
  type QueryFixture,
} from "./query-reference-fixture";
import { readFile } from "node:fs/promises";
import path from "node:path";
let f: QueryFixture;
test.beforeEach(async () => {
  f = await launchQuery();
});
test.afterEach(async () => {
  await f?.app.close();
  expect(f?.errors ?? []).toEqual([]);
});
test("Fields writes one undoable edit and narrow return paths keep editor focus", async () => {
  const { pane, composer, size, enter, page, history } = f;
  await expect(composer).toBeVisible();
  expect((await composer.boundingBox())!.width).toBe(320);
  expect((await pane.locator(".bar").boundingBox())!.height).toBe(28);
  await composer
    .getByLabel("Subject class")
    .selectOption("https://axiom.test/courses#Marketing");
  await composer.getByLabel("Value contains").fill("Advert");
  await composer.getByRole("button", { name: "Write into the editor" }).click();
  await expect
    .poll(async () => (await history()).current.text)
    .toContain('FILTER(CONTAINS(?value, "Advert"))');
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await history()).current.text).toBe(starter);
  await size(798, 530);
  await expect(composer).not.toBeVisible();
  await pane
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await expect(composer).toBeVisible();
  await composer
    .getByRole("textbox", { name: "Describe the query" })
    .press("Escape");
  await expect(composer).not.toBeVisible();
  await expect(pane.locator(".monaco-editor textarea")).toBeFocused();
  await enter("ASK {}");
  await size(898, 330);
  await expect(composer).toBeVisible();
  await expect(pane.locator(".line-numbers:visible")).toHaveCount(0);
});
test("validated and refused proposals wait for explicit opening without running", async () => {
  const before = await f.history();
  await f.generate("courses with their credit values");
  await expect(f.composer.locator(".prop")).toContainText(
    "Validated against the query engine.",
  );
  expect((await f.history()).entries).toHaveLength(before.entries.length);
  expect((await f.history()).current.text).toBe(starter);
  await f.composer.getByRole("button", { name: "Open in the editor" }).click();
  await expect
    .poll(async () => (await f.history()).entries.length)
    .toBe(before.entries.length + 1);
  await expect
    .poll(async () => (await f.history()).current.text)
    .toContain("?credits");
  expect((await f.history()).current.lastRun).toBeUndefined();
  await f.generate("delete credit values");
  await expect(f.composer.locator(".prop")).toContainText(
    "That is an update, not a query. This panel never writes to the ontology.",
  );
  await f.composer
    .getByRole("button", { name: "Open it for correction" })
    .click();
  await expect(
    f.pane.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await f.enter("ASK {}");
  await expect(
    f.pane.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
});
test("whole result sorting, persistent columns and CSV use retained rows", async () => {
  await f.host.evaluate((el) => el.removeAttribute("style"));
  await f.enter(
    'SELECT ?n ?label ?blank WHERE { VALUES (?n ?label) { (10 "ten") (2 "two") (1 "one") } }',
  );
  await f.pane.getByRole("button", { name: "Run", exact: true }).click();
  const results = f.page.locator(".query-results-panel:visible");
  await expect(results.locator(".state")).toHaveText("3 rows");
  await expect(results.locator(".ag-row")).toHaveCount(3);
  const order = results.getByRole("button", { name: "?n", exact: true });
  await order.focus();
  await order.press("Enter");
  await expect(
    results.locator('.ag-row[row-index="0"] [col-id="0"]'),
  ).toHaveText("1");
  await expect(results.locator('.ag-header-cell[col-id="0"]')).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await order.press("Space");
  await expect(
    results.locator('.ag-row[row-index="0"] [col-id="0"]'),
  ).toHaveText("10");
  await order.press("Space");
  await expect(
    results.locator('.ag-row[row-index="0"] [col-id="0"]'),
  ).toHaveText("1");
  await results.getByRole("button", { name: "Columns", exact: true }).click();
  await expect(
    results.getByRole("menuitemcheckbox", { name: /blank/ }),
  ).toHaveAttribute("aria-checked", "false");
  await results.getByRole("menuitemcheckbox", { name: /label/ }).click();
  await expect(
    results.getByRole("menu", { name: "Columns", exact: true }),
  ).toBeVisible();
  const last = results.getByRole("menuitemcheckbox", { name: /^\?n / });
  await last.focus();
  await last.press("Space");
  await expect(last).toHaveAttribute("aria-checked", "true");
  await expect(results.locator(".toast")).toContainText(
    "At least one column stays shown.",
  );
  await f.page.keyboard.press("Escape");
  await expect(
    results.getByRole("button", { name: "Columns", exact: true }),
  ).toBeFocused();
  await results
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await results
    .getByRole("menuitem", { name: "Copy results as CSV", exact: true })
    .click();
  await expect
    .poll(() => f.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe("?n\r\n1\r\n2\r\n10\r\n");
});

test("Ctrl+Enter sorts and copies rows beyond the first loaded block", async () => {
  await f.host.evaluate((el) => el.removeAttribute("style"));
  const values = Array.from({ length: 251 }, (_, i) => 250 - i);
  await f.enter(`SELECT ?n WHERE { VALUES ?n { ${values.join(" ")} } }`);
  await f.pane.locator(".monaco-editor textarea").press("Control+Enter");
  const results = f.page.locator(".query-results-panel:visible");
  await expect(results.locator(".state")).toHaveText("251 rows");
  await results.getByRole("button", { name: "?n", exact: true }).click();
  await expect(
    results.locator('.ag-row[row-index="0"] [col-id="0"]'),
  ).toHaveText("0");
  await results
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await results.getByRole("menuitem", { name: "Copy results as CSV" }).click();
  await expect
    .poll(() => f.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe("?n\r\n" + values.reverse().join("\r\n") + "\r\n");
  await results
    .locator(".ag-body-vertical-scroll-viewport")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(
    results.locator('.ag-row[row-index="250"] [col-id="0"]'),
  ).toHaveText("250");
});

test("CSV copies every retained row above the general clipboard text limit", async () => {
  test.setTimeout(120_000);
  await f.host.evaluate((el) => el.removeAttribute("style"));
  const value = "v".repeat(45_000);
  const count = 251;
  await f.enter(
    `SELECT ?value WHERE { VALUES ?n { ${Array.from({ length: count }, (_, i) => i).join(" ")} } BIND("${value}" AS ?value) }`,
  );
  await f.pane.getByRole("button", { name: "Run", exact: true }).click();
  const results = f.page.locator(".query-results-panel:visible");
  await expect(results.locator(".state")).toHaveText("251 rows", {
    timeout: 40_000,
  });
  await results
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await results.getByRole("menuitem", { name: "Copy results as CSV" }).click();
  await expect
    .poll(() =>
      f.app.evaluate(
        async ({ clipboard }, { value, count }) => {
          const text = await clipboard.readText();
          return {
            length: text.length,
            complete: text === "?value\r\n" + (value + "\r\n").repeat(count),
          };
        },
        { value, count },
      ),
    )
    .toEqual({ length: 8 + count * (value.length + 2), complete: true });
  const run = (await f.history()).current.lastRun!;
  const rejected = await f.page.evaluate(async (run) => {
    try {
      await window.axiom.copyQueryCsv({
        id: run.summary.id,
        key: "unrelated-query",
        epoch: run.datasetEpoch,
        shown: [0],
      });
      return "unexpected copy";
    } catch (error) {
      return (error as Error).message;
    }
  }, run);
  expect(rejected).toContain("no longer retained");
  expect(
    await f.app.evaluate(
      async ({ clipboard }) => (await clipboard.readText()).length,
    ),
  ).toBe(8 + count * (value.length + 2));
});

test("examples appear only with the bundled ontology and preserve the current draft", async () => {
  await f.pane
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await expect(
    f.pane.getByRole("menuitem", { name: "Named pizzas and their toppings" }),
  ).toHaveCount(0);
  await f.page.keyboard.press("Escape");
  await queryMenu(f.app, "file.example");
  await expect
    .poll(() =>
      f.page.evaluate(
        async () => (await window.axiom.request<any>("state")).ontology.example,
      ),
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        JSON.parse(
          await readFile(path.join(f.profile, "last-session.json"), "utf8"),
        ).workspace.ontology.example,
    )
    .toBe(true);
  await queryMenu(f.app, "view.query");
  await f.size(898, 530);
  await f.enter("# unfinished draft\nSELECT ?p WHERE {");
  const previous = await f.history();
  await f.pane
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await f.pane
    .getByRole("menuitem", {
      name: "Named pizzas and their toppings",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await f.history()).entries.length)
    .toBe(previous.entries.length + 1);
  const view = await f.history();
  expect(view.current.source).toBe("example");
  expect(view.current.lastRun).toBeUndefined();
  await f.pane.getByRole("button", { name: "History", exact: true }).click();
  await f.pane.locator(`.hist [data-action="${previous.activeId}"]`).click();
  await expect
    .poll(async () => (await f.history()).current.text)
    .toBe(previous.current.text);
});

test("History keeps twelve newest documents and restores focus through overflow", async () => {
  const oldest = (await f.history()).activeId;
  await f.page.evaluate(async () => {
    for (let i = 0; i < 13; i++)
      await window.axiom.queryHistory.apply({
        type: "add",
        text: `ASK {} # retained ${i}`,
        source: "manual",
        origin: "Courses",
        namespace: "https://axiom.test/courses#",
      });
  });
  const entries = (await f.history()).entries;
  const history = f.pane.getByRole("button", { name: "History", exact: true });
  await history.click();
  const popup = f.pane.getByRole("menu", { name: "History", exact: true });
  const rows = popup.getByRole("menuitem");
  await expect(rows).toHaveCount(12);
  await expect(rows.first()).toContainText("retained 12");
  await expect(rows.last()).toContainText("retained 1");
  await f.page.keyboard.press("End");
  await expect(rows.last()).toBeFocused();
  await f.page.keyboard.press("Home");
  await expect(rows.first()).toBeFocused();
  await f.page.keyboard.press("Tab");
  await expect(popup).toBeHidden();
  await expect(history).toBeFocused();
  await f.size(340, 530);
  await expect(history).toBeHidden();
  const more = f.pane.getByRole("button", {
    name: "More actions",
    exact: true,
  });
  await more.click();
  await f.pane.getByRole("menuitem", { name: "History", exact: true }).click();
  await expect(rows.first()).toBeFocused();
  await f.page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await f.pane.getByRole("menuitem", { name: "History", exact: true }).click();
  await f.page.keyboard.press("ArrowDown");
  await f.page.keyboard.press("Enter");
  await expect
    .poll(async () => (await f.history()).activeId)
    .toBe(entries.at(-2)!.id);
  await expect(f.pane.locator(".monaco-editor textarea")).toBeFocused();
  await more.click();
  await f.pane
    .getByRole("menuitem", { name: "Find a query in history", exact: true })
    .click();
  const dialog = f.page.getByRole("dialog", {
    name: "Query history",
    exact: true,
  });
  await dialog.getByRole("searchbox").fill("PREFIX ax:");
  await dialog
    .locator(".query-history-list button")
    .filter({ hasText: "PREFIX ax:" })
    .click();
  await expect.poll(async () => (await f.history()).activeId).toBe(oldest);
});
