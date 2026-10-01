import { launchExample } from "./example-fixture";
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
      " shares pane activity, blocks repeated retry and continues after closing its view",
    async () => {
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
          name: mode === "children" ? "Add Children" : "Instances",
          exact: true,
        })
        .click();
      const dialog = pane("taxonomy");
      await expect(dialog.locator(".assistant-activity")).toContainText(
        mode === "children" ? "Finding child classes" : "Finding instances",
      );
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
