import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
import { THING } from "../../src/domain/model";

const base = "https://example.test/menu#";
let app: ElectronApplication, page: Page;
const errors: string[] = [];
type Surface = "hierarchy" | "graph";
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function command(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getAllWindows().find(
        (w) => !w.webContents.getURL().includes("detached"),
      ) ?? BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, undefined as never);
  }, id);
}
async function open(surface: Surface, iri: string, target = page) {
  if (surface === "graph") {
    await page.evaluate(async (iri) => {
      await window.axiom.request("seed", { iris: [iri], expand: false });
      await window.axiom.request("select", { iri });
    }, iri);
    const canvas = target.getByTestId("graph-canvas");
    await canvas.focus();
    await canvas.press("Shift+F10");
  } else {
    const entity = (await state()).entities.find((e) => e.iri === iri)!;
    await target
      .getByRole("button", {
        name: entity.kind.endsWith("Property") ? /^Properties/ : /^Classes/,
      })
      .click();
    await target
      .getByRole("textbox", { name: "Filter hierarchy" })
      .fill(entity.name);
    const row = target
      .locator(".tree-row")
      .filter({ has: target.locator('[data-rename-iri="' + iri + '"]') });
    await row.focus();
    await row.press("Shift+F10");
  }
  const menu = target.getByRole("menu", {
    name: surface === "graph" ? "Graph node actions" : "Entity actions",
    exact: true,
  });
  await expect(menu).toBeVisible();
  return menu;
}
async function uniqueKeys(menu: Locator) {
  const keys = await menu
    .locator(":scope > button")
    .evaluateAll((items) => items.map((e) => e.getAttribute("data-menu-key")));
  expect(keys.every((k) => !!k && k.length === 1)).toBe(true);
  expect(new Set(keys).size).toBe(keys.length);
}
async function child(menu: Locator, key: string, name: string, target = page) {
  await menu.press(key);
  const submenu = target.getByRole("menu", { name, exact: true });
  await expect(submenu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name, exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await uniqueKeys(submenu);
  return submenu;
}

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/menu-groups-"));
  const file = path.join(profile, "menu.ttl");
  await writeFile(
    file,
    `@prefix : <${base}>.
    @prefix owl: <http://www.w3.org/2002/07/owl#>.
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
    :Root a owl:Class; rdfs:label "Root".
    :Child a owl:Class; rdfs:subClassOf :Root.
    :Defined a owl:Class; owl:equivalentClass :Child.
    :relation a owl:ObjectProperty.
    :value a owl:DatatypeProperty.
    :Example a owl:NamedIndividual, :Root.
    _:anonymous a owl:Class; rdfs:label "Anonymous".
  `,
  );
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
  app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((w) => w.setFocusable(false));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  }, file);
  await command("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some(
        (e) => e.iri === base + "Defined" && e.kind === "Defined",
      ),
    )
    .toBe(true);
});
test.afterEach(async ({}, info) => {
  if (app) {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("menu", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    await app.close();
  }
  expect(errors).toEqual([]);
});

for (const surface of ["hierarchy", "graph"] as const) {
  test(`${surface} arrow navigation stays in the submenu and Tab leaves the entire cascade`, async () => {
    for (const exitKey of ["Tab", "Shift+Tab"]) {
      const menu = await open(surface, base + "Root");
      const trigger = menu.getByRole("menuitem", { name: "Find", exact: true });
      await trigger.focus();
      await trigger.press("ArrowRight");
      const find = page.getByRole("menu", { name: "Find", exact: true });
      await expect(
        find.getByRole("menuitem", { name: "Similar", exact: true }),
      ).toBeFocused();
      await find.press("End");
      await expect(
        find.getByRole("menuitem", {
          name: surface === "hierarchy" ? "Instances" : "Touchpoints",
          exact: true,
        }),
      ).toBeFocused();
      await find.press("Home");
      await find.press("ArrowDown");
      await expect(
        find.getByRole("menuitem", { name: "Synonyms", exact: true }),
      ).toBeFocused();
      await find.press(exitKey);
      await expect(page.getByRole("menu")).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            document.activeElement !== document.body &&
            !document.activeElement?.closest(".entity-context-menu"),
        ),
      ).toBe(true);
    }
  });
  for (const kind of [
    "Root",
    "Defined",
    "Thing",
    "relation",
    "value",
    ...(surface === "graph" ? ["Example", "Anonymous"] : []),
  ]) {
    test(`${surface} ${kind} menu keeps unique keys, scoped actions and keyboard parent focus`, async () => {
      const iri =
        kind === "Thing"
          ? THING
          : kind === "Anonymous"
            ? (await state()).entities.find(
                (e) => e.iri.startsWith("_:") && e.name === "Anonymous",
              )!.iri
            : base + kind;
      const isClass = !["relation", "value", "Example"].includes(kind);
      const before = await state();
      const menu = await open(surface, iri);
      await uniqueKeys(menu);
      await expect(
        menu.getByRole("menuitem", { name: "Analyze", exact: true }),
      ).toHaveCount(isClass ? 1 : 0);
      await expect(
        menu.getByRole("menuitem", {
          name: /^(Research|Analyze sparsity|Find instances|Find Synonyms|Find similar)/,
        }),
      ).toHaveCount(0);
      if (isClass) {
        const analysis = await child(menu, "a", "Analyze");
        const sparsity = analysis.getByRole("menuitem", {
          name: "Sparsity",
          exact: true,
        });
        if (kind === "Anonymous") {
          await expect(sparsity).toBeDisabled();
          await analysis.press("s");
          await expect(analysis).toBeVisible();
        } else await expect(sparsity).toBeEnabled();
        await analysis.press("ArrowLeft");
        await expect(
          menu.getByRole("menuitem", { name: "Analyze", exact: true }),
        ).toBeFocused();
      }
      const find = await child(menu, "f", "Find");
      await expect(find.getByRole("menuitem")).toHaveText([
        "Similar",
        "Synonyms",
        "Touchpoints",
        ...(surface === "hierarchy" && isClass ? ["Instances"] : []),
      ]);
      for (const name of ["Synonyms", "Touchpoints"]) {
        const item = find.getByRole("menuitem", { name, exact: true });
        if (kind === "Anonymous") {
          await expect(item).toBeDisabled();
          await find.press(name === "Synonyms" ? "y" : "t");
          await expect(find).toBeVisible();
        } else await expect(item).toBeEnabled();
      }
      if (kind === "Defined") {
        await expect(
          menu.getByRole("menuitem", {
            name: "Show instances (0)",
            exact: true,
          }),
        ).toBeDisabled();
        if (surface === "hierarchy")
          await expect(
            find.getByRole("menuitem", { name: "Instances", exact: true }),
          ).toBeEnabled();
      }
      await find.press("Escape");
      await expect(
        menu.getByRole("menuitem", { name: "Find", exact: true }),
      ).toBeFocused();
      const suggest = await child(menu, "g", "Suggest");
      await expect(suggest.getByRole("menuitem")).toHaveText([
        "Add Children",
        "Add Parents",
        "Define New",
      ]);
      for (const name of ["Add Children", "Add Parents"]) {
        if (isClass)
          await expect(
            suggest.getByRole("menuitem", { name, exact: true }),
          ).toBeEnabled();
        else
          await expect(
            suggest.getByRole("menuitem", { name, exact: true }),
          ).toBeDisabled();
      }
      await suggest.press("Escape");
      await expect(
        menu.getByRole("menuitem", { name: "Suggest", exact: true }),
      ).toBeFocused();
      await menu.press("Escape");
      const after = await state();
      expect(after.version).toBe(before.version);
      expect(after.tripleCount).toBe(before.tripleCount);
    });
  }

  test(`${surface} Analyze keyboard action opens the requested class and preserves RDF`, async () => {
    const menu = await open(surface, base + "Root");
    const before = await state();
    const analysis = await child(menu, "a", "Analyze");
    await analysis.press("s");
    const report = page.getByRole("region", {
      name: "Sparsity analysis",
      exact: true,
    });
    await expect(
      report.getByRole("heading", { name: "Root", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect((await state()).version).toBe(before.version);
    expect((await state()).tripleCount).toBe(before.tripleCount);
  });

  test(`${surface} Find keyboard action opens Touchpoints without a search`, async () => {
    const menu = await open(surface, base + "Root");
    const find = await child(menu, "f", "Find");
    await find.press("t");
    const pane = page.getByRole("region", {
      name: "Touchpoints",
      exact: true,
    });
    await expect(
      pane.getByRole("textbox", { name: "Query", exact: true }),
    ).toHaveValue("Root");
    await expect(pane.locator(".cand")).toHaveCount(0);
    await expect(pane.locator(".tpq")).toContainText("0 candidates");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator(".inline-rename")).toHaveCount(0);
  });
}

test("graph Find no longer conflicts with Rename, and taxonomy navigation retains its own key", async () => {
  let menu = await open("graph", base + "Root");
  const find = await child(menu, "f", "Find");
  await expect(page.locator(".inline-rename")).toHaveCount(0);
  await find.press("Escape");
  await menu.getByRole("menuitem", { name: "Find", exact: true }).hover();
  await expect(find).toBeVisible();
  await menu.getByRole("menuitem", { name: "Suggest", exact: true }).hover();
  const suggest = page.getByRole("menu", { name: "Suggest", exact: true });
  await expect(suggest).toBeVisible();
  await suggest.press("Escape");
  await expect(
    menu.getByRole("menuitem", { name: "Suggest", exact: true }),
  ).toBeFocused();
  await menu.press("n");
  await expect(page.locator(".inline-rename")).toBeVisible();
  await page.keyboard.press("Escape");
  menu = await open("graph", base + "Root");
  await menu.press("x");
  await expect(
    page.getByRole("textbox", { name: "Filter hierarchy" }),
  ).toHaveValue("");
  await expect(
    page.locator('.tree-row[data-entity-iri="' + base + 'Root"]'),
  ).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
});

test("Hierarchy neighbor expansion keeps its remapped key separate from Analyze", async () => {
  const menu = await open("hierarchy", base + "Root");
  await menu.press("e");
  await expect
    .poll(async () =>
      (await state()).graph.nodes.some((n) => n.iri === base + "Root"),
    )
    .toBe(true);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Sparsity analysis", exact: true }),
  ).toHaveCount(0);
});

test("detached graph submenus fit both themes, restore focus and target the selected node", async () => {
  await open("graph", base + "Root");
  await page.keyboard.press("Escape");
  await page.getByTestId("graph-canvas").focus();
  const waiting = app.waitForEvent("window");
  await command("pane.detach");
  const detached = await waiting;
  await expect(detached.getByTestId("graph-canvas")).toBeVisible();
  await (
    await app.browserWindow(detached)
  ).evaluate((w) => {
    w.setMinimumSize(300, 300);
    w.setContentSize(420, 600);
    if (process.env.AXIOM_TEST_BACKGROUND === "1") w.setFocusable(false);
  });
  await expect.poll(() => detached.evaluate(() => innerWidth)).toBe(420);
  for (const theme of ["light", "dark"]) {
    await command("theme." + theme);
    const menu = await open("graph", base + "Root", detached);
    const find = await child(menu, "f", "Find", detached);
    for (const popup of [menu, find]) {
      const bounds = (await popup.boundingBox())!;
      const size = await detached.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height + 1);
    }
    expect(
      (
        await new AxeBuilder({ page: detached })
          .setLegacyMode()
          .include(".entity-context-menu")
          .analyze()
      ).violations,
    ).toEqual([]);
    await detached.screenshot({
      path: `artifacts/testing/issue-18-${theme}.png`,
    });
    await find.press("ArrowLeft");
    await expect(
      menu.getByRole("menuitem", { name: "Find", exact: true }),
    ).toBeFocused();
    await menu.press("Escape");
    await expect(detached.getByTestId("graph-canvas")).toBeFocused();
  }
  const menu = await open("graph", base + "Root", detached);
  const analyze = await child(menu, "a", "Analyze", detached);
  await analyze.press("s");
  await expect(
    detached
      .getByRole("region", { name: "Sparsity analysis", exact: true })
      .getByRole("heading", { name: "Root", exact: true }),
  ).toBeVisible();
});
