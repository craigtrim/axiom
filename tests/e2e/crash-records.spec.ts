// craigtrim/axiom#182: every crash path leaves a detailed error-log record that survives a restart.
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type CDPSession,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
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
  await app.evaluate(({ app, dialog }) => {
    (globalThis as any).__beforeQuit = [];
    app.on("before-quit", () =>
      (globalThis as any).__beforeQuit.push(new Date().toISOString()),
    );
    (globalThis as any).__dialogs = [];
    dialog.showMessageBox = (async (_window: unknown, options: any) => {
      (globalThis as any).__dialogs.push(options.message);
      return { response: 0, checkboxChecked: false };
    }) as never;
    // craigtrim/axiom#207: observe the actual data process, including abrupt exits.
    const child = (process as any)
      ._getActiveHandles()
      .find(
        (handle: any) =>
          typeof handle?.send === "function" &&
          Array.isArray(handle.spawnargs) &&
          handle.spawnargs.some(
            (arg: unknown) =>
              typeof arg === "string" &&
              arg.split(/[\\/]/).at(-1) === "domain-worker.cjs",
          ),
      );
    if (!child) throw Error("The domain child is not running.");
    (globalThis as any).__domainWorker = child;
    const original = child.send;
    child.send = function (message: any, ...rest: any[]) {
      if (message?.method === "state")
        (globalThis as any).__domainWorker ??= this;
      // A held method never reaches the worker, so its request stays pending.
      if (message?.method && message.method === (globalThis as any).__hold) {
        (globalThis as any).__held = true;
        return true;
      }
      return (original as Function).call(this, message, ...rest);
    };
  });
  await expect(
    page.getByRole("contentinfo", { name: "Workbench status" }),
  ).toBeVisible();
  // Requests before a failure must appear in its timeline.
  await page.evaluate(() => window.axiom.request("state"));
}
// When main dies abruptly on Windows, its GPU, renderer, utility and crash handler
// processes outlive it and keep Playwright's pipes open, which stalls worker teardown.
// Windows keeps each child's parent id after the parent exits, so they can be found.
function stopOrphans(pid: number) {
  if (process.platform !== "win32") return;
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ],
    { windowsHide: true },
  );
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

test("main, worker and window failures each leave one detailed record", async ({}, info) => {
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

  const target = await app!.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0],
      contents = window.webContents;
    const observation = {
      windowId: window.id,
      contentsId: contents.id,
      pid: contents.getOSProcessId(),
      appListeners: app.listenerCount("render-process-gone"),
      contentsListeners: contents.listenerCount("render-process-gone"),
      contentsGone: [] as { reason: string; exitCode: number }[],
      appGone: [] as { contentsId: number; reason: string; exitCode: number }[],
      beforeQuit: (globalThis as any).__beforeQuit as string[],
    };
    (globalThis as any).__rendererCrash = observation;
    contents.on("render-process-gone", (_event, details) => {
      observation.contentsGone.push({
        reason: details.reason,
        exitCode: details.exitCode,
      });
    });
    app.on("render-process-gone", (_event, gone, details) => {
      observation.appGone.push({
        contentsId: gone.id,
        reason: details.reason,
        exitCode: details.exitCode,
      });
    });
    return { contentsId: contents.id, pid: observation.pid };
  });
  const observeCrash = () =>
    app!.evaluate(({ webContents }, target) => {
      const contents = webContents.fromId(target.contentsId);
      let originalProcess = "running";
      try {
        process.kill(target.pid, 0);
      } catch (error) {
        originalProcess =
          (error as NodeJS.ErrnoException).code === "ESRCH"
            ? "gone"
            : String((error as NodeJS.ErrnoException).code);
      }
      const observation = (globalThis as any).__rendererCrash;
      return {
        ...observation,
        originalProcess,
        destroyed: !contents || contents.isDestroyed(),
        crashed: !!contents && !contents.isDestroyed() && contents.isCrashed(),
        currentPid:
          contents && !contents.isDestroyed()
            ? contents.getOSProcessId()
            : null,
        contentsEventCount: observation.contentsGone.length,
        appEventCount: observation.appGone.filter(
          (event: { contentsId: number }) =>
            event.contentsId === target.contentsId,
        ).length,
      };
    }, target);
  let crashFailure: unknown;
  let diagnosticStoppedDomain = false;
  let crashSession: CDPSession | undefined;
  let crashCommand: { state: string; message?: string } = { state: "not sent" };
  try {
    expect(target.pid).toBeGreaterThan(0);
    // CDP crashes the native renderer directly, bypassing Electron's shutdown helper.
    crashSession = await page.context().newCDPSession(page);
    crashCommand = { state: "pending" };
    void crashSession.send("Page.crash").then(
      () => {
        crashCommand = { state: "resolved" };
      },
      (error: Error) => {
        crashCommand = { state: "rejected", message: error.message };
      },
    );
    await expect.poll(observeCrash, { timeout: 10000 }).toMatchObject({
      crashed: true,
      contentsEventCount: 1,
    });
    const observed = await observeCrash();
    expect(
      observed,
      "the app must receive the target renderer's native exit event",
    ).toMatchObject({
      appEventCount: 1,
      beforeQuit: [],
    });
    const gone = await recorded("Renderer process stopped", "renderer process");
    expect(gone.metadata).toMatchObject({ process: "renderer" });
    expect(gone.metadata.reason).toBeTruthy();
    expect(typeof gone.metadata.exitCode).toBe("number");
    expect(gone.details["Axiom processes"]).toBeTruthy();
  } catch (error) {
    crashFailure = error;
    // A failure remains a failure. Stopping the data child only distinguishes
    // native channel retention from a renderer notification/recovery defect.
    const diagnostic: Record<string, unknown> = {};
    try {
      diagnostic.before = await observeCrash();
      diagnostic.child = await app!.evaluate(() => {
        const child = (globalThis as any).__domainWorker;
        if (
          !child?.spawnargs?.some(
            (argument: unknown) =>
              typeof argument === "string" &&
              argument.split(/[\\/]/).at(-1) === "domain-worker.cjs",
          )
        )
          throw Error("The captured process is not the ontology child.");
        return { pid: child.pid, killAccepted: child.kill() };
      });
      diagnosticStoppedDomain = true;
      await expect
        .poll(
          () =>
            app!.evaluate(() => {
              const child = (globalThis as any).__domainWorker;
              return {
                stopped: child.exitCode !== null || child.signalCode !== null,
                exitCode: child.exitCode,
                signalCode: child.signalCode,
              };
            }),
          { timeout: 3000 },
        )
        .toMatchObject({ stopped: true });
      // This is a bounded observation window after a diagnostic intervention.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      diagnostic.after = await observeCrash();
    } catch (diagnosticFailure) {
      diagnostic.error = String(diagnosticFailure);
    }
    await info
      .attach("renderer-crash-after-domain-exit", {
        body: JSON.stringify(diagnostic, null, 2),
        contentType: "application/json",
      })
      .catch(() => {});
  } finally {
    await observeCrash()
      .then((observation) =>
        info.attach("renderer-crash-observations", {
          body: JSON.stringify(
            {
              ...observation,
              trigger: "CDP Page.crash",
              command: crashCommand,
            },
            null,
            2,
          ),
          contentType: "application/json",
        }),
      )
      .catch(() => {});
    void crashSession?.detach().catch(() => {});
    // Capture on close needs a renderer even when one of the crash assertions fails.
    // The old Playwright page is unusable, so main checks the recovered renderer.
    try {
      if (diagnosticStoppedDomain)
        throw Error(
          "The fixture stopped its ontology child while diagnosing the renderer failure.",
        );
      await app!.evaluate(
        ({ webContents }, id) => webContents.fromId(id)!.reload(),
        target.contentsId,
      );
      await expect
        .poll(
          () =>
            app!.evaluate(
              ({ webContents }, id) =>
                new Promise<boolean>((resolve) => {
                  const timeout = setTimeout(() => resolve(false), 1000);
                  const contents = webContents.fromId(id);
                  if (!contents || contents.isDestroyed()) {
                    clearTimeout(timeout);
                    resolve(false);
                    return;
                  }
                  void contents
                    .executeJavaScript(
                      `!!document.querySelector('[aria-label="Workbench status"]')`,
                    )
                    .then(
                      (ready) => {
                        clearTimeout(timeout);
                        resolve(!!ready);
                      },
                      () => {
                        clearTimeout(timeout);
                        resolve(false);
                      },
                    );
                }),
              target.contentsId,
            ),
          { timeout: 20000 },
        )
        .toBe(true);
    } catch (recoveryFailure) {
      await info
        .attach("renderer-recovery-failure", {
          body: String(recoveryFailure),
          contentType: "text/plain",
        })
        .catch(() => {});
      crashFailure ??= recoveryFailure;
      const pid = app!.process().pid!;
      app!.process().kill();
      stopOrphans(pid);
      app = undefined;
    }
  }
  if (crashFailure) throw crashFailure;
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
  const pid = app!.process().pid!;
  const exited = new Promise((resolve) => app!.process().once("exit", resolve));
  await app!.evaluate(() => {
    setTimeout(() => process.crash(), 100);
  });
  await exited;
  app = undefined;
  stopOrphans(pid);
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
  await app!.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const child = (globalThis as any).__domainWorker;
        child.once("close", () => resolve());
        child.kill();
      }),
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
  const pid = app!.process().pid!;
  const exited = new Promise((resolve) => app!.process().once("exit", resolve));
  app!.process().kill();
  await exited;
  app = undefined;
  stopOrphans(pid);
});
