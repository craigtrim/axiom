import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { discoverAssistants } from "../../src/main/local-assistant";
import {
  buildTaxonomyPrompt,
  type TaxonomyResponse,
  type TaxonomyStatus,
} from "../../src/shared/taxonomy-assistant";
import type { Snapshot } from "../../src/shared/protocol";
import { NS, THING, TYPE, SUBCLASS } from "../../src/domain/model";
let app: ElectronApplication, page: Page;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const prefixes = `@prefix : <https://axiom.test/taxonomy#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`;
async function attach(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json",
  });
}
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
test.beforeEach(async ({}, info) => {
  errors.length = 0;
  if (process.env.AXIOM_LIVE_CODEX !== "1")
    throw Error("Live Codex tests require explicit opt-in.");
  const installed = (await discoverAssistants()).find((c) => c.id === "codex");
  expect(
    installed,
    "Real Codex on PATH is required; this suite never substitutes a fixture CLI.",
  ).toBeDefined();
  const version = await promisify(execFile)(
    installed!.file,
    [...installed!.args, "--version"],
    { windowsHide: true, timeout: 15000 },
  );
  await attach(info, "codex-installation", {
    path: installed!.args[0] ?? installed!.file,
    version: version.stdout.trim(),
    build: process.env.AXIOM_TEST_EXE ?? "source Electron build",
  });
  console.log(
    "Live taxonomy provider:",
    installed!.args[0] ?? installed!.file,
    version.stdout.trim(),
  );
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/testing/taxonomy-live-"),
  );
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  // PATH and CLI authentication are inherited unchanged.
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        window.setFocusable(false);
    });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  const agents = await page.evaluate(() =>
    window.axiom.queryAssistant.assistants(),
  );
  expect(agents.find((a) => a.id === "codex")?.path).toBe(
    installed!.args[0] ?? installed!.file,
  );
});
test.afterEach(async ({}, info) => {
  if (app) {
    try {
      if (page && !page.isClosed()) {
        const status = await page.evaluate(() =>
          window.axiom.taxonomyAssistant.status(),
        );
        await attach(info, "taxonomy-status", status);
        if (status.response) {
          await info.attach("exact-taxonomy-prompt", {
            body: Buffer.from(buildTaxonomyPrompt(status.response.context)),
            contentType: "text/plain",
          });
        }
        if (status.id)
          await page.evaluate(
            (id) => window.axiom.taxonomyAssistant.cancel(id),
            status.id,
          );
        if (info.status !== info.expectedStatus)
          await info.attach("desktop", {
            body: await page.screenshot(),
            contentType: "image/png",
          });
      }
    } finally {
      await app.close();
    }
  }
  expect(errors).toEqual([]);
});
async function importTaxonomy(text: string) {
  const folder = await mkdtemp(
    path.resolve("artifacts/testing/taxonomy-fixture-"),
  );
  const file = path.join(folder, "taxonomy.ttl");
  await writeFile(file, prefixes + "\n" + text);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  const epoch = (await state()).datasetEpoch;
  await menu("file.import");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
}
async function generate(
  label: string,
  info: TestInfo,
  mode: "children" | "instances" = "children",
  filter = label,
): Promise<TaxonomyResponse> {
  const before = await state();
  await menu("view.hierarchy");
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill(filter);
  const row = page.locator(".tree-row").filter({
    has: page
      .locator(".tree-name")
      .filter({ hasText: new RegExp("^" + label + "$") }),
  });
  await row.click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: mode === "children" ? "Add children" : "Find instances",
      exact: true,
    })
    .click();
  let status: TaxonomyStatus = { running: true };
  await expect
    .poll(
      async () => {
        status = await page.evaluate(() =>
          window.axiom.taxonomyAssistant.status(),
        );
        return !status.running && !!(status.response || status.error);
      },
      { timeout: 210000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  await attach(info, "proposal", status);
  expect(status.error).toBeUndefined();
  expect(status.response).toBeDefined();
  const response = status.response!;
  expect(response.context.mode).toBe(mode);
  expect(response.context.selected.label).toBe(label);
  expect((await state()).version).toBe(before.version);
  for (const s of response.result.suggestions) {
    expect(s.kind).toBe(mode === "children" ? "class" : "individual");
    expect(s.parentIri).toBe(response.context.selected.iri);
    expect(s.reason.length).toBeGreaterThan(20);
  }
  expect(response.issues.every((i) => i === null)).toBe(true);
  console.log(label, mode, JSON.stringify(response.result));
  return response;
}
test("Codex proposes immediate vehicle categories while excluding subtypes of existing descendants", async ({}, info) => {
  await importTaxonomy(`
:Vehicle a owl:Class; rdfs:label "Vehicle"; rdfs:subClassOf owl:Thing;
  rdfs:comment "A means of transport. The immediate classification in this ontology is solely primary operating environment: land, water, or air. These three categories exhaust this classification. Vehicle power sources, purposes, brands and specific mechanisms are classified further down." .
:LandVehicle a owl:Class; rdfs:label "Land vehicle"; rdfs:subClassOf :Vehicle;
  rdfs:comment "A vehicle whose primary operating environment is land." .
:Car a owl:Class; rdfs:label "Car"; rdfs:subClassOf :LandVehicle .
:Sedan a owl:Class; rdfs:label "Sedan"; rdfs:subClassOf :Car .
:PrivateRecord a owl:Class; rdfs:label "Unrelated private record"; rdfs:subClassOf owl:Thing .
`);
  const before = await state();
  const response = await generate("Vehicle", info);
  const labels = response.result.suggestions.map((s) => s.label.toLowerCase());
  expect(labels).toHaveLength(2);
  expect(labels.some((s) => /water|aquatic|marine/.test(s))).toBe(true);
  expect(labels.some((s) => /air|aerial/.test(s))).toBe(true);
  expect(
    labels.some((s) => /sedan|car|truck|bus|boat|helicopter|plane/.test(s)),
  ).toBe(false);
  expect(response.context.descendants.map((e) => e.depth)).toContain(3);
  expect(JSON.stringify(response.context)).not.toContain(
    "Unrelated private record",
  );
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", { name: "Select all available suggestions" })
    .check();
  await dialog.getByRole("button", { name: /^Add selected children/ }).click();
  await expect(dialog).toHaveCount(0);
  const after = await state();
  const created = after.entities.filter(
    (e) => !before.entities.some((old) => old.iri === e.iri),
  );
  expect(created).toHaveLength(2);
  for (const e of created) {
    expect(e.kind).toBe("Class");
    expect(e.parents).toEqual([response.context.selected.iri]);
  }
  await menu("edit.undo");
  expect((await state()).classCount).toBe(before.classCount);
});
test("Codex returns no children for a complete RGB primary channel taxonomy", async ({}, info) => {
  await importTaxonomy(`
:PrimaryChannel a owl:Class; rdfs:label "RGB primary channel"; rdfs:subClassOf owl:Thing;
  rdfs:comment "A primary channel of the standard additive RGB color model. There are exactly three possible channel categories: red, green, and blue. Alpha, cyan, magenta, yellow, black and composite colors are outside this class." .
:RedChannel a owl:Class; rdfs:label "Red channel"; rdfs:subClassOf :PrimaryChannel .
:GreenChannel a owl:Class; rdfs:label "Green channel"; rdfs:subClassOf :PrimaryChannel .
:BlueChannel a owl:Class; rdfs:label "Blue channel"; rdfs:subClassOf :PrimaryChannel .
`);
  const response = await generate("RGB primary channel", info);
  expect(response.result.suggestions).toEqual([]);
  await expect(page.getByRole("dialog")).toContainText(
    "No new direct children suggested.",
  );
});
test("Codex finds named planets as individuals and excludes an existing instance", async ({}, info) => {
  await importTaxonomy(`
:Planet a owl:Class; rdfs:label "Solar System planet"; rdfs:subClassOf owl:Thing;
  rdfs:comment "One of the eight recognized planets orbiting the Sun under the IAU classification: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune. Excludes dwarf planets, moons, exoplanets, and hypothetical planets. Planet names denote individual astronomical bodies, not classes." .
:Earth a :Planet; rdfs:label "Earth" .
`);
  const response = await generate("Solar System planet", info, "instances");
  const labels = response.result.suggestions
    .map((s) => s.label.toLowerCase())
    .sort();
  expect(labels).toEqual([
    "jupiter",
    "mars",
    "mercury",
    "neptune",
    "saturn",
    "uranus",
    "venus",
  ]);
  expect(response.context.existingInstances.map((i) => i.label)).toEqual([
    "Earth",
  ]);
  const dialog = page.getByRole("dialog");
  const mercury = response.result.suggestions.find(
    (s) => s.label.toLowerCase() === "mercury",
  )!;
  await dialog
    .getByRole("checkbox", { name: "Add " + mercury.label, exact: true })
    .check();
  await dialog.getByRole("button", { name: /^Add selected instances/ }).click();
  await expect(dialog).toHaveCount(0);
  const e = (await state()).entities.find((e) => e.name === mercury.label)!;
  expect(e.kind).toBe("Individual");
  expect(e.types).toEqual([response.context.selected.iri]);
  const document = await page.evaluate(
    (iri) =>
      window.axiom.request<{
        statements: { predicate: string; object: { value: string } }[];
      }>("entityDocument", { iri }),
    e.iri,
  );
  expect(
    document.statements.some(
      (t) =>
        t.predicate === TYPE &&
        t.object.value === response.context.selected.iri,
    ),
  ).toBe(true);
  expect(document.statements.some((t) => t.predicate === SUBCLASS)).toBe(false);
});
test("Codex reviews the shipped Pizza branch with its full ancestry and descendants", async ({}, info) => {
  await menu("file.example");
  await expect.poll(async () => (await state()).ontology.example).toBe(true);
  const response = await generate("Pizza", info);
  const c = response.context;
  expect(c.ancestors.map((e) => e.iri)).toEqual(
    expect.arrayContaining([
      THING,
      NS.pizza + "Food",
      NS.pizza + "DomainConcept",
    ]),
  );
  expect(c.ancestorLinks).toContainEqual({
    child: NS.pizza + "Pizza",
    parent: NS.pizza + "Food",
  });
  expect(c.directChildren).toContain(NS.pizza + "NamedPizza");
  expect(
    c.descendants.some(
      (e) => e.iri === NS.pizza + "AmericanHot" && e.depth === 2,
    ),
  ).toBe(true);
  expect(c.existingInstances).toEqual([]);
  await info.attach("pizza-review", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("Codex suggests familiar meat pizza types when no children are recorded", async ({}, info) => {
  await menu("file.example");
  await expect.poll(async () => (await state()).ontology.example).toBe(true);
  const before = await state();
  const response = await generate("Meaty Pizza", info, "children", "Meaty");
  expect(response.context.directChildren).toEqual([]);
  expect(response.context.descendants).toEqual([]);
  expect(response.result.suggestions.length).toBeGreaterThan(0);
  const prompt = buildTaxonomyPrompt(response.context);
  expect(prompt).toContain("Use your general subject knowledge");
  expect(prompt).toContain('"Meat Topping"');
  expect(prompt).not.toContain("parentIri");
  expect(prompt).not.toContain(NS.pizza);
  const suggestion = response.result.suggestions[0];
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", { name: "Add " + suggestion.label, exact: true })
    .check();
  await dialog.getByRole("button", { name: /^Add selected children/ }).click();
  await expect(dialog).toHaveCount(0);
  const created = (await state()).entities.filter(
    (e) => !before.entities.some((old) => old.iri === e.iri),
  );
  expect(created).toHaveLength(1);
  expect(created[0].kind).toBe("Class");
  expect(created[0].parents).toEqual([NS.pizza + "MeatyPizza"]);
  await menu("edit.undo");
  expect((await state()).classCount).toBe(before.classCount);
});
