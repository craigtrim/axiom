import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
const thing = "http://www.w3.org/2002/07/owl#Thing";
let app: ElectronApplication, page: Page, behavior: string, launches: string;
const errors: string[] = [];
let launchEnv: Record<string, string>;
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
async function focusPane(root: Locator) {
  await root.evaluate((el) => {
    el.setAttribute("tabindex", "-1");
    (el as HTMLElement).focus();
  });
}
const pane = (id: string) => page.locator('[data-pane-id="' + id + '"]');
const activity = (id: string) =>
  pane(id).locator(":scope > .assistant-activity");
async function count() {
  try {
    return (await readFile(launches, "utf8")).trim().split("\n").filter(Boolean)
      .length;
  } catch {
    return 0;
  }
}
async function click100(button: Locator) {
  await expect(button).toBeEnabled();
  await button.evaluate((el) => {
    for (let i = 0; i < 100; i++) (el as HTMLButtonElement).click();
  });
}
async function launch() {
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env: launchEnv,
  });
  page = await app.firstWindow();
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((win) => win.setFocusable(false));
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
}

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/testing/assistant-activity-"),
  );
  behavior = path.join(profile, "behavior.json");
  launches = path.join(profile, "launches.txt");
  await writeFile(behavior, "{}");
  const bin = path.join(profile, "bin"),
    folder = path.join(bin, "node_modules/@openai/codex/bin");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(folder, "codex.js"),
    'import fs from "node:fs";let prompt="";process.stdin.on("data",d=>prompt+=d);process.stdin.on("end",()=>{' +
      "fs.appendFileSync(" +
      JSON.stringify(launches) +
      ',process.pid+"\\n");' +
      "const timer=setInterval(()=>{const b=JSON.parse(fs.readFileSync(" +
      JSON.stringify(behavior) +
      ',"utf8"));if(!b.release)return;clearInterval(timer);' +
      'const result=prompt.includes("BACKGROUND")?"Summary: No new additions.\\nSuggestions: None.":prompt.includes("Draft one SPARQL")?{status:"query",sparql:"SELECT ?s WHERE { ?s ?p ?o } LIMIT 7",explanation:"Seven subjects.",assumptions:[]}:{summary:"Research finished.",sources:[],suggestions:[]};' +
      'fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],b.invalid?"invalid":typeof result==="string"?result:JSON.stringify(result));},50);});',
  );
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  const prior = env.PATH ?? env.Path ?? "";
  delete env.Path;
  env.PATH = bin + path.delimiter + prior;
  delete env.ELECTRON_RUN_AS_NODE;
  launchEnv = env;
  await launch();
  const epoch = await page.evaluate(
    async () => (await window.axiom.request<Snapshot>("state")).datasetEpoch,
  );
  await menu("file.new");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.axiom.request<Snapshot>("state")).datasetEpoch,
      ),
    )
    .toBeGreaterThan(epoch);
  await page.evaluate((iri) => window.axiom.request("select", { iri }), thing);
});
test.afterEach(async ({}, info) => {
  if (app) {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    await app.close();
  }
  expect(errors).toEqual([]);
});
test("Research locks 100 clicks and IPC retries, survives a closed pane, and unlocks after cancellation and failure", async () => {
  await menu("view.research");
  const run = pane("research").getByRole("button", {
    name: "Run research",
    exact: true,
  });
  await click100(run);
  await expect(activity("research")).toContainText("Codex · Researching Thing");
  await expect(run).toBeDisabled();
  await expect.poll(count).toBe(1);
  expect(
    await app.evaluate(
      ({ Menu }) =>
        Menu.getApplicationMenu()!.getMenuItemById("research.run")!.enabled,
    ),
  ).toBe(false);
  const rejected = await page.evaluate(async (iri) => {
    const c = await window.axiom.request<any>("researchContext", { iri });
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        window.axiom.research.run({
          provider: "codex",
          iri,
          datasetEpoch: c.datasetEpoch,
          version: c.version,
          instructions: "Test",
          web: false,
        }),
      ),
    );
    return results.filter((r) => r.status === "rejected").length;
  }, thing);
  expect(rejected).toBe(100);
  expect(await count()).toBe(1);
  await page.evaluate(async () => {
    const iri = await window.axiom.request<string>("createClass", {
      name: "Other",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    });
    await window.axiom.request("select", { iri });
  });
  await expect(activity("research")).toContainText("Researching Thing");
  await menu("view.inspector");
  await expect(
    page.getByRole("img", { name: "Assistant running", exact: true }),
  ).toBeVisible();
  await menu("view.research");
  await focusPane(pane("research"));
  await menu("pane.close");
  await expect(pane("research")).toHaveCount(0);
  await menu("view.research");
  await expect(activity("research")).toContainText("Researching Thing");
  await expect(run).toBeDisabled();
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()!.getMenuItemById("research.cancel")!
            .enabled,
      ),
    )
    .toBe(true);
  await menu("research.cancel");
  await expect(activity("research")).toHaveCount(0);
  await expect(run).toBeEnabled();
  await writeFile(behavior, '{"release":true,"invalid":true}');
  await run.click();
  await expect(pane("research").getByRole("alert")).toBeVisible();
  await expect(run).toBeEnabled();
  await writeFile(behavior, '{"release":true}');
  await run.click();
  await expect(pane("research")).toContainText("Research finished.");
  await expect(activity("research")).toHaveCount(0);
});
test("Query keeps progress and cancellation on its pane after the composer closes", async () => {
  await menu("view.query");
  await pane("query")
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Describe your query" })
    .fill("List seven subjects");
  const generate = page.getByRole("button", {
    name: "Generate query",
    exact: true,
  });
  await click100(generate);
  await expect(activity("query")).toContainText("Codex · Generating query");
  await expect(generate).toBeDisabled();
  await expect.poll(count).toBe(1);
  expect(
    await page.evaluate(async () => {
      const c = await window.axiom.request<Snapshot>("state");
      const results = await Promise.allSettled(
        Array.from({ length: 100 }, () =>
          window.axiom.queryAssistant.run({
            provider: "codex",
            instructions: "Repeated",
            currentQuery: "",
            datasetEpoch: c.datasetEpoch,
            version: c.version,
          }),
        ),
      );
      return results.filter((r) => r.status === "rejected").length;
    }),
  ).toBe(100);
  expect(await count()).toBe(1);
  await page.getByRole("button", { name: "Close query composer" }).click();
  await expect(
    activity("query").getByRole("button", { name: "Cancel generation" }),
  ).toBeVisible();
  await focusPane(pane("query"));
  await menu("pane.close");
  await menu("view.query");
  await expect(activity("query")).toBeVisible();
  await pane("query")
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await expect(generate).toBeDisabled();
  await activity("query")
    .getByRole("button", { name: "Cancel generation" })
    .click();
  await expect(activity("query")).toHaveCount(0);
  await expect(generate).toBeEnabled();
  await writeFile(behavior, '{"release":true}');
  await generate.click();
  await expect(pane("query").locator(".query-run-status")).toContainText(
    "Generated query ready",
  );
  await expect(activity("query")).toHaveCount(0);
});
for (const mode of ["children", "instances"])
  test(
    "Taxonomy " +
      mode +
      " shares pane activity, blocks repeated retry and cancels on dialog close",
    async () => {
      await menu("view.hierarchy");
      await page
        .locator(".tree-row")
        .filter({ has: page.locator(".tree-name", { hasText: /^Thing$/ }) })
        .click({ button: "right" });
      await page
        .getByRole("menuitem", {
          name: mode === "children" ? "Add children" : "Find instances",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(".assistant-activity")).toContainText(
        mode === "children" ? "Finding child classes" : "Finding instances",
      );
      await expect(activity("hierarchy")).toContainText("Codex");
      await expect.poll(count).toBe(1);
      expect(
        await page.evaluate(
          async ({ iri, mode }) => {
            const c = await window.axiom.request<Snapshot>("state");
            const results = await Promise.allSettled(
              Array.from({ length: 100 }, () =>
                window.axiom.taxonomyAssistant.run({
                  id: "repeat",
                  iri,
                  mode: mode as "children" | "instances",
                  datasetEpoch: c.datasetEpoch,
                  version: c.version,
                }),
              ),
            );
            return results.filter((r) => r.status === "rejected").length;
          },
          { iri: thing, mode },
        ),
      ).toBe(100);
      expect(await count()).toBe(1);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(activity("hierarchy")).toHaveCount(0);
      await click100(
        dialog.getByRole("button", { name: "Find suggestions again" }),
      );
      await expect.poll(count).toBe(2);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(activity("hierarchy")).toHaveCount(0);
      expect(
        await page.evaluate(
          async () =>
            (await window.axiom.request<Snapshot>("state")).classCount,
        ),
      ).toBe(1);
    },
  );
test("Running Research stays actionable in a detached shallow pane and respects reduced motion", async () => {
  await menu("view.research");
  await focusPane(pane("research"));
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await waiting;
  await expect(child.locator(".adaptive-pane")).toBeVisible();
  await (
    await app.browserWindow(child)
  ).evaluate((win) => {
    win.setMinimumSize(160, 100);
    win.setContentSize(850, 280);
    if (process.env.AXIOM_TEST_BACKGROUND === "1") win.setFocusable(false);
  });
  const root = child.locator(".adaptive-pane");
  await root.getByRole("button", { name: "Run research", exact: true }).click();
  const strip = root.locator(":scope > .assistant-activity");
  await expect(strip).toContainText("Researching Thing");
  const cancel = strip.getByRole("button", { name: "Cancel research" });
  const outer = (await root.boundingBox())!,
    inner = (await cancel.boundingBox())!;
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
  await child.emulateMedia({ reducedMotion: "reduce" });
  await expect(strip.locator(".assistant-spinner")).toHaveCSS(
    "animation-name",
    "none",
  );
  const axe = await new AxeBuilder({ page: child })
    .setLegacyMode()
    .include(".assistant-activity")
    .analyze();
  expect(axe.violations).toEqual([]);
  await child.screenshot({
    path: "artifacts/testing/assistant-activity-shallow.png",
  });
  await (
    await app.browserWindow(child)
  ).evaluate((win) => win.setContentSize(360, 500));
  await expect(root).toHaveAttribute("data-pane-layout", "narrow");
  await expect(cancel).toBeVisible();
  await (
    await app.browserWindow(child)
  ).evaluate((win) => win.setContentSize(360, 180));
  await expect(root).toHaveAttribute("data-pane-recovery", "true");
  await expect(cancel).toBeVisible();
  const small = (await root.boundingBox())!,
    button = (await cancel.boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(small.y + small.height);
  await cancel.click();
  await expect(strip).toHaveCount(0);
});

test("Research caches exact prompts across workspace reopening and app restart without an available CLI", async () => {
  await writeFile(behavior, '{"release":true}');
  await menu("view.research");
  const run = () =>
    pane("research").getByRole("button", { name: "Run research", exact: true });
  await run().click();
  await expect(pane("research")).toContainText("Research finished.");
  const first = await page.evaluate(
    async () => (await window.axiom.research.status()).response!,
  );
  expect(first.cache?.hit).toBe(false);
  await click100(run());
  await expect(
    pane("research").locator(".research-cache-status"),
  ).toContainText("Using cached research · Codex");
  expect(await count()).toBe(1);
  const second = await page.evaluate(
    async () => (await window.axiom.research.status()).response!,
  );
  expect(second.cache).toEqual({ ...first.cache, hit: true });
  expect(second.completedAt).toBe(first.completedAt);
  const instructions = pane("research").getByRole("textbox", {
    name: "Research instructions",
  });
  const original = await instructions.inputValue();
  await instructions.fill(original + " ");
  await run().click();
  await expect.poll(count).toBe(2);
  await expect(run()).toBeEnabled();
  await expect(pane("research").locator(".research-cache-status")).toHaveCount(
    0,
  );
  await instructions.fill(original);
  await run().click();
  await expect(
    pane("research").locator(".research-cache-status"),
  ).toBeVisible();
  expect(await count()).toBe(2);
  const workspace = path.join(path.dirname(behavior), "cached-research.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, workspace);
  await menu("file.save");
  await expect
    .poll(async () => {
      try {
        return (await readFile(workspace, "utf8")).length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  await app.close();
  await launch();
  await app.evaluate(({ dialog, ipcMain }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    ipcMain.removeHandler("research:assistants");
    ipcMain.handle("research:assistants", () => [
      {
        id: "codex",
        name: "Codex",
        available: false,
        message: "Not installed",
      },
    ]);
  }, workspace);
  await menu("file.open");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.axiom.request<Snapshot>("state")).classCount,
      ),
    )
    .toBe(1);
  await page.evaluate((iri) => window.axiom.request("select", { iri }), thing);
  await menu("view.research");
  await menu("research.refresh");
  await expect(pane("research")).toContainText("Cached results can be reused.");
  await run().click();
  await expect(
    pane("research").locator(".research-cache-status"),
  ).toContainText("Using cached research · Codex");
  expect(await count()).toBe(2);
  const restored = await page.evaluate(
    async () => (await window.axiom.research.status()).response!,
  );
  expect(restored.completedAt).toBe(first.completedAt);
  expect(restored.cache).toEqual({ ...first.cache, hit: true });
  const current = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(restored.context.datasetEpoch).toBe(current.datasetEpoch);
  expect(restored.context.version).toBe(current.version);
  await page.screenshot({ path: "artifacts/testing/research-cache-hit.png" });
});
