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
const base = "https://example.test/find-design#";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const pane = () => page.getByRole("region", { name: "Find entities results" });
const query = () =>
  pane().getByRole("searchbox", { name: "Search the ontology" });
const create = () =>
  pane().getByRole("region", { name: "Not in the ontology? Add it." });
const snapshot = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function openFixture(name = "find-design.ttl", turtle?: string) {
  const file = path.join(profile, name);
  await writeFile(
    file,
    turtle ??
      `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> .
    : a owl:Ontology . :Root a owl:Class; rdfs:label "Foundation" .
    :Target a owl:Class; rdfs:label "Ocean Studies"; rdfs:subClassOf :Root; rdfs:comment "Saffron manuscripts"; skos:altLabel "Marine Science" .
    :prop a owl:ObjectProperty; rdfs:label "Public Property" .
    :student a owl:NamedIndividual, :Target; rdfs:label "Ada Scholar" .
    ${Array.from({ length: 34 }, (_, i) => `:Topic${i} a owl:Class; rdfs:label "Topic ${String(i).padStart(2, "0")}"; rdfs:subClassOf :Root .`).join("\n")}`,
  );
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
  await menu("file.open");
  await expect.poll(async () => (await snapshot()).ontology.name).toBe(name);
}
async function miss(text = "Zygomorphic Architecture") {
  await query().fill(text);
  await expect(create()).toBeVisible();
  await expect(
    create().getByRole("button", { name: "Create class", exact: true }),
  ).toBeEnabled();
  await expect(create().locator(".validation-error:visible")).toHaveCount(0);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/find-design-"));
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    });
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await openFixture();
  await menu("view.find");
  await expect(pane()).toBeVisible();
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
  }
});

test("blank query browses with permanent columns, denominator and explicit inspector fields", async () => {
  await expect(query()).toHaveValue("");
  await expect(pane().locator(".find-results tbody tr")).toHaveCount(10);
  await expect(pane().getByRole("columnheader")).toHaveText([
    "Entity",
    "Type",
    "Synonym",
  ]);
  await expect(pane().locator(".find-summary")).toHaveText(
    /\d+ matches of \d+ entities/,
  );
  await expect(pane()).toContainText("Select a result to inspect it.");
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  await pane().getByRole("button", { name: "Clear", exact: true }).click();
  await expect(pane().locator(".find-results tbody tr")).toHaveCount(10);
  await query().fill("Foundation");
  await expect(
    pane().getByRole("table", { name: "Found entities" }),
  ).toHaveCount(0);
  await expect(pane()).toContainText("Page 0 of 0");
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  const row = pane().locator(".find-results tbody tr").first();
  await row.focus();
  await row.press("Space");
  await expect(row).toHaveAttribute("data-selected", "true");
  const inspector = pane().getByRole("region", { name: "Selected entity" });
  await expect(inspector).toContainText("no parent recorded");
  await expect(inspector).toContainText("none recorded");
});

test("unchecked field counts predict remedies and draft survives widening and narrowing", async () => {
  await miss("Saffron manuscripts");
  const commentFacet = pane().getByRole("checkbox", {
    name: "rdfs:comment",
    exact: true,
  });
  await expect(commentFacet).not.toBeChecked();
  await expect(commentFacet.locator("..")).toContainText("1");
  await create()
    .getByRole("textbox", { name: "Class label", exact: true })
    .fill("Hand Edited Draft");
  await create()
    .getByRole("textbox", { name: "Class comment", exact: true })
    .fill("Keep this comment");
  await create().getByRole("button", { name: "Source", exact: true }).click();
  const remedy = pane().getByRole("button", {
    name: /Search all \d+ fields 1 match/,
  });
  await remedy.click();
  await expect(pane().locator(".find-results tbody tr")).toHaveCount(1);
  await expect(pane().locator(".find-match-evidence")).toContainText(
    "matched in rdfs:comment",
  );
  await expect(pane().locator(".find-result-path")).toHaveText("Foundation");
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  await expect(
    create().getByRole("textbox", { name: "Class label", exact: true }),
  ).toHaveValue("Hand Edited Draft");
  await expect(
    create().getByRole("textbox", { name: "Class comment", exact: true }),
  ).toHaveValue("Keep this comment");
  await expect(
    create().getByRole("button", { name: "Source", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await pane()
    .getByRole("searchbox", { name: "Filter search fields" })
    .fill("zzzz");
  await expect(pane()).toContainText("No field name contains that text.");
  await expect(query()).toHaveValue("Saffron manuscripts");
});

test("zero remedies stay visible and disabled, query follows label until edited, source and caret persist", async () => {
  await miss();
  await expect(
    pane().getByRole("button", { name: /Reset every filter 0 matches/ }),
  ).toBeDisabled();
  await expect(pane()).toContainText(
    "A miss inside a narrowed scope is not the same as an absence.",
  );
  await query().fill("unlisted architecture");
  await expect(
    create().getByRole("textbox", { name: "Class label", exact: true }),
  ).toHaveValue("Unlisted Architecture");
  const label = create().getByRole("textbox", {
    name: "Class label",
    exact: true,
  });
  await label.fill("Unlisted Subject");
  await create().getByRole("button", { name: "Source", exact: true }).click();
  await label.focus();
  await label.evaluate((el: HTMLInputElement) => el.setSelectionRange(9, 9));
  await label.pressSequentially("New ");
  await expect(create().getByLabel("RDF/XML source")).toContainText(
    "Unlisted New Subject",
  );
  expect(
    await label.evaluate((el: HTMLInputElement) => el.selectionStart),
  ).toBe(13);
  await query().fill("completely unknown");
  await expect(label).toHaveValue("Unlisted New Subject");
  await expect(
    create().getByRole("textbox", { name: "Subject IRI" }),
  ).toHaveValue(base + "UnlistedNewSubject");
});

test("hidden property duplicate is blocked and Open widens scope to a visible selected row", async () => {
  await pane()
    .getByRole("checkbox", { name: "Properties", exact: true })
    .uncheck();
  await pane()
    .getByRole("checkbox", { name: "Other entities", exact: true })
    .uncheck();
  await query().fill("Public Property");
  await expect(create()).toBeVisible();
  await expect(
    create().getByRole("button", { name: "Create class", exact: true }),
  ).toBeDisabled();
  await expect(create()).toContainText("Public Property already exists");
  await expect(create()).not.toContainText("field was out of scope");
  await create()
    .getByRole("button", { name: "Open Public Property", exact: true })
    .click();
  await expect(
    pane().getByRole("checkbox", { name: "Properties", exact: true }),
  ).toBeChecked();
  await expect(
    pane().locator('.find-results tr[data-selected="true"]'),
  ).toContainText("Public Property");
  await expect(
    pane().getByRole("region", { name: "Selected entity" }),
  ).toContainText(base + "prop");
});

test("inline create saves custom IRI, parents and annotations, selects it, and undoes atomically", async () => {
  const before = await snapshot();
  await miss();
  await create()
    .getByRole("textbox", { name: "Class label", exact: true })
    .fill("Unicode 日本語");
  await create()
    .getByRole("textbox", { name: "Subject IRI" })
    .fill(":ManualSubject");
  await create()
    .getByRole("textbox", { name: "Class comment", exact: true })
    .fill('A < B & "quoted"');
  const parent = create().getByRole("combobox", { name: "Parent classes" });
  await parent.fill("Foundation");
  await page.getByRole("option", { name: /Foundation/ }).click();
  await create()
    .getByRole("button", { name: /Add row/ })
    .click();
  await create()
    .getByRole("combobox", { name: "Predicate 1", exact: true })
    .selectOption(NS.skos + "altLabel");
  await create()
    .getByRole("textbox", { name: "Value 1", exact: true })
    .fill("Other & alias");
  await create().getByRole("button", { name: "Source", exact: true }).click();
  await expect(create().getByLabel("RDF/XML source")).toContainText(
    "Other &amp; alias",
  );
  await create()
    .getByRole("button", { name: "Create class", exact: true })
    .click();
  await expect(
    pane().locator('.find-results tr[data-selected="true"]'),
  ).toContainText("Unicode 日本語");
  const inspector = pane().getByRole("region", { name: "Selected entity" });
  await expect(inspector).toContainText("created here");
  await expect(inspector).toContainText("Foundation");
  await expect(inspector).toContainText("Other & alias");
  const added = (await snapshot()).entities.find(
    (e) => e.iri === base + "ManualSubject",
  );
  expect(added?.parents).toEqual([base + "Root"]);
  await menu("edit.undo");
  await expect
    .poll(async () => (await snapshot()).tripleCount)
    .toBe(before.tripleCount);
  await menu("edit.redo");
  await expect
    .poll(async () =>
      (await snapshot()).entities.some((e) => e.iri === base + "ManualSubject"),
    )
    .toBe(true);
});

test("pending parent text blocks commit and Escape restores explicit root creation", async () => {
  await miss();
  const parent = create().getByRole("combobox", { name: "Parent classes" });
  await parent.fill("unfinished parent");
  await expect(
    create().getByRole("button", { name: "Create class", exact: true }),
  ).toBeDisabled();
  await parent.press("Escape");
  await expect(parent).toHaveValue("");
  await expect(create()).toContainText("Adding under owl:Thing.");
  await create()
    .getByRole("button", { name: "Create class", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await snapshot()).entities.find(
          (e) => e.label === "Zygomorphic Architecture",
        )?.parents,
    )
    .toEqual([THING]);
});

test("full Add entity handoff preserves the entire draft and commits a new parent with one undo", async () => {
  const before = await snapshot();
  await miss();
  await create()
    .getByRole("textbox", { name: "Subject IRI" })
    .fill(":RetainedSubject");
  await create()
    .getByRole("textbox", { name: "Class comment", exact: true })
    .fill("Retained description");
  await create()
    .getByRole("button", { name: /Add row/ })
    .click();
  await create()
    .getByRole("combobox", { name: "Predicate 1", exact: true })
    .selectOption(NS.skos + "altLabel");
  await create()
    .getByRole("textbox", { name: "Value 1", exact: true })
    .fill("Retained alias");
  await create().getByRole("button", { name: "Source", exact: true }).click();
  await create()
    .getByRole("combobox", { name: "Parent classes" })
    .fill("Entirely New Parent");
  await page
    .getByRole("option", { name: /Create “Entirely New Parent”/ })
    .click();
  const editor = page.getByRole("region", { name: "Add entity", exact: true });
  await expect(
    editor.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Entirely New Parent");
  await editor
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Subject IRI" }),
  ).toHaveValue(base + "RetainedSubject");
  await expect(
    editor.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Retained description");
  await expect(editor).toContainText("Retained alias");
  await expect(
    editor.getByRole("button", { name: "Source", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(editor.getByLabel("RDF/XML source")).toContainText(
    base + "EntirelyNewParent",
  );
  await editor.getByRole("button", { name: "Add class", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await snapshot()).entities.find(
          (e) => e.iri === base + "RetainedSubject",
        )?.parents,
    )
    .toEqual([base + "EntirelyNewParent"]);
  await menu("edit.undo");
  await expect
    .poll(async () => (await snapshot()).tripleCount)
    .toBe(before.tripleCount);
  await menu("edit.redo");
  await expect
    .poll(async () =>
      (await snapshot()).entities.some(
        (e) => e.iri === base + "RetainedSubject",
      ),
    )
    .toBe(true);
  await menu("view.find");
  await expect(
    pane().locator('.find-results tr[data-selected="true"]'),
  ).toContainText("Zygomorphic Architecture");
  await expect(
    pane().getByRole("region", { name: "Selected entity" }),
  ).toContainText("created here");
});

test("creation rejects stale versions and epochs before any write", async () => {
  const result = await page.evaluate(async () => {
    const s = await window.axiom.request<Snapshot>("state");
    const creation = {
      label: "Stale Draft",
      comment: "",
      parents: [],
      statements: [],
    };
    const replies: string[] = [];
    for (const args of [
      { version: s.version - 1, datasetEpoch: s.datasetEpoch },
      { version: s.version, datasetEpoch: s.datasetEpoch - 1 },
    ]) {
      try {
        await window.axiom.request("findCreate", { creation, ...args });
        replies.push("accepted");
      } catch (reason) {
        replies.push(String(reason));
      }
    }
    return {
      replies,
      before: s.tripleCount,
      after: (await window.axiom.request<Snapshot>("state")).tripleCount,
    };
  });
  expect(result.replies).toHaveLength(2);
  expect(
    result.replies.every((text) => text.includes("ontology changed")),
  ).toBe(true);
  expect(result.before).toBe(result.after);
});

test("dataset replacement clears pending draft and created-session markers", async () => {
  await miss();
  await create()
    .getByRole("textbox", { name: "Class comment", exact: true })
    .fill("Old ontology draft");
  await openFixture("replacement.ttl");
  await menu("view.find");
  await expect(
    create().getByRole("textbox", { name: "Class comment", exact: true }),
  ).toHaveValue("");
  await expect(pane().locator(".find-created")).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const)
  test(`zero editor is accessible at narrow widths in ${theme} theme`, async () => {
    await menu(`theme.${theme}`);
    await miss();
    await page
      .locator(".flexlayout__tabset_tabbar_outer")
      .filter({ has: page.getByRole("tab", { name: "Find", exact: true }) })
      .getByRole("button", { name: "Maximize tabset" })
      .click();
    for (const width of [1100, 900, 680, 375]) {
      await app.evaluate(({ BrowserWindow }, width) => {
        const w = BrowserWindow.getAllWindows()[0];
        w.setMinimumSize(375, 400);
        w.setSize(width, 950);
      }, width);
      await expect(
        create().getByRole("textbox", { name: "Class label", exact: true }),
      ).toBeVisible();
      const overflow = await pane().evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
      if (width === 1100)
        await page.screenshot({
          path: `artifacts/find-zero-${theme}-1100.png`,
        });
    }
    await create().getByRole("button", { name: "Source", exact: true }).click();
    const results = await new AxeBuilder({ page })
      .setLegacyMode()
      .include('[data-panel="find"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `artifacts/find-zero-${theme}-375.png` });
  });
