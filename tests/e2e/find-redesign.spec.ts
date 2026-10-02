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
import {
  holdRequests,
  waitForHeld,
  releaseRequests,
  requestCount,
} from "./held-requests";
const base = "https://example.test/find-design#";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const pane = () => page.getByRole("region", { name: "Find entities results" });
const query = () =>
  pane().getByRole("searchbox", { name: "Search the ontology" });
const create = () =>
  pane().getByRole("region", { name: "Add to the ontology" });
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
  await expect
    .poll(async () => {
      if (!(await pane().isVisible())) await menu("view.find");
      return pane().isVisible();
    })
    .toBe(true);
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
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByLabel("Results per page").selectOption("25");
  await pane().getByLabel("Results per page").press("Escape");
  await expect(pane().locator(".find-results tbody tr")).toHaveCount(25);
  await expect(pane().getByRole("columnheader")).toHaveText([
    "Entity",
    "Type",
    "Synonym",
  ]);
  await expect(pane().locator(".find-summary")).toHaveText(
    /\d+ matches of \d+ entities/,
  );
  await expect(pane()).toContainText("Select a result to inspect it.");
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "Clear", exact: true }).click();
  await expect(pane().locator(".find-results tbody tr")).toHaveCount(25);
  await query().fill("Foundation");
  await expect(
    pane().getByRole("table", { name: "Found entities" }),
  ).toHaveCount(0);
  await expect(pane()).toContainText("Page 0 of 0");
  await pane().getByRole("button", { name: "More", exact: true }).click();
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
  await pane().getByRole("button", { name: "More", exact: true }).click();
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
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane()
    .getByRole("searchbox", { name: "Filter search fields" })
    .fill("zzzz");
  await expect(pane()).toContainText("No field name contains that text.");
  await expect(query()).toHaveValue("Saffron manuscripts");
});

test("zero-yield remedies collapse, query follows label until edited, source and caret persist", async () => {
  await miss();
  await expect(
    pane().getByRole("group", { name: "Search remedies" }),
  ).toBeHidden();
  await expect(pane()).toContainText("Widening the scope would not help.");
  await expect(pane()).toContainText(/Nothing matched in 2 of \d+ fields\./);
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
  await expect(create()).toContainText("Set a parent to change that.");
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

test("flat editor follows parent selection, label edits and statement removal", async () => {
  await miss("New course");
  const ancestry = create().getByLabel("Draft ancestry");
  const count = create().locator(".entity-statement-count");
  const parent = create().getByRole("combobox", { name: "Parent classes" });
  await expect(ancestry).toContainText("New Course under owl:Thing");
  await expect(ancestry.locator(".entity-ancestry-card")).toHaveCount(0);
  await expect(count).toHaveText("4 statements");
  await parent.fill("Foundation");
  await page.getByRole("option", { name: /Foundation/ }).click();
  await expect(parent).toHaveValue("Foundation");
  await expect(ancestry.locator(".entity-ancestry-card .nn")).toHaveText([
    "New Course",
    "Foundation",
  ]);
  await create()
    .getByRole("textbox", { name: "Class label", exact: true })
    .fill("Revised Course");
  await expect(
    ancestry.locator(".entity-ancestry-card .nn").first(),
  ).toHaveText("Revised Course");
  await expect(create().locator(".dest")).toHaveText(
    "Creates Revised Course under Foundation.",
  );
  await create()
    .getByRole("button", { name: "+ Add row", exact: true })
    .click();
  await create()
    .getByRole("textbox", { name: "Value 1", exact: true })
    .fill("Retained annotation");
  await expect(count).toHaveText("5 statements");
  await create().getByRole("button", { name: "Source", exact: true }).click();
  await expect(create().getByLabel("RDF/XML source")).toContainText(
    "Retained annotation",
  );
  await create().getByRole("textbox", { name: "Value 1", exact: true }).focus();
  const remove = create()
    .locator("tr")
    .filter({
      has: page.getByRole("textbox", { name: "Value 1", exact: true }),
    })
    .getByRole("button", {
      name: /^Remove this .* value$/,
      exact: true,
    });
  await remove.focus();
  await remove.press("Enter");
  await expect(count).toHaveText("4 statements");
  await expect(create().getByLabel("RDF/XML source")).not.toContainText(
    "Retained annotation",
  );
  await parent.focus();
  await parent.press("Escape");
  const removeParent = create().getByRole("button", {
    name: "Remove this rdfs:subClassOf value",
    exact: true,
  });
  await removeParent.focus();
  await removeParent.press("Enter");
  await expect(parent).toHaveValue("");
  await expect(ancestry.locator(".entity-ancestry-card")).toHaveCount(0);
  await expect(ancestry).toContainText("Revised Course under owl:Thing");
  await expect(create().getByLabel("RDF/XML source")).toContainText(THING);
  await expect(
    create().getByRole("button", { name: "Create class", exact: true }),
  ).toBeEnabled();
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
  await expect(pane().locator(".find-created")).toContainText("created here");
});

test("selected-name casing leaves Find handoffs and typed parent names unchanged", async () => {
  await miss("PHD SEMINAR IN GIS");
  const label = create().getByRole("textbox", {
    name: "Class label",
    exact: true,
  });
  await expect(label).toHaveValue("PHD SEMINAR IN GIS");
  await label.fill("my CUSTOM phd seminar");
  await create()
    .getByRole("button", { name: "Continue in Add entity", exact: true })
    .click();
  const form = page.getByRole("region", { name: "Add entity", exact: true });
  const name = form.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toHaveValue("my CUSTOM phd seminar");
  await expect(form).toContainText("Adding from Find");
  await form
    .getByRole("combobox", { name: "Parent classes", exact: true })
    .fill("a CUSTOM parent");
  await page.getByRole("option", { name: /Create “a CUSTOM parent”/ }).click();
  await expect(name).toHaveValue("a CUSTOM parent");
  await form
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await expect(name).toHaveValue("my CUSTOM phd seminar");
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(form).toHaveCount(0);
  const state = await snapshot();
  const child = state.entities.find(
    (entity) => entity.label === "my CUSTOM phd seminar",
  )!;
  const parent = state.entities.find(
    (entity) => entity.label === "a CUSTOM parent",
  )!;
  expect(child.parents).toEqual([parent.iri]);
});

test("Add entity handoff retains source and errors while edited drafts are checked", async () => {
  await miss();
  await create().getByRole("button", { name: "Source", exact: true }).click();
  await create()
    .getByRole("button", { name: "Continue in Add entity", exact: true })
    .click();
  const form = page.getByRole("region", { name: "Add entity", exact: true });
  const name = form.getByRole("textbox", { name: "Name", exact: true });
  const add = form.getByRole("button", { name: "Add class", exact: true });
  const source = form.getByLabel("RDF/XML source");
  await expect(add).toBeEnabled();
  const previous = await source.textContent();
  const namePosition = () =>
    name.evaluate((el) => {
      const scroll = el.closest(".text-create-scroll")!;
      return (
        el.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top +
        scroll.scrollTop
      );
    });
  const before = await namePosition();
  await holdRequests(app, ["textAnalysisCreatePreview"]);
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Changed description");
  await waitForHeld(app);
  await expect(source).toHaveText(previous!);
  await expect(add).toBeEnabled();
  expect(await namePosition()).toBeCloseTo(before, 1);
  await releaseRequests(app, { fail: true, keepHolding: true });
  await expect(form.getByRole("alert")).toContainText(
    "Controlled preview failure",
  );
  await name.fill("Revised Architecture");
  await waitForHeld(app);
  await expect(source).toHaveText(previous!);
  await expect(form.getByRole("alert")).toContainText(
    "Controlled preview failure",
  );
  await releaseRequests(app);
  await expect(form.getByRole("alert")).toHaveCount(0);
  await expect(source).toContainText("Revised Architecture");
  expect(await namePosition()).toBeCloseTo(before, 1);
  await expect(add).toBeEnabled();
});

test("Add entity handoff keeps the Subject field editable at a referenced IRI collision", async () => {
  await miss();
  await create()
    .getByRole("button", { name: "Continue in Add entity", exact: true })
    .click();
  const form = page.getByRole("region", { name: "Add entity", exact: true });
  const subject = form.getByRole("textbox", {
    name: "Subject IRI",
    exact: true,
  });
  const add = form.getByRole("button", { name: "Add class", exact: true });
  await expect(add).toBeEnabled();
  await subject.fill(NS.rdfs + "label");
  await expect(form.locator(".text-create-validation")).toContainText(
    "already exists",
  );
  await expect(subject).toBeEditable();
  await expect(subject).toBeFocused();
  await expect(add).toBeDisabled();
  await expect(
    form.getByRole("button", { name: /Open .* in Taxonomy/ }),
  ).toHaveCount(0);
  await subject.press("End");
  await subject.pressSequentially("Course");
  await expect(add).toBeEnabled();
  await expect(subject).toHaveValue(NS.rdfs + "labelCourse");
  await holdRequests(app, ["textAnalysisCreatePreview"]);
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Save only after source validation");
  await add.click();
  await waitForHeld(app);
  expect(await requestCount(app, "textAnalysisCreate")).toBe(0);
  await releaseRequests(app);
  await expect(form).toHaveCount(0);
  expect(await requestCount(app, "textAnalysisCreate")).toBe(1);
});

test("Find creation keeps source, footer and buttons stable while every draft field is checked", async () => {
  await miss();
  await create()
    .getByRole("button", { name: /Add row/ })
    .click();
  await create()
    .getByRole("textbox", { name: "Value 1", exact: true })
    .fill("Initial annotation");
  const add = create().getByRole("button", {
    name: "Create class",
    exact: true,
  });
  const next = create().getByRole("button", {
    name: "Continue in Add entity",
    exact: true,
  });
  await expect(add).toBeEnabled();
  await create().getByRole("button", { name: "Source", exact: true }).click();
  await holdRequests(app, ["findCreatePreview"]);
  for (const [label, text] of [
    ["Class label", "Quiet Architecture"],
    ["Subject IRI", base + "QuietSubject"],
    ["Class comment", "A complete description"],
    ["Value 1", "Changed annotation"],
  ]) {
    const source = create().getByLabel("RDF/XML source"),
      before = await source.textContent();
    const field = create().getByRole("textbox", { name: label, exact: true });
    await field.fill(text);
    await waitForHeld(app);
    await expect(source).toHaveText(before!);
    await expect(add).toBeEnabled();
    await expect(next).toBeEnabled();
    await expect(create()).not.toContainText("Checking draft");
    await expect(field).toBeFocused();
    await releaseRequests(app, { keepHolding: true });
    await expect(source).toContainText(text);
  }
  await create().getByRole("button", { name: "Source", exact: true }).click();
  const footer = create().locator("footer");
  const label = create().getByRole("textbox", {
    name: "Class label",
    exact: true,
  });
  await label.press("End");
  const before = await footer.boundingBox();
  await label.pressSequentially(" studies");
  await waitForHeld(app);
  expect((await footer.boundingBox())!.y).toBeCloseTo(before!.y, 1);
  await releaseRequests(app, { reverse: true });
  await expect(add).toBeEnabled();
  expect((await footer.boundingBox())!.y).toBeCloseTo(before!.y, 1);
});

test("Find creation retains a collision and field errors until replacement validation settles", async () => {
  await miss();
  const label = create().getByRole("textbox", {
    name: "Class label",
    exact: true,
  });
  await label.fill("Ocean Studies");
  await expect(create().locator(".find-collision")).toContainText(
    "already exists",
  );
  await holdRequests(app, ["findCreatePreview"]);
  await label.fill("Ocean  Studies");
  await waitForHeld(app);
  await expect(create().locator(".find-collision")).toContainText(
    "already exists",
  );
  await expect(
    create().getByRole("button", { name: "Create class", exact: true }),
  ).toBeDisabled();
  await releaseRequests(app, { keepHolding: true });
  await label.fill("Unoccupied label");
  await waitForHeld(app);
  await expect(create().locator(".find-collision")).toContainText(
    "already exists",
  );
  await releaseRequests(app, { keepHolding: true });
  await expect(create().locator(".find-collision")).toHaveCount(0);
  const iri = create().getByRole("textbox", { name: "Subject IRI" });
  await iri.fill("not an iri");
  await waitForHeld(app);
  await releaseRequests(app, { keepHolding: true });
  await expect(iri).toHaveAttribute("aria-invalid", "true");
  const error = await create()
    .locator(".validation-error:visible")
    .first()
    .textContent();
  await iri.fill(base + "Corrected");
  await waitForHeld(app);
  await expect(
    create().locator(".validation-error:visible").first(),
  ).toHaveText(error!);
  await releaseRequests(app);
  await expect(iri).toHaveAttribute("aria-invalid", "false");
});

for (const outcome of ["valid", "collision", "invalid", "failure"] as const) {
  test(`Find creation waits for a pending ${outcome} preview before committing`, async () => {
    await miss();
    await holdRequests(app, ["findCreatePreview"]);
    if (outcome === "invalid")
      await create()
        .getByRole("textbox", { name: "Subject IRI" })
        .fill("not an iri");
    else
      await create()
        .getByRole("textbox", { name: "Class label", exact: true })
        .fill(outcome === "collision" ? "Ocean Studies" : "Verified creation");
    const add = create().getByRole("button", {
      name: "Create class",
      exact: true,
    });
    await add.click();
    await add.click();
    await waitForHeld(app);
    expect(await requestCount(app, "findCreate")).toBe(0);
    await releaseRequests(app, { fail: outcome === "failure" });
    if (outcome === "valid") {
      await expect.poll(() => requestCount(app, "findCreate")).toBe(1);
      await expect
        .poll(async () =>
          (await snapshot()).entities.some(
            (e) => e.label === "Verified creation",
          ),
        )
        .toBe(true);
    } else {
      await expect(add).toBeDisabled();
      expect(await requestCount(app, "findCreate")).toBe(0);
      await expect(
        create().getByRole("textbox", { name: "Class label", exact: true }),
      ).toBeEditable();
    }
  });
}

test("Continue waits for the latest Find draft and cancels its handoff if edited again", async () => {
  await miss();
  await holdRequests(app, ["findCreatePreview"]);
  const comment = create().getByRole("textbox", {
    name: "Class comment",
    exact: true,
  });
  const next = create().getByRole("button", {
    name: "Continue in Add entity",
    exact: true,
  });
  const editor = page.getByRole("region", { name: "Add entity", exact: true });
  await comment.fill("First revision");
  await next.click();
  await waitForHeld(app);
  await expect(editor).toHaveCount(0);
  await comment.fill("Final revision");
  await waitForHeld(app, 2);
  await releaseRequests(app, { reverse: true, keepHolding: true });
  await expect(
    create().getByRole("button", { name: "Create class", exact: true }),
  ).toBeEnabled();
  await expect(editor).toHaveCount(0);
  await comment.fill("Handoff revision");
  await next.click();
  await waitForHeld(app);
  await expect(editor).toHaveCount(0);
  await releaseRequests(app);
  await expect(
    editor.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Handoff revision");
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
