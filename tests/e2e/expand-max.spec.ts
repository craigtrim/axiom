import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
  profile = await mkdtemp(path.resolve("artifacts/testing/expand-max-"));
  app = await launchExample(options());
  await attach();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("expand-max-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

const button = () =>
  page
    .locator(".graph-panel:visible")
    .getByRole("button", { name: "Expand max", exact: true })
    .first();
const base = "http://expand.test/#";
async function loadFixture() {
  const file = path.join(profile, "expand.ttl");
  const lines = [
    "@prefix : <" + base + ">. @prefix owl:<http://www.w3.org/2002/07/owl#>.",
  ];
  for (const root of ["A", "B"]) {
    lines.push(":" + root + " a owl:Class.");
    for (let i = 0; i < 40; i++)
      lines.push(
        ":" +
          root +
          " :related :" +
          root +
          i +
          ". :" +
          root +
          i +
          " a owl:Class; :related :" +
          root +
          i +
          "deep. :" +
          root +
          i +
          "deep a owl:Class; :related :" +
          root +
          i +
          "deeper. :" +
          root +
          i +
          "deeper a owl:Class.",
      );
  }
  lines.push(":Unrelated a owl:Class.");
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
    .toBe("expand.ttl");
  await request("seed", { iris: [base + "A", base + "B"], expand: false });
  await request("freeze");
  await request("layout", { mode: "circle" });
  await request("budget", { value: 100 });
}
test("Expand max uses breadth-first traversal to the slider limit and one Undo restores the map", async () => {
  await loadFixture();
  await expect(button()).toBeEnabled();
  const before = await state();
  await button().click();
  await expect.poll(async () => (await state()).graph.nodes.length).toBe(100);
  const after = await state();
  for (const root of ["A", "B"]) {
    for (let i = 0; i < 40; i++)
      expect(after.graph.nodes.some((n) => n.iri === base + root + i)).toBe(
        true,
      );
  }
  expect(after.graph.nodes.filter((n) => n.distance === 2)).toHaveLength(18);
  for (const original of before.graph.nodes)
    expect(after.graph.nodes.find((n) => n.iri === original.iri)).toMatchObject(
      { x: original.x, y: original.y },
    );
  expect(after.version).toBe(before.version);
  expect(after.tripleCount).toBe(before.tripleCount);
  await expect(button()).toBeDisabled();
  await page.screenshot({ path: "artifacts/testing/expand-max.png" });
  await menu("edit.undo");
  await expect
    .poll(async () => (await state()).graph.nodes.map((n) => n.iri))
    .toEqual(before.graph.nodes.map((n) => n.iri));
  await expect(button()).toBeEnabled();
  await menu("edit.redo");
  await expect.poll(async () => (await state()).graph.nodes.length).toBe(100);
  // Increasing the slider resumes from the current visible frontier.
  await page
    .getByRole("spinbutton", { name: "Visible node limit", exact: true })
    .fill("300");
  await page
    .getByRole("spinbutton", { name: "Visible node limit", exact: true })
    .press("Tab");
  await expect(button()).toBeEnabled();
  await button().click();
  await expect.poll(async () => (await state()).graph.nodes.length).toBe(242);
  expect(
    (await state()).graph.nodes.some((n) => n.iri === base + "Unrelated"),
  ).toBe(false);
  await expect(button()).toBeDisabled();
});
test("Expand max stays within its graph tab and is disabled on empty or isolated maps", async () => {
  await loadFixture();
  const original = (await state()).graph.nodes.map((n) => n.iri);
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill("A");
  await page
    .locator('[data-entity-iri="' + base + 'A"]')
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
  await request("budget", { value: 100 });
  await button().click();
  await expect
    .poll(async () => (await state()).graphs![id].nodes.length)
    .toBe(100);
  expect((await state()).graphs!.graph.nodes.map((n) => n.iri)).toEqual(
    original,
  );
  await request("clear");
  await expect(button()).toBeDisabled();
  await request("seed", { iris: [base + "Unrelated"], expand: false });
  await expect(button()).toBeDisabled();
});

test("node limit slider reaches 15000 and survives workspace reopening", async () => {
  await loadFixture();
  const slider = page.getByRole("slider", {
    name: "Visible node limit slider",
    exact: true,
  });
  const number = page.getByRole("spinbutton", {
    name: "Visible node limit",
    exact: true,
  });
  await expect(slider).toHaveAttribute("max", "15000");
  await expect(number).toHaveAttribute("max", "15000");
  await slider.focus();
  await slider.press("End");
  await expect.poll(async () => (await state()).graph.budget).toBe(15000);
  await expect(number).toHaveValue("15000");
  await button().click();
  await expect.poll(async () => (await state()).graph.nodes.length).toBe(242);
  const file = path.join(profile, "Large-limit.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await request("budget", { value: 357 });
  await expect.poll(async () => (await state()).graph.budget).toBe(357);
  await menu("file.open");
  await expect.poll(async () => (await state()).graph.budget).toBe(15000);
  await expect(slider).toHaveValue("15000");
  await expect(number).toHaveValue("15000");
});
