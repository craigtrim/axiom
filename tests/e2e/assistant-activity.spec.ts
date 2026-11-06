// craigtrim/axiom#88: Query keeps generation in Describe and activity on its tab.
import { launchExample } from "./example-fixture";
import { observeDomainService } from "./domain-service-observer";
import {
  test,
  expect,
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
const activity = (id: string) => pane(id).locator(".assistant-activity");
async function count() {
  try {
    return (await readFile(launches, "utf8")).trim().split("\n").filter(Boolean)
      .length;
  } catch {
    return 0;
  }
}
// craigtrim/axiom#207: hold real context RPCs before any persisted run can exist.
async function deferTaxonomyContext() {
  await observeDomainService(app, page);
  await app.evaluate(() => {
    const utility = (globalThis as any).__domainServiceObserver.utility;
    const postMessage = utility.postMessage;
    const queued: { message: any; rest: any[] }[] = [];
    let holding = true;
    utility.postMessage = function (message: any, ...rest: any[]) {
      if (
        holding &&
        message?.channel === "axiom-domain-v1" &&
        message.type === "request" &&
        message.packet?.method === "taxonomyContext"
      ) {
        queued.push({ message, rest });
        return;
      }
      return Reflect.apply(postMessage, this, [message, ...rest]);
    };
    (globalThis as any).__taxonomyPreparation = {
      queued,
      release() {
        if (!holding) return;
        holding = false;
        utility.postMessage = postMessage;
        for (const { message, rest } of queued.splice(0))
          Reflect.apply(postMessage, utility, [message, ...rest]);
      },
    };
  });
  return () =>
    app.evaluate(() => (globalThis as any).__taxonomyPreparation.release());
}
async function click100(button: Locator) {
  await expect(button).toBeEnabled();
  await button.evaluate((el) => {
    for (let i = 0; i < 100; i++) (el as HTMLButtonElement).click();
  });
}
async function launch() {
  app = await launchExample({
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
  // Always select the fixture provider; application profiles default to Claude.
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({
      version: 1,
      panelState: { "assistant.provider": "codex" },
    }),
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
    'import fs from "node:fs";if(process.argv.includes("--version")){console.log("fixture 1.0");process.exit(0);}let prompt="";if(process.argv.includes("--version")){console.log("fixture-cli 1.0");process.exit(0);}process.stdin.on("data",d=>prompt+=d);process.stdin.on("end",()=>{' +
      "fs.appendFileSync(" +
      JSON.stringify(launches) +
      ',process.pid+"\\n");' +
      "const timer=setInterval(()=>{const b=JSON.parse(fs.readFileSync(" +
      JSON.stringify(behavior) +
      ',"utf8"));if(!b.release)return;clearInterval(timer);' +
      'const result=prompt.includes("BACKGROUND")?"Summary: No new additions.\\nSuggestions: None.":prompt.includes("Draft one SPARQL")?{status:"query",sparql:"SELECT ?s WHERE { ?s ?p ?o } LIMIT 7",explanation:"Seven subjects.",assumptions:[]}:{suggestions:[]};' +
      'fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],b.invalid?"invalid":typeof result==="string"?result:JSON.stringify(result));},50);});',
  );
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
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
test("Query keeps progress and cancellation in Describe after the pane closes", async () => {
  await menu("view.query");
  await pane("query")
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Describe the query" })
    .fill("List seven subjects");
  const generate = page.getByRole("button", {
    name: "Generate",
    exact: true,
  });
  await click100(generate);
  const composer = pane("query").getByRole("region", {
    name: "Compose a SPARQL query",
  });
  await expect(
    composer.getByRole("button", { name: "Cancel generation" }),
  ).toBeVisible();
  await expect(activity("query")).toHaveCount(0);
  await expect(
    page
      .locator(".flexlayout__tab_button")
      .filter({ hasText: "Query" })
      .locator(".assistant-tab-activity"),
  ).toBeVisible();
  await expect(generate).toHaveCount(0);
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
  await composer.getByRole("button", { name: "Fields", exact: true }).click();
  expect(await count()).toBe(1);
  await focusPane(pane("query"));
  await menu("pane.close");
  await menu("view.query");
  await expect(activity("query")).toHaveCount(0);
  await pane("query")
    .getByRole("button", { name: "Compose query", exact: true })
    .click();
  await expect(generate).toHaveCount(0);
  await composer.getByRole("button", { name: "Cancel generation" }).click();
  await expect(activity("query")).toHaveCount(0);
  await expect(generate).toBeEnabled();
  await writeFile(behavior, '{"release":true}');
  await generate.click();
  await expect(composer.locator(".prop")).toContainText(
    "Validated against the query engine.",
  );
  expect(
    (await page.evaluate(() => window.axiom.queryHistory.load())).current
      .generation,
  ).toBeUndefined();
  await expect(activity("query")).toHaveCount(0);
});
for (const mode of ["children", "instances"])
  test(
    "Taxonomy " +
      mode +
      " shares pane activity, blocks repeated retry and continues after closing its view",
    async () => {
      const releaseContext = await deferTaxonomyContext();
      const dialog = pane("taxonomy");
      const label =
        mode === "children" ? "Finding child classes" : "Finding instances";
      try {
        await menu("view.hierarchy");
        await page
          .locator(".tree-row")
          .filter({ has: page.locator(".tree-name", { hasText: /^Thing$/ }) })
          .click({ button: "right" });
        await page
          .getByRole("menuitem", {
            name: mode === "children" ? "Suggest" : "Find",
            exact: true,
          })
          .click();
        await page
          .getByRole("menuitem", {
            name: mode === "children" ? "Add children" : "Instances",
            exact: true,
          })
          .click();
        await expect(activity("taxonomy")).toContainText(label);
        await expect
          .poll(() =>
            app.evaluate(
              () => (globalThis as any).__taxonomyPreparation.queued.length,
            ),
          )
          .toBeGreaterThan(0);
        expect(
          await page.evaluate(() => window.axiom.taxonomyAssistant.history()),
        ).toEqual([]);
        expect(await count()).toBe(0);
        // Preparation survives remounting before the history service has a run.
        await menu("pane.close");
        await expect(dialog).toHaveCount(0);
        await menu("view.taxonomy");
        await expect(activity("taxonomy")).toContainText(label);
        expect(
          await page.evaluate(() => window.axiom.taxonomyAssistant.history()),
        ).toEqual([]);
        expect(await count()).toBe(0);
      } finally {
        await releaseContext();
      }
      await expect
        .poll(
          async () =>
            (
              await page.evaluate(() =>
                window.axiom.taxonomyAssistant.history(),
              )
            ).filter((run) => run.mode === mode && run.state === "running")
              .length,
        )
        .toBe(1);
      await expect(activity("taxonomy")).toHaveCount(1);
      await expect(activity("taxonomy")).toContainText(label);
      await expect(activity("hierarchy")).toHaveCount(0);
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
      await activity("taxonomy")
        .getByRole("button", { name: "Cancel suggestions", exact: true })
        .click();
      await expect(activity("hierarchy")).toHaveCount(0);
      await click100(dialog.getByRole("button", { name: "New run" }));
      await expect.poll(count).toBe(2);
      await menu("pane.close");
      await expect(dialog).toHaveCount(0);
      await expect(activity("hierarchy")).toHaveCount(0);
      await menu("view.taxonomy");
      await expect(activity("taxonomy")).toBeVisible();
      await activity("taxonomy")
        .getByRole("button", { name: "Cancel suggestions", exact: true })
        .click();
      await expect(activity("hierarchy")).toHaveCount(0);
      expect(
        await page.evaluate(
          async () =>
            (await window.axiom.request<Snapshot>("state")).classCount,
        ),
      ).toBe(1);
    },
  );
