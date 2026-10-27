// craigtrim/axiom#94: deterministic recorded inputs feed the real native utility views.
import { expect, _electron, type ElectronApplication } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
export const utilityReference =
  "tests/fixtures/utility-visual/visual-reference.html";
export async function referenceData() {
  const bytes = await readFile(utilityReference);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "24ce03774c0951988db376e208360c327798ac03a636360689d94a924e09a7c7",
  );
  const html = bytes.toString("utf8");
  const segment = (start: string, end: string) =>
    html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  return runInNewContext(
    [
      segment("  function iri(u)", "  function dirty()"),
      segment("  var PR =", "  var Prov ="),
      segment("  var RUNS =", "  var Runs ="),
      segment("  function longText(", "  var Errors ="),
      segment("  var HIST =", "  var Hist ="),
      "JSON.parse(JSON.stringify({DOC,PR,WALK,RUNS,ERR,HIST,PROMPT,STDERR}))",
    ].join("\n"),
  );
}
export async function utilityMenu(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
export async function launchUtility(
  theme = "light",
  view = "source",
  frame = 1,
  recorded = true,
) {
  const data = await referenceData();
  await mkdir("artifacts/issue-94", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-94/profile-"));
  const file = path.join(profile, "reference.trig");
  await writeFile(file, data.DOC);
  const history = data.HIST.list.map((x: any, i: number) => ({
    id: "utilitySaved" + i,
    type: x.t.toLowerCase(),
    name: x.n,
    named: !x.auto,
    createdAt: x.d + "T12:00:00.000Z",
    updatedAt: x.d + "T12:00:00.000Z",
    config: {},
    panelState: {},
  }));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({
      version: 1,
      theme,
      tabSavePolicy: "named",
      tabHistory: { version: 1, entries: history, counters: {} },
    }),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    args: [
      ".",
      "--force-device-scale-factor=2",
      "--disable-lcd-text",
      "--disable-gpu",
      "--force-color-profile=srgb",
    ],
    env,
  });
  try {
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.locator(".docking-workspace")).toBeVisible();
    await app.evaluate(({ BrowserWindow, dialog }, file) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setFocusable(false);
      win.unmaximize();
      win.setSize(1560, 940);
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    }, file);
    await utilityMenu(app, "file.open");
    const state = () =>
      page.evaluate(() => window.axiom.request<Snapshot>("state"));
    await expect
      .poll(async () =>
        (await state()).entities.some(
          (e) => e.iri === "http://example.org/axiom#JournalArticle",
        ),
      )
      .toBe(true);
    // Import broadcasts the ontology before the workbench reset and capture finish.
    // Wait for that real checkpoint before installing this specimen's preferences.
    await expect
      .poll(async () => {
        try {
          const session = JSON.parse(
            await readFile(path.join(profile, "last-session.json"), "utf8"),
          );
          return (
            session.workspace.entities.some(
              (entity: { iri: string }) =>
                entity.iri === "http://example.org/axiom#JournalArticle",
            ) && session.workbench.tabHistory.entries.length === 0
          );
        } catch {
          return false;
        }
      })
      .toBe(true);
    // Open the recorded history through the normal preferences load after importing this fixture dataset.
    await page.evaluate(
      async ({ history, theme, all }) => {
        const prefs = await window.axiom.preferences.load();
        await window.axiom.preferences.save({
          ...prefs,
          theme: theme as "light" | "dark",
          tabSavePolicy: all ? "all" : "named",
          tabHistory: { version: 1, entries: history, counters: {} },
        });
      },
      { history, theme, all: false },
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "command",
        "workspace.preferences",
      ),
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.axiom.preferences.load()))
            .tabHistory?.entries.length,
      )
      .toBe(history.length);
    // Visual source uses the published document; mutation tests separately exercise the serializer and parser.
    const doc = await page.evaluate(() =>
      window.axiom.request<any>("sourceDocument", { format: "trig" }),
    );
    doc.text = data.DOC;
    if (recorded)
      await app.evaluate(
        ({ ipcMain, BrowserWindow }, { data, frame, namespace, doc }) => {
          const original = (ipcMain as any)._invokeHandlers.get(
            "domain:request",
          );
          ipcMain.removeHandler("domain:request");
          ipcMain.handle("domain:request", (event, method, args) =>
            method === "sourceDocument" ? doc : original(event, method, args),
          );
          const g = globalThis as any;
          const complete = [10, 12, 13, 14].includes(frame),
            collected = complete || [9, 11].includes(frame);
          const walk = collected ? data.WALK.slice(0, complete ? 11 : 6) : [];
          const recent = walk
            .map((p: string) => ({
              path: data.PR.root + "\\" + p,
              kind: p.includes(".") ? "file" : "folder",
              observations: p.includes(".") ? 7 : 3,
              issues: p.includes("placeholder") ? 1 : 0,
              coverage: p.includes("placeholder")
                ? "coverage note, content not read"
                : "",
              status: "Collected",
            }))
            .reverse();
          g.utilityProvenance = {
            ...data.PR,
            status: complete
              ? "complete"
              : frame === 9
                ? "running"
                : frame === 11
                  ? "cancelled"
                  : "idle",
            entries: walk.length,
            observations: recent.reduce(
              (n: number, r: any) => n + r.observations,
              0,
            ),
            files: recent.filter((r: any) => r.kind === "file").length,
            directories: recent.filter((r: any) => r.kind === "folder").length,
            issues: recent.reduce((n: number, r: any) => n + r.issues, 0),
            recent,
            options: {
              readOffline: frame === 8,
              maxEntries: 0,
              timeoutSeconds: 120,
            },
            rdfPath: collected ? "fixture.nt" : undefined,
            current:
              frame === 9 ? data.PR.root + "\\" + walk.at(-1) : undefined,
          };
          ipcMain.removeHandler("provenance:status");
          ipcMain.handle("provenance:status", () => g.utilityProvenance);
          const finished = [17, 20, 21, 23, 24, 27, 28, 29].includes(frame);
          const runs = data.RUNS.frozen.map((label: string, i: number) => ({
            id: "run" + i,
            iri: "urn:utility:" + label,
            label,
            state: finished
              ? i === 2
                ? "failed"
                : "completed"
              : frame === 16
                ? i < 2
                  ? "completed"
                  : i === 2
                    ? "running"
                    : "queued"
                : [18, 19].includes(frame)
                  ? i === 0
                    ? "completed"
                    : i === 1
                      ? frame === 18
                        ? "running"
                        : "completed"
                      : frame === 18
                        ? "queued"
                        : "cancelled"
                  : "queued",
            count: 3 + ((i * 4) % 11),
            auditId: i === 2 ? "e1" : undefined,
            reviewable: finished && i !== 2,
            error:
              i === 2 ? "parse failed, outline item 6 has no label" : undefined,
          }));
          g.utilityBatch = {
            id: "utility-batch",
            namespace,
            datasetEpoch: 1,
            createdAt: Date.now(),
            mode: "children",
            provider: "claude",
            runs,
          };
          ipcMain.removeHandler("suggestions:batches");
          ipcMain.handle("suggestions:batches", () => [g.utilityBatch]);
          ipcMain.removeHandler("suggestions:cancelBatch");
          ipcMain.handle("suggestions:cancelBatch", () => {
            for (const r of g.utilityBatch.runs)
              if (r.state === "queued") r.state = "cancelled";
            BrowserWindow.getAllWindows()[0].webContents.send(
              "command",
              "suggestions.batchesChanged",
            );
          });
          const local = (date: string, tm?: string) =>
            new Date(
              date.slice(0, 10) + "T" + (tm ?? date.slice(11)),
            ).toISOString();
          const records = data.ERR.list.map((e: any) => {
            const process = !!e.exe || e.id === "e3";
            const details: any = {},
              detailLengths: any = {};
            if (process) {
              details.Prompt = data.PROMPT.slice(0, 262144);
              detailLengths.Prompt = {
                original: data.PROMPT.length,
                retained: 262144,
              };
            }
            if (e.resp) details["Assistant response"] = e.resp;
            if (e.exe) {
              details["Process stdout"] =
                "Reading 4 parents\nReading 11 siblings\nDone in 5.1s";
              details["Process stderr (last 8,000 characters)"] =
                data.STDERR.slice(-8000);
              detailLengths["Process stderr (last 8,000 characters)"] = {
                original: data.STDERR.length,
                retained: 8000,
                tail: true,
              };
              details.Arguments = e.args;
            }
            return {
              id: e.id,
              operation: e.op,
              startedAt: local(e.when, e.tl[0][0]),
              completedAt: local(e.when),
              outcome: e.kind,
              stage: e.stage,
              message: e.tl.at(-1)[1],
              events: e.tl
                .slice(0, -1)
                .map((t: any) => ({ time: local(e.when, t[0]), stage: t[1] })),
              metadata: process ? { exitCode: e.exit, executable: e.exe } : {},
              details,
              detailLengths,
              file: e.saved ? "fixture.json" : undefined,
              storageError: e.saved ? undefined : "fixture storage failure",
            };
          });
          g.utilityRecords = records;
          ipcMain.removeHandler("audit:list");
          ipcMain.handle("audit:list", () =>
            records.map(
              ({ events, details, metadata, detailLengths, ...r }: any) => r,
            ),
          );
          ipcMain.removeHandler("audit:read");
          ipcMain.handle("audit:read", (_event, id) =>
            records.find((r: any) => r.id === id),
          );
        },
        { data, frame, namespace: (await state()).ontology.namespace, doc },
      );
    await utilityMenu(
      app,
      view === "provenance" ? "file.provenance" : "view." + view,
    );
    const host = () => page.locator(`[data-pane-id="${view}"]`),
      pane = () => host().locator(`[data-panel="${view}"]`);
    await expect(pane()).toBeVisible();
    const size = async (width = 898, height = 530) => {
      await host().evaluate(
        (el, { width, height }) =>
          Object.assign((el as HTMLElement).style, {
            position: "fixed",
            left: "24px",
            top: "72px",
            width: width + "px",
            height: height + "px",
            zIndex: "1000",
          }),
        { width, height },
      );
      await expect
        .poll(async () => Math.round((await host().boundingBox())!.width))
        .toBe(width);
      await expect(host()).toHaveAttribute(
        "data-pane-narrow",
        String(width < 600),
      );
    };
    if (frame === 31) {
      await pane()
        .getByRole("button", { name: "All tabs", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.axiom.preferences.load()))
              .tabSavePolicy,
        )
        .toBe("all");
    }
    await size();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({
      content:
        ".utility-surface *{transition:none!important}.utility-surface .cursor{visibility:hidden!important}",
    });
    let copied: { before: string; report: string } | undefined;
    const copyReport = async () => {
      const before = await app.evaluate(({ clipboard }) =>
        clipboard.readText(),
      );
      await pane()
        .getByRole("button", { name: "Copy report", exact: true })
        .click();
      await expect(pane().getByRole("status")).toContainText("Report copied.");
      copied = {
        before,
        report: await app.evaluate(({ clipboard }) => clipboard.readText()),
      };
    };
    return {
      app,
      page,
      profile,
      file,
      data,
      doc,
      state,
      host,
      pane,
      size,
      errors,
      copyReport,
      close: async () => {
        try {
          if (copied)
            await app.evaluate(async ({ clipboard }, saved) => {
              if ((await clipboard.readText()) === saved.report)
                await clipboard.writeText(saved.before);
            }, copied);
        } finally {
          await app.close();
        }
      },
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
export type UtilityFixture = Awaited<ReturnType<typeof launchUtility>>;
