import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot, DomainMethod } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page;
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
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    if (!item?.enabled) throw Error("Unavailable command: " + id);
    item.click({} as never, win, win.webContents as never);
  }, id);
}
const dialog = () =>
  page.getByRole("dialog", { name: "Graph appearance", exact: true });
async function number(label: string, value: number) {
  await dialog()
    .getByRole("spinbutton", { name: label, exact: true })
    .fill(String(value));
  await page.keyboard.press("Tab");
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/appearance-"));
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
    ).evaluate((w) => w.setFocusable(false));
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
    await info.attach("appearance-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});
test("settings expose dataset categories, palettes, class instance rules and a preview without changing the graph on Cancel", async () => {
  const initial = await state();
  await menu("graph.appearance");
  const d = dialog();
  await expect(d).toBeVisible();
  await expect(d.locator(".appearance-summary")).toContainText(
    "across the dataset",
  );
  await expect(
    d.getByRole("img", { name: "Graph style preview" }),
  ).toBeVisible();
  await d.getByRole("button", { name: /^Class\s/ }).click();
  await d
    .getByRole("combobox", { name: "Palette", exact: true })
    .selectOption("1");
  await d.getByRole("button", { name: "Apply palette to node kinds" }).click();
  await d
    .getByRole("combobox", { name: "Browse", exact: true })
    .selectOption("classes");
  await d
    .getByRole("textbox", { name: "Find style category" })
    .fill("American");
  await d.locator('[role="treeitem"][data-entity-iri$="#American"]').click();
  await d
    .getByRole("combobox", { name: "Apply to", exact: true })
    .selectOption("instances");
  await d.getByRole("button", { name: "Use color #332288" }).click();
  await d.getByRole("tab", { name: "Advanced", exact: true }).click();
  await expect(
    d.getByRole("textbox", { name: "Graph stylesheet" }),
  ).toHaveValue(/node\[type=".*American"\]/);
  await d.getByRole("tab", { name: "Nodes", exact: true }).click();
  await page.screenshot({
    path: "artifacts/testing/graph-appearance-nodes.png",
  });
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await state()).graph.stylesheet).toBe(initial.graph.stylesheet);
});
test("weighted sizing and relationship styles apply, undo, export, and reopen consistently", async () => {
  await request("freeze");
  await menu("graph.appearance");
  const d = dialog();
  await d.getByRole("tab", { name: "Sizing", exact: true }).click();
  await d
    .getByRole("combobox", { name: "Size by", exact: true })
    .selectOption("weighted");
  await number("Minimum diameter (px)", 20);
  await number("Maximum diameter (px)", 72);
  await number("Connections weight", 25);
  await number("Instances weight", 75);
  await d
    .getByRole("combobox", { name: "Distribution", exact: true })
    .selectOption("log");
  await page.screenshot({
    path: "artifacts/testing/graph-appearance-sizing.png",
  });
  await d.getByRole("tab", { name: "Relationships", exact: true }).click();
  await d
    .getByRole("textbox", { name: "Find style category" })
    .fill("subClassOf");
  await d.getByRole("button", { name: "Use color #aa3377" }).click();
  await number("Line width (px)", 3);
  await d
    .getByRole("combobox", { name: "Line style", exact: true })
    .selectOption("dashed");
  await d.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(d).toHaveCount(0);
  const applied = await state(),
    css = applied.graph.stylesheet!;
  expect(css).toContain("size-by: weighted");
  expect(css).toContain("stroke: #aa3377");
  expect(
    applied.graph.nodes.every((n) => n.radius >= 10 && n.radius <= 36),
  ).toBe(true);
  const radii = applied.graph.nodes.map((n) => [n.iri, n.radius]);
  await menu("edit.undo");
  await expect.poll(async () => (await state()).graph.stylesheet).toBe("");
  await menu("edit.redo");
  await expect.poll(async () => (await state()).graph.stylesheet).toBe(css);
  expect((await state()).graph.nodes.map((n) => [n.iri, n.radius])).toEqual(
    radii,
  );
  const svg = path.resolve("artifacts/testing/graph-appearance.svg");
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
    .toContain("#aa3377");
  const file = path.resolve("artifacts/testing/graph-appearance.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(file, "utf8")).graph.stylesheet;
      } catch {
        return "";
      }
    })
    .toBe(css);
  await request("stylesheet", { text: "" });
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect.poll(async () => (await state()).graph.stylesheet).toBe(css);
  expect((await state()).graph.nodes.map((n) => [n.iri, n.radius])).toEqual(
    radii,
  );
});
test("fixed sizes update hit testing and stylesheet errors remain editable", async () => {
  await request("freeze");
  await menu("graph.appearance");
  const d = dialog();
  await d.getByRole("tab", { name: "Sizing", exact: true }).click();
  await d
    .getByRole("combobox", { name: "Size by", exact: true })
    .selectOption("fixed");
  await number("Diameter (px)", 100);
  await d.getByRole("button", { name: "Apply", exact: true }).click();
  await request("select", { iri: null });
  await menu("graph.fit");
  await page.waitForTimeout(400);
  const s = await state(),
    n = s.graph.nodes[0];
  expect(n.radius).toBe(50);
  const cam = await page.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState!["graph.camera"] as {
        x: number;
        y: number;
        zoom: number;
      },
  );
  const box = (await page.getByTestId("graph-canvas").boundingBox())!;
  await page.mouse.click(
    box.x + cam.x + (n.x + 35) * cam.zoom,
    box.y + cam.y + n.y * cam.zoom,
  );
  expect((await state()).selected).toBe(n.iri);
  await menu("graph.styles");
  const advanced = page.getByRole("dialog", {
    name: "Graph stylesheet",
    exact: true,
  });
  await advanced
    .getByRole("textbox", { name: "Graph stylesheet" })
    .fill("node {size-min:70;size-max:20}");
  await expect(advanced.getByRole("alert")).toContainText("Minimum");
  await expect(
    advanced.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await advanced
    .getByRole("textbox", { name: "Graph stylesheet" })
    .fill("node {size:32}");
  await advanced.getByRole("button", { name: "Apply", exact: true }).click();
  expect((await state()).graph.nodes.every((n) => n.radius === 16)).toBe(true);
});

test("class styles browse a virtual taxonomy and apply to a branch", async () => {
  const folder = await mkdtemp(
    path.resolve("artifacts/testing/style-taxonomy-"),
  );
  const base = "https://example.test/style/",
    file = path.join(folder, "taxonomy.ttl");
  await writeFile(
    file,
    "@prefix :<" +
      base +
      ">. @prefix owl:<http://www.w3.org/2002/07/owl#>. @prefix rdfs:<http://www.w3.org/2000/01/rdf-schema#>. :Root a owl:Class. :Branch a owl:Class;rdfs:subClassOf :Root.\n" +
      Array.from(
        { length: 6000 },
        (_, i) => ":Course" + i + " a owl:Class;rdfs:subClassOf :Branch.",
      ).join("\n"),
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect.poll(async () => (await state()).classCount).toBe(6003);
  await request("seed", {
    iris: [base + "Root", base + "Branch", base + "Course5999"],
    expand: false,
  });
  await request("select", { iri: base + "Root" });
  await menu("graph.appearance");
  const d = dialog();
  await d
    .getByRole("combobox", { name: "Browse", exact: true })
    .selectOption("classes");
  const tree = d.getByRole("tree", { name: "Style class hierarchy" });
  const root = tree.locator('[data-entity-iri="' + base + 'Root"]');
  await expect(root).toHaveAttribute("aria-level", "1");
  await root.getByRole("button", { name: "Expand Root", exact: true }).click();
  const branch = tree.locator('[data-entity-iri="' + base + 'Branch"]');
  await expect(branch).toHaveAttribute("aria-level", "2");
  await branch.click();
  await branch
    .getByRole("button", { name: "Expand Branch", exact: true })
    .click();
  expect(await tree.getByRole("treeitem").count()).toBeLessThan(60);
  await d
    .getByRole("textbox", { name: "Find style category" })
    .fill("Course5999");
  await expect(tree.getByRole("treeitem")).toHaveCount(3);
  await expect(
    tree.locator('[data-entity-iri="' + base + 'Course5999"]'),
  ).toHaveAttribute("aria-level", "3");
  await d.getByRole("textbox", { name: "Find style category" }).fill("");
  await d
    .getByRole("combobox", { name: "Apply to", exact: true })
    .selectOption("branch");
  await d.getByRole("button", { name: "Use color #4477aa" }).click();
  await page.screenshot({ path: "artifacts/testing/style-taxonomy-6000.png" });
  await d.getByRole("button", { name: "Apply", exact: true }).click();
  const s = await state();
  expect(s.graph.stylesheet).toContain('node[ancestor="' + base + 'Branch"]');
  expect(
    s.graph.nodes.find((n) => n.iri === base + "Course5999")?.taxonomyAncestors,
  ).toContain(base + "Branch");
  expect(
    s.graph.nodes.find((n) => n.iri === base + "Root")?.taxonomyAncestors ?? [],
  ).not.toContain(base + "Branch");
});

test("Expand and Collapse preserve the action node's screen position in every layout", async () => {
  test.setTimeout(120000);
  const iri = (await state()).entities.find((e) => e.name === "Pizza")!.iri;
  const canvas = page.getByTestId("graph-canvas");
  async function position() {
    const n = (await state()).graph.nodes.find((n) => n.iri === iri)!;
    const camera = await page.evaluate(
      async () =>
        (await window.axiom.preferences.load()).panelState!["graph.camera"] as {
          x: number;
          y: number;
          zoom: number;
        },
    );
    const box = (await canvas.boundingBox())!;
    return {
      x: box.x + camera.x + n.x * camera.zoom,
      y: box.y + camera.y + n.y * camera.zoom,
      zoom: camera.zoom,
    };
  }
  for (const mode of [
    "force",
    "hierarchy",
    "radial",
    "grid",
    "circle",
    "elk-layered",
    "elk-stress",
    "elk-tree",
  ]) {
    if (!(await state()).graph.frozen) await request("freeze");
    await request("seed", { iris: [iri], expand: false });
    await request("select", { iri });
    await request("layout", { mode });
    await expect
      .poll(async () => (await state()).graph.layoutPending)
      .toBeFalsy();
    await menu("graph.fit");
    await page.waitForTimeout(250);
    const before = await position();
    await menu("graph.expand");
    await expect
      .poll(async () => (await state()).graph.nodes.length)
      .toBeGreaterThan(1);
    await expect
      .poll(async () => (await state()).graph.layoutPending)
      .toBeFalsy();
    await page.waitForTimeout(350);
    expect(await position(), mode + " expand").toEqual(before);
    await request("freeze");
    await page.waitForTimeout(350);
    expect(await position(), mode + " settle").toEqual(before);
    await menu("graph.collapse");
    await expect
      .poll(async () => (await state()).graph.layoutPending)
      .toBeFalsy();
    await page.waitForTimeout(350);
    expect(await position(), mode + " collapse").toEqual(before);
  }
});
