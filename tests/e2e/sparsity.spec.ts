// craigtrim/axiom#90: preserve the original domain workflows through the grouped reference UI.
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
const finding = (p = page) => pane(p).locator(".sibs");
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
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
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
  await page.getByRole("menuitem", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sparsity", exact: true }).click();
  await expect(pane().locator(".bar .state")).toContainText(
    "measured, highest",
  );
  await pane()
    .locator("..")
    .locator("..")
    .evaluate((el) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "72px",
        width: "898px",
        height: "530px",
        zIndex: "1000",
      }),
    );
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

const group = (name = "Root", p = page) =>
  pane(p).locator(`[data-band="${base + name}"]`);
const row = (name: string, parent = "Root", p = page) =>
  pane(p).locator(
    `[data-row='${JSON.stringify([base + parent, base + name])}']`,
  );
async function more(label: string, p = page) {
  await pane(p)
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await p.getByRole("menuitem", { name: label, exact: true }).click();
}
async function compute(p = page) {
  await pane(p)
    .getByRole("button", { name: /^(Compute|Recompute)$/, exact: true })
    .click();
  await expect(pane(p).locator(".bar .state")).toContainText(
    "measured, highest",
  );
}
async function selectB(p = page) {
  if ((await group("Root", p).getAttribute("aria-expanded")) !== "true")
    await group("Root", p).click();
  await row("B", "Root", p).click();
}
test("right-click analysis opens the five-versus-one comparison without changing RDF", async () => {
  const before = await state();
  await open();
  await selectB();
  await expect(row("B").locator(".sc")).toHaveText("80 of 100");
  await expect(finding()).toContainText("Peer mean 5 direct over 1 peer");
  await expect(finding().locator(".sib")).toHaveCount(2);
  const after = await state();
  expect(after.version).toBe(before.version);
  expect(after.tripleCount).toBe(before.tripleCount);
  const audit = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .include('[data-panel="sparsity"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});
test("context analysis fixes the branch scope independently of selection and settings can choose the whole taxonomy", async () => {
  await open("A");
  await expect(pane()).toContainText(
    "No finding clears the current report settings.",
  );
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "B",
  );
  await more("Change settings");
  await expect(pane().getByRole("combobox", { name: "Scope" })).toHaveValue(
    base + "A",
  );
  await pane().getByRole("combobox", { name: "Scope" }).selectOption(THING);
  await compute();
  await selectB();
  await expect(row("B").locator(".sc")).toHaveText("80 of 100");
});
test("influence and label filtering update positive findings while retaining focus", async () => {
  await replace(
    body + Array.from({ length: 8 }, (_, i) => node("Deep" + i, "B0")).join(""),
  );
  await open();
  await more("Change settings");
  await pane().getByRole("spinbutton", { name: "Minimum score" }).fill("0");
  const influence = pane().getByRole("button", {
    name: "0 percent",
    exact: true,
  });
  await influence.click();
  await expect(influence).toBeFocused();
  await compute();
  await group().click();
  await expect(pane().locator(".fin")).toHaveCount(1);
  await more("Change settings");
  await pane().getByRole("button", { name: "40 percent", exact: true }).click();
  await compute();
  await expect(pane().locator(".fin")).toHaveCount(2);
  const filter = pane().getByRole("textbox", { name: "Filter classes" });
  await filter.fill("Absent");
  await expect(pane()).toContainText("No finding clears");
  await expect(filter).toBeFocused();
  await filter.fill("B");
  await expect(pane().locator(".fin")).toHaveCount(1);
  await expect(filter).toBeFocused();
});
test("a changed parent and Undo silently refresh the retained selection and baseline", async () => {
  await open();
  await selectB();
  await expect(pane().locator(".toast")).toBeHidden({ timeout: 6000 });
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
  await expect(row("B").locator(".sc")).toHaveText("50 of 100");
  await expect(row("B")).toHaveAttribute("aria-pressed", "true");
  await expect(finding()).toContainText("2 direct, 0 nearby");
  await expect(pane().locator(".toast")).toBeHidden();
  await menu("edit.undo");
  await expect(row("B").locator(".sc")).toHaveText("80 of 100");
  await expect(finding()).toBeVisible();
  await expect(pane().locator(".toast")).toBeHidden();
});
test("navigation works and report settings survive close, workspace save and restart", async () => {
  await open();
  await selectB();
  const hierarchy = pane().getByRole("button", {
    name: "Show in Hierarchy",
    exact: true,
  });
  await hierarchy.click();
  await expect(treeRow("B")).toHaveAttribute("aria-selected", "true");
  await expect(hierarchy).toBeFocused();
  await pane()
    .getByRole("button", { name: "Open in Details", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Details", exact: true }),
  ).toContainText("B");
  await menu("view.sparsity");
  await more("Change settings");
  await pane().getByRole("spinbutton", { name: "Minimum score" }).fill("55");
  await pane().getByRole("switch").click();
  await compute();
  await row("B").click();
  await pane().getByRole("button", { name: "Recompute", exact: true }).focus();
  await menu("pane.close");
  await menu("view.sparsity");
  await expect(finding()).toBeVisible();
  await expect(row("B")).toHaveAttribute("aria-pressed", "true");
  await menu("file.saveAs");
  await app.close();
  await launch();
  await menu("view.sparsity");
  await expect(finding()).toBeVisible();
  await more("Change settings");
  await expect(
    pane().getByRole("spinbutton", { name: "Minimum score" }),
  ).toHaveValue("55");
  await expect(pane().getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(pane().getByRole("combobox", { name: "Scope" })).toHaveValue(
    base + "Root",
  );
});
test("leaf filtering preserves group expansion and reports candidate cycle exclusions", async () => {
  await replace(
    body +
      node("Leaf", "Root") +
      node("Cycle", "Root") +
      node("Loop", "Cycle") +
      ":Cycle rdfs:subClassOf :Loop.",
  );
  await open();
  await group().click();
  await expect(row("Leaf").locator(".sc")).toHaveText("100 of 100");
  await expect(pane().locator(".foot")).toContainText("3 excluded, in a cycle");
  await more("Change settings");
  await pane().getByRole("switch").click();
  await compute();
  await expect(pane().locator(".fin")).toHaveCount(1);
  await expect(row("B")).toBeVisible();
});
test("View opens settings in a new workspace without leaking the previous report", async () => {
  await open();
  await selectB();
  const epoch = (await state()).datasetEpoch;
  await menu("file.new");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
  await menu("view.sparsity");
  await expect(
    pane().getByRole("group", { name: "Sparsity settings" }),
  ).toBeVisible();
  await expect(pane().locator(".fin")).toHaveCount(0);
  await expect(pane()).toContainText("0 named classes in the store");
});
test("detached narrow dark reports retain selection and pass accessibility checks", async () => {
  await open();
  await selectB();
  await menu("theme.dark");
  await pane().getByRole("button", { name: "Recompute", exact: true }).focus();
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await waiting;
  await expect(pane(detached)).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("popout"),
    );
    if (w) {
      w.setFocusable(false);
      w.setSize(560, 800);
    }
  });
  await expect(finding(detached)).toContainText("Peer mean 5 direct");
  await pane(detached)
    .getByRole("textbox", { name: "Filter classes" })
    .fill("B");
  await expect(row("B", "Root", detached)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const audit = await new AxeBuilder({ page: detached })
    .setLegacyMode(true)
    .include('[data-panel="sparsity"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await expect(finding()).toBeVisible();
});
test("forty entry pages repeat a split group's band and keep zero-score peers out", async () => {
  await replace(
    node("Root") +
      node("A", "Root") +
      node("A0", "A") +
      Array.from({ length: 95 }, (_, i) => node("Leaf" + i, "Root")).join(""),
  );
  await open();
  await group().click();
  await expect(pane().locator(".fin")).toHaveCount(39);
  await expect(pane().locator(".foot")).toContainText("Page 1 of 3");
  await pane().getByRole("button", { name: "Next", exact: true }).click();
  await expect(pane().locator(".fin")).toHaveCount(40);
  await expect(pane().locator(".rows > :first-child")).toHaveClass("band");
  await pane().getByRole("button", { name: "Next", exact: true }).click();
  await expect(pane().locator(".fin")).toHaveCount(16);
  await more("Change settings");
  await pane().getByRole("switch").click();
  await pane().getByRole("spinbutton", { name: "Minimum score" }).fill("0");
  await compute();
  await expect(pane()).toContainText("No finding clears");
});
