import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Snapshot } from "../../src/shared/protocol";
const home =
  (process.env.AXIOM_TEST_EXE
    ? path.join(path.dirname(process.env.AXIOM_TEST_EXE), "resources/mutatoc")
    : undefined) ??
  process.env.AXIOM_MUTATOC_HOME ??
  (existsSync("vendor/mutatoc/mutatoc.exe")
    ? path.resolve("vendor/mutatoc")
    : path.resolve("../mutatos/mutatoc/dist/mutatoc-win-x64-0.2.3"));
test.skip(
  !existsSync(path.join(home, "mutatoc.exe")),
  "Install mutatoc with npm run setup:mutatoc to run real NLP desktop tests.",
);
const base = "https://example.org/text#";
const turtle = `@prefix : <${base}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
:Computing a owl:Class; rdfs:label "Computing"; skos:altLabel "Computer" .
:Software a owl:Class; rdfs:label "Software" .
:Systems a owl:Class; rdfs:label "Systems" .
:Life a owl:Class; rdfs:label "Life" .
:Mammal a owl:Class; rdfs:label "Mammal"; rdfs:subClassOf :Life .
:Pet a owl:Class; rdfs:label "Pet"; rdfs:subClassOf :Life .
:Animal a owl:Class; rdfs:label "Animal"; rdfs:subClassOf :Mammal .
:Dog a owl:Class; rdfs:subClassOf :Animal, :Pet; rdfs:comment "A domesticated animal."; rdfs:label "Dog"; skos:altLabel "canine" .
:Cat a owl:Class; rdfs:subClassOf :Animal; rdfs:label "Cat" .
:Lion a owl:Class; rdfs:subClassOf :Animal; rdfs:label "Lion"; skos:altLabel "big cat" .
:Pair a owl:Class; rdfs:subClassOf :Animal; rdfs:label "pair"; skos:altLabel "alpha+beta" .
:renal_trauma a owl:Class; rdfs:subClassOf :Animal; rdfs:label "renal trauma"; skos:altLabel "kidney injury" .
:Acute a owl:Class; rdfs:subClassOf :Animal; rdfs:label "acute" .
:Condition a owl:Class; rdfs:subClassOf :Animal; rdfs:label "condition"; skos:altLabel "renal_trauma+acute" .`;
let app: ElectronApplication, page: Page, profile: string, file: string;
const errors: string[] = [];
const panel = () =>
  page.getByRole("region", { name: "Text Analysis", exact: true });
const editor = () =>
  panel().getByRole("textbox", { name: "Text to analyze", exact: true });
const entitiesPane = (target = page) =>
  target.getByRole("region", { name: "Text Entities", exact: true });
const chip = (label: string) =>
  entitiesPane()
    .locator(".text-analysis-chip")
    .filter({
      has: page.locator("span", { hasText: new RegExp("^" + label + "$") }),
    });
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
    AXIOM_USER_DATA: profile,
    AXIOM_MUTATOC_HOME: home,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.env.AXIOM_TEST_EXE) {
    delete env.AXIOM_MUTATOC_HOME;
    delete env.MUTATOC_PYTHON;
    delete env.MUTATOC_SPACY_WORKER;
    delete env.MUTATOC_SPARQL_WORKER;
    env.PATH = path.join(process.env.SystemRoot ?? "C:/Windows", "System32");
  }
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ dialog }, file) => {
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
async function enter(text: string) {
  if (!(await editor().isVisible())) await menu("view.textanalysis");
  await editor().focus();
  await page.keyboard.press("Control+A");
  if (text) await page.keyboard.insertText(text);
  else await page.keyboard.press("Backspace");
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/text-analysis-"));
  file = path.join(profile, "animals.ttl");
  await writeFile(file, turtle);
  await launch();
  await menu("file.open");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .classCount,
    )
    .toBeGreaterThan(3);
  await menu("view.textanalysis");
  await expect(editor()).toBeVisible();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page && !page.isClosed())
    await info.attach("Text Analysis", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

test("typing and pasting highlight original text automatically with accessible colors", async () => {
  expect(
    await panel()
      .getByRole("button", { name: /^Parse$/i })
      .count(),
  ).toBe(0);
  await enter("Dog");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  const text = "😀 Dog\ncanine and a big cat. Cat lives in London.";
  const oldClipboard = await app.evaluate(({ clipboard }) =>
    clipboard.readText(),
  );
  try {
    await app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      text,
    );
    await editor().focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+V");
  } finally {
    await app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      oldClipboard,
    );
  }
  await expect(chip("lion")).toBeVisible();
  await expect(chip("dog")).toContainText("2");
  await expect(chip("cat")).toBeVisible();
  await expect(chip("Place")).toBeVisible();
  const colors = await Promise.all(
    [chip("dog"), chip("cat")].map((c) =>
      c.evaluate((e) => getComputedStyle(e).backgroundColor),
    ),
  );
  expect(colors[0]).not.toBe(colors[1]);
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).not.toHaveCount(0);
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.axiom.preferences.load())).panelState?.[
        "textanalysis.text"
      ]
        ?.toString()
        .replace(/\r\n/g, "\n"),
    )
    .toBe(text);
  await page.screenshot({ path: "artifacts/testing/text-analysis-light.png" });
  const audit = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .include('[data-panel="textanalysis"]')
    .include('[data-panel="textentities"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await menu("theme.dark");
  await page.screenshot({ path: "artifacts/testing/text-analysis-dark.png" });
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode(true)
        .include('[data-panel="textanalysis"]')
        .include('[data-panel="textentities"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await enter("unmatchedword");
  await expect(entitiesPane()).toContainText("No entities found.");
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(0);
  await enter("");
  await expect(panel()).toContainText("Type or paste text to begin.");
});

test("unsaved ontology edits reparse the same text and text survives restart", async () => {
  await enter("Dog and kitty");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await expect(chip("cat")).toHaveCount(0);
  await page.evaluate(async (base) => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text:
        source.text +
        `\n<${base}Cat> <http://www.w3.org/2004/02/skos/core#altLabel> "kitty" .`,
    });
  }, base);
  await expect(chip("cat")).toBeVisible({ timeout: 10000 });
  await app.close();
  await launch();
  await menu("view.textanalysis");
  await expect(chip("cat")).toBeVisible({ timeout: 20000 });
  await expect(chip("dog")).toBeVisible();
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.axiom.preferences.load())).panelState?.[
        "textanalysis.text"
      ]
        ?.toString()
        .replace(/\r\n/g, "\n"),
    )
    .toBe("Dog and kitty");
});

test("switching ontologies clears old matches and a blank workspace retains model annotations", async () => {
  await enter("Dog in London");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await menu("file.new");
  await expect(panel()).toHaveCount(0);
  await menu("view.textanalysis");
  await expect(editor()).toBeVisible();
  await expect(chip("Place")).toBeVisible({ timeout: 20000 });
  await expect(chip("dog")).toHaveCount(0);
  await menu("file.example");
  await expect(panel()).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .ontology.example,
    )
    .toBe(true);
  await menu("view.textanalysis");
  await expect(editor()).toBeVisible();
  await enter("Margherita");
  await expect(chip("margherita")).toBeVisible({ timeout: 30000 });
});

async function highlighted(label: string) {
  const className = (await chip(label).getAttribute("class"))!.match(
    /text-entity-\d+/,
  )![0];
  return (await panel().locator(`.view-lines .${className}`).allTextContents())
    .join("")
    .replace(/\u00a0/g, " ");
}

test("dotted course synonyms highlight the full phrase and open the correct Details entry", async () => {
  await page.evaluate(async () => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text:
        source.text +
        `\n<https://example.org/text#History> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "History" .
<https://example.org/text#Course1865> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "American History To 1865"; <http://www.w3.org/2000/01/rdf-schema#seeAlso> "U.S. History to 1865"; <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://example.org/text#History> .`,
    });
  });
  for (const phrase of [
    "U.S. History to 1865",
    "U.S.  History  to  1865",
    "U.S.\nHistory\nto\n1865",
  ]) {
    await enter("😀 " + phrase + " ~~");
    await expect(chip("course1865")).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() => highlighted("course1865"))
      .toBe(phrase.replace(/\n/g, ""));
    await expect(chip("history")).toHaveCount(0);
  }
  await chip("course1865").click();
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "Course1865",
  );
  await enter("U.S. History to 1866");
  await expect(chip("course1865")).toHaveCount(0);
  await expect(chip("history")).toBeVisible();
});

test("plus spans highlight intervening words and stop at the reference distance boundary", async () => {
  for (const text of [
    "alpha blah blah beta",
    "beta blah blah alpha",
    "alpha blah blah blah beta",
  ]) {
    await enter(text);
    await expect(chip("pair")).toBeVisible({ timeout: 20000 });
    await expect.poll(() => highlighted("pair")).toBe(text);
  }
  await enter("alpha blah blah blah blah beta");
  await expect(entitiesPane()).toContainText("No entities found.");
  await expect(chip("pair")).toHaveCount(0);
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(0);

  await enter("alpha blah gamma");
  await expect(entitiesPane()).toContainText("No entities found.");
  await page.evaluate(async () => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text: source.text.replace('"alpha+beta"', '"alpha+gamma"'),
    });
  });
  await expect(chip("pair")).toBeVisible();
  await expect.poll(() => highlighted("pair")).toBe("alpha blah gamma");
});

test("nested plus spans select the complete original text across line breaks and emoji", async () => {
  const span = "kidney injury\nblah acute";
  await enter("😀 " + span + ".");
  await expect(chip("condition")).toBeVisible({ timeout: 20000 });
  await expect(chip("renal_trauma")).toHaveCount(0);
  await expect(chip("acute")).toHaveCount(0);
  await expect
    .poll(() => highlighted("condition"))
    .toBe(span.replace(/\n/g, ""));
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await chip("condition").click();
    await expect(details()).toHaveAttribute(
      "data-entity-iri",
      base + "Condition",
    );
    await menu("view.textanalysis");
    await expect(editor()).toBeFocused();
    await page.keyboard.press("Control+C");
    await expect
      .poll(async () =>
        (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(
          /\r\n/g,
          "\n",
        ),
      )
      .toBe(span);
  } finally {
    await app.evaluate(
      ({ clipboard }, value) => clipboard.writeText(value),
      clipboard,
    );
  }
});

const details = (target = page) =>
  target.getByRole("region", { name: "Details", exact: true });
const detailsTab = (target = page) =>
  target.getByRole("tab", { name: /^Details(?:_\d+)?$/, exact: true });
async function clickHighlight(label: string, occurrence = 0) {
  if (!(await editor().isVisible())) await menu("view.textanalysis");
  const className = (await chip(label).getAttribute("class"))!.match(
    /text-entity-\d+/,
  )![0];
  await panel().locator(`.view-lines .${className}`).nth(occurrence).click();
}

test("clicking a synonym reuses the editable Details tab for successive entities", async () => {
  await enter("canine and Cat");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await clickHighlight("dog");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(detailsTab()).toHaveCount(1);
  await expect(entitiesPane().getByRole("tab")).toHaveText([
    "Summary",
    "Add entity",
  ]);
  await expect(page.getByRole("region", { name: "Span details" })).toHaveCount(
    0,
  );
  await expect(
    details().getByRole("table", { name: "Entity statements" }),
  ).toBeVisible();
  await expect(
    details().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("A domesticated animal.");
  await expect(
    details().getByRole("button", { name: "View Animal details", exact: true }),
  ).toBeVisible();
  await expect(
    details().getByRole("button", { name: "View Pet details", exact: true }),
  ).toBeVisible();
  await details()
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .fill("Edited through the shared Details view.");
  await details()
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .press("Tab");
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => window.axiom.request<Snapshot>("state"))
        ).entities.find((e) => e.iri === base + "Dog")?.comment,
    )
    .toBe("Edited through the shared Details view.");
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode(true)
        .include('[aria-label="Details"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "artifacts/testing/text-analysis-shared-details.png",
  });
  await clickHighlight("cat");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Cat");
  await expect(detailsTab()).toHaveCount(1);
  await chip("dog").click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(
    details().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("Edited through the shared Details view.");
  await menu("view.details");
  await menu("pane.close");
  await expect(detailsTab()).toHaveCount(0);
  await clickHighlight("dog");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(detailsTab()).toHaveCount(1);
});

test("keyboard matches and model annotations use the same Details view without fabricated ontology links", async () => {
  await enter("alpha blah beta in London");
  await expect(chip("pair")).toBeVisible({ timeout: 20000 });
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Alt+Enter");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Pair");
  await clickHighlight("Place");
  await expect(details().getByLabel("Matched text")).toHaveText("London");
  await expect(details()).toContainText("Language model");
  await expect(details()).toContainText("no linked ontology entry");
  await menu("view.details");
  await expect(details().getByLabel("Matched text")).toHaveText("London");
  await expect(detailsTab()).toHaveCount(1);
  await expect(
    details().getByRole("table", { name: "Entity statements" }),
  ).toHaveCount(0);
  await details().getByRole("button", { name: /Back/, exact: false }).click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Pair");
  await clickHighlight("Place");
  await expect(details().getByLabel("Matched text")).toHaveText("London");
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "Dog",
  );
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await page.evaluate(() => window.axiom.request("select", { iri: null }));
  await expect(details()).toContainText("Select a node or edge");
  await enter("London");
  await expect(chip("Place")).toBeVisible();
  await expect(
    panel().getByRole("button", { name: "View in Graph", exact: true }),
  ).toBeDisabled();
});

test("shared canonical names offer their actual ontology entries in the existing Details tab", async () => {
  await page.evaluate(async (base) => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text:
        source.text +
        `\n<https://other.example/#Dog> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Other Dog" .`,
    });
  }, base);
  await enter("canine");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await clickHighlight("dog");
  await expect(details()).toContainText("shared by 2 ontology entries");
  await expect(
    details().getByRole("button", { name: "Open Dog", exact: true }),
  ).toBeVisible();
  await details()
    .getByRole("button", { name: "Open Other Dog", exact: true })
    .click();
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    "https://other.example/#Dog",
  );
  await expect(detailsTab()).toHaveCount(1);
  await expect(
    entitiesPane().getByRole("tab", { name: "Details", exact: true }),
  ).toHaveCount(0);
});

test("text entity clicks reuse a detached Details view", async () => {
  await enter("canine and Cat");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await chip("dog").click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await menu("view.details");
  const popup = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popup;
  detached.on("pageerror", (error) => errors.push(error.message));
  await expect(detailsTab(detached)).toBeVisible();
  const recovery = detached.getByRole("button", {
    name: "Maximize pane",
    exact: true,
  });
  if (await recovery.isVisible()) await recovery.click();
  await expect(details(detached)).toHaveAttribute(
    "data-entity-iri",
    base + "Dog",
  );
  await clickHighlight("cat");
  await expect(details(detached)).toHaveAttribute(
    "data-entity-iri",
    base + "Cat",
  );
  await expect(detailsTab(detached)).toHaveCount(1);
  await expect(detailsTab()).toHaveCount(0);
  await expect(
    entitiesPane().getByRole("tab", { name: "Details", exact: true }),
  ).toHaveCount(0);
  await menu("pane.reattach");
  await menu("view.details");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Cat");
});

test("View in Graph opens unique matches and every parent path in a new graph and preserves the old graph", async () => {
  await enter("canine and canine, big cat and alpha blah beta");
  await expect(chip("pair")).toBeVisible({ timeout: 20000 });
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await panel()
    .getByRole("button", { name: "View in Graph", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .activeGraphId,
    )
    .not.toBe(before.activeGraphId);
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(Object.keys(after.graphs!)).toHaveLength(
    Object.keys(before.graphs!).length + 1,
  );
  expect(new Set(after.graph.nodes.map((node) => node.iri))).toEqual(
    new Set(
      ["Dog", "Lion", "Pair", "Animal", "Pet", "Mammal", "Life"].map(
        (name) => base + name,
      ),
    ),
  );
  expect(after.graph.nodes).toHaveLength(7);
  expect(
    after.graph.edges.filter((edge) => edge.predicate.endsWith("#subClassOf")),
  ).toHaveLength(7);
  expect(
    after.graphs![before.activeGraphId!].nodes.map((node) => node.iri),
  ).toEqual(before.graph.nodes.map((node) => node.iri));
  await expect(
    page.locator(`[data-graph-id="${after.activeGraphId}"]`),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/testing/text-analysis-span-graph.png",
  });
});

test("stale graph requests leave existing graphs unchanged", async () => {
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  for (const [datasetEpoch, version] of [
    [before.datasetEpoch - 1, before.version],
    [before.datasetEpoch, before.version - 1],
  ]) {
    const error = await page.evaluate(
      async ({ iris, datasetEpoch, version }) => {
        try {
          await window.axiom.request("graphCreate", {
            textAnalysis: iris,
            datasetEpoch,
            version,
          });
          return "unexpected success";
        } catch (error) {
          return (error as Error).message;
        }
      },
      { iris: [base + "Dog"], datasetEpoch, version },
    );
    expect(error).toContain("ontology changed");
  }
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(after.activeGraphId).toBe(before.activeGraphId);
  expect(Object.keys(after.graphs!)).toEqual(Object.keys(before.graphs!));
});

test("gapped matches open the canonical entity and Details follows ontology updates", async () => {
  await enter("alpha blah beta");
  await expect(chip("pair")).toBeVisible({ timeout: 20000 });
  await clickHighlight("pair");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Pair");
  await page.evaluate(async (base) => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text:
        source.text +
        `\n<${base}Pair> <http://www.w3.org/2000/01/rdf-schema#comment> "Updated span description" .`,
    });
  }, base);
  await expect(
    details().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("Updated span description");
  await enter("canine plainword");
  await expect(chip("dog")).toBeVisible();
  await panel()
    .locator(".view-lines span")
    .filter({ hasText: "plainword" })
    .last()
    .click();
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .selected,
  ).toBe(base + "Pair");
  await expect(
    entitiesPane().getByRole("tab", { name: "Details", exact: true }),
  ).toHaveCount(0);
});

test("long pasted text retains every match as its beginning and end change", async () => {
  const text = "Dog and a big cat. Cat lives in London.\n".repeat(80);
  await enter(text);
  for (const label of ["dog", "lion", "cat"])
    await expect(chip(label).locator("b")).toHaveText("80", { timeout: 20000 });
  await expect(chip("Place")).toBeVisible();
  await enter("canine " + text + " big cat");
  await expect(chip("dog").locator("b")).toHaveText("81");
  await expect(chip("lion").locator("b")).toHaveText("81");
  await expect(chip("cat").locator("b")).toHaveText("80");
  await expect(panel().getByRole("alert")).toHaveCount(0);
  await expect(
    panel().getByRole("button", { name: "View in Graph", exact: true }),
  ).toBeEnabled();
});

test("Text Entities opens alongside the editor and docks, resizes, closes and restores independently", async () => {
  await expect(entitiesPane()).toBeVisible();
  await enter("canine and Cat");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  const className = (await chip("dog").getAttribute("class"))!.match(
    /text-entity-\d+/,
  )![0];
  expect(
    await entitiesPane().evaluate(
      (el) => !!el.closest('[data-panel="textanalysis"]'),
    ),
  ).toBe(false);
  await menu("view.textentities");
  await menu("pane.move.right");
  const before = (await entitiesPane().boundingBox())!;
  await menu("pane.wider");
  await expect
    .poll(async () => (await entitiesPane().boundingBox())!.width)
    .toBeGreaterThan(before.width + 5);
  await menu("pane.close");
  await expect(entitiesPane()).toHaveCount(0);
  await expect(editor()).toBeVisible();
  await expect(panel().locator(`.view-lines .${className}`)).toBeVisible();
  await panel().locator(`.view-lines .${className}`).click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(entitiesPane()).toHaveCount(0);
  await menu("view.details");
  await menu("pane.close");
  await menu("view.textanalysis");
  await menu("view.textentities");
  await menu("pane.close");
  await app.close();
  await launch();
  await expect(editor()).toBeVisible();
  await expect(entitiesPane()).toHaveCount(0);
  await panel()
    .getByRole("button", { name: "View Entities", exact: true })
    .click();
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await expect.poll(() => highlighted("dog")).toBe("canine");
});

async function selectForCreation(text: string) {
  await enter(text);
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+End");
  await expect(
    panel().getByRole("button", { name: "Add selected text", exact: true }),
  ).toBeEnabled();
  await panel()
    .getByRole("button", { name: "Add selected text", exact: true })
    .click();
  return entitiesPane().getByRole("region", {
    name: "Add entity",
    exact: true,
  });
}

test("a selected phrase becomes a class under Systems and immediately gains its own highlight", async () => {
  const phrase = "Electronic Surveillance Systems";
  const form = await selectForCreation(phrase);
  await expect(
    form.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue(phrase);
  await expect(
    form.getByRole("button", { name: "Systems", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeInViewport();
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("A course in electronic surveillance systems.");
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode(true)
        .include('[aria-label="Add entity"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "artifacts/testing/text-analysis-add-entity.png",
  });
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(entitiesPane()).toContainText(
    "Added Electronic Surveillance Systems under Systems.",
  );
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const added = after.entities.find((entity) => entity.label === phrase)!;
  expect(added.parents).toEqual([base + "Systems"]);
  expect(added.comment).toBe("A course in electronic surveillance systems.");
  const canonical = added.iri
    .slice(added.iri.lastIndexOf("#") + 1)
    .toLowerCase();
  await expect(chip(canonical)).toBeVisible({ timeout: 20000 });
  await expect.poll(() => highlighted(canonical)).toBe(phrase);
  const source = await page.evaluate(() =>
    window.axiom.request<{ text: string }>("sourceDocument", {
      format: "turtle",
    }),
  );
  expect(source.text).toContain(phrase);
  await page.evaluate(() => window.axiom.request("undo"));
  await expect(chip("systems")).toBeVisible({ timeout: 20000 });
  expect(
    (
      await page.evaluate(() => window.axiom.request<Snapshot>("state"))
    ).entities.some((entity) => entity.iri === added.iri),
  ).toBe(false);
  await page.evaluate(() => window.axiom.request("redo"));
  await expect(chip(canonical)).toBeVisible({ timeout: 20000 });
  await selectForCreation(phrase);
  await expect(form).toContainText("already names an existing class");
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeDisabled();
  await form
    .getByRole("button", {
      name: /^Open Electronic Surveillance Systems in Taxonomy$/,
    })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Hierarchy panel" })
      .locator(`[data-entity-iri="${added.iri}"]`),
  ).toHaveAttribute("aria-selected", "true");
});

test("parent choices can be changed and cancelling a selected phrase leaves the ontology unchanged", async () => {
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const form = await selectForCreation("Advanced Systems");
  const parent = form.getByRole("combobox", { name: "Add existing parent" });
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await parent.fill("Animal");
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeDisabled();
  await page.getByRole("option").filter({ hasText: "Animal" }).first().click();
  await expect(
    form.getByRole("button", { name: "Remove parent Animal", exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeEnabled();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(after.version).toBe(before.version);
  expect(after.classCount).toBe(before.classCount);
  await expect(chip("systems")).toBeVisible({ timeout: 20000 });
});

test("suggested parents are independently selected and all are asserted", async () => {
  const form = await selectForCreation("Computer Software Applications");
  const computing = form.getByRole("button", {
    name: "Computing",
    exact: true,
  });
  const software = form.getByRole("button", { name: "Software", exact: true });
  await expect(computing).toHaveAttribute("aria-pressed", "true");
  await software.click();
  await expect(computing).toHaveAttribute("aria-pressed", "true");
  await expect(software).toHaveAttribute("aria-pressed", "true");
  await software.click();
  await expect(computing).toHaveAttribute("aria-pressed", "true");
  await expect(software).toHaveAttribute("aria-pressed", "false");
  await software.click();
  await form
    .getByRole("combobox", { name: "Add existing parent" })
    .fill("Systems");
  await page.getByRole("option").filter({ hasText: "Systems" }).first().click();
  await form
    .getByRole("button", { name: "Remove parent Systems", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/testing/text-parents-multiple.png",
  });
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(form).toHaveCount(0);
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const added = after.entities.find(
    (entity) => entity.label === "Computer Software Applications",
  )!;
  expect(added.parents.sort()).toEqual(
    [base + "Computing", base + "Software"].sort(),
  );
  const source = await page.evaluate(() =>
    window.axiom.request<{ text: string }>("sourceDocument", {
      format: "turtle",
    }),
  );
  expect(source.text).toContain("Computer Software Applications");
  await page.evaluate(() => window.axiom.request("undo"));
  expect(
    (
      await page.evaluate(() => window.axiom.request<Snapshot>("state"))
    ).entities.some((e) => e.iri === added.iri),
  ).toBe(false);
  await page.evaluate(() => window.axiom.request("redo"));
  expect(
    (
      await page.evaluate(() => window.axiom.request<Snapshot>("state"))
    ).entities
      .find((e) => e.iri === added.iri)
      ?.parents.sort(),
  ).toEqual(added.parents.sort());
});

test("new parents can have multiple parents and new grandparents, saved with one undo", async () => {
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const form = await selectForCreation("Advanced Computing Applications");
  await expect(
    form.getByRole("button", { name: "Computing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await form
    .getByRole("combobox", { name: "Add existing parent" })
    .fill("Applied Systems");
  await form
    .getByRole("button", { name: "Create new parent", exact: true })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Applied Systems");
  await expect(
    form.getByRole("button", { name: "Systems", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("New parent description");
  await form
    .getByRole("button", { name: "Create new parent", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("Applied Technology");
  await expect(
    form.getByRole("button", { name: "Use new parent", exact: true }),
  ).toBeEnabled();
  await expect(form).toContainText("under Thing");
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .version,
  ).toBe(before.version);
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode(true)
        .include('[aria-label="Add entity"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "artifacts/testing/text-parents-grandparent.png",
  });
  await form
    .getByRole("button", { name: "Use new parent", exact: true })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Applied Systems");
  await expect(
    form.getByRole("button", {
      name: "Remove parent Applied Technology",
      exact: true,
    }),
  ).toBeVisible();
  await form
    .getByRole("button", {
      name: "Edit parent Applied Technology",
      exact: true,
    })
    .click();
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("New grandparent description");
  await form
    .getByRole("button", { name: "Use new parent", exact: true })
    .click();
  await form
    .getByRole("button", { name: "Use new parent", exact: true })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Advanced Computing Applications");
  await expect(
    form.getByRole("button", { name: "Remove parent Computing", exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("button", {
      name: "Remove parent Applied Systems",
      exact: true,
    }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(form).toHaveCount(0);
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const find = (label: string) =>
    after.entities.find((e) => e.label === label)!;
  const child = find("Advanced Computing Applications"),
    parent = find("Applied Systems"),
    grandparent = find("Applied Technology");
  expect(after.version).toBe(before.version + 1);
  expect(child.parents.sort()).toEqual([base + "Computing", parent.iri].sort());
  expect(parent.parents.sort()).toEqual(
    [base + "Systems", grandparent.iri].sort(),
  );
  expect(grandparent.parents).toEqual(["http://www.w3.org/2002/07/owl#Thing"]);
  expect(parent.comment).toBe("New parent description");
  expect(grandparent.comment).toBe("New grandparent description");
  const canonical = child.iri
    .slice(child.iri.lastIndexOf("#") + 1)
    .toLowerCase();
  await expect(chip(canonical)).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => window.axiom.request("undo"));
  const undone = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  for (const item of [child, parent, grandparent])
    expect(undone.entities.some((e) => e.iri === item.iri)).toBe(false);
  await page.evaluate(() => window.axiom.request("redo"));
  const redone = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  for (const item of [child, parent, grandparent])
    expect(
      redone.entities.find((e) => e.iri === item.iri)?.parents.sort(),
    ).toEqual(item.parents.sort());
});

test("parent drafts can be cancelled, and existing names can be reused without duplicates", async () => {
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const form = await selectForCreation("New topic");
  await form
    .getByRole("button", { name: "Create new parent", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("NEW TOPIC");
  await expect(form.getByRole("alert")).toContainText("own ancestor");
  await expect(
    form.getByRole("button", { name: "Use new parent", exact: true }),
  ).toBeDisabled();
  await form
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("Systems");
  await form
    .getByRole("button", { name: "Use Systems as parent", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: "Create new parent", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("Temporary category");
  await form
    .getByRole("button", { name: "Use new parent", exact: true })
    .click();
  await form
    .getByRole("button", {
      name: "Edit parent Temporary category",
      exact: true,
    })
    .click();
  await form
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("Systems");
  await form
    .getByRole("button", { name: "Use Systems as parent", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toHaveCount(1);
  await form
    .getByRole("button", { name: "Create new parent", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("Unwanted parent");
  await form
    .getByRole("button", { name: "Create new parent", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("Unwanted grandparent");
  await form
    .getByRole("button", { name: "Use new parent", exact: true })
    .click();
  await form
    .getByRole("button", { name: "Cancel parent", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await expect(form).not.toContainText("Unwanted parent");
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(after.version).toBe(before.version);
  expect(after.classCount).toBe(before.classCount);
});

test("stale and duplicate text creation requests cannot mutate the ontology", async () => {
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  for (const change of [
    { version: before.version - 1 },
    { datasetEpoch: before.datasetEpoch - 1 },
    { label: "canine" },
    {
      version: before.version - 1,
      creation: {
        label: "New topic",
        comment: "",
        parents: [
          {
            create: {
              label: "New parent",
              comment: "",
              parents: [{ iri: base + "Systems" }],
            },
          },
        ],
      },
    },
    {
      creation: {
        label: "New topic",
        comment: "",
        parents: [
          {
            create: {
              label: "New parent",
              comment: "",
              parents: [{ iri: base + "missing" }],
            },
          },
        ],
      },
    },
  ]) {
    const message = await page.evaluate(
      async (args) => {
        try {
          await window.axiom.request("textAnalysisCreate", args);
          return "unexpected success";
        } catch (error) {
          return (error as Error).message;
        }
      },
      {
        label: "New Systems",
        parent: base + "Systems",
        version: before.version,
        datasetEpoch: before.datasetEpoch,
        ...change,
      },
    );
    expect(message).toMatch(/ontology changed|existing class|superclass/);
  }
  const after = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(after.version).toBe(before.version);
  expect(after.classCount).toBe(before.classCount);
});

test("selected text opens the add pane from Alt+Enter and the editor context menu", async () => {
  await enter("Electronic Surveillance Systems");
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+End");
  await page.keyboard.press("Alt+Enter");
  const form = entitiesPane().getByRole("region", {
    name: "Add entity",
    exact: true,
  });
  await expect(
    form.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Electronic Surveillance Systems");
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await editor().focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", {
      name: "Add selected text to taxonomy",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(form).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Electronic Surveillance Systems");
});

test("the entity summary survives closing the editor and reopening either view", async () => {
  await enter("canine");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await editor().focus();
  await menu("pane.close");
  await expect(panel()).toHaveCount(0);
  await expect(chip("dog")).toBeVisible();
  await chip("dog").click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await menu("view.textanalysis");
  await expect(editor()).toBeVisible();
  await expect(editor()).toBeFocused();
  await editor().focus();
  await menu("pane.close");
  await entitiesPane()
    .getByRole("tab", { name: "Summary", exact: true })
    .click();
  await app.close();
  await launch();
  await expect(panel()).toHaveCount(0);
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await entitiesPane()
    .getByRole("button", { name: "View Text", exact: true })
    .click();
  await expect(editor()).toBeVisible();
  await expect.poll(() => highlighted("dog")).toBe("canine");
});

test("a detached Text Entities view stays synchronized and can add a selected class", async () => {
  await enter("canine");
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  const originalForm = await selectForCreation("Draft Systems");
  await originalForm
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Retain this description when docking changes.");
  await originalForm
    .getByRole("button", { name: "Create new parent", exact: true })
    .click();
  await originalForm
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill("Draft parent");
  await originalForm
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Nested description survives docking.");
  await menu("view.textentities");
  const popup = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popup;
  detached.on("pageerror", (error) => errors.push(error.message));
  await expect(
    detached.getByRole("tabpanel", { name: "Text Entities", exact: true }),
  ).toBeVisible();
  const recovery = detached.getByRole("button", {
    name: "Maximize pane",
    exact: true,
  });
  if (await recovery.isVisible()) await recovery.click();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("popout"))
      ?.setSize(600, 800);
  });
  await expect(entitiesPane(detached)).toBeVisible();
  const retained = entitiesPane(detached).getByRole("region", {
    name: "Add entity",
    exact: true,
  });
  await expect(
    retained.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Draft parent");
  await expect(
    retained.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Nested description survives docking.");
  await retained
    .getByRole("button", { name: "Cancel parent", exact: true })
    .click();
  await expect(
    retained.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Draft Systems");
  await expect(
    retained.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Retain this description when docking changes.");
  await retained.getByRole("button", { name: "Cancel", exact: true }).click();
  await enter("Electronic Surveillance Systems");
  await expect(
    entitiesPane(detached)
      .locator(".text-analysis-chip")
      .filter({ hasText: "systems" }),
  ).toBeVisible({ timeout: 20000 });
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+End");
  await panel()
    .getByRole("button", { name: "Add selected text", exact: true })
    .click();
  const form = entitiesPane(detached).getByRole("region", {
    name: "Add entity",
    exact: true,
  });
  await expect(
    form.getByRole("textbox", { name: "Class name", exact: true }),
  ).toHaveValue("Electronic Surveillance Systems");
  await expect(
    form.getByRole("button", { name: "Remove parent Systems", exact: true }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(entitiesPane(detached)).toContainText(
    "Added Electronic Surveillance Systems under Systems.",
  );
  await expect
    .poll(async () =>
      (
        await page.evaluate(() => window.axiom.request<Snapshot>("state"))
      ).entities.some((e) => e.label === "Electronic Surveillance Systems"),
    )
    .toBe(true);
  await menu("theme.dark");
  expect(
    (
      await new AxeBuilder({ page: detached })
        .setLegacyMode(true)
        .include('[data-panel="textentities"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await detached.screenshot({
    path: "artifacts/testing/text-entities-detached.png",
  });
  await menu("pane.reattach");
  await expect(entitiesPane()).toBeVisible();
  await expect(entitiesPane()).toContainText(
    "Added Electronic Surveillance Systems under Systems.",
  );
});
