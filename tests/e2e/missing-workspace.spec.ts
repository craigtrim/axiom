// #162: moving or deleting a workspace must not recreate its old destination.
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";

let app: ElectronApplication | undefined,
  page: Page,
  profile: string,
  file: string,
  iri: string;
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const stored = async () =>
  JSON.parse(await readFile(path.join(profile, "last-session.json"), "utf8"));
async function launch() {
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((w) => w.setFocusable(false));
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => {
      throw Error("Unexpected Save dialog");
    };
    dialog.showMessageBox = async () => {
      throw Error("Unexpected message box");
    };
    const { Worker } = process.getBuiltinModule(
      "worker_threads",
    ) as typeof import("node:worker_threads");
    const original = Worker.prototype.postMessage;
    (globalThis as any).__sessionTicks = 0;
    Worker.prototype.postMessage = function (message, ...rest) {
      if (message?.method === "sessionState")
        (globalThis as any).__sessionTicks++;
      return original.call(this, message, ...rest);
    };
  });
  await expect(
    page.getByRole("contentinfo", { name: "Workbench status" }),
  ).toBeVisible();
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
async function edit() {
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Retained edit" }),
    iri,
  );
}
async function waitForTicks(count: number) {
  const initial = await app!.evaluate(() => (globalThis as any).__sessionTicks);
  await expect
    .poll(() => app!.evaluate(() => (globalThis as any).__sessionTicks), {
      timeout: count * 30000 + 15000,
    })
    .toBeGreaterThanOrEqual(initial + count);
}
async function expectMissing() {
  await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
}
test.beforeEach(async () => {
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/missing-workspace-"));
  file = path.join(profile, "Moved workspace.axiom");
  await launch();
  iri = await page.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "Original class",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await app!.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.save");
  await expect
    .poll(async () => (await stored().catch(() => ({}))).workspacePath)
    .toBe(file);
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app!.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => {
      throw Error("Unexpected Save dialog");
    };
  });
});
test.afterEach(async () => {
  if (app) await close();
});

for (const removal of ["move", "delete"] as const)
  test(`startup skips a ${removal === "move" ? "moved" : "deleted"} workspace across two autosave ticks`, async () => {
    test.setTimeout(100000);
    await close();
    const original = await readFile(file, "utf8");
    if (removal === "move") await rename(file, file + ".moved");
    else await unlink(file);
    await launch();
    expect((await state()).classCount).toBe(1);
    expect((await state()).entities.some((e) => e.iri === iri)).toBe(false);
    expect(await page.title()).not.toContain(file);
    const record = await page.evaluate(async () => {
      const entry = (await window.axiom.audit.list()).find(
        (e) => e.operation === "Restore workspace",
      );
      return entry ? window.axiom.audit.read(entry.id) : undefined;
    });
    expect(record?.metadata.file).toBe(file);
    await waitForTicks(2);
    expect((await stored()).workspacePath).toBeUndefined();
    await expectMissing();
    await close();
    await expectMissing();
    if (removal === "move")
      expect(await readFile(file + ".moved", "utf8")).toBe(original);
  });

test("autosave and close retain edits after a move without recreating the file", async () => {
  test.setTimeout(80000);
  const original = await readFile(file, "utf8");
  await rename(file, file + ".moved");
  await edit();
  await waitForTicks(1);
  await expect.poll(async () => (await stored()).workspacePath).toBeUndefined();
  expect(
    (await stored()).workspace.entities.find((e: any) => e.iri === iri).label,
  ).toBe("Retained edit");
  await expectMissing();
  await close();
  await expectMissing();
  const session = await stored();
  expect(session.recoveryPath).toBeTruthy();
  expect(
    JSON.parse(await readFile(session.recoveryPath, "utf8")).entities.find(
      (e: any) => e.iri === iri,
    ).label,
  ).toBe("Retained edit");
  expect(await readFile(file + ".moved", "utf8")).toBe(original);
  await launch();
  expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "Retained edit",
  );
  expect(await page.title()).not.toContain(file);
});

test("close retains edits when the workspace is deleted during serialization", async () => {
  await edit();
  await app!.evaluate((_, file) => {
    const { Worker } = process.getBuiltinModule(
      "worker_threads",
    ) as typeof import("node:worker_threads");
    const { unlinkSync } = process.getBuiltinModule(
      "fs",
    ) as typeof import("node:fs");
    const original = Worker.prototype.postMessage;
    let deleted = false;
    Worker.prototype.postMessage = function (message, ...rest) {
      if (!deleted && message?.method === "serializeJson") {
        deleted = true;
        unlinkSync(file);
      }
      return original.call(this, message, ...rest);
    };
  }, file);
  await close();
  await expectMissing();
  expect((await stored()).workspacePath).toBeUndefined();
  await launch();
  expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "Retained edit",
  );
});

for (const destination of ["new", "original"] as const)
  test(`Save prompts after deletion, preserves edits on cancel, and accepts an explicit ${destination} destination`, async () => {
    await unlink(file);
    await edit();
    await app!.evaluate(({ dialog }) => {
      (globalThis as any).__saveDialogs = 0;
      dialog.showSaveDialog = async () => {
        (globalThis as any).__saveDialogs++;
        return { canceled: true, filePath: "" };
      };
    });
    await menu("file.save");
    await expect
      .poll(() => app!.evaluate(() => (globalThis as any).__saveDialogs))
      .toBe(1);
    expect((await state()).dirty).toBe(true);
    await expectMissing();
    const target =
      destination === "original"
        ? file
        : path.join(profile, "Chosen workspace.axiom");
    await app!.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, target);
    await menu("file.save");
    await expect.poll(async () => (await stored()).workspacePath).toBe(target);
    await expect.poll(async () => (await state()).dirty).toBe(false);
    expect(
      JSON.parse(await readFile(target, "utf8")).entities.find(
        (e: any) => e.iri === iri,
      ).label,
    ).toBe("Retained edit");
    if (destination === "new") await expectMissing();
  });
