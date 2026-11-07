// craigtrim/axiom#94: the Source action row reports draft state directly.
// Issue 85: Details fields use predicate names and per-group value numbers.
// #166: reopening a recovered workspace waits for Close to finish its checkpoint.
// #217: ontology autosaves retain the last saved layout until Save or close.
// #218: the shell reports saving until checkpoint writes and release finish.
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
const stored = async () =>
  JSON.parse(await readFile(path.join(profile, "last-session.json"), "utf8"));
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
  try {
    await app!.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await menu("file.saveAs");
    await completion.wait();
    await expect
      .poll(async () => (await stored().catch(() => ({}))).workspacePath)
      .toBe(file);
    await expect
      .poll(async () => (await state()).dirty, { timeout: 30000 })
      .toBe(false);
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

test("a failed final save keeps the window open, preserves recovery and exposes an audit log", async () => {
  const iri = await create();
  const folder = path.join(profile, "destination");
  await mkdir(folder);
  const file = path.join(folder, "saved.axiom");
  await save(file);
  await request("rename", { iri, name: "Retained despite failure" });
  // #162: missing destinations now recover normally; fail a write to an existing file.
  await mkdir(file + ".bak");
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.axiom.audit.list())).some(
        (e) => e.operation === "Save workspace on close",
      ),
    )
    .toBe(true);
  expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "Retained despite failure",
  );
  expect(
    (await stored()).workspace.entities.find((e: any) => e.iri === iri).label,
  ).toBe("Retained despite failure");
  await rm(file + ".bak", { recursive: true });
  await close();
  expect(
    JSON.parse(
      await readFile(path.join(folder, "saved.axiom"), "utf8"),
    ).entities.find((e: any) => e.iri === iri).label,
  ).toBe("Retained despite failure");
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

test("honours closing while a workspace is still opening and saves the completed view", async () => {
  await create("Close after opening");
  const file = path.join(profile, "close-during-open.axiom");
  await save(file);
  await app!.evaluate(({ dialog, BrowserWindow }, file) => {
    dialog.showOpenDialog = async () => {
      BrowserWindow.getAllWindows()[0].close();
      return { canceled: false, filePaths: [file] };
    };
  }, file);
  const process = app!.process();
  await menu("file.open");
  await expect.poll(() => process.exitCode, { timeout: 15000 }).not.toBeNull();
  app = undefined;
  expect((await stored()).workspacePath).toBe(file);
  await launch();
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.name === "Close after opening"),
    )
    .toBe(true);
});

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
    (await state()).entities.filter((e) => e.kind === "Individual"),
  ).toHaveLength(21461);
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
  expect((await state()).selected).toBe(baseline.workspace.selected);
  expect(
    (await state()).graphs!.graph.nodes.map((n) => [n.iri, n.x, n.y]),
  ).toEqual(
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
  expect((await state()).selected).toBe(schoolBase + "school42");
});
