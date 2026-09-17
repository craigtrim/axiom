import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Snapshot,
  DomainMethod,
  EdgeDocument,
} from "../../src/shared/protocol";
import type { Camera } from "../../src/renderer/scene";
let app: ElectronApplication, page: Page;
const base = "http://devry.edu/courses#",
  owner = base + "3D_Design_and_3D_Printing";
const errors: string[] = [];
const request = (method: DomainMethod, args: Record<string, unknown> = {}) =>
  page.evaluate(({ method, args }) => window.axiom.request(method, args), {
    method,
    args,
  });
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function position(iri: string) {
  const n = (await state()).graph.nodes.find((n) => n.iri === iri)!;
  const c = await page.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState![
        "graph.camera"
      ] as Camera,
  );
  const b = (await page.getByTestId("graph-canvas").boundingBox())!;
  return { x: b.x + n.x * c.zoom + c.x, y: b.y + n.y * c.zoom + c.y };
}
async function fit() {
  await menu("graph.fit");
  await page.waitForTimeout(400);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/testing/intersections-"),
  );
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
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("intersection-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

test("intersection taxonomy, grouped branches, Details and RDF preservation", async () => {
  const generated = path.resolve("artifacts/testing/equivalent-courses.ttl");
  if (!process.env.AXIOM_INTERSECTION_OWL)
    await writeFile(
      generated,
      (
        await readFile("tests/fixtures/intersections/courses.ttl", "utf8")
      ).replaceAll("rdfs:subClassOf [", "owl:equivalentClass ["),
    );
  const file = process.env.AXIOM_INTERSECTION_OWL ?? generated;
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
    .toBe(path.basename(file));
  const before = await request("sourceDocument", { format: "nquads" }),
    s = await state();
  expect(s.entities.find((e) => e.iri === owner)?.taxonomyParents).toEqual([
    base + "3D_Design",
    base + "3D_Printing",
  ]);
  if (process.env.AXIOM_INTERSECTION_OWL)
    expect(s.entities.filter((e) => e.kind === "Intersection")).toHaveLength(
      607,
    );
  const tree = page.getByRole("region", { name: "Hierarchy panel" });
  await expect(tree).not.toContainText(/:n3-/);
  await request("seed", { iris: [owner] });
  await request("select", { iri: owner });
  await fit();
  const g = (await state()).graph;
  expect(g.nodes).toHaveLength(3);
  expect(g.edges).toHaveLength(2);
  expect(
    g.nodes.some((n) => n.kind === "Intersection" || n.iri.startsWith("_:")),
  ).toBe(false);
  expect(g.edges.every((e) => e.intersection && e.source === owner)).toBe(true);
  expect(g.edges[0].junction).toEqual(g.edges[1].junction);
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toHaveCount(0);
  await menu("view.details");
  await menu("pane.move.right");
  const details = page.getByRole("region", { name: "Details", exact: true }),
    table = details.getByRole("table", { name: "Entity statements" });
  await expect(table).toBeVisible();
  const row = table.locator("tbody tr").filter({
    has: page.locator(
      'select[title="http://www.w3.org/2002/07/owl#equivalentClass"]',
    ),
  });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("3D Design");
  await expect(row).toContainText("3D Printing");
  await fit();
  await page.screenshot({
    path: "artifacts/testing/intersections-branches-courses.png",
  });
  const edge = g.edges[0];
  await request("selectEdge", {
    key: JSON.stringify([
      edge.source,
      edge.predicate,
      edge.target,
      JSON.stringify(edge.intersection!.axiom),
    ]),
  });
  await expect(
    details.getByRole("table", { name: "Edge statements" }),
  ).toBeVisible();
  await expect(details).toContainText("Equivalent to the intersection");
  expect(await request("sourceDocument", { format: "nquads" })).toEqual(before);
});
