import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { NS } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import AxeBuilder from "@axe-core/playwright";
const base = "https://example.org/courses#";
const ttl = `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
:Knowledge a owl:Class; rdfs:label "Knowledge".
:Course a owl:Class; rdfs:label "Course".
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
:Deep8 a owl:Class; rdfs:label "Deep 8"; rdfs:subClassOf :Deep7.
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
    return ":A" + n + " a owl:Class. :Z" + n + " a owl:Class.";
  }).join("\n");
  await writeFile(
    file,
    ttl +
      padding +
      "\n:FirstChild a owl:Class; rdfs:subClassOf :A000. :LastChild a owl:Class; rdfs:subClassOf :Z999.",
  );
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

  // Ordinary clicks in the tree retain the user's scroll position.
  await tree().evaluate((el) => {
    el.scrollTop = 0;
  });
  await treeRow("A003").click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "A003");
  await expect(ancestry()).toContainText("Root class");
  expect(await tree().evaluate((el) => el.scrollTop)).toBe(0);
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
});
