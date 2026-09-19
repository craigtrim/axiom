import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Snapshot } from "../../src/shared/protocol";
import { NS } from "../../src/domain/model";
const base = "https://example.test/courses#";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const pane = (p = page) =>
  p.getByRole("region", { name: "Find entities results" });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function launch() {
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  app.on("window", (w) => w.on("pageerror", (e) => errors.push(e.message)));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    });
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
}
async function find(text: string) {
  await menu("entity.search");
  const d = page.getByRole("dialog", { name: "Find entities" });
  const input = d.getByRole("combobox", { name: "Search entities" });
  await expect(input).toBeFocused();
  await input.fill(text);
  await expect(d.getByRole("option").first()).toBeVisible();
  await input.press("Enter");
  await expect(d).toHaveCount(0);
  await expect(pane()).toBeVisible();
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/find-"));
  await launch();
  const file = path.join(profile, "courses.ttl");
  const ttl =
    "@prefix : <" +
    base +
    ">. @prefix owl: <" +
    NS.owl +
    ">. @prefix rdfs: <" +
    NS.rdfs +
    ">. @prefix skos: <" +
    NS.skos +
    ">.\n" +
    ':Course a owl:Class; rdfs:label "Course". :English a owl:Class; rdfs:label "English Language"; rdfs:subClassOf :Course. ' +
    ':Basic a owl:Class; rdfs:label "Basic English"; rdfs:subClassOf :English; skos:altLabel "Preparatory Language"; rdfs:comment "A foundation in written and spoken English.". ' +
    ':student a owl:NamedIndividual, :English; rdfs:label "English learner". :teaches a owl:ObjectProperty; rdfs:label "English teaching". ' +
    Array.from(
      { length: 123 },
      (_, i) =>
        ":Course" +
        i +
        ' a owl:Class; rdfs:label "English Course ' +
        String(i).padStart(3, "0") +
        '"; rdfs:subClassOf :Course.',
    ).join("\n");
  await writeFile(file, ttl);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("courses.ttl");
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
  } finally {
    await app.close();
  }
  expect(errors).toEqual([]);
});
test("quick Find focuses type-ahead and sends results to a pane without changing the graph", async () => {
  await expect(page.locator(".search-command")).toHaveCount(0);
  await expect(page.locator(".command-bar")).toHaveCount(0);
  const before = (await state()).graph.nodes.map((n) => n.iri);
  await menu("entity.search");
  const d = page.getByRole("dialog", { name: "Find entities" }),
    input = d.getByRole("combobox", { name: "Search entities" });
  await expect(input).toBeFocused();
  await input.fill("prep lang");
  await expect(d.getByRole("option")).toHaveCount(1);
  await expect(d.getByRole("option")).toContainText("Basic English");
  const a = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".quick-find")
    .analyze();
  expect(
    a.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/testing/find-quick.png" });
  await input.press("Enter");
  await expect(pane()).toBeVisible();
  await expect(
    pane().getByRole("button", { name: "Basic English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toBeFocused();
  expect((await state()).graph.nodes.map((n) => n.iri)).toEqual(before);
  await expect(pane()).toContainText(
    "A foundation in written and spoken English.",
  );
  await pane().getByRole("button", { name: "Copy IRI", exact: true }).click();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    base + "Basic",
  );
  await pane().getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.locator('[data-panel="details"]')).toContainText(
    "Basic English",
  );
  await menu("view.find");
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("prep lang");
  await pane()
    .getByRole("button", { name: "Find in taxonomy", exact: true })
    .click();
  await expect(page.locator('.tree-row[aria-selected="true"]')).toContainText(
    "Basic English",
  );
});
test("Find filters, sorts and pages every match with useful result actions", async () => {
  await find("English");
  const p = pane();
  await p
    .getByRole("combobox", { name: "Search in", exact: true })
    .selectOption("name");
  await expect(p.getByRole("status").first()).toHaveText("127 matches");
  await p
    .getByRole("combobox", { name: "Entity type" })
    .selectOption("classes");
  await p
    .getByRole("combobox", { name: "Results per page" })
    .selectOption("25");
  await p.getByRole("combobox", { name: "Sort results" }).selectOption("name");
  await expect(p.getByRole("status").first()).toHaveText("125 matches");
  await expect(p.locator("tbody tr")).toHaveCount(25);
  await expect(p.locator("tbody tr").first()).toContainText("Basic English");
  await p.getByRole("button", { name: "Last results page" }).click();
  await expect(p).toContainText("Page 5 / 5");
  await expect(p.locator("tbody tr")).toHaveCount(25);
  await expect(
    p.getByRole("button", { name: "Next results page" }),
  ).toBeDisabled();
  await p
    .getByRole("combobox", { name: "Entity type" })
    .selectOption("individuals");
  await expect(p.getByRole("status").first()).toHaveText("1 match");
  await p.getByRole("button", { name: "English learner", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "Find in taxonomy", exact: true }),
  ).toBeDisabled();
  await p
    .getByRole("combobox", { name: "Entity type" })
    .selectOption("properties");
  await expect(
    p.getByRole("button", { name: "English teaching", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Reset filters", exact: true }).click();
  await p.getByRole("searchbox", { name: "Find text" }).fill("asic eng");
  await p.getByRole("combobox", { name: "Match mode" }).selectOption("phrase");
  await expect(
    p.getByRole("button", { name: "Basic English", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Basic English", exact: true }).click();
  await page.screenshot({ path: "artifacts/testing/find-results.png" });
  const a = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="find"]')
    .analyze();
  expect(
    a.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await p.getByRole("button", { name: "New graph", exact: true }).click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  expect(
    (await state()).graph.nodes.some((n) => n.iri === base + "Basic"),
  ).toBe(true);
});
test("Ctrl+F, Escape and remapped Find preserve the previous results", async () => {
  await find("Basic");
  await pane().getByRole("searchbox", { name: "Find text" }).press("Control+f");
  const d = page.getByRole("dialog", { name: "Find entities" }),
    input = d.getByRole("combobox", { name: "Search entities" });
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((e) => [
      (e as HTMLInputElement).selectionStart,
      (e as HTMLInputElement).selectionEnd,
    ]),
  ).toEqual([0, 5]);
  await input.fill("cancelled search");
  await input.press("Escape");
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("Basic");
  await page.evaluate(() =>
    window.axiom.keyboard.save({
      version: 1,
      accessKeys: {},
      bindings: { "entity.search": [{ keys: "Ctrl+Shift+F", scope: "app" }] },
    }),
  );
  await pane()
    .getByRole("searchbox", { name: "Find text" })
    .press("Control+Shift+f");
  await expect(input).toBeFocused();
  await input.press("Escape");
});
test("Find refreshes after edits and keeps filters when closed, reopened and restarted", async () => {
  await find("Basic");
  await pane()
    .getByRole("combobox", { name: "Entity type" })
    .selectOption("classes");
  await page.evaluate(async (iri) => {
    const d = await window.axiom.request<any>("entityDocument", { iri });
    await window.axiom.request("updateEntity", {
      iri,
      version: d.version,
      datasetEpoch: d.datasetEpoch,
      statements: d.statements.map((t: any) =>
        t.predicate.endsWith("#label")
          ? { ...t, object: { literal: true, value: "Revised English" } }
          : t,
      ),
    });
  }, base + "Basic");
  await pane()
    .getByRole("combobox", { name: "Search in", exact: true })
    .selectOption("name");
  await expect(pane().getByRole("status").first()).toHaveText("0 matches");
  await pane().getByRole("searchbox", { name: "Find text" }).fill("Revised");
  await expect(
    pane().getByRole("button", { name: "Revised English", exact: true }),
  ).toBeVisible();
  await pane().getByRole("searchbox", { name: "Find text" }).blur();
  await menu("pane.close");
  await expect(pane()).toHaveCount(0);
  await menu("view.find");
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("Revised");
  await expect(
    pane().getByRole("combobox", { name: "Entity type" }),
  ).toHaveValue("classes");
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "saved.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app.close();
  await launch();
  await menu("view.find");
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("Revised");
  await expect(
    pane().getByRole("button", { name: "Revised English", exact: true }),
  ).toBeVisible();
});
test("Find is usable in a detached narrow pane and opens quick Find there", async () => {
  await find("English");
  await pane().getByRole("searchbox", { name: "Find text" }).focus();
  const popupPromise = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popupPromise;
  await expect(pane(detached)).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("popout"),
    );
    w?.setSize(650, 650);
  });
  await pane(detached)
    .getByRole("searchbox", { name: "Find text" })
    .fill("Basic");
  await expect(
    pane(detached).getByRole("button", { name: "Basic English", exact: true }),
  ).toBeVisible();
  await pane(detached)
    .getByRole("searchbox", { name: "Find text" })
    .press("Control+f");
  await expect(
    detached.getByRole("dialog", { name: "Find entities" }),
  ).toBeVisible();
  await detached
    .getByRole("combobox", { name: "Search entities" })
    .fill("English");
  await detached
    .getByRole("combobox", { name: "Search entities" })
    .press("Enter");
  await expect(
    pane(detached).getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("English");
  await detached.screenshot({ path: "artifacts/testing/find-detached.png" });
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await expect(pane()).toBeVisible();
});
