import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Snapshot } from "../../src/shared/protocol";
const base = "https://quality.test/#";
const prefix = `@prefix : <${base}>. @prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. @prefix skos: <http://www.w3.org/2004/02/skos/core#>. `;
const body = `:Shop_Class a owl:Class; rdfs:label "Shop Class"; rdfs:comment "Courses in the shop".
:Industrial_Safety a owl:Class; rdfs:subClassOf :Shop_Class.
:Synonym_Only a owl:Class; rdfs:subClassOf :Shop_Class; skos:altLabel "Alternative".
:NewClass a owl:Class; rdfs:subClassOf :Shop_Class.
<https://other.test/#Industrial_Safety> a owl:Class; rdfs:label "Different entity".`;
let app: ElectronApplication, page: Page, profile: string, file: string;
const errors: string[] = [];
const pane = (p = page) =>
  p.getByRole("region", { name: "Ontology Quality", exact: true });
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const selected = () =>
  pane().getByRole("region", { name: "Selected quality finding" });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, w, w.webContents as never);
  }, id);
}
async function openFile() {
  const imported = page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const off = window.axiom.onCommand((id) => {
          if (id === "workspace.imported") {
            off();
            resolve();
          }
        });
      }),
  );
  await menu("file.open");
  await imported;
  await menu("tools.quality");
  await expect(pane()).toBeVisible();
}
async function launch() {
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
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
  await app.evaluate(({ dialog, BrowserWindow }, file) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      BrowserWindow.getAllWindows()[0].setFocusable(false);
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  }, file);
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await openFile();
  await expect.poll(async () => (await state()).classCount).toBe(6);
  await menu("tools.quality");
  await expect(pane()).toBeVisible();
}
async function scan() {
  await pane().getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(
    pane().getByText("Scan complete", { exact: true }),
  ).toBeVisible();
}
async function choose(rule: string, iriText = "") {
  await pane()
    .getByRole("combobox", { name: "Rule", exact: true })
    .selectOption(rule);
  await pane()
    .getByRole("searchbox", { name: "Search findings" })
    .fill(iriText);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/quality-"));
  file = path.join(profile, "quality.ttl");
  await writeFile(file, prefix + body);
  await launch();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page && !page.isClosed())
    await info.attach("Quality", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

test("normal application menus open a read-only scan with exact label and analysis findings", async () => {
  const before = await state();
  await scan();
  expect((await state()).version).toBe(before.version);
  expect((await state()).dirty).toBe(before.dirty);
  await choose("label.missing", "Industrial_Safety");
  await expect(selected()).toContainText("Industrial Safety");
  await expect(selected()).toContainText(base + "Industrial_Safety");
  await selected()
    .getByText("Statement evidence and related entities", { exact: true })
    .click();
  await expect(selected().locator("pre")).toContainText("subClassOf");
  await choose("analysis.excluded", "Synonym_Only");
  await expect(pane()).toContainText("No findings match these filters");
  await choose("label.missing", "Synonym_Only");
  await expect(selected()).toContainText("Synonym Only");
  await menu("view.hierarchy");
  await menu("view.quality");
  await expect(
    pane().getByText("Scan complete", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/testing/quality-light.png" });
});
test("finding navigation keeps exact identity across equal local names", async () => {
  await scan();
  await choose("label.missing", base + "Industrial_Safety");
  await selected()
    .getByRole("button", { name: "Open entity in Details" })
    .click();
  await expect
    .poll(async () => (await state()).selected)
    .toBe(base + "Industrial_Safety");
  await expect(
    page.getByRole("textbox", { name: "Entity label", exact: true }),
  ).toBeVisible();
});
test("reviewed batch adds labels without renaming placeholder identifiers and supports Undo and Redo", async () => {
  await scan();
  await pane()
    .getByRole("button", { name: "Review missing labels (3)" })
    .click();
  const review = pane().getByRole("region", { name: "Review proposed labels" });
  await review
    .getByRole("button", { name: "Select all proposed labels" })
    .click();
  await review
    .getByLabel("Proposed label for " + base + "NewClass", { exact: true })
    .fill("A deliberate name");
  await review
    .getByRole("button", { name: "Preview selected additions" })
    .click();
  await expect(review.locator("pre")).toContainText("A deliberate name");
  const before = await state();
  await review.getByRole("button", { name: "Apply 3 label additions" }).click();
  await expect(pane()).toContainText("Stale report");
  const after = await state();
  expect(after.version).toBe(before.version + 1);
  expect(after.entities.find((e) => e.iri === base + "NewClass")?.label).toBe(
    "A deliberate name",
  );
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "NewClass")
          ?.label,
    )
    .toBeUndefined();
  await menu("edit.redo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "NewClass")
          ?.label,
    )
    .toBe("A deliberate name");
  await scan();
  await choose("label.missing");
  await expect(pane()).toContainText("No findings match these filters");
});
test("an intervening edit invalidates a label preview", async () => {
  await scan();
  await pane()
    .getByRole("button", { name: "Review missing labels (3)" })
    .click();
  const review = pane().getByRole("region", { name: "Review proposed labels" });
  await review
    .getByRole("button", { name: "Select all proposed labels" })
    .click();
  await review
    .getByRole("button", { name: "Preview selected additions" })
    .click();
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Changed label" }),
    base + "Shop_Class",
  );
  await expect(
    review.getByRole("button", { name: "Apply 3 label additions" }),
  ).toBeDisabled();
});
test("exceptions are evidence-specific, survive reopening, and can be removed", async () => {
  await scan();
  await choose("label.missing", base + "Industrial_Safety");
  await selected()
    .getByLabel("Exception reason")
    .fill("Reviewed intentional omission");
  await selected()
    .getByRole("button", { name: "Record intentional exception" })
    .click();
  await expect(pane()).toContainText("No findings match these filters");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.preferences.load()))
          .panelState?.["quality.exceptions"],
    )
    .toMatchObject([{ reason: "Reviewed intentional omission" }]);
  await app.close();
  await launch();
  await scan();
  await choose("label.missing", base + "Industrial_Safety");
  await expect(pane()).toContainText("No findings match these filters");
  await pane().getByLabel("Show suppressed").check();
  await expect(selected()).toContainText("Reviewed intentional omission");
  await selected().getByRole("button", { name: "Remove exception" }).click();
  await pane().getByLabel("Show suppressed").uncheck();
  await expect(selected()).toContainText("Industrial Safety");
});
test("exports all findings and configuration through native save dialogs", async () => {
  await scan();
  await choose("label.missing", "Industrial");
  for (const format of ["json", "csv"]) {
    const destination = path.join(profile, "quality-report." + format);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, destination);
    await pane()
      .getByRole("button", { name: "Export " + format.toUpperCase() })
      .click();
    await expect(pane()).toContainText("Exported " + destination);
    const data = await readFile(destination, "utf8");
    if (format === "json") {
      const r = JSON.parse(data);
      expect(r.scanned).toBe(5);
      expect(
        r.findings.filter((f: { rule: string }) => f.rule === "label.missing"),
      ).toHaveLength(3);
      expect(r.options.scope).toBe("ontology");
    } else {
      expect(data).toContain("scanConfiguration");
      expect(data).toContain("Synonym_Only");
    }
  }
});
test("configurable scope and profile persist and change the scan coverage", async () => {
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("branch");
  await pane()
    .getByRole("combobox", { name: "Branch root" })
    .selectOption(base + "Industrial_Safety");
  await pane()
    .getByRole("combobox", { name: "Profile", exact: true })
    .selectOption("OBO-inspired");
  await scan();
  await expect(pane()).toContainText("1 entities scanned");
  await choose("definition.missing");
  await expect(selected()).toContainText(
    "OBO-inspired selected project constraint",
  );
  await pane().getByText("Scan settings and rules", { exact: true }).click();
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("namespace");
  await pane()
    .getByLabel("Namespace", { exact: true })
    .fill("https://other.test/#");
  await scan();
  await choose("description.missing");
  await expect(selected()).toContainText("Different entity");
});
test("detached dark results retain navigation, filtering, and accessible controls", async () => {
  await scan();
  await choose("label.missing", "Industrial");
  await menu("theme.dark");
  await pane().getByRole("button", { name: "Run scan", exact: true }).focus();
  const popup = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await popup;
  await expect(pane(child)).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("popout"),
    );
    w?.setSize(700, 850);
  });
  await pane(child)
    .getByRole("combobox", { name: "Rule", exact: true })
    .selectOption("label.missing");
  await pane(child)
    .getByRole("searchbox", { name: "Search findings" })
    .fill("Industrial");
  await expect(pane(child)).toContainText("Industrial Safety");
  const audit = await new AxeBuilder({ page: child })
    .setLegacyMode(true)
    .include('[data-panel="quality"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await child.screenshot({
    path: "artifacts/testing/quality-dark-detached.png",
  });
  await pane(child)
    .getByRole("button", { name: "Run scan", exact: true })
    .focus();
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
});
test("large results paginate without truncating totals and workspace replacement makes reports stale", async () => {
  await writeFile(
    file,
    prefix +
      Array.from({ length: 121 }, (_, i) => `:A${i} a owl:Class.`).join(" "),
  );
  const previous = (await state()).datasetEpoch;
  await openFile();
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(previous);
  await scan();
  await choose("label.missing");
  const pages = pane().getByRole("navigation", {
    name: "Quality findings pages",
  });
  await expect(pages).toContainText("Page 1 of 4");
  for (let i = 0; i < 3; i++)
    await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pages).toContainText("Page 4 of 4");
  await expect(pane().locator(".quality-table-scroll tbody tr")).toHaveCount(1);
  await openFile();
  await expect(pane()).toContainText("Stale report");
});
test("failure and cancellation cannot be mistaken for a completed clean scan", async () => {
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("branch");
  await pane().getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(pane().getByRole("alert")).toContainText("Choose a named class");
  await expect(
    pane().getByRole("button", { name: "Export JSON" }),
  ).toBeDisabled();
  await writeFile(
    file,
    prefix +
      Array.from({ length: 3000 }, (_, i) => `:A${i} a owl:Class.`).join(" "),
  );
  await openFile();
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("ontology");
  await pane().getByRole("button", { name: "Run scan", exact: true }).click();
  await pane()
    .getByRole("button", { name: "Cancel scan", exact: true })
    .click();
  await expect(pane()).toContainText("Results are incomplete");
  await expect(
    pane().getByRole("button", { name: "Export JSON" }),
  ).toBeDisabled();
});
