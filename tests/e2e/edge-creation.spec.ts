import { launchExample } from "./example-fixture";
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
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
const dialog = () =>
  page.getByRole("dialog", { name: "Add relationship", exact: true });
const overlay = () =>
  page.getByRole("group", { name: "Connect nodes", exact: true });
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
    await window.axiom.request("select", { iri: root });
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

test("clicking source and target previews and adds one relationship with Undo and Redo", async () => {
  const ids = await prepare(),
    before = await state();
  await page
    .getByRole("button", { name: "Connect nodes", exact: true })
    .click();
  await expect(page.locator(".connection-help")).toContainText(
    "Choose the source node",
  );
  await clickNode(ids.a);
  await expect(page.locator(".connection-help")).toContainText("From Alpha");
  const b = await at(ids.b);
  await page.mouse.move(b.x, b.y);
  await expect(page.locator(".connection-target")).toHaveAttribute(
    "data-target-iri",
    ids.b,
  );
  await expect(page.locator(".connection-line")).not.toHaveAttribute("d", "");
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode()
        .include(".graph-connect-overlay")
        .include(".connection-help")
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/testing/connect-preview.png" });
  await clickNode(ids.b);
  await expect(
    dialog().getByRole("combobox", { name: "New edge source" }),
  ).toHaveValue(ids.a);
  await expect(
    dialog().getByRole("combobox", { name: "New edge target" }),
  ).toHaveValue(ids.b);
  await expect(
    dialog().getByRole("combobox", { name: "New edge relationship" }),
  ).toHaveValue("rdfs:subClassOf");
  await expect(dialog()).toContainText("Alpha → is a subclass of → Beta");
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode()
        .include(".create-edge-form")
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/testing/connect-confirm.png" });
  await dialog()
    .getByRole("button", { name: "Add relationship", exact: true })
    .click();
  await expect(dialog()).toHaveCount(0);
  await expect(overlay()).toHaveCount(0);
  const key = JSON.stringify([ids.a, SUBCLASS, ids.b]);
  await expect.poll(async () => (await state()).graph.selectedEdge).toBe(key);
  const added = await state();
  expect(added.entities.find((e) => e.iri === ids.a)?.parents).toEqual(
    expect.arrayContaining([THING, ids.b]),
  );
  expect(
    added.graph.nodes.map((n) => ({ iri: n.iri, x: n.x, y: n.y })),
  ).toEqual(before.graph.nodes.map((n) => ({ iri: n.iri, x: n.x, y: n.y })));
  expect(added.graph.frozen).toBe(true);
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === ids.a)?.parents,
    )
    .toEqual([THING]);
  await menu("edit.redo");
  await expect.poll(async () => (await state()).graph.selectedEdge).toBe(key);
});

test("a large handle accepts a nearby drop at low zoom and Escape cancels without an edit", async () => {
  const ids = await prepare();
  await request("select", { iri: ids.a });
  for (let i = 0; i < 6; i++) await menu("graph.zoom.out");
  await expect.poll(async () => (await camera()).zoom).toBeLessThan(0.5);
  const handle = page.getByRole("button", {
    name: "Connect from Alpha",
    exact: true,
  });
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(32);
  const b = await at(ids.b);
  expect(b.radius).toBeLessThan(12);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y - 21, { steps: 12 });
  await expect(page.locator(".connection-target")).toHaveAttribute(
    "data-target-iri",
    ids.b,
  );
  await page.mouse.up();
  await expect(dialog()).toBeVisible();
  await expect(
    dialog().getByRole("combobox", { name: "New edge target" }),
  ).toHaveValue(ids.b);
  const version = (await state()).version;
  await page.keyboard.press("Escape");
  await expect(dialog()).toHaveCount(0);
  await expect(overlay()).toHaveCount(0);
  await handle.click();
  await expect(page.locator(".connection-help")).toContainText("From Alpha");
  await page.keyboard.press("Escape");
  expect((await state()).version).toBe(version);
  const a = await at(ids.a);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 55, a.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(
      async () => (await state()).graph.nodes.find((n) => n.iri === ids.a)?.x,
    )
    .not.toBe(-180);
  expect((await state()).version).toBe(version);
  await expect(dialog()).toHaveCount(0);
});

test("context menu, keyboard and detached narrow-pane controls share the connection flow", async () => {
  const ids = await prepare();
  await clickNode(ids.a);
  const a = await at(ids.a);
  await page.mouse.click(a.x, a.y, { button: "right" });
  await page
    .getByRole("menuitem", { name: "Connect nodes", exact: true })
    .click();
  await expect(page.locator(".connection-help")).toContainText("From Alpha");
  await page.keyboard.press("Escape");
  await page.getByTestId("graph-canvas").focus();
  await page.keyboard.press("c");
  await expect(overlay()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(dialog()).toBeVisible();
  await page.keyboard.press("Escape");
  await menu("graph.connect");
  await expect(overlay()).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel connection", exact: true })
    .click();
  await menu("view.graph");
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const main = page;
  page = app.windows().find((w) => w !== main)!;
  page.on("pageerror", (e) => errors.push(e.message));
  await (
    await app.browserWindow(page)
  ).evaluate((win) => {
    win.setMinimumSize(160, 100);
    win.setContentSize(380, 600);
    if (process.env.AXIOM_TEST_BACKGROUND === "1") win.setFocusable(false);
  });
  await page
    .getByRole("button", { name: "Connect nodes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose from list...", exact: true })
    .click();
  await expect(dialog()).toBeVisible();
  await dialog()
    .getByRole("combobox", { name: "New edge source" })
    .selectOption(ids.a);
  await dialog()
    .getByRole("combobox", { name: "New edge target" })
    .selectOption(ids.c);
  await expect(
    dialog().getByRole("button", { name: "Add relationship", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/testing/connect-detached.png" });
  await dialog()
    .getByRole("button", { name: "Add relationship", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === ids.a)?.parents,
    )
    .toContain(ids.c);
});

test("duplicate and stale connections remain atomic and layout resumes after cancelling", async () => {
  const ids = await prepare();
  const s = await state();
  await request("createEdge", {
    datasetEpoch: s.datasetEpoch,
    version: s.version,
    statement: {
      subject: ids.a,
      predicate: SUBCLASS,
      object: { literal: false, value: ids.b },
    },
  });
  await request("select", { iri: ids.a });
  await page
    .getByRole("button", { name: "Connect nodes", exact: true })
    .click();
  await clickNode(ids.b);
  const before = await state();
  await dialog()
    .getByRole("button", { name: "Add relationship", exact: true })
    .click();
  await expect(dialog().getByRole("alert")).toContainText("already exists");
  expect((await state()).version).toBe(before.version);
  expect((await state()).tripleCount).toBe(before.tripleCount);
  await request("createClass", { name: "Changed elsewhere", parent: THING });
  await expect(
    dialog().getByRole("button", { name: "Add relationship", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: "Connect nodes", exact: true })
    .click();
  await expect(overlay()).toBeVisible();
  await request("layout", { mode: "force" });
  await request("freeze");
  const positions = () =>
    state().then((s) => s.graph.nodes.map((n) => [n.iri, n.x, n.y]));
  await expect(async () => {
    const p = await positions();
    await page.waitForTimeout(120);
    expect(await positions()).toEqual(p);
  }).toPass({ timeout: 3000 });
  const paused = await state();
  expect(paused.graph.frozen).toBe(false);
  await page.keyboard.press("Escape");
  await expect
    .poll(positions)
    .not.toEqual(paused.graph.nodes.map((n) => [n.iri, n.x, n.y]));
  expect((await state()).undoLabel).toBe(paused.undoLabel);
  await page
    .getByRole("button", { name: "Connect nodes", exact: true })
    .click();
  await expect(overlay()).toBeVisible();
  await menu("pane.close");
  await expect(page.getByTestId("graph-canvas")).toBeHidden();
  await menu("view.graph");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await expect(overlay()).toHaveCount(0);
  expect((await state()).graph.frozen).toBe(false);
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
