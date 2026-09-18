import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import type { Snapshot, DomainMethod } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
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
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click({} as never, win, win.webContents as never);
  }, id);
}
function options() {
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  };
}
async function attach() {
  page = await app.firstWindow();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((w) => w.setFocusable(false));
  await expect(
    page
      .locator(".graph-panel:visible")
      .getByRole("checkbox", { name: "Show edges", exact: true })
      .first(),
  ).toBeVisible();
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/graph-zoom-"));
  app = await launchExample(options());
  await attach();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("graph-zoom-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

const panel = () => page.locator(".graph-panel:visible").first();
const canvas = () => panel().getByTestId("graph-canvas");
const camera = (id = "graph") =>
  page.evaluate(
    async (id) =>
      (await window.axiom.preferences.load()).panelState?.[
        id === "graph" ? "graph.camera" : "graph.camera." + id
      ] as { x: number; y: number; zoom: number } | undefined,
    id,
  );
async function fitGraph() {
  await panel().getByRole("button", { name: "Fit", exact: true }).click();
  // Let the 250 ms preference debounce replace any previously saved camera.
  await page.waitForTimeout(400);
  await expect.poll(async () => (await camera())?.zoom ?? 0).toBeGreaterThan(0);
}

test("wheel and keyboard zoom continue below the former floor and Fit recovers the view", async () => {
  await request("freeze");
  await request("layout", { mode: "circle" });
  await fitGraph();
  const initial = await state(),
    before = (await camera())!,
    anchor = { x: 240, y: 180 };
  await canvas().hover({ position: anchor });
  await page.mouse.wheel(0, 4000);
  await expect
    .poll(async () => (await camera())?.zoom ?? 1)
    .toBeLessThan(0.005);
  const out = (await camera())!;
  expect(out.zoom).toBeCloseTo(before.zoom * Math.exp(-6), 8);
  // Native pointer coordinates round fractional pane offsets to a screen pixel.
  expect(
    Math.abs(out.x - (anchor.x - (anchor.x - before.x) * Math.exp(-6))),
  ).toBeLessThan(1);
  expect(
    Math.abs(out.y - (anchor.y - (anchor.y - before.y) * Math.exp(-6))),
  ).toBeLessThan(1);
  await canvas().focus();
  await canvas().press("-");
  await expect
    .poll(async () => (await camera())?.zoom ?? 1)
    .toBeCloseTo(out.zoom / 1.2, 10);
  await menu("graph.zoom.in");
  await expect
    .poll(async () => (await camera())?.zoom ?? 1)
    .toBeCloseTo(out.zoom, 10);
  await fitGraph();
  await expect
    .poll(async () => (await camera())?.zoom ?? 0)
    .toBeCloseTo(before.zoom, 8);
  const after = await state();
  expect(after.version).toBe(initial.version);
  expect(after.graph.nodes.map((n) => [n.iri, n.x, n.y])).toEqual(
    initial.graph.nodes.map((n) => [n.iri, n.x, n.y]),
  );
});

test("Fit includes widely separated nodes and still allows further zooming out", async () => {
  const iris = [
    "http://www.co-ode.org/ontologies/pizza/pizza.owl#Pizza",
    "http://www.co-ode.org/ontologies/pizza/pizza.owl#PizzaBase",
  ];
  await request("freeze");
  await request("seed", { iris, expand: false });
  await request("drag", {
    iri: iris[0],
    x: -1000000,
    y: -1000000,
    dragging: false,
  });
  await request("drag", {
    iri: iris[1],
    x: 1000000,
    y: 1000000,
    dragging: false,
  });
  await fitGraph();
  await expect
    .poll(async () => (await camera())?.zoom ?? 1)
    .toBeLessThan(0.001);
  const view = (await camera())!,
    box = await canvas().boundingBox();
  for (const n of (await state()).graph.nodes) {
    const x = n.x * view.zoom + view.x,
      y = n.y * view.zoom + view.y;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(box!.width);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(box!.height);
  }
  await canvas().focus();
  await canvas().press("-");
  await expect
    .poll(async () => (await camera())?.zoom ?? 1)
    .toBeCloseTo(view.zoom / 1.2, 10);
  await page.screenshot({ path: "artifacts/testing/graph-wide-zoom.png" });
});

test("each graph restores its own small zoom after restarting", async () => {
  await fitGraph();
  await canvas().hover();
  await page.mouse.wheel(0, 6000);
  await expect
    .poll(async () => (await camera())?.zoom ?? 1)
    .toBeLessThan(0.001);
  const first = (await camera())!;
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill("Pizza");
  await page
    .locator('[data-entity-iri$="#Pizza"]')
    .first()
    .click({ button: "right" });
  await page
    .getByRole("menu", { name: "Entity actions", exact: true })
    .getByRole("menuitem", { name: "Show in graph", exact: true })
    .hover();
  await page
    .getByRole("menu", { name: "Show in graph", exact: true })
    .getByRole("menuitem", { name: "New graph", exact: true })
    .click();
  await expect
    .poll(async () => (await state()).activeGraphId)
    .not.toBe("graph");
  const id = (await state()).activeGraphId!;
  await expect
    .poll(async () => (await camera(id))?.zoom ?? 0)
    .toBeGreaterThan(0);
  await canvas().hover();
  await page.mouse.wheel(0, 4500);
  await expect
    .poll(async () => (await camera(id))?.zoom ?? 1)
    .toBeLessThan(0.005);
  const second = (await camera(id))!;
  const file = path.join(profile, "Zoom.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app.close();
  app = await electron.launch(options());
  await attach();
  await expect.poll(() => camera()).toEqual(first);
  await expect.poll(() => camera(id)).toEqual(second);
  await page.getByRole("tab", { name: "Graph 2", exact: true }).click();
  await canvas().focus();
  await canvas().press("-");
  await expect
    .poll(async () => (await camera(id))?.zoom ?? 1)
    .toBeCloseTo(second.zoom / 1.2, 10);
  expect(await camera()).toEqual(first);
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  await canvas().focus();
  await canvas().press("-");
  await expect
    .poll(async () => (await camera())?.zoom ?? 1)
    .toBeCloseTo(first.zoom / 1.2, 10);
});
