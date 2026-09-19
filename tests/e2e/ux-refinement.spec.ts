import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot, DomainMethod } from "../../src/shared/protocol";
import { edgeKey } from "../../src/domain/viewport";
let app: ElectronApplication, page: Page;
const errors: string[] = [];
const base = "http://e.test/#",
  target = base + "Ultrafast_Laser_Polymer_Cutting",
  a = base + "Ultrafast_Polymer_Cutting",
  b = base + "Laser_Polymer_Cutting";
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const request = (method: DomainMethod, args: Record<string, unknown> = {}) =>
  page.evaluate(({ method, args }) => window.axiom.request(method, args), {
    method,
    args,
  });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
const graph = (id = "graph") => page.locator('[data-graph-id="' + id + '"]');
const details = () =>
  page.getByRole("region", { name: "Details", exact: true });
async function fit() {
  await menu("graph.fit");
  await page.waitForTimeout(400);
}
async function point(iri: string, id = "graph") {
  const s = await state(),
    g = s.graphs![id],
    n = g.nodes.find((n) => n.iri === iri)!;
  const key = id === "graph" ? "graph.camera" : "graph.camera." + id;
  const c = await page.evaluate(
    async (key) =>
      (await window.axiom.preferences.load()).panelState![key] as {
        x: number;
        y: number;
        zoom: number;
      },
    key,
  );
  const rect = (await graph(id).getByTestId("graph-canvas").boundingBox())!;
  return { x: rect.x + n.x * c.zoom + c.x, y: rect.y + n.y * c.zoom + c.y };
}
async function nodeMenu(iri: string) {
  await fit();
  const p = await point(iri);
  await page.mouse.click(p.x, p.y, { button: "right" });
  return page.getByRole("menu", { name: "Graph node actions", exact: true });
}
async function treeMenu(iri: string) {
  await request("select", { iri });
  const filter = page.getByRole("textbox", { name: "Filter hierarchy" });
  await filter.fill(iri.slice(base.length));
  const row = page.locator('[data-entity-iri="' + iri + '"]');
  await row.click({ button: "right" });
  return page.getByRole("menu", { name: "Entity actions", exact: true });
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/ux-"));
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
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((win) => win.setFocusable(false));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const file = path.resolve(profile, "classes.ttl");
  await writeFile(
    file,
    `@prefix : <${base}> . @prefix owl:<http://www.w3.org/2002/07/owl#> . @prefix rdfs:<http://www.w3.org/2000/01/rdf-schema#> .
 :Process a owl:Class;rdfs:label "Process" .
 :Ultrafast_Polymer_Cutting a owl:Class;rdfs:label "Ultrafast Polymer Cutting";rdfs:subClassOf :Process .
 :Laser_Polymer_Cutting a owl:Class;rdfs:label "Laser Polymer Cutting";rdfs:subClassOf :Process .
 :Ultrafast_Laser_Polymer_Cutting a owl:Class;rdfs:label "Ultrafast Laser Polymer Cutting";rdfs:subClassOf :Process;rdfs:seeAlso <https://example.test/one>,<https://example.test/two>,<https://example.test/three>;:title "Découpe"@fr;:score 42 .
 :Existing a owl:Class;rdfs:label "Existing Intersection";rdfs:subClassOf [a owl:Class;owl:intersectionOf (:Ultrafast_Polymer_Cutting :Laser_Polymer_Cutting)] .`,
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
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("classes.ttl");
  await request("seed", { iris: [target] });
  await request("select", { iri: target });
  await request("freeze");
  await fit();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("ux-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
test("Details shows compact statements and preserves language, datatype, and edits", async () => {
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toHaveCount(0);
  await menu("view.details");
  await menu("pane.move.right");
  const table = details().getByRole("table", { name: "Entity statements" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Predicate",
    "Value",
  ]);
  await expect(table.locator("tbody tr")).toHaveCount(8);
  const seeAlso = table.locator("tbody tr").filter({
    has: page.locator(
      'select[title="http://www.w3.org/2000/01/rdf-schema#seeAlso"]',
    ),
  });
  await expect(seeAlso).toHaveCount(3);
  for (const row of await seeAlso.all()) await expect(row).toBeInViewport();
  await details()
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Laser process");
  await details()
    .getByRole("textbox", { name: "Entity label", exact: true })
    .blur();
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === target)?.label,
    )
    .toBe("Laser process");
  const before = (await request("entityDocument", { iri: target })) as any;
  expect(before.statements.some((t: any) => t.object.language === "fr")).toBe(
    true,
  );
  expect(
    before.statements.some(
      (t: any) => t.predicate === base + "score" && t.object.datatype,
    ),
  ).toBe(true);
  await details().getByRole("button", { name: "Add row", exact: true }).click();
  await table
    .getByRole("combobox", { name: "Predicate 9", exact: true })
    .selectOption("http://www.w3.org/2000/01/rdf-schema#seeAlso");
  await table
    .getByRole("combobox", { name: "Value 9", exact: true })
    .fill("https://example.test/four");
  await page.locator(":focus").blur();
  await table.getByRole("combobox", { name: "Value 9", exact: true }).blur();
  await expect(table.locator("tbody tr")).toHaveCount(9);
  await page.screenshot({ path: "artifacts/testing/ux-compact-details.png" });
});
test("Find in taxonomy clears filters, reveals the row, and retains graph focus", async () => {
  await page
    .getByRole("textbox", { name: "Filter hierarchy" })
    .fill("no matches");
  await graph()
    .getByRole("button", { name: "Find in taxonomy", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Filter hierarchy" }),
  ).toHaveValue("");
  await expect(
    page.locator('[data-entity-iri="' + target + '"]').first(),
  ).toBeInViewport();
  await expect(graph().getByTestId("graph-canvas")).toBeFocused();
  const m = await nodeMenu(target);
  await m
    .getByRole("menuitem", { name: "Find in taxonomy", exact: true })
    .click();
  await expect(graph().getByTestId("graph-canvas")).toBeFocused();
});
test("nested Show in graph opens independent views and Current graph uses the last active view", async () => {
  const initial = (await state()).graph.nodes.map((n) => n.iri).sort();
  const m = await treeMenu(a);
  await m.getByRole("menuitem", { name: "Show in graph", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Show in graph", exact: true })
    .getByRole("menuitem", { name: "New graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  let s = await state();
  const second = s.activeGraphId!;
  expect(second).not.toBe("graph");
  await expect(graph(second).getByTestId("graph-canvas")).toBeVisible();
  expect(s.graphs!.graph.nodes.map((n) => n.iri).sort()).toEqual(initial);
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  await expect.poll(async () => (await state()).activeGraphId).toBe("graph");
  await graph().getByTestId("graph-canvas").focus();
  const m2 = await treeMenu(b);
  await m2
    .getByRole("menuitem", { name: "Show in graph", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  const sub = page.getByRole("menu", { name: "Show in graph", exact: true });
  await expect(sub).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(sub).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await sub
    .getByRole("menuitem", { name: "Current graph", exact: true })
    .click();
  s = await state();
  expect(s.activeGraphId).toBe("graph");
  expect(s.graph.nodes.some((n) => n.iri === b)).toBe(true);
  expect(s.graphs![second].nodes.some((n) => n.iri === a)).toBe(true);
  expect(s.graphs![second].nodes.some((n) => n.iri === b)).toBe(false);
  const file = path.resolve(
    `artifacts/testing/ux-multigraph-${Date.now()}.axiom`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(file, "utf8")).graphs;
      } catch {
        return null;
      }
    })
    .toBeTruthy();
  const doc = JSON.parse(await readFile(file, "utf8"));
  expect(Object.keys(doc.graphs)).toHaveLength(2);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  expect(
    (await state()).graphs![second].nodes.map((n) => n.iri).sort(),
  ).toEqual(s.graphs![second].nodes.map((n) => n.iri).sort());
  await page.screenshot({ path: "artifacts/testing/ux-multiple-graphs.png" });
});
test("equivalent intersection branches support editing a member and Undo", async () => {
  const before = await state();
  await request("applyIntersection", {
    iri: target,
    members: [a, b],
    predicate: "http://www.w3.org/2002/07/owl#equivalentClass",
    version: before.version,
    datasetEpoch: before.datasetEpoch,
  });
  await request("seed", { iris: [target] });
  await fit();
  let s = await state();
  expect(s.graph.nodes.some((n) => n.kind === "Intersection")).toBe(false);
  const branches = s.graph.edges.filter(
    (e) => e.intersection && e.source === target,
  );
  expect(branches).toHaveLength(2);
  expect(branches[0].junction).toEqual(branches[1].junction);
  await request("selectEdge", { key: edgeKey(branches[0]) });
  await menu("view.details");
  await menu("pane.move.right");
  await expect(
    details().getByRole("table", { name: "Edge statements" }),
  ).toBeVisible();
  await details()
    .getByRole("button", { name: "Remove edge", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === target)?.classExpressions
          ?.length ?? 0,
    )
    .toBe(0);
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === target)?.classExpressions
          ?.length,
    )
    .toBe(1);
  await request("select", { iri: target });
  await fit();
  await page.screenshot({
    path: "artifacts/testing/ux-intersection-branches.png",
  });
});
test("Claude is the shared default and switching Research updates query generation", async () => {
  await menu("research.open");
  const research = page.locator('[data-panel="research"]');
  const provider = research.getByRole("combobox", {
    name: "Research assistant",
    exact: true,
  });
  await expect(provider).toHaveValue("claude");
  await provider.selectOption("codex");
  await expect
    .poll(
      async () =>
        await page.evaluate(
          async () =>
            (await window.axiom.preferences.load()).panelState?.[
              "assistant.provider"
            ],
        ),
    )
    .toBe("codex");
  await menu("query.generate");
  const composer = page.getByRole("region", { name: "Compose a SPARQL query" });
  await expect(composer.getByRole("combobox").first()).toHaveValue("codex");
  await composer.getByRole("combobox").first().selectOption("claude");
  await menu("research.open");
  await expect(provider).toHaveValue("claude");
});

test("graph positions and shared renames survive switching views and Undo", async () => {
  const original = (await state()).graph.nodes.find((n) => n.iri === target)!;
  const m = await treeMenu(target);
  await m.getByRole("menuitem", { name: "Show in graph", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Show in graph", exact: true })
    .getByRole("menuitem", { name: "New graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  const second = (await state()).activeGraphId!;
  await request("freeze");
  await request("drag", { iri: target, x: 320, y: 210, dragging: false });
  let s = await state();
  expect(s.graphs!.graph.nodes.find((n) => n.iri === target)).toMatchObject({
    x: original.x,
    y: original.y,
  });
  expect(s.graphs![second].nodes.find((n) => n.iri === target)).toMatchObject({
    x: 320,
    y: 210,
  });
  const doc = (await request("entityDocument", { iri: target })) as any,
    newIri = base + "Renamed";
  await request("updateEntity", {
    iri: target,
    nextIri: newIri,
    statements: doc.statements,
    version: doc.version,
    datasetEpoch: doc.datasetEpoch,
  });
  s = await state();
  for (const g of Object.values(s.graphs!))
    expect(g.nodes.some((n) => n.iri === newIri)).toBe(true);
  await menu("edit.undo");
  s = await state();
  for (const g of Object.values(s.graphs!))
    expect(g.nodes.some((n) => n.iri === target)).toBe(true);
  expect(s.graphs!.graph.nodes.find((n) => n.iri === target)).toMatchObject({
    x: original.x,
    y: original.y,
  });
  expect(s.graphs![second].nodes.find((n) => n.iri === target)).toMatchObject({
    x: 320,
    y: 210,
  });
});

test("local subclass review adds existing parents and Undo restores the original relationships", async () => {
  const m = await treeMenu(target);
  await m
    .getByRole("menuitem", { name: "Suggest Sub Classes", exact: true })
    .click();
  const d = page.getByRole("dialog", {
    name: /Find existing parent classes for/,
  });
  await expect(d.getByRole("checkbox")).toHaveCount(2);
  await expect(d.getByRole("combobox")).toHaveCount(0);
  await expect(
    d.getByRole("button", { name: "Add parents (0)" }),
  ).toBeDisabled();
  await d
    .getByRole("checkbox", { name: "Ultrafast Polymer Cutting", exact: true })
    .check();
  await d
    .getByRole("checkbox", { name: "Laser Polymer Cutting", exact: true })
    .check();
  await page.screenshot({ path: "artifacts/testing/parent-review.png" });
  await d.getByRole("button", { name: "Add parents (2)" }).click();
  await expect(d).toHaveCount(0);
  const doc = (await request("entityDocument", { iri: target })) as any;
  expect(doc.entity.parents).toEqual(
    expect.arrayContaining([a, b, base + "Process"]),
  );
  expect(doc.entity.classExpressions ?? []).toEqual([]);
  for (const iri of [a, b])
    expect(
      (await state()).entities.find((e) => e.iri === iri)!.parents,
    ).not.toContain(target);
  await menu("edit.undo");
  const parents = (await state()).entities.find(
    (e) => e.iri === target,
  )!.parents;
  expect(parents).not.toContain(a);
  expect(parents).not.toContain(b);
});

test("graph node menu uses the requested groups and toggles Expand and Collapse", async () => {
  await request("collapse", { iri: target });
  let m = await nodeMenu(target);
  const labels = await m
    .locator(':scope > button, :scope > [role="separator"]')
    .evaluateAll((items) =>
      items.map((el) =>
        el.getAttribute("role") === "separator"
          ? "---"
          : el.textContent!.trim(),
      ),
    );
  expect(labels).toEqual([
    "Expand",
    "Hide",
    "Rename",
    "Details",
    "Find in taxonomy",
    "---",
    "New instance",
    "Show instances (0)",
    "Suggest Sub Classes",
    "Research...",
    "---",
    "Pin in graph",
    "Copy IRI",
  ]);
  await expect(
    m.getByRole("menuitem", { name: "Show instances (0)", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: "artifacts/testing/graph-node-menu.png" });
  await m.getByRole("menuitem", { name: "Expand", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state()).graph.nodes.find((n) => n.iri === target)!.expanded,
    )
    .toBe(true);
  m = await nodeMenu(target);
  await expect(
    m.getByRole("menuitem", { name: "Expand", exact: true }),
  ).toHaveCount(0);
  await m.getByRole("menuitem", { name: "Collapse", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state()).graph.nodes.find((n) => n.iri === target)!.expanded,
    )
    .toBe(false);
  await request("seed", { iris: [target] });
  m = await nodeMenu(target);
  await m
    .getByRole("menuitem", { name: "Suggest Sub Classes", exact: true })
    .click();
  const d = page.getByRole("dialog", {
    name: /Find existing parent classes for/,
  });
  await expect(d.getByRole("checkbox")).toHaveCount(2);
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await state()).entities.find((e) => e.iri === target)!.parents,
  ).not.toContain(a);
});

test("subclass review rejects stale results and excludes applied parents", async () => {
  const m = await treeMenu(target);
  await m
    .getByRole("menuitem", { name: "Suggest Sub Classes", exact: true })
    .click();
  const d = page.getByRole("dialog", {
    name: /Find existing parent classes for/,
  });
  await d.getByRole("checkbox").first().check();
  const matches = (await request("subclassSuggestions", {
    iri: target,
  })) as any;
  await expect(
    request("applySubclassSuggestions", {
      iri: target,
      parents: [base + "Process"],
      version: matches.version,
      datasetEpoch: matches.datasetEpoch,
    }),
  ).rejects.toThrow(/current suggestions/);
  await request("applySubclassSuggestions", {
    iri: target,
    parents: [a, b],
    version: matches.version,
    datasetEpoch: matches.datasetEpoch,
  });
  await expect(d.getByRole("alert")).toContainText("ontology changed");
  await expect(
    d.getByRole("button", { name: "Add parents (1)" }),
  ).toBeDisabled();
  await expect(
    request("applySubclassSuggestions", {
      iri: target,
      parents: [a, b],
      version: matches.version,
      datasetEpoch: matches.datasetEpoch,
    }),
  ).rejects.toThrow(/ontology changed/);
  await d
    .getByRole("button", { name: "Find suggestions again", exact: true })
    .click();
  await expect(d).toContainText("No additional parent classes matched");
  await expect(d.getByRole("checkbox")).toHaveCount(0);
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
});
