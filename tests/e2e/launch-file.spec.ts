// craigtrim/axiom#1
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication | undefined, page: Page, profile: string;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
function environment() {
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
function launchArgs(file?: string) {
  const args = process.env.AXIOM_TEST_EXE ? [] : ["."];
  return file ? [...args, file] : args;
}
async function launch(file?: string) {
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: launchArgs(file),
    env: environment(),
  });
  page = await app.firstWindow();
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((w) => w.setFocusable(false));
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  });
  await expect(page.locator(".status-counts")).toBeVisible();
}
async function menu(id: string) {
  await app!.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function close() {
  await app!.close();
  app = undefined;
}
const ontology =
  '@prefix : <https://example.org/courses#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n:Chemistry a owl:Class; rdfs:label "Chemistry" .\n:Organic a owl:Class; rdfs:subClassOf :Chemistry; rdfs:label "Organic" .';
/** Produce a saved workspace on disk, then return the running app to an empty one. */
async function buildWorkspace() {
  const source = path.join(profile, "courses.ttl");
  await writeFile(source, ontology);
  const file = path.join(profile, "Courses.axiom");
  await app!.evaluate(
    ({ dialog }, { source, file }) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [source],
      });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    { source, file },
  );
  await menu("file.open");
  await expect.poll(async () => (await state()).classCount).toBe(3);
  await menu("file.saveAs");
  await expect
    .poll(async () => {
      try {
        return (await readFile(file, "utf8")).length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  await menu("file.new");
  await expect.poll(async () => (await state()).classCount).toBe(1);
  return file;
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/launch-"));
});
test.afterEach(async () => {
  if (app) await close();
  expect(errors).toEqual([]);
});

test("a workspace path on the command line opens that workspace", async () => {
  await launch();
  const file = await buildWorkspace();
  await close();
  await launch(file);
  await expect.poll(async () => (await state()).classCount).toBe(3);
  expect((await state()).dirty).toBe(false);
  await expect(page.locator(".window-title")).toContainText("Courses.axiom");
  await page.screenshot({ path: "artifacts/testing/launch-workspace.png" });
});

test("an ontology path on the command line imports that file", async () => {
  const source = path.join(profile, "imported.ttl");
  await writeFile(source, ontology);
  await launch(source);
  await expect
    .poll(async () => (await state()).ontology.source?.fileName)
    .toBe("imported.ttl");
  expect((await state()).classCount).toBe(3);
});

test("a second launch loads its file in the first window without a rival process", async () => {
  await launch();
  const file = await buildWorkspace();
  // A real double-click starts a plain process rather than an instrumented one.
  const executable =
    process.env.AXIOM_TEST_EXE ??
    path.resolve("node_modules/electron/dist/electron.exe");
  const duplicate = spawn(executable, launchArgs(file), {
    env: environment(),
    stdio: "ignore",
  });
  const exit = new Promise<number | null>((resolve) =>
    duplicate.on("exit", resolve).on("error", () => resolve(null)),
  );
  await expect.poll(async () => (await state()).classCount).toBe(3);
  expect(
    await app!.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
  ).toBe(1);
  await exit;
});

test("a missing path is logged and leaves an empty workspace in place", async () => {
  await launch(path.join(profile, "absent.axiom"));
  expect((await state()).classCount).toBe(1);
  await expect
    .poll(async () =>
      page.evaluate(() => window.axiom.audit.list().then((r) => r.length)),
    )
    .toBeGreaterThan(0);
  const logged = await page.evaluate(() => window.axiom.audit.list());
  expect(logged[0].operation).toBe("Open file from launch");
});
