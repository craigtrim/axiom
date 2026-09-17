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
    page.getByRole("slider", { name: "Node spacing", exact: true }).first(),
  ).toBeVisible();
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/spacing-"));
  app = await launchExample(options());
  await attach();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("spacing-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
const slider = () =>
  page.getByRole("slider", { name: "Node spacing", exact: true }).first();
const camera = () =>
  page.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState!["graph.camera"],
  );
const coordinates = (g: Snapshot["graph"]) =>
  g.nodes.map((n) => [n.iri, n.x, n.y]);

test("the footer slider changes every layout, keeps zoom and pins, and retains spacing on relayout", async () => {
  test.setTimeout(120000);
  await request("freeze");
  const original = (await state()).graph.nodes.map((n) => n.iri);
  for (const mode of [
    "auto",
    "force",
    "hierarchy",
    "radial",
    "grid",
    "circle",
    "elk-layered",
    "elk-stress",
    "elk-tree",
  ]) {
    await request("spacing", { value: 1 });
    await request("seed", { iris: original, expand: false });
    await request("layout", { mode });
    await expect
      .poll(async () => (await state()).graph.layoutPending)
      .toBeFalsy();
    await menu("graph.fit");
    await page.waitForTimeout(200);
    const before = (await state()).graph,
      cameraBefore = await camera();
    const pin = before.nodes[0];
    await request("pin", { iri: pin.iri });
    await slider().focus();
    await page.keyboard.press("End");
    await expect.poll(async () => (await state()).graph.spacing).toBe(3);
    await expect(slider()).toHaveAttribute("aria-valuetext", "300%");
    const after = (await state()).graph;
    expect(await camera(), mode + " camera").toEqual(cameraBefore);
    expect(after.nodes.map((n) => n.radius)).toEqual(
      before.nodes.map((n) => n.radius),
    );
    expect(after.nodes.map((n) => n.iri)).toEqual(original);
    for (const n of after.nodes) {
      const old = before.nodes.find((b) => b.iri === n.iri)!;
      expect(n.x, mode + " x").toBeCloseTo(old.x * (n.iri === pin.iri ? 1 : 3));
      expect(n.y, mode + " y").toBeCloseTo(old.y * (n.iri === pin.iri ? 1 : 3));
    }
    if (mode === "grid") {
      expect(after.groups[0].width).toBe(before.groups[0].width * 3);
      await page.screenshot({
        path: "artifacts/testing/graph-spacing-grid.png",
      });
    }
    await request("pin", { iri: pin.iri });
    await request("layout", { mode });
    await expect
      .poll(async () => (await state()).graph.layoutPending)
      .toBeFalsy();
    const relaid = (await state()).graph;
    expect(relaid.spacing).toBe(3);
    for (const n of relaid.nodes) {
      const old = before.nodes.find((b) => b.iri === n.iri)!;
      expect(n.x, mode + " relayout x").toBeCloseTo(old.x * 3);
      expect(n.y, mode + " relayout y").toBeCloseTo(old.y * 3);
    }
    await slider().focus();
    await page.keyboard.press("Home");
    await expect.poll(async () => (await state()).graph.spacing).toBe(0.5);
  }
});

test("a pointer drag previews spacing and creates one undo step", async () => {
  await request("freeze");
  await request("layout", { mode: "grid" });
  await menu("graph.fit");
  const before = (await state()).graph;
  const box = (await slider().boundingBox())!;
  const x = (value: number) =>
    box.x + 8 + ((box.width - 16) * (value - 50)) / 250;
  await page.mouse.move(x(100), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x(150), box.y + box.height / 2, { steps: 3 });
  await expect
    .poll(async () => (await state()).graph.spacing)
    .toBeGreaterThan(1.3);
  await page.mouse.move(x(250), box.y + box.height / 2, { steps: 8 });
  await expect
    .poll(async () => (await state()).graph.spacing)
    .toBeGreaterThan(2.3);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = (await state()).graph;
  expect((await state()).undoLabel).toBe("Change node spacing");
  await menu("edit.undo");
  await expect.poll(async () => (await state()).graph.spacing).toBe(1);
  expect(coordinates((await state()).graph)).toEqual(coordinates(before));
  expect((await state()).undoLabel).not.toBe("Change node spacing");
  await menu("edit.redo");
  await expect
    .poll(async () => (await state()).graph.spacing)
    .toBe(after.spacing);
  expect(coordinates((await state()).graph)).toEqual(coordinates(after));
  await slider().focus();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await state()).graph.spacing).toBe(1);
  await page.keyboard.press("Control+y");
  await expect
    .poll(async () => (await state()).graph.spacing)
    .toBe(after.spacing);
});

test("different graph tabs retain their spacing through session restart and reject stale edits", async () => {
  await request("freeze");
  await request("layout", { mode: "grid" });
  await request("spacing", { value: 1.75 });
  const initial = await state(),
    iris = initial.graph.nodes.map((n) => n.iri);
  const id = await request("graphCreate", { iris });
  expect(typeof id).toBe("string");
  await request("layout", { mode: "circle", graphId: id });
  await request("spacing", { value: 2.5, graphId: id });
  const file = path.join(profile, "Spacing.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  const stored = async () =>
    JSON.parse(await readFile(path.join(profile, "last-session.json"), "utf8"))
      .workspace;
  await expect
    .poll(async () => (await stored()).graphs[id as string]?.spacing)
    .toBe(2.5);
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved.graphs.graph.spacing).toBe(1.75);
  expect(saved.graphs[id as string].spacing).toBe(2.5);
  await request("graphActivate", { id: "graph" });
  expect((await state()).graph.spacing).toBe(1.75);
  // Closing and reopening uses the isolated profile's last-session document.
  await page.waitForTimeout(1000);
  await app.close();
  app = await electron.launch(options());
  await attach();
  await expect
    .poll(async () => (await state()).graphs?.graph.spacing)
    .toBe(1.75);
  expect((await state()).graphs?.[id as string].spacing).toBe(2.5);
  await request("spacing", { value: 3, datasetEpoch: -1, graphId: "graph" });
  expect((await state()).graphs?.graph.spacing).toBe(1.75);
});
