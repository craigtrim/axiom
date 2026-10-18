// craigtrim/axiom#88: retained documents and explicit proposals under the shared Query chrome.
import { test, expect, _electron } from "@playwright/test";
import {
  launchQuery,
  queryMenu,
  starter,
  type QueryFixture,
} from "./query-reference-fixture";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";
let f: QueryFixture;
test.beforeEach(async () => {
  f = await launchQuery();
});
test.afterEach(async () => {
  await f?.app.close();
  expect(f?.errors ?? []).toEqual([]);
});
const text = async () => (await f.history()).current.text;
async function more(name: string) {
  await f.pane
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await f.pane.getByRole("menuitem", { name }).click();
}
async function select(id: string) {
  await f.pane.getByRole("button", { name: "History", exact: true }).click();
  await f.pane.locator(`.hist [data-action="${id}"]`).click();
  await expect.poll(async () => (await f.history()).activeId).toBe(id);
}
async function openProposal() {
  await f.composer
    .getByRole("button", { name: "Open in the editor", exact: true })
    .click();
  await expect(f.pane.locator(".toast")).toContainText("Opened as document");
}
async function preview() {
  await f.describe("List classes");
  await f.composer.locator(".ctxbox summary").click();
  await expect(f.composer.locator(".cc")).toContainText("List classes");
  return f.composer.getByRole("textbox", { name: "Describe the query" });
}
test("formatting is undoable from More and Shift+Alt+F, and preserves invalid text", async () => {
  const source = "select ?s ?p ?o where { ?s ?p ?o . } limit 7";
  await f.enter(source);
  await more("Format SPARQL");
  await expect
    .poll(text)
    .toBe("SELECT ?s ?p ?o\nWHERE {\n  ?s ?p ?o .\n}\nLIMIT 7");
  await f.page.keyboard.press("Control+z");
  await expect.poll(text).toBe(source);
  await f.pane.locator(".monaco-editor textarea").press("Shift+Alt+F");
  await expect.poll(text).toContain("\nLIMIT 7");
  await f.enter("SELECT ?s WHERE {");
  await more("Format SPARQL");
  await expect(f.pane.locator(".state")).toContainText("Could not format");
  expect(await text()).toBe("SELECT ?s WHERE {");
});
test("retained context survives a pending preview and a repeated Generate waits for current intent", async () => {
  const input = await preview(),
    previewText = f.composer.locator(".cc");
  const prior = await previewText.innerText(),
    before = await f.history();
  await holdRequests(f.app, ["queryContext"]);
  await input.fill("courses with their credit values");
  await expect(previewText).toHaveText(prior);
  await f.composer
    .getByRole("button", { name: "Generate", exact: true })
    .evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
  await waitForHeld(f.app);
  expect((await f.history()).entries.length).toBe(before.entries.length);
  await expect(previewText).toHaveText(prior);
  await releaseRequests(f.app);
  await expect(f.composer.locator(".prop")).toContainText(
    "Validated against the query engine.",
  );
  expect((await f.history()).entries.length).toBe(before.entries.length);
  await openProposal();
  expect((await f.history()).current.generation?.request.instructions).toBe(
    "courses with their credit values",
  );
  expect((await f.history()).entries.length).toBe(before.entries.length + 1);
});
for (const action of ["edit", "close"] as const)
  test(`${action} cancels a Generate click waiting for context without cancelling an active job`, async () => {
    if (action === "close") await f.size(798, 530);
    const input = await preview();
    const before = await f.history();
    await holdRequests(f.app, ["queryContext"]);
    await input.fill("courses with their credit values");
    await f.composer
      .getByRole("button", { name: "Generate", exact: true })
      .click();
    await waitForHeld(f.app);
    if (action === "edit") await input.fill("synonyms instead");
    else await input.press("Escape");
    await releaseRequests(f.app);
    await expect
      .poll(() => f.page.evaluate(() => window.axiom.queryAssistant.status()))
      .toMatchObject({ running: false });
    if (action === "edit")
      await expect(f.composer.locator(".cc")).toContainText("synonyms instead");
    else await expect(f.composer).not.toBeVisible();
    expect((await f.history()).entries.length).toBe(before.entries.length);
    expect(
      (await f.page.evaluate(() => window.axiom.queryAssistant.status()))
        .response,
    ).toBeUndefined();
  });
test("save failures keep the draft and expose Retry saving first in More", async () => {
  const original = await text();
  await holdRequests(f.app, ["queryHistory:apply"], "queryHistory:apply");
  await f.pane.locator(".monaco-editor textarea").focus();
  await f.page.keyboard.press("Control+End");
  await f.page.keyboard.insertText("\n# saved later");
  await waitForHeld(f.app);
  await expect(f.pane.locator(".state")).toHaveText("Not run yet");
  await releaseRequests(f.app, { fail: true });
  await expect(f.pane.locator(".state")).toHaveText("Not saved");
  await expect(f.pane.locator(".state")).toHaveAttribute(
    "title",
    /Could not save query history/,
  );
  await f.pane
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await expect(f.pane.getByRole("menuitem").first()).toHaveText("Retry saving");
  await f.pane
    .getByRole("menuitem", { name: "Retry saving", exact: true })
    .click();
  await expect.poll(text).toBe(original + "\n# saved later");
  await expect(f.pane.locator(".state")).toHaveText("Not run yet");
});
test("opening proposals preserves source documents and independent Undo", async () => {
  const first = await f.history();
  await f.generate("credits");
  await openProposal();
  const generated = await text(),
    second = (await f.history()).activeId;
  await f.pane.locator(".monaco-editor textarea").focus();
  await f.page.keyboard.press("Control+End");
  await f.page.keyboard.insertText("x");
  await expect.poll(text).toBe(generated + "x");
  await select(first.activeId);
  await expect.poll(text).toBe(starter);
  await select(second);
  await expect.poll(text).toBe(generated + "x");
  await f.page.keyboard.press("Control+z");
  await expect.poll(text).toBe(generated);
  expect((await f.history()).current.lastRun).toBeUndefined();
});
test("a failed save cannot announce that a new document was created", async () => {
  const before = await f.history();
  await holdRequests(f.app, ["queryHistory:apply"], "queryHistory:apply");
  await f.pane.locator(".monaco-editor textarea").focus();
  await f.page.keyboard.press("Control+End");
  await f.page.keyboard.insertText("\n# pending");
  await f.pane.getByRole("button", { name: "New query", exact: true }).click();
  await waitForHeld(f.app);
  await releaseRequests(f.app, { fail: true });
  await expect(f.pane.locator(".state")).toHaveText("Not saved");
  await expect(f.pane.locator(".toast")).toBeHidden();
  const after = await f.history();
  expect(after.activeId).toBe(before.activeId);
  expect(after.entries.length).toBe(before.entries.length);
});
test("a failed draft flush reports the preparation error instead of redisplaying an older proposal", async () => {
  await f.generate("credits");
  await expect(f.composer.locator(".prop")).toContainText(
    "Validated against the query engine.",
  );
  const prior = await f.page.evaluate(() =>
    window.axiom.queryAssistant.status(),
  );
  await holdRequests(f.app, ["queryHistory:apply"], "queryHistory:apply");
  await f.pane.locator(".monaco-editor textarea").focus();
  await f.page.keyboard.press("Control+End");
  await f.page.keyboard.insertText("\n# preserve this draft");
  await f.composer
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await waitForHeld(f.app);
  await releaseRequests(f.app, { fail: true });
  await expect(f.composer.locator(".prop")).toContainText("Generation failed.");
  await expect(f.composer.locator(".prop")).toContainText(
    "Controlled preview failure",
  );
  expect(
    (await f.page.evaluate(() => window.axiom.queryAssistant.status())).response
      ?.completedAt,
  ).toBe(prior.response?.completedAt);
});
test("a delayed proposal survives closing Query and preserves later source edits", async () => {
  await f.size(798, 530);
  const first = (await f.history()).activeId;
  await f.generate("slow credits");
  await expect(
    f.composer.getByRole("button", { name: "Cancel generation" }),
  ).toBeVisible();
  await f.composer
    .getByRole("button", { name: "Cancel generation" })
    .press("Escape");
  await f.enter("ASK {} # later source");
  await queryMenu(f.app, "pane.close");
  await expect(f.page.locator(".query-panel")).toHaveCount(0);
  await expect
    .poll(() =>
      f.page.evaluate(
        async () => (await window.axiom.queryAssistant.status()).running,
      ),
    )
    .toBe(false);
  await queryMenu(f.app, "view.query");
  await f.size(898, 530);
  await f.describe();
  await expect(
    f.composer.getByRole("button", { name: "Open in the editor" }),
  ).toBeVisible();
  expect(await text()).toBe("ASK {} # later source");
  await openProposal();
  await select(first);
  expect(await text()).toBe("ASK {} # later source");
});
for (const [description, copy, button] of [
  ["weather", "Not supported by this context.", false],
  [
    "instructor",
    "ax:Instructor is not in the context Axiom sent, so it was not checked against the ontology.",
    true,
  ],
  [
    "unbound",
    "The projection selects ?who, which the pattern never binds.",
    true,
  ],
  ["malformed", "The proposal failed validation.", false],
  ["signed out", "Assistant exited with code 1.", false],
] as const)
  test(`Describe handles ${description} through the real gate without executing`, async () => {
    const before = await f.history();
    await f.generate(description);
    await expect(f.composer.locator(".prop")).toContainText(copy);
    expect((await f.history()).entries.length).toBe(before.entries.length);
    expect(await text()).toBe(starter);
    await expect(
      f.composer.getByRole("button", { name: "Open it for correction" }),
    ).toHaveCount(button ? 1 : 0);
    if (button) {
      await f.composer
        .getByRole("button", { name: "Open it for correction" })
        .click();
      await expect(
        f.pane.getByRole("button", { name: "Run", exact: true }),
      ).toBeDisabled();
      await f.pane.locator(".monaco-editor textarea").focus();
      await f.page.keyboard.press("Control+End");
      await f.page.keyboard.insertText(" ");
      await expect(
        f.pane.getByRole("button", { name: "Run", exact: true }),
      ).toBeEnabled();
    }
    expect((await f.history()).current.lastRun).toBeUndefined();
  });
test("generation cancellation waits for process exit, survives mode changes and permits a new request", async () => {
  await f.generate("cancel credits");
  await expect(
    f.composer.getByRole("button", { name: "Cancel generation" }),
  ).toBeVisible();
  await f.composer.getByRole("button", { name: "Fields", exact: true }).click();
  expect(
    (await f.page.evaluate(() => window.axiom.queryAssistant.status())).running,
  ).toBe(true);
  await f.describe();
  await f.composer.getByRole("button", { name: "Cancel generation" }).click();
  await expect(f.pane.locator(".toast")).toContainText("Generation cancelled.");
  expect(
    (await f.page.evaluate(() => window.axiom.queryAssistant.status())).running,
  ).toBe(false);
  await expect(f.composer.locator(".prop")).toHaveCount(0);
  await f.generate("credits");
  await expect(
    f.composer.getByRole("button", { name: "Open in the editor" }),
  ).toBeVisible();
});
test("refinement uses the exact disclosed prompt and records its source branch", async () => {
  const source = (await f.history()).activeId;
  await f.describe("credits");
  await f.composer
    .getByRole("switch", { name: "Refine the current query" })
    .click();
  await f.composer.locator(".ctxbox summary").click();
  await expect
    .poll(async () =>
      JSON.parse(
        (await f.composer.locator(".cc").innerText())
          .split("REQUEST\n")[1]
          .split("\nONTOLOGY CONTEXT")[0],
      ).currentQuery.replaceAll("\r\n", "\n"),
    )
    .toBe(starter);
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await f.composer.locator(".cc").innerText())
            .split("REQUEST\n")[1]
            .split("\nONTOLOGY CONTEXT")[0],
        ).instructions,
    )
    .toBe("credits");
  const shown = await f.composer.locator(".cc").innerText();
  await f.composer
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await expect(
    f.composer.getByRole("button", { name: "Open in the editor" }),
  ).toBeVisible();
  const response = (
    await f.page.evaluate(() => window.axiom.queryAssistant.status())
  ).response!;
  expect(response.request.currentQuery.replaceAll("\r\n", "\n")).toBe(starter);
  const { buildQueryPrompt } = await import("../../src/shared/query-assistant");
  expect(shown.replaceAll("\r\n", "\n")).toBe(
    buildQueryPrompt(response.context, response.request).replaceAll(
      "\r\n",
      "\n",
    ),
  );
  await openProposal();
  expect((await f.history()).current.parentId).toBe(source);
  await f.pane.getByRole("button", { name: "History", exact: true }).click();
  await expect(f.pane.locator(".hist .br").first()).toContainText(
    "branched from",
  );
});
test("new documents preserve forward history and older drafts remain searchable", async () => {
  const first = (await f.history()).activeId;
  await f.pane.getByRole("button", { name: "New query", exact: true }).click();
  await f.enter("# unique needle\nASK {}");
  const second = (await f.history()).activeId;
  await select(first);
  await f.pane.getByRole("button", { name: "New query", exact: true }).click();
  await expect.poll(text).toBe("");
  expect((await f.history()).entries.some((e) => e.id === second)).toBe(true);
  await more("Find a query in history");
  const dialog = f.page.getByRole("dialog", {
    name: "Query history",
    exact: true,
  });
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await dialog.getByRole("searchbox").fill("unique needle");
  await expect(dialog.locator(".query-history-list button")).toHaveCount(1);
  await dialog.locator(".query-history-list button").click();
  await expect.poll(async () => (await f.history()).activeId).toBe(second);
  await expect(f.pane.locator(".monaco-editor textarea")).toBeFocused();
  await more("Find a query in history");
  await f.page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    f.pane.getByRole("button", { name: "More actions", exact: true }),
  ).toBeFocused();
});
test("an immediate restart preserves the last unsaved keystroke without running it", async () => {
  await f.pane.getByRole("button", { name: "New query", exact: true }).click();
  await f.pane.locator(".monaco-editor textarea").focus();
  await f.page.keyboard.insertText("SELECT ?unfinished WHERE {");
  await f.app.close();
  f.app = await _electron.launch({ args: ["."], env: f.env });
  const page = await f.app.firstWindow();
  await expect(page.locator(".docking-workspace")).toBeVisible();
  const current = await page.evaluate(
    async () => (await window.axiom.queryHistory.load()).current,
  );
  expect(current.text).toBe("SELECT ?unfinished WHERE {");
  expect(current.lastRun).toBeUndefined();
});
test("formatting and comments preserve result freshness while edits and data changes expose stale rows", async () => {
  await f.host.evaluate((el) => el.removeAttribute("style"));
  const source =
    'select ?value where { values ?value { "first result" } } limit 1';
  await f.enter(source);
  await f.pane.getByRole("button", { name: "Run", exact: true }).click();
  const results = f.page.locator(".query-results-panel:visible");
  await expect(results.locator(".state")).toHaveText("1 row");
  const run = (await f.history()).current.lastRun;
  await more("Format SPARQL");
  await expect(f.pane.locator(".state")).toHaveText("1 row");
  await f.page.keyboard.press("Control+z");
  await expect.poll(text).toBe(source);
  await f.page.keyboard.press("Control+End");
  await f.page.keyboard.insertText("0");
  await expect(f.pane.locator(".state")).toHaveText("1 row, out of date");
  await f.page.keyboard.press("Control+z");
  await expect(f.pane.locator(".state")).toHaveText("1 row");
  await f.page.keyboard.press("Control+End");
  await f.page.keyboard.insertText("\n# explanation");
  await expect.poll(text).toContain("# explanation");
  await expect(f.pane.locator(".state")).toHaveText("1 row");
  await f.page.evaluate(() =>
    window.axiom.request("createClass", {
      name: "Data changed",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await expect(results.locator(".state")).toHaveText("1 row, out of date");
  await expect(results.locator(".state")).toHaveAttribute(
    "title",
    "Data changed since this run. These results show the earlier data.",
  );
  expect((await f.history()).current.lastRun).toEqual(run);
});
