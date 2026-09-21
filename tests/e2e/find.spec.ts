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
  await expect(
    d
      .getByRole("listbox", { name: "Matching entities" })
      .getByRole("option")
      .first(),
  ).toBeVisible();
  await input.press("Enter");
  await expect(d).toHaveCount(0);
  await expect(pane()).toBeVisible();
}
async function types(selected: string[]) {
  for (const label of ["Classes", "Instances", "Properties", "Other entities"])
    await pane()
      .getByRole("checkbox", { name: label, exact: true })
      .setChecked(selected.includes(label));
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
  await expect(
    d.getByRole("listbox", { name: "Matching entities" }).getByRole("option"),
  ).toHaveCount(1);
  await expect(
    d.getByRole("listbox", { name: "Matching entities" }).getByRole("option"),
  ).toContainText("Basic English");
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
  await p.getByRole("button", { name: "Names only", exact: true }).click();
  await expect(p.getByRole("status").first()).toHaveText("127 matches");
  await types(["Classes"]);
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
  await types(["Instances"]);
  await expect(p.getByRole("status").first()).toHaveText("1 match");
  await p.getByRole("button", { name: "English learner", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "Find in taxonomy", exact: true }),
  ).toBeDisabled();
  await types(["Properties"]);
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
  await types(["Classes"]);
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
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
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
    pane().getByRole("checkbox", { name: "Classes", exact: true }),
  ).toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Instances", exact: true }),
  ).not.toBeChecked();
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

test("cosine Find ranks an unseen query, facets all fields and shows match scores", async () => {
  await menu("entity.search");
  const dialog = page.getByRole("dialog", { name: "Find entities" });
  await dialog
    .getByRole("combobox", { name: "Quick Find match" })
    .selectOption("cosine");
  await dialog
    .getByRole("combobox", { name: "Search entities" })
    .fill("Englsh basc");
  await expect(
    dialog
      .getByRole("listbox", { name: "Matching entities" })
      .getByRole("option")
      .first(),
  ).toContainText("Basic English");
  await dialog
    .getByRole("combobox", { name: "Search entities" })
    .press("Enter");
  const p = pane();
  await expect(p.getByRole("combobox", { name: "Match mode" })).toHaveValue(
    "cosine",
  );
  await expect(p.locator("tbody tr").first()).toContainText("Basic English");
  await expect(p.locator("tbody tr").first().locator("meter")).toHaveAttribute(
    "value",
    /0\./,
  );
  await expect(
    p.getByRole("checkbox", { name: "rdfs:comment", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Clear fields", exact: true }).click();
  await expect(p).toContainText("Select at least one field");
  await p.getByRole("checkbox", { name: "rdfs:comment", exact: true }).check();
  await p
    .getByRole("searchbox", { name: "Find text" })
    .fill("written and spoken English");
  await expect(p.locator("tbody tr")).toHaveCount(1);
  await expect(p.locator(".find-match-evidence")).toContainText("rdfs:comment");
  await p.getByRole("button", { name: "All fields", exact: true }).click();
  await expect(
    p.getByRole("checkbox", { name: "rdf:type", exact: true }),
  ).toBeChecked();
  await p.getByRole("button", { name: "Names only", exact: true }).click();
  await p.getByRole("searchbox", { name: "Find text" }).fill("English Basic");
  await p.getByRole("slider", { name: "Minimum similarity" }).fill("1");
  await expect(p.locator("tbody tr")).toHaveCount(1);
  await expect(p.locator(".find-score strong")).toHaveText("1.000");
  await types(["Instances"]);
  await expect(p.locator("tbody tr")).toHaveCount(0);
  await p.getByRole("slider", { name: "Minimum similarity" }).fill("0.2");
  await p.getByRole("searchbox", { name: "Find text" }).fill("English learner");
  await expect(p.locator("tbody tr")).toHaveCount(1);
  await expect(p.locator("tbody tr")).toContainText("English learner");
  expect(
    (await p.locator(".find-results-scroll").boundingBox())!.height,
  ).toBeGreaterThan(120);
  await page.screenshot({ path: "artifacts/testing/find-cosine.png" });
  const axe = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="find"]')
    .analyze();
  expect(
    axe.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("Find similar starts from a taxonomy node and excludes the source entity", async () => {
  await menu("view.hierarchy");
  await page
    .getByRole("textbox", { name: "Filter hierarchy" })
    .fill("Basic English");
  const row = page.locator(".tree-row").filter({
    has: page.locator(".tree-name", { hasText: /^Basic English$/ }),
  });
  await row.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Find similar", exact: true })
    .click();
  await expect(pane()).toBeVisible();
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("Basic English");
  await expect(
    pane().getByRole("combobox", { name: "Match mode" }),
  ).toHaveValue("cosine");
  await expect(pane().locator("tbody tr").first()).toBeVisible();
  await expect(
    pane().getByRole("button", { name: "Basic English", exact: true }),
  ).toHaveCount(0);
  await pane()
    .getByRole("searchbox", { name: "Find text" })
    .fill("English Basic");
  await expect(
    pane().getByRole("button", { name: "Basic English", exact: true }),
  ).toBeVisible();
});

test("graph Find similar uses the selected name and cosine facets survive restart", async () => {
  await page.evaluate(async (iri) => {
    await window.axiom.request("seed", { iris: [iri], expand: false });
    await window.axiom.request("select", { iri });
  }, base + "Basic");
  await menu("view.graph");
  const canvas = page.getByTestId("graph-canvas");
  await canvas.focus();
  await canvas.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Graph node actions" })
    .getByRole("menuitem", { name: "Find similar", exact: true })
    .click();
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("Basic English");
  await expect(
    pane().getByRole("combobox", { name: "Match mode" }),
  ).toHaveValue("cosine");
  await pane()
    .getByRole("button", { name: "Clear fields", exact: true })
    .click();
  await pane()
    .getByRole("checkbox", { name: "rdfs:comment", exact: true })
    .check();
  await pane()
    .getByRole("searchbox", { name: "Find text" })
    .fill("written communication");
  await pane().getByRole("slider", { name: "Minimum similarity" }).fill("0.31");
  await types(["Classes"]);
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "cosine.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app.close();
  await launch();
  await menu("view.find");
  await expect(
    pane().getByRole("combobox", { name: "Match mode" }),
  ).toHaveValue("cosine");
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("written communication");
  await expect(
    pane().getByRole("slider", { name: "Minimum similarity" }),
  ).toHaveValue("0.31");
  await expect(
    pane().getByRole("checkbox", { name: "rdfs:comment", exact: true }),
  ).toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Names and aliases", exact: true }),
  ).not.toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Classes", exact: true }),
  ).toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Instances", exact: true }),
  ).not.toBeChecked();
});

test("opens every filtered result and shared ancestry in a separate graph, preserving Find and the original graph", async () => {
  await page.evaluate(async (iri) => {
    await window.axiom.request("seed", { iris: [iri], expand: false });
    await window.axiom.request("layout", { mode: "grid" });
  }, base + "Basic");
  await find("English");
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  await types(["Classes"]);
  await pane()
    .getByRole("combobox", { name: "Results per page" })
    .selectOption("25");
  await expect(pane().getByRole("status").first()).toHaveText("125 matches");
  await pane().getByRole("button", { name: "Last results page" }).click();
  await expect(pane()).toContainText("Page 5 / 5");
  await expect(pane().locator("tbody tr")).toHaveCount(25);
  const before = await state();
  const previousId = before.activeGraphId!;
  await page.screenshot({ path: "artifacts/testing/find-open-results.png" });
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  const after = await state();
  expect(after.activeGraphId).not.toBe(previousId);
  expect(after.version).toBe(before.version);
  expect(after.tripleCount).toBe(before.tripleCount);
  expect(after.graph.nodes).toHaveLength(126);
  expect(new Set(after.graph.nodes.map((n) => n.iri)).size).toBe(126);
  expect(after.graph.focus).toEqual([base + "Course"]);
  expect(after.graph.choice).toBe("radial");
  for (const [child, parent] of [
    ["Basic", "English"],
    ["English", "Course"],
    ["Course122", "Course"],
  ])
    expect(after.graph.edges).toContainEqual(
      expect.objectContaining({
        source: base + child,
        target: base + parent,
        predicate: NS.rdfs + "subClassOf",
      }),
    );
  const saved = after.graphs![previousId];
  expect(saved.nodes.map((n) => ({ iri: n.iri, x: n.x, y: n.y }))).toEqual(
    before.graph.nodes.map((n) => ({ iri: n.iri, x: n.x, y: n.y })),
  );
  expect(saved.edges).toEqual(before.graph.edges);
  expect(saved.choice).toBe(before.graph.choice);
  await expect(
    page.getByTestId("graph-canvas").filter({ visible: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/testing/find-results-ancestry.png",
  });
  await menu("view.find");
  await expect(pane()).toBeVisible();
  await expect(
    pane().getByRole("searchbox", { name: "Find text" }),
  ).toHaveValue("English");
  await expect(pane()).toContainText("Page 5 / 5");
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(3);
  await expect(
    page.getByRole("tab", { name: "Graph_3", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(async () => (await state()).activeGraphId)
    .not.toBe(after.activeGraphId);
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "result-graphs.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app.close();
  await launch();
  const restored = await state();
  expect(Object.keys(restored.graphs!)).toHaveLength(3);
  expect(
    restored.graphs![after.activeGraphId!].nodes.map((n) => n.iri),
  ).toEqual(after.graph.nodes.map((n) => n.iri));
  expect(restored.graphs![after.activeGraphId!].edges).toEqual(
    after.graph.edges,
  );
});

test("result graphs follow cosine field filters and instance ancestry without expanding siblings", async () => {
  await find("Basic");
  await pane()
    .getByRole("combobox", { name: "Match mode" })
    .selectOption("cosine");
  await pane()
    .getByRole("button", { name: "Clear fields", exact: true })
    .click();
  await pane()
    .getByRole("checkbox", { name: "rdfs:comment", exact: true })
    .check();
  await pane()
    .getByRole("searchbox", { name: "Find text" })
    .fill("A foundation in written and spoken English.");
  await pane().getByRole("slider", { name: "Minimum similarity" }).fill("1");
  await expect(pane().getByRole("status").first()).toHaveText("1 match");
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  expect(new Set((await state()).graph.nodes.map((n) => n.iri))).toEqual(
    new Set(["Basic", "English", "Course"].map((n) => base + n)),
  );
  await menu("view.find");
  await pane()
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await pane().getByRole("searchbox", { name: "Find text" }).fill("English");
  await types(["Instances"]);
  await expect(pane().getByRole("status").first()).toHaveText("1 match");
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(3);
  const graph = (await state()).graph;
  expect(new Set(graph.nodes.map((n) => n.iri))).toEqual(
    new Set(["student", "English", "Course"].map((n) => base + n)),
  );
  expect(graph.edges).toContainEqual(
    expect.objectContaining({
      source: base + "student",
      target: base + "English",
      predicate: NS.rdf + "type",
    }),
  );
  await menu("view.find");
  await pane()
    .getByRole("searchbox", { name: "Find text" })
    .fill("no such entity anywhere");
  await expect(pane().getByRole("status").first()).toHaveText("0 matches");
  await expect(
    pane().getByRole("button", {
      name: "Open results in new graph",
      exact: true,
    }),
  ).toBeDisabled();
});
