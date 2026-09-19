import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseRdf, writeRdf } from "../../src/domain/rdf-io";
import { NS } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
const base = "https://example.test/details/";
const ttl = `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .
:Alpha a owl:Class; rdfs:label "Alpha"@en; rdfs:comment "Original comment"; rdfs:subClassOf :Beta; rdfs:seeAlso :Gamma .
:Beta a owl:Class; rdfs:label "Beta" . :Gamma a owl:Class; rdfs:label "Gamma" .
:Combined a owl:Class; rdfs:label "Combined"; rdfs:subClassOf [a owl:Class; owl:intersectionOf (:Beta :Gamma)] .`;
let app: ElectronApplication, page: Page;
let errors: string[];
let profile: string;
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const details = () =>
  page.getByRole("region", { name: "Details", exact: true });
const source = () =>
  details().getByRole("textbox", { name: "Entity source", exact: true });
async function sourceText() {
  const marker = "axiom-copy-" + Date.now();
  await app.evaluate(
    ({ clipboard }, marker) => clipboard.writeText(marker),
    marker,
  );
  await source().focus();
  await source().press("Control+a");
  await source().press("Control+c");
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .not.toBe(marker);
  return (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(
    /\r\n/g,
    "\n",
  );
}
async function expectSyntaxColors() {
  await expect
    .poll(async () =>
      details()
        .locator(".monaco-editor .view-line span")
        .evaluateAll(
          (spans) =>
            new Set(
              spans
                .filter((s) => s.textContent?.trim())
                .map((s) => getComputedStyle(s).color),
            ).size,
        ),
    )
    .toBeGreaterThan(2);
}
async function setSource(text: string) {
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), text);
  await source().focus();
  await source().press("Control+a");
  await source().press("Control+v");
}
const label = () =>
  details().getByRole("textbox", { name: "Entity label", exact: true });
const comment = () =>
  details().getByRole("textbox", { name: "Entity comment", exact: true });
const row = (predicate: string) =>
  details()
    .locator("tbody tr")
    .filter({ has: page.locator('select[title="' + predicate + '"]') });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function select(iri: string) {
  await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
}
async function openSource() {
  if (
    !(await details()
      .locator(".entity-source")
      .evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await details().locator(".entity-source > summary").click();
  await expect(source()).toBeEnabled();
}
async function importText(text = ttl, fileName = "details.ttl") {
  const file = path.join(profile, fileName);
  await writeFile(file, text);
  const epoch = (await state()).datasetEpoch;
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
  await select(base + "Alpha");
}
test.beforeEach(async () => {
  errors = [];
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/details-source-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((win) => win.setFocusable(false));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await importText();
  await menu("view.details");
  await expect(label()).toHaveValue("Alpha");
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("details-source-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
test("two-column grid uses predicates, commits cell edits, preserves language and refreshes Source", async () => {
  await expect(details().getByRole("columnheader")).toHaveText([
    "Predicate",
    "Value",
  ]);
  await expect(
    details().getByRole("button", { name: "Apply changes", exact: true }),
  ).toHaveCount(0);
  expect(await label().evaluate((el) => getComputedStyle(el).resize)).toBe(
    "none",
  );
  await label().fill("Alpha updated");
  await label().press("Tab");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "Alpha")?.label,
    )
    .toBe("Alpha updated");
  await openSource();
  await expect.poll(sourceText).toMatch(/Alpha updated/);
  await expectSyntaxColors();
  await comment().fill("Changed in grid");
  await comment().press("Enter");
  await expect.poll(sourceText).toMatch(/Changed in grid/);
  await expect.poll(sourceText).toMatch(/"Alpha updated"@en/);
  await setSource(
    (await sourceText()).replace('"Alpha updated"@en', '"Alpha updated"@fr'),
  );
  await details()
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect.poll(sourceText).toMatch(/"Alpha updated"@fr/);
  await details().getByRole("button", { name: "Add row", exact: true }).click();
  const last = details().locator("tbody tr").last();
  await last
    .getByRole("combobox", { name: /Predicate/ })
    .selectOption(NS.rdfs + "seeAlso");
  await last.getByRole("combobox", { name: /Value/ }).fill(base + "Gamma");
  await last.getByRole("combobox", { name: /Value/ }).press("Tab");
  // A duplicate statement is canonicalized, not added twice.
  await expect(details().locator("tbody tr")).toHaveCount(5);
  await menu("pane.move.right");
  await page.screenshot({ path: "artifacts/testing/details-grid-source.png" });
});
test("Source saves only explicitly, updates the grid and graph, validates syntax, and supports Undo", async () => {
  await openSource();
  const original = await sourceText();
  await setSource(original.replace('"Alpha"', '"From source"'));
  await expect(label()).toHaveValue("Alpha");
  await details()
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(label()).toHaveValue("From source");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "Alpha")?.label,
    )
    .toBe("From source");
  await menu("edit.undo");
  await expect(label()).toHaveValue("Alpha");
  await setSource("invalid rdf {");
  await details()
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(details().getByRole("alert")).toBeVisible();
  await expect.poll(sourceText).toMatch("invalid rdf {");
  await expect(label()).toHaveValue("Alpha");
});
test("source drafts survive navigation and reject overwriting later grid edits", async () => {
  await openSource();
  await setSource((await sourceText()).replace('"Alpha"', '"Source draft"'));
  await select(base + "Beta");
  await expect(label()).toHaveValue("Beta");
  await details().getByRole("button", { name: "Back", exact: true }).click();
  await expect.poll(sourceText).toMatch(/Source draft/);
  await label().fill("Grid wins");
  await label().press("Tab");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "Alpha")?.label,
    )
    .toBe("Grid wins");
  await expect.poll(sourceText).toMatch(/Source draft/);
  await details()
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(details().getByRole("alert")).toContainText("changed");
  await expect(label()).toHaveValue("Grid wins");
  await details()
    .getByRole("button", { name: "Discard source edits", exact: true })
    .click();
  await expect.poll(sourceText).toMatch(/Grid wins/);
});
test("native RDF/XML source preserves an OWL intersection through editing", async () => {
  const xml = await writeRdf(
    (
      await parseRdf(
        ttl.replace("rdfs:subClassOf [", "owl:equivalentClass ["),
        "test.ttl",
        base,
      )
    ).triples,
    "rdfxml",
  );
  await importText(xml, "details.owl");
  await select(base + "Combined");
  await menu("view.details");
  await expect(label()).toHaveValue("Combined");
  await openSource();
  await expect.poll(sourceText).toMatch(/^<\?xml/);
  await expectSyntaxColors();
  const before = (await state()).entities.find(
    (e) => e.iri === base + "Combined",
  )!.classExpressions;
  const original = await sourceText();
  expect(original).toContain(">Combined<");
  await setSource(original.replace(">Combined<", ">Combined XML<"));
  await expect.poll(sourceText).toMatch(/>Combined XML</);
  await details()
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(details().getByRole("alert")).toHaveCount(0);
  await expect(label()).toHaveValue("Combined XML");
  expect(
    (await state()).entities.find((e) => e.iri === base + "Combined")!
      .classExpressions,
  ).toEqual(before);
});
test("predicate dropdown supports finding and explicitly adding predicates", async () => {
  const predicate = row(NS.rdfs + "comment").getByRole("combobox");
  await predicate.selectOption("__find");
  const find = page.getByRole("dialog", { name: "Find predicate" });
  await find
    .getByRole("textbox", { name: "Search predicates" })
    .fill("seeAlso");
  await expect(
    find.getByRole("button", { name: "rdfs:seeAlso", exact: true }),
  ).toHaveCount(1);
  await find.getByRole("button", { name: "Close dialog", exact: true }).click();
  await predicate.selectOption("__add");
  const add = page.getByRole("dialog", { name: "Add predicate" });
  await add.getByRole("textbox", { name: "Predicate IRI" }).fill("notes");
  await add.getByRole("button", { name: "Use predicate" }).click();
  await expect(row(base + "notes").getByRole("textbox")).toHaveValue(
    "Original comment",
  );
  await expect
    .poll(async () =>
      (
        await page.evaluate(
          (iri) => window.axiom.request<any>("entityDocument", { iri }),
          base + "Alpha",
        )
      ).statements.some((t: any) => t.predicate === base + "notes"),
    )
    .toBe(true);
});
test("automatic saves do not take selection back from a resource opened in Details", async () => {
  await comment().fill("Keep this edit while navigating");
  await row(NS.rdfs + "subClassOf")
    .getByRole("button", { name: /Open details/ })
    .click();
  await expect(label()).toHaveValue("Beta");
  await expect.poll(async () => (await state()).selected).toBe(base + "Beta");
  await details().getByRole("button", { name: "Back", exact: true }).click();
  await expect(comment()).toHaveValue("Keep this edit while navigating");
  await openSource();
  const text = await sourceText();
  await source().focus();
  await source().press("Control+End");
  await source().press("Backspace");
  await expect.poll(async () => (await state()).selected).toBe(base + "Alpha");
  expect((await sourceText()).length).toBe(text.length - 1);
});

test("edge Details commits dropdown changes and keeps the updated edge selected", async () => {
  await page.evaluate(
    async ({ base, subclass }) => {
      await window.axiom.request("seed", {
        iris: [base + "Alpha", base + "Beta", base + "Gamma"],
        expand: false,
      });
      await window.axiom.request("selectEdge", {
        key: JSON.stringify([base + "Alpha", subclass, base + "Beta"]),
      });
    },
    { base, subclass: NS.rdfs + "subClassOf" },
  );
  await expect(details().getByRole("columnheader")).toHaveText([
    "Predicate",
    "Value",
  ]);
  await expect(
    details().getByRole("button", { name: "Apply edge changes" }),
  ).toHaveCount(0);
  await details()
    .getByRole("combobox", { name: "Edge target", exact: true })
    .fill(base + "Gamma");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(
      JSON.stringify([base + "Alpha", NS.rdfs + "subClassOf", base + "Gamma"]),
    );
  await details()
    .getByRole("combobox", { name: "Edge relationship", exact: true })
    .selectOption(NS.owl + "equivalentClass");
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(
      JSON.stringify([
        base + "Alpha",
        NS.owl + "equivalentClass",
        base + "Gamma",
      ]),
    );
  await expect(
    details().getByRole("combobox", { name: "Edge target", exact: true }),
  ).toHaveAttribute("title", base + "Gamma");
});

test("class declaration is fixed; recognized prefixes and instance types stay distinct", async () => {
  const first = details().locator("tbody tr").first();
  await expect(first).toHaveAttribute("data-readonly", "true");
  await expect(first).toContainText("rdf:type");
  await expect(first).toContainText("owl:Class");
  await expect(first.locator("input, textarea, select")).toHaveCount(0);
  await expect(
    first.getByRole("button", { name: /Remove statement/ }),
  ).toHaveCount(0);
  await expect(first.getByRole("button")).toHaveCount(0);
  await importText(
    ttl +
      "\n<" +
      base +
      "Alpha> <" +
      NS.skos +
      'definition> "Definition"; <' +
      NS.dc +
      'title> "DC title"; <' +
      NS.dcterms +
      'created> "2026". <' +
      base +
      "one> a <" +
      base +
      "Alpha>.",
  );
  await menu("view.details");
  await expect(
    row(NS.skos + "definition").locator("select option:checked"),
  ).toHaveText("skos:definition");
  await expect(
    row(NS.dc + "title").locator("select option:checked"),
  ).toHaveText("dc:title");
  await expect(
    row(NS.dcterms + "created").locator("select option:checked"),
  ).toHaveText("dcterms:created");
  await select(base + "one");
  const type = row(NS.rdf + "type");
  await expect(type.getByRole("combobox", { name: /Predicate/ })).toBeEnabled();
  await expect(type.getByRole("combobox", { name: /Value/ })).toBeEnabled();
});

test("indexed parent choices edit ordinary subclass statements and support Escape and Undo", async () => {
  await select(base + "Combined");
  const parents = () => row(NS.rdfs + "subClassOf");
  await expect(parents()).toHaveCount(2);
  await expect(
    parents().nth(0).getByRole("combobox", { name: /Value/ }),
  ).toHaveValue("Beta");
  await expect(
    parents().nth(1).getByRole("combobox", { name: /Value/ }),
  ).toHaveValue("Gamma");
  const input = parents().nth(0).getByRole("combobox", { name: /Value/ });
  await input.fill("alp");
  await expect(
    page.getByRole("listbox").getByRole("option", { name: /Alpha/ }),
  ).toBeVisible();
  await input.press("Escape");
  await expect(input).toHaveValue("Beta");
  await input.fill("alp");
  await expect(
    page.getByRole("listbox").getByRole("option", { name: /Alpha/ }),
  ).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(
    parents().nth(0).getByRole("combobox", { name: /Value/ }),
  ).toHaveValue("Alpha");
  let doc = await page.evaluate(
    (iri) => window.axiom.request<any>("entityDocument", { iri }),
    base + "Combined",
  );
  expect(
    doc.statements
      .filter((t: any) => t.predicate === NS.rdfs + "subClassOf")
      .map((t: any) => t.object.value),
  ).toEqual([base + "Alpha", base + "Gamma"]);
  expect(
    doc.statements.some((t: any) => t.predicate === NS.owl + "equivalentClass"),
  ).toBe(false);
  await openSource();
  await expect.poll(sourceText).not.toMatch(/intersectionOf/);
  await details().locator(".panel-toolbar strong").first().click();
  await menu("edit.undo");
  await expect(
    parents().nth(0).getByRole("combobox", { name: /Value/ }),
  ).toHaveValue("Beta");
  await details().getByRole("button", { name: "Add row", exact: true }).click();
  await details()
    .locator("tbody tr")
    .last()
    .getByRole("combobox", { name: /Predicate/ })
    .selectOption(NS.rdfs + "subClassOf");
  const added = parents().last().getByRole("combobox", { name: /Value/ });
  await added.fill("alph");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /Alpha/ })
    .click();
  await expect(parents()).toHaveCount(3);
  await expect.poll(sourceText).toMatch(/:Alpha/);
  await parents()
    .last()
    .getByRole("button", { name: /Remove statement/ })
    .click();
  await expect(parents()).toHaveCount(2);
});

test("one ellipsis opens only the referenced entity and its scoped source", async () => {
  await expect(
    details().getByRole("button", { name: /Statement options/ }),
  ).toHaveCount(0);
  const action = row(NS.rdfs + "subClassOf").getByRole("button", {
    name: /Open details/,
  });
  await expect(action).toHaveText("⋯");
  await action.click();
  await expect(label()).toHaveValue("Beta");
  await expect(source()).toBeVisible();
  await expect.poll(sourceText).toMatch(/:Beta/);
  await expect.poll(sourceText).not.toMatch(/:Alpha|:Combined|:Gamma/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await details().getByRole("button", { name: "Back", exact: true }).click();
  await expect(label()).toHaveValue("Alpha");
});

test("equivalence keeps its stronger meaning and anonymous Details has an editable local snippet", async () => {
  await importText(
    ttl +
      "\n<" +
      base +
      "Defined> a <" +
      NS.owl +
      "Class>; <" +
      NS.rdfs +
      'label> "Defined"; <' +
      NS.owl +
      "equivalentClass> [ a <" +
      NS.owl +
      "Class>; <" +
      NS.owl +
      "intersectionOf> (<" +
      base +
      "Beta> <" +
      base +
      "Gamma>)].",
  );
  await select(base + "Defined");
  await menu("view.details");
  const equivalent = row(NS.owl + "equivalentClass");
  await expect(equivalent).toContainText("All of: Beta, Gamma");
  await equivalent.getByRole("button", { name: /Open details/ }).click();
  await expect(source()).toBeVisible();
  await expect
    .poll(sourceText)
    .toMatch(/owl:intersectionOf\s*\(:Beta :Gamma\)/);
  await expect.poll(sourceText).not.toMatch(/:Alpha|:Combined|:Defined/);
  await expect(
    details().getByRole("button", { name: "View source", exact: true }),
  ).toHaveCount(0);
  await setSource(
    (await sourceText()).replace("(:Beta :Gamma)", "(:Beta :Alpha)"),
  );
  await details()
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(details()).toContainText("Alpha");
  await details().getByRole("button", { name: "Back", exact: true }).click();
  await expect(row(NS.owl + "equivalentClass")).toContainText(
    "All of: Beta, Alpha",
  );
  await menu("pane.move.right");
  await page.screenshot({ path: "artifacts/testing/details-values.png" });
});

test("resource search supports mouse selection in detached Details", async () => {
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((p) => p !== page)!;
  child.on("pageerror", (error) => errors.push(error.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(child)
    ).evaluate((win) => win.setFocusable(false));
  const pane = child.getByRole("region", { name: "Details", exact: true });
  const parent = pane
    .locator('tr[data-predicate="' + NS.rdfs + 'subClassOf"]')
    .getByRole("combobox", { name: /Value/ });
  await parent.fill("gam");
  const matches = child.getByRole("listbox");
  await expect(matches).toBeVisible();
  await matches.getByRole("option", { name: /Gamma/ }).click();
  await expect(parent).toHaveValue("Gamma");
  await expect(matches).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === base + "Alpha")?.parents,
    )
    .toEqual([base + "Gamma"]);
  const toolbar = await pane.locator(".statement-grid-toolbar").boundingBox();
  const table = await pane
    .getByRole("table", { name: "Entity statements" })
    .boundingBox();
  expect(table!.x).toBeLessThanOrEqual(toolbar!.x + 4);
  expect(table!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
  await child.screenshot({
    path: "artifacts/testing/details-search-detached.png",
  });
});
