import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  profile = await mkdtemp(path.resolve("artifacts/testing/graph-relevance-"));
  app = await launchExample(options());
  await attach();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("graph-relevance-failure", {
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

const ns = "urn:relevance:",
  id = (name: string) => ns + name;
async function fixture() {
  const file = path.join(profile, "relevance.ttl");
  const lines = [
    "@prefix : <urn:relevance:>. @prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.",
  ];
  for (const name of ["Central", "Leaf", "Hub", "Populated"])
    lines.push(":" + name + ' a owl:Class; rdfs:label "' + name + '".');
  for (const name of ["Leaf", "Hub", "Populated"])
    lines.push(":" + name + " rdfs:subClassOf :Central.");
  for (let i = 0; i < 20; i++) {
    lines.push(":Child" + i + " a owl:Class; rdfs:subClassOf :Hub.");
    lines.push(":Person" + i + " a :Populated.");
  }
  await writeFile(file, lines.join("\n"));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("relevance.ttl");
  await request("freeze");
  await request("seed", { iris: [id("Central")], expand: true });
  await request("select", { iri: null });
  await request("stylesheet", { text: "node {size:20}" });
  await request("countVisibility", { visible: false });
  await request("edgeVisibility", { visible: false });
  for (const [name, x, y] of [
    ["Central", 0, -1000],
    ["Leaf", -160, 0],
    ["Hub", 0, 0],
    ["Populated", 160, 0],
  ] as const)
    await request("drag", { iri: id(name), x, y, dragging: false });
  await fitGraph();
}
async function zoomTo(zoom: number) {
  const before = (await camera())!;
  // Keep the competing labels under the wheel anchor when increasing zoom.
  await canvas().hover({ position: { x: before.x, y: before.y } });
  await page.mouse.wheel(0, Math.log(before.zoom / zoom) / 0.0015);
  await expect
    .poll(async () => (await camera())?.zoom ?? 0)
    .toBeCloseTo(zoom, 6);
  await page.mouse.move(0, 0);
}
let exportNumber = 0;
async function visibleLabels() {
  const file = path.join(profile, "visible-" + ++exportNumber + ".svg");
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
    .uncheck();
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
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
}

test("zoom keeps connected and populated classes readable and restores more labels when space permits", async () => {
  await fixture();
  const start = await state();
  const hub = start.graph.nodes.find((n) => n.iri === id("Hub"))!,
    populated = start.graph.nodes.find((n) => n.iri === id("Populated"))!;
  expect(populated.degree).toBe(hub.degree);
  expect(populated.relevance).toBeGreaterThan(hub.relevance!);
  await zoomTo(0.07);
  expect(await visibleLabels()).toEqual(
    expect.arrayContaining(["Central", "Populated"]),
  );
  expect(await visibleLabels()).not.toContain("Hub");
  await page.screenshot({ path: "artifacts/testing/relevance-zoomed-out.png" });
  const view = (await camera())!,
    node = (await state()).graph.nodes.find((n) => n.iri === id("Populated"))!;
  await canvas().click({
    position: {
      x: node.x * view.zoom + view.x,
      y: node.y * view.zoom + view.y + 15,
    },
  });
  await expect.poll(async () => (await state()).selected).toBe(id("Populated"));
  await request("select", { iri: null });
  await page.mouse.move(0, 0);
  await zoomTo(1);
  expect(await visibleLabels()).toEqual(
    expect.arrayContaining(["Leaf", "Hub", "Populated"]),
  );
  await zoomTo(0.07);
  expect(await visibleLabels()).not.toContain("Leaf");
  const after = await state();
  expect(after.version).toBe(start.version);
  expect(after.graph.nodes.map((n) => [n.iri, n.x, n.y])).toEqual(
    start.graph.nodes.map((n) => [n.iri, n.x, n.y]),
  );
});

test("cached relevance follows instance edits and explicit selection and pinning", async () => {
  await fixture();
  await zoomTo(0.07);
  await request("select", { iri: id("Leaf") });
  expect(await visibleLabels()).toContain("Leaf");
  await request("select", { iri: null });
  await request("pin", { iri: id("Leaf") });
  expect(await visibleLabels()).toContain("Leaf");
  await request("pin", { iri: id("Leaf") });
  const before = (await state()).graph.nodes.find(
    (n) => n.iri === id("Leaf"),
  )!.relevance!;
  const current = await state();
  await request("createEdge", {
    datasetEpoch: current.datasetEpoch,
    version: current.version,
    statement: {
      subject: id("Person0"),
      predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      object: { value: id("Leaf"), literal: false },
    },
  });
  await expect
    .poll(
      async () =>
        (await state()).graph.nodes.find((n) => n.iri === id("Leaf"))!
          .relevance!,
    )
    .toBeGreaterThan(before);
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).graph.nodes.find((n) => n.iri === id("Leaf"))!
          .relevance!,
    )
    .toBe(before);
});
