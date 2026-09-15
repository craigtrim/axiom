import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }, id) =>
          Menu.getApplicationMenu()!.getMenuItemById(id)?.enabled,
        id,
      ),
    )
    .toBe(true);
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/edges-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
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
});
test.afterEach(async () => {
  await app.close();
  expect(errors).toEqual([]);
});

async function prepare() {
  await menu("file.new");
  const ids = await page.evaluate(async () => {
    const root = "http://www.w3.org/2002/07/owl#Thing";
    const a = await window.axiom.request<string>("createClass", {
      name: "Alpha",
      parent: root,
      position: { x: -180, y: 0 },
    });
    const b = await window.axiom.request<string>("createClass", {
      name: "Beta",
      parent: root,
      position: { x: 180, y: 0 },
    });
    const c = await window.axiom.request<string>("createClass", {
      name: "Gamma",
      parent: root,
      position: { x: 0, y: 180 },
    });
    const d = await window.axiom.request<any>("entityDocument", { iri: a });
    const predicate = "https://example.org/related";
    await window.axiom.request("updateEntity", {
      iri: a,
      statements: [
        ...d.statements,
        { subject: a, predicate, object: { literal: false, value: b } },
      ],
      version: d.version,
      datasetEpoch: d.datasetEpoch,
    });
    await window.axiom.request("seed", { iris: [a, b], expand: false });
    await window.axiom.request("layout", { mode: "force" });
    await window.axiom.request("freeze");
    return { a, b, c, predicate, key: JSON.stringify([a, predicate, b]) };
  });
  await menu("graph.fit");
  await expect(
    page
      .getByRole("combobox", { name: "Select edge", exact: true })
      .locator("option"),
  ).toHaveCount(2);
  return ids;
}
const selectEdge = async (key: string) => {
  await page
    .getByRole("combobox", { name: "Select edge", exact: true })
    .selectOption(key);
  await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
    "data-selected-edge",
    key,
  );
};
test("edges select on the line, edit endpoints and predicates, and delete independently of nodes", async () => {
  const ids = await prepare(),
    canvas = page.getByTestId("graph-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(canvas).toHaveAttribute("data-selected-edge", ids.key);
  await expect(
    page.getByRole("button", { name: "Bend edge", exact: true }),
  ).toBeVisible();
  const inspector = page.getByRole("region", {
    name: "Edge inspector",
    exact: true,
  });
  await expect(inspector).toBeVisible();
  expect((await state()).selected).toBeNull();
  await inspector
    .getByRole("combobox", { name: "Edge target", exact: true })
    .selectOption(ids.c);
  await inspector
    .getByRole("combobox", { name: "Edge relationship", exact: true })
    .fill("https://example.org/dependsOn");
  await inspector.getByRole("button", { name: "Apply edge changes" }).click();
  const next = JSON.stringify([ids.a, "https://example.org/dependsOn", ids.c]);
  await expect(canvas).toHaveAttribute("data-selected-edge", next);
  expect((await state()).graph.nodes).toHaveLength(3);
  expect((await state()).classCount).toBe(4);
  await menu("edit.undo");
  await expect(canvas).toHaveAttribute("data-selected-edge", ids.key);
  expect((await state()).graph.nodes).toHaveLength(2);
  await menu("edit.redo");
  await expect(canvas).toHaveAttribute("data-selected-edge", next);
  await canvas.focus();
  await page.keyboard.press("Delete");
  await expect(canvas).toHaveAttribute("data-selected-edge", "");
  expect((await state()).classCount).toBe(4);
  expect((await state()).graph.nodes).toHaveLength(3);
  expect(
    (await state()).graph.edges.some(
      (e) => e.predicate === "https://example.org/dependsOn",
    ),
  ).toBe(false);
  await menu("edit.undo");
  await expect(canvas).toHaveAttribute("data-selected-edge", next);
  await page.screenshot({ path: "artifacts/testing/edge-inspector.png" });
});
test("dragging and keyboard bending save routes with Undo, Redo and workspace reload", async () => {
  const ids = await prepare();
  await selectEdge(ids.key);
  const bend = page.getByRole("button", { name: "Bend edge", exact: true }),
    box = (await bend.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        !!(await state()).graph.edges.find((e) => e.predicate === ids.predicate)
          ?.bend,
    )
    .toBe(true);
  const moved = (await state()).graph.edges.find(
    (e) => e.predicate === ids.predicate,
  )!.bend!;
  await menu("edit.undo");
  expect(
    (await state()).graph.edges.find((e) => e.predicate === ids.predicate)
      ?.bend,
  ).toBeUndefined();
  await menu("edit.redo");
  expect(
    (await state()).graph.edges.find((e) => e.predicate === ids.predicate)
      ?.bend,
  ).toEqual(moved);
  await bend.focus();
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(
      async () =>
        (await state()).graph.edges.find((e) => e.predicate === ids.predicate)!
          .bend!.y,
    )
    .toBeLessThan(moved.y);
  const file = path.resolve("artifacts/testing/edge-routes.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(file, "utf8").catch(() => "null"))?.graph
          ?.routes?.length,
    )
    .toBe(1);
  const saved = JSON.parse(await readFile(file, "utf8")),
    epoch = (await state()).datasetEpoch;
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
  expect(
    (await state()).graph.edges.find((e) => e.predicate === ids.predicate)
      ?.bend,
  ).toEqual({ x: saved.graph.routes[0].x, y: saved.graph.routes[0].y });
  await selectEdge(ids.key);
  await page.screenshot({ path: "artifacts/testing/edge-rerouted.png" });
  await menu("edge.resetRoute");
  expect(
    (await state()).graph.edges.find((e) => e.predicate === ids.predicate)
      ?.bend,
  ).toBeUndefined();
});
test("edge keyboard context menus reconnect and remain usable in detached windows", async () => {
  const ids = await prepare(),
    canvas = page.getByTestId("graph-canvas");
  await canvas.focus();
  await page.keyboard.press("E");
  await expect(canvas).toHaveAttribute("data-selected-edge", ids.key);
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menu", { name: "Graph edge actions" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Edit edge", exact: true }).click();
  const inspector = page.getByRole("region", { name: "Edge inspector" });
  await inspector
    .getByRole("combobox", { name: "Edge source" })
    .selectOption(ids.c);
  await inspector.getByRole("button", { name: "Apply edge changes" }).click();
  const next = JSON.stringify([ids.c, ids.predicate, ids.b]);
  await expect(canvas).toHaveAttribute("data-selected-edge", next);
  await menu("view.graph");
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((w) => w !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  const childCanvas = child.getByTestId("graph-canvas");
  await expect(childCanvas).toHaveAttribute("data-selected-edge", next);
  await child.getByRole("button", { name: "Bend edge", exact: true }).focus();
  await child.keyboard.press("ArrowRight");
  await expect
    .poll(
      async () =>
        !!(await state()).graph.edges.find((e) => e.predicate === ids.predicate)
          ?.bend,
    )
    .toBe(true);
  await childCanvas.focus();
  await child.keyboard.press("Delete");
  await expect(childCanvas).toHaveAttribute("data-selected-edge", "");
  await menu("edit.undo");
  await expect(childCanvas).toHaveAttribute("data-selected-edge", next);
  await menu("pane.reattach");
});

test("endpoint dragging reconnects a line and Escape cancels a route drag", async () => {
  const ids = await prepare();
  await selectEdge(ids.key);
  const bend = page.getByRole("button", { name: "Bend edge", exact: true });
  const bb = (await bend.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 - 40, {
    steps: 5,
  });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await state()).graph.edges[0].bend).toBeUndefined();
  await selectEdge(ids.key);
  const source = (await page
    .getByRole("button", { name: "Reconnect edge source" })
    .boundingBox())!;
  const target = (await page
    .getByRole("button", { name: "Reconnect edge target" })
    .boundingBox())!;
  const canvasBox = (await page.getByTestId("graph-canvas").boundingBox())!;
  await expect
    .poll(
      async () =>
        !!(await page.evaluate(() => window.axiom.preferences.load()))
          .panelState?.["graph.camera"],
    )
    .toBe(true);
  const camera = await page.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState?.["graph.camera"] as {
        x: number;
        y: number;
        zoom: number;
      },
  );
  const node = (await state()).graph.nodes.find((n) => n.iri === ids.a)!;
  const destination = {
    x: canvasBox.x + node.x * camera.zoom + camera.x,
    y: canvasBox.y + node.y * camera.zoom + camera.y,
  };
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 10 });
  await page.mouse.up();
  const loop = JSON.stringify([ids.a, ids.predicate, ids.a]);
  await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
    "data-selected-edge",
    loop,
  );
  expect((await state()).classCount).toBe(4);
  await menu("edit.undo");
  await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
    "data-selected-edge",
    ids.key,
  );
});
test("parallel statement graphs edit individually and stale edge drafts require reload", async () => {
  const ids = await prepare();
  await page.evaluate(async ({ a, b, predicate }) => {
    const d = await window.axiom.request<any>("entityDocument", { iri: a });
    await window.axiom.request("updateEntity", {
      iri: a,
      version: d.version,
      datasetEpoch: d.datasetEpoch,
      statements: [
        ...d.statements,
        {
          subject: a,
          predicate,
          object: { value: b, literal: false },
          graph: "https://example.org/second",
        },
      ],
    });
  }, ids);
  await selectEdge(ids.key);
  const inspector = page.getByRole("region", { name: "Edge inspector" });
  await inspector
    .getByRole("combobox", { name: "Edge statement graph" })
    .selectOption("1");
  await inspector
    .getByRole("button", { name: "Remove edge", exact: true })
    .click();
  await expect(
    inspector.getByRole("combobox", { name: "Edge statement graph" }),
  ).toHaveCount(0);
  const doc = await page.evaluate(
    (key) => window.axiom.request<any>("edgeDocument", { key }),
    ids.key,
  );
  expect(doc.statements).toHaveLength(1);
  expect(doc.statements[0].graph).toBeUndefined();
  await inspector
    .getByRole("combobox", { name: "Edge target" })
    .selectOption(ids.c);
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Updated Beta" }),
    ids.b,
  );
  await expect(
    inspector.getByRole("button", { name: "Apply edge changes" }),
  ).toBeDisabled();
  await expect(inspector.getByRole("alert")).toContainText("ontology changed");
  await inspector.getByRole("button", { name: "Reload edge" }).click();
  await expect(
    inspector.getByRole("button", { name: "Apply edge changes" }),
  ).toBeEnabled();
  await expect(
    inspector.getByRole("combobox", { name: "Edge target" }),
  ).toHaveValue(ids.b);
});
