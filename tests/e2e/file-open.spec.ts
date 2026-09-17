import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication | undefined, page: Page, profile: string;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const history = async (): Promise<string[]> =>
  JSON.parse(
    await readFile(path.join(profile, "recent-files.json"), "utf8").catch(
      () => "[]",
    ),
  );
async function launch() {
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
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ dialog }) => {
    (globalThis as any).fileMenuMessages = [];
    (globalThis as any).fileMenuResponse = 1;
    dialog.showMessageBox = async (_window: any, options?: any) => {
      (globalThis as any).fileMenuMessages.push(options ?? _window);
      return {
        response: (globalThis as any).fileMenuResponse,
        checkboxChecked: false,
      };
    };
  });
  await expect(page.locator(".status-counts")).toBeVisible();
}
async function menu(id: string) {
  await app!.evaluate(({ Menu, BrowserWindow }, id) => {
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    if (!item?.enabled) throw Error("Menu unavailable: " + id);
    const window = BrowserWindow.getAllWindows()[0];
    item.click({} as never, window, window.webContents as never);
  }, id);
}
async function chooser(file?: string) {
  await app!.evaluate(({ dialog }, file) => {
    (globalThis as any).fileMenuOpenCalls = 0;
    dialog.showOpenDialog = async () => {
      (globalThis as any).fileMenuOpenCalls++;
      return { canceled: !file, filePaths: file ? [file] : [] };
    };
  }, file);
}
async function open(file: string) {
  await chooser(file);
  await menu("file.open");
  await expect.poll(async () => (await history())[0]).toBe(file);
}
async function fixture(folder: string, name: string) {
  const directory = path.join(profile, folder);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "Courses & Topics.ttl");
  await writeFile(
    file,
    "@prefix : <https://example.org/menu#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n:" +
      name +
      " a owl:Class .",
  );
  return file;
}
async function close() {
  await app!.close();
  app = undefined;
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/file-open-"));
  await launch();
});
test.afterEach(async () => {
  if (app) {
    await app.evaluate(() => {
      (globalThis as any).fileMenuResponse = 1;
    });
    await close();
  }
  expect(errors).toEqual([]);
});

test("File > Open groups Workspace, Recent and Examples and Ctrl+O opens the chooser", async () => {
  const tree = await app!.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()!;
    const open = menu.getMenuItemById("menu.file.open")!;
    return {
      root: menu
        .getMenuItemById("menu.file")!
        .submenu!.items.map((item) => item.id),
      children: open.submenu!.items.map((item) => ({
        id: item.id,
        label: item.label.replaceAll("&", ""),
        enabled: item.enabled,
      })),
      accelerator: menu.getMenuItemById("file.open")!.accelerator,
      examples: menu
        .getMenuItemById("menu.file.examples")!
        .submenu!.items.map((item) => item.label.replaceAll("&", "")),
    };
  });
  expect(tree.root).toContain("menu.file.open");
  expect(tree.root).not.toContain("file.open");
  expect(tree.root).not.toContain("file.example");
  expect(tree.children).toEqual([
    { id: "file.open", label: "Workspace...", enabled: true },
    { id: "menu.file.recent", label: "Recent", enabled: false },
    { id: "menu.file.examples", label: "Examples", enabled: true },
  ]);
  expect(tree.accelerator).toBe("Ctrl+O");
  expect(tree.examples).toEqual(["Pizza"]);
  const file = await fixture("one", "Chemistry");
  await chooser(file);
  await page.keyboard.press("Control+o");
  await expect.poll(async () => (await history())[0]).toBe(file);
  expect(await app!.evaluate(() => (globalThis as any).fileMenuOpenCalls)).toBe(
    1,
  );
  await menu("file.example");
  await expect.poll(async () => (await state()).ontology.example).toBe(true);
  expect(await history()).toEqual([file]);
});

test("Recent shows absolute paths, reopens files and persists order", async () => {
  const first = await fixture("first", "Chemistry");
  const second = await fixture("second", "Biology");
  await open(first);
  await open(second);
  const workspace = path.join(profile, "Biology.axiom");
  await app!.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, workspace);
  await menu("file.saveAs");
  await expect.poll(history).toEqual([workspace, second, first]);
  const labels = await app!.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!
      .getMenuItemById("menu.file.recent")!
      .submenu!.items.map((item) => item.label),
  );
  expect(labels).toEqual(
    [workspace, second, first].map(
      (file, index) => "&" + (index + 1) + " " + file.replaceAll("&", "&&"),
    ),
  );
  await menu("file.recent.2");
  await expect.poll(history).toEqual([first, workspace, second]);
  expect((await state()).entities.some((e) => e.name === "Chemistry")).toBe(
    true,
  );
  await close();
  await launch();
  expect(await history()).toEqual([first, workspace, second]);
  await menu("file.recent.1");
  await expect.poll(history).toEqual([workspace, first, second]);
  expect((await state()).entities.some((e) => e.name === "Biology")).toBe(true);
  expect((await state()).entities.some((e) => e.name === "Chemistry")).toBe(
    false,
  );
  // The history stays at the app level when an older workspace restores its workbench.
  expect(
    await app!.evaluate(
      ({ Menu }) =>
        Menu.getApplicationMenu()!.getMenuItemById("menu.file.recent")!.submenu!
          .items.length,
    ),
  ).toBe(3);
});

test("cancelled, missing and malformed recent opens preserve the current document and history", async () => {
  const first = await fixture("first", "Chemistry");
  const second = await fixture("second", "Biology");
  await open(first);
  await open(second);
  await page.evaluate(() =>
    window.axiom.request("createClass", {
      name: "Unsaved",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await app!.evaluate(() => {
    (globalThis as any).fileMenuResponse = 2;
    (globalThis as any).fileMenuMessages = [];
  });
  await menu("file.recent.1");
  await expect
    .poll(() =>
      app!.evaluate(() => (globalThis as any).fileMenuMessages.length),
    )
    .toBe(1);
  expect((await state()).dirty).toBe(true);
  expect((await state()).entities.some((e) => e.name === "Unsaved")).toBe(true);
  expect(await history()).toEqual([second, first]);
  await app!.evaluate(() => {
    (globalThis as any).fileMenuResponse = 1;
  });
  await chooser();
  await menu("file.open");
  await expect
    .poll(() => app!.evaluate(() => (globalThis as any).fileMenuOpenCalls))
    .toBe(1);
  expect(await history()).toEqual([second, first]);
  await unlink(first);
  await menu("file.recent.1");
  await expect
    .poll(() =>
      app!.evaluate(
        () =>
          (globalThis as any).fileMenuMessages.filter(
            (m: any) => m.type === "error",
          ).length,
      ),
    )
    .toBe(1);
  expect((await state()).entities.some((e) => e.name === "Unsaved")).toBe(true);
  expect(await history()).toEqual([second, first]);
  await writeFile(first, "This is not Turtle");
  await menu("file.recent.1");
  await expect
    .poll(() =>
      app!.evaluate(
        () =>
          (globalThis as any).fileMenuMessages.filter(
            (m: any) => m.type === "error",
          ).length,
      ),
    )
    .toBe(2);
  expect((await state()).entities.some((e) => e.name === "Unsaved")).toBe(true);
  expect(await history()).toEqual([second, first]);
});

test("an existing last session supplies its source file when upgrading from a profile without Recent", async () => {
  const file = await fixture("one", "Chemistry");
  await open(file);
  await close();
  await unlink(path.join(profile, "recent-files.json"));
  await launch();
  await expect.poll(history).toEqual([file]);
  expect(
    await app!.evaluate(
      ({ Menu }) =>
        Menu.getApplicationMenu()!.getMenuItemById("menu.file.recent")!.enabled,
    ),
  ).toBe(true);
});
