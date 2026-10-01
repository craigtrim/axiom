import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { NS, SUBCLASS, THING } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import AxeBuilder from "@axe-core/playwright";
const base = "https://example.org/courses#";
const ttl = `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
:Knowledge a owl:Class; rdfs:label "Knowledge".
:Course a owl:Class; rdfs:label "Course".
:Workplace a owl:Class; rdfs:label "Multiculturalism at Work"; rdfs:subClassOf owl:Thing.
:Society a owl:Class; rdfs:label "Society"; rdfs:subClassOf :Course.
:CivicEngagement a owl:Class; rdfs:label "Civic Engagement"; rdfs:subClassOf :Society.
:Activism a owl:Class; rdfs:label "Activism"; rdfs:subClassOf :CivicEngagement.
:Technology a owl:Class; rdfs:label "Technology"; rdfs:subClassOf :Course.
:CivicTechnology a owl:Class; rdfs:label "Civic Technology"; rdfs:subClassOf :Technology.
:DigitalActivism a owl:Class; rdfs:label "Digital Activism"; rdfs:comment "Using digital tools to mobilize people and advocate for change."; rdfs:subClassOf :Activism, :CivicTechnology.
:Campaign a owl:NamedIndividual, :DigitalActivism, :Course; rdfs:label "Community Campaign".
:Combined a owl:Class; rdfs:label "Combined"; owl:equivalentClass [a owl:Class; owl:intersectionOf (:Activism :CivicTechnology)].
:Language a owl:Class; rdfs:label "Language"; rdfs:subClassOf :Course.
:English a owl:Class; rdfs:label "English"; rdfs:subClassOf :Language, :EnglishLanguage.
:EnglishLanguage a owl:Class; rdfs:label "English Language"; owl:equivalentClass [a owl:Class; owl:intersectionOf (:English :Language)].
:BasicEnglish a owl:Class; rdfs:label "Basic English"; rdfs:subClassOf :EnglishLanguage.
:Deep0 a owl:Class; rdfs:label "Deep 0".
:Deep1 a owl:Class; rdfs:label "Deep 1"; rdfs:subClassOf :Deep0.
:Deep2 a owl:Class; rdfs:label "Deep 2"; rdfs:subClassOf :Deep1.
:Deep3 a owl:Class; rdfs:label "Deep 3"; rdfs:subClassOf :Deep2.
:Deep4 a owl:Class; rdfs:label "Deep 4"; rdfs:subClassOf :Deep3.
:Deep5 a owl:Class; rdfs:label "Deep 5"; rdfs:subClassOf :Deep4.
:Deep6 a owl:Class; rdfs:label "Deep 6"; rdfs:subClassOf :Deep5.
:Deep7 a owl:Class; rdfs:label "Deep 7"; rdfs:subClassOf :Deep6.
:Deep8 a owl:Class; rdfs:label "Deep 8"; rdfs:subClassOf :Deep7;
  rdfs:seeAlso ${Array.from({ length: 20 }, (_, i) => `"Deep alias ${i}"`).join(", ")}.
:CycleA a owl:Class; rdfs:label "Cycle A"; rdfs:subClassOf :CycleB.
:CycleB a owl:Class; rdfs:label "Cycle B"; rdfs:subClassOf :CycleA.
`;
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const details = (p = page) =>
  p.getByRole("region", { name: "Details", exact: true });
const ancestry = (p = page) =>
  details(p).getByRole("navigation", { name: "Ancestry" });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
async function select(name: string) {
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + name,
  );
  await expect(details()).toHaveAttribute("data-entity-iri", base + name);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/details-ancestry-"));
  const file = path.join(profile, "courses.ttl");
  const padding = Array.from({ length: 1000 }, (_, i) => {
    const n = String(i).padStart(3, "0");
    return (
      ":A" +
      n +
      " a owl:Class. :Z" +
      n +
      " a owl:Class. :P" +
      n +
      " a owl:ObjectProperty."
    );
  }).join("\n");
  await writeFile(
    file,
    ttl +
      padding +
      "\n:FirstChild a owl:Class; rdfs:subClassOf :A000. :LastChild a owl:Class; rdfs:subClassOf :Z999.",
  );
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: [
      ...(process.env.AXIOM_TEST_EXE ? [] : ["."]),
      // Packaged launches skip Playwright's Electron loader and its switches.
      // Keep layout frames running when this isolated test window is covered.
      ...(process.env.AXIOM_TEST_BACKGROUND === "1"
        ? [
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
          ]
        : []),
    ],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (process.env.AXIOM_TEST_BACKGROUND === "1") win.setFocusable(false);
    win.setBounds({ width: 1400, height: 900 });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "DigitalActivism"),
    )
    .toBe(true);
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "DigitalActivism",
  );
  await menu("view.details");
  await expect(ancestry()).toBeVisible();
  await ancestry().getByRole("button").first().focus();
  await menu("pane.maximise");
  await expect(ancestry()).toHaveAttribute("data-orientation", "horizontal");
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page && !page.isClosed())
    await info.attach("details-ancestry", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
test("shows Basic English once in a right-to-left trail with English and Language grouped", async () => {
  await select("BasicEnglish");
  await expect(ancestry().locator("ol")).toHaveCount(1);
  await expect(ancestry().locator('[aria-current="page"]')).toHaveCount(1);
  await expect(ancestry().locator(".ancestry-stage")).toHaveCount(4);
  const stages = ancestry().locator(".ancestry-stage");
  expect(await stages.locator("strong").allTextContents()).toEqual([
    "Basic English",
    "English Language",
    "English",
    "Language",
    "Course",
  ]);
  await expect(stages.nth(2).locator(".ancestry-group")).toHaveCount(1);
  await expect(stages.nth(2).getByRole("button")).toHaveCount(2);
  const positions = await Promise.all(
    (await stages.all()).map((stage) => stage.boundingBox()),
  );
  for (let i = 1; i < positions.length; i++) {
    expect(positions[i - 1]!.x).toBeGreaterThan(positions[i]!.x);
    const previous = positions[i - 1]!,
      current = positions[i]!;
    expect(
      Math.abs(
        previous.y + previous.height / 2 - current.y - current.height / 2,
      ),
    ).toBeLessThan(2);
  }
  await expect(ancestry()).not.toContainText("Cycle in ancestry");
  await expect(ancestry()).not.toContainText("paths");
  await expect(
    details().getByRole("button", { name: "Add parent", exact: true }),
  ).toHaveCount(0);
  await expect(
    details().getByRole("button", { name: "Add statement", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/testing/ancestry-trail-basic-english.png",
  });
  await ancestry()
    .getByRole("button", { name: "View English Language details", exact: true })
    .click();
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "EnglishLanguage",
  );
  await details().getByRole("button", { name: "Back", exact: true }).click();
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "BasicEnglish",
  );
  const accessibility = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".ancestry")
    .analyze();
  expect(
    accessibility.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("turns vertical in a tall detached pane and remains usable after resizing", async () => {
  await select("BasicEnglish");
  await ancestry().getByRole("button").first().focus();
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((p) => p !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  await (
    await app.browserWindow(child)
  ).evaluate((w) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1") w.setFocusable(false);
    w.setMinimumSize(160, 100);
    w.setContentSize(460, 900);
  });
  await expect(ancestry(child)).toHaveAttribute("data-orientation", "vertical");
  expect(
    await ancestry(child).evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const stages = ancestry(child).locator(".ancestry-stage");
  const top = (await stages.first().boundingBox())!;
  const bottom = (await stages.last().boundingBox())!;
  expect(Math.abs(top.x - bottom.x)).toBeLessThan(2);
  expect(bottom.y).toBeGreaterThan(top.y);
  await expect(stages.first()).toContainText("Basic English");
  await expect(stages.last()).toContainText("Course");
  await child.screenshot({ path: "artifacts/testing/ancestry-trail-tall.png" });
  await (
    await app.browserWindow(child)
  ).evaluate((w) => w.setContentSize(1100, 650));
  await expect(ancestry(child)).toHaveAttribute(
    "data-orientation",
    "horizontal",
  );
  await ancestry(child)
    .getByRole("button", { name: "View English details", exact: true })
    .click();
  await expect(details(child)).toHaveAttribute(
    "data-entity-iri",
    base + "English",
  );
  await details(child)
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(details(child)).toHaveAttribute(
    "data-entity-iri",
    base + "BasicEnglish",
  );
});

test("retains exact instance and definition relationships without changing RDF or duplicating cycles", async () => {
  const version = (await state()).version;
  await select("Campaign");
  await expect(ancestry().locator("ol")).toHaveCount(1);
  const current = ancestry().locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute(
    "title",
    /is an instance of Digital Activism/,
  );
  await expect(current).toHaveAttribute("title", /is an instance of Course/);
  await expect(
    ancestry().getByRole("button", {
      name: "View Course details",
      exact: true,
    }),
  ).toHaveCount(1);
  await select("Combined");
  await expect(ancestry().locator("ol")).toHaveCount(1);
  await expect(current).toHaveAttribute("title", /intersection definition/);
  await expect(ancestry()).not.toContainText("_:");
  expect((await state()).version).toBe(version);
  await select("CycleA");
  await expect(ancestry().locator(".ancestry-stage")).toHaveCount(2);
  await expect(ancestry().locator('[data-root="true"]')).toHaveCount(0);
  await select("Knowledge");
  await expect(ancestry()).toContainText("Root class");
  await expect(ancestry().getByRole("button")).toHaveCount(0);
});

test("folds a deep trail, reveals every stage and keeps the selected entity on the right", async () => {
  await select("Deep8");
  await expect(ancestry().locator(".ancestry-trail > li")).toHaveCount(5);
  await ancestry()
    .getByRole("button", { name: "5 more ancestry stages", exact: true })
    .click();
  await expect(ancestry().locator(".ancestry-stage")).toHaveCount(9);
  await expect(ancestry().locator('[aria-current="page"]')).toBeInViewport();
  const stages = ancestry().locator(".ancestry-stage");
  expect((await stages.first().boundingBox())!.x).toBeGreaterThan(
    (await stages.last().boundingBox())!.x,
  );
  await ancestry()
    .getByRole("button", { name: "View Deep 0 details", exact: true })
    .click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Deep0");
});

test("adding a parent in Details replaces the Thing fallback and Undo restores it", async () => {
  await select("Workplace");
  const root = (name: string) =>
    ancestry().getByRole("button", {
      name: `View ${name} details`,
      exact: true,
    });
  await expect(root("Thing")).toBeVisible();
  await details().getByRole("button", { name: "Add row", exact: true }).click();
  const last = details().locator("tbody tr").last();
  await last
    .getByRole("combobox", { name: /Predicate/ })
    .selectOption(SUBCLASS);
  await last.getByRole("combobox", { name: /Value/ }).fill("Course");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Course/ })
    .click();
  await expect(root("Course")).toBeVisible();
  await expect(root("Thing")).toHaveCount(0);
  const parents = details().locator(`tbody tr[data-predicate="${SUBCLASS}"]`);
  await expect(parents).toHaveCount(1);
  await expect(parents.getByRole("combobox", { name: /Value/ })).toHaveValue(
    "Course",
  );
  await expect(details().locator('[role="status"]')).toContainText("Saved");
  await page.screenshot({
    path: "artifacts/testing/details-thing-parent-replaced.png",
  });
  await menu("edit.undo");
  await expect(root("Thing")).toBeVisible();
  await expect(root("Course")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "Workplace")
          ?.parents,
    )
    .toEqual([THING]);
  await menu("edit.redo");
  await expect(root("Course")).toBeVisible();
  await expect(root("Thing")).toHaveCount(0);
  await expect(parents).toHaveCount(1);
});

test("adds a row in place and refreshes the consolidated ancestry after editing a parent", async () => {
  const add = details().getByRole("button", { name: "Add row", exact: true });
  await add.click();
  const last = details().locator("tbody tr").last();
  const predicate = last.getByRole("combobox", { name: /Predicate/ });
  await expect(predicate).toBeFocused();
  await add.click();
  await expect(details().locator('tbody tr[data-predicate=""]')).toHaveCount(1);
  await predicate.selectOption(NS.rdfs + "subClassOf");
  const value = last.getByRole("combobox", { name: /Value/ });
  await value.fill("Course");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Course/ })
    .click();
  const current = ancestry().locator('[aria-current="page"]');
  await expect(current).toHaveAttribute("title", /is a subclass of Course/);
  await expect(
    ancestry().getByRole("button", {
      name: "View Course details",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(details().locator('[role="status"]')).toContainText("Saved");
  await last.getByRole("button", { name: /Remove statement/ }).click();
  await expect(current).not.toHaveAttribute("title", /is a subclass of Course/);
  await add.click();
  await last
    .getByRole("combobox", { name: /Predicate/ })
    .selectOption(NS.skos + "altLabel");
  await last.getByRole("textbox", { name: /Value/ }).fill("Online Activism");
  await last.getByRole("textbox", { name: /Value/ }).press("Enter");
  await expect
    .poll(async () => {
      const doc = await page.evaluate(
        (iri) => window.axiom.request<any>("entityDocument", { iri }),
        base + "DigitalActivism",
      );
      return doc.statements.some(
        (t: any) =>
          t.predicate === NS.skos + "altLabel" &&
          t.object.value === "Online Activism",
      );
    })
    .toBe(true);
});

const hierarchy = () =>
  page.getByRole("region", { name: "Hierarchy panel", exact: true });
const tree = () =>
  hierarchy().getByRole("tree", { name: "Class hierarchy", exact: true });
const treeRow = (name: string) =>
  tree().locator('[data-entity-iri="' + base + name + '"]');
async function showTaxonomy() {
  await ancestry().getByRole("button").first().focus();
  await menu("pane.maximise");
  await expect(tree()).toBeVisible();
}
async function alignmentError(name: string, p = page, centered = false) {
  const row = (await treeRow(name).boundingBox())!;
  const anchor = centered
    ? (await tree().boundingBox())!
    : (await ancestry(p).locator('[aria-current="page"]').boundingBox())!;
  return Math.abs(row.y + row.height / 2 - anchor.y - anchor.height / 2);
}
async function expectStableScroll(
  view: ReturnType<typeof tree>,
  before: number,
) {
  const movement = await view.evaluate(async (el, before) => {
    let movement = Math.abs(el.scrollTop - before);
    // Include the deferred layout and ancestry reveal frames.
    for (let i = 0; i < 12; i++) {
      await new Promise<void>((resolve) =>
        el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()),
      );
      movement = Math.max(movement, Math.abs(el.scrollTop - before));
    }
    return movement;
  }, before);
  expect(movement).toBeLessThan(0.5);
}

test("Details scrolling and content changes leave a completed hierarchy reveal in place", async () => {
  await showTaxonomy();
  await tree().evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(treeRow("Deep8")).toHaveCount(0);
  await select("Deep8");
  // Expanding this large fixture can exceed the default wait while tracing.
  await expect(treeRow("Deep8")).toBeInViewport({ timeout: 15000 });
  await expect.poll(() => alignmentError("Deep8")).toBeLessThan(2);
  const before = await tree().evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(100);
  const content = details().locator(".entity-editor-content");
  await content.evaluate((el) => {
    el.scrollTop = 250;
  });
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  await expectStableScroll(tree(), before);
  await content.evaluate((el) => {
    el.scrollTop = 0;
  });
  await ancestry()
    .getByRole("button", { name: /more ancestry stages/ })
    .click();
  await expectStableScroll(tree(), before);
  await hierarchy().getByRole("textbox", { name: "Filter hierarchy" }).focus();
  await tree().evaluate((el) => {
    el.scrollTop = 0;
  });
  await details().getByRole("button", { name: "Back", exact: true }).focus();
  await expectStableScroll(tree(), 0);
  await select("Deep8");
  await expect.poll(() => alignmentError("Deep8")).toBeLessThan(2);
});

test("hierarchy clicks keep rows under the mouse while external selection of the same node still centers", async () => {
  await showTaxonomy();
  await select("A490");
  await expect.poll(() => alignmentError("A490")).toBeLessThan(2);
  for (const name of ["A495", "A496", "A497"]) {
    await expect(treeRow(name)).toBeInViewport();
    const before = await tree().evaluate((el) => el.scrollTop);
    const position = (await treeRow(name).boundingBox())!;
    await treeRow(name).click();
    await expect(details()).toHaveAttribute("data-entity-iri", base + name);
    await expect(ancestry().locator('[aria-current="page"]')).toContainText(
      name,
    );
    await expectStableScroll(tree(), before);
    expect((await treeRow(name).boundingBox())!.y).toBe(position.y);
  }
  // The pointer remains over Hierarchy; selection origin controls centering.
  await select("A497");
  await expect.poll(() => alignmentError("A497")).toBeLessThan(2);
  await details().getByRole("button", { name: "Back", exact: true }).click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "A496");
  await expect.poll(() => alignmentError("A496")).toBeLessThan(2);
});

test("hierarchy property clicks retain the filter and scroll position", async () => {
  await showTaxonomy();
  await select("P500");
  const properties = hierarchy().getByRole("tree", {
    name: "Property hierarchy",
    exact: true,
  });
  const filter = hierarchy().getByRole("textbox", { name: "Filter hierarchy" });
  await filter.fill("P50");
  const row = properties.locator('[data-entity-iri="' + base + 'P505"]');
  await expect(row).toBeInViewport();
  const before = await properties.evaluate((el) => el.scrollTop);
  await row.click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "P505");
  await expectStableScroll(properties, before);
  await expect(filter).toHaveValue("P50");
});

test("selection and Back align the hierarchy with Details and reveal collapsed, filtered classes", async () => {
  await showTaxonomy();
  await select("A500");
  await expect.poll(() => alignmentError("A500")).toBeLessThan(2);
  await hierarchy()
    .getByRole("textbox", { name: "Filter hierarchy" })
    .fill("no matches");
  await select("BasicEnglish");
  await expect(treeRow("BasicEnglish")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    hierarchy().getByRole("textbox", { name: "Filter hierarchy" }),
  ).toHaveValue("");
  await expect.poll(() => alignmentError("BasicEnglish")).toBeLessThan(2);
  await details().getByRole("button", { name: "Back", exact: true }).click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "A500");
  await expect.poll(() => alignmentError("A500")).toBeLessThan(2);
  await expect
    .poll(() =>
      details().evaluate((el) =>
        el
          .closest(".details-navigation")!
          .contains(el.ownerDocument.activeElement),
      ),
    )
    .toBe(true);
  await hierarchy().getByRole("textbox", { name: "Filter hierarchy" }).focus();
  await tree().evaluate((el) => {
    el.scrollTop = 0;
  });
  await details().getByRole("button", { name: "Back", exact: true }).focus();
  await expectStableScroll(tree(), 0);
});

test("Details resizing and docking leave the tree still until a new selection needs revealing", async () => {
  await (
    await app.browserWindow(page)
  ).evaluate((w) => w.setContentSize(1800, 900));
  await showTaxonomy();
  await menu("view.query");
  await menu("pane.close");
  await menu("view.individuals");
  await menu("pane.close");
  await select("A500");
  await expect.poll(() => alignmentError("A500")).toBeLessThan(2);
  await details().getByRole("button", { name: "Back", exact: true }).focus();
  const before = await tree().evaluate((el) => el.scrollTop);
  await menu("pane.move.bottom");
  const splitter = page
    .locator('[role="separator"][aria-orientation="horizontal"]')
    .last();
  await expect(splitter).toBeVisible();
  const horizontal = (await splitter.boundingBox())!;
  await page.mouse.move(
    horizontal.x + horizontal.width / 2,
    horizontal.y + horizontal.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    horizontal.x + horizontal.width / 2,
    horizontal.y - 180,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(
    page.locator(".adaptive-pane:has(.details-navigation)"),
  ).toHaveAttribute("data-pane-recovery", "false");
  await expect(details()).toBeVisible();
  await expectStableScroll(tree(), before);
  await page.screenshot({
    path: "artifacts/testing/details-stable-hierarchy.png",
  });
  await menu("pane.maximise");
  await expect(tree()).not.toBeVisible();
  await select("A600");
  await expect(tree()).not.toBeVisible();
  await menu("pane.maximise");
  await expect(details()).toBeVisible();
  await expect.poll(() => alignmentError("A600", page, true)).toBeLessThan(2);
  await details().getByRole("button", { name: "Back", exact: true }).focus();
  const after = await tree().evaluate((el) => el.scrollTop);
  await menu("pane.move.right");
  await expect(tree()).toBeVisible();
  await expectStableScroll(tree(), after);
  await select("A600");
  await expect.poll(() => alignmentError("A600")).toBeLessThan(2);
});

test("reopening Hierarchy centers Details without reopening it on selection", async () => {
  await showTaxonomy();
  await select("A600");
  await expect.poll(() => alignmentError("A600")).toBeLessThan(2);
  await hierarchy().getByRole("textbox", { name: "Filter hierarchy" }).focus();
  await menu("pane.close");
  await expect(hierarchy()).toHaveCount(0);
  await select("A700");
  await expect(hierarchy()).toHaveCount(0);
  await menu("view.hierarchy");
  await expect(treeRow("A700")).toBeInViewport();
  await expect.poll(() => alignmentError("A700")).toBeLessThan(2);
});

test("property selection switches hierarchy type and centers without an ancestry card", async () => {
  await showTaxonomy();
  await select("P500");
  const properties = hierarchy().getByRole("tree", {
    name: "Property hierarchy",
    exact: true,
  });
  const selected = properties.locator('[data-entity-iri="' + base + 'P500"]');
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await expect(ancestry()).toHaveCount(0);
  await expect
    .poll(async () => {
      const row = (await selected.boundingBox())!;
      const pane = (await details().boundingBox())!;
      return Math.abs(row.y + row.height / 2 - pane.y - pane.height / 2);
    })
    .toBeLessThan(2);
  await select("A500");
  await expect.poll(() => alignmentError("A500")).toBeLessThan(2);
});

test("ancestry navigation aligns the taxonomy row with the selected card and respects pane zoom", async () => {
  await showTaxonomy();
  await select("BasicEnglish");
  await hierarchy()
    .getByRole("textbox", { name: "Filter hierarchy" })
    .fill("no matches");
  await ancestry()
    .getByRole("button", { name: "View English Language details", exact: true })
    .click();
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "EnglishLanguage",
  );
  await expect(
    hierarchy().getByRole("textbox", { name: "Filter hierarchy" }),
  ).toHaveValue("");
  await expect(treeRow("EnglishLanguage")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(() => alignmentError("EnglishLanguage")).toBeLessThan(2);
  await expect
    .poll(() =>
      details().evaluate((el) => el.contains(el.ownerDocument.activeElement)),
    )
    .toBe(true);
  await page.screenshot({
    path: "artifacts/testing/ancestry-taxonomy-alignment.png",
  });

  await tree().evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -240,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect
    .poll(() =>
      tree().evaluate((el) =>
        Number(el.closest(".adaptive-pane")?.getAttribute("data-pane-zoom")),
      ),
    )
    .toBeGreaterThan(1.4);
  await select("BasicEnglish");
  await ancestry()
    .getByRole("button", { name: "View English Language details", exact: true })
    .click();
  await expect.poll(() => alignmentError("EnglishLanguage")).toBeLessThan(2);
  await ancestry()
    .getByRole("button", { name: "View Course details", exact: true })
    .click();
  const card = (await ancestry()
    .locator('[aria-current="page"]')
    .boundingBox())!;
  const viewport = (await tree().boundingBox())!;
  const selected = (await treeRow("Course").boundingBox())!;
  // At this zoom the card is above the tree's first fully visible row.
  expect(card.y + card.height / 2).toBeLessThan(
    viewport.y + selected.height / 2,
  );
  await expect.poll(() => alignmentError("Course", page, true)).toBeLessThan(2);
  await page.screenshot({
    path: "artifacts/testing/ancestry-taxonomy-zoom.png",
  });

  // Tree clicks update Details without recentering, including at this zoom.
  await tree().evaluate((el) => {
    el.scrollTop = 0;
  });
  await treeRow("A003").click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "A003");
  await expect(ancestry()).toContainText("Root class");
  await expect(treeRow("A003")).toBeInViewport();
  await treeRow("A500").scrollIntoViewIfNeeded();
  const before = await tree().evaluate((el) => el.scrollTop);
  await treeRow("A500").click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "A500");
  await expect(ancestry().locator('[aria-current="page"]')).toContainText(
    "A500",
  );
  await expectStableScroll(tree(), before);
});

test("taxonomy reveal clamps at the first and last rows without adding blank space", async () => {
  await showTaxonomy();
  await select("FirstChild");
  await tree().evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await ancestry()
    .getByRole("button", { name: "View A000 details", exact: true })
    .click();
  await expect(treeRow("A000")).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => tree().evaluate((el) => el.scrollTop)).toBe(0);
  await expect(treeRow("A000")).toBeInViewport();
  await select("LastChild");
  await tree().evaluate((el) => {
    el.scrollTop = 0;
  });
  await ancestry()
    .getByRole("button", { name: "View Z999 details", exact: true })
    .click();
  await expect(treeRow("Z999")).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() =>
      tree().evaluate((el) =>
        Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop),
      ),
    )
    .toBeLessThan(2);
  await expect(treeRow("Z999")).toBeInViewport();
});

test("a detached ancestry view centers the taxonomy selection without taking its focus", async () => {
  await showTaxonomy();
  await select("BasicEnglish");
  await ancestry().getByRole("button").first().focus();
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((p) => p !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  await (
    await app.browserWindow(child)
  ).evaluate((w) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1") w.setFocusable(false);
    w.setContentSize(1100, 650);
  });
  await ancestry(child)
    .getByRole("button", { name: "View English Language details", exact: true })
    .click();
  await expect(details(child)).toHaveAttribute(
    "data-entity-iri",
    base + "EnglishLanguage",
  );
  await expect(treeRow("EnglishLanguage")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect
    .poll(() => alignmentError("EnglishLanguage", child, true))
    .toBeLessThan(2);
  await expect
    .poll(() =>
      details(child).evaluate((el) =>
        el.contains(el.ownerDocument.activeElement),
      ),
    )
    .toBe(true);
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "A500",
  );
  await expect(details(child)).toHaveAttribute(
    "data-entity-iri",
    base + "A500",
  );
  await expect.poll(() => alignmentError("A500", child, true)).toBeLessThan(2);
  const before = await tree().evaluate((el) => el.scrollTop);
  await treeRow("A502").click();
  await expect(details(child)).toHaveAttribute(
    "data-entity-iri",
    base + "A502",
  );
  await expect(ancestry(child).locator('[aria-current="page"]')).toContainText(
    "A502",
  );
  await expectStableScroll(tree(), before);
  await details(child)
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect.poll(() => alignmentError("A500", child, true)).toBeLessThan(2);
});
