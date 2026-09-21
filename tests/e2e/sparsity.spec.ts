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
import { NS, THING } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
const base = "https://example.org/sparsity#";
const prefix =
  "@prefix : <" +
  base +
  ">. @prefix owl: <" +
  NS.owl +
  ">. @prefix rdfs: <" +
  NS.rdfs +
  ">. ";
const node = (name: string, parent?: string) =>
  ":" +
  name +
  " a owl:Class" +
  (parent ? "; rdfs:subClassOf :" + parent : "") +
  ". ";
const body =
  node("Root") +
  node("A", "Root") +
  node("B", "Root") +
  Array.from({ length: 5 }, (_, i) => node("A" + i, "A")).join("") +
  node("B0", "B");
let app: ElectronApplication, page: Page, profile: string, file: string;
const errors: string[] = [];
const pane = (p = page) =>
  p.getByRole("region", { name: "Sparsity analysis", exact: true });
const finding = (p = page) =>
  p.getByRole("region", { name: "Selected finding", exact: true });
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const treeRow = (name: string) =>
  page.locator(
    '[data-panel="hierarchy"] [data-entity-iri="' +
      (name === "Thing" ? THING : base + name) +
      '"]',
  );
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
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
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file + ".axiom",
    });
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  }, file);
  await expect(page.locator(".docking-workspace")).toBeVisible();
}
async function open(name = "Root") {
  await menu("view.hierarchy");
  if (name !== "Root" && name !== "Thing") {
    const expand = treeRow("Root").getByRole("button", {
      name: "Expand Root",
      exact: true,
    });
    if (await expand.count()) await expand.click();
  }
  await treeRow(name).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Analyze sparsity", exact: true })
    .click();
  await expect(
    pane().getByRole("heading", {
      name: name === "Thing" ? "Whole taxonomy" : name,
      exact: true,
    }),
  ).toBeVisible();
}
async function replace(text: string) {
  await writeFile(file, prefix + text);
  const before = (await state()).datasetEpoch;
  await menu("file.open");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(before);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/sparsity-"));
  file = path.join(profile, "tree.ttl");
  await writeFile(file, prefix + body);
  await launch();
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "Root"),
    )
    .toBe(true);
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page && !page.isClosed())
    await info.attach("sparsity", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
test("right-click analysis opens a local report with the five-versus-one finding and leaves RDF unchanged", async () => {
  const before = await state();
  await open();
  await expect(
    finding().getByRole("heading", { name: "B", exact: true }),
  ).toBeVisible();
  await expect(finding()).toContainText("1 direct child");
  await expect(finding()).toContainText("sibling average of 5");
  await expect(finding().locator(".sparsity-score strong")).toHaveText("80");
  await expect(pane().locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await state();
  expect(after.version).toBe(before.version);
  expect(after.tripleCount).toBe(before.tripleCount);
  expect(after.graph.nodes.map((n) => n.iri)).toEqual(
    before.graph.nodes.map((n) => n.iri),
  );
  const audit = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .include('[data-panel="sparsity"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await pane().getByRole("button", { name: "Refresh", exact: true }).focus();
  await menu("pane.maximise");
  await page.screenshot({ path: "artifacts/testing/sparsity-report.png" });
});
test("selected branch scope is independent of the current selection and whole taxonomy is accessible", async () => {
  await open("A");
  await expect(pane()).toContainText("No branches meet these filters");
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "B",
  );
  await expect(
    pane().getByRole("heading", { name: "A", exact: true }),
  ).toBeVisible();
  await pane()
    .getByRole("button", { name: "Analyze selected", exact: true })
    .click();
  await expect(
    pane().getByRole("heading", { name: "B", exact: true }),
  ).toBeVisible();
  await expect(pane()).toContainText("There are no comparable sibling groups");
  await pane()
    .getByRole("button", { name: "Whole taxonomy", exact: true })
    .click();
  await expect(
    pane().getByRole("heading", { name: "Whole taxonomy", exact: true }),
  ).toBeVisible();
  await expect(
    finding().getByRole("heading", { name: "B", exact: true }),
  ).toBeVisible();
});
test("filters and descendant weighting update findings without losing keyboard focus", async () => {
  await replace(
    body + Array.from({ length: 8 }, (_, i) => node("Deep" + i, "B0")).join(""),
  );
  await open();
  const minimum = pane().getByRole("slider", {
    name: "Minimum sparsity score",
  });
  await minimum.fill("0");
  await expect(pane().locator("tbody tr")).toHaveCount(2);
  await pane()
    .getByText("How the scores work and research", { exact: true })
    .click();
  const influence = pane().getByRole("slider", {
    name: "Descendant influence",
    exact: true,
  });
  await influence.focus();
  await influence.press("Home");
  await expect(influence).toBeFocused();
  await expect(pane().locator("tbody tr")).toHaveCount(1);
  await influence.press("End");
  await expect(influence).toBeFocused();
  await expect(pane().locator("tbody tr")).toHaveCount(2);
  await pane()
    .getByRole("searchbox", { name: "Filter sparsity findings" })
    .fill("Absent");
  await expect(pane()).toContainText("No branches meet these filters");
  await pane()
    .getByRole("searchbox", { name: "Filter sparsity findings" })
    .fill("B");
  await expect(pane().locator("tbody tr")).toHaveCount(1);
  await expect(pane().getByRole("link", { name: /Lemant/ })).toHaveAttribute(
    "href",
    "https://doi.org/10.1093/sysbio/syac027",
  );
});
test("a changed parent and Undo refresh the same report from current RDF", async () => {
  await open();
  const current = await state();
  await page.evaluate(
    ({ base, version, datasetEpoch }) =>
      window.axiom.request("moveClass", {
        iri: base + "A0",
        parent: base + "B",
        fromParent: base + "A",
        version,
        datasetEpoch,
      }),
    { base, version: current.version, datasetEpoch: current.datasetEpoch },
  );
  await expect(finding().locator(".sparsity-score strong")).toHaveText("50");
  await expect(finding()).toContainText("2 direct children");
  await menu("edit.undo");
  await expect(finding().locator(".sparsity-score strong")).toHaveText("80");
});
test("findings navigate to taxonomy and Details while the report scope is retained after close and restart", async () => {
  await open();
  await finding()
    .getByRole("button", { name: "Find in taxonomy", exact: true })
    .click();
  await expect(treeRow("B")).toHaveAttribute("aria-selected", "true");
  await finding().getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Details", exact: true }),
  ).toContainText("B");
  await menu("view.sparsity");
  await pane()
    .getByRole("slider", { name: "Minimum sparsity score" })
    .fill("55");
  await pane()
    .getByRole("checkbox", { name: "Include leaf classes" })
    .uncheck();
  await pane().getByRole("button", { name: "Refresh", exact: true }).focus();
  await menu("pane.close");
  await menu("view.sparsity");
  await expect(
    pane().getByRole("slider", { name: "Minimum sparsity score" }),
  ).toHaveValue("55");
  await menu("file.saveAs");
  await app.close();
  await launch();
  await menu("view.sparsity");
  await expect(
    pane().getByRole("heading", { name: "Root", exact: true }),
  ).toBeVisible();
  await expect(
    pane().getByRole("slider", { name: "Minimum sparsity score" }),
  ).toHaveValue("55");
  await expect(
    pane().getByRole("checkbox", { name: "Include leaf classes" }),
  ).not.toBeChecked();
  await expect(finding().locator(".sparsity-score strong")).toHaveText("80");
});
test("leaf filters and cycle exclusions are visible and do not mutate hierarchy data", async () => {
  await replace(
    body +
      node("Leaf", "Root") +
      node("Cycle", "Root") +
      node("Loop", "Cycle") +
      ":Cycle rdfs:subClassOf :Loop.",
  );
  await open();
  await expect(pane()).toContainText("2 classes belong to cycles");
  await expect(
    finding().getByRole("heading", { name: "Leaf", exact: true }),
  ).toBeVisible();
  await pane()
    .getByRole("checkbox", { name: "Include leaf classes" })
    .uncheck();
  await expect(
    finding().getByRole("heading", { name: "B", exact: true }),
  ).toBeVisible();
  await expect(pane().locator("tbody tr")).toHaveCount(1);
});
test("View menu opens an empty report in a fresh workspace and never shows a previous ontology's findings", async () => {
  await open();
  const epoch = (await state()).datasetEpoch;
  await menu("file.new");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
  await menu("view.sparsity");
  await expect(pane()).toContainText("Right-click a class in Hierarchy");
  await expect(pane().locator("tbody tr")).toHaveCount(0);
});

test("a detached narrow report remains usable in the dark theme", async () => {
  await open();
  await menu("theme.dark");
  await pane().getByRole("button", { name: "Refresh", exact: true }).focus();
  const popup = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popup;
  await expect(pane(detached)).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("popout"),
    );
    if (w) {
      w.setSize(600, 800);
      if (process.env.AXIOM_TEST_BACKGROUND === "1") w.setFocusable(false);
    }
  });
  await expect(finding(detached)).toContainText("sibling average of 5");
  await pane(detached)
    .getByRole("searchbox", { name: "Filter sparsity findings" })
    .fill("B");
  await expect(pane(detached).locator("tbody tr")).toHaveCount(1);
  await pane(detached)
    .getByText("How the scores work and research", { exact: true })
    .click();
  const audit = await new AxeBuilder({ page: detached })
    .setLegacyMode(true)
    .include('[data-panel="sparsity"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await detached.screenshot({
    path: "artifacts/testing/sparsity-detached.png",
  });
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await expect(pane()).toBeVisible();
});

test("large finding sets are paged and zero-score peers remain outside the findings", async () => {
  await replace(
    node("Root") +
      node("A", "Root") +
      node("A0", "A") +
      Array.from({ length: 95 }, (_, i) => node("Leaf" + i, "Root")).join(""),
  );
  await open();
  await expect(pane().locator("tbody tr")).toHaveCount(40);
  await expect(
    pane().getByRole("navigation", { name: "Sparsity results pages" }),
  ).toContainText("95 findings");
  await pane().getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    pane().getByRole("navigation", { name: "Sparsity results pages" }),
  ).toContainText("2 / 3");
  await pane().getByRole("button", { name: "Next", exact: true }).click();
  await expect(pane().locator("tbody tr")).toHaveCount(15);
  await pane()
    .getByRole("checkbox", { name: "Include leaf classes" })
    .uncheck();
  await expect(pane()).toContainText("No branches meet these filters");
});
