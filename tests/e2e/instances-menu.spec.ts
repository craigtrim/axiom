import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { NS, THING } from "../../src/domain/model";
import type { Snapshot, DomainMethod } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const request = (method: DomainMethod, args: Record<string, unknown> = {}) =>
  page.evaluate(({ method, args }) => window.axiom.request(method, args), {
    method,
    args,
  });
const report = () => page.getByRole("region", { name: "Instances report" });
const graphKeys = (s: Snapshot) => ({
  nodes: s.graph.nodes.map((n) => n.iri).sort(),
  edges: s.graph.edges
    .map((e) => [e.source, e.predicate, e.target].join(" "))
    .sort(),
  focus: s.graph.focus,
  budget: s.graph.budget,
});
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function row(iri = NS.pizza + "Giardiniera", target = page) {
  await target
    .getByRole("textbox", { name: "Filter hierarchy" })
    .fill(iri.slice(iri.lastIndexOf("#") + 1));
  return target
    .locator(".tree-row")
    .filter({ has: target.locator('[data-rename-iri="' + iri + '"]') });
}
async function hierarchyReport(iri = NS.pizza + "Giardiniera") {
  await menu("view.hierarchy");
  await (await row(iri)).click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: /^Show instances \(\d[\d,]*\)$/,
      exact: true,
    })
    .click();
  await expect(report()).toBeVisible();
  await expect(report().getByRole("status")).not.toContainText("Loading");
}
async function graphMenu(iri: string) {
  await request("seed", { iris: [iri], expand: false });
  await request("select", { iri });
  await menu("view.graph");
  await page.getByTestId("graph-canvas").focus();
  await page.keyboard.press("Shift+F10");
  return page.getByRole("menu", { name: "Graph node actions" });
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/instances-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed())
    await info.attach("desktop", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

test("hierarchy report matches 527 instances, pages, filters, and never expands the graph", async () => {
  const before = graphKeys(await state());
  await hierarchyReport();
  await expect(report().getByRole("heading")).toHaveText(
    "Instances of Giardiniera",
  );
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  await expect(report().locator("tbody tr")).toHaveCount(100);
  await report().getByRole("button", { name: "Next", exact: true }).click();
  await expect(report().locator(".instance-report-paging")).toContainText(
    "101 to 200 of 527",
  );
  for (let i = 0; i < 4; i++) {
    await report().getByRole("button", { name: "Next", exact: true }).click();
    await expect(report().getByRole("status")).not.toContainText("Loading");
  }
  await expect(report().locator("tbody tr")).toHaveCount(27);
  await expect(
    report().getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  const name = await report()
    .locator("tbody tr")
    .first()
    .getByRole("button")
    .innerText();
  await report().getByRole("textbox", { name: "Filter instances" }).fill(name);
  await expect(report().locator("tbody tr")).toHaveCount(1);
  await expect(report().getByRole("status")).toContainText("1 matching");
  await report().locator("tbody tr").first().getByRole("button").click();
  expect(graphKeys(await state())).toEqual(before);
});

test("hierarchy count, graph menu, graph action, and existing class filter open the same report", async () => {
  const iri = NS.pizza + "Giardiniera";
  const count = (await row()).getByRole("button", {
    name: "Show 527 direct instances of Giardiniera",
    exact: true,
  });
  await expect(count).toHaveAttribute("title", /527 direct instances/);
  const before = graphKeys(await state());
  await count.click();
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  expect(graphKeys(await state())).toEqual(before);
  await report().getByRole("button", { name: "All individuals" }).click();
  const filter = page.getByRole("combobox", { name: "Filter by pizza type" });
  if (!(await filter.isVisible()))
    await page
      .getByRole("button", { name: "More individual actions and filters" })
      .click();
  await filter.selectOption(iri);
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  const context = await graphMenu(iri);
  const graphBefore = graphKeys(await state());
  await context
    .getByRole("menuitem", {
      name: /^Show instances \(\d[\d,]*\)$/,
      exact: true,
    })
    .click();
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  expect(graphKeys(await state())).toEqual(graphBefore);
  await report().getByRole("button", { name: "All individuals" }).click();
  await page
    .locator(".graph-selection")
    .getByRole("button", { name: /^Show instances \(\d[\d,]*\)$/, exact: true })
    .click();
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  expect(graphKeys(await state())).toEqual(graphBefore);
  await report().screenshot({ path: "artifacts/testing/instances-report.png" });
});

test("Inspector usage opens the report and its class survives selection changes and pane reopening", async () => {
  const iri = NS.pizza + "Giardiniera";
  await hierarchyReport(iri);
  const before = graphKeys(await state());
  await request("select", { iri: NS.pizza + "American" });
  await expect(report().getByRole("heading")).toHaveText(
    "Instances of Giardiniera",
  );
  await report().getByRole("textbox", { name: "Filter instances" }).focus();
  await menu("pane.close");
  await expect(report()).toHaveCount(0);
  await menu("view.individuals");
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  await report().getByRole("button", { name: "All individuals" }).click();
  await request("select", { iri });
  await menu("view.inspector");
  const inspector = page.locator('[data-panel="inspector"]');
  const shortcut = inspector.getByRole("button", {
    name: "Show instances (527) of Giardiniera",
    exact: true,
  });
  if (!(await shortcut.isVisible()))
    await inspector.getByText("Usage", { exact: true }).click();
  await shortcut.click();
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  expect(graphKeys(await state())).toEqual(before);
});

test("named instances, empty classes and workspace changes use direct membership", async () => {
  await menu("file.new");
  await expect.poll(async () => (await state()).classCount).toBe(1);
  const parent = (await request("createClass", {
    name: "Vehicle",
    parent: THING,
  })) as string;
  const child = (await request("createClass", {
    name: "Car",
    parent,
  })) as string;
  await request("createIndividual", { name: "A vehicle", type: parent });
  await request("createIndividual", { name: "A car", type: child });
  await hierarchyReport(parent);
  await expect(report().getByRole("status")).toContainText("1 direct instance");
  await expect(report().locator("tbody")).toContainText("A vehicle");
  await expect(report().locator("tbody")).not.toContainText("A car");
  await report().getByRole("button", { name: "All individuals" }).click();
  const filter = page.getByRole("combobox", { name: "Filter by class" });
  if (!(await filter.isVisible()))
    await page.getByRole("button", { name: "More individual actions" }).click();
  await filter.selectOption(child);
  await expect(report().getByRole("heading")).toHaveText("Instances of Car");
  await expect(report().locator("tbody")).toContainText("A car");
  await menu("view.hierarchy");
  await (await row(THING)).click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Show instances (0)", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await menu("file.new");
  await expect(report()).toHaveCount(0);
});

test("menus expose groups, checked pin state, disabled items and meaningful keyboard navigation", async () => {
  const iri = NS.pizza + "Giardiniera";
  const context = await graphMenu(iri);
  await expect(context.getByRole("separator")).toHaveCount(3);
  const pin = context.getByRole("menuitemcheckbox", { name: "Pin in graph" });
  await expect(pin).not.toBeChecked();
  await pin.click();
  await page.getByTestId("graph-canvas").focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    context.getByRole("menuitemcheckbox", { name: "Pin in graph" }),
  ).toBeChecked();
  await page.keyboard.press("End");
  await expect(
    context.getByRole("menuitem", { name: "Copy IRI" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("Tab");
  await expect(context).toHaveCount(0);
  await expect(page.getByTestId("graph-canvas")).not.toBeFocused();
  await menu("view.hierarchy");
  const root = await row(THING);
  await root.focus();
  await page.keyboard.press("Shift+F10");
  const treeMenu = page.getByRole("menu", { name: "Entity actions" });
  await page.keyboard.press("End");
  const del = treeMenu.getByRole("menuitem", { name: "Delete class..." });
  await expect(del).toBeFocused();
  await expect(del).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(treeMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(root).toBeFocused();
});

test("property menus omit class operations and normalize separators; Move pane has four directions", async () => {
  await page.getByRole("button", { name: /^Properties/ }).click();
  const property = page.getByRole("treeitem").first();
  await property.click({ button: "right" });
  const m = page.getByRole("menu");
  for (const name of [
    "Show instances",
    "New subclass",
    "New instance",
    "Add children",
    "Find instances",
    "Delete class...",
  ])
    await expect(
      m.getByRole("menuitem", {
        name: name === "Show instances" ? /^Show instances/ : name,
        exact: true,
      }),
    ).toHaveCount(0);
  expect(
    await m.evaluate((el) => {
      const rows = [...el.children];
      return rows.every(
        (r, i) =>
          r.getAttribute("role") !== "separator" ||
          (i > 0 &&
            i < rows.length - 1 &&
            rows[i - 1].getAttribute("role") !== "separator"),
      );
    }),
  ).toBe(true);
  await page.keyboard.press("Escape");
  const structure = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!
      .getMenuItemById("menu.movePane")!
      .submenu!.items.map((i) => ({
        id: i.id,
        label: i.label.replaceAll("&", ""),
      })),
  );
  expect(structure.map((i) => i.id)).toEqual([
    "pane.move.left",
    "pane.move.right",
    "pane.move.top",
    "pane.move.bottom",
  ]);
  expect(structure.map((i) => i.label)).toEqual([
    "Left",
    "Right",
    "Top",
    "Bottom",
  ]);
});

test("report opens from a detached hierarchy and keeps its actions visible in a shallow detached pane", async () => {
  await menu("view.hierarchy");
  await (await row()).focus();
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await waiting;
  await expect(child.locator(".adaptive-pane")).toBeVisible();
  await (
    await app.browserWindow(child)
  ).evaluate((win) => {
    win.setContentSize(370, 500);
    if (process.env.AXIOM_TEST_BACKGROUND === "1") win.setFocusable(false);
  });
  await (await row(NS.pizza + "Giardiniera", child)).click({ button: "right" });
  await expect(child.getByRole("menu")).toBeVisible();
  await child
    .getByRole("menuitem", {
      name: /^Show instances \(\d[\d,]*\)$/,
      exact: true,
    })
    .click();
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  await report().getByRole("textbox", { name: "Filter instances" }).focus();
  const reportWaiting = app.waitForEvent("window");
  await menu("pane.detach");
  const reportChild = await reportWaiting;
  await (
    await app.browserWindow(reportChild)
  ).evaluate((win) => {
    win.setMinimumSize(160, 100);
    win.setContentSize(850, 320);
    if (process.env.AXIOM_TEST_BACKGROUND === "1") win.setFocusable(false);
  });
  const p = reportChild.getByRole("region", { name: "Instances report" });
  await expect(p.getByRole("status")).toContainText("527 direct instances");
  const next = p.getByRole("button", { name: "Next", exact: true });
  const bounds = (await p.boundingBox())!,
    b = (await next.boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  await next.click();
  await expect(p.locator(".instance-report-paging")).toContainText(
    "101 to 200 of 527",
  );
  await reportChild.screenshot({
    path: "artifacts/testing/instances-shallow.png",
  });
});

test("grouped menus and the report pass targeted accessibility checks in light, dark and forced colors", async () => {
  await hierarchyReport();
  await menu("pane.maximise");
  const a = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".instances-report")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(a.violations).toEqual([]);
  await menu("pane.maximise");
  for (const mode of ["light", "dark", "forced"]) {
    if (mode === "forced") await page.emulateMedia({ forcedColors: "active" });
    else await menu("theme." + mode);
    await menu("view.individuals");
    const reportScan = await new AxeBuilder({ page })
      .setLegacyMode()
      .include(".instances-report")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(reportScan.violations).toEqual([]);
    await menu("view.hierarchy");
    await (await row()).click({ button: "right" });
    const a = await new AxeBuilder({ page })
      .setLegacyMode()
      .include(".entity-context-menu")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(a.violations).toEqual([]);
    await page
      .getByRole("menu")
      .screenshot({ path: "artifacts/testing/menu-" + mode + ".png" });
    await page.keyboard.press("Escape");
  }
});

async function nativeInstances() {
  return app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()!.getMenuItemById(
      "entity.showInstances",
    )!;
    return { label: item.label.replaceAll("&", ""), enabled: item.enabled };
  });
}

test("empty instance actions stay visible and disabled in menus, graph, hierarchy, Inspector and palette", async () => {
  const iri = NS.pizza + "CheesyPizza";
  const context = await graphMenu(iri);
  const before = graphKeys(await state());
  const empty = context.getByRole("menuitem", {
    name: "Show instances (0)",
    exact: true,
  });
  await expect(empty).toBeDisabled();
  await expect(empty).toHaveAttribute(
    "title",
    "This class has no direct instances.",
  );
  await context.screenshot({
    path: "artifacts/testing/instance-counts-empty-menu.png",
  });
  await empty.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("o");
  await expect(context).toBeVisible();
  await expect(report()).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page
      .locator(".graph-selection")
      .getByRole("button", { name: "Show instances (0)", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(nativeInstances)
    .toEqual({ label: "Show instances (0)", enabled: false });
  // The renderer also guards stale or remapped invocations.
  await menu("entity.showInstances");
  await expect(report()).toHaveCount(0);
  await menu("view.hierarchy");
  const tree = await row(iri);
  await expect(
    tree.getByRole("button", {
      name: "Show 0 direct instances of Cheesy Pizza",
      exact: true,
    }),
  ).toBeDisabled();
  await tree.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Show instances (0)", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Expand branch (0)", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "New instance", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("menuitem", { name: "Find instances", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await menu("view.inspector");
  const inspector = page.locator('[data-panel="inspector"]');
  const usage = inspector.getByRole("button", {
    name: "Show instances (0) of Cheesy Pizza",
    exact: true,
  });
  if (!(await usage.isVisible()))
    await inspector.getByText("Usage", { exact: true }).click();
  await expect(usage).toBeDisabled();
  await menu("palette");
  await page
    .getByRole("textbox", { name: "Find a command" })
    .fill("Show instances");
  const option = page.getByRole("option", {
    name: "Edit: Show instances (0)",
    exact: true,
  });
  await expect(option).toBeDisabled();
  await page.keyboard.press("Enter");
  await option.dispatchEvent("click");
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toBeVisible();
  await expect(report()).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(graphKeys(await state())).toEqual(before);
});

test("counts update across creation and undo while report filters disable empty classes", async () => {
  const iri = NS.pizza + "CheesyPizza";
  await request("select", { iri });
  await expect
    .poll(nativeInstances)
    .toEqual({ label: "Show instances (0)", enabled: false });
  await request("createIndividual", { name: "A cheese pizza", type: iri });
  await request("select", { iri });
  await expect
    .poll(nativeInstances)
    .toEqual({ label: "Show instances (1)", enabled: true });
  await hierarchyReport(iri);
  await expect(report().getByRole("status")).toContainText("1 direct instance");
  await expect(report().locator("tbody")).toContainText("A cheese pizza");
  const classFilter = report().getByRole("combobox", {
    name: "Instances of class",
  });
  if (!(await classFilter.isVisible()))
    await report()
      .getByRole("button", { name: "More instance report filters" })
      .click();
  await expect(classFilter.locator('option[value="' + iri + '"]')).toHaveText(
    "Cheesy Pizza (1)",
  );
  await expect(
    classFilter.locator('option[value="' + THING + '"]'),
  ).toHaveJSProperty("disabled", true);
  await expect(
    classFilter.locator('option[value="' + NS.pizza + 'Giardiniera"]'),
  ).toHaveText("Giardiniera (527)");
  await request("undo");
  await expect
    .poll(nativeInstances)
    .toEqual({ label: "Show instances (0)", enabled: false });
  await expect(report()).toContainText("This class has no direct instances.");
  await expect(
    classFilter.locator('option[value="' + iri + '"]'),
  ).toHaveJSProperty("disabled", true);
  await expect(classFilter.locator('option[value="' + iri + '"]')).toHaveText(
    "Cheesy Pizza (0)",
  );
});

test("palette and class pickers show the same counts as the report", async () => {
  const iri = NS.pizza + "Giardiniera";
  await request("select", { iri });
  await expect
    .poll(nativeInstances)
    .toEqual({ label: "Show instances (527)", enabled: true });
  await menu("palette");
  await page
    .getByRole("textbox", { name: "Find a command" })
    .fill("Show instances");
  await expect(
    page.getByRole("option", {
      name: "Edit: Show instances (527)",
      exact: true,
    }),
  ).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(report().getByRole("status")).toContainText(
    "527 direct instances",
  );
  await report()
    .getByRole("button", { name: "All individuals", exact: true })
    .click();
  const pizza = page.getByRole("combobox", { name: "Filter by pizza type" });
  if (!(await pizza.isVisible()))
    await page
      .getByRole("button", { name: "More individual actions and filters" })
      .click();
  await expect(pizza.locator('option[value="' + iri + '"]')).toHaveText(
    "Giardiniera (527)",
  );
  await page
    .getByRole("combobox", { name: "Individual records" })
    .selectOption("named");
  const named = page.getByRole("combobox", { name: "Filter by class" });
  if (!(await named.isVisible()))
    await page.getByRole("button", { name: "More individual actions" }).click();
  await expect(named.locator('option[value="' + iri + '"]')).toHaveText(
    "Giardiniera (527)",
  );
  await expect(
    named.locator('option[value="' + NS.pizza + 'CheesyPizza"]'),
  ).toHaveText("Cheesy Pizza (0)");
  await expect(
    named.locator('option[value="' + NS.pizza + 'CheesyPizza"]'),
  ).toBeDisabled();
});

test("known-empty graph operations are disabled consistently with the native menu", async () => {
  await menu("file.new");
  const context = await graphMenu(THING);
  for (const name of ["Expand", "Collapse"])
    await expect(
      context.getByRole("menuitem", { name, exact: true }),
    ).toBeDisabled();
  await page.keyboard.press("Escape");
  for (const name of ["Expand", "Collapse"])
    await expect(
      page
        .locator(".graph-selection")
        .getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  const enabled = await app.evaluate(({ Menu }) =>
    ["graph.expand", "graph.collapse"].map(
      (id) => Menu.getApplicationMenu()!.getMenuItemById(id)!.enabled,
    ),
  );
  expect(enabled).toEqual([false, false]);
  await menu("palette");
  await page
    .getByRole("textbox", { name: "Find a command" })
    .fill("Collapse selected node");
  await expect(
    page.getByRole("option", {
      name: /^Graph: Collapse selected node/,
    }),
  ).toBeDisabled();
});
