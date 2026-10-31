// #165: reveal the responsive filter through the existing real overflow control.
import { hierarchyFilter } from "./hierarchy-controls";
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
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
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
// craigtrim/axiom#187: Show labels.
const labels = () =>
  page
    .locator(".graph-panel:visible")
    .getByRole("checkbox", { name: "Show labels", exact: true })
    .first();
const camera = () =>
  page.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState?.["graph.camera"] as
        { x: number; y: number; zoom: number } | undefined,
  );
/** The Graph appearance dialog's preview once it has stopped changing, after which the dialog is cancelled. */
async function stylePreview() {
  await menu("graph.appearance");
  const d = page.getByRole("dialog", { name: "Graph appearance", exact: true }),
    preview = d.getByRole("img", { name: "Graph style preview" });
  // The preview is mounted again once the dataset summary loads.
  await expect(d.locator(".appearance-summary")).toContainText(
    "across the dataset",
  );
  let shot: Buffer | undefined;
  await expect
    .poll(async () => {
      const next = await preview.screenshot().catch(() => undefined),
        same = !!next && !!shot && shot.equals(next);
      shot = next;
      return same;
    })
    .toBe(true);
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(d).toBeHidden();
  return shot!;
}
/** A viewport SVG export's text elements and its path count, with or without All node labels. */
async function viewportExport(name: string, allLabels: boolean) {
  const file = path.join(profile, name + ".svg");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("graph.export.svg");
  const d = page.getByRole("dialog", { name: "Export", exact: true });
  await d
    .getByRole("combobox", { name: "Diagram area", exact: true })
    .selectOption("viewport");
  await d
    .getByRole("checkbox", { name: "All node labels", exact: true })
    .setChecked(allLabels);
  await d
    .getByRole("checkbox", { name: "Title and caption", exact: true })
    .uncheck();
  await d.getByRole("checkbox", { name: "Legend", exact: true }).uncheck();
  await d.getByRole("button", { name: "Export", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(file, "utf8")).includes("</svg>");
      } catch {
        return false;
      }
    })
    .toBe(true);
  const svg = await readFile(file, "utf8");
  return {
    texts: [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]),
    paths: svg.match(/<path /g)?.length ?? 0,
  };
}
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
  // State returns asynchronously from the domain worker; click once, then
  // await the observable result instead of requiring a synchronous toggle.
  await checkbox().click();
  await expect(checkbox()).not.toBeChecked();
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
  await checkbox().click();
  await expect(checkbox()).toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Select edge", exact: true }),
  ).toBeEnabled();
  expect(shape(await state())).toEqual(shape(initial));
});
test("each graph remembers edge, label and count visibility in a saved workspace and restored session", async () => {
  const counts = () =>
    page
      .locator(".graph-panel:visible")
      .getByRole("checkbox", { name: "Show counts", exact: true })
      .first();
  await expect(counts()).toBeChecked();
  await counts().click();
  await expect(counts()).not.toBeChecked();
  await expect(labels()).toBeChecked();
  await labels().click();
  await expect(labels()).not.toBeChecked();
  // State returns asynchronously from the domain worker; click once, then
  // await the observable result instead of requiring a synchronous toggle.
  await checkbox().click();
  await expect(checkbox()).not.toBeChecked();
  await (await hierarchyFilter(page)).fill("Pizza");
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
  await expect(labels()).toBeChecked();
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
  expect(doc.graphs.graph.labelsVisible).toBe(false);
  expect(doc.graphs[id].labelsVisible).toBe(true);
  // The top-level graph is the active one, the new graph.
  expect(doc.graph.labelsVisible).toBe(true);
  await app.close();
  app = await electron.launch(options());
  await attach();
  const restored = await state();
  expect(restored.graphs!.graph.edgesVisible).toBe(false);
  expect(restored.graphs![id].edgesVisible).toBe(true);
  expect(restored.graphs!.graph.countsVisible).toBe(false);
  expect(restored.graphs![id].countsVisible).toBe(true);
  expect(restored.graphs!.graph.labelsVisible).toBe(false);
  expect(restored.graphs![id].labelsVisible).toBe(true);
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  await expect(checkbox()).not.toBeChecked();
  await expect(counts()).not.toBeChecked();
  await expect(labels()).not.toBeChecked();
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

test("Show labels hides every node name and its click target without moving nodes, keeps edges and badges, and supports Undo", async () => {
  await expect(labels()).toBeChecked();
  await request("freeze");
  await request("layout", { mode: "circle" });
  // Unstyled radii, so a node's name starts where the test expects it.
  await request("stylesheet", { text: "" });
  await request("select", { iri: null });
  await menu("graph.fit");
  // The fitted camera is saved after a 250 ms debounce, so wait until the saved camera stops changing.
  let saved: string | undefined;
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await camera()),
          settled = now !== undefined && now === saved;
        saved = now;
        return settled;
      },
      { intervals: [300] },
    )
    .toBe(true);
  await page.mouse.move(0, 0);
  const preview = await stylePreview(),
    initial = await state(),
    view = (await camera())!,
    screen = (n: { x: number; y: number }) => ({
      x: n.x * view.zoom + view.x,
      y: n.y * view.zoom + view.y,
    }),
    // A name starts 4 px below its node's shape, and the node's own hit area ends at 4 px.
    spot = (n: (typeof initial.graph.nodes)[number]) => ({
      x: screen(n).x,
      y: screen(n).y + n.radius * view.zoom + 10,
    }),
    names = initial.graph.nodes.map((n) => n.label.slice(0, 20)),
    named = (texts: string[]) =>
      texts.filter((t) => names.some((name) => t.startsWith(name))),
    badges = (texts: string[]) => texts.filter((t) => /^\+\d/.test(t)),
    shown = await viewportExport("labels-shown", false),
    node = initial.graph.nodes.find(
      (n) =>
        shown.texts.includes(n.label) &&
        initial.graph.nodes.every(
          (o) =>
            o === n ||
            Math.hypot(spot(n).x - screen(o).x, spot(n).y - screen(o).y) >
              o.radius * view.zoom + 24,
        ),
    )!;
  expect(node).toBeTruthy();
  const canvas = page.getByTestId("graph-canvas");
  // With its name drawn, a click on the name selects the node.
  await canvas.click({ position: spot(node) });
  await expect.poll(async () => (await state()).selected).toBe(node.iri);
  await request("select", { iri: null });
  await labels().click();
  await expect
    .poll(async () => (await state()).graph.labelsVisible)
    .toBe(false);
  expect(shape(await state())).toEqual(shape(initial));
  for (const [name, allLabels] of [
    ["labels-hidden", false],
    ["labels-hidden-all", true],
  ] as const) {
    const hidden = await viewportExport(name, allLabels);
    expect(named(hidden.texts)).toEqual([]);
    expect(badges(hidden.texts)).toEqual(badges(shown.texts));
    expect(hidden.paths).toBe(shown.paths);
  }
  await page.screenshot({ path: "artifacts/testing/hidden-labels.png" });
  // The Graph appearance preview draws sample nodes, not the graph, so it keeps their names.
  expect((await stylePreview()).equals(preview)).toBe(true);
  await canvas.click({ position: spot(node) });
  await labels().focus();
  await page.keyboard.press("Control+z");
  await expect(labels()).toBeChecked();
  // Undo ran after the click, so a selection from that click would show by now.
  expect((await state()).selected).toBeNull();
  await page.keyboard.press("Control+y");
  await expect(labels()).not.toBeChecked();
  await labels().click();
  await expect(labels()).toBeChecked();
  expect(shape(await state())).toEqual(shape(initial));
});
