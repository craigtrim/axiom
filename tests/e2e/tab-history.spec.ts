import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  Snapshot,
  DomainMethod,
  Preferences,
} from "../../src/shared/protocol";
import AxeBuilder from "@axe-core/playwright";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const req = <T = unknown>(
  method: DomainMethod,
  args: Record<string, unknown> = {},
) =>
  page.evaluate(({ method, args }) => window.axiom.request<T>(method, args), {
    method,
    args,
  });
const state = () => req<Snapshot>("state");
const prefs = () => page.evaluate(() => window.axiom.preferences.load());
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function launch() {
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    });
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  });
}
async function tabMenu(name: string, action: string) {
  await page.getByRole("tab", { name, exact: true }).click({ button: "right" });
  await page
    .getByRole("menu", { name: "Tab actions" })
    .getByRole("menuitem", { name: action, exact: true })
    .click();
}
async function rename(name: string, next: string) {
  await tabMenu(name, "Rename tab");
  const dialog = page.getByRole("dialog", { name: "Rename tab", exact: true });
  await dialog.getByRole("textbox", { name: "Tab name" }).fill(next);
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: next, exact: true }),
  ).toBeVisible();
}
async function closeTab(name: string) {
  await tabMenu(name, "Close tab");
  await expect(page.getByRole("tab", { name, exact: true })).toHaveCount(0);
}
async function save(file: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(file, "utf8").catch(() => "{}"))?.workbench
          ?.tabHistory?.entries?.length ?? 0,
    )
    .toBeGreaterThan(0);
}
const history = () =>
  page.getByRole("region", { name: "Tab History", exact: true });
async function showHistory() {
  await menu("view.tabhistory");
  await expect(history()).toBeVisible();
}
async function policy(all: boolean) {
  await menu("tabs.settings");
  const d = page.getByRole("dialog", { name: "Tab history settings" });
  await d
    .getByRole("radio", {
      name: all ? "All tabs" : "Named tabs only",
      exact: true,
    })
    .check();
  await d.getByRole("button", { name: "Close", exact: true }).click();
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/tabs-"));
  await launch();
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
  } finally {
    await app.close();
  }
  expect(errors).toEqual([]);
});

test("named graph tabs restore their name, geometry and camera from workspace history after closing and restarting", async () => {
  expect((await prefs()).tabSavePolicy).toBe("named");
  const iri = await req<string>("createClass", {
    name: "English",
    parent: "http://www.w3.org/2002/07/owl#Thing",
  });
  await req("seed", { iris: [iri], expand: false });
  await req("layout", { mode: "grid" });
  await req("drag", { iri, x: 421, y: 217 });
  await req("edgeVisibility", { visible: false });
  await req("countVisibility", { visible: false });
  await rename("Graph", "English overview");
  const before = (await state()).graph;
  await closeTab("English overview");
  await showHistory();
  await expect(
    history().getByRole("button", { name: /English overview.*Closed/ }),
  ).toBeVisible();
  const file = path.join(profile, "saved-tabs.axiom");
  await save(file);
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(
    saved.archivedGraphs.graph.positions.find((n: any) => n.iri === iri),
  ).toMatchObject({ x: 421, y: 217 });
  const camera = saved.workbench.tabHistory.entries.find(
    (t: any) => t.name === "English overview",
  ).panelState["graph.camera"];
  expect(camera).toBeDefined();
  await app.close();
  await launch();
  await showHistory();
  await history()
    .getByRole("button", { name: /English overview.*Closed/ })
    .click();
  await expect(
    page.getByRole("tab", { name: "English overview", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await state()).activeGraphId).toBe("graph");
  const after = (await state()).graph;
  expect(after.nodes.map((n) => [n.iri, n.x, n.y])).toEqual(
    before.nodes.map((n) => [n.iri, n.x, n.y]),
  );
  expect(after.edgesVisible).toBe(false);
  expect(after.countsVisible).toBe(false);
  expect((await prefs()).panelState?.["graph.camera"]).toEqual(camera);
  await req("graphCreate", {});
  await menu("view.graph");
  await showHistory();
  await history()
    .getByRole("button", { name: /English overview.*Open/ })
    .click();
  await expect.poll(async () => (await state()).activeGraphId).toBe("graph");
  await expect(
    page.getByRole("tab", { name: "English overview", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await showHistory();
  await page.screenshot({ path: "artifacts/testing/tab-history.png" });
  const axe = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="tabhistory"]')
    .analyze();
  expect(
    axe.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("all-tabs mode retains default numbered tabs and closing graphs frees open slots", async () => {
  await policy(true);
  for (let i = 2; i <= 19; i++) {
    const id = await req<string>("graphCreate", {});
    await menu("view.graph");
    await expect(
      page.getByRole("tab", { name: "Graph_" + i, exact: true }),
    ).toBeVisible();
    await closeTab("Graph_" + i);
    expect(Object.keys((await state()).graphs!)).not.toContain(id);
  }
  await showHistory();
  await expect(
    history().getByRole("button", { name: /Graph_19.*Closed/ }),
  ).toBeVisible();
  await history()
    .getByRole("button", { name: /Graph_2.*Closed/, exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("tab", { name: "Graph_2", exact: true }),
  ).toBeVisible();
  await policy(false);
  await showHistory();
  await expect(
    history().getByRole("button", { name: /Graph_19.*Closed/ }),
  ).toBeVisible();
});

test("unnamed tabs are omitted from history by default and inline renaming makes a tab persistent", async () => {
  await req("graphCreate", {});
  await menu("view.graph");
  await closeTab("Graph_2");
  await showHistory();
  await expect(history()).toContainText("Rename a tab to keep it here");
  await menu("view.graph");
  await page.getByRole("tab", { name: "Graph", exact: true }).dblclick();
  const input = page.locator("input.flexlayout__tab_button_textbox");
  await expect(input).toBeVisible();
  await input.fill("My map");
  await input.press("Enter");
  await expect(
    page.getByRole("tab", { name: "My map", exact: true }),
  ).toBeVisible();
  await closeTab("My map");
  await showHistory();
  await expect(
    history().getByRole("button", { name: /My map.*Closed/ }),
  ).toBeVisible();
});

test("saved Find tabs restore query and facets, and renames survive arrangement changes", async () => {
  await req("createClass", {
    name: "Basic English",
    parent: "http://www.w3.org/2002/07/owl#Thing",
  });
  await menu("view.find");
  const find = page.getByRole("region", { name: "Find entities results" });
  await find
    .getByRole("searchbox", { name: "Find text" })
    .fill("English Basic");
  await find
    .getByRole("combobox", { name: "Match mode" })
    .selectOption("cosine");
  await find.getByRole("button", { name: "Names only", exact: true }).click();
  await find.getByRole("slider", { name: "Minimum similarity" }).fill("0.75");
  await rename("Find", "English search");
  await menu("arrangement.wide");
  await expect(
    page.getByRole("tab", { name: "English search", exact: true }),
  ).toBeVisible();
  await closeTab("English search");
  await showHistory();
  await history()
    .getByRole("button", { name: /English search.*Closed/ })
    .click();
  await expect(find.getByRole("searchbox", { name: "Find text" })).toHaveValue(
    "English Basic",
  );
  await expect(
    find.getByRole("slider", { name: "Minimum similarity" }),
  ).toHaveValue("0.75");
  await expect(find.getByRole("combobox", { name: "Match mode" })).toHaveValue(
    "cosine",
  );
  await expect(
    find.getByRole("checkbox", { name: "IRI", exact: true }),
  ).not.toBeChecked();
});

test("history belongs to its workspace while the save policy stays in Axiom settings", async () => {
  await policy(true);
  await rename("Graph", "First workspace map");
  const first = path.join(profile, "first.axiom");
  await save(first);
  const epoch = (await state()).datasetEpoch;
  await menu("file.new");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
  await expect(
    page.getByRole("tab", { name: "Graph", exact: true }),
  ).toBeVisible();
  await showHistory();
  await expect(
    history().getByRole("button", { name: /First workspace map/ }),
  ).toHaveCount(0);
  expect((await prefs()).tabSavePolicy).toBe("all");
  await policy(false);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, first);
  await menu("file.open");
  await expect(
    page.getByRole("tab", { name: "First workspace map", exact: true }),
  ).toBeVisible();
  await showHistory();
  await expect(
    history().getByRole("button", { name: /First workspace map/ }),
  ).toBeVisible();
  expect((await prefs()).tabSavePolicy).toBe("named");
});
