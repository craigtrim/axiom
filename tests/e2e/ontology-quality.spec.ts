// Desktop behaviour of the rebuilt Ontology Quality pane (craigtrim/axiom#42, craigtrim/axiom#44).
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
const summary = (p = page) => pane(p).locator(".bar .sum").first();
const band = (title: string, p = page) =>
  pane(p).locator("button.rule").filter({ hasText: title });
const row = (name: string, p = page) =>
  pane(p).locator("button.fname").filter({ hasText: name });
const detail = (p = page) => pane(p).locator(".fdet");
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
  await expect.poll(async () => (await state()).classCount).toBeGreaterThan(0);
  await menu("tools.quality");
  await expect(pane()).toBeVisible();
}
/** Runs from whichever control the current state offers. */
async function scan(p = page) {
  const run = pane(p)
    .getByRole("button", { name: /^(Run scan|Rerun scan|Rerun)$/ })
    .locator("visible=true")
    .first();
  await run.click();
  await expect(summary(p)).toContainText("scanned");
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

test("Tools opens the settings; a read-only scan reports Industrial Safety from its statements", async () => {
  await expect(pane().locator(".settings")).toBeVisible();
  await expect(summary()).toHaveText("No scan has been run.");
  const before = await state();
  await scan();
  await expect(pane().locator(".settings")).toHaveCount(0);
  expect((await state()).version).toBe(before.version);
  expect((await state()).dirty).toBe(before.dirty);
  await expect(summary()).toContainText("Whole ontology");
  await expect(summary()).toContainText("revision " + before.version);
  await expect(pane().locator(".foot")).toContainText("No rule is expanded");
  await band("Missing explicit primary label").click();
  await expect(pane().locator(".foot")).toContainText("1 to 3 of 3 listed");
  await row("Industrial Safety").click();
  await expect(detail()).toContainText(base + "Industrial_Safety");
  await expect(detail().locator("pre").first()).toContainText(
    "rdfs:subClassOf",
  );
  await expect(detail()).toContainText("derived from the IRI fragment");
  await expect(detail()).toContainText(
    "Excluded from Text Analysis vocabulary",
  );
  await expect(detail().locator("pre.preview")).toContainText(
    'rdfs:label "Industrial Safety"',
  );
  await page.keyboard.press("Escape");
  await expect(detail()).toHaveCount(0);
  await expect(row("Industrial Safety")).toBeFocused();
  // A supported alias keeps the entity eligible: one completeness finding, no exclusion.
  await row("Synonym Only").click();
  await expect(detail()).toContainText("still eligible for Text Analysis");
  await expect(detail()).not.toContainText(
    "Excluded from Text Analysis vocabulary",
  );
  await band("Excluded from Text Analysis vocabulary").click();
  await expect(
    pane().locator("button.fname").filter({ hasText: "Synonym Only" }),
  ).toHaveCount(1);
  await menu("view.hierarchy");
  await menu("view.quality");
  await expect(summary()).toContainText("scanned");
  await expect(pane().locator(".settings")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/testing/quality-light.png" });
});
test("finding navigation keeps exact identity across equal local names", async () => {
  await scan();
  await band("Missing explicit primary label").click();
  await pane()
    .getByRole("button", { name: "Open Industrial Safety in Details" })
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
  await pane().getByRole("button", { name: "More finding options" }).click();
  await page
    .getByRole("button", { name: "Review missing labels", exact: true })
    .click();
  await expect(pane().locator(".bar .title")).toHaveText(
    "Review missing labels",
  );
  await expect(summary()).toContainText("3 candidates");
  await pane().getByRole("button", { name: "Select all" }).click();
  await expect(pane().locator(".foot")).toHaveText("3 of 3 selected");
  await pane()
    .getByLabel("Label for New Class", { exact: true })
    .fill("A deliberate name");
  await pane()
    .getByRole("button", { name: "Preview selected additions" })
    .click();
  await expect(pane().locator("pre.preview")).toContainText(
    "A deliberate name",
  );
  await expect(pane().locator(".fdet")).toContainText("single source graph");
  const before = await state();
  await pane().getByRole("button", { name: "Add 3 labels" }).click();
  await expect(pane().locator(".bar.alert-warn")).toContainText(
    "The ontology changed after this scan",
  );
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
  await expect(
    band("Missing explicit primary label").locator(".ct"),
  ).toHaveText("0");
});
test("an intervening edit invalidates a label preview before anything is written", async () => {
  await scan();
  await pane().getByRole("button", { name: "More finding options" }).click();
  await page
    .getByRole("button", { name: "Review missing labels", exact: true })
    .click();
  await pane().getByRole("button", { name: "Select all" }).click();
  await pane()
    .getByRole("button", { name: "Preview selected additions" })
    .click();
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Changed label" }),
    base + "Shop_Class",
  );
  await expect(
    pane().getByRole("button", { name: "Add 3 labels" }),
  ).toBeDisabled();
});
test("exceptions need a reason, survive reopening, and can be removed", async () => {
  await scan();
  await band("Missing explicit primary label").click();
  await pane()
    .getByRole("button", { name: "Record exception for Industrial Safety" })
    .click();
  const reason = pane().getByLabel("Exception reason for Industrial Safety");
  await expect(
    pane().getByRole("button", { name: "Record exception", exact: true }),
  ).toBeDisabled();
  await reason.fill("Reviewed intentional omission");
  await pane()
    .getByRole("button", { name: "Record exception", exact: true })
    .click();
  await expect(row("Industrial Safety")).toHaveCount(0);
  await expect(
    pane().locator(".chip").filter({ hasText: "Suppressed" }),
  ).toContainText("1");
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
  await band("Missing explicit primary label").click();
  await expect(row("Industrial Safety")).toHaveCount(0);
  await pane().locator(".chip").filter({ hasText: "Suppressed" }).click();
  await row("Industrial Safety").click();
  await expect(detail()).toContainText("Reviewed intentional omission");
  await expect(detail()).toContainText("keyed to the evidence fingerprint");
  await pane()
    .getByRole("button", { name: "Remove exception for Industrial Safety" })
    .click();
  await expect(
    pane().locator(".chip").filter({ hasText: "Suppressed" }),
  ).toContainText("0");
});
test("exports all findings, configuration and census through native save dialogs", async () => {
  await scan();
  await pane()
    .getByRole("searchbox", { name: "Filter findings" })
    .fill("Industrial");
  for (const format of ["json", "csv"]) {
    const destination = path.join(profile, "quality-report." + format);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, destination);
    await pane().getByRole("button", { name: "Export findings" }).click();
    await page
      .getByRole("button", { name: "Export " + format.toUpperCase() })
      .click();
    await expect
      .poll(() => readFile(destination, "utf8").catch(() => ""))
      .not.toBe("");
    const data = await readFile(destination, "utf8");
    if (format === "json") {
      const r = JSON.parse(data);
      expect(r.status).toBe("complete");
      expect(r.scanned).toBe(5);
      expect(
        r.findings.filter((f: { rule: string }) => f.rule === "label.missing"),
      ).toHaveLength(3);
      expect(r.options.scope).toBe("ontology");
      expect(r.census.SKOS).toEqual([
        "http://www.w3.org/2004/02/skos/core#altLabel",
      ]);
    } else {
      expect(data).toContain("scanConfiguration");
      expect(data).toContain("vocabularyCensus");
      expect(data).toContain("Synonym_Only");
    }
  }
});
test("scope and rule severities persist; a settings change makes the report stale without claiming an edit", async () => {
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("branch");
  await pane()
    .getByRole("combobox", { name: "Branch root" })
    .selectOption(base + "Industrial_Safety");
  await scan();
  await expect(summary()).toContainText("Branch Industrial Safety");
  await expect(summary()).toContainText("1 scanned");
  await pane().getByRole("button", { name: "Change" }).click();
  await pane().getByRole("button", { name: "Rules", exact: true }).click();
  await pane()
    .getByRole("combobox", {
      name: "Severity for Missing dedicated definition",
    })
    .selectOption("Violation");
  await expect(pane().locator(".bar.alert-warn")).toContainText(
    "The scan settings changed. These findings came from",
  );
  await expect(pane().locator(".bar.alert-warn")).not.toContainText(
    "ontology changed",
  );
  await pane().getByRole("button", { name: "Done" }).click();
  await pane().getByRole("button", { name: "Rerun scan" }).click();
  await expect(summary()).toContainText("scanned");
  await band("Missing dedicated definition").click();
  await row("Industrial Safety").click();
  await expect(detail()).toContainText("Selected project constraint.");
  await pane().getByRole("button", { name: "Change" }).click();
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("namespace");
  await pane()
    .getByRole("textbox", { name: "Namespace", exact: true })
    .fill("https://other.test/#");
  await scan();
  await band("Missing description").click();
  await expect(row("Different entity").first()).toBeVisible();
});
test("detached dark results keep navigation, filtering and accessible controls", async () => {
  await scan();
  await band("Missing explicit primary label").click();
  await menu("theme.dark");
  await pane().getByRole("button", { name: "Change" }).focus();
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
    .getByRole("searchbox", { name: "Filter findings" })
    .fill("Industrial");
  await expect(row("Industrial Safety", child)).toHaveCount(1);
  await row("Industrial Safety", child).click();
  await expect(detail(child)).toBeVisible();
  const audit = await new AxeBuilder({ page: child })
    .setLegacyMode(true)
    .include('[data-panel="quality"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await child.screenshot({
    path: "artifacts/testing/quality-dark-detached.png",
  });
  await pane(child).getByRole("button", { name: "Change" }).focus();
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
});
test("pages run over listed findings without truncating totals; workspace replacement makes the report stale", async () => {
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
  await expect(pane().locator(".foot")).toContainText("No rule is expanded");
  await band("Missing explicit primary label").click();
  const foot = pane().locator(".foot");
  await expect(foot).toContainText("1 to 40 of 121 listed");
  await expect(foot).toContainText("Page 1 of 4");
  for (let i = 0; i < 3; i++)
    await pane().getByRole("button", { name: "Next page" }).click();
  await expect(foot).toContainText("Page 4 of 4");
  await expect(foot).toContainText("121 to 121 of 121 listed");
  await expect(pane().locator(".frow")).toHaveCount(1);
  await openFile();
  await expect(pane().locator(".bar.alert-warn")).toContainText(
    "The ontology changed after this scan",
  );
});
test("failure and cancellation cannot be mistaken for a completed clean scan", async () => {
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("branch");
  await expect(pane().locator(".settings")).toContainText(
    "Choose a named class as the branch root.",
  );
  await expect(
    pane().getByRole("button", { name: "Run scan", exact: true }),
  ).toBeDisabled();
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("ontology");
  await pane().getByRole("button", { name: "Rules", exact: true }).click();
  await pane()
    .getByRole("textbox", { name: "Primary label predicates" })
    .fill("not an iri");
  await pane().getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(pane().locator(".bar.alert-bad")).toContainText(
    "Configure absolute predicate IRIs and at least one primary-label predicate. Partial results are not shown.",
  );
  await expect(pane()).toContainText("The scan did not finish");
  await expect(
    pane().getByRole("button", { name: "Export findings" }),
  ).toHaveCount(0);
  await writeFile(
    file,
    prefix +
      Array.from({ length: 3000 }, (_, i) => `:A${i} a owl:Class.`).join(" "),
  );
  await openFile();
  await pane().getByRole("button", { name: "Rules", exact: true }).click();
  await pane()
    .getByRole("textbox", { name: "Primary label predicates" })
    .fill("http://www.w3.org/2000/01/rdf-schema#label");
  await pane().getByRole("button", { name: "Done" }).click();
  await pane()
    .locator(".settings")
    .getByRole("button", { name: "Run scan", exact: true })
    .click();
  // Let the scan reach past one page of findings before canceling it.
  await expect
    .poll(async () =>
      Number(
        (await summary().textContent())
          ?.match(/^([\d,]+) of/)?.[1]
          .replace(/,/g, "") ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(128);
  await pane().getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(pane().locator(".bar.alert-warn")).toContainText(
    "Stopped after",
  );
  await expect(pane()).toContainText(
    "This report is incomplete and cannot be exported as complete.",
  );
  await expect(
    pane().getByRole("button", { name: "Export findings" }),
  ).toHaveCount(0);
  // Every partial finding stays reachable: a listed band pages like a complete one.
  await band("Missing explicit primary label").click();
  await expect(pane().locator(".foot")).toContainText("1 to 40 of");
  await pane().getByRole("button", { name: "Next page" }).click();
  await expect(pane().locator(".foot")).toContainText("41 to");
});
test("a settings change blocks label additions, marks exports stale, and an unresolved scope blocks every rerun", async () => {
  await scan();
  await pane().getByRole("button", { name: "Change" }).click();
  await pane()
    .locator(".settings .chip")
    .filter({ hasText: "Data properties" })
    .click();
  await expect(pane().locator(".bar.alert-warn")).toContainText(
    "The scan settings changed",
  );
  await pane().getByRole("button", { name: "More finding options" }).click();
  await expect(
    page.getByRole("button", { name: "Review missing labels", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  const destination = path.join(profile, "stale-report.json");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, destination);
  await pane().getByRole("button", { name: "Export findings" }).click();
  await page.getByRole("button", { name: "Export JSON" }).click();
  await expect
    .poll(() => readFile(destination, "utf8").catch(() => ""))
    .not.toBe("");
  expect(JSON.parse(await readFile(destination, "utf8")).status).toContain(
    "scan settings changed",
  );
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("namespace");
  await expect(pane().locator(".settings")).toContainText(
    "Enter a namespace to scan.",
  );
  for (const name of ["Run scan", "Rerun scan"])
    await expect(
      pane().getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await expect(pane().locator(".rule").first()).toBeVisible();
});
test("a canceled report pages its findings from any view and goes stale like a complete one", async () => {
  await writeFile(
    file,
    prefix +
      Array.from({ length: 3000 }, (_, i) => `:A${i} a owl:Class.`).join(" "),
  );
  await openFile();
  await scan();
  // A filter that matches nothing, carried into the canceled report.
  await pane()
    .getByRole("searchbox", { name: "Filter findings" })
    .fill("no such entity");
  await pane().getByRole("button", { name: "Coverage", exact: true }).click();
  await pane().getByRole("button", { name: "Rerun" }).click();
  await expect
    .poll(async () =>
      Number(
        (await summary().textContent())
          ?.match(/^([\d,]+) of/)?.[1]
          .replace(/,/g, "") ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(128);
  await pane().getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(pane().locator(".bar.alert-warn")).toContainText(
    "Stopped after",
  );
  await expect(pane()).toContainText("No findings match the current filter.");
  await expect(
    pane().getByRole("button", { name: "Export findings" }),
  ).toHaveCount(0);
  await pane().getByRole("searchbox", { name: "Filter findings" }).fill("");
  await band("Missing explicit primary label").click();
  await expect(pane().locator(".foot")).toContainText("1 to 40 of");
  await pane().getByRole("button", { name: "Next page" }).click();
  await expect(pane().locator(".foot")).toContainText("41 to");
  await menu("tools.quality");
  await pane()
    .locator(".settings .chip")
    .filter({ hasText: "Data properties" })
    .click();
  await expect(pane().locator(".bar.alert-warn")).toContainText(
    "The scan settings changed",
  );
  await expect(pane()).toContainText(
    "This report is incomplete and cannot be exported as complete.",
  );
});
test("the scope guard holds before the census answers", async () => {
  await scan();
  await app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", async (event, method, args) => {
      if (method === "qualityCensus")
        await new Promise((r) => setTimeout(r, 3000));
      return original(event, method, args);
    });
  });
  await pane().getByRole("button", { name: "Change" }).click();
  await pane()
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("namespace");
  // No waiting: the census is still three seconds away.
  expect(
    await pane()
      .getByRole("button", { name: "Rerun scan", exact: true })
      .isDisabled(),
  ).toBe(true);
  expect(
    await pane()
      .getByRole("button", { name: "Run scan", exact: true })
      .isDisabled(),
  ).toBe(true);
  await expect(pane().locator(".settings")).toContainText(
    "Enter a namespace to scan.",
  );
});
test("Would add names the named graph a reviewed label will be written to", async () => {
  const trig = path.join(profile, "graphs.trig");
  await writeFile(
    trig,
    prefix + ":Courses { :Industrial_Safety a owl:Class. }",
  );
  await app.evaluate(({ dialog }, trig) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [trig],
    });
  }, trig);
  await openFile();
  await scan();
  await band("Missing explicit primary label").click();
  await row("Industrial Safety").click();
  // The addition sits inside the entity's only graph, as the reviewed preview writes it.
  await expect(detail().locator("pre.preview")).toContainText(
    /Courses>? \{\n\s+\S*Industrial_Safety>? rdfs:label "Industrial Safety" \.\n\}/,
  );
});
test("no enabled checks is reported as nothing tested, never as clean", async () => {
  for (const name of [
    "Completeness",
    "Naming",
    "Structure",
    "Publication metadata",
    "Text Analysis",
  ]) {
    const chip = pane().locator(".settings .chip").filter({ hasText: name });
    if (await chip.count()) await chip.click();
  }
  await expect(pane().locator(".settings")).toContainText("0 checks.");
  await scan();
  await expect(summary()).toContainText("0 checks");
  await expect(pane()).toContainText("No checks are enabled");
  await expect(pane()).toContainText("This is not a clean result.");
  await expect(pane()).not.toContainText("No findings");
});
test("the census withdraws checks for vocabularies the ontology does not use", async () => {
  await writeFile(
    file,
    prefix + ":A a owl:Class; rdfs:label 'A'. :B a owl:Class.",
  );
  await openFile();
  const settings = pane().locator(".settings");
  await expect(settings).toContainText(
    "Not used here: SKOS, owl:deprecated, Dublin Core, IAO. 6 checks are withdrawn.",
  );
  await expect(settings.locator(".chip")).not.toContainText([
    "Retired entities",
  ]);
  await expect(settings).not.toContainText("SKOS concepts");
  await scan();
  await pane().getByRole("button", { name: "Coverage", exact: true }).click();
  const coverage = pane().locator(".cov");
  await expect(coverage).toContainText("Explicit label");
  await expect(coverage).not.toContainText("Single preferred label");
  await expect(coverage).not.toContainText("No retired references");
  await expect(coverage).toContainText(
    "Checks for a vocabulary this ontology does not use are withdrawn",
  );
  await expect(coverage).toContainText("Entity denominators exclude");
});
test("filters that match nothing say so, and findings group by entity", async () => {
  await scan();
  await pane()
    .getByRole("searchbox", { name: "Filter findings" })
    .fill("no such entity");
  await expect(pane()).toContainText("No findings match the current filter.");
  await expect(pane()).toContainText("The scan itself completed and found");
  await pane().getByRole("searchbox", { name: "Filter findings" }).fill("");
  await pane()
    .getByRole("combobox", { name: "Group findings by" })
    .selectOption("entity");
  await band("Industrial Safety").first().click();
  await expect(
    pane()
      .locator("button.fname")
      .filter({ hasText: "Missing explicit primary label" }),
  ).toHaveCount(1);
});
