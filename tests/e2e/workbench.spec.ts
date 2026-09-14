import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
let application: ElectronApplication, page: Page;
let errors: string[] = [];
async function menu(label: string) {
  await application.evaluate(({ Menu }, label) => {
    const visit = (
      items: Electron.MenuItem[],
    ): Electron.MenuItem | undefined => {
      for (const item of items) {
        if (item.label.replaceAll("&", "") === label && !item.submenu)
          return item;
        const child = item.submenu && visit(item.submenu.items);
        if (child) return child;
      }
    };
    const item = visit(Menu.getApplicationMenu()!.items);
    if (!item) throw Error("Menu not found: " + label);
    item.click(undefined as never, undefined as never, undefined as never);
  }, label);
}
test.beforeEach(async () => {
  await mkdir("artifacts/testing", { recursive: true });
  const userData = await mkdtemp(path.resolve("artifacts/testing/profile-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AXIOM_USER_DATA: userData,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env: env as Record<string, string>,
    timeout: 20000,
  });
  page = await application.firstWindow();
  errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") console.log("RENDERER", m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator('[data-panel="graph"]')).toBeVisible({
    timeout: 20000,
  });
});
test.afterEach(async () => {
  if (application) {
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await application.close();
  }
  expect(errors).toEqual([]);
});
test("native menus, fixture, table and query", async () => {
  expect(
    await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.items.map((i) => i.label.replaceAll("&", "")),
    ),
  ).toEqual([
    "File",
    "Edit",
    "View",
    "Graph",
    "Query",
    "Research",
    "Window",
    "Help",
  ]);
  await expect(page.locator(".status-counts")).toContainText("87,379 triples");
  await expect(page.locator(".individual-cell").first()).toContainText(
    "Pizza_000001",
  );
  await menu("Query");
  await expect(page.locator('[data-panel="query"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Run Ctrl+Enter", exact: true })
    .click();
  await expect(page.locator(".query-summary")).toContainText(
    "103 displayed / 103 matches",
  );
  await expect(page.locator(".query-results .ag-row").first()).toBeVisible();
  await expect(page.locator(".query-results .ag-row").first()).toBeInViewport();
  await page.screenshot({ path: "artifacts/testing/workbench-query.png" });
  await menu("Individuals");
  await expect(page.locator('[data-panel="individuals"]')).toBeVisible();
  await page
    .getByRole("combobox", { name: "Filter by branch" })
    .selectOption("Shoreditch");
  await expect(page.locator(".table-summary")).not.toContainText("12,000 rows");
  await page.screenshot({ path: "artifacts/testing/workbench.png" });
});
test("drag a divider and move, close and reopen panes", async () => {
  const graph = page.locator('[data-panel="graph"]');
  const before = await graph.boundingBox();
  const boxes = await page.locator(".flexlayout__splitter").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  const split = boxes.find(
    (b) => b.height > 200 && Math.abs(b.x - before!.x - before!.width) < 15,
  )!;
  expect(split).toBeTruthy();
  await page.mouse.move(split.x + split.width / 2, split.y + split.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    split.x + split.width / 2 - 75,
    split.y + split.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await graph.boundingBox())!.width))
    .toBeLessThan(Math.round(before!.width) - 20);
  await graph
    .locator("canvas")
    .first()
    .click({ position: { x: 30, y: 30 } });
  await menu("Move pane left");
  await expect(graph).toBeVisible();
  await menu("Close pane");
  await expect(graph).toHaveCount(0);
  await menu("Graph");
  await expect(graph).toBeVisible();
});

test("edit, undo, redo and save/reopen a workspace", async () => {
  await menu("New class");
  const dialog = page.getByRole("form", { name: "Create entity" });
  await dialog
    .getByRole("textbox", { name: "New entity label", exact: true })
    .fill("ElectronTestPizza");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".status-counts")).toContainText("96 classes");
  await menu("Undo");
  await expect(page.locator(".status-counts")).toContainText("95 classes");
  await menu("Redo");
  await expect(page.locator(".status-counts")).toContainText("96 classes");
  const price = page.locator(
    '[data-panel="individuals"] .ag-row[row-index="0"] [col-id="price"]',
  );
  await price.click();
  const editor = price.locator("input");
  await editor.fill("42.50");
  await editor.press("Enter");
  await expect(price).toContainText("£42.50");
  await expect(page.locator(".inspector-content")).toContainText("£42.50");
  const file = path.resolve(
    "artifacts/testing/roundtrip-" + Date.now() + ".axiom",
  );
  await application.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file,
    });
  }, file);
  await menu("Save workspace");
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(file, "utf8").catch(() => "null"))
          ?.individuals[0].price,
    )
    .toBe(42.5);
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await menu("New workspace");
  await expect(page.locator(".status-counts")).toContainText("1 classes");
  await application.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("Open workspace or ontology...");
  await expect(page.locator(".status-counts")).toContainText("96 classes");
  await expect(
    page.locator(
      '[data-panel="individuals"] .ag-row[row-index="0"] [col-id="price"]',
    ),
  ).toContainText("£42.50");
});
test("drag a tab into another group, detach and reattach a pane", async () => {
  const source = page
    .locator(".flexlayout__tab_button")
    .filter({ hasText: "Inspector" });
  const target = page.locator(".flexlayout__tabset_tabbar_outer").filter({
    has: page.locator(".flexlayout__tab_button").filter({ hasText: "Graph" }),
  });
  const a = await source.boundingBox(),
    b = await target.boundingBox();
  expect(a && b).toBeTruthy();
  await page.mouse.move(a!.x + 25, a!.y + 15);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + 15, { steps: 30 });
  await page.mouse.up();
  await expect(
    page
      .locator(".flexlayout__tabset_tabbar_outer")
      .filter({ hasText: "Inspector" }),
  ).toContainText("Graph");
  await expect(page.locator('[data-panel="inspector"]')).toBeVisible();
  await page
    .locator('[data-panel="inspector"]')
    .getByRole("button", { name: "Rename", exact: true })
    .focus();
  await menu("Detach pane to window");
  await expect.poll(() => application.windows().length).toBe(2);
  const detached = application.windows().find((w) => w !== page)!;
  await expect(detached.locator('[data-panel="inspector"]')).toBeVisible();
  await menu("Return all panes to main window");
  await expect.poll(() => application.windows().length).toBe(1);
  await expect(page.locator('[data-panel="inspector"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/testing/docking.png" });
});
test("export SVG, PNG and clipboard and use global search", async () => {
  await menu("Find entities");
  await page
    .getByRole("textbox", { name: "Search entities" })
    .fill("Pizza_000001");
  await page.getByRole("option").filter({ hasText: "AX-100000" }).click();
  await expect(page.locator(".inspector-content")).toContainText(
    "Pizza 000001",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".graph-selection")).toContainText("AX-100000");
  const svg = path.resolve("artifacts/testing/graph-" + Date.now() + ".svg");
  await application.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file,
    });
  }, svg);
  await menu("Export graph as SVG...");
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Export", exact: true })
    .click();
  await expect
    .poll(() => readFile(svg, "utf8").catch(() => ""))
    .toContain("<svg");
  const content = await readFile(svg, "utf8");
  expect(content).toContain("neighbours held back");
  expect(content).toContain("AX-100000");
  const png = path.resolve("artifacts/testing/graph-" + Date.now() + ".png");
  await application.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file,
    });
  }, png);
  await menu("Export graph as PNG...");
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Export", exact: true })
    .click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(png)).subarray(1, 4).toString();
      } catch {
        return "";
      }
    })
    .toBe("PNG");
  await page
    .locator('[data-panel="graph"]')
    .getByRole("button", { name: "Export", exact: true })
    .click();
  const exporting = page.getByRole("dialog", { name: "Export", exact: true });
  await exporting
    .getByRole("combobox", { name: "Export format" })
    .selectOption("clipboard");
  await exporting.getByRole("button", { name: "Copy", exact: true }).click();
  await expect
    .poll(() =>
      application.evaluate(({ clipboard }) => clipboard.has("image/png")),
    )
    .toBe(true);
});

test("keyboard commands, themes and accessible controls", async () => {
  await page.keyboard.press("Control+Shift+P");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Find a command" })
    .fill("dark theme");
  await page.getByRole("textbox", { name: "Find a command" }).press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".query-summary")).toContainText("103 displayed");
  await menu("Individuals");
  const results = await new AxeBuilder({ page }).setLegacyMode().analyze();
  await test.info().attach("accessibility", {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });
  expect(
    results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/testing/dark.png" });
});
test("pane layout and filters survive a restart", async () => {
  await page
    .getByRole("spinbutton", { name: "Visible node limit", exact: true })
    .fill("357");
  await page
    .getByRole("spinbutton", { name: "Visible node limit", exact: true })
    .press("Enter");
  await page
    .getByRole("combobox", { name: "Filter by branch" })
    .selectOption("Camden");
  await page.locator('[data-panel="graph"] canvas').first().focus();
  await menu("Move pane left");
  await expect
    .poll(async () => {
      const p = await page.evaluate(() => window.axiom.preferences.load());
      return !!p.layout;
    })
    .toBe(true);
  await page.evaluate(() =>
    window.axiom.request("stylesheet", { text: "node.Class {fill:#aa7733}" }),
  );
  const before = await page.evaluate(() => window.axiom.preferences.load());
  const profile = await application.evaluate(({ app }) =>
    app.getPath("userData"),
  );
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await application.close();
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await application.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator('[data-panel="graph"]')).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Filter by branch" }),
  ).toHaveValue("Camden");
  const after = await page.evaluate(() => window.axiom.preferences.load());
  expect(after.layout).toEqual(before.layout);
  expect(
    (
      await page.evaluate(() =>
        window.axiom.request<import("../../src/shared/protocol").Snapshot>(
          "state",
        ),
      )
    ).graph.stylesheet,
  ).toBe("node.Class {fill:#aa7733}");
  await expect(
    page.getByRole("spinbutton", { name: "Visible node limit", exact: true }),
  ).toHaveValue("357");
});

test("exact visible-node limit caps admissions and survives pane recreation", async () => {
  const limit = page.getByRole("spinbutton", {
    name: "Visible node limit",
    exact: true,
  });
  await limit.fill("357");
  await limit.press("Enter");
  await expect(
    page.getByRole("slider", { name: "Visible node limit slider" }),
  ).toHaveValue("357");
  await page.evaluate(() =>
    window.axiom.request("seed", {
      iris: ["http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita"],
    }),
  );
  await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
    "aria-label",
    /357 nodes/,
  );
  await limit.fill("123");
  await limit.press("Enter");
  await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
    "aria-label",
    /123 nodes/,
  );
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.axiom.preferences.load()).panelState?.["graph.limit"],
      ),
    )
    .toBe(123);
  await page.getByTestId("graph-canvas").focus();
  await menu("Close pane");
  await menu("Graph");
  await expect(
    page.getByRole("spinbutton", { name: "Visible node limit", exact: true }),
  ).toHaveValue("123");
});

test("create an individual with validation and undo, and delete a class with undo", async () => {
  await menu("New individual");
  const dialog = page.getByRole("form", { name: "Create entity" }),
    label = dialog.getByRole("textbox", { name: "New entity label" });
  await label.fill("");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await label.fill("A new named individual");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".status-counts")).toContainText(
    "13,506 individuals",
  );
  await menu("Undo");
  await expect(page.locator(".status-counts")).toContainText(
    "13,505 individuals",
  );
  await menu("New class");
  const create = page.getByRole("form", { name: "Create entity" });
  await create
    .getByRole("textbox", { name: "New entity label", exact: true })
    .fill("DeleteMe");
  await create
    .getByRole("textbox", { name: "New entity label", exact: true })
    .press("Enter");
  await expect(create).toHaveCount(0);
  await expect(page.locator(".status-counts")).toContainText("96 classes");
  await menu("Delete class...");
  const deletion = page.getByRole("dialog", { name: "Delete class" });
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".status-counts")).toContainText("95 classes");
  await menu("Undo");
  await expect(page.locator(".status-counts")).toContainText("96 classes");
});

test("a detached inspector renames in place and restores GPU context", async () => {
  await page
    .locator('[data-panel="inspector"]')
    .getByRole("button", { name: "Rename", exact: true })
    .focus();
  await menu("Detach pane to window");
  await expect.poll(() => application.windows().length).toBe(2);
  const child = application.windows().find((w) => w !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  await child.bringToFront();
  await child
    .locator('[data-panel="inspector"]')
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  const rename = child.getByRole("textbox", {
    name: "Rename entity",
    exact: true,
  });
  await expect(rename).toBeVisible();
  await expect(child.getByRole("dialog")).toHaveCount(0);
  await rename.fill("Pizza Renamed");
  await rename.press("Enter");
  await expect(child.locator(".inspector-content")).toContainText(
    "Pizza Renamed",
  );
  await menu("Return all panes to main window");
  await expect.poll(() => application.windows().length).toBe(1);
  const canvas = page.getByTestId("graph-canvas");
  if ((await canvas.getAttribute("data-backend")) !== "webgl2") return;
  await canvas.evaluate((c) => {
    const gl = (c as HTMLCanvasElement).getContext("webgl2")!,
      ext = gl.getExtension("WEBGL_lose_context")!;
    c.addEventListener(
      "webglcontextlost",
      () => setTimeout(() => ext.restoreContext(), 50),
      { once: true },
    );
    ext.loseContext();
  });
  await expect(page.locator(".status-message")).toContainText("restored");
  await menu("Fit graph");
  await expect.poll(() => canvas.getAttribute("data-draws")).not.toBe("0");
});

test("Monaco remains editable in a detached query pane", async () => {
  await menu("Query");
  const input = page.locator(".monaco-editor textarea");
  await input.focus();
  await menu("Detach pane to window");
  await expect.poll(() => application.windows().length).toBe(2);
  const child = application.windows().find((w) => w !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  await child.bringToFront();
  await child.locator(".monaco-editor textarea").focus();
  await child.keyboard.press("Control+A");
  await child.keyboard.insertText(
    "SELECT ?s WHERE { ?s a <http://www.w3.org/2002/07/owl#Class> . } LIMIT 5",
  );
  await child
    .getByRole("button", { name: "Run Ctrl+Enter", exact: true })
    .click();
  await expect(child.locator(".query-summary")).toContainText(
    "5 displayed / 92 matches",
  );
  await menu("Return all panes to main window");
  await expect.poll(() => application.windows().length).toBe(1);
  await expect(page.locator(".query-summary")).toContainText("5 displayed");
});

test("a running query can be cancelled and followed by a fresh query", async () => {
  await page
    .getByRole("combobox", { name: "Dataset size" })
    .selectOption("100000");
  await page
    .getByRole("dialog", { name: "Regenerate dataset" })
    .getByRole("button", { name: "Regenerate", exact: true })
    .click();
  await expect(page.locator(".status-counts")).toContainText("725,379 triples");
  await menu("Query");
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(
    "SELECT ?s ?p ?o ?other WHERE { ?s ?p ?o . ?other ?p ?o . }",
  );
  await page
    .getByRole("button", { name: "Run Ctrl+Enter", exact: true })
    .click();
  await page
    .locator('[data-panel="query"]')
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".query-error")).toContainText("cancelled");
  await page.getByRole("combobox", { name: "Example query" }).selectOption("0");
  await page
    .getByRole("button", { name: "Run Ctrl+Enter", exact: true })
    .click();
  await expect(page.locator(".query-summary")).toContainText(
    "103 displayed / 103 matches",
  );
  await expect(page.locator(".query-error")).toHaveCount(0);
});

test("query menu can send retained results after its pane closes", async () => {
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".query-summary")).toContainText("103 displayed");
  await menu("Clear graph");
  await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
    "aria-label",
    /graph, 0 nodes/,
  );
  await page.locator(".monaco-editor textarea").focus();
  await menu("Close pane");
  await expect(page.locator('[data-panel="query"]')).toHaveCount(0);
  await menu("Send results to graph");
  await expect(page.getByTestId("graph-canvas")).not.toHaveAttribute(
    "aria-label",
    /graph, 0 nodes/,
  );
});
