import { launchExample } from "./example-fixture";
import { edgeKey } from "../../src/domain/viewport";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Camera } from "../../src/renderer/scene";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page, bridge: Page;
let profile: string;
const errors: string[] = [];
const state = () =>
  bridge.evaluate(() => window.axiom.request<Snapshot>("state"));
const request = (method: DomainMethod, args: Record<string, unknown> = {}) =>
  bridge.evaluate(({ method, args }) => window.axiom.request(method, args), {
    method,
    args,
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
const camera = () =>
  bridge.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState![
        "graph.camera"
      ] as Camera,
  );
async function fitGraph() {
  await menu("graph.fit");
  // Camera preferences are persisted with a 250 ms debounce.
  await page.waitForTimeout(350);
  await expect.poll(camera).toBeTruthy();
}
async function at(iri: string) {
  const n = (await state()).graph.nodes.find((n) => n.iri === iri)!,
    c = await camera(),
    b = (await page.getByTestId("graph-canvas").boundingBox())!;
  return {
    x: b.x + n.x * c.zoom + c.x,
    y: b.y + n.y * c.zoom + c.y,
    radius: n.radius * c.zoom,
  };
}
async function clickNode(iri: string) {
  const p = await at(iri);
  await page.mouse.click(p.x, p.y);
}
async function prepare() {
  await menu("file.new");
  const ids = await page.evaluate(async () => {
    const root = "http://www.w3.org/2002/07/owl#Thing";
    await window.axiom.request("freeze");
    const a = await window.axiom.request<string>("createClass", {
      name: "Alpha",
      parent: root,
    });
    const b = await window.axiom.request<string>("createClass", {
      name: "Beta",
      parent: root,
    });
    const c = await window.axiom.request<string>("createClass", {
      name: "Gamma",
      parent: root,
    });
    await window.axiom.request("seed", { iris: [a, b, c], expand: false });
    const s = await window.axiom.request<Snapshot>("state");
    for (const [iri, x, y] of [
      [a, -180, 0],
      [b, 180, 0],
      [c, 0, 160],
    ])
      await window.axiom.request("drag", {
        iri,
        x,
        y,
        dragging: false,
        datasetEpoch: s.datasetEpoch,
      });
    for (const iri of [a, b, c]) {
      const current = await window.axiom.request<any>("entityDocument", {
        iri,
      });
      await window.axiom.request("updateEntity", {
        iri,
        nextIri: iri,
        version: current.version,
        datasetEpoch: current.datasetEpoch,
        statements: [
          ...current.statements,
          {
            subject: iri,
            predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
            object: { literal: true, value: "" },
          },
        ],
      });
    }
    await window.axiom.request("select", { iri: null });
    return { a, b, c };
  });
  await fitGraph();
  return ids;
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/details-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  bridge = page;
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((win) => win.setFocusable(false));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus)
    await info.attach("details-failure", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app.close();
  expect(errors).toEqual([]);
});

const details = (p = page) =>
  p.getByRole("region", { name: "Details", exact: true });
const identifier = (p = page) => details(p);
const detailsTab = () =>
  page.getByRole("tab", { name: "Details", exact: true });

test("Details opens explicitly from View, follows graph clicks and retains each entity draft", async () => {
  const ids = await prepare();
  await expect(detailsTab()).toHaveCount(0);
  await clickNode(ids.a);
  await expect.poll(async () => (await state()).selected).toBe(ids.a);
  await expect(detailsTab()).toHaveCount(0);
  const entry = await app.evaluate(({ Menu }) => {
    const view = Menu.getApplicationMenu()!.getMenuItemById("menu.view")!;
    const item = view.submenu!.items.find((i) => i.id === "view.details");
    return { label: item?.label.replaceAll("&", ""), enabled: item?.enabled };
  });
  expect(entry).toEqual({ label: "Details", enabled: true });
  await menu("view.details");
  await expect(detailsTab()).toHaveCount(1);
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
  await menu("pane.move.right");
  await fitGraph();
  await details()
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .fill("Alpha draft retained");
  await clickNode(ids.b);
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await expect(
    details().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("");
  await clickNode(ids.a);
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
  await expect(
    details().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("Alpha draft retained");
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
  await page.screenshot({
    path: "artifacts/testing/details-follows-selection.png",
  });
  await menu("view.details");
  await menu("pane.close");
  await clickNode(ids.b);
  await expect.poll(async () => (await state()).selected).toBe(ids.b);
  await expect(detailsTab()).toHaveCount(0);
  await menu("view.details");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await request("select", { iri: ids.a });
  await expect(
    details().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("Alpha draft retained");
  await request("select", { iri: null });
  await expect(details()).toContainText(
    "Select a node or edge to see its details.",
  );
  await expect(details().getByRole("textbox")).toHaveCount(0);
});

test("Details follows selection behind another tab and in a detached pane without opening or focusing it", async () => {
  const ids = await prepare();
  await menu("view.details");
  await expect(details()).toContainText(
    "Select a node or edge to see its details.",
  );
  await menu("view.graph");
  await fitGraph();
  await clickNode(ids.b);
  await expect.poll(async () => (await state()).selected).toBe(ids.b);
  await expect(detailsTab()).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await menu("view.details");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((p) => p !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(child)
    ).evaluate((w) => w.setFocusable(false));
  await expect(identifier(child)).toHaveAttribute("data-entity-iri", ids.b);
  await fitGraph();
  await clickNode(ids.a);
  await expect(identifier(child)).toHaveAttribute("data-entity-iri", ids.a);
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
  await child
    .getByRole("button", { name: "Add statement", exact: true })
    .focus();
  await menu("view.details");
  await expect.poll(() => app.windows().length).toBe(2);
  await expect(page.locator('[data-panel="details"]')).toHaveCount(0);
  await menu("pane.close");
  await expect.poll(() => app.windows().length).toBe(1);
  await clickNode(ids.b);
  await expect.poll(async () => (await state()).selected).toBe(ids.b);
  await expect(detailsTab()).toHaveCount(0);
  await expect.poll(() => app.windows().length).toBe(1);
});

test("saved entity tabs restore as one Details pane and keep explicit close state across restart", async () => {
  const original = await state();
  const a = original.entities.find((e) => e.kind === "Class")!.iri;
  const b = original.entities.find(
    (e) => e.kind === "Class" && e.iri !== a,
  )!.iri;
  await request("select", { iri: a });
  await menu("view.details");
  await expect(identifier()).toHaveAttribute("data-entity-iri", a);
  await app.close();
  const file = path.join(profile, "workbench.json");
  const prefs = JSON.parse(await readFile(file, "utf8"));
  let replaced = false;
  const migrateFixture = (node: any) => {
    if (node.children) {
      const index = node.children.findIndex(
        (n: any) => n.component === "details",
      );
      if (index >= 0) {
        node.children.splice(
          index,
          1,
          {
            type: "tab",
            id: "entity:old-a",
            component: "entity",
            name: "Old Alpha",
            config: { iri: a },
          },
          {
            type: "tab",
            id: "entity:old-b",
            component: "entity",
            name: "Old Beta",
            config: { iri: b },
          },
        );
        replaced = true;
      }
      node.children.forEach(migrateFixture);
    }
  };
  migrateFixture(prefs.layout.layout);
  expect(replaced).toBe(true);
  prefs.arrangement = "custom";
  await writeFile(file, JSON.stringify(prefs));
  const sessionFile = path.join(profile, "last-session.json");
  const session = JSON.parse(await readFile(sessionFile, "utf8"));
  session.workbench = prefs;
  await writeFile(sessionFile, JSON.stringify(session));
  const reopen = async () => {
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
    page = bridge = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      await (
        await app.browserWindow(page)
      ).evaluate((w) => w.setFocusable(false));
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
  };
  await reopen();
  await expect(detailsTab()).toHaveCount(1);
  await request("select", { iri: b });
  await menu("view.details");
  await expect(identifier()).toHaveAttribute("data-entity-iri", b);
  await menu("view.details");
  await expect(detailsTab()).toHaveCount(1);
  await menu("pane.close");
  await expect(detailsTab()).toHaveCount(0);
  await app.close();
  await reopen();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await request("select", { iri: a });
  await expect(detailsTab()).toHaveCount(0);
  await menu("view.details");
  await expect(identifier()).toHaveAttribute("data-entity-iri", a);
});

async function prepareEdges() {
  const ids = await prepare(),
    predicate = "https://example.org/related";
  for (const [source, target] of [
    [ids.a, ids.b],
    [ids.b, ids.c],
  ]) {
    const s = await state();
    await request("createEdge", {
      datasetEpoch: s.datasetEpoch,
      version: s.version,
      statement: {
        subject: source,
        predicate,
        object: { literal: false, value: target },
      },
    });
  }
  await request("select", { iri: null });
  await fitGraph();
  return {
    ...ids,
    predicate,
    ab: JSON.stringify([ids.a, predicate, ids.b]),
    bc: JSON.stringify([ids.b, predicate, ids.c]),
  };
}
async function clickEdge(source: string, target: string) {
  const a = await at(source),
    b = await at(target);
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
}

test("the same Details tab follows node and edge clicks, retains drafts and stays closed after explicit close", async () => {
  const ids = await prepareEdges();
  await clickEdge(ids.a, ids.b);
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(ids.ab);
  await expect(detailsTab()).toHaveCount(0);
  await menu("view.details");
  await menu("pane.move.right");
  await fitGraph();
  const target = () =>
    details().getByRole("combobox", { name: "Edge target", exact: true });
  await expect(target()).toHaveAttribute("title", ids.b);
  await target().fill(ids.c);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(JSON.stringify([ids.a, ids.predicate, ids.c]));
  await expect(
    page.locator('[data-panel="inspector"] input[aria-label="Edge target"]'),
  ).toHaveAttribute("title", ids.c);
  await clickNode(ids.a);
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
  await clickEdge(ids.b, ids.c);
  await expect(target()).toHaveAttribute("title", ids.c);
  await expect(
    details().getByRole("combobox", { name: "Edge source" }),
  ).toHaveAttribute("title", ids.b);
  await clickEdge(ids.a, ids.c);
  await expect(target()).toHaveAttribute("title", ids.c);

  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(JSON.stringify([ids.a, ids.predicate, ids.c]));
  await expect(target()).toHaveAttribute("title", ids.c);
  await expect(detailsTab()).toHaveCount(1);
  await menu("edit.undo");
  await expect(target()).toHaveAttribute("title", ids.b);
  await menu("view.details");
  await menu("pane.close");
  await expect(detailsTab()).toHaveCount(0);
  await clickEdge(ids.b, ids.c);
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(ids.bc);
  await expect(detailsTab()).toHaveCount(0);
  await menu("entity.edit");
  await expect(detailsTab()).toHaveCount(1);
  await expect(target()).toHaveAttribute("title", ids.c);
  await page.screenshot({
    path: "artifacts/testing/details-node-and-edge.png",
  });
});

test("edge Details reuses hidden and detached tabs without taking focus on selection", async () => {
  const ids = await prepareEdges();
  await clickNode(ids.a);
  await menu("view.details");
  await menu("view.graph");
  await fitGraph();
  await clickEdge(ids.a, ids.b);
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(ids.ab);
  await expect(detailsTab()).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
  await menu("edge.edit");
  await expect(
    details().getByRole("combobox", { name: "Edge target" }),
  ).toHaveAttribute("title", ids.b);
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((p) => p !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(child)
    ).evaluate((w) => w.setFocusable(false));
  await expect(
    details(child).getByRole("combobox", { name: "Edge source" }),
  ).toHaveAttribute("title", ids.a);
  await fitGraph();
  await clickNode(ids.c);
  await expect(identifier(child)).toHaveAttribute("data-entity-iri", ids.c);
  await clickEdge(ids.b, ids.c);
  await expect(
    details(child).getByRole("combobox", { name: "Edge source" }),
  ).toHaveAttribute("title", ids.b);
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
  await menu("view.details");
  await expect.poll(() => app.windows().length).toBe(2);
  await expect(page.locator('[data-panel="details"]')).toHaveCount(0);
});

test("Save workspace applies a retained edge draft after switching to a node", async () => {
  const ids = await prepareEdges();
  await clickEdge(ids.a, ids.b);
  await menu("view.details");
  const predicate = "http://www.w3.org/2002/07/owl#equivalentClass";
  await details()
    .getByRole("combobox", { name: "Edge relationship" })
    .selectOption(predicate);
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(JSON.stringify([ids.a, predicate, ids.b]));
  await request("select", { iri: ids.c });
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.c);
  const file = path.join(profile, "edge-draft.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(file, "utf8")).tbox.some(
          (t: any) =>
            t.subject === ids.a &&
            t.predicate === predicate &&
            t.object.value === ids.b,
        );
      } catch {
        return false;
      }
    })
    .toBe(true);
  await expect(detailsTab()).toHaveCount(1);
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.c);
  expect(
    (await state()).graph.edges.some(
      (e) =>
        e.source === ids.a &&
        e.predicate === ids.predicate &&
        e.target === ids.b,
    ),
  ).toBe(false);
});

test("Details identifies intersection branches and edits members against the original expression", async () => {
  const file = path.resolve("tests/fixtures/intersections/courses.ttl");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("courses.ttl");
  await request("seed", {
    iris: ["http://devry.edu/courses#3D_Design_and_3D_Printing"],
  });
  const g = (await state()).graph;
  const edge = g.edges.find((e) => e.intersection)!;
  await request("selectEdge", {
    key: edgeKey(edge),
  });
  await expect(detailsTab()).toHaveCount(0);
  await menu("view.details");
  await expect(
    details().getByRole("combobox", { name: "Edge source" }),
  ).toBeDisabled();
  await expect(
    details().getByRole("combobox", { name: "Edge target" }),
  ).toBeEnabled();
  await expect(
    details().getByRole("button", { name: "Apply edge changes" }),
  ).toHaveCount(0);
  await expect(details()).toContainText("shared OWL expression");
  await expect(
    details().getByRole("combobox", { name: "Edge source" }),
  ).toHaveValue("3D Design and 3D Printing");
});

const backButton = (p = page) =>
  details(p).getByRole("button", { name: "Back", exact: true });
const openValue = (iri: string, p = page) =>
  details(p)
    .locator("tr")
    .filter({ has: p.locator('input[title="' + iri + '"]') })
    .getByRole("button", { name: /^Open details for value / });

test("Details Back retraces resource links and preserves text editing and drafts", async () => {
  const ids = await prepareEdges();
  await request("select", { iri: ids.a });
  await menu("view.details");
  await expect(backButton()).toBeDisabled();
  await details()
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .fill("Alpha draft");
  await openValue(ids.b).click();
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await expect(backButton()).toHaveAttribute(
    "title",
    "Back to Alpha (Backspace)",
  );
  const label = details().getByRole("textbox", {
    name: "Entity label",
    exact: true,
  });
  await label.focus();
  await label.press("End");
  await label.press("Backspace");
  await expect(label).toHaveValue("Bet");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await label.fill("Beta");
  await openValue(ids.c).click();
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.c);
  await backButton().click();
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await page.keyboard.press("Backspace");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
  await expect(
    details().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("Alpha draft");
  await expect(backButton()).toBeDisabled();
  await page.keyboard.press("Backspace");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
  await openValue(ids.b).click();
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  // A predicate search dialog owns its keys even when no text field has focus.
  await details()
    .getByRole("combobox", { name: /Predicate/ })
    .first()
    .selectOption("__find");
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .focus();
  await page.keyboard.press("Backspace");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await menu("pane.move.right");
  await page.screenshot({ path: "artifacts/testing/details-back.png" });
  await page.getByTestId("graph-canvas").focus();
  await page.keyboard.press("Backspace");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  // Clicking non-editable pane content establishes the keyboard scope.
  await details()
    .getByRole("columnheader", { name: "Predicate", exact: true })
    .click();
  await page.keyboard.press("Backspace");
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
});

test("Details Back includes edges, survives detach, and resets for another ontology", async () => {
  const ids = await prepareEdges();
  await request("selectEdge", { key: ids.ab });
  await menu("view.details");
  await expect(backButton()).toBeDisabled();
  await details()
    .getByRole("combobox", { name: "Edge target", exact: true })
    .fill(ids.c);
  await page.keyboard.press("Enter");
  ids.ab = JSON.stringify([ids.a, ids.predicate, ids.c]);
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(ids.ab);
  await request("select", { iri: ids.a });
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
  await request("select", { iri: ids.b });
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.b);
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((p) => p !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(child)
    ).evaluate((w) => w.setFocusable(false));
  await expect(backButton(child)).toBeEnabled();
  await backButton(child).focus();
  await child.keyboard.press("Backspace");
  await expect(identifier(child)).toHaveAttribute("data-entity-iri", ids.a);
  await backButton(child).click();
  await expect(
    details(child).getByRole("combobox", { name: "Edge target", exact: true }),
  ).toHaveAttribute("title", ids.c);
  await expect
    .poll(async () => (await state()).graph.selectedEdge)
    .toBe(ids.ab);
  await expect(backButton(child)).toBeDisabled();
  // Deselecting can be reversed without adding an empty entry to history.
  await request("select", { iri: null });
  await expect(details(child)).toContainText("Select a node or edge");
  await backButton(child).click();
  await expect(
    details(child).getByRole("combobox", { name: "Edge target", exact: true }),
  ).toHaveAttribute("title", ids.c);
  await menu("file.new");
  await expect(backButton(child)).toBeDisabled();
});

test("Details Back restores the owning graph for an edge and survives closing the pane", async () => {
  const ids = await prepareEdges();
  await request("select", { iri: ids.a });
  await menu("view.details");
  await request("selectEdge", { key: ids.ab });
  await expect(
    details().getByRole("combobox", { name: "Edge target", exact: true }),
  ).toHaveAttribute("title", ids.b);
  await request("graphCreate", { iris: [ids.c] });
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.c);
  expect((await state()).activeGraphId).not.toBe("graph");
  await backButton().click();
  await expect.poll(async () => (await state()).activeGraphId).toBe("graph");
  await expect(
    details().getByRole("combobox", { name: "Edge target", exact: true }),
  ).toHaveAttribute("title", ids.b);
  await menu("pane.close");
  await expect(detailsTab()).toHaveCount(0);
  await menu("view.details");
  await backButton().click();
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
  await expect(backButton()).toBeDisabled();
  // A removed edge is skipped instead of leaving a broken Back destination.
  await request("selectEdge", { key: ids.ab });
  await expect(
    details().getByRole("combobox", { name: "Edge target", exact: true }),
  ).toHaveAttribute("title", ids.b);
  await request("select", { iri: ids.c });
  const edge = await page.evaluate(
    (key) => window.axiom.request<any>("edgeDocument", { key }),
    ids.ab,
  );
  await request("editEdge", {
    key: ids.ab,
    original: edge.statements[0],
    datasetEpoch: edge.datasetEpoch,
    version: edge.version,
  });
  // Removing an edge clears selection; return to Gamma before retracing further.
  await expect(backButton()).toHaveAttribute(
    "title",
    "Back to Gamma (Backspace)",
  );
  await backButton().click();
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.c);
  await expect(backButton()).toHaveAttribute(
    "title",
    "Back to Alpha (Backspace)",
  );
  await backButton().click();
  await expect(identifier()).toHaveAttribute("data-entity-iri", ids.a);
});
