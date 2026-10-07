import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/wikipedia/sustainable-business.json", import.meta.url),
    "utf8",
  ),
);
let app: ElectronApplication, page: Page, profile: string, iri: string;
const errors: string[] = [];
const pane = () =>
  page.getByRole("region", { name: "Touchpoints", exact: true });
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, BrowserWindow.getAllWindows()[0], undefined as never);
  }, id);
}
async function calls() {
  return app.evaluate(() => (globalThis as any).wikiCalls.length);
}
async function launch() {
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((w) => w.setFocusable(false));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ protocol, dialog }, fixture) => {
    (globalThis as any).wikiCalls = [];
    (globalThis as any).wikiFailure = false;
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    protocol.handle("https", (request) => {
      if (new URL(request.url).host !== "en.wikipedia.org")
        throw Error("Unexpected external request in fixture test");
      (globalThis as any).wikiCalls.push(request.url);
      if ((globalThis as any).wikiFailure)
        return new Response("Unavailable", { status: 503 });
      return Response.json(fixture);
    });
  }, fixture);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/touchpoints-"));
  await launch();
  iri = await page.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "Sustainable business",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  await menu("touchpoints.open");
  await expect(pane().getByRole("textbox", { name: "Query" })).toHaveValue(
    "Sustainable business",
  );
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
test("search is explicit, recorded results are cached indefinitely, and Refresh preserves data on error", async () => {
  await pane()
    .getByRole("textbox", { name: "Query" })
    .fill("sustainable business");
  expect(await calls()).toBe(0);
  await pane().getByRole("textbox", { name: "Query" }).press("Enter");
  await expect(pane().locator(".cand")).toHaveCount(20);
  expect(await calls()).toBe(1);
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await expect(pane()).toContainText("Fetched");
  expect(await calls()).toBe(1);
  const root = path.join(profile, "cache/wikipedia"),
    directory = (await readdir(root))[0],
    file = path.join(
      root,
      directory,
      (await readdir(path.join(root, directory)))[0],
    );
  const entry = JSON.parse(await readFile(file, "utf8"));
  entry.fetchedAt = "2001-06-01T12:00:00Z";
  await writeFile(file, JSON.stringify(entry));
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await expect(pane()).toContainText(/Fetched [\d,]+ days ago/);
  expect(await calls()).toBe(1);
  await app.evaluate(() => ((globalThis as any).wikiFailure = true));
  await pane().getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(pane().getByRole("alert")).toContainText("503");
  await expect(pane().locator(".cand")).toHaveCount(20);
  expect(await calls()).toBe(2);
  await menu("cache.clearWikipedia");
  await expect(
    page.getByText("Wikipedia cache cleared.", { exact: true }),
  ).toBeVisible();
  await app.evaluate(() => ((globalThis as any).wikiFailure = false));
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await expect(pane().getByRole("alert")).toHaveCount(0);
  expect(await calls()).toBe(3);
  await menu("cache.clearModel");
  await expect(
    page.getByText("Model cache cleared.", { exact: true }),
  ).toBeVisible();
});
test("selection offers resource predicates, one Apply is one Undo, and stale selections cannot apply", async () => {
  await menu("view.touchpoints");
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await expect(pane().locator(".cand")).toHaveCount(20);
  const row = pane().getByRole("article", {
    name: "Sustainable business",
    exact: true,
  });
  await row.getByRole("checkbox").check();
  await expect(
    row.getByRole("combobox", {
      name: "Relationship for Sustainable business",
      exact: true,
    }),
  ).toHaveValue("http://www.w3.org/2004/02/skos/core#exactMatch");
  expect(
    await row
      .getByRole("combobox", {
        name: "Relationship for Sustainable business",
        exact: true,
      })
      .locator("option")
      .allTextContents(),
  ).not.toContain("owl:sameAs");
  await row
    .getByRole("combobox", {
      name: "Relationship for Sustainable business",
      exact: true,
    })
    .selectOption("http://www.w3.org/2000/01/rdf-schema#seeAlso");
  await expect(
    row.getByRole("combobox", {
      name: "Target for Sustainable business",
      exact: true,
    }),
  ).toHaveValue("wikipedia");
  const before = (await state()).version;
  await pane()
    .getByRole("button", { name: "Apply selected touchpoints" })
    .click();
  await expect(pane()).toContainText("Added 1 touchpoint");
  const statements = await page.evaluate(
    (iri) => window.axiom.request<any>("entityDocument", { iri }),
    iri,
  );
  expect(statements.statements).toContainEqual({
    subject: iri,
    predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
    object: {
      literal: false,
      value: "https://en.wikipedia.org/wiki/Sustainable_business",
    },
  });
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await expect(row).toContainText("Linked");
  await expect(row.getByRole("checkbox")).toHaveCount(0);
  await menu("edit.undo");
  expect(
    (
      await page.evaluate(
        (iri) => window.axiom.request<any>("entityDocument", { iri }),
        iri,
      )
    ).statements.some((t: any) => t.predicate.endsWith("seeAlso")),
  ).toBe(false);
  expect((await state()).version).toBeGreaterThan(before);
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await row.getByRole("checkbox").check();
  await page.evaluate(() =>
    window.axiom.request("createClass", {
      name: "Other",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await expect(
    pane().getByRole("button", { name: "Apply selected touchpoints" }),
  ).toBeDisabled();
});
test("Wikipedia cache survives a restart and retired Research commands are absent", async () => {
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await expect(pane().locator(".cand")).toHaveCount(20);
  await app.close();
  await launch();
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  await menu("view.touchpoints");
  await pane().getByRole("button", { name: "Search", exact: true }).click();
  await expect(pane()).toContainText("Fetched");
  expect(await calls()).toBe(0);
  expect(
    await app.evaluate(({ Menu }) =>
      [
        "research.open",
        "research.run",
        "research.cancel",
        "view.research",
        "menu.research",
      ].map((id) => !!Menu.getApplicationMenu()!.getMenuItemById(id)),
    ),
  ).toEqual([false, false, false, false, false]);
});

test("rapid Refresh clicks issue one request and both themes retain the reference narrow controls", async () => {
  await pane()
    .getByRole("button", { name: "Refresh", exact: true })
    .evaluate((button) => {
      for (let i = 0; i < 100; i++) (button as HTMLButtonElement).click();
    });
  await expect(pane().locator(".cand")).toHaveCount(20);
  expect(await calls()).toBe(1);
  for (const theme of ["light", "dark"]) {
    await menu("theme." + theme);
    const bounds = (await pane().boundingBox())!;
    expect(bounds.width).toBeLessThan(420);
    const viewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    for (const name of ["Search", "Refresh"]) {
      const control = pane().getByRole("button", { name, exact: true });
      await expect(control).toBeVisible();
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(box.y).toBeGreaterThanOrEqual(bounds.y);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    await expect(pane().locator(".cand .iri2:visible")).toHaveCount(0);
    await page.screenshot({
      path: "artifacts/testing/touchpoints-" + theme + "-narrow.png",
    });
  }
});

test("two subject panes stay pinned and closing and reopening never adds a numeric suffix", async () => {
  const firstId = "touchpoints:" + encodeURIComponent(iri);
  const first = page.locator(`[data-panel="${firstId}"]`);
  await first.getByRole("textbox", { name: "Query" }).fill("Retained query");
  const other = await page.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "Other subject",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await page.evaluate((iri) => window.axiom.request("select", { iri }), other);
  await menu("touchpoints.open");
  const second = page.locator(
    `[data-panel="touchpoints:${encodeURIComponent(other)}"]`,
  );
  await expect(second.getByRole("textbox", { name: "Query" })).toHaveValue(
    "Other subject",
  );
  await expect(
    page
      .locator(
        ".flexlayout__tab_button[role=tab] .flexlayout__tab_button_content",
      )
      .filter({ hasText: "Touchpoints · Sustainable business" }),
  ).toHaveText("Touchpoints · Sustainable business");
  await expect(
    page
      .locator(
        ".flexlayout__tab_button[role=tab] .flexlayout__tab_button_content",
      )
      .filter({ hasText: "Touchpoints · Other subject" }),
  ).toHaveText("Touchpoints · Other subject");
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  await menu("touchpoints.open");
  await expect(first.getByRole("textbox", { name: "Query" })).toHaveValue(
    "Retained query",
  );
  await expect(
    page
      .locator(
        ".flexlayout__tab_button[role=tab] .flexlayout__tab_button_content",
      )
      .filter({ hasText: "Touchpoints · Sustainable business" }),
  ).toHaveCount(1);
  await first.getByRole("textbox", { name: "Query" }).focus();
  await menu("pane.close");
  await menu("touchpoints.open");
  await expect(
    page
      .locator(
        ".flexlayout__tab_button[role=tab] .flexlayout__tab_button_content",
      )
      .filter({ hasText: "Touchpoints · Sustainable business" }),
  ).toHaveText("Touchpoints · Sustainable business");
  await expect(first.locator(".pin")).toHaveText("Sustainable business");
});
