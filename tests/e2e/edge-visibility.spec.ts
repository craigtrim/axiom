import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
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
  profile = await mkdtemp(path.resolve("artifacts/testing/visibility-"));
  app = await launchExample(options());
  await attach();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("visibility-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
const checkbox = () =>
  page
    .locator(".graph-panel:visible")
    .getByRole("checkbox", { name: "Show edges", exact: true })
    .first();
const shape = (s: Snapshot) => ({
  version: s.version,
  tripleCount: s.tripleCount,
  nodes: s.graph.nodes.map((n) => [n.iri, n.x, n.y]),
  edges: s.graph.edges.map((e) => [e.source, e.predicate, e.target]),
});
test("Show edges affects only visibility, removes hidden targets, supports Undo and exports the visible view", async () => {
  await expect(checkbox()).toBeChecked();
  await request("freeze");
  await request("layout", { mode: "circle" });
  await request("stylesheet", { text: "edge {stroke:#ed1278;stroke-width:3}" });
  await menu("graph.fit");
  const initial = await state();
  const edge = initial.graph.edges[0];
  await request("selectEdge", {
    key: JSON.stringify([edge.source, edge.predicate, edge.target]),
  });
  const canvas = page.getByTestId("graph-canvas");
  const before = await canvas.screenshot();
  await checkbox().uncheck();
  await expect.poll(async () => (await state()).graph.edgesVisible).toBe(false);
  await expect(canvas).toHaveAttribute("data-selected-edge", "");
  await expect(
    page.getByRole("combobox", { name: "Select edge", exact: true }),
  ).toBeDisabled();
  await expect(canvas.locator('[id^="graph-edge-option-"]')).toHaveCount(0);
  expect(shape(await state())).toEqual(shape(initial));
  await canvas.focus();
  await page.keyboard.press("e");
  expect((await state()).graph.selectedEdge).toBeNull();
  await checkbox().focus();
  await page.waitForTimeout(150);
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await page.screenshot({ path: "artifacts/testing/hidden-edges.png" });
  const svg = path.join(profile, "nodes.svg");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, svg);
  await menu("graph.export.svg");
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Export", exact: true })
    .click();
  await expect
    .poll(async () => {
      try {
        return await readFile(svg, "utf8");
      } catch {
        return "";
      }
    })
    .toContain("relationships (hidden)");
  expect(await readFile(svg, "utf8")).not.toContain("#ed1278");
  await checkbox().focus();
  await page.keyboard.press("Control+z");
  await expect(checkbox()).toBeChecked();
  await page.keyboard.press("Control+y");
  await expect(checkbox()).not.toBeChecked();
  await checkbox().check();
  await expect(
    page.getByRole("combobox", { name: "Select edge", exact: true }),
  ).toBeEnabled();
  expect(shape(await state())).toEqual(shape(initial));
});
test("each graph remembers edge and count visibility in a saved workspace and restored session", async () => {
  const counts = () =>
    page
      .locator(".graph-panel:visible")
      .getByRole("checkbox", { name: "Show counts", exact: true })
      .first();
  await expect(counts()).toBeChecked();
  await counts().click();
  await expect(counts()).not.toBeChecked();
  await checkbox().uncheck();
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
  const second = page
    .locator('[data-graph-id="' + id + '"]')
    .getByRole("checkbox", { name: "Show edges", exact: true });
  await expect(second).toBeChecked();
  await expect(counts()).toBeChecked();
  const file = path.join(profile, "Visibility.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  const doc = JSON.parse(await readFile(file, "utf8"));
  expect(doc.graphs.graph.edgesVisible).toBe(false);
  expect(doc.graphs[id].edgesVisible).toBe(true);
  expect(doc.graphs.graph.countsVisible).toBe(false);
  expect(doc.graphs[id].countsVisible).toBe(true);
  await app.close();
  app = await electron.launch(options());
  await attach();
  const restored = await state();
  expect(restored.graphs!.graph.edgesVisible).toBe(false);
  expect(restored.graphs![id].edgesVisible).toBe(true);
  expect(restored.graphs!.graph.countsVisible).toBe(false);
  expect(restored.graphs![id].countsVisible).toBe(true);
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  await expect(checkbox()).not.toBeChecked();
  await expect(counts()).not.toBeChecked();
});

test("Show counts hides badges without moving nodes or hiding edges and supports export and Undo", async () => {
  const counts = page
    .locator(".graph-panel:visible")
    .getByRole("checkbox", { name: "Show counts", exact: true })
    .first();
  await expect(counts).toBeChecked();
  await request("freeze");
  await request("layout", { mode: "circle" });
  await request("stylesheet", { text: "edge {stroke:#ed1278;stroke-width:3}" });
  await menu("graph.fit");
  const initial = await state();
  expect(initial.graph.nodes.some((n) => n.degree > n.shownDegree)).toBe(true);
  const canvas = page.getByTestId("graph-canvas");
  const before = await canvas.screenshot();
  await counts.click();
  await expect
    .poll(async () => (await state()).graph.countsVisible)
    .toBe(false);
  await expect(checkbox()).toBeChecked();
  expect(shape(await state())).toEqual(shape(initial));
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  await page.screenshot({ path: "artifacts/testing/hidden-counts.png" });
  const svg = path.join(profile, "no-counts.svg");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, svg);
  await menu("graph.export.svg");
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Export", exact: true })
    .click();
  await expect
    .poll(async () => {
      try {
        return await readFile(svg, "utf8");
      } catch {
        return "";
      }
    })
    .toContain("#ed1278");
  expect(await readFile(svg, "utf8")).not.toMatch(/>\+\d[^<]*</);
  await counts.focus();
  await page.keyboard.press("Control+z");
  await expect(counts).toBeChecked();
  await page.keyboard.press("Control+y");
  await expect(counts).not.toBeChecked();
  await counts.click();
  await expect(counts).toBeChecked();
  expect(shape(await state())).toEqual(shape(initial));
});
