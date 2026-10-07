import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { PendingUpdate } from "../../src/main/pending-update";
import { WorkspaceOwnership } from "../../src/main/workspace-ownership";
import type { Snapshot } from "../../src/shared/protocol";

let root: string;
const apps = new Set<ElectronApplication>();
const children = new Set<ChildProcess>();
const errors: string[] = [];
const executable =
  process.env.AXIOM_TEST_EXE ??
  path.resolve("node_modules/electron/dist/electron.exe");
const args = (file?: string) => [
  ...(process.env.AXIOM_TEST_EXE ? [] : ["."]),
  ...(file ? [file] : []),
];
function environment() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AXIOM_INSTANCE_ROOT: root,
    AXIOM_DISABLE_UPDATES: "1",
    AXIOM_CACHE_HOME: path.join(root, "cache"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.AXIOM_USER_DATA;
  return env as Record<string, string>;
}
type Instance = { app: ElectronApplication; page: Page; profile: string };
async function launch(file?: string, updateLog?: string): Promise<Instance> {
  const env = environment();
  if (updateLog) {
    env.AXIOM_DISABLE_UPDATES = "0";
    env.AXIOM_TEST_UPDATE_LOG = updateLog;
  }
  const app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: [
      ...(updateLog
        ? ["-r", path.resolve("tests/fixtures/instance-update.cjs")]
        : []),
      ...args(file),
    ],
    env,
  });
  apps.add(app);
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".status-counts")).toBeVisible();
  const profile = await app.evaluate(({ app }) => app.getPath("userData"));
  expect(await app.evaluate(({ app }) => app.getPath("sessionData"))).toBe(
    profile,
  );
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
    const win = BrowserWindow.getAllWindows()[0];
    const focus = win.focus.bind(win);
    (globalThis as any).__focusCalls = 0;
    win.focus = () => {
      (globalThis as any).__focusCalls++;
      focus();
    };
  });
  return { app, page, profile };
}
async function close(instance: Instance) {
  await instance.app.close();
  apps.delete(instance.app);
}
const state = (i: Instance) =>
  i.page.evaluate(() => window.axiom.request<Snapshot>("state"));
const focusCalls = (i: Instance) =>
  i.app.evaluate(() => (globalThis as any).__focusCalls as number);
const stored = async (i: Instance) =>
  JSON.parse(await readFile(path.join(i.profile, "last-session.json"), "utf8"));
async function menu(i: Instance, id: string) {
  await i.app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function create(i: Instance, name: string) {
  return i.page.evaluate(
    (name) =>
      window.axiom.request<string>("createClass", {
        name,
        parent: "http://www.w3.org/2002/07/owl#Thing",
      }),
    name,
  );
}
async function save(i: Instance, file: string) {
  await i.app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu(i, "file.saveAs");
  await expect
    .poll(async () => (await stored(i).catch(() => ({}))).workspacePath)
    .toBe(file);
  await expect.poll(async () => (await state(i)).dirty).toBe(false);
}
async function open(i: Instance, file: string) {
  await i.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu(i, "file.open");
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  root = await mkdtemp(path.resolve("artifacts/testing/multi-instance-"));
});
test.afterEach(async () => {
  for (const child of children) if (child.exitCode === null) child.kill();
  children.clear();
  for (const app of apps) await app.close();
  apps.clear();
  expect(errors).toEqual([]);
});

test("two slots isolate edits, autosave, preferences, recent files and query history, then restore independently", async () => {
  test.setTimeout(120000);
  const first = await launch();
  expect(first.profile).toBe(root);
  const firstFocus = await focusCalls(first);
  const second = await launch();
  expect(second.profile).toBe(path.join(root, "instances", "2"));
  expect(await focusCalls(first)).toBe(firstFocus);
  const iri = await create(first, "First window");
  await create(second, "Second window");
  const file = path.join(root, "First.axiom");
  await save(first, file);
  await menu(first, "theme.dark");
  await first.page.evaluate(() =>
    window.axiom.queryHistory.apply({
      type: "add",
      text: "SELECT ?firstWindow WHERE { ?firstWindow ?p ?o }",
      title: "First only",
      origin: "",
      namespace: "",
    }),
  );
  await first.page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Autosaved first" }),
    iri,
  );
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(file, "utf8")).entities.some(
          (e: any) => e.name === "Autosaved first",
        ),
      { timeout: 40000 },
    )
    .toBe(true);
  expect(
    (await state(second)).entities.some((e) => e.name === "Autosaved first"),
  ).toBe(false);
  expect(
    await second.page.evaluate(
      async () => (await window.axiom.preferences.load()).theme,
    ),
  ).toBe("light");
  expect(
    await second.page.evaluate(async () =>
      (await window.axiom.queryHistory.load()).entries.some(
        (e) => e.title === "First only",
      ),
    ),
  ).toBe(false);
  expect(
    await second.app.evaluate(
      ({ Menu }) =>
        Menu.getApplicationMenu()!.getMenuItemById("menu.file.recent")!.submenu!
          .items.length,
    ),
  ).toBe(0);
  await close(first);
  expect(
    (await state(second)).entities.some((e) => e.name === "Second window"),
  ).toBe(true);
  const restarted = await launch();
  expect(restarted.profile).toBe(root);
  expect(
    (await state(restarted)).entities.some((e) => e.name === "Autosaved first"),
  ).toBe(true);
  expect(
    await restarted.page.evaluate(
      async () => (await window.axiom.preferences.load()).theme,
    ),
  ).toBe("dark");
  expect(
    await restarted.page.evaluate(async () =>
      (await window.axiom.queryHistory.load()).entries.some(
        (e) => e.title === "First only",
      ),
    ),
  ).toBe(true);
  expect(
    JSON.parse(await readFile(path.join(root, "recent-files.json"), "utf8")),
  ).toContain(file);
  await close(second);
  const secondRestarted = await launch();
  expect(secondRestarted.profile).toBe(path.join(root, "instances", "2"));
  expect(
    (await state(secondRestarted)).entities.some(
      (e) => e.name === "Second window",
    ),
  ).toBe(true);
  expect(
    (await state(secondRestarted)).entities.some(
      (e) => e.name === "Autosaved first",
    ),
  ).toBe(false);
});

test("launching an owned file raises only its owner and exits without another window", async () => {
  const first = await launch(),
    second = await launch();
  await create(second, "Owned in slot two");
  const file = path.join(root, "Owned.axiom");
  await save(second, file);
  const firstFocus = await focusCalls(first),
    secondFocus = await focusCalls(second);
  const duplicate = spawn(executable, args(file.toUpperCase()), {
    env: environment(),
    stdio: "ignore",
    windowsHide: true,
  });
  children.add(duplicate);
  await expect.poll(() => duplicate.exitCode).toBe(0);
  await expect.poll(() => focusCalls(second)).toBe(secondFocus + 1);
  expect(await focusCalls(first)).toBe(firstFocus);
  expect((await state(first)).classCount).toBe(1);
  expect(
    (await state(second)).entities.some((e) => e.name === "Owned in slot two"),
  ).toBe(true);
  const third = await launch();
  expect(third.profile).toBe(path.join(root, "instances", "3"));
});

test("Open, Recent and Save As refuse another instance's file without changing either workspace", async () => {
  const first = await launch();
  await create(first, "File owner");
  const file = path.join(root, "Owned.axiom");
  await save(first, file);
  const secondProfile = path.join(root, "instances", "2");
  await mkdir(secondProfile, { recursive: true });
  await writeFile(
    path.join(secondProfile, "recent-files.json"),
    JSON.stringify([file]),
  );
  const second = await launch();
  await create(second, "Other workspace");
  const text = await readFile(file, "utf8");
  let count = await focusCalls(first);
  await open(second, file);
  await expect.poll(() => focusCalls(first)).toBe(++count);
  await menu(second, "file.recent.0");
  await expect.poll(() => focusCalls(first)).toBe(++count);
  await second.app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu(second, "file.saveAs");
  await expect.poll(() => focusCalls(first)).toBe(++count);
  expect(
    (await state(second)).entities.some((e) => e.name === "Other workspace"),
  ).toBe(true);
  expect((await state(second)).dirty).toBe(true);
  expect(await readFile(file, "utf8")).toBe(text);
  await menu(first, "file.close");
  await expect.poll(async () => (await state(first)).classCount).toBe(1);
  await open(second, file);
  await expect
    .poll(async () =>
      (await state(second)).entities.some((e) => e.name === "File owner"),
    )
    .toBe(true);
});

test("a busy restored workspace becomes an independent recovery copy without overwriting its owner", async () => {
  const first = await launch();
  await create(first, "Original session");
  const file = path.join(root, "Shared.axiom");
  await save(first, file);
  await close(first);
  // Start with slot 1's previous session copied only as an explicit test fixture.
  const secondProfile = path.join(root, "instances", "2");
  await mkdir(secondProfile, { recursive: true });
  await writeFile(
    path.join(secondProfile, "last-session.json"),
    await readFile(path.join(root, "last-session.json")),
  );
  const owner = await launch();
  await create(owner, "Owner edit");
  await menu(owner, "file.save");
  await expect.poll(async () => (await state(owner)).dirty).toBe(false);
  const restored = await launch();
  expect(
    (await state(restored)).entities.some((e) => e.name === "Original session"),
  ).toBe(true);
  await create(restored, "Recovery edit");
  await close(restored);
  const session = await stored(restored);
  expect(session.workspacePath).toBeUndefined();
  expect(session.recoveryPath).toContain(
    path.join(secondProfile, "workspaces"),
  );
  const document = JSON.parse(await readFile(file, "utf8"));
  expect(document.entities.some((e: any) => e.name === "Owner edit")).toBe(
    true,
  );
  expect(document.entities.some((e: any) => e.name === "Recovery edit")).toBe(
    false,
  );
});

test("a launch file starts in a free slot and a crash releases its workspace ownership", async () => {
  const first = await launch();
  await create(first, "Launch into new slot");
  const file = path.join(root, "Launch.axiom");
  await save(first, file);
  await menu(first, "file.close");
  await expect.poll(async () => (await state(first)).classCount).toBe(1);
  const second = await launch(file);
  expect(second.profile).toBe(path.join(root, "instances", "2"));
  await expect
    .poll(async () =>
      (await state(second)).entities.some(
        (e) => e.name === "Launch into new slot",
      ),
    )
    .toBe(true);
  // On Windows Playwright's child can be a launcher, not Electron's main PID.
  const crashedPid = await second.app.evaluate(() => process.pid);
  process.kill(crashedPid);
  await expect
    .poll(() => {
      try {
        process.kill(crashedPid, 0);
        return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ESRCH";
      }
    })
    .toBe(true);
  apps.delete(second.app);
  // Windows can report the PID gone before its last pipe handle is reclaimed.
  await expect
    .poll(
      async () => {
        const probe = await new WorkspaceOwnership(() => {}).claim(file, false);
        if (!probe) return false;
        probe.release();
        return true;
      },
      {
        message: "the terminated process must release its OS-owned reservation",
      },
    )
    .toBe(true);
  await open(first, file);
  await expect
    .poll(async () =>
      (await state(first)).entities.some(
        (e) => e.name === "Launch into new slot",
      ),
    )
    .toBe(true);
});

test("File New window starts a separate process on a free profile", async () => {
  const first = await launch();
  await menu(first, "file.newWindow");
  const records = path.join(root, "running-instances");
  let childPid: number | undefined;
  try {
    await expect
      .poll(async () => {
        for (const file of await readdir(records)) {
          if (!file.endsWith(".json")) continue;
          const record = JSON.parse(
            await readFile(path.join(records, file), "utf8"),
          );
          if (record.profile === path.join(root, "instances", "2"))
            childPid = record.pid;
        }
        return childPid;
      })
      .toBeTruthy();
    expect(childPid).not.toBe(await first.app.evaluate(() => process.pid));
    await expect
      .poll(
        async () =>
          (await readdir(path.join(root, "instances", "2"))).includes(
            "Preferences",
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    expect((await state(first)).classCount).toBe(1);
  } finally {
    // This process was created by this test and has no user workspace.
    if (childPid) process.kill(childPid);
  }
});

test("a staged update leaves the other instance running and launches only after the last close", async () => {
  // The source executable has no app-update.yml, so release checks fail locally.
  // The preload records NSIS invocations instead of executing them.
  test.skip(
    !!process.env.AXIOM_TEST_EXE,
    "The updater fixture intentionally uses the source executable without a release feed.",
  );
  const log = path.join(root, "installer-invocations.jsonl");
  const first = await launch(undefined, log),
    second = await launch(undefined, log);
  await create(second, "Retained while peer closes");
  const processInfo = await first.app.evaluate(({ app }) => ({
    executable: process.execPath,
    version: app.getVersion(),
  }));
  const key = createHash("sha256")
    .update(processInfo.executable.toLowerCase())
    .digest("hex");
  const installer = path.join(root, "Axiom-Setup-test.exe");
  const content = "fixture installer -- intercepted, never executed";
  await writeFile(installer, content);
  const sha512 = createHash("sha512").update(content).digest("base64");
  await new PendingUpdate(path.join(root, "updates", key)).save(
    {
      version: "99.0.0",
      path: "Axiom-Setup-test.exe",
      sha512,
      releaseDate: "2026-10-07",
      files: [{ url: "Axiom-Setup-test.exe", sha512 }],
      downloadedFile: installer,
    },
    processInfo.version,
  );
  await close(first);
  expect(await readFile(log, "utf8").catch(() => "")).toBe("");
  expect(
    (await state(second)).entities.some(
      (e) => e.name === "Retained while peer closes",
    ),
  ).toBe(true);
  const lastPid = await second.app.evaluate(() => process.pid);
  await close(second);
  const invocations = (await readFile(log, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(invocations).toEqual([
    { file: installer, args: ["--updated", "/S"], pid: lastPid },
  ]);
  expect(
    (await stored(second)).workspace.entities.some(
      (e: any) => e.name === "Retained while peer closes",
    ),
  ).toBe(true);
});
