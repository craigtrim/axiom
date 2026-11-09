// craigtrim/axiom#94: the Source action row reports draft state directly.
// Issue 85: Details fields use predicate names and per-group value numbers.
// #166: reopening a recovered workspace waits for Close to finish its checkpoint.
// #217: ontology autosaves retain the last saved layout until Save or close.
// #218: the shell reports saving until checkpoint writes and release finish.
// #221: windows hide synchronously while final persistence continues in the background.
// #223: implicit saves skip unchanged data and reuse saved ontology for view changes.
import { waitWorkspaceCheckpoint } from "./workspace-checkpoint";
import {
  observeDomainReply,
  observeDomainService,
} from "./domain-service-observer";
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
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { Snapshot, DomainMethod } from "../../src/shared/protocol";
import { schoolBase, schoolOntology } from "../fixtures/large-ontology";
let app: ElectronApplication | undefined, page: Page, profile: string;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const request = <T = unknown>(
  method: DomainMethod,
  args: Record<string, unknown> = {},
) =>
  page.evaluate(({ method, args }) => window.axiom.request<T>(method, args), {
    method,
    args,
  });
const rawStored = async () =>
  JSON.parse(await readFile(path.join(profile, "last-session.json"), "utf8"));
const stored = async () => {
  const session = await rawStored();
  return session.workspace
    ? session
    : {
        ...session,
        workspace: JSON.parse(await readFile(session.workspacePath, "utf8")),
      };
};
async function launch() {
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  try {
    // craigtrim/axiom#208: App publishes pane menus after its bootstrap and
    // capture-handler installation; BrowserWindow creation precedes both.
    await app.evaluate(({ ipcMain }) => {
      let published = false;
      let resolve!: (receipt: { sender: number; at: number }) => void;
      let reject!: (error: Error) => void;
      const ready = new Promise<{ sender: number; at: number }>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      // firstWindow can fail before the caller starts awaiting this observation.
      void ready.catch(() => {});
      const dispose = () => {
        clearTimeout(timer);
        ipcMain.off("menu:state", observed);
      };
      const observed = (
        event: Electron.IpcMainEvent,
        state: Record<string, unknown>,
      ) => {
        if (
          event.sender.getURL() !== "app://axiom/index.html" ||
          !state ||
          !Object.hasOwn(state, "pane.next") ||
          !Object.hasOwn(state, "pane.reattach")
        )
          return;
        published = true;
        dispose();
        resolve({ sender: event.sender.id, at: Date.now() });
      };
      const timer = setTimeout(() => {
        dispose();
        reject(
          Error(
            "Renderer bootstrap did not publish its pane-menu state within 30 seconds.",
          ),
        );
      }, 30000);
      ipcMain.on("menu:state", observed);
      (globalThis as any).__autosaveBootstrap = {
        ready,
        dispose,
        published: () => published,
      };
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
      dialog.showSaveDialog = async () => {
        throw Error("An automatic save must not open a file chooser");
      };
    });
    if (
      !(await app.evaluate(() =>
        (globalThis as any).__autosaveBootstrap.published(),
      )) &&
      (await page.locator("main.workbench").isVisible())
    ) {
      // A fast mount may have published before observation. This real command
      // requires App's command effect, then focuses a pane to republish state.
      await menu("pane.next");
    }
    await app.evaluate(() => (globalThis as any).__autosaveBootstrap.ready);
    await expect(page.locator(".docking-workspace")).toBeVisible();
  } catch (error) {
    // A failed startup has no capture handler to answer a graceful close.
    // Stop only the Electron child owned by this fixture, preserving the cause.
    const owned = app.process();
    void app
      .evaluate(() => (globalThis as any).__autosaveBootstrap?.dispose())
      .catch(() => {});
    app = undefined;
    if (owned.exitCode === null && owned.signalCode === null) {
      await new Promise<void>((resolve) => {
        const finished = () => {
          clearTimeout(timer);
          owned.off("exit", finished);
          resolve();
        };
        const timer = setTimeout(finished, 5000);
        owned.once("exit", finished);
        owned.kill();
      });
    }
    throw error;
  } finally {
    await app
      ?.evaluate(() => (globalThis as any).__autosaveBootstrap?.dispose())
      .catch(() => {});
  }
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
async function save(file: string) {
  // craigtrim/axiom#208: the native menu returns before streamed Save As finishes.
  const completion = await observeDomainReply(app!, page, "checkpointSession", {
    workspacePath: file,
  });
  const release = await observeDomainReply(app!, page, "checkpointRelease");
  try {
    await app!.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await menu("file.saveAs");
    await completion.wait();
    await release.wait();
    await expect
      .poll(async () => (await stored().catch(() => ({}))).workspacePath)
      .toBe(file);
    await expect
      .poll(async () => (await state()).dirty, { timeout: 30000 })
      .toBe(false);
  } finally {
    await completion.dispose();
    await release.dispose();
  }
}
async function open(file: string) {
  const completion = await observeDomainReply(
    app!,
    page,
    "checkpointReference",
    {
      workspacePath: file,
    },
  );
  try {
    await app!.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
    await menu("file.open");
    await completion.wait();
    // Recent history is written after restoring and capturing the destination panes.
    await expect
      .poll(async () => {
        const recent = JSON.parse(
          await readFile(path.join(profile, "recent-files.json"), "utf8"),
        );
        return recent[0];
      })
      .toBe(file);
  } finally {
    await completion.dispose();
  }
}
async function create(name = "Alpha") {
  return request<string>("createClass", {
    name,
    parent: "http://www.w3.org/2002/07/owl#Thing",
    position: { x: 120, y: 180 },
  });
}
async function holdCheckpointPhases() {
  await expect
    .poll(() => page.evaluate(() => window.axiom.workspace.saving()))
    .toBe(false);
  await observeDomainService(app!, page);
  await app!.evaluate(() => {
    const utility = (globalThis as any).__domainServiceObserver.utility;
    const original = utility.postMessage;
    const methods = new Set([
      "checkpointPrepare",
      "checkpointSession",
      "checkpointWorkspace",
      "checkpointRelease",
    ]);
    const pending: { method: string; forward: () => void }[] = [];
    const intercept = function (this: unknown, message: any, ...rest: any[]) {
      if (
        message?.channel === "axiom-domain-v1" &&
        message.type === "request" &&
        methods.has(message.packet?.method)
      ) {
        pending.push({
          method: message.packet.method,
          forward: () => Reflect.apply(original, utility, [message, ...rest]),
        });
        return;
      }
      return Reflect.apply(original, this, [message, ...rest]);
    };
    utility.postMessage = intercept;
    (globalThis as any).__checkpointPhases = {
      pending,
      release: () => {
        const next = pending.shift();
        if (!next) throw Error("There is no held checkpoint phase.");
        next.forward();
      },
      restore: () => {
        if (utility.postMessage === intercept) utility.postMessage = original;
        for (const next of pending.splice(0)) next.forward();
      },
    };
  });
  return {
    async wait(method: string) {
      await expect
        .poll(() =>
          app!.evaluate(
            () => (globalThis as any).__checkpointPhases.pending[0]?.method,
          ),
        )
        .toBe(method);
    },
    release: () =>
      app!.evaluate(() => (globalThis as any).__checkpointPhases.release()),
    dispose: () =>
      app!.evaluate(() => (globalThis as any).__checkpointPhases.restore()),
  };
}
async function beginExit(route: "X" | "File Exit") {
  return app!.evaluate(({ BrowserWindow, Menu }, route) => {
    const windows = BrowserWindow.getAllWindows();
    const main = windows.find(
      (win) => win.webContents.getURL() === "app://axiom/index.html",
    )!;
    (globalThis as any).__closingShows = 0;
    for (const win of windows)
      win.on("show", () => (globalThis as any).__closingShows++);
    const before = windows.map((win) => win.isVisible());
    if (route === "X") main.close();
    else
      Menu.getApplicationMenu()!
        .getMenuItemById("app.quit")!
        .click({} as never, main, main.webContents as never);
    return { before, after: windows.map((win) => win.isVisible()) };
  }, route);
}
async function expectHiddenInBackground(count: number) {
  expect(app!.process().exitCode).toBeNull();
  expect(
    await app!.evaluate(({ BrowserWindow }) => ({
      visible: BrowserWindow.getAllWindows().map((win) => win.isVisible()),
      shows: (globalThis as any).__closingShows,
    })),
  ).toEqual({ visible: Array(count).fill(false), shows: 0 });
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/autosave-"));
  await launch();
});
test.afterEach(async () => {
  if (app) await close();
  expect(errors).toEqual([]);
});
for (const route of ["X", "File Exit"] as const)
  test(
    route +
      " hides every window before a background close saves drafts and layout",
    async () => {
      test.setTimeout(90000);
      const iri = await create("Before closing");
      await request("freeze");
      const file = path.join(profile, "background-close.axiom");
      await save(file);
      await request("rename", { iri, name: "Saved after hiding" });
      await request("spacing", { value: 2.5 });
      await request("drag", { iri, x: 567, y: 234 });
      await menu("view.details");
      await page.locator('[data-pane-id="details"]').evaluate((element) => {
        element.setAttribute("tabindex", "-1");
        (element as HTMLElement).focus();
      });
      const detached = app!.waitForEvent("window");
      await menu("pane.detach");
      const child = await detached;
      child.on("pageerror", (error) => errors.push(error.message));
      await expect(
        child.getByRole("region", { name: "Details", exact: true }),
      ).toBeVisible();
      await menu("view.source");
      const source = page.getByRole("region", {
        name: "Ontology source editor",
      });
      await expect(source.getByRole("status")).toContainText("Clean");
      const editor = source.getByRole("textbox", {
        name: "Ontology source",
        exact: true,
      });
      const draft =
        `<${iri}> a <http://www.w3.org/2002/07/owl#Class>; ` +
        '<http://www.w3.org/2000/01/rdf-schema#label> "Unapplied background draft" .\n' +
        "# Pending draft retained on background close\n";
      await editor.focus();
      await editor.press("Control+a");
      await page.keyboard.insertText(draft);
      await expect(editor).toHaveValue(draft);
      await expect(source.getByRole("status")).toContainText("Draft pending");
      const phases = await holdCheckpointPhases();
      for (const view of [page, child])
        await view.evaluate(() => {
          (globalThis as any).__suppressedFrames = 0;
          window.requestAnimationFrame = () => {
            (globalThis as any).__suppressedFrames++;
            return 0;
          };
        });
      // File Exit also upgrades a normal capture that is already waiting on a frame.
      if (route === "File Exit") {
        await menu("file.save");
        await expect
          .poll(() =>
            page.evaluate(() => (globalThis as any).__suppressedFrames),
          )
          .toBeGreaterThan(0);
      }
      const ownedProcess = app!.process();
      let completed = false;
      try {
        const hidden = await beginExit(route);
        expect(hidden.before).toContain(true);
        expect(hidden.after).toEqual([false, false]);
        // File Exit waits for the held explicit Save; its identical final save is skipped.
        for (const method of [
          "checkpointPrepare",
          "checkpointSession",
          "checkpointWorkspace",
          "checkpointRelease",
        ]) {
          await phases.wait(method);
          await expectHiddenInBackground(2);
          await phases.release();
        }
        await expect
          .poll(() => ownedProcess.exitCode, { timeout: 15000 })
          .not.toBeNull();
        expect(ownedProcess.exitCode).toBe(0);
        completed = true;
        app = undefined;
        const saved = JSON.parse(await readFile(file, "utf8"));
        expect(
          saved.entities.find((entity: any) => entity.iri === iri)?.label,
        ).toBe("Saved after hiding");
        expect(saved.graphs.graph.spacing).toBe(2.5);
        expect(
          saved.graphs.graph.positions.find((node: any) => node.iri === iri),
        ).toMatchObject({ x: 567, y: 234 });
        expect(saved.editorDrafts.source.text).toBe(draft);
        expect(
          Object.keys(saved.workbench.layout.subLayouts ?? {}),
        ).toHaveLength(1);
        await launch();
        expect(
          (await state()).entities.find((entity) => entity.iri === iri)?.label,
        ).toBe("Saved after hiding");
        expect((await state()).graph.spacing).toBe(2.5);
        await menu("view.source");
        await expect(
          page.getByRole("textbox", { name: "Ontology source", exact: true }),
        ).toHaveValue(draft);
        await expect.poll(() => app!.windows().length).toBe(2);
      } finally {
        if (!completed && ownedProcess.exitCode === null)
          await phases.dispose();
      }
    },
  );
for (const fails of [false, true])
  test(
    "saving status covers every checkpoint phase and clears after " +
      (fails ? "a write failure" : "a successful save"),
    async () => {
      const iri = await create();
      const file = path.join(profile, "saving-state.axiom");
      if (fails) {
        await save(file);
        await request("rename", {
          iri,
          name: "Edit retained after failed save",
        });
        await mkdir(file + ".bak");
      } else {
        await app!.evaluate(({ dialog }, file) => {
          dialog.showSaveDialog = async () => ({
            canceled: false,
            filePath: file,
          });
        }, file);
      }
      const status = page.getByRole("contentinfo", {
        name: "Workbench status",
      });
      const phases = await holdCheckpointPhases();
      await page.evaluate(() => {
        (globalThis as any).__savingEvents = [];
        window.axiom.onEvent((event) => {
          if (event.type === "workspace-saving")
            (globalThis as any).__savingEvents.push(event.data);
        });
      });
      try {
        await menu(fails ? "file.save" : "file.saveAs");
        for (const method of [
          "checkpointPrepare",
          "checkpointSession",
          "checkpointWorkspace",
          ...(!fails ? ["checkpointSession"] : []),
          "checkpointRelease",
        ]) {
          await phases.wait(method);
          await expect(status).toContainText("Saving…");
          expect(
            await page.evaluate(() => window.axiom.workspace.saving()),
          ).toBe(true);
          expect(
            await page.evaluate(() => (globalThis as any).__savingEvents),
          ).toEqual([true]);
          // The shell and ordinary reads remain responsive throughout the save.
          expect(
            (await state()).entities.some((entity) => entity.iri === iri),
          ).toBe(true);
          await phases.release();
        }
        await expect
          .poll(() => page.evaluate(() => window.axiom.workspace.saving()))
          .toBe(false);
        await expect(status).not.toContainText("Saving…");
        await expect(status).toContainText(fails ? "Unsaved changes" : "Saved");
        expect(
          await page.evaluate(() => (globalThis as any).__savingEvents),
        ).toEqual([true, false]);
        if (fails) {
          expect(
            (await stored()).workspace.entities.find(
              (entity: any) => entity.iri === iri,
            )?.label,
          ).toBe("Edit retained after failed save");
          expect(
            JSON.parse(await readFile(file, "utf8")).entities.find(
              (entity: any) => entity.iri === iri,
            )?.label,
          ).toBe("Alpha");
        } else {
          expect(
            JSON.parse(await readFile(file, "utf8")).entities.some(
              (entity: any) => entity.iri === iri,
            ),
          ).toBe(true);
        }
      } finally {
        await phases.dispose();
        if (fails) await rm(file + ".bak", { recursive: true });
      }
    },
  );
test("periodic autosave retains ontology with the last saved layout after a forced exit", async () => {
  test.setTimeout(120000);
  const iri = await create(),
    child = await request<string>("createClass", {
      name: "Child",
      parent: iri,
    });
  await request("seed", { iris: [iri, child], expand: false });
  await request("freeze");
  const file = path.join(profile, "graph.axiom");
  await save(file);
  const baseline = JSON.parse(await readFile(file, "utf8"));
  await request("layout", { mode: "grid" });
  await request("spacing", { value: 2.5 });
  await request("eviction", { mode: "refuse" });
  await request("edgeVisibility", { visible: false });
  await request("countVisibility", { visible: false });
  await request("drag", { iri, x: 567, y: 234 });
  const second = await request<string>("graphCreate", { iris: [child] });
  await request("layout", { mode: "circle", graphId: second });
  await request("spacing", { value: 1.75, graphId: second });
  await menu("view.graph");
  await menu("view.details");
  await menu("view.find");
  await request("select", { iri: child });
  await request("rename", { iri, name: "Autosaved Alpha" });
  await expect
    .poll(
      async () => {
        const saved = JSON.parse(await readFile(file, "utf8"));
        return saved.entities.some((e: any) => e.label === "Autosaved Alpha");
      },
      { timeout: 40000, intervals: [250, 500] },
    )
    .toBe(true);
  const saved = JSON.parse(await readFile(file, "utf8"));
  for (const key of [
    "graph",
    "graphs",
    "archivedGraphs",
    "activeGraphId",
    "selected",
  ])
    expect(saved[key]).toEqual(baseline[key]);
  expect(saved.workbench.layout).toEqual(baseline.workbench.layout);
  expect(saved.workbench.panelState).toEqual(baseline.workbench.panelState);
  const recovery = await stored();
  expect(recovery.workspace.graphs).toEqual(baseline.graphs);
  expect(recovery.workbench.layout).toEqual(baseline.workbench.layout);
  expect(recovery.workbench.panelState).toEqual(baseline.workbench.panelState);
  await app!.evaluate(({ app }) => app.exit(0)).catch(() => {});
  app = undefined;
  await launch();
  const after = await state();
  expect(after.entities.some((e) => e.label === "Autosaved Alpha")).toBe(true);
  expect(after.selected).toBe(baseline.selected);
  expect(after.activeGraphId).toBe(baseline.activeGraphId);
  expect(after.graphs![second]).toBeUndefined();
  expect(after.graphs!.graph.spacing).toBe(baseline.graphs.graph.spacing);
  expect(after.graphs!.graph.evictionMode).toBe(
    baseline.graphs.graph.evictionMode,
  );
  expect(after.graphs!.graph.edgesVisible).toBe(
    baseline.graphs.graph.edgesVisible,
  );
  expect(after.graphs!.graph.countsVisible).toBe(
    baseline.graphs.graph.countsVisible,
  );
  expect(after.graphs!.graph.nodes.map((n) => [n.iri, n.x, n.y])).toEqual(
    baseline.graphs.graph.positions.map((n: any) => [n.iri, n.x, n.y]),
  );
  const restored = await page.evaluate(() => window.axiom.preferences.load());
  expect(restored.layout).toEqual(baseline.workbench.layout);
  // Explicit and closing saves still retain the current graph and pane settings.
  await request("spacing", { value: 2.5 });
  await request("drag", { iri, x: 567, y: 234 });
  await menu("view.find");
  await save(file);
  const explicit = JSON.parse(await readFile(file, "utf8"));
  expect(explicit.graphs.graph.spacing).toBe(2.5);
  expect(
    explicit.graphs.graph.positions.find((n: any) => n.iri === iri),
  ).toMatchObject({ x: 567, y: 234 });
  expect(JSON.stringify(explicit.workbench.layout)).toContain('"find"');
  await request("spacing", { value: 1.75 });
  await close();
  expect(JSON.parse(await readFile(file, "utf8")).graphs.graph.spacing).toBe(
    1.75,
  );
  await launch();
  expect((await state()).graphs!.graph.spacing).toBe(1.75);
  await expect(
    page.getByRole("tab", { name: "Find", exact: true }),
  ).toBeVisible();
});
test("an unnamed workspace saves on File Close and remains accessible as a complete recovery workspace", async () => {
  const iri = await create("Recovered course");
  await menu("file.close");
  await expect
    .poll(async () => (await state()).entities.some((e) => e.iri === iri))
    .toBe(false);
  await waitWorkspaceCheckpoint(app!, page);
  const files = (await readdir(path.join(profile, "workspaces"))).filter((f) =>
    f.endsWith(".axiom"),
  );
  expect(files).toHaveLength(1);
  const file = path.join(profile, "workspaces", files[0]);
  expect(
    JSON.parse(await readFile(file, "utf8")).entities.some(
      (e: any) => e.iri === iri,
    ),
  ).toBe(true);
  await app!.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).entities.some((e) => e.iri === iri))
    .toBe(true);
});
test("unapplied entity source survives close and restart and only changes the ontology on Save source", async () => {
  const iri = await create();
  await request("select", { iri });
  await menu("view.details");
  const details = page.getByRole("region", { name: "Details", exact: true });

  const source = details.getByRole("textbox", {
    name: /^Source for /,
  });
  await expect(source).toBeEnabled();
  const text =
    "<" +
    iri +
    '> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Source revision" .';
  await app!.evaluate(({ clipboard }, text) => clipboard.writeText(text), text);
  await source.focus();
  await source.press("Control+a");
  await source.press("Control+v");
  await expect(
    details.getByRole("button", { name: "Save source", exact: true }),
  ).toBeEnabled();
  await close();
  const saved = await stored();
  expect(saved.editorDrafts.entitySources[0].text).toContain("Source revision");
  expect(saved.workspace.entities.find((e: any) => e.iri === iri).label).toBe(
    "Alpha",
  );
  await launch();
  await expect(
    page.getByRole("button", { name: "Save source", exact: true }),
  ).toBeEnabled();
  expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "Alpha",
  );
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.label === "Source revision"),
    )
    .toBe(true);
});
for (const draftState of ["invalid", "stale"] as const)
  test(`${draftState} entity source retains its text and validation state after restart`, async () => {
    const iri = await create();
    await request("select", { iri });
    await menu("view.details");
    const pane = () =>
      page.getByRole("region", { name: "Details", exact: true });
    const editor = () => pane().getByRole("textbox", { name: /^Source for / });
    await expect(editor()).toBeEnabled();
    const text =
      draftState === "invalid"
        ? "invalid rdf {"
        : (await editor().inputValue()).replace('"Alpha"', '"Draft alpha"');
    await editor().fill(text);
    if (draftState === "stale")
      await request("rename", { iri, name: "Newer alpha" });
    await pane()
      .getByRole("button", { name: "Save source", exact: true })
      .click();
    await expect(pane().locator(".state." + draftState)).toBeVisible();
    await close();
    const saved = (await stored()).editorDrafts.entitySources[0];
    expect(saved.text).toContain(text);
    if (draftState === "invalid") expect(saved.error).toContain("line 1");
    else expect(saved.stale).toBe(true);
    await launch();
    await expect(pane().locator(".state." + draftState)).toBeVisible();
    await expect(editor()).toHaveValue(text);
    expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
      draftState === "invalid" ? "Alpha" : "Newer alpha",
    );
    await pane()
      .getByRole("button", {
        name:
          draftState === "invalid"
            ? "Discard draft"
            : "Discard draft and reload",
        exact: true,
      })
      .click();
    await expect(pane().locator(".state.clean")).toHaveText("Saved");
  });

test("a failed final save stays hidden, preserves recovery and retries after recording an audit log", async () => {
  const iri = await create();
  const folder = path.join(profile, "destination");
  await mkdir(folder);
  const file = path.join(folder, "saved.axiom");
  await save(file);
  await request("rename", { iri, name: "Retained despite failure" });
  // #162: missing destinations now recover normally; fail a write to an existing file.
  await mkdir(file + ".bak");
  await app!.evaluate(({ dialog }) => {
    (globalThis as any).__closeDialogCalls = 0;
    dialog.showMessageBox = async () => {
      (globalThis as any).__closeDialogCalls++;
      return { response: 0, checkboxChecked: false };
    };
  });
  const ownedProcess = app!.process();
  try {
    expect((await beginExit("X")).after).toEqual([false]);
    await expect
      .poll(async () => {
        const directory = path.join(profile, "error-logs");
        const files = await readdir(directory).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return [];
            throw error;
          },
        );
        const logs = await Promise.all(
          files
            .filter((name) => name.endsWith(".json"))
            .map(async (name) =>
              JSON.parse(await readFile(path.join(directory, name), "utf8")),
            ),
        );
        return logs.some(
          (entry) => entry.record.operation === "Save workspace on close",
        );
      })
      .toBe(true);
    await expectHiddenInBackground(1);
    expect(
      await app!.evaluate(() => (globalThis as any).__closeDialogCalls),
    ).toBe(0);
    expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
      "Retained despite failure",
    );
    expect(
      (await stored()).workspace.entities.find((e: any) => e.iri === iri).label,
    ).toBe("Retained despite failure");
    expect(
      JSON.parse(await readFile(file, "utf8")).entities.find(
        (e: any) => e.iri === iri,
      ).label,
    ).toBe("Alpha");
  } finally {
    // Removing the owned failure lets the background retry finish without another close request.
    await rm(file + ".bak", { recursive: true, force: true });
  }
  await expect
    .poll(() => ownedProcess.exitCode, { timeout: 15000 })
    .not.toBeNull();
  expect(ownedProcess.exitCode).toBe(0);
  app = undefined;
  expect(
    JSON.parse(
      await readFile(path.join(folder, "saved.axiom"), "utf8"),
    ).entities.find((e: any) => e.iri === iri).label,
  ).toBe("Retained despite failure");
  await launch();
  expect(
    (await state()).entities.find((entity) => entity.iri === iri)?.label,
  ).toBe("Retained despite failure");
});

test("closing after the data service exits releases the hidden process and preserves its last checkpoint", async () => {
  await create("Last completed checkpoint");
  const file = path.join(profile, "worker-stopped.axiom");
  await save(file);
  await expect
    .poll(() => page.evaluate(() => window.axiom.workspace.saving()))
    .toBe(false);
  const workspaceText = await readFile(file, "utf8");
  const sessionText = await readFile(
    path.join(profile, "last-session.json"),
    "utf8",
  );
  await observeDomainService(app!, page);
  await app!.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const utility = (globalThis as any).__domainServiceObserver.utility;
        utility.once("exit", () => resolve());
        if (!utility.kill())
          reject(Error("The owned data utility could not be stopped."));
      }),
  );
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.axiom.audit.list())).some(
        (entry) => entry.operation === "Domain worker exit",
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      window.axiom.request("state").then(
        () => "resolved",
        (error: Error) => error.message,
      ),
    ),
  ).toContain("The data service exited");
  const receipt = path.join(profile, "stopped-worker-close.json");
  await app!.evaluate(({ app, dialog }, receipt) => {
    (globalThis as any).__closingDialogs = 0;
    dialog.showMessageBox = async () => {
      (globalThis as any).__closingDialogs++;
      return { response: 0, checkboxChecked: false };
    };
    app.once("will-quit", () => {
      const { writeFileSync } = process.getBuiltinModule("fs");
      writeFileSync(
        receipt,
        JSON.stringify({
          dialogs: (globalThis as any).__closingDialogs,
          shows: (globalThis as any).__closingShows,
        }),
      );
    });
  }, receipt);
  const ownedProcess = app!.process();
  expect((await beginExit("X")).after).toEqual([false]);
  await expect
    .poll(() => ownedProcess.exitCode, { timeout: 15000 })
    .not.toBeNull();
  expect(ownedProcess.exitCode).toBe(0);
  app = undefined;
  expect(JSON.parse(await readFile(receipt, "utf8"))).toEqual({
    dialogs: 0,
    shows: 0,
  });
  expect(await readFile(file, "utf8")).toBe(workspaceText);
  expect(await readFile(path.join(profile, "last-session.json"), "utf8")).toBe(
    sessionText,
  );
  const auditFiles = await readdir(path.join(profile, "error-logs"));
  const entries = await Promise.all(
    auditFiles
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        JSON.parse(
          await readFile(path.join(profile, "error-logs", name), "utf8"),
        ),
      ),
  );
  expect(
    entries.some(
      (entry) => entry.record.operation === "Save workspace on close",
    ),
  ).toBe(true);
});

for (const stale of [false, true])
  test(
    "whole-source drafts survive restart" +
      (stale ? " with stale protection" : " and remain applicable"),
    async () => {
      const iri = await create();
      await menu("view.source");
      const pane = page.getByRole("region", { name: "Ontology source editor" });
      await expect(pane.getByRole("status")).toContainText("Clean");
      const editor = pane.getByRole("textbox", {
        name: "Ontology source",
        exact: true,
      });
      await editor.focus();
      await editor.press("Control+a");
      const draftText =
        "<" +
        iri +
        '> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Pending source" .';
      await page.keyboard.insertText(draftText);
      await expect(editor).toHaveValue(draftText);
      await expect(pane.getByRole("status")).toContainText("Draft pending");
      if (stale) await request("rename", { iri, name: "Newer ontology edit" });
      await close();
      expect((await stored()).editorDrafts.source.text).toBe(draftText);
      await launch();
      const restored = page.getByRole("region", {
        name: "Ontology source editor",
      });
      await expect(restored.getByRole("status")).toHaveText(
        stale ? "Draft is stale" : "Draft pending",
      );
      const apply = restored.getByRole("button", {
        name: "Apply changes",
        exact: true,
      });
      if (stale) {
        await expect(apply).toBeDisabled();
        await expect(restored.getByRole("alert")).toContainText(
          "Another view changed the ontology while this draft was pending.",
        );
        expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
          "Newer ontology edit",
        );
      } else {
        await expect(apply).toBeEnabled();
        expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
          "Alpha",
        );
        await apply.click();
        await expect
          .poll(async () =>
            (await state()).entities.some((e) => e.label === "Pending source"),
          )
          .toBe(true);
      }
    },
  );
test("an unfinished statement row survives closing without becoming an invalid ontology triple", async () => {
  const iri = await create();
  await request("select", { iri });
  await menu("view.details");
  const details = page.getByRole("region", { name: "Details", exact: true });
  const before = await state();
  await details.getByRole("button", { name: "+ Add row", exact: true }).click();
  await expect(
    details
      .getByRole("combobox", { name: "Choose predicate", exact: true })
      .last(),
  ).toHaveValue("");
  await close();
  expect(
    (await stored()).editorDrafts.entities[0].statements.at(-1).predicate,
  ).toBe("");
  await launch();
  expect((await state()).tripleCount).toBe(before.tripleCount);
  await expect(
    page
      .getByRole("region", { name: "Details", exact: true })
      .getByRole("combobox", { name: "Choose predicate", exact: true })
      .last(),
  ).toHaveValue("");
});

test("Save as waits for an in-progress save and keeps its requested destination", async () => {
  await create();
  const first = path.join(profile, "first.axiom"),
    second = path.join(profile, "second.axiom");
  await app!.evaluate(
    ({ dialog }, { first, second }) => {
      (globalThis as any).__saveChoices = 0;
      dialog.showSaveDialog = async () => {
        const number = ++(globalThis as any).__saveChoices;
        if (number === 1)
          await new Promise((resolve) => setTimeout(resolve, 800));
        return { canceled: false, filePath: number === 1 ? first : second };
      };
    },
    { first, second },
  );
  await menu("file.save");
  await expect
    .poll(() => app!.evaluate(() => (globalThis as any).__saveChoices))
    .toBe(1);
  await menu("file.saveAs");
  await expect
    .poll(async () => (await stored().catch(() => ({}))).workspacePath)
    .toBe(second);
  expect(JSON.parse(await readFile(first, "utf8")).format).toBe(
    "axiom-workspace",
  );
  expect(JSON.parse(await readFile(second, "utf8")).format).toBe(
    "axiom-workspace",
  );
});

test("switching workspaces archives source drafts with their own ontology and leaves the new session clean", async () => {
  await create("Draft owner");
  await menu("view.source");
  const pane = page.getByRole("region", { name: "Ontology source editor" });
  await expect(pane.getByRole("status")).toContainText("Clean");
  const editor = pane.getByRole("textbox", {
    name: "Ontology source",
    exact: true,
  });
  await editor.focus();
  await editor.press("Control+a");
  await page.keyboard.insertText(
    "unfinished source belonging to the previous ontology",
  );
  await expect(pane.getByRole("status")).toContainText("Draft pending");
  await menu("file.close");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.label === "Draft owner"),
    )
    .toBe(false);
  await expect
    .poll(async () =>
      (await stored()).workspace.entities.some(
        (e: any) => e.label === "Draft owner",
      ),
    )
    .toBe(false);
  expect((await stored()).editorDrafts).toBeUndefined();
  const files = (await readdir(path.join(profile, "workspaces"))).filter((f) =>
    f.endsWith(".axiom"),
  );
  expect(files).toHaveLength(1);
  const archived = JSON.parse(
    await readFile(path.join(profile, "workspaces", files[0]), "utf8"),
  );
  expect(archived.entities.some((e: any) => e.label === "Draft owner")).toBe(
    true,
  );
  expect(archived.editorDrafts.source.text).toContain("previous ontology");
  await close();
  await launch();
  expect((await stored()).editorDrafts).toBeUndefined();
  expect((await state()).entities.some((e) => e.label === "Draft owner")).toBe(
    false,
  );
});

test("#223 unchanged Open writes only a session reference and restores the destination after restart", async () => {
  const iri = await create("Source course");
  await request("freeze");
  const source = path.join(profile, "unchanged-source.axiom");
  const destination = path.join(profile, "unchanged-destination.axiom");
  await save(source);
  await request("rename", { iri, name: "Destination course" });
  await save(destination);
  await open(source);
  const sourceText = await readFile(source, "utf8");
  const sourceTime = (await stat(source)).mtimeMs;
  const before = await app!.evaluate(() => ({
    ...(globalThis as any).__domainServiceObserver.counts,
  }));
  await open(destination);
  const after = await app!.evaluate(() => ({
    ...(globalThis as any).__domainServiceObserver.counts,
  }));
  expect(after.checkpointPrepare ?? 0).toBe(before.checkpointPrepare ?? 0);
  expect(after.checkpointSession ?? 0).toBe(before.checkpointSession ?? 0);
  expect(after.checkpointReference).toBe((before.checkpointReference ?? 0) + 1);
  expect(await readFile(source, "utf8")).toBe(sourceText);
  expect((await stat(source)).mtimeMs).toBe(sourceTime);
  const session = await rawStored();
  expect(session.workspacePath).toBe(destination);
  expect(session.workspace).toBeUndefined();
  expect(
    (await stat(path.join(profile, "last-session.json"))).size,
  ).toBeLessThan((await stat(destination)).size);
  await app!.evaluate(({ app }) => app.exit(0)).catch(() => {});
  app = undefined;
  await launch();
  expect(
    (await state()).entities.find((entity) => entity.iri === iri)?.label,
  ).toBe("Destination course");
});

test("#223 a view-only switch reuses ontology and restores the saved selection and panes", async () => {
  const first = await create("First course");
  const second = await create("Second course");
  await request("freeze");
  await request("select", { iri: first });
  const source = path.join(profile, "view-source.axiom");
  const destination = path.join(profile, "view-destination.axiom");
  await save(source);
  await request("rename", { iri: first, name: "Another ontology" });
  await save(destination);
  await open(source);
  const previous = JSON.parse(await readFile(source, "utf8"));
  await app!.evaluate(() => {
    const owner = (globalThis as any).__domainServiceObserver;
    const previous = owner.beforeRequest;
    owner.beforeRequest = (packet: any) => {
      previous?.(packet);
      if (packet.method === "checkpointPrepare")
        (globalThis as any).__archivePrepare = packet.args;
    };
  });
  await request("select", { iri: second });
  await request("spacing", { value: 2.5 });
  await request("drag", { iri: first, x: 611, y: 287 });
  await menu("view.find");
  await open(destination);
  expect(
    await app!.evaluate(
      () => (globalThis as any).__archivePrepare?.reuseOntology,
    ),
  ).toBe(true);
  const saved = JSON.parse(await readFile(source, "utf8"));
  expect(saved.entities).toEqual(previous.entities);
  expect(saved.tbox).toEqual(previous.tbox);
  expect(saved.selected).toBe(second);
  expect(saved.graphs.graph.spacing).toBe(2.5);
  expect(
    saved.graphs.graph.positions.find((node: any) => node.iri === first),
  ).toMatchObject({ x: 611, y: 287 });
  expect(JSON.stringify(saved.workbench.layout)).toContain('"find"');
  await open(source);
  expect((await state()).selected).toBe(second);
  expect((await state()).graph.spacing).toBe(2.5);
  await expect(
    page.getByRole("tab", { name: "Find", exact: true }),
  ).toBeVisible();
});

test("#223 an explicit unchanged Save replaces the file and its backup", async () => {
  await create("Explicit save");
  await request("freeze");
  const file = path.join(profile, "explicit-unchanged.axiom");
  await save(file);
  // Stabilize the captured workbench before checking the identical save contract.
  await save(file);
  const before = await readFile(file, "utf8");
  await writeFile(file + ".bak", "The explicit Save must replace this backup.");
  const complete = await observeDomainReply(app!, page, "checkpointRelease");
  try {
    await menu("file.save");
    await complete.wait();
  } finally {
    await complete.dispose();
  }
  expect(await readFile(file, "utf8")).toBe(before);
  expect(await readFile(file + ".bak", "utf8")).toBe(before);
});

for (const savedBy of ["explicit Save", "ontology autosave"] as const)
  test(
    "#223 closing an unchanged workspace skips checkpoint preparation and disk writes after " +
      savedBy,
    async () => {
      test.setTimeout(90000);
      const iri = await create("Unchanged at close");
      await request("freeze");
      const file = path.join(profile, "unchanged-close.axiom");
      await save(file);
      if (savedBy === "ontology autosave") {
        await request("rename", { iri, name: "Saved by the ontology timer" });
        await expect
          .poll(
            async () => {
              const saved = JSON.parse(await readFile(file, "utf8"));
              return saved.entities.find((entity: any) => entity.iri === iri)
                ?.label;
            },
            { timeout: 45000 },
          )
          .toBe("Saved by the ontology timer");
        await expect
          .poll(() => page.evaluate(() => window.axiom.workspace.saving()))
          .toBe(false);
      }
      const sessionFile = path.join(profile, "last-session.json");
      const fileTime = (await stat(file)).mtimeMs;
      const sessionTime = (await stat(sessionFile)).mtimeMs;
      const countsFile = path.join(profile, "close-domain-counts.json");
      const before = await app!.evaluate(() => ({
        ...(globalThis as any).__domainServiceObserver.counts,
      }));
      await app!.evaluate(({ app }, file) => {
        app.once("will-quit", () => {
          const fs = process.getBuiltinModule("fs") as typeof import("node:fs");
          fs.writeFileSync(
            file,
            JSON.stringify((globalThis as any).__domainServiceObserver.counts),
          );
        });
      }, countsFile);
      await close();
      const after = JSON.parse(await readFile(countsFile, "utf8"));
      expect(after.checkpointPrepare ?? 0).toBe(before.checkpointPrepare ?? 0);
      expect(after.checkpointSession ?? 0).toBe(before.checkpointSession ?? 0);
      expect(after.checkpointWorkspace ?? 0).toBe(
        before.checkpointWorkspace ?? 0,
      );
      expect((await stat(file)).mtimeMs).toBe(fileTime);
      expect((await stat(sessionFile)).mtimeMs).toBe(sessionTime);
    },
  );

for (const boundary of ["data load", "preferences reply"] as const)
  test(
    "honours closing while a workspace is still opening and saves the completed view" +
      (boundary === "preferences reply"
        ? " with restored preferences still pending"
        : ""),
    async () => {
      test.setTimeout(90000);
      const iri = await create("Source before opening");
      await request("freeze");
      const sourceFile = path.join(profile, "source-before-open.axiom");
      const destination = path.join(profile, "destination-being-opened.axiom");
      await save(sourceFile);
      const setSourceDraft = async (text: string) => {
        await menu("view.source");
        const pane = page.getByRole("region", {
          name: "Ontology source editor",
        });
        const editor = pane.getByRole("textbox", {
          name: "Ontology source",
          exact: true,
        });
        await expect(editor).toBeVisible();
        if (
          (await pane.getByRole("status").textContent())?.startsWith("Draft")
        ) {
          const discard = pane.getByRole("button", {
            name: "Discard draft and reload",
            exact: true,
          });
          if (await discard.isVisible()) await discard.click();
          else {
            await pane
              .getByRole("button", { name: "More actions", exact: true })
              .click();
            await page
              .getByRole("menuitem", {
                name: "Discard draft and reload",
                exact: true,
              })
              .click();
          }
        }
        await expect(pane.getByRole("status")).toHaveText("Clean");
        await editor.focus();
        await editor.press("Control+a");
        await page.keyboard.insertText(text);
        await expect(editor).toHaveValue(text);
        await expect(pane.getByRole("status")).toContainText("Draft pending");
      };
      const destinationDraft =
        `<${iri}> a <http://www.w3.org/2002/07/owl#Class>; ` +
        '<http://www.w3.org/2000/01/rdf-schema#label> "Unapplied destination draft" .\n';
      await request("rename", {
        iri,
        name: "Destination loaded before quitting",
      });
      await request("spacing", { value: 2.5 });
      await menu("view.graph");
      await menu("graph.zoom.in");
      await setSourceDraft(destinationDraft);
      await save(destination);
      const expected = JSON.parse(await readFile(destination, "utf8"));
      const renameGraph = (node: any): boolean => {
        if (node?.type === "tab" && node.id === "graph") {
          node.name = "Destination graph";
          node.config.axiomTab.named = true;
          return true;
        }
        return Array.isArray(node?.children) && node.children.some(renameGraph);
      };
      expect(renameGraph(expected.workbench.layout.layout)).toBe(true);
      expect(expected.workbench.panelState["graph.camera"]).toBeDefined();
      expect(expected.editorDrafts.source.text).toBe(destinationDraft);
      // This is a valid FlexLayout tab name, so the destination layout differs even if pane geometry coincides.
      await writeFile(destination, JSON.stringify(expected));
      await request("rename", { iri, name: "Source before opening" });
      await request("spacing", { value: 1.25 });
      await menu("view.graph");
      await menu("graph.zoom.out");
      const sourceDraft =
        `<${iri}> a <http://www.w3.org/2002/07/owl#Class>; ` +
        '<http://www.w3.org/2000/01/rdf-schema#label> "Unapplied source draft" .\n';
      await setSourceDraft(sourceDraft);
      await save(sourceFile);
      const old = JSON.parse(await readFile(sourceFile, "utf8"));
      expect(old.workbench.layout).not.toEqual(expected.workbench.layout);
      expect(old.editorDrafts.source.text).toBe(sourceDraft);
      await expect
        .poll(() => page.evaluate(() => window.axiom.workspace.saving()))
        .toBe(false);
      await observeDomainService(app!, page);
      await app!.evaluate(
        ({ dialog, ipcMain }, { destination, boundary }) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [destination],
          });
          let forward: (() => void) | undefined;
          let restore: () => void;
          if (boundary === "data load") {
            const utility = (globalThis as any).__domainServiceObserver.utility;
            const original = utility.postMessage;
            const intercept = function (
              this: unknown,
              message: any,
              ...rest: any[]
            ) {
              if (
                message?.channel === "axiom-domain-v1" &&
                message.type === "request" &&
                message.packet?.method === "loadWorkspaceFile" &&
                message.packet.args?.file === destination
              ) {
                forward = () =>
                  Reflect.apply(original, utility, [message, ...rest]);
                return;
              }
              return Reflect.apply(original, this, [message, ...rest]);
            };
            utility.postMessage = intercept;
            restore = () => {
              utility.postMessage = original;
            };
          } else {
            // Hold the real destination preference result after main has read it.
            const original = (ipcMain as any)._invokeHandlers.get(
              "preferences:load",
            );
            ipcMain.removeHandler("preferences:load");
            ipcMain.handle("preferences:load", (event, ...args) => {
              const response = Promise.resolve(original(event, ...args));
              void response.catch(() => {});
              return new Promise((resolve, reject) => {
                forward = () => {
                  void response.then(resolve, reject);
                };
              });
            });
            restore = () => {
              ipcMain.removeHandler("preferences:load");
              ipcMain.handle("preferences:load", original);
            };
          }
          (globalThis as any).__closingOpen = {
            pending: () => !!forward,
            release: () => {
              restore();
              const resume = forward;
              forward = undefined;
              resume?.();
            },
          };
        },
        { destination, boundary },
      );
      const ownedProcess = app!.process();
      await menu("file.open");
      try {
        await expect
          .poll(() =>
            app!.evaluate(() => (globalThis as any).__closingOpen.pending()),
          )
          .toBe(true);
        if (boundary === "preferences reply") {
          expect(
            (await state()).entities.find((entity) => entity.iri === iri)
              ?.label,
          ).toBe("Destination loaded before quitting");
          await expect
            .poll(async () => (await stored()).workspacePath)
            .toBe(destination);
          await expect
            .poll(() => page.evaluate(() => window.axiom.workspace.saving()))
            .toBe(false);
        }
        expect((await beginExit("X")).after).toEqual([false]);
        await expectHiddenInBackground(1);
      } finally {
        await app!.evaluate(() => (globalThis as any).__closingOpen.release());
      }
      await expect
        .poll(() => ownedProcess.exitCode, { timeout: 15000 })
        .not.toBeNull();
      expect(ownedProcess.exitCode).toBe(0);
      app = undefined;
      const saved = JSON.parse(await readFile(destination, "utf8"));
      const session = await stored();
      expect(session.workspacePath).toBe(destination);
      expect(
        saved.entities.find((entity: any) => entity.iri === iri)?.label,
      ).toBe("Destination loaded before quitting");
      expect(saved.graphs.graph.spacing).toBe(2.5);
      expect(saved.workbench.layout).toEqual(expected.workbench.layout);
      expect(saved.workbench.panelState["graph.camera"]).toEqual(
        expected.workbench.panelState["graph.camera"],
      );
      expect(saved.editorDrafts.source.text).toBe(destinationDraft);
      expect(saved.editorDrafts.source.loaded.text).toBe(
        expected.editorDrafts.source.loaded.text,
      );
      expect(saved.editorDrafts.source.loaded.format).toBe(
        expected.editorDrafts.source.loaded.format,
      );
      expect(saved.editorDrafts.source.loaded.version).toBe(saved.storeVersion);
      expect(saved.editorDrafts.source.loaded.datasetEpoch).toBe(
        saved.datasetEpoch,
      );
      expect(session.workspace.graphs).toEqual(saved.graphs);
      expect(session.workbench.layout).toEqual(expected.workbench.layout);
      expect(session.workbench.panelState["graph.camera"]).toEqual(
        expected.workbench.panelState["graph.camera"],
      );
      expect(session.editorDrafts.source.text).toBe(destinationDraft);
      expect(session.editorDrafts.source.loaded.text).toBe(
        saved.editorDrafts.source.loaded.text,
      );
      await launch();
      expect(
        (await state()).entities.find((entity) => entity.iri === iri)?.label,
      ).toBe("Destination loaded before quitting");
      await menu("view.source");
      await expect(
        page.getByRole("textbox", { name: "Ontology source", exact: true }),
      ).toHaveValue(destinationDraft);
      const reopenedSource = page.getByRole("region", {
        name: "Ontology source editor",
      });
      await expect(reopenedSource.getByRole("status")).toHaveText(
        "Draft pending",
      );
      const apply = reopenedSource.getByRole("button", {
        name: "Apply changes",
        exact: true,
      });
      await expect(apply).toBeEnabled();
      await apply.click();
      await expect
        .poll(
          async () =>
            (await state()).entities.find((entity) => entity.iri === iri)
              ?.label,
        )
        .toBe("Unapplied destination draft");
    },
  );

// #123: observe actual timer ticks and disk metadata with the large fixture.
test("#123 unchanged large workspaces skip serialization and disk writes across idle ticks", async ({}, info) => {
  test.setTimeout(390000);
  await observeDomainService(app!, page);
  await app!.evaluate(() => {
    // craigtrim/axiom#207: main requests checkpoint metadata, never workspace JSON.
    (globalThis as any).__domainServiceObserver.counts = {
      serialize: 0,
      serializeJson: 0,
      checkpointPrepare: 0,
      sessionState: 0,
    };
  });
  const calls = () =>
    app!.evaluate(() => {
      const counts = (globalThis as any).__domainServiceObserver.counts;
      return {
        serialize: counts.serialize ?? 0,
        serializeJson: counts.serializeJson ?? 0,
        checkpointPrepare: counts.checkpointPrepare ?? 0,
        sessionState: counts.sessionState ?? 0,
      };
    });
  const imported = path.join(profile, "schools.ttl");
  await writeFile(imported, schoolOntology());
  await app!.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, imported);
  await menu("file.open");
  await expect
    .poll(
      async () => (await stored().catch(() => ({}))).workspace?.ontology?.name,
      { timeout: 30000 },
    )
    .toBe("schools.ttl");
  expect(
    await page.evaluate(async () => {
      const snapshot = await window.axiom.request<Snapshot>("state");
      return snapshot.entities.filter((e) => e.kind === "Individual").length;
    }),
  ).toBe(21461);
  const sessionFile = path.join(profile, "last-session.json");
  const samples: { named: boolean; workingSetKB: number }[] = [];
  const idle = async (file?: string, browse = false) => {
    const before = await calls(),
      sessionTime = (await stat(sessionFile)).mtimeMs;
    const fileTime = file ? (await stat(file)).mtimeMs : undefined;
    const summary = (s: any) => ({
      ...s,
      workspace: {
        ...s.workspace,
        tbox: undefined,
        entities: undefined,
        individuals: undefined,
        customers: undefined,
      },
    });
    const initial = summary(await stored());
    if (browse) await menu("view.individuals");
    for (let tick = 0; tick < 4; tick++) {
      if (browse) {
        await request("select", { iri: schoolBase + "school" + (tick + 1) });
        await request("drag", {
          iri: schoolBase + "school0",
          x: 400 + tick * 20,
          y: 250 + tick * 20,
        });
        const individuals = page.getByRole("region", {
          name: "Individuals",
          exact: true,
        });
        await individuals
          .getByRole("button", { name: "Next page", exact: true })
          .click();
        await individuals
          .getByRole("region", { name: "Individuals table, scrollable" })
          .evaluate((element) => {
            element.scrollTop = 200;
          });
      }
      // This is the observation window, not a synchronization delay.
      await new Promise((resolve) => setTimeout(resolve, 30500));
      samples.push(
        await app!.evaluate(
          ({ app }, named) => ({
            named,
            workingSetKB: app.getAppMetrics().find((p) => p.type === "Browser")!
              .memory.workingSetSize,
          }),
          !!file,
        ),
      );
      if ((await stat(sessionFile)).mtimeMs !== sessionTime) {
        await info.attach("checkpoint-change", {
          body: JSON.stringify({
            before: initial,
            after: summary(await stored()),
            calls: await calls(),
          }),
          contentType: "application/json",
        });
      }
      expect((await stat(sessionFile)).mtimeMs).toBe(sessionTime);
      if (file) expect((await stat(file)).mtimeMs).toBe(fileTime);
      expect((await calls()).serializeJson).toBe(before.serializeJson);
      expect((await calls()).checkpointPrepare).toBe(before.checkpointPrepare);
      expect((await calls()).serialize).toBe(before.serialize);
    }
    expect((await calls()).sessionState).toBeGreaterThanOrEqual(
      before.sessionState + 4,
    );
  };
  await idle();
  const file = path.join(profile, "schools.axiom");
  await request("seed", { iris: [schoolBase + "school0"], expand: false });
  await request("freeze");
  await request("select", { iri: schoolBase + "School" });
  await save(file);
  const baseline = await stored();
  await idle(file, true);
  await writeFile(
    info.outputPath("main-process-memory.json"),
    JSON.stringify(samples),
  );
  await info.attach("main-process-memory", {
    body: JSON.stringify(samples),
    contentType: "application/json",
  });
  // View-only changes never reached disk, including after a forced exit.
  await app!.evaluate(({ app }) => app.exit(0)).catch(() => {});
  app = undefined;
  await launch();
  // #221: retain the exact assertions without transferring the full large snapshot.
  const recovered = await page.evaluate(async () => {
    const snapshot = await window.axiom.request<Snapshot>("state");
    return {
      selected: snapshot.selected,
      positions: snapshot.graphs!.graph.nodes.map((n) => [n.iri, n.x, n.y]),
    };
  });
  expect(recovered.selected).toBe(baseline.workspace.selected);
  expect(recovered.positions).toEqual(
    baseline.workspace.graphs.graph.positions.map((n: any) => [
      n.iri,
      n.x,
      n.y,
    ]),
  );
  const restored = await page.evaluate(() => window.axiom.preferences.load());
  expect(restored.panelState?.["table.individuals.page"] ?? 1).toEqual(
    baseline.workbench.panelState?.["table.individuals.page"] ?? 1,
  );
  await observeDomainService(app!, page);
  const before = await calls();
  await request("select", { iri: schoolBase + "school42" });
  await request("rename", {
    iri: schoolBase + "school42",
    name: "Autosaved school 42",
  });
  await expect
    .poll(
      async () =>
        (await stored()).workspace.entities.find(
          (e: any) => e.iri === schoolBase + "school42",
        )?.label,
      { timeout: 35000 },
    )
    .toBe("Autosaved school 42");
  expect((await stored()).workspace.selected).toBe(baseline.workspace.selected);
  expect((await calls()).checkpointPrepare).toBe(before.checkpointPrepare + 1);
  expect((await calls()).serializeJson).toBe(0);
  await close();
  await launch();
  expect(
    await page.evaluate(
      async () => (await window.axiom.request<Snapshot>("state")).selected,
    ),
  ).toBe(schoolBase + "school42");
});
