import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import path from "node:path";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";
import { THING } from "../../src/domain/model";
let app: ElectronApplication, page: Page, profile: string;
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const records = () => page.evaluate(() => window.axiom.audit.list());
const badge = () => page.locator('[data-pane="errorlog"] .badge');
const errorFrom = (method: string, args: Record<string, unknown>) =>
  page.evaluate(
    async ({ method, args }) => {
      try {
        await window.axiom.request(method as DomainMethod, args);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    },
    { method, args },
  );
async function advance() {
  const before = await state();
  await page.evaluate(
    (parent) =>
      window.axiom.request("createClass", { name: "New revision", parent }),
    THING,
  );
  expect((await state()).version).toBeGreaterThan(before.version);
  return { datasetEpoch: before.datasetEpoch, version: before.version };
}
test.beforeEach(async () => {
  await mkdir("artifacts/issue-67", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/issue-67/profile-"));
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((window) => window.setFocusable(false));
  await expect(
    page.getByRole("contentinfo", { name: "Workbench status" }),
  ).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
});

test("stale Find previews preserve errors, disk records and the rail badge while faults still log", async () => {
  const revision = await advance();
  const before = await records();
  expect(before).toEqual([]);
  await expect(badge()).toHaveCount(0);
  const creation = {
    kind: "Class",
    label: "Preview class",
    comment: "",
    parents: [THING],
    statements: [],
  };
  const message = "The ontology changed. Review the draft before adding it.";
  expect(await errorFrom("findCreatePreview", { ...revision, creation })).toBe(
    message,
  );
  expect(await records()).toEqual(before);
  await expect(badge()).toHaveCount(0);
  expect(await readdir(path.join(profile, "error-logs"))).toEqual([]);

  const current = await state();
  expect(
    await errorFrom("findCreatePreview", {
      datasetEpoch: current.datasetEpoch,
      version: current.version,
      creation,
    }),
  ).toBeNull();
  expect(await records()).toEqual(before);

  expect(await errorFrom("notAnAllowedOperation", {})).toBe(
    "Unknown operation.",
  );
  const ordinary = await records();
  expect(ordinary).toHaveLength(before.length + 1);
  expect(ordinary[0]).toMatchObject({
    operation: "Ontology: notAnAllowedOperation",
    message: "Unknown operation.",
  });
  await expect(badge()).toHaveText("1");
  const files = await readdir(path.join(profile, "error-logs"));
  expect(files).toEqual([ordinary[0].id + ".json"]);
  expect(await errorFrom("findCreatePreview", { ...revision, creation })).toBe(
    message,
  );
  // An epoch mismatch takes the same guard, even with the latest version.
  expect(
    await errorFrom("findCreatePreview", {
      datasetEpoch: current.datasetEpoch - 1,
      version: current.version,
      creation,
    }),
  ).toBe(message);
  expect(await records()).toEqual(ordinary);
  expect(await readdir(path.join(profile, "error-logs"))).toEqual(files);
  await expect(badge()).toHaveText("1");
});

test("all 16 specified guards preserve messages and mark stale worker replies", async () => {
  const cases: [DomainMethod, Record<string, unknown>, string][] = [
    ["updateEntity", {}, "Reload this editor before saving."],
    ["findCreatePreview", {}, "Review the draft before adding it."],
    ["findCreate", {}, "Review the draft before adding it."],
    ["textAnalysisDraft", {}, "Refresh the selected phrase before adding it."],
    [
      "textAnalysisCreatePreview",
      {},
      "Refresh the selected phrase before adding it.",
    ],
    ["textAnalysisCreate", {}, "Refresh the selected phrase before adding it."],
    ["validateSynonyms", {}, "Start a new synonym run."],
    [
      "validateTaxonomySuggestions",
      {},
      "Find suggestions again before adding them.",
    ],
    [
      "applyTaxonomySuggestions",
      {},
      "Find suggestions again before adding them.",
    ],
    [
      "applyTouchpoints",
      {},
      "since this search. Search again before applying touchpoints.",
    ],
    ["applySubclassSuggestions", {}, "Find suggestions again."],
    ["applyIntersection", {}, "Find suggestions again."],
    ["graphCreate", { find: {} }, "Wait for Find to refresh and try again."],
    [
      "graphCreate",
      { textAnalysis: {} },
      "Wait for Text Analysis to refresh and try again.",
    ],
    ["createEdge", {}, "Start the connection again."],
    ["editEdge", {}, "Reload the edge before saving."],
    ["select", {}, "Select the current match again."],
    ["individualGrid", {}, "Filter the current individuals again."],
    ["instances", {}, "Filter the current instances again."],
    ["moveClass", {}, "Drag the class again."],
  ];
  // applyTouchpoints is intentionally private to the main process. Exercise the
  // actual worker transport without widening the renderer's allowed methods.
  const result = await app.evaluate(async ({ app }, cases) => {
    const { Worker } = process.getBuiltinModule("node:worker_threads");
    const path = process.getBuiltinModule("node:path");
    const worker = new Worker(
      path.join(app.getAppPath(), "dist/main/domain-worker.cjs"),
    );
    type Reply = { id: number; value?: any; error?: string; stale?: boolean };
    let sequence = 0;
    const request = (method: string, args: Record<string, unknown> = {}) =>
      new Promise<Reply>((resolve, reject) => {
        const id = ++sequence;
        const cleanup = () => {
          clearTimeout(timer);
          worker.off("message", message);
          worker.off("error", fail);
        };
        const message = (reply: Reply) => {
          if (reply.id === id) {
            cleanup();
            resolve(reply);
          }
        };
        const fail = (error: Error) => {
          cleanup();
          reject(error);
        };
        const timer = setTimeout(
          () => fail(Error("Worker reply timed out: " + method)),
          10000,
        );
        worker.on("message", message);
        worker.once("error", fail);
        worker.postMessage({ id, method, args });
      });
    try {
      const before = (await request("state")).value as Snapshot;
      await request("createClass", {
        name: "Worker revision",
        parent: "http://www.w3.org/2002/07/owl#Thing",
      });
      const current = (await request("state")).value as Snapshot;
      const replies = [];
      for (const [method, args] of cases)
        replies.push(
          await request(method, {
            datasetEpoch: before.datasetEpoch,
            version: before.version,
            ...args,
          }),
        );
      return {
        replies,
        current,
        after: (await request("state")).value as Snapshot,
      };
    } finally {
      await worker.terminate();
    }
  }, cases);
  for (const [index, [method, args, instruction]] of cases.entries()) {
    const message =
      method === "applyTouchpoints"
        ? "The ontology changed " + instruction
        : "The ontology changed. " + instruction;
    expect(result.replies[index], method + JSON.stringify(args)).toMatchObject({
      error: message,
      stale: true,
    });
  }
  expect(await records()).toEqual([]);
  expect(await readdir(path.join(profile, "error-logs"))).toEqual([]);
  await expect(badge()).toHaveCount(0);
  expect(result.after.version).toBe(result.current.version);
  expect(result.after.entities).toEqual(result.current.entities);
});
