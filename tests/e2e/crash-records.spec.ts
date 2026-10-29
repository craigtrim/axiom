// craigtrim/axiom#182: every crash path leaves a detailed error-log record that survives a restart.
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { AuditRecord } from "../../src/shared/audit";
import type { Snapshot } from "../../src/shared/protocol";

let app: ElectronApplication | undefined, page: Page, profile: string;
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
    (globalThis as any).__dialogs = [];
    dialog.showMessageBox = (async (_window: unknown, options: any) => {
      (globalThis as any).__dialogs.push(options.message);
      return { response: 0, checkboxChecked: false };
    }) as never;
    const { Worker } = process.getBuiltinModule(
      "worker_threads",
    ) as typeof import("node:worker_threads");
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...rest) {
      if (message?.method === "state")
        (globalThis as any).__domainWorker ??= this;
      // A held method never reaches the worker, so its request stays pending.
      if (message?.method && message.method === (globalThis as any).__hold) {
        (globalThis as any).__held = true;
        return;
      }
      return original.call(this, message, ...rest);
    };
  });
  await expect(
    page.getByRole("contentinfo", { name: "Workbench status" }),
  ).toBeVisible();
  // Requests before a failure must appear in its timeline.
  await page.evaluate(() => window.axiom.request("state"));
}
// Read from disk, because a crashed window can no longer answer.
async function saved() {
  const folder = path.join(profile, "error-logs");
  const names = await readdir(folder).catch(() => [] as string[]);
  const records: AuditRecord[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")))
    records.push(
      JSON.parse(await readFile(path.join(folder, name), "utf8")).record,
    );
  return records;
}
async function recorded(operation: string, text: string) {
  let found: AuditRecord | undefined;
  await expect
    .poll(
      async () =>
        !!(found = (await saved()).find(
          (r) => r.operation === operation && r.message.includes(text),
        )),
      { timeout: 20000 },
    )
    .toBe(true);
  return found!;
}
function detailed(r: AuditRecord, process: string) {
  expect(r.metadata.process).toBe(process);
  expect(r.metadata.appVersion).toBeTruthy();
  for (const name of [
    "Technical error",
    "Axiom processes",
    "Main process memory",
    "System memory",
    "Window",
    "Workspace",
  ])
    expect(r.details[name], name).toBeTruthy();
  expect(r.details["Axiom processes"]).toMatch(/Browser pid \d+: working set/);
  expect(r.events.some((e) => e.stage === "state")).toBe(true);
}
const dialogs = () =>
  app!.evaluate(() => (globalThis as any).__dialogs as string[]);
test.beforeEach(async () => {
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/crash-records-"));
  await launch();
});
test.afterEach(async () => {
  await app?.close().catch(() => {});
  app = undefined;
});

test("main, worker and window failures each leave one detailed record", async () => {
  await app!.evaluate(() => {
    setTimeout(() => {
      throw Error("crash-records main uncaught");
    });
  });
  const uncaught = await recorded(
    "Uncaught exception in main",
    "crash-records main uncaught",
  );
  detailed(uncaught, "main");
  expect(uncaught.details["Technical error"]).toContain(
    "crash-records main uncaught",
  );
  await expect
    .poll(dialogs)
    .toContain("Axiom hit an unexpected error and is still running.");

  await app!.evaluate(() => {
    void Promise.reject(Error("crash-records main rejection"));
  });
  detailed(
    await recorded(
      "Unhandled rejection in main",
      "crash-records main rejection",
    ),
    "main",
  );

  await app!.evaluate(() => {
    (globalThis as any).__domainWorker.emit(
      "error",
      Error("crash-records worker"),
    );
  });
  detailed(
    await recorded("Domain worker error", "crash-records worker"),
    "domain worker",
  );
  await expect.poll(dialogs).toContain("The data service stopped.");

  for (let i = 0; i < 2; i++)
    await page.evaluate(() => {
      setTimeout(() => {
        throw Error("crash-records window error");
      });
    });
  const thrown = await recorded(
    "Uncaught error in the window",
    "crash-records window error",
  );
  detailed(thrown, "renderer");
  expect(thrown.details["Technical error"]).toContain(
    "crash-records window error",
  );

  await page.evaluate(() => {
    void Promise.reject(Error("crash-records window rejection"));
  });
  detailed(
    await recorded(
      "Unhandled rejection in the window",
      "crash-records window rejection",
    ),
    "renderer",
  );
  expect(
    (await saved()).filter((r) =>
      r.message.includes("crash-records window error"),
    ),
  ).toHaveLength(1);

  // A state without its ontology fails while panes render. FlexLayout's per-tab
  // boundaries catch it, and the root hook still records it.
  const snapshot = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await app!.evaluate(
    ({ BrowserWindow }, data) =>
      BrowserWindow.getAllWindows()[0].webContents.send("domain:event", {
        type: "state",
        data,
      }),
    { ...snapshot, ontology: null },
  );
  await expect(
    page.getByText("Error rendering component").first(),
  ).toBeVisible();
  const display = await recorded(
    "Display error",
    "Cannot read properties of null",
  );
  detailed(display, "renderer");
  expect(display.details["Component stack"]).toBeTruthy();

  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer(),
  );
  const gone = await recorded("Renderer process stopped", "renderer process");
  expect(gone.metadata).toMatchObject({ process: "renderer" });
  expect(gone.metadata.reason).toBeTruthy();
  expect(typeof gone.metadata.exitCode).toBe("number");
  expect(gone.details["Axiom processes"]).toBeTruthy();

  // Closing needs a live renderer to capture the open views, so restore one first.
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.reload(),
  );
  await expect(
    page.getByRole("contentinfo", { name: "Workbench status" }),
  ).toBeVisible();
  // Every record is listed by the Error Log after a clean restart, with no unexpected-exit record.
  await app!.close();
  await launch();
  const listed = await page.evaluate(() => window.axiom.audit.list());
  for (const operation of [
    "Uncaught exception in main",
    "Unhandled rejection in main",
    "Domain worker error",
    "Uncaught error in the window",
    "Unhandled rejection in the window",
    "Display error",
    "Renderer process stopped",
  ])
    expect(listed.map((r) => r.operation)).toContain(operation);
  expect(listed.map((r) => r.operation)).not.toContain(
    "Previous session ended unexpectedly",
  );
});

test("a native crash of main is reported at the next start with its dump and last activity", async () => {
  await page.evaluate(() => window.axiom.request("state"));
  const exited = new Promise((resolve) => app!.process().once("exit", resolve));
  await app!.evaluate(() => {
    setTimeout(() => process.crash(), 100);
  });
  await exited;
  app = undefined;
  await launch();
  const r = await recorded(
    "Previous session ended unexpectedly",
    "Axiom stopped unexpectedly and wrote",
  );
  expect(r.details["Crash dumps"]).toMatch(/\.dmp/);
  expect(r.details["Axiom processes at the last activity"]).toMatch(
    /Browser pid \d+/,
  );
  expect(r.events.some((e) => e.stage === "state")).toBe(true);
  expect(r.metadata.previousProcessId).toEqual(expect.any(Number));
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await window.axiom.audit.list()).map((e) => e.operation),
      ),
    )
    .toContain("Previous session ended unexpectedly");
  // The same dump is never reported twice.
  await app!.close();
  await launch();
  expect(
    (await saved()).filter(
      (e) => e.operation === "Previous session ended unexpectedly",
    ),
  ).toHaveLength(1);
});

test("an unexpected worker exit rejects waiting requests and leaves one record", async () => {
  await app!.evaluate(() => {
    (globalThis as any).__hold = "inspector";
  });
  const waiting = page.evaluate(() =>
    window.axiom
      .request("inspector", { iri: "http://www.w3.org/2002/07/owl#Thing" })
      .then(
        () => "resolved",
        (e: Error) => e.message,
      ),
  );
  await expect
    .poll(() => app!.evaluate(() => (globalThis as any).__held === true))
    .toBe(true);
  await app!.evaluate(() =>
    (globalThis as any).__domainWorker.terminate().then(() => undefined),
  );
  expect(await waiting).toContain("The data service exited with code 1.");
  const r = await recorded("Domain worker exit", "exited with code 1");
  detailed(r, "domain worker");
  expect(r.metadata.exitCode).toBe(1);
  expect(r.details["Requests in flight"]).toContain("inspector");
  // Later requests fail at once instead of waiting on a worker that is gone.
  expect(
    await page.evaluate(() =>
      window.axiom.request("state").then(
        () => "resolved",
        (e: Error) => e.message,
      ),
    ),
  ).toContain("The data service exited with code 1.");
  expect(
    (await saved()).filter((e) => e.operation.startsWith("Domain worker")),
  ).toHaveLength(1);
  // Saving on close needs the worker, so this run ends without closing.
  app!.process().kill();
  app = undefined;
});
