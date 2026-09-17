import { launchExample } from "./example-fixture";
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import type { Camera } from "../../src/renderer/scene";
import { THING, SUBCLASS } from "../../src/domain/model";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page, bridge: Page;
const errors: string[] = [];
const state = () =>
  bridge.evaluate(() => window.axiom.request<Snapshot>("state"));
const request = (method: DomainMethod, args: Record<string, unknown> = {}) =>
  bridge.evaluate(({ method, args }) => window.axiom.request(method, args), {
    method,
    args,
  });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
const camera = () =>
  bridge.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState![
        "graph.camera"
      ] as Camera,
  );
async function fitGraph() {
  await menu("graph.fit");
  // Camera preferences are persisted with a 250 ms debounce.
  await page.waitForTimeout(350);
  await expect.poll(camera).toBeTruthy();
}
async function at(iri: string) {
  const n = (await state()).graph.nodes.find((n) => n.iri === iri)!,
    c = await camera(),
    b = (await page.getByTestId("graph-canvas").boundingBox())!;
  return {
    x: b.x + n.x * c.zoom + c.x,
    y: b.y + n.y * c.zoom + c.y,
    radius: n.radius * c.zoom,
  };
}
const preview = () => page.getByTestId("edge-preview");
async function clickNode(iri: string) {
  const p = await at(iri);
  await page.mouse.click(p.x, p.y);
}
async function prepare() {
  await menu("file.new");
  const ids = await page.evaluate(async () => {
    const root = "http://www.w3.org/2002/07/owl#Thing";
    await window.axiom.request("freeze");
    const a = await window.axiom.request<string>("createClass", {
      name: "Alpha",
      parent: root,
    });
    const b = await window.axiom.request<string>("createClass", {
      name: "Beta",
      parent: root,
    });
    const c = await window.axiom.request<string>("createClass", {
      name: "Gamma",
      parent: root,
    });
    await window.axiom.request("seed", { iris: [a, b, c], expand: false });
    const s = await window.axiom.request<Snapshot>("state");
    for (const [iri, x, y] of [
      [a, -180, 0],
      [b, 180, 0],
      [c, 0, 160],
    ])
      await window.axiom.request("drag", {
        iri,
        x,
        y,
        dragging: false,
        datasetEpoch: s.datasetEpoch,
      });
    await window.axiom.request("select", { iri: null });
    return { a, b, c };
  });
  await fitGraph();
  return ids;
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/connect-"));
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
  bridge = page;
  page.on("pageerror", (e) => errors.push(e.message));
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
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("connection-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

test("full-graph refusal, endpoint reservation and stale workspace requests preserve atomicity", async () => {
  await menu("file.new");
  await request("freeze");
  await bridge.evaluate(async () => {
    for (let i = 0; i < 102; i++)
      await window.axiom.request("createClass", {
        name: "Capacity " + i,
        parent: "http://www.w3.org/2002/07/owl#Thing",
      });
  });
  await request("budget", { value: 100 });
  // Expanding one root fills the view while keeping its children evictable.
  await request("seed", { iris: [THING], replace: true, expand: true });
  await request("eviction", { mode: "refuse" });
  const before = await state(),
    source = before.graph.nodes.find((n) => n.iri !== THING)!.iri,
    target = before.entities.find(
      (e) => !before.graph.nodes.some((n) => n.iri === e.iri),
    )!.iri;
  const args = {
    datasetEpoch: before.datasetEpoch,
    version: before.version,
    statement: {
      subject: source,
      predicate: "https://example.org/newConnection",
      object: { literal: false, value: target },
    },
  };
  await expect(request("createEdge", args)).rejects.toThrow("graph is full");
  const rejected = await state();
  expect(rejected.version).toBe(before.version);
  expect(rejected.tripleCount).toBe(before.tripleCount);
  expect(rejected.undoLabel).toBe(before.undoLabel);
  await request("eviction", { mode: "degree" });
  const preAdd = await state();
  await request("createEdge", args);
  const added = await state();
  expect(added.graph.nodes).toHaveLength(100);
  expect(added.graph.nodes.map((n) => n.iri)).toEqual(
    expect.arrayContaining([source, target]),
  );
  expect(added.graph.selectedEdge).toBe(
    JSON.stringify([source, args.statement.predicate, target]),
  );
  await menu("edit.undo");
  expect((await state()).graph.nodes.map((n) => n.iri).sort()).toEqual(
    preAdd.graph.nodes.map((n) => n.iri).sort(),
  );
  await menu("file.new");
  const reset = await state();
  await expect(request("createEdge", args)).rejects.toThrow("ontology changed");
  expect((await state()).version).toBe(reset.version);
  expect((await state()).tripleCount).toBe(reset.tripleCount);
});

async function gesture(source: string, target: string, offset = 0) {
  const a = await at(source),
    b = await at(target);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y + offset, { steps: 10 });
}
async function deselect() {
  await page.getByTestId("graph-canvas").click({ position: { x: 12, y: 12 } });
  await expect.poll(async () => (await state()).selected).toBeNull();
}

test("click selects for moving; dragging an unselected node attaches an edge immediately", async () => {
  const ids = await prepare(),
    before = await state(),
    canvas = page.getByTestId("graph-canvas");
  await expect(
    page.getByRole("button", { name: "Connect nodes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".graph-connect-handle,.connection-help"),
  ).toHaveCount(0);
  await clickNode(ids.a);
  await expect.poll(async () => (await state()).selected).toBe(ids.a);
  expect((await state()).graph.nodes.find((n) => n.iri === ids.a)?.x).toBe(
    -180,
  );
  await page.screenshot({ path: "artifacts/testing/yed-selected-node.png" });
  const a = await at(ids.a);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 50, a.y + 25, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () => (await state()).graph.nodes.find((n) => n.iri === ids.a)?.x,
    )
    .not.toBe(-180);
  expect((await state()).tripleCount).toBe(before.tripleCount);
  await expect(preview()).toHaveCount(0);
  await menu("edit.undo");
  await expect
    .poll(
      async () => (await state()).graph.nodes.find((n) => n.iri === ids.a)?.x,
    )
    .toBe(-180);
  await deselect();
  const cleared = await canvas.screenshot();
  expect(cleared.length).toBeGreaterThan(0);
  await gesture(ids.a, ids.b);
  await expect(preview()).toHaveAttribute("data-source-iri", ids.a);
  await expect(preview()).toHaveAttribute("data-target-iri", ids.b);
  expect((await state()).selected).toBeNull();
  expect((await state()).graph.nodes.find((n) => n.iri === ids.a)?.x).toBe(
    -180,
  );
  await expect(
    page.getByRole("button", { name: "Add entity", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/testing/yed-edge-preview.png" });
  await page.mouse.up();
  const key = JSON.stringify([ids.a, SUBCLASS, ids.b]);
  await expect.poll(async () => (await state()).graph.selectedEdge).toBe(key);
  await expect(preview()).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const connected = await state();
  expect(connected.tripleCount).toBe(before.tripleCount + 1);
  expect(connected.entities.find((e) => e.iri === ids.a)?.parents).toContain(
    ids.b,
  );
  expect(connected.graph.frozen).toBe(true);
  await page.screenshot({ path: "artifacts/testing/yed-edge-attached.png" });
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === ids.a)?.parents,
    )
    .not.toContain(ids.b);
  await menu("edit.redo");
  await expect.poll(async () => (await state()).graph.selectedEdge).toBe(key);
});

test("empty-space drops add bends and the completed route survives Undo and workspace reload", async () => {
  const ids = await prepare(),
    a = await at(ids.a),
    b = await at(ids.b),
    canvas = page.getByTestId("graph-canvas"),
    box = (await canvas.boundingBox())!;
  const bend1 = { x: a.x, y: box.y + box.height - 34 },
    bend2 = { x: b.x, y: bend1.y };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(bend1.x, bend1.y, { steps: 10 });
  await page.mouse.up();
  await expect(preview()).toBeVisible();
  expect((await state()).graph.edges).toHaveLength(0);
  await page.mouse.click(bend2.x, bend2.y);
  await page.mouse.click(b.x, b.y);
  await expect
    .poll(async () => (await state()).graph.edges[0]?.bend?.points?.length)
    .toBe(2);
  const points = (await state()).graph.edges[0].bend!.points!;
  await menu("edit.undo");
  await expect.poll(async () => (await state()).graph.edges.length).toBe(0);
  await menu("edit.redo");
  expect((await state()).graph.edges[0].bend?.points).toEqual(points);
  const file = path.resolve(
    "artifacts/testing/yed-bends-" + Date.now() + ".axiom",
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(file, "utf8").catch(() => "null"))?.graph
          ?.routes?.[0]?.points,
    )
    .toEqual(points);
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
  expect((await state()).graph.edges[0].bend?.points).toEqual(points);
});

test("Escape, right-click, stale data and pane closure cancel drawing without edits", async () => {
  const ids = await prepare(),
    before = await state();
  await gesture(ids.a, ids.b);
  await page.keyboard.press("Escape");
  await page.mouse.move((await at(ids.c)).x, (await at(ids.c)).y);
  await page.mouse.up();
  await expect(preview()).toHaveCount(0);
  expect((await state()).tripleCount).toBe(before.tripleCount);
  await gesture(ids.a, ids.b);
  await page.mouse.click((await at(ids.b)).x, (await at(ids.b)).y, {
    button: "right",
  });
  await page.mouse.up();
  await expect(preview()).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await state()).tripleCount).toBe(before.tripleCount);
  await gesture(ids.a, ids.b);
  await request("createClass", { name: "Edited elsewhere", parent: THING });
  await page.mouse.up();
  await expect(preview()).toHaveCount(0);
  expect(
    (await state()).entities.find((e) => e.iri === ids.a)?.parents,
  ).not.toContain(ids.b);
  await request("select", { iri: ids.a });
  await menu("graph.connect");
  await expect(preview()).toBeVisible();
  await menu("pane.close");
  await menu("view.graph");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await expect(preview()).toHaveCount(0);
});

test("low-zoom drops, keyboard commands and detached panes retain direct attachment", async () => {
  const ids = await prepare();
  for (let i = 0; i < 6; i++) await menu("graph.zoom.out");
  await expect.poll(async () => (await camera()).zoom).toBeLessThan(0.5);
  await gesture(ids.a, ids.b, -21);
  await expect(preview()).toHaveAttribute("data-target-iri", ids.b);
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === ids.a)?.parents,
    )
    .toContain(ids.b);
  await menu("edit.undo");
  await clickNode(ids.a);
  const a = await at(ids.a);
  await page.mouse.click(a.x, a.y, { button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Connect nodes", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await menu("graph.connect");
  await expect(preview()).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await state()).graph.edges.length).toBe(1);
  await menu("view.graph");
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const main = page;
  page = app.windows().find((p) => p !== main)!;
  page.on("pageerror", (e) => errors.push(e.message));
  await (
    await app.browserWindow(page)
  ).evaluate((win) => {
    win.setMinimumSize(160, 100);
    win.setContentSize(640, 520);
    if (process.env.AXIOM_TEST_BACKGROUND === "1") win.setFocusable(false);
  });
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await fitGraph();
  await deselect();
  await gesture(ids.c, ids.b);
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === ids.c)?.parents,
    )
    .toContain(ids.b);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an ambiguous relationship stays attached while its property is chosen in a compact picker", async () => {
  const ids = await prepare();
  const nodes = await bridge.evaluate(async (a) => {
    const one = await window.axiom.request<string>("createIndividual", {
        name: "One",
        type: a,
      }),
      two = await window.axiom.request<string>("createIndividual", {
        name: "Two",
        type: a,
      });
    await window.axiom.request("seed", {
      iris: [one, two],
      replace: true,
      expand: false,
    });
    await window.axiom.request("drag", {
      iri: one,
      x: -150,
      y: 0,
      dragging: false,
    });
    await window.axiom.request("drag", {
      iri: two,
      x: 150,
      y: 0,
      dragging: false,
    });
    await window.axiom.request("select", { iri: null });
    return { one, two };
  }, ids.a);
  await fitGraph();
  await gesture(nodes.one, nodes.two);
  await page.mouse.up();
  const picker = page.getByRole("form", { name: "Connection relationship" });
  await expect(picker).toBeVisible();
  await expect(preview()).toHaveAttribute("data-target-iri", nodes.two);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode()
        .include(".edge-property-picker")
        .analyze()
    ).violations,
  ).toEqual([]);
  const property = picker.getByRole("combobox", {
    name: "Connection relationship",
  });
  await property.fill("not a property");
  await picker.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(picker.getByRole("alert")).toBeVisible();
  await expect(preview()).toHaveAttribute("data-target-iri", nodes.two);
  expect((await state()).graph.edges).toHaveLength(0);
  await property.fill("https://example.org/knows");
  await picker.getByRole("button", { name: "Attach", exact: true }).click();
  await expect
    .poll(async () => (await state()).graph.edges[0]?.predicate)
    .toBe("https://example.org/knows");
  await expect(picker).toHaveCount(0);
});

test("drawing pauses moving nodes and duplicate drops select the existing edge", async () => {
  const ids = await prepare();
  await gesture(ids.a, ids.b);
  await page.mouse.up();
  const before = await state();
  await gesture(ids.a, ids.b);
  await page.mouse.up();
  await expect(preview()).toHaveCount(0);
  expect((await state()).tripleCount).toBe(before.tripleCount);
  expect((await state()).version).toBe(before.version);
  await request("select", { iri: ids.a });
  await menu("graph.connect");
  await expect(preview()).toBeVisible();
  await request("layout", { mode: "force" });
  await request("freeze");
  const positions = () =>
    state().then((s) => s.graph.nodes.map((n) => [n.x, n.y]));
  const paused = await positions();
  await page.waitForTimeout(150);
  expect(await positions()).toEqual(paused);
  expect((await state()).graph.frozen).toBe(false);
  await page.keyboard.press("Escape");
  await expect.poll(positions).not.toEqual(paused);
});
