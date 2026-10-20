// Issue 85: Details fields use predicate names and per-group value numbers.
import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import AxeBuilder from "@axe-core/playwright";
import {
  holdRequests,
  waitForHeld,
  releaseRequests,
  requestCount,
} from "./held-requests";
import type { Snapshot } from "../../src/shared/protocol";
// craigtrim/axiom#111: disambiguation identifiers use the shared syntax palette.
import { assertCodeBothThemes } from "./syntax-assertions";
const home =
  (process.env.AXIOM_TEST_EXE
    ? path.join(path.dirname(process.env.AXIOM_TEST_EXE), "resources/mutatoc")
    : undefined) ??
  process.env.AXIOM_MUTATOC_HOME ??
  // craigtrim/axiom#40: highlights come from Mutatoc source offsets.
  // craigtrim/axiom#137: the development fallback is the 0.6.0 runtime.
  (existsSync("vendor/mutatoc/mutatoc.exe")
    ? path.resolve("vendor/mutatoc")
    : path.resolve("../mutatos/mutatoc/dist/mutatoc-win-x64-0.6.0"));
test.skip(
  !existsSync(path.join(home, "mutatoc.exe")),
  "Install mutatoc with npm run setup:mutatoc to run native matching desktop tests.",
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
  target.getByRole("region", { name: "Add entity view", exact: true });
const summary = () =>
  page.locator('[data-panel="textanalysis"] .text-analysis-summary');
const chip = (label: string) =>
  summary()
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
async function showText() {
  await menu("view.textanalysis");
  await expect(panel()).toBeVisible();
  const toggle = panel().getByRole("button", {
    name: "Text",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  await expect(editor()).toBeVisible();
}
async function showSummary() {
  await menu("view.textanalysis");
  await expect(panel()).toBeVisible();
  const toggle = panel().getByRole("button", {
    name: "Summary",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  await expect(
    panel().getByRole("region", { name: "Text Analysis summary", exact: true }),
  ).toBeVisible();
}
async function selectSummaryEntity(label: string) {
  await showSummary();
  await expect(chip(label)).toBeVisible();
  await chip(label).click();
}
async function enter(text: string) {
  if (!(await editor().isVisible())) await showText();
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

// craigtrim/axiom#76: the packaged runtime must highlight a comma synonym as one entity.
test("a pasted comma synonym has one complete highlight and opens its own entity", async () => {
  const source = await readFile(
    "tests/fixtures/text-analysis/comma-synonym.ttl",
    "utf8",
  );
  await page.evaluate(async (text) => {
    const document = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", { ...document, text });
  }, source);
  const text = "Culture, Media Studies";
  const clipboardBefore = await app.evaluate(({ clipboard }) =>
    clipboard.readText(),
  );
  try {
    await app.evaluate(
      ({ clipboard }, value) => clipboard.writeText(value),
      text,
    );
    await editor().focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+V");
  } finally {
    await app.evaluate(
      ({ clipboard }, value) => clipboard.writeText(value),
      clipboardBefore,
    );
  }
  await expect(chip("cultureandmediastudies")).toBeAttached();
  await expect(summary().locator(".text-analysis-chip")).toHaveCount(1);
  await expect(panel()).toContainText("1 match");
  await expect.poll(() => highlighted("cultureandmediastudies")).toBe(text);
  await page.screenshot({
    path: "artifacts/testing/text-analysis-comma-synonym.png",
  });
  await selectSummaryEntity("cultureandmediastudies");
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    "https://example.org/comma#CultureAndMediaStudies",
  );
  await enter("Culture");
  await expect(summary()).toContainText(
    "Nothing in this text matches the open ontology.",
  );
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(0);
  await enter("Media Studies");
  await expect(chip("media_studies")).toBeAttached();
  await expect(summary().locator(".text-analysis-chip")).toHaveCount(1);
});

test("typing and pasting highlight original text automatically with accessible colors", async () => {
  expect(
    await panel()
      .getByRole("button", { name: /^Parse$/i })
      .count(),
  ).toBe(0);
  await enter("Dog");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
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
  await expect(chip("lion")).toBeAttached();
  await expect(chip("dog")).toContainText("2");
  await expect(chip("cat")).toBeAttached();
  await expect(chip("Place")).toHaveCount(0);
  const colors = await Promise.all(
    [chip("dog"), chip("cat")].map((c) =>
      c.locator(".sw2").evaluate((e) => getComputedStyle(e).backgroundColor),
    ),
  );
  // #79 intentionally shares six tints across all canonical entities.
  const palette = [
    "rgb(235, 209, 242)",
    "rgb(165, 230, 220)",
    "rgb(197, 219, 250)",
    "rgb(246, 216, 117)",
    "rgb(215, 215, 248)",
    "rgb(177, 231, 183)",
  ];
  for (const color of colors) expect(palette).toContain(color);
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
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  for (const theme of ["light", "dark"]) {
    await menu("theme." + theme);
    await showSummary();
    await expect(chip("dog")).toBeVisible();
    await expect(chip("cat")).toBeVisible();
    await expect(chip("lion")).toBeVisible();
    await page.screenshot({
      path: "artifacts/testing/text-summary-" + theme + ".png",
    });
    expect(
      (
        await new AxeBuilder({ page })
          .setLegacyMode(true)
          .include('[data-panel="textanalysis"]')
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await enter("unmatchedword");
  await expect(summary()).toContainText(
    "Nothing in this text matches the open ontology.",
  );
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(0);
  await enter("");
  await expect(panel().locator(".empty")).toContainText(
    "Type or paste plain text.",
  );
});

test("unsaved ontology edits reparse the same text and text survives restart", async () => {
  await enter("Dog and kitty");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
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
  await expect(chip("cat")).toBeAttached({ timeout: 10000 });
  await app.close();
  await launch();
  await menu("view.textanalysis");
  await expect(chip("cat")).toBeAttached({ timeout: 20000 });
  await expect(chip("dog")).toBeAttached();
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

test("switching ontologies clears old matches and a blank workspace has no inferred annotations", async () => {
  // Keep the editor above AdaptivePane's recovery width after the Pizza layout loads.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1800, 1100),
  );
  await enter("Dog in London");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await menu("file.new");
  await expect(panel()).toHaveCount(0);
  await menu("view.textanalysis");
  await expect(editor()).toBeVisible();
  await expect(summary()).toContainText(
    "Nothing in this text matches the open ontology.",
  );
  await expect(chip("Place")).toHaveCount(0);
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
  await expect(chip("margherita")).toBeAttached({ timeout: 30000 });
});

async function highlighted(label: string) {
  const className = (await chip(label).getAttribute("class"))!.match(
    /text-entity-\d+/,
  )![0];
  return (await panel().locator(`.view-lines .${className}`).allTextContents())
    .join("")
    .replace(/\u00a0/g, " ");
}

// craigtrim/axiom#79: manual typing retains tracked highlights; navigation explicitly refreshes stale results.
const liveSwitch = () =>
  panel().getByRole("switch", {
    name: "Auto, analyze while typing",
    exact: true,
  });
const analyzeNow = () =>
  panel().getByRole("button", { name: "Analyze now", exact: true });
test("#79 manual typing retains gray highlights until explicit analysis and resuming runs immediately", async () => {
  await expect(liveSwitch()).toHaveAttribute("aria-checked", "true");
  await panel().getByRole("button", { name: "Summary", exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(liveSwitch()).toBeFocused();
  expect(
    await liveSwitch().evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe("solid");
  await page.keyboard.press("Space");
  await expect(liveSwitch()).toHaveAttribute("aria-checked", "false");
  expect(
    await liveSwitch()
      .locator(".track")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await expect(panel().locator(".empty")).toContainText("Press Analyze now");
  await enter("canine");
  await analyzeNow().click();
  await expect(panel().locator(".text-analysis-status")).toHaveText("1 match", {
    timeout: 20000,
  });
  await expect(analyzeNow()).toBeDisabled();
  await holdRequests(app, [], "textAnalysis:parse");
  await editor().focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" and Cat", { delay: 100 });
  // Observe beyond the 60 ms debounce to detect any unwanted native request.
  await page.waitForTimeout(250);
  expect(await requestCount(app, "textAnalysis:parse")).toBe(0);
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(1);
  await expect(chip("cat")).toHaveCount(0);
  await expect(panel().locator(".text-analysis-status")).toHaveText(
    "1 match, out of date",
  );
  await page.screenshot({ path: "artifacts/testing/text-analysis-paused.png" });
  await analyzeNow().click();
  await expect(panel().locator(".text-analysis-status")).toHaveText(
    "2 matches",
  );
  expect(await requestCount(app, "textAnalysis:parse")).toBe(1);
  await expect(analyzeNow()).toBeDisabled();
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.insertText("Lion and ");
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(2);
  await liveSwitch().click();
  await expect(chip("lion")).toBeAttached();
  await expect(panel().locator(".text-analysis-status")).toHaveText(
    "3 matches",
  );
  await expect(analyzeNow()).toHaveCount(0);
  expect(await requestCount(app, "textAnalysis:parse")).toBe(2);
  await showSummary();
  await expect(liveSwitch()).toBeVisible();
});

test("#73 ontology edits wait for Analyze now in manual mode", async () => {
  await changeAnalysisSynonym("Cat", "", true);
  await enter("canine and kitty");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await liveSwitch().click();
  await holdRequests(app, [], "textAnalysis:parse");
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "Cat",
  );
  await menu("view.details");
  await expect(
    details().getByRole("button", { name: "More", exact: true }),
  ).toBeFocused();
  const synonym = details().locator(
    'tr[data-predicate="http://www.w3.org/2004/02/skos/core#altLabel"] input',
  );
  await synonym.fill("kitty");
  await synonym.press("Tab");
  await showText();
  await expect(liveSwitch()).toHaveAttribute("aria-checked", "false");
  await expect(analyzeNow()).toBeEnabled();
  expect(await requestCount(app, "textAnalysis:parse")).toBe(0);
  await analyzeNow().click();
  await expect(panel().locator(".text-analysis-status")).toHaveText(
    "2 matches",
  );
  await expect(analyzeNow()).toBeDisabled();
});

for (const initial of ["canine", "zzzx"]) {
  test(`#79 manual View in Graph refreshes the text after ${initial}`, async () => {
    await enter(initial);
    await expect(panel().locator(".text-analysis-status")).toHaveText(
      initial === "canine" ? "1 match" : "0 matches",
      { timeout: 20000 },
    );
    await liveSwitch().click();
    await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
    await enter("Cat");
    const before = await page.evaluate(() =>
      window.axiom.request<Snapshot>("state"),
    );
    const graphButton = panel().getByRole("button", {
      name: "View in Graph",
      exact: true,
    });
    await expect(graphButton).toBeEnabled();
    expect(await requestCount(app, "textAnalysis:parse")).toBe(0);
    await graphButton.click();
    await expect(panel().locator(".toast")).toContainText("Analyzing first.");
    await waitForHeld(app);
    expect(await requestCount(app, "textAnalysis:parse")).toBe(1);
    expect(
      (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
        .activeGraphId,
    ).toBe(before.activeGraphId);
    await releaseRequests(app);
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
    expect(after.graph.nodes.map((node) => node.iri)).toContain(base + "Cat");
    expect(after.graph.nodes.map((node) => node.iri)).not.toContain(
      base + "Dog",
    );
  });
}

test("#73 manual mode captures the last edit on close and waits after restart or reopening", async () => {
  await enter("canine");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await liveSwitch().click();
  await enter("Cat");
  // Close before the deferred text capture; workspace capture must flush it.
  await app.close();
  await launch();
  await showText();
  await expect(liveSwitch()).toHaveAttribute("aria-checked", "false");
  await expect(panel().locator(".view-lines")).toContainText("Cat");
  await expect(chip("cat")).toHaveCount(0);
  await expect(chip("dog")).toHaveCount(0);
  await expect(analyzeNow()).toBeEnabled();
  await holdRequests(app, [], "textAnalysis:parse");
  await analyzeNow().click();
  await expect(panel().locator(".text-analysis-status")).toHaveText("1 match");
  await editor().focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" and Dog");
  await page.waitForTimeout(250);
  expect(await requestCount(app, "textAnalysis:parse")).toBe(1);
  await expect(panel().locator(".text-analysis-status")).toHaveText(
    "1 match, out of date",
  );
  await menu("pane.close");
  await expect(panel()).toHaveCount(0);
  await showText();
  await expect(panel().locator(".view-lines")).toContainText("Cat and Dog");
  await expect(analyzeNow()).toBeEnabled();
  expect(await requestCount(app, "textAnalysis:parse")).toBe(1);
  await analyzeNow().click();
  await expect(panel().locator(".text-analysis-status")).toHaveText(
    "2 matches",
  );
  expect(await requestCount(app, "textAnalysis:parse")).toBe(2);
});

test("#79 manual nonmatch clicks and selection edit text without opening Details", async () => {
  await enter("canine and Cat");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await liveSwitch().click();
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(2);
  await holdRequests(app, [], "textAnalysis:parse");
  await panel()
    .locator(".view-line")
    .first()
    .click({ position: { x: 68, y: 10 } });
  await expect(
    page.getByRole("region", { name: "Details", exact: true }),
  ).toHaveCount(0);
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+ArrowRight");
  await expect(panel().locator(".menu [data-action=add]")).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.keyboard.type("Dog ");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  await expect(panel().locator(".view-lines")).toContainText("Dog and Cat");
  expect(await requestCount(app, "textAnalysis:parse")).toBe(0);
  await showSummary();
  await expect(chip("dog")).toBeVisible();
  await showText();
  await expect(panel().locator(".view-lines")).toContainText("Dog and Cat");
});

test("#79 toolbar roves, overflows in order and retains editing through recovery", async () => {
  await enter("canine and Cat");
  await expect(chip("dog")).toBeAttached();
  const resize = async (width: number, height = 530) => {
    await page.locator(".text-analysis-panel").evaluate(
      (element, size) => {
        const pane = element.closest<HTMLElement>(".adaptive-pane")!;
        Object.assign(pane.style, {
          position: "fixed",
          left: "24px",
          top: "60px",
          width: size.width + "px",
          height: size.height + "px",
          zIndex: "1000",
        });
      },
      { width, height },
    );
  };
  const bar = panel().getByRole("toolbar");
  const more = bar.getByRole("button", { name: "More actions" });
  const stops = () => bar.locator('button[tabindex="0"]:visible');
  await resize(758);
  await liveSwitch().focus();
  await expect(stops()).toHaveCount(1);
  await page.keyboard.press("End");
  await expect(more).toBeFocused();
  await page.keyboard.press("Home");
  await expect(liveSwitch()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(liveSwitch()).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Space");
  await expect(liveSwitch()).toHaveAttribute("aria-checked", "true");
  await resize(418);
  await expect(
    bar.getByRole("button", { name: "View in Graph" }),
  ).toBeVisible();
  await resize(358);
  await expect(bar.getByRole("button", { name: "View in Graph" })).toBeHidden();
  await expect(
    bar.getByRole("button", { name: "Summary", exact: true }),
  ).toBeVisible();
  await resize(278);
  await expect(
    bar.getByRole("button", { name: "Summary", exact: true }),
  ).toBeHidden();
  await more.click();
  await expect(
    panel().getByRole("menuitem", { name: "Add entity" }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("s");
  await expect(summary()).toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await page.keyboard.press("t");
  await expect(editor()).toBeVisible();
  await more.click();
  await page.keyboard.press("h");
  await expect(panel().locator(".sheet")).toBeVisible();
  await resize(378, 270);
  await expect(panel().locator(".sheet")).toHaveCount(0);
  await resize(758);
  await expect(
    bar.getByRole("button", { name: "View in Graph" }),
  ).toBeVisible();
  await editor().focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" retained");
  await resize(218);
  const recovery = page.locator(
    '.adaptive-pane[data-pane-id="textanalysis"] > .pane-recovery',
  );
  await expect(recovery).toContainText(
    "Too little room to edit. The text and its matches are retained.",
  );
  await expect(
    recovery.getByRole("button", { name: "Maximize pane" }),
  ).toBeVisible();
  await resize(758);
  await editor().focus();
  await page.keyboard.press("Control+z");
  await expect(panel().locator(".view-lines")).toHaveText("canine and Cat");
  await more.click();
  await page.keyboard.press("Tab");
  await expect(more).toBeFocused();
  await expect(panel().getByRole("menu")).toBeHidden();
  await more.click();
  await panel().locator(".state").click();
  await expect(panel().getByRole("menu")).toBeHidden();
});

for (const action of ["highlight", "Summary"] as const)
  for (const remains of [true, false]) {
    test(`#79 manual stale ${action} refreshes before Details, match remains ${remains}`, async () => {
      await enter("canine and Cat");
      await expect(chip("dog")).toBeAttached();
      await liveSwitch().click();
      await editor().focus();
      await page.keyboard.press("Control+Home");
      await page.keyboard.insertText("Notes ");
      await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
      // The native parser still runs; control only whether its current result contains this match.
      if (!remains) await changeAnalysisSynonym("Dog", "canine", false);
      if (action === "highlight")
        await panel()
          .locator(".view-lines .ta-match")
          .filter({ hasText: "canine" })
          .click({ modifiers: ["Control"] });
      else {
        await showSummary();
        await chip("dog").click();
      }
      await waitForHeld(app);
      await expect(panel().locator(".text-analysis-status")).toHaveText(
        "Analyzing",
      );
      await expect(panel().locator(".toast")).toContainText(
        "Details opens only if dog still matches.",
      );
      expect(
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .selected,
      ).not.toBe(base + "Dog");
      await releaseRequests(app);
      await expect(panel().locator(".text-analysis-status")).toHaveText(
        remains ? "2 matches" : "1 match",
      );
      if (remains)
        await expect(
          page.getByRole("region", { name: "Details", exact: true }),
        ).toHaveAttribute("data-entity-iri", base + "Dog");
      else
        expect(
          (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
            .selected,
        ).not.toBe(base + "Dog");
    });
  }

test("#73 editing during Analyze now invalidates the reply without scheduling another parse", async () => {
  await liveSwitch().click();
  await enter("Cat");
  await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
  await analyzeNow().click();
  await waitForHeld(app);
  await enter("Lion");
  await releaseRequests(app);
  await expect(panel().locator(".text-analysis-status")).toContainText(
    "out of date",
  );
  await expect(panel().locator(".view-lines")).toContainText("Lion");
  expect(await requestCount(app, "textAnalysis:parse")).toBe(1);
  await analyzeNow().click();
  await expect(panel().locator(".text-analysis-status")).toHaveText("1 match");
  await showSummary();
  await expect(chip("lion")).toBeVisible();
  await expect(chip("cat")).toHaveCount(0);
});

test("#73 native paste and drag selection remain ordinary manual editing", async () => {
  await liveSwitch().click();
  await holdRequests(app, [], "textAnalysis:parse");
  const previous = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await app.evaluate(({ clipboard }) => clipboard.writeText("Dog and Cat"));
    await editor().focus();
    await page.keyboard.press("Control+V");
    await expect(panel().locator(".view-lines")).toContainText("Dog and Cat");
    const box = (await panel().locator(".view-line").first().boundingBox())!;
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 55, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(
      panel().locator(".menu [data-action=add]"),
    ).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Control+C");
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(copied.length).toBeGreaterThan(0);
    expect("Dog and Cat").toContain(copied);
    await expect(
      page.getByRole("region", { name: "Details", exact: true }),
    ).toHaveCount(0);
    expect(await requestCount(app, "textAnalysis:parse")).toBe(0);
  } finally {
    await app.evaluate(
      ({ clipboard }, value) => clipboard.writeText(value),
      previous,
    );
  }
});

test("background analysis retains moved highlights, status and legend until one replacement", async () => {
  await enter("canine");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  const status = panel().locator(".text-analysis-status");
  await expect(status).toHaveText("1 match");
  await expect(status).toHaveAttribute("title", "1 match in animals.ttl");
  await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.insertText("earlier ");
  await waitForHeld(app);
  await expect.poll(() => highlighted("dog")).toBe("canine");
  await expect(status).toHaveText("1 match");
  await expect(
    panel().getByRole("button", { name: "View in Graph", exact: true }),
  ).toBeEnabled();
  await expect(chip("dog")).toBeAttached();
  await expect(
    page.getByText("Analyzing text...", { exact: true }),
  ).toHaveCount(0);
  await editor().focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" and Cat");
  await expect(chip("cat")).toHaveCount(0);
  await expect.poll(() => highlighted("dog")).toBe("canine");
  // Ctrl+click on the moved range must inspect Dog despite its old offsets.
  await panel()
    .locator('.view-lines [class*="text-entity-"]')
    .filter({ hasText: "canine" })
    .click({ modifiers: ["Control"] });
  await expect(status).toHaveText("Analyzing");
  await releaseRequests(app);
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await menu("view.textanalysis");
  await expect(chip("cat")).toBeAttached();
  await expect(status).toHaveText("2 matches");
});

test("View in Graph waits for current text instead of using retained matches", async () => {
  await enter("canine");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
  await enter("Cat");
  await waitForHeld(app);
  const button = panel().getByRole("button", {
    name: "View in Graph",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.evaluate((b) => {
    (b as HTMLButtonElement).click();
    (b as HTMLButtonElement).click();
  });
  expect(
    Object.keys(
      (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
        .graphs!,
    ),
  ).toHaveLength(Object.keys(before.graphs!).length);
  await releaseRequests(app);
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
  expect(after.graph.nodes.map((node) => node.iri)).toContain(base + "Cat");
  expect(after.graph.nodes.map((node) => node.iri)).not.toContain(base + "Dog");
});

async function changeAnalysisSynonym(
  entity: string,
  synonym: string,
  add: boolean,
) {
  await page.evaluate(
    async ({ iri, synonym, add }) => {
      const doc = await window.axiom.request<
        import("../../src/shared/editor-state").DocumentData
      >("entityDocument", { iri });
      const predicate = "http://www.w3.org/2004/02/skos/core#altLabel";
      const statements = doc.statements.filter(
        (t) =>
          !(
            t.predicate === predicate &&
            t.object.literal &&
            t.object.value === synonym
          ),
      );
      if (add)
        statements.push({
          subject: iri,
          predicate,
          object: { literal: true, value: synonym },
        });
      await window.axiom.request("updateEntity", {
        iri,
        original: doc.statements,
        statements,
        datasetEpoch: doc.datasetEpoch,
        version: doc.version,
        preserveSelection: true,
      });
    },
    { iri: base + entity, synonym, add },
  );
}

for (const add of [true, false]) {
  test(`#54 ${add ? "adding" : "removing"} a synonym retains highlights, status and legend until replacement`, async () => {
    await enter(add ? "Dog and kitty" : "canine and Cat");
    await expect(chip("dog")).toBeAttached({ timeout: 20000 });
    const count = add ? "1 match" : "2 matches";
    await expect(panel().locator(".text-analysis-status")).toHaveText(count);
    await panel().evaluate((root) => {
      const read = () => ({
        status: root.querySelector(".text-analysis-status")!.textContent,
        legend: root.querySelector(".text-analysis-legend")!.textContent,
        highlights: [
          ...root.querySelectorAll('.view-lines [class*="text-entity-"]'),
        ].map((el) => el.textContent),
        graphDisabled: root.querySelector<HTMLButtonElement>(
          ".text-analysis-graph",
        )!.disabled,
      });
      const original = JSON.stringify(read());
      const observation = {
        changes: [] as string[],
        observer: new MutationObserver(() => {
          const value = JSON.stringify(read());
          if (value !== original) observation.changes.push(value);
        }),
      };
      observation.observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      (window as any).__analysisRetention = observation;
    });
    await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
    await changeAnalysisSynonym(
      add ? "Cat" : "Dog",
      add ? "kitty" : "canine",
      add,
    );
    await waitForHeld(app);
    await expect.poll(() => highlighted("dog")).toBe(add ? "Dog" : "canine");
    await expect(panel().locator(".text-analysis-status")).toHaveText(count);
    await expect(
      panel().getByRole("button", { name: "View in Graph", exact: true }),
    ).toBeEnabled();
    if (add) await expect(chip("cat")).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const observation = (window as any).__analysisRetention;
        observation.observer.disconnect();
        return observation.changes;
      }),
    ).toEqual([]);
    await releaseRequests(app);
    await expect(panel().locator(".text-analysis-status")).toHaveText(
      add ? "2 matches" : "1 match",
    );
    await expect.poll(() => highlighted("cat")).toBe(add ? "kitty" : "Cat");
    if (add) await expect.poll(() => highlighted("dog")).toBe("Dog");
    else await expect(chip("dog")).toHaveCount(0);
  });
}

for (const action of ["highlight", "Alt+Enter", "Summary"] as const) {
  for (const remains of [true, false]) {
    test(`#54 ${action} waits for a retained match that ${remains ? "survives" : "disappears"}`, async () => {
      await enter("canine and kitty");
      await expect(chip("dog")).toBeAttached({ timeout: 20000 });
      await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
      await changeAnalysisSynonym(
        remains ? "Cat" : "Dog",
        remains ? "kitty" : "canine",
        remains,
      );
      await waitForHeld(app);
      const before = await page.evaluate(() =>
        window.axiom.request<Snapshot>("state"),
      );
      if (action === "highlight") await clickHighlight("dog");
      else if (action === "Summary") await selectSummaryEntity("dog");
      else {
        await editor().focus();
        await page.keyboard.press("Control+Home");
        await page.keyboard.press("Alt+Enter");
      }
      await expect(details()).toHaveCount(0);
      expect(
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .selected,
      ).toBe(before.selected);
      await releaseRequests(app);
      if (remains)
        await expect(details()).toHaveAttribute(
          "data-entity-iri",
          base + "Dog",
        );
      else {
        await expect(chip("dog")).toHaveCount(0);
        await expect(panel().locator(".text-analysis-status")).toHaveText(
          "0 matches",
        );
        await expect(details()).toHaveCount(0);
        expect(
          (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
            .selected,
        ).toBe(before.selected);
      }
    });
  }
}

for (const remains of [true, false]) {
  test(`#54 View in Graph waits for ontology edits${remains ? " and uses fresh matches" : " and cancels when no matches remain"}`, async () => {
    await enter("canine and kitty");
    await expect(chip("dog")).toBeAttached({ timeout: 20000 });
    await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
    await changeAnalysisSynonym(
      remains ? "Cat" : "Dog",
      remains ? "kitty" : "canine",
      remains,
    );
    await waitForHeld(app);
    const before = await page.evaluate(() =>
      window.axiom.request<Snapshot>("state"),
    );
    await panel()
      .getByRole("button", { name: "View in Graph", exact: true })
      .click();
    expect(
      Object.keys(
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .graphs!,
      ),
    ).toHaveLength(Object.keys(before.graphs!).length);
    await releaseRequests(app);
    if (remains) {
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
      expect(after.graph.nodes.map((node) => node.iri)).toEqual(
        expect.arrayContaining([base + "Dog", base + "Cat"]),
      );
      expect(Object.keys(after.graphs!)).toHaveLength(
        Object.keys(before.graphs!).length + 1,
      );
    } else {
      await expect(panel().locator(".text-analysis-status")).toHaveText(
        "0 matches",
      );
      await expect(
        panel().getByRole("button", { name: "View in Graph", exact: true }),
      ).toBeEnabled();
      expect(
        Object.keys(
          (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
            .graphs!,
        ),
      ).toHaveLength(Object.keys(before.graphs!).length);
    }
  });
}

test("#54 Undo and Redo retain the last settled display through superseded ontology analyses", async () => {
  await enter("Dog and kitty");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
  await changeAnalysisSynonym("Cat", "kitty", true);
  await waitForHeld(app);
  await editor().blur();
  await menu("edit.undo");
  await menu("edit.redo");
  await expect.poll(() => highlighted("dog")).toBe("Dog");
  await expect(panel().locator(".text-analysis-status")).toHaveText("1 match");
  await expect(chip("cat")).toHaveCount(0);
  await releaseRequests(app);
  await expect(chip("cat")).toBeAttached();
  await expect(panel().locator(".text-analysis-status")).toHaveText(
    "2 matches",
  );
});

test("editing again cancels a queued graph action and deleted highlights cannot select old concepts", async () => {
  await enter("canine");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await holdRequests(app, ["textAnalysis:parse"], "textAnalysis:parse");
  await enter("Cat");
  await waitForHeld(app);
  await selectSummaryEntity("dog");
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .selected,
  ).toBe(before.selected);
  await panel()
    .getByRole("button", { name: "View in Graph", exact: true })
    .click();
  await enter("Lion");
  await releaseRequests(app);
  await expect(chip("lion")).toBeAttached();
  await expect(
    panel().getByRole("button", { name: "View in Graph", exact: true }),
  ).toBeEnabled();
  expect(
    Object.keys(
      (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
        .graphs!,
    ),
  ).toHaveLength(Object.keys(before.graphs!).length);
});

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
  await details()
    .getByRole("button", { name: "+ Add row", exact: true })
    .click();
  const synonym = details()
    .locator(
      'tr[data-predicate="http://www.w3.org/2000/01/rdf-schema#seeAlso"]',
    )
    .getByRole("combobox", { name: / value \d+$/ });
  await synonym.fill("phleb");
  await synonym.press("Tab");
  await expect(chip("phlebotomy")).toBeAttached({ timeout: 20000 });
  await expect(details().locator('tr[data-predicate=""]')).toHaveCount(1);
  await expect(details().locator(".phead .state.clean")).toHaveText("Saved");
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
  await expect(chip("phlebotomy")).toBeAttached();
  await expect(synonym).toHaveValue("phleb");
  await enter("phleb Phleb PHLEB");
  await expect(chip("phlebotomy")).toContainText("3");
  await selectSummaryEntity("phlebotomy");
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
    await expect(chip("course1865")).toBeAttached({ timeout: 30000 });
    await expect
      .poll(() => highlighted("course1865"))
      .toBe(phrase.replace(/\n/g, ""));
    await expect(chip("history")).toHaveCount(0);
  }
  await selectSummaryEntity("course1865");
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "Course1865",
  );
  await enter("U.S. History to 1866");
  await expect(chip("course1865")).toHaveCount(0);
  await expect(chip("history")).toBeAttached();
});

test("punctuated synonyms highlight whole phrases and navigate to their ontology entities", async () => {
  const phrases = [
    "Well/Health/Physical Education",
    "PE:PE",
    "Calc (Honors)",
    "Math Lab [Remedial]",
    "Computer-Aided Manufacturing",
  ];
  await page.evaluate(
    async ({ base, phrases }) => {
      const source = await window.axiom.request<
        import("../../src/shared/source").SourceDocument
      >("sourceDocument", { format: "turtle" });
      await window.axiom.request("applySource", {
        ...source,
        text:
          source.text +
          "\n" +
          phrases
            .map(
              (phrase, index) =>
                `<${base}Punctuated${index}> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Punctuated course ${index}"; <http://www.w3.org/2000/01/rdf-schema#seeAlso> ${JSON.stringify(phrase)} .`,
            )
            .join("\n"),
      });
    },
    { base, phrases },
  );
  for (const [index, phrase] of phrases.entries()) {
    const canonical = `punctuated${index}`;
    const spaced = phrase
      .replace(/[/:()[\]-]/g, " $& ")
      .replace(/\s+/g, " ")
      .trim();
    for (const surface of [phrase, spaced]) {
      await enter(`😀 ${surface} ~~`);
      await expect(chip(canonical)).toBeAttached({ timeout: 30000 });
      await expect.poll(() => highlighted(canonical)).toBe(surface);
      await expect(summary().locator(".text-analysis-chip")).toHaveCount(1);
    }
    await selectSummaryEntity(canonical);
    await expect(details()).toHaveAttribute(
      "data-entity-iri",
      base + `Punctuated${index}`,
    );
  }
  await enter("PE/PE");
  await expect(summary()).toContainText(
    "Nothing in this text matches the open ontology.",
  );
});

test("text ending in an abbreviation or contraction keeps its highlights and curly apostrophes match", async () => {
  await page.evaluate(async (base) => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text:
        source.text +
        `\n<${base}DriversEd> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Driver's Ed" .`,
    });
  }, base);
  for (const text of [
    "😀 Dog and a big cat in the dept.",
    "😀 Dog and a big cat, I can't",
  ]) {
    await enter(text);
    await expect(chip("lion")).toBeAttached({ timeout: 30000 });
    await expect.poll(() => highlighted("dog")).toBe("Dog");
    await expect.poll(() => highlighted("lion")).toBe("big cat");
  }
  await enter("Driver’s Ed starts after the dept.");
  await expect(chip("driversed")).toBeAttached({ timeout: 30000 });
  await expect.poll(() => highlighted("driversed")).toBe("Driver’s Ed");
  await selectSummaryEntity("driversed");
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    base + "DriversEd",
  );
});

test("plus spans highlight intervening words and stop at the reference distance boundary", async () => {
  for (const text of [
    "alpha blah blah beta",
    "beta blah blah alpha",
    "alpha blah blah blah beta",
  ]) {
    await enter(text);
    await expect(chip("pair")).toBeAttached({ timeout: 20000 });
    await expect.poll(() => highlighted("pair")).toBe(text);
  }
  await enter("alpha blah blah blah blah beta");
  await expect(summary()).toContainText(
    "Nothing in this text matches the open ontology.",
  );
  await expect(chip("pair")).toHaveCount(0);
  await expect(
    panel().locator('.view-lines [class*="text-entity-"]'),
  ).toHaveCount(0);

  await enter("alpha blah gamma");
  await expect(summary()).toContainText(
    "Nothing in this text matches the open ontology.",
  );
  await page.evaluate(async () => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text: source.text.replace('"alpha+beta"', '"alpha+gamma"'),
    });
  });
  await expect(chip("pair")).toBeAttached();
  await expect.poll(() => highlighted("pair")).toBe("alpha blah gamma");
});

test("nested plus spans select the complete original text across line breaks and emoji", async () => {
  const span = "kidney injury\nblah acute";
  await enter("😀 " + span + ".");
  await expect(chip("condition")).toBeAttached({ timeout: 20000 });
  await expect(chip("renal_trauma")).toHaveCount(0);
  await expect(chip("acute")).toHaveCount(0);
  await expect
    .poll(() => highlighted("condition"))
    .toBe(span.replace(/\n/g, ""));
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await selectSummaryEntity("condition");
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
  if (!(await editor().isVisible())) await showText();
  const className = (await chip(label).getAttribute("class"))!.match(
    /text-entity-\d+/,
  )![0];
  // #128: opening Details from editable text takes an explicit Ctrl+click.
  await panel()
    .locator(`.view-lines .${className}`)
    .nth(occurrence)
    .click({ modifiers: ["Control"] });
}

for (const auto of [true, false]) {
  test(`#128 plain highlight clicks keep the caret and focus with Auto ${auto ? "on" : "off"}`, async () => {
    await enter("canine and Cat");
    await expect(chip("dog")).toBeAttached();
    const className = (await chip("dog").getAttribute("class"))!.match(
      /text-entity-\d+/,
    )![0];
    if (!auto) await liveSwitch().click();
    await editor().focus();
    await page.keyboard.press("Control+End");
    const highlight = panel().locator(`.view-lines .${className}`).first();
    const point = await highlight.evaluate((element) => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 3);
      range.collapse(true);
      const r = range.getBoundingClientRect();
      return { x: r.left, y: r.top + r.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await expect(editor()).toBeFocused();
    await expect(panel().locator(".ta-caret")).toHaveText("canine");
    await expect(detailsTab()).toHaveCount(0);
    await page.keyboard.insertText("_");
    await expect(panel().locator(".view-lines")).toHaveText("can_ine and Cat");
    await expect(detailsTab()).toHaveCount(0);
  });
}

test("clicking a synonym reuses the editable Details tab for successive entities", async () => {
  await enter("canine and Cat");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await clickHighlight("dog");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(detailsTab()).toHaveCount(1);
  await expect(entitiesPane()).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Span details" })).toHaveCount(
    0,
  );
  await expect(
    details().getByRole("table", { name: "Entity statements" }),
  ).toBeVisible();
  await expect(
    details().getByRole("textbox", {
      name: "rdfs:comment value 1",
      exact: true,
    }),
  ).toHaveValue("A domesticated animal.");
  await expect(
    details().getByRole("button", { name: "View Animal details", exact: true }),
  ).toBeVisible();
  await expect(
    details().getByRole("button", { name: "View Pet details", exact: true }),
  ).toBeVisible();
  await details()
    .getByRole("textbox", { name: "rdfs:comment value 1", exact: true })
    .fill("Edited through the shared Details view.");
  await details()
    .getByRole("textbox", { name: "rdfs:comment value 1", exact: true })
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
  await selectSummaryEntity("dog");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(
    details().getByRole("textbox", {
      name: "rdfs:comment value 1",
      exact: true,
    }),
  ).toHaveValue("Edited through the shared Details view.");
  await menu("view.details");
  await menu("pane.close");
  await expect(detailsTab()).toHaveCount(0);
  await clickHighlight("dog");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(detailsTab()).toHaveCount(1);
});

test("keyboard ontology matches reuse Details and unmatched names have no inferred annotations", async () => {
  await enter("alpha blah beta in London with Dog");
  await expect(chip("pair")).toBeAttached({ timeout: 20000 });
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Alt+Enter");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Pair");
  await expect(chip("Place")).toHaveCount(0);
  await clickHighlight("dog");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await menu("view.details");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await expect(detailsTab()).toHaveCount(1);
  await expect(
    details().getByRole("table", { name: "Entity statements" }),
  ).toBeVisible();
  await details().getByRole("button", { name: /Back/, exact: false }).click();
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Pair");
  await clickHighlight("dog");
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "Dog",
  );
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await page.evaluate(() => window.axiom.request("select", { iri: null }));
  await expect(details()).toContainText("Select a node or edge");
  await enter("London");
  await expect(summary()).toContainText(
    "Nothing in this text matches the open ontology.",
  );
  await expect(chip("Place")).toHaveCount(0);
  await expect(
    panel().getByRole("button", { name: "View in Graph", exact: true }),
  ).toBeEnabled();
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
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await clickHighlight("dog");
  await expect(details()).toContainText("shared by 2 ontology entries");
  await assertCodeBothThemes(details(), ".text-span-choice code");
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
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await selectSummaryEntity("dog");
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
  await expect(chip("pair")).toBeAttached({ timeout: 20000 });
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
  await expect(chip("pair")).toBeAttached({ timeout: 20000 });
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
    details().getByRole("textbox", {
      name: "rdfs:comment value 1",
      exact: true,
    }),
  ).toHaveValue("Updated span description");
  await enter("canine plainword");
  await expect(chip("dog")).toBeAttached();
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
    await expect(chip(label).locator(".n")).toHaveText("80", {
      timeout: 20000,
    });
  await expect(chip("Place")).toHaveCount(0);
  await enter("canine " + text + " big cat");
  await expect(chip("dog").locator(".n")).toHaveText("81");
  await expect(chip("lion").locator(".n")).toHaveText("81");
  await expect(chip("cat").locator(".n")).toHaveText("80");
  await expect(panel().getByRole("alert")).toHaveCount(0);
  await expect(
    panel().getByRole("button", { name: "View in Graph", exact: true }),
  ).toBeEnabled();
});

test("Add entity opens on demand and docks, resizes, closes and restores independently", async () => {
  await expect(entitiesPane()).toHaveCount(0);
  await enter("canine and Cat");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  const className = (await chip("dog").getAttribute("class"))!.match(
    /text-entity-\d+/,
  )![0];
  await menu("view.textentities");
  expect(
    await entitiesPane().evaluate(
      (el) => !!el.closest('[data-panel="textanalysis"]'),
    ),
  ).toBe(false);
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
  await panel()
    .locator(`.view-lines .${className}`)
    .click({ modifiers: ["Control"] });
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
  await panel().getByRole("button", { name: "Summary", exact: true }).click();
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await showText();
  await expect.poll(() => highlighted("dog")).toBe("canine");
});

async function addFromOverflow() {
  await panel()
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await panel().locator(".menu [data-action=add]").click();
}

// craigtrim/axiom#93: nested rows replace the old frame stack and assistant.
// Pending validation, recursive rollback, recovery and restart are exercised in
// add-entity-reference.spec.ts; these cases retain Text Analysis integration.
async function selectForCreation(text: string) {
  await enter(text);
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+End");
  await addFromOverflow();
  const form = entitiesPane();
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toBeVisible();
  return form;
}
async function createParent(
  form: import("@playwright/test").Locator,
  label: string,
) {
  await form
    .getByRole("combobox", { name: "Add a parent", exact: true })
    .fill(label);
  await form
    .getByRole("option", {
      name: new RegExp("^Draft a new parent named " + label),
    })
    .click();
  await expect(
    form.getByRole("combobox", { name: "Parent for " + label, exact: true }),
  ).toBeVisible();
}
test("parent search shares Find normalization and typo ranking without duplicate creation (#47)", async () => {
  await writeFile(
    file,
    turtle + '\n:Abstract_Course a owl:Class; rdfs:label "Abstract_Course" .',
  );
  await menu("file.open");
  await expect
    .poll(async () =>
      (
        await page.evaluate(() => window.axiom.request<Snapshot>("state"))
      ).entities.some((e) => e.iri === base + "Abstract_Course"),
    )
    .toBe(true);
  const form = await selectForCreation("Specialized Seminar"),
    input = form.getByRole("combobox", { name: "Add a parent", exact: true }),
    list = form.getByRole("listbox", { name: "Matching classes" });
  for (const query of [
    "Abstract Course",
    "abstract course",
    "AbstractCourse",
    "abstract-course",
    "Abstract_Course",
    "abstr cour",
    "Abstrct Course",
  ]) {
    await input.fill(query);
    await expect(
      list.getByRole("option").filter({ hasText: "Abstract_Course" }),
    ).toBeVisible();
    if (!["abstr cour", "Abstrct Course"].includes(query))
      await expect(
        list.getByRole("option").filter({ hasText: "Draft a new parent" }),
      ).toHaveCount(0);
  }
  await input.fill("Abstract Course");
  await list.getByRole("option").filter({ hasText: "Abstract_Course" }).click();
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => window.axiom.request<Snapshot>("state"))
        ).entities.find((e) => e.label === "Specialized Seminar")?.parents,
    )
    .toEqual([base + "Abstract_Course"]);
  await menu("edit.undo");
  await expect
    .poll(async () =>
      (
        await page.evaluate(() => window.axiom.request<Snapshot>("state"))
      ).entities.some((e) => e.label === "Specialized Seminar"),
    )
    .toBe(false);
});
test("a selected phrase becomes a class under Systems and immediately gains its own highlight", async () => {
  const form = await selectForCreation("Electronic Surveillance Systems");
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => window.axiom.request<Snapshot>("state"))
        ).entities.find((e) => e.label === "Electronic Surveillance Systems")
          ?.parents,
    )
    .toEqual([base + "Systems"]);
  await showSummary();
  await expect(chip("electronicsurveillancesystems")).toBeVisible({
    timeout: 20000,
  });
  await showText();
  await expect
    .poll(() => highlighted("electronicsurveillancesystems"))
    .toBe("Electronic Surveillance Systems");
});
test("two selected parents are asserted and removing a drafted branch leaves the ontology unchanged", async () => {
  const form = await selectForCreation("Novel Study"),
    before = await page.evaluate(() => window.axiom.request<Snapshot>("state"));
  for (const name of ["Computing", "Software"]) {
    await form
      .getByRole("combobox", { name: "Add a parent", exact: true })
      .fill(name);
    await form.getByRole("option").filter({ hasText: name }).first().click();
  }
  await createParent(form, "Temporary Parent");
  await form
    .getByRole("button", { name: "Remove Temporary Parent", exact: true })
    .click();
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .version,
  ).toBe(before.version);
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await expect
    .poll(async () =>
      (
        await page.evaluate(() => window.axiom.request<Snapshot>("state"))
      ).entities
        .find((e) => e.label === "Novel Study")
        ?.parents?.sort(),
    )
    .toEqual([base + "Computing", base + "Software"]);
});
test("name collisions retain the Name field, caret and editable text", async () => {
  const form = await selectForCreation("Advanced Systems"),
    name = form.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Systems");
  await expect(form.locator(".vmsg")).toContainText("already exists");
  await expect(name).toBeFocused();
  await expect(name).toBeEditable();
  await name.evaluate((el: HTMLInputElement) => {
    (window as any).__addName = el;
    el.setSelectionRange(3, 3);
  });
  await page.keyboard.insertText(" X ");
  await expect(name).toHaveValue("Sys X tems");
  expect(
    await name.evaluate((el: HTMLInputElement) => [
      el === (window as any).__addName,
      el.selectionStart,
    ]),
  ).toEqual([true, 6]);
  await expect(form.locator(".vmsg")).toHaveCount(0);
  await expect(
    form.getByRole("button", { name: "Create", exact: true }),
  ).toBeEnabled();
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

for (const route of ["toolbar", "Alt+Enter", "context menu"] as const) {
  test(`selected-name casing through ${route} preserves source and suggested parent`, async () => {
    const phrase = "PHD SEMINAR IN GIS SYSTEMS";
    await enter(phrase);
    await editor().focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Control+Shift+End");
    if (route === "toolbar") {
      await addFromOverflow();
    } else if (route === "Alt+Enter") {
      await page.keyboard.press("Alt+Enter");
    } else {
      await page.keyboard.press("Shift+F10");
      await expect(
        page.getByRole("menuitem", {
          name: "Add entity",
          exact: true,
        }),
      ).toBeVisible();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
    }
    const form = entitiesPane();
    await expect(
      form.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue("PhD Seminar in GIS Systems");
    await expect(
      form.locator(".fields > .frow").nth(1).locator(".fnote"),
    ).toContainText(phrase);
    await expect(
      form.getByRole("button", { name: "Remove Systems", exact: true }),
    ).toBeVisible();
  });
}

for (const [phrase, seeded] of [
  ["Basic ENGLISH COMPOSITION", "Basic English Composition"],
  ["PERSONAL DIMENSIONS OF EDUCATION", "Personal Dimensions of Education"],
  [
    "Basic ETHICS & SOCIAL RESPONSIBILITY",
    "Basic Ethics & Social Responsibility",
  ],
  ["INTRO TO HIV PREVENTION", "Intro to HIV Prevention"],
  ["PHD SEMINAR IN GIS", "PhD Seminar in GIS"],
  ["CALCULUS II", "Calculus II"],
]) {
  test(`selected-name casing saves ${seeded} while preserving Context`, async () => {
    const form = await selectForCreation(phrase);
    await expect(
      form.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue(seeded);
    await expect(
      form.locator(".fields > .frow").nth(1).locator(".fnote"),
    ).toContainText(phrase);
    await form
      .getByRole("button", { name: /^Create(?: both| all)?$/, exact: true })
      .click();
    await expect(form.locator(".foot")).toContainText(
      "created, and selected in Hierarchy",
    );
    const state = await page.evaluate(() =>
      window.axiom.request<Snapshot>("state"),
    );
    expect(
      state.entities.filter((entity) => entity.label === seeded),
    ).toHaveLength(1);
  });
}

test("selected-name casing preserves edits through parent creation and pane remounts", async () => {
  const phrase = "INTRO TO HIV SYSTEMS";
  const form = await selectForCreation(phrase);
  const name = form.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toHaveValue("Intro to HIV Systems");
  await name.fill("my CUSTOM phd child");
  await createParent(form, "my CUSTOM parent");
  await expect(name).toHaveValue("my CUSTOM phd child");
  await expect(
    form.getByRole("button", { name: "Remove my CUSTOM parent", exact: true }),
  ).toBeVisible();
  await menu("view.textentities");
  await menu("pane.close");
  await expect(entitiesPane()).toHaveCount(0);
  await menu("view.textentities");
  await expect(name).toHaveValue("my CUSTOM phd child");
  await expect(
    form.locator(".fields > .frow").nth(1).locator(".fnote"),
  ).toContainText(phrase);
  await form
    .getByRole("button", { name: /^Create(?: both| all)?$/, exact: true })
    .click();
  await expect(form.locator(".foot")).toContainText(
    "created, and selected in Hierarchy",
  );
  const state = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const child = state.entities.find(
    (entity) => entity.label === "my CUSTOM phd child",
  )!;
  const parent = state.entities.find(
    (entity) => entity.label === "my CUSTOM parent",
  )!;
  expect(child.parents).toContain(parent.iri);
});

test("selected-name casing retains strict duplicate detection after creation", async () => {
  const form = await selectForCreation("ADVANCED SYSTEMS");
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Advanced Systems");
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: /^Create(?: both| all)?$/, exact: true })
    .click();
  await expect(form.locator(".foot")).toContainText(
    "created, and selected in Hierarchy",
  );
  const state = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(
    state.entities.find((entity) => entity.label === "Advanced Systems")!
      .parents,
  ).toEqual([base + "Systems"]);
  await selectForCreation("ADVANCED SYSTEMS");
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Advanced Systems");
  await expect(
    form.locator(".fields > .frow").nth(1).locator(".fnote"),
  ).toContainText("ADVANCED SYSTEMS");
  await expect(form.locator(".validation-band")).toContainText(
    "A class named Advanced Systems already exists.",
  );
  await expect(
    form.getByRole("button", { name: /^Create(?: both| all)?$/, exact: true }),
  ).toBeDisabled();
});

test("selected text opens the add pane from Alt+Enter and the editor context menu", async () => {
  await enter("Electronic Surveillance Systems");
  await editor().focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+Shift+End");
  await page.keyboard.press("Alt+Enter");
  const form = entitiesPane();
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Electronic Surveillance Systems");
  await expect(
    form.getByRole("button", { name: "Remove Systems", exact: true }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await editor().focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", {
      name: "Add entity",
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
  await find.getByRole("button", { name: "More", exact: true }).click();
  await expect(
    find.getByRole("combobox", { name: "Results per page" }),
  ).toHaveValue("50");
  await find
    .getByRole("combobox", { name: "Results per page" })
    .selectOption("25");
  await find
    .getByRole("combobox", { name: "Results per page" })
    .press("Escape");
  await expect(find.locator(".find-results tbody tr")).toHaveCount(2);
  await expect(
    find.getByRole("button", { name: "renal trauma", exact: true }),
  ).toBeVisible();
  await expect(find.getByRole("combobox", { name: "Match mode" })).toHaveCount(
    0,
  );
  await find.getByRole("combobox", { name: "Sort" }).selectOption("name-desc");
  await find.getByRole("button", { name: "More", exact: true }).click();
  await find
    .getByRole("dialog", { name: "More", exact: true })
    .getByRole("button", { name: "Clear", exact: true })
    .click();
  await page.keyboard.press("Escape");
  if (await find.getByRole("button", { name: /^Options:/ }).isVisible())
    await find.getByRole("button", { name: /^Options:/ }).click();
  await find.getByRole("checkbox", { name: "Classes", exact: true }).uncheck();
  if (
    await find
      .getByRole("button", { name: "Close Options", exact: true })
      .isVisible()
  )
    await find
      .getByRole("button", { name: "Close Options", exact: true })
      .click();
  await findSelection("  Dog  ");
  await find.getByRole("button", { name: "More", exact: true }).click();
  await expect(
    find.getByRole("combobox", { name: "Results per page" }),
  ).toHaveValue("25");
  await find
    .getByRole("combobox", { name: "Results per page" })
    .press("Escape");
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
  await expect(find.getByRole("combobox", { name: "Sort" })).toHaveValue(
    "relevance",
  );
  if (await find.getByRole("button", { name: /^Options:/ }).isVisible())
    await find.getByRole("button", { name: /^Options:/ }).click();
  await expect(
    find.getByRole("checkbox", { name: "Classes", exact: true }),
  ).toBeChecked();
  await expect(
    find.getByRole("checkbox", { name: "Names and aliases", exact: true }),
  ).toBeChecked();
  await expect(
    find.getByRole("checkbox", { name: "IRI", exact: true }),
  ).toBeChecked();
  if (
    await find
      .getByRole("button", { name: "Close Options", exact: true })
      .isVisible()
  )
    await find
      .getByRole("button", { name: "Close Options", exact: true })
      .click();
  await find
    .getByRole("button", { name: "Recent searches", exact: true })
    .click();
  const recent = find.getByRole("dialog", {
    name: "Recent searches",
    exact: true,
  });
  await expect(recent.getByRole("button")).toHaveText(["Dog", "renal trauma"]);
  await recent.press("Escape");
  await menu("view.textanalysis");
  await editor().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Find", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("Summary belongs to Text Analysis and survives closing, reopening and restarting", async () => {
  await enter("canine");
  await showSummary();
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await expect(editor()).toHaveCount(0);
  await expect(entitiesPane()).toHaveCount(0);
  await menu("pane.close");
  await expect(panel()).toHaveCount(0);
  await menu("view.textanalysis");
  await expect(chip("dog")).toBeVisible();
  await app.close();
  await launch();
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await selectSummaryEntity("dog");
  await expect(details()).toHaveAttribute("data-entity-iri", base + "Dog");
  await showText();
  await expect.poll(() => highlighted("dog")).toBe("canine");
});

test("a detached Add entity view retains nested drafts and creates the hierarchy", async () => {
  const form = await selectForCreation("Draft Systems");
  await form
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Retain this description.");
  await createParent(form, "Draft parent");
  await form
    .getByRole("combobox", { name: "Parent for Draft parent", exact: true })
    .fill("Life");
  await form.getByRole("option").filter({ hasText: "Life" }).first().click();
  await menu("view.textentities");
  const popup = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popup;
  detached.on("pageerror", (e) => errors.push(e.message));
  await expect(detached.locator('[data-pane-id="textentities"]')).toBeVisible();
  await (
    await app.browserWindow(detached)
  ).evaluate((win) => {
    win.setFocusable(false);
    win.unmaximize();
    win.setSize(900, 700);
  });
  await expect(
    detached.locator('[data-pane-id="textentities"]'),
  ).toHaveAttribute("data-pane-recovery", "false");
  const retained = entitiesPane(detached);
  await expect(
    retained.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Draft Systems");
  await expect(
    retained.getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("Retain this description.");
  await expect(
    retained.getByRole("button", { name: "Remove Life", exact: true }),
  ).toBeVisible();
  await retained
    .getByRole("button", { name: "Create both", exact: true })
    .click();
  await expect(retained.locator(".foot")).toContainText(
    "created, and selected in Hierarchy",
  );
  const snapshot = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(
    snapshot.entities.find((e) => e.label === "Draft Systems")?.parents,
  ).toContain(snapshot.entities.find((e) => e.label === "Draft parent")!.iri);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("popout"))!
      .close(),
  );
  await menu("view.textentities");
  await expect(
    entitiesPane().getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Draft Systems");
});

test("Summary toggling preserves the editor model, selection, undo and nested entity drafts", async () => {
  const form = await selectForCreation("Draft Systems");
  await form
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Keep this description");
  await createParent(form, "Draft parent");
  await showSummary();
  await expect(chip("systems")).toBeVisible({ timeout: 20000 });
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Draft Systems");
  await expect(
    form.getByRole("combobox", {
      name: "Parent for Draft parent",
      exact: true,
    }),
  ).toBeVisible();
  await showText();
  await expect(
    form.getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("Keep this description");
  await editor().focus();
  await page.keyboard.insertText("Replacement");
  await expect(panel().locator(".view-lines")).toHaveText("Replacement");
  await expect(
    form.getByRole("combobox", {
      name: "Parent for Draft parent",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+Z");
  await expect(panel().locator(".view-lines")).toHaveText("Draft Systems");
});

test("View Add entity starts a blank standalone form without changing analysis text", async () => {
  await enter("canine");
  await showSummary();
  const before = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await menu("view.textentities");
  const form = entitiesPane();
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("");
  await expect(
    form.getByRole("button", { name: /^Create(?: both| all)?$/, exact: true }),
  ).toBeDisabled();
  await expect(entitiesPane().getByRole("tab")).toHaveCount(0);
  await expect(chip("dog")).toBeVisible({ timeout: 20000 });
  await form
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Uncommitted class");
  await form
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await showText();
  await expect(panel().locator(".view-lines")).toHaveText("canine");
  expect(
    (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
      .version,
  ).toBe(before.version);
});

test("editor right-click letters invoke Find and Add entity with visible unique mnemonics", async () => {
  await enter("Fresh Systems");
  await page.keyboard.press("Control+A");
  await panel()
    .locator(".view-line")
    .first()
    .click({ button: "right", position: { x: 25, y: 10 } });
  const popup = page.locator(".monaco-menu [role=menu]");
  await expect(popup).toBeVisible();
  const items = popup.locator("[data-menu-key]");
  await expect(items).toHaveCount(5);
  expect(
    await items.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-menu-key")),
    ),
  ).toEqual(["T", "C", "F", "P", "A"]);
  await expect(popup.locator("u")).toHaveText(["t", "C", "F", "P", "A"]);
  await page.screenshot({
    path: "artifacts/testing/text-editor-menu-keys.png",
  });
  await page.keyboard.press("f");
  await expect(popup).toHaveCount(0);
  await expect(
    page.getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("Fresh Systems");
  await showText();
  await editor().focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("a");
  const form = entitiesPane();
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Fresh Systems");
  await form
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await editor().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+F10");
  await expect(popup.locator('[data-menu-key="A"]')).toHaveCount(0);
  await expect(popup.locator('[data-menu-key="F"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(editor()).toBeFocused();
});

test("editor menu copy, cut and paste letters execute native editing commands", async () => {
  const oldClipboard = await app.evaluate(({ clipboard }) =>
    clipboard.readText(),
  );
  try {
    await enter("Original phrase");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Shift+F10");
    await page.keyboard.press("c");
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("Original phrase");
    await editor().focus();
    await page.keyboard.press("Shift+F10");
    await page.keyboard.press("t");
    await expect(panel().locator(".view-lines")).toHaveText("");
    await editor().focus();
    await page.keyboard.press("Shift+F10");
    await page.keyboard.press("p");
    await expect(panel().locator(".view-lines")).toHaveText("Original phrase");
    for (const activation of ["enter", "mouse"]) {
      await editor().focus();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Shift+F10");
      const paste = page.getByRole("menuitem", { name: "Paste", exact: true });
      if (activation === "enter") {
        await paste.focus();
        await page.keyboard.press("Enter");
      } else await paste.click();
      await expect(panel().locator(".view-lines")).toHaveText(
        "Original phrase",
      );
    }
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type("f");
    await expect(panel().locator(".view-lines")).toHaveText("Original phrasef");
  } finally {
    await app.evaluate(
      ({ clipboard }, value) => clipboard.writeText(value),
      oldClipboard,
    );
  }
});

for (const [commandId, label] of [
  ["view.query", "SPARQL query"], // Query's editor label follows its reference (#88).
  ["view.source", "Ontology source"],
]) {
  test(`letter access keys work in the ${label} context menu`, async () => {
    await menu(commandId);
    const input = page.getByRole("textbox", { name: label, exact: true });
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Shift+F10");
    const popup = page.locator(".monaco-menu [role=menu]");
    await expect(popup.locator('[data-menu-key="C"]')).toBeVisible();
    const keys = await popup
      .locator("[data-menu-key]")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-menu-key")),
      );
    expect(new Set(keys).size).toBe(keys.length);
    await expect(popup.locator("u")).toHaveCount(keys.length);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(input).toBeFocused();
    const before = await app.evaluate(({ clipboard }) => clipboard.readText());
    try {
      await app.evaluate(({ clipboard }) =>
        clipboard.writeText("menu sentinel"),
      );
      await page.keyboard.press("Shift+F10");
      await page.keyboard.press("c");
      await expect(popup).toHaveCount(0);
      await expect
        .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
        .not.toBe("menu sentinel");
    } finally {
      await app.evaluate(
        ({ clipboard }, value) => clipboard.writeText(value),
        before,
      );
    }
  });
}

test("letter access keys also work in the entity source editor", async () => {
  await enter("canine");
  await expect(chip("dog")).toBeAttached({ timeout: 20000 });
  await selectSummaryEntity("dog");

  const input = details().getByRole("textbox", {
    name: /^Source for /,
  });
  await input.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Shift+F10");
  const popup = page.getByRole("menu", { name: "Source editing" });
  await expect(popup.locator('[data-menu-key="C"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeFocused();
});

test("a detached Text Analysis switches Summary and handles context menu letters", async () => {
  await enter("Fresh systems");
  await showSummary();
  await expect(chip("systems")).toBeVisible({ timeout: 20000 });
  const opening = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await opening;
  detached.on("pageerror", (error) => errors.push(error.message));
  const content = detached.getByRole("region", {
    name: "Text Analysis",
    exact: true,
  });
  await expect(content.locator(".text-analysis-chip")).toBeVisible();
  await content.getByRole("button", { name: "Text", exact: true }).click();
  const input = content.getByRole("textbox", {
    name: "Text to analyze",
    exact: true,
  });
  await input.focus();
  await content
    .locator(".view-line")
    .first()
    .dblclick({ position: { x: 15, y: 10 } });
  await expect(content.locator(".menu [data-action=add]")).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await detached.keyboard.press("Shift+F10");
  await expect(
    detached.locator('.monaco-menu [data-menu-key="F"]'),
  ).toBeVisible();
  await detached.keyboard.press("f");
  await expect(
    page.getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("Fresh");
  const before = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await app.evaluate(({ clipboard }) => clipboard.writeText("Changed"));
    await content
      .locator(".view-line")
      .first()
      .dblclick({ position: { x: 15, y: 10 } });
    await detached.keyboard.press("Shift+F10");
    await detached.keyboard.press("p");
    await expect(content.locator(".view-lines")).toHaveText("Changed systems");
  } finally {
    await app.evaluate(
      ({ clipboard }, value) => clipboard.writeText(value),
      before,
    );
  }
  await content.getByRole("button", { name: "Summary", exact: true }).click();
  await expect(content.locator(".text-analysis-chip")).toBeVisible();
});

// craigtrim/axiom#136: inspect rendered Monaco hovers, not just stored decoration text.
async function hoverMatch(label: string) {
  await expect(chip(label)).toBeAttached();
  const className = (await chip(label).getAttribute("class"))!.match(
    /text-entity-\d+/,
  )![0];
  const highlight = panel().locator(`.view-lines .${className}`).first();
  await highlight.hover();
  const hover = panel().locator(".monaco-hover").filter({ visible: true });
  await expect(hover).toBeVisible();
  await expect
    .poll(
      () =>
        hover.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const x = rect.left + Math.min(40, rect.width / 2);
          return (
            rect.height > 16 &&
            [rect.top + 8, rect.bottom - 8].every((y) =>
              node.contains(node.ownerDocument.elementFromPoint(x, y)),
            )
          );
        }),
      {
        message:
          "Every hover fact must remain visible outside the editor's clipping area",
      },
    )
    .toBe(true);
  return hover;
}
async function appendExplanationOntology(text: string) {
  await page.evaluate(async (addition) => {
    const source = await window.axiom.request<
      import("../../src/shared/source").SourceDocument
    >("sourceDocument", { format: "turtle" });
    await window.axiom.request("applySource", {
      ...source,
      text: source.text + "\n" + addition,
    });
  }, text);
}
test("#136 hover names the entry and distinguishes exact phrases from span words", async () => {
  await appendExplanationOntology(`<${base}owlclass_123> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Combat" .
<${base}Digital_Circuit_Design> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Digital Circuit Design" .`);
  await enter("Combat");
  let hover = await hoverMatch("owlclass_123");
  await expect(hover).toContainText("Combat");
  await expect(hover).toContainText("Exact phrase");
  await expect(hover).toContainText("Ctrl+click for Details");
  await expect(hover).not.toContainText("owlclass_");
  await expect(hover).not.toContainText("Covers:");
  await page.keyboard.press("Escape");
  await enter("digital one circuit two design");
  hover = await hoverMatch("digital_circuit_design");
  await expect(hover).toContainText("Digital Circuit Design");
  await expect(hover).toContainText(
    "Words found near each other: digital, circuit, design",
  );
  await expect(hover).not.toContainText("one");
  await expect(hover).not.toContainText("two");
  await expect(hover).not.toContainText("spans");
  await expect(hover).not.toContainText("digital_circuit_design");
  await page.screenshot({ path: "artifacts/testing/issue-136-span-hover.png" });
});
test("#136 hover and Details resolve covered matches and shared canonical names", async () => {
  const owl = "http://www.w3.org/2002/07/owl#Class",
    label = "http://www.w3.org/2000/01/rdf-schema#label";
  await appendExplanationOntology(`<${base}Psychology> a <${owl}>; <${label}> "Psychology" .
<https://other.example/#Psychology> a <${owl}>; <${label}> "Mind Study" .
<${base}Behavioral_Psychology> a <${owl}>; <${label}> "Behavioral Psychology" .
<https://other.example/#Behavioral_Psychology> a <${owl}>; <${label}> "Behavior Study" .`);
  await enter("Psychology Behavioral");
  const hover = await hoverMatch("behavioral_psychology");
  await expect(hover).toContainText("Behavioral Psychology");
  await expect(hover).toContainText("Behavior Study");
  await expect(hover).toContainText(
    "Words found near each other: Psychology, Behavioral",
  );
  await expect(hover).toContainText("Covers: Psychology, Mind Study");
  await expect(hover).not.toContainText("behavioral_psychology");
  await page.keyboard.press("Escape");
  await clickHighlight("behavioral_psychology");
  const fields = details().locator(".text-span-details dl");
  await expect(fields).toContainText(
    "Words found near each other: Psychology, Behavioral",
  );
  await expect(fields).toContainText("Psychology, Mind Study");
  await expect(fields).not.toContainText("spans");
  await expect(fields).not.toContainText("Canonical name");
  await expect(details()).toContainText("shared by 2 ontology entries");
  await page.screenshot({
    path: "artifacts/testing/issue-136-match-details.png",
  });
  await details()
    .getByRole("button", { name: "Open Behavior Study", exact: true })
    .click();
  await expect(details()).toHaveAttribute(
    "data-entity-iri",
    "https://other.example/#Behavioral_Psychology",
  );
});
test("#136 hover treats ontology label markup as literal text", async () => {
  const label = "Entry [Open](command:evil) <img> &copy; *bold*";
  await appendExplanationOntology(
    `<${base}owlclass_safe> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> ${JSON.stringify(label)}; <http://www.w3.org/2004/02/skos/core#altLabel> "safeword" .`,
  );
  await enter("safeword");
  const hover = await hoverMatch("owlclass_safe");
  await expect(hover).toContainText(label);
  await expect(hover.locator("a, img, strong")).toHaveCount(0);
  await expect(hover).toContainText("Exact phrase");
  await page.screenshot({
    path: "artifacts/testing/issue-136-literal-hover.png",
  });
});
