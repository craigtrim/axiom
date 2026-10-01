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
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
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
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
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
  const prior = env.PATH ?? env.Path ?? "";
  delete env.Path;
  env.PATH = path.join(profile, "bin") + path.delimiter + prior;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ dialog, BrowserWindow }, file) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      BrowserWindow.getAllWindows()[0].setFocusable(false);
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
  const mockDir = path.join(profile, "bin/node_modules/@openai/codex/bin");
  await mkdir(mockDir, { recursive: true });
  await writeFile(
    path.join(mockDir, "codex.js"),
    `const fs=require("fs");let p="";if(process.argv.includes("--version")){console.log("fixture-cli 1.0");process.exit(0);}process.stdin.on("data",d=>p+=d);process.stdin.on("end",()=>{
    fs.writeFileSync(require("path").join(process.env.AXIOM_USER_DATA,"parent-prompt.txt"),p);
    const rows=p.split("\\n").filter(l=>l.startsWith('["c')).map(l=>JSON.parse(l));
    const result={suggestions:rows.filter(r=>r[1]==="Computing").map(r=>({value:r[0],reason:"Digital workplace tools belong within computing."}))};
    setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],JSON.stringify(result)),2500);
  });`,
  );
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
  // Keep the editor above AdaptivePane's recovery width after the Pizza layout loads.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1800, 1100),
  );
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

test("a seeAlso synonym added beside an empty Details row matches immediately, case-insensitively and after restart", async () => {
  await page.evaluate(async () => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text:
        source.text +
        '\n<https://example.org/text#Phlebotomy> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Phlebotomy"; <http://www.w3.org/2000/01/rdf-schema#seeAlso> "" .',
    });
    await window.axiom.request("select", {
      iri: "https://example.org/text#Phlebotomy",
    });
  });
  await enter("Principles & Practice of Phleb");
  await expect(chip("phlebotomy")).toHaveCount(0);
  await menu("view.details");
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "Phlebotomy",
  );
  await details().getByRole("button", { name: "Add row", exact: true }).click();
  const synonym = details()
    .locator(
      'tr[data-predicate="http://www.w3.org/2000/01/rdf-schema#seeAlso"]',
    )
    .getByRole("combobox", { name: /Value/ });
  await synonym.fill("phleb");
  await synonym.press("Tab");
  await expect(chip("phlebotomy")).toBeVisible({ timeout: 20000 });
  await expect(details().locator('tr[data-predicate=""]')).toHaveCount(1);
  await expect(details().locator(".entity-save-status")).toHaveText("Saved");
  const savedSynonyms = () =>
    page.evaluate(async (iri) => {
      const doc = await window.axiom.request<
        import("../../src/shared/editor-state").DocumentData
      >("entityDocument", { iri });
      return doc.statements
        .filter((t) => t.predicate.endsWith("#seeAlso"))
        .map((t) => ({ literal: t.object.literal, value: t.object.value }));
    }, base + "Phlebotomy");
  expect(await savedSynonyms()).toEqual([{ literal: true, value: "phleb" }]);
  await menu("edit.undo");
  await expect(chip("phlebotomy")).toHaveCount(0);
  await expect(synonym).toHaveValue("");
  await menu("edit.redo");
  await expect(chip("phlebotomy")).toBeVisible();
  await expect(synonym).toHaveValue("phleb");
  await enter("phleb Phleb PHLEB");
  await expect(chip("phlebotomy")).toContainText("3");
  await chip("phlebotomy").click();
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "Phlebotomy",
  );
  await menu("file.save");
  await expect(details().locator('tr[data-predicate=""]')).toHaveCount(0);
  await app.close();
  await launch();
  await menu("view.textanalysis");
  await expect(chip("phlebotomy")).toContainText("3", { timeout: 20000 });
  expect(await savedSynonyms()).toEqual([{ literal: true, value: "phleb" }]);
});

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

async function createParent(
  form: import("@playwright/test").Locator,
  label: string,
) {
  await form
    .getByRole("combobox", { name: "Parent classes", exact: true })
    .fill(label);
  await page
    .getByRole("option")
    .filter({ hasText: `Create “${label}” as a new parent` })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue(label);
}
async function chooseParent(
  form: import("@playwright/test").Locator,
  label: string,
) {
  await form
    .getByRole("combobox", { name: "Parent classes", exact: true })
    .fill(label);
  await page.getByRole("option").filter({ hasText: label }).first().click();
  await expect(
    form.getByRole("button", { name: "Remove " + label, exact: true }),
  ).toBeVisible();
}

test("draft parent suggestions call Codex, expose the prompt and require the user's parent selection", async () => {
  const form = await selectForCreation("Digital workplace tools");
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Using technology in the office.");
  await form
    .getByRole("combobox", { name: "Assistant", exact: true })
    .selectOption("codex");
  await form.getByRole("button", { name: "Prompt", exact: true }).click();
  const prompt = await form
    .getByRole("textbox", { name: "Parent prompt" })
    .inputValue();
  expect(prompt).toContain("Using technology in the office.");
  expect(prompt).toContain("Computing");
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await form.getByRole("button", { name: "Suggest", exact: true }).click();
  await expect(
    form.getByRole("button", { name: "Thinking…", exact: true }),
  ).toBeDisabled();
  await expect(
    form.getByRole("textbox", { name: "Description", exact: true }),
  ).toBeEnabled();
  await expect(
    form.getByRole("combobox", { name: "Parent classes", exact: true }),
  ).toBeEnabled();
  await chooseParent(form, "Systems");
  await expect(
    form.getByRole("textbox", { name: "Parent prompt" }),
  ).toHaveValue(prompt);
  await form
    .getByRole("button", { name: "Remove Systems", exact: true })
    .click();
  await expect(
    page.getByRole("listbox", { name: "Parent classes" }),
  ).toContainText("Suggested by Codex");
  await expect(
    form.getByRole("combobox", { name: "Parent classes", exact: true }),
  ).toBeFocused();
  const [run] = await page.evaluate(() => window.axiom.suggestions.history());
  expect(run.provider).toBe("codex");
  expect(run.prompt).toBe(prompt);
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .tripleCount,
  ).toBe(before.tripleCount);
  await expect(
    form.getByRole("button", { name: "Remove Computing", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option").filter({ hasText: "Computing" }).click();
  await expect(
    form.getByRole("button", { name: "Remove Computing", exact: true }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => window.axiom.request<Snapshot>("state"))
        ).entities.find((e) => e.label === "Digital workplace tools")?.parents,
    )
    .toEqual([base + "Computing"]);
});

test("a selected phrase becomes a class under Systems and immediately gains its own highlight", async () => {
  const phrase = "Electronic Surveillance Systems",
    form = await selectForCreation(phrase);
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue(phrase);
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
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
  const added = (
    await page.evaluate(() => window.axiom.request<Snapshot>("state"))
  ).entities.find((e) => e.label === phrase)!;
  expect(added.parents).toEqual([base + "Systems"]);
  expect(added.comment).toBe("A course in electronic surveillance systems.");
  const canonical = added.iri
    .slice(added.iri.lastIndexOf("#") + 1)
    .toLowerCase();
  await expect(chip(canonical)).toBeVisible({ timeout: 20000 });
  await expect.poll(() => highlighted(canonical)).toBe(phrase);
  await page.evaluate(() => window.axiom.request("undo"));
  await expect(entitiesPane().locator(".text-analysis-created")).toHaveCount(0);
  await expect(chip("systems")).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => window.axiom.request("redo"));
  await expect(chip(canonical)).toBeVisible({ timeout: 20000 });
  await selectForCreation(phrase);
  await expect(form).toContainText("already exists in this ontology");
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toHaveCount(0);
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveCount(0);
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
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toBeVisible();
  const input = form.getByRole("combobox", {
    name: "Parent classes",
    exact: true,
  });
  await input.fill("Animal");
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeDisabled();
  await page.getByRole("option").filter({ hasText: "Animal" }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await expect(
    form.getByRole("button", { name: "Remove Animal", exact: true }),
  ).toBeVisible();
  await form
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Revised topic");
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeEnabled();
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .version,
  ).toBe(before.version);
});

test("suggested parents are independently selected and all are asserted", async () => {
  const form = await selectForCreation("Computer Software Applications");
  await expect(
    form.getByRole("button", { name: "Remove Computing", exact: true }),
  ).toBeVisible();
  const input = form.getByRole("combobox", {
    name: "Parent classes",
    exact: true,
  });
  await input.click();
  await expect(
    page.getByRole("listbox", { name: "Parent classes" }),
  ).toContainText("From the phrase");
  await expect(
    page.getByRole("option").filter({ hasText: "Computing" }),
  ).toHaveCount(0);
  await page.getByRole("option").filter({ hasText: "Software" }).click();
  await form
    .getByRole("button", { name: "Remove Software", exact: true })
    .click();
  await chooseParent(form, "Software");
  await chooseParent(form, "Systems");
  await form
    .getByRole("button", { name: "Remove Systems", exact: true })
    .click();
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(form).toHaveCount(0);
  const added = (
    await page.evaluate(() => window.axiom.request<Snapshot>("state"))
  ).entities.find((e) => e.label === "Computer Software Applications")!;
  expect(added.parents.sort()).toEqual(
    [base + "Computing", base + "Software"].sort(),
  );
});

test("new parents can have multiple parents and new grandparents, saved with one undo", async () => {
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const form = await selectForCreation("Advanced Computing Applications");
  await expect(
    form.getByRole("button", { name: "Remove Computing", exact: true }),
  ).toBeVisible();
  await createParent(form, "Applied Systems");
  await expect(form.locator(".text-create-context")).toContainText(
    "Advanced Computing Applications",
  );
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toBeVisible();
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("New parent description");
  await createParent(form, "Applied Technology");
  await expect(
    form.getByRole("button", { name: "Use as parent", exact: true }),
  ).toBeEnabled();
  await expect(form).toContainText("Will be added under Thing");
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .version,
  ).toBe(before.version);
  await form
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await expect(form.locator(".text-parent-chip[data-new]")).toContainText(
    "Applied Technology",
  );
  await form
    .getByRole("button", { name: "Applied Technology", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("New grandparent description");
  await form
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await expect(
    form.getByRole("button", {
      name: "Remove Applied Technology",
      exact: true,
    }),
  ).toHaveCount(1);
  await form
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Advanced Computing Applications");
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
  for (const item of [child, parent, grandparent])
    await expect(
      entitiesPane().locator(".text-analysis-created"),
    ).toContainText("Added " + item.label + " under");
  await page.evaluate(() => window.axiom.request("undo"));
  const undone = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  for (const item of [child, parent, grandparent])
    expect(undone.entities.some((e) => e.iri === item.iri)).toBe(false);
  await expect(entitiesPane().locator(".text-analysis-created")).toHaveCount(0);
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
  await createParent(form, "NEW TOPIC");
  await expect(form.getByRole("alert")).toContainText("own ancestor");
  await expect(
    form.getByRole("button", { name: "Use as parent", exact: true }),
  ).toBeDisabled();
  await form
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Systems");
  await expect(
    form.getByRole("button", { name: "Use as parent", exact: true }),
  ).toHaveCount(0);
  await form
    .getByRole("button", { name: "Use Systems as parent", exact: true })
    .click();
  await createParent(form, "Temporary category");
  await form
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await form
    .getByRole("button", { name: "Temporary category", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Systems");
  await form
    .getByRole("button", { name: "Use Systems as parent", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toHaveCount(1);
  await createParent(form, "Unwanted parent");
  await createParent(form, "Unwanted grandparent");
  await form
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await form
    .locator(".text-create-context")
    .getByRole("button", { name: "New topic", exact: true })
    .click();
  await expect(form).not.toContainText("Unwanted parent");
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .version,
  ).toBe(before.version);
});

test("Add entity handles wrapping keyboard options, empty names and Escape before cancelling the frame", async () => {
  const form = await selectForCreation("New topic");
  const name = form.getByRole("textbox", { name: "Name", exact: true }),
    input = form.getByRole("combobox", { name: "Parent classes", exact: true });
  await name.fill("");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(form).toContainText("A class needs a name.");
  await name.press("Enter");
  await expect(form).toBeVisible();
  await name.fill("New topic");
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeEnabled();
  await input.focus();
  await input.press("Escape");
  await input.press("ArrowDown");
  const list = page.getByRole("listbox", { name: "Parent classes" });
  const options = list.getByRole("option");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.fill("New unmatched parent");
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeDisabled();
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await expect(list).toHaveCount(0);
  await expect(
    form.getByRole("button", { name: "Add class", exact: true }),
  ).toBeEnabled();
  await input.press("Escape");
  await expect(form).toHaveCount(0);
});

test("Add entity preserves source context and its footer at 375px and a short pane", async () => {
  await enter("Introduction to Smoked Pizza today");
  await editor().focus();
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 16; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Alt+Enter");
  const form = entitiesPane().getByRole("region", {
    name: "Add entity",
    exact: true,
  });
  await expect(form.locator(".text-create-context")).toContainText(
    "Introduction to Smoked Pizza today",
  );
  await expect(form.locator("mark")).toHaveText("Smoked Pizza");
  const split = page.getByRole("separator", {
    name: "Resize the text and entity panes. Arrow keys resize.",
    exact: true,
  });
  await split.focus();
  await split.press("Enter");
  await expect(split).toHaveAttribute("aria-valuenow", "52");
  await split.press("ArrowUp");
  await expect(split).toHaveAttribute("aria-valuenow", "55");
  for (let i = 0; i < 20; i++) await split.press("ArrowDown");
  await expect(split).toHaveAttribute("aria-valuenow", "22");
  await split.press("Enter");
  await form.getByRole("textbox", { name: "Name", exact: true }).focus();
  const popup = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popup;
  await expect(entitiesPane(detached)).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("popout"),
    )!;
    win.setFocusable(false);
    win.setMinimumSize(300, 160);
    win.setContentSize(375, 220);
  });
  await expect
    .poll(() =>
      detached.evaluate(
        () =>
          Math.abs(window.innerWidth - 375) <= 1 && window.innerHeight === 220,
      ),
    )
    .toBe(true);
  const small = entitiesPane(detached),
    commit = small.getByRole("button", { name: "Add class", exact: true });
  await expect(commit).toBeInViewport({ ratio: 1 });
  await expect(small.locator(".text-create-context")).toBeInViewport();
  const before = await commit.boundingBox();
  await small.locator(".text-create-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(commit).toBeInViewport({ ratio: 1 });
  expect((await commit.boundingBox())!.y).toBe(before!.y);
  expect(await small.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await detached.screenshot({
    path: "artifacts/testing/text-create-375-short.png",
  });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("popout"))!
      .setContentSize(1100, 600);
  });
  await expect
    .poll(() =>
      detached.evaluate(
        () =>
          Math.abs(window.innerWidth - 1100) <= 1 && window.innerHeight === 600,
      ),
    )
    .toBe(true);
  await small.locator(".text-create-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  const identity = await small.locator(".text-create-identity").boundingBox(),
    parents = await small.locator(".text-create-parents").boundingBox();
  expect(parents!.x).toBeGreaterThan(identity!.x + identity!.width);
  await detached.screenshot({ path: "artifacts/testing/text-create-wide.png" });
  await menu("theme.dark");
  await small
    .getByRole("combobox", { name: "Parent classes", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page: detached })
        .setLegacyMode(true)
        .include('[data-panel="textentities"]')
        .include(".text-parent-listbox")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("Pizza authoring fixture adds Smoked Pizza and its drafted parent together", async () => {
  const fixture = path.join(profile, "pizza-fixture.cjs");
  await build({
    stdin: {
      contents: `import { buildStore } from './src/domain/fixture';
        import { writeRdf } from './src/domain/rdf-io';
        export const turtle = writeRdf(buildStore(0).tbox, 'turtle');`,
      resolveDir: process.cwd(),
    },
    outfile: fixture,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "cjs",
  });
  await writeFile(
    file,
    await (
      await import(pathToFileURL(fixture).href)
    ).turtle,
  );
  await menu("file.open");
  await expect
    .poll(async () =>
      (
        await page.evaluate(() => window.axiom.request<Snapshot>("state"))
      ).entities.some((e) => e.name === "Pizza"),
    )
    .toBe(true);
  const form = await selectForCreation("Smoked Pizza");
  await expect(
    form.getByRole("button", { name: "Remove Pizza", exact: true }),
  ).toBeVisible();
  await createParent(form, "Smoked Food");
  await expect(
    form.getByRole("button", { name: "Remove Food", exact: true }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: "Use as parent", exact: true })
    .click();
  await form.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(form).toHaveCount(0);
  const snapshot = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const root = snapshot.entities.find((e) => e.label === "Smoked Pizza")!,
    parent = snapshot.entities.find((e) => e.label === "Smoked Food")!;
  expect(root.parents).toContain(parent.iri);
  expect(parent.parents).toEqual([
    snapshot.entities.find((e) => e.name === "Food")!.iri,
  ]);
  await expect(entitiesPane().locator(".text-analysis-created")).toContainText(
    "Added Smoked Food under",
  );
  await expect(entitiesPane().locator(".text-analysis-created")).toContainText(
    "Added Smoked Pizza under",
  );
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
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Electronic Surveillance Systems");
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
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
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Electronic Surveillance Systems");
});

test("selected text opens Find from the editor context menu and reuses it with default search options", async () => {
  const find = page.getByRole("region", { name: "Find entities results" });
  const findSelection = async (text: string) => {
    await enter(text);
    await editor().focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Control+Shift+End");
    await panel()
      .locator(".view-line")
      .first()
      .click({
        button: "right",
        position: { x: 45, y: 10 },
      });
    // Monaco enables menu mouse-up handlers after its 100 ms accidental-click guard.
    await page
      .getByRole("menuitem", { name: "Find", exact: true })
      .click({ delay: 150 });
    await expect(find).toBeVisible();
    await expect(
      find.getByRole("searchbox", { name: "Search the ontology" }),
    ).toHaveValue(text.trim());
  };
  await expect(find).toHaveCount(0);
  await findSelection("  renal trauma  ");
  await expect(
    find.getByRole("combobox", { name: "Results per page" }),
  ).toHaveValue("10");
  await find
    .getByRole("combobox", { name: "Results per page" })
    .selectOption("25");
  await expect(find.locator(".find-results tbody tr")).toHaveCount(2);
  await expect(
    find.getByRole("button", { name: "renal trauma", exact: true }),
  ).toBeVisible();
  await expect(find.getByRole("combobox", { name: "Match mode" })).toHaveCount(
    0,
  );
  await find.getByRole("button", { name: "Clear", exact: true }).click();
  await find
    .getByRole("combobox", { name: "Sort results" })
    .selectOption("name-desc");
  await find.getByRole("checkbox", { name: "Classes", exact: true }).uncheck();
  await findSelection("  Dog  ");
  await expect(
    find.getByRole("combobox", { name: "Results per page" }),
  ).toHaveValue("25");
  await expect(find).toHaveCount(1);
  await expect(
    page.getByRole("tab", { name: "Find", exact: true }),
  ).toHaveCount(1);
  await expect(find.locator(".find-results tbody tr")).toHaveCount(1);
  await expect(
    find.getByRole("button", { name: "Dog", exact: true }),
  ).toBeVisible();
  await expect(find.getByRole("combobox", { name: "Match mode" })).toHaveCount(
    0,
  );
  await expect(
    find.getByRole("combobox", { name: "Sort results" }),
  ).toHaveValue("relevance");
  await expect(
    find.getByRole("checkbox", { name: "Classes", exact: true }),
  ).toBeChecked();
  await expect(
    find.getByRole("checkbox", { name: "Names and aliases", exact: true }),
  ).toBeChecked();
  await expect(
    find.getByRole("checkbox", { name: "IRI", exact: true }),
  ).toBeChecked();
  await expect(
    find.getByRole("combobox", { name: "Recent searches" }).locator("option"),
  ).toHaveText(["Recent searches", "Dog", "renal trauma"]);
  await menu("view.textanalysis");
  await editor().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Find", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
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
  await createParent(originalForm, "Draft parent");
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
    retained.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Draft parent");
  await expect(
    retained.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Nested description survives docking.");
  await retained
    .getByRole("button", { name: "Discard parent", exact: true })
    .click();
  await expect(
    retained.getByRole("textbox", { name: "Name", exact: true }),
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
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Electronic Surveillance Systems");
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
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
