import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }, id) =>
          Menu.getApplicationMenu()!.getMenuItemById(id)?.enabled,
        id,
      ),
    )
    .toBe(true);
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/authoring-"));
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
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
});
test.afterEach(async () => {
  await app.close();
  expect(errors).toEqual([]);
});
test("natural labels create in the taxonomy and full entity details open beside the graph", async () => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await menu("file.new");
  await expect(
    page.getByRole("button", { name: "Classes · 1", exact: true }),
  ).toBeVisible();
  await menu("entity.createClass");
  const form = page.getByRole("form", { name: "Create entity" });
  await expect(form).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await form
    .getByRole("textbox", { name: "New entity label" })
    .fill("Course Credit");
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await expect(form).toHaveCount(0);
  const entity = (await state()).entities.find(
    (e) => e.label === "Course Credit",
  )!;
  expect(entity.iri).toMatch(/#CourseCredit$/);
  const row = page
    .locator('[data-panel="hierarchy"] [data-rename-iri="' + entity.iri + '"]')
    .locator("..");
  await expect(row).toContainText("Course Credit");
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Details", exact: true }).click();
  const editor = page.getByRole("region", { name: "Details" });
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Graph", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await editor.getByRole("button", { name: "Add row", exact: true }).click();
  await editor
    .locator("tbody tr")
    .last()
    .getByRole("combobox")
    .selectOption("http://www.w3.org/2000/01/rdf-schema#comment");
  await editor
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .fill("The number of credits awarded.");
  await page.locator(":focus").blur();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === entity.iri)?.comment,
    )
    .toBe("The number of credits awarded.");
  await page.screenshot({ path: "artifacts/testing/entity-details.png" });
  await menu("view.hierarchy");
  await row.click();
  await page.keyboard.press("F2");
  const rename = row.getByRole("textbox", {
    name: "Rename entity",
    exact: true,
  });
  await rename.fill("Credit hours");
  await rename.press("Enter");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === entity.iri)?.label,
    )
    .toBe("Credit hours");
});
test("double-clicking graph space creates a node with its name selected at that position", async () => {
  await menu("file.new");
  const canvas = page.getByTestId("graph-canvas");
  await canvas.dblclick({ position: { x: 55, y: 75 } });
  const form = page
    .locator(".graph-create")
    .getByRole("form", { name: "Create entity" });
  const input = page.locator(".graph-inline-rename").getByRole("textbox", {
    name: "Rename entity",
    exact: true,
  });
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("New class");
  expect(
    await input.evaluate((el: HTMLInputElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([0, "New class".length]);
  const created = await state(),
    initial = created.entities.find((e) => e.label === "New class")!,
    node = created.graph.nodes.find((n) => n.iri === initial.iri)!;
  expect(initial.parents).toEqual(["http://www.w3.org/2002/07/owl#Thing"]);
  expect(node.pinned).toBe(true);
  await expect
    .poll(async () => {
      const c = (await page.evaluate(() => window.axiom.preferences.load()))
        .panelState?.["graph.camera"] as { x: number; y: number; zoom: number };
      return c
        ? Math.max(
            Math.abs(node.x * c.zoom + c.x - 55),
            Math.abs(node.y * c.zoom + c.y - 75),
          )
        : Infinity;
    })
    .toBeLessThan(1);
  await page.screenshot({ path: "artifacts/testing/graph-create-inline.png" });
  await page.keyboard.type("Graph class");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(canvas).toBeFocused();
  let s = await state();
  expect(s.entities.some((e) => e.iri === initial.iri)).toBe(false);
  expect(s.selected).toMatch(/#GraphClass$/);
  const cls = s.entities.find((e) => e.label === "Graph class")!;
  expect(s.graph.nodes.find((n) => n.iri === cls.iri)?.pinned).toBe(true);
  await canvas.click({ button: "right", position: { x: 155, y: 75 } });
  await page.getByRole("menuitem", { name: "New instance here" }).click();
  await form
    .getByRole("textbox", { name: "New entity label" })
    .fill("A first instance");
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await expect(form).toHaveCount(0);
  s = await state();
  expect(
    s.entities.find((e) => e.label === "A first instance")?.types,
  ).toContain(cls.iri);
  expect(s.graph.nodes.length).toBeLessThanOrEqual(s.graph.budget);
  await page.screenshot({ path: "artifacts/testing/graph-creation.png" });
});
test("new graph nodes keep distinct defaults on blur, Escape and an empty name", async () => {
  await menu("file.new");
  const canvas = page.getByTestId("graph-canvas"),
    input = page
      .locator(".graph-inline-rename")
      .getByRole("textbox", { name: "Rename entity", exact: true });
  const iris: string[] = [];
  for (const [index, action] of ["blur", "escape", "empty"].entries()) {
    const name = "New class" + (index ? " " + (index + 1) : "");
    await canvas.dblclick({ position: { x: 55 + index * 120, y: 75 } });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(name);
    iris.push((await state()).selected!);
    if (action === "escape") {
      await page.keyboard.type("Discard this name");
      await input.press("Escape");
    } else {
      if (action === "empty") await input.fill(" ");
      await canvas.click({ position: { x: 8, y: 8 } });
    }
    await expect(input).toHaveCount(0);
    await expect(canvas).toBeFocused();
    const s = await state();
    expect(s.entities.find((e) => e.iri === iris[index])?.label).toBe(name);
    expect(s.graph.nodes.find((n) => n.iri === iris[index])?.pinned).toBe(true);
    expect(s.classCount).toBe(index + 2);
  }
  await menu("edit.undo");
  await expect.poll(async () => (await state()).classCount).toBe(3);
  expect((await state()).entities.some((e) => e.iri === iris[2])).toBe(false);
  await menu("edit.redo");
  await expect.poll(async () => (await state()).classCount).toBe(4);
  await canvas.dblclick({ position: { x: 295, y: 75 } });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("New class 3");
  await page.keyboard.type("Named on the canvas");
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect(input).toHaveCount(0);
  const s = await state();
  expect(s.classCount).toBe(4);
  expect(s.entities.some((e) => e.iri === iris[2])).toBe(false);
  expect(
    s.entities.find((e) => e.label === "Named on the canvas")?.iri,
  ).toMatch(/#NamedOnTheCanvas$/);
  expect(s.graph.nodes.length).toBeLessThanOrEqual(s.graph.budget);
});

test("Export offers real image formats, configurable scale and multi-page reports", async () => {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  let d = page.getByRole("dialog", { name: "Export", exact: true });
  await expect(
    d.getByRole("combobox", { name: "Export format" }),
  ).toBeVisible();
  await expect(d.getByRole("spinbutton", { name: "Export scale" })).toHaveValue(
    "2",
  );
  await page.screenshot({ path: "artifacts/testing/export-dialog.png" });
  const checks: Record<string, (b: Buffer) => boolean> = {
    png: (b) => b.subarray(1, 4).toString() === "PNG",
    jpg: (b) => b[0] === 255 && b[1] === 216,
    webp: (b) => b.subarray(8, 12).toString() === "WEBP",
    bmp: (b) => b.subarray(0, 2).toString() === "BM",
    tiff: (b) => ["II", "MM"].includes(b.subarray(0, 2).toString()),
    svg: (b) => b.toString().includes("<svg "),
    pdf: (b) => b.subarray(0, 4).toString() === "%PDF",
  };
  for (const format of Object.keys(checks)) {
    await d
      .getByRole("combobox", { name: "Export format" })
      .selectOption(format);
    if (["png", "jpg", "webp", "bmp", "tiff"].includes(format))
      await d.getByRole("spinbutton", { name: "Export scale" }).fill("1");
    const file = path.resolve("artifacts/testing/authoring-export." + format);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await d.getByRole("button", { name: "Export", exact: true }).click();
    await expect(d).toHaveCount(0);
    expect(checks[format](await readFile(file))).toBe(true);
    await menu("graph.export");
  }
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  await menu("file.new");
  for (let i = 0; i < 18; i++)
    await page.evaluate(
      (i) =>
        window.axiom.request("createClass", {
          name: "Report section " + i,
          parent: "http://www.w3.org/2002/07/owl#Thing",
          comment: "A detailed report entry. ".repeat(20),
        }),
      i,
    );
  await menu("graph.export");
  await d
    .getByRole("combobox", { name: "Export content" })
    .selectOption("report");
  await d
    .getByRole("combobox", { name: "Report scope" })
    .selectOption("ontology");
  const file = path.resolve("artifacts/testing/ontology-report.pdf");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await d.getByRole("button", { name: "Export", exact: true }).click();
  await expect(d).toHaveCount(0, { timeout: 30000 });
  const pdf = await readFile(file);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(
    Math.max(
      ...[...pdf.toString("latin1").matchAll(/\/Count (\d+)/g)].map(
        (m) => +m[1],
      ),
    ),
  ).toBeGreaterThan(1);
});

test("entity drafts survive closing a tab, save atomically and reject conflicting edits", async () => {
  await menu("file.new");
  const iri = await page.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "Course Credit",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await menu("entity.edit");
  const editor = page.getByRole("region", { name: "Details" });
  await editor
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Retained draft label");
  await menu("pane.close");
  await expect(editor).toHaveCount(0);
  const file = path.resolve("artifacts/testing/editor-draft.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.save");
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === iri)?.label,
    )
    .toBe("Retained draft label");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await menu("entity.edit");
  await editor
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("My unsaved change");
  await page.evaluate(
    (iri) =>
      window.axiom.request("rename", { iri, name: "An intervening change" }),
    iri,
  );
  await page.locator(":focus").blur();
  await expect(editor.getByRole("alert").first()).toContainText(
    "changed since",
  );
  expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "An intervening change",
  );
  await editor.getByRole("button", { name: "More entity actions" }).click();
  await editor.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(
    editor.getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("An intervening change");
});
test("canvas creation respects refusal at a full graph budget and stale workspace requests", async () => {
  await page.evaluate(async () => {
    const s = await window.axiom.request<Snapshot>("state");
    await window.axiom.request("budget", { value: 100 });
    await window.axiom.request("seed", {
      iris: s.entities.slice(0, 100).map((e) => e.iri),
      replace: true,
      expand: false,
    });
    await window.axiom.request("eviction", { mode: "refuse" });
  });
  const before = await state();
  expect(before.graph.nodes).toHaveLength(100);
  const failure = await page.evaluate(async (epoch) => {
    try {
      await window.axiom.request("createClass", {
        name: "Must not appear",
        parent: "http://www.w3.org/2002/07/owl#Thing",
        position: { x: 0, y: 0 },
        datasetEpoch: epoch,
      });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, before.datasetEpoch);
  expect(failure).toContain("graph is full");
  expect((await state()).entities.length).toBe(before.entities.length);
  await menu("file.new");
  const stale = await page.evaluate(async (epoch) => {
    try {
      await window.axiom.request("createIndividual", {
        name: "Wrong workspace",
        type: "http://www.w3.org/2002/07/owl#Thing",
        datasetEpoch: epoch,
      });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, before.datasetEpoch);
  expect(stale).toContain("workspace changed");
  expect((await state()).individualCount).toBe(0);
});

test("taxonomy dragging opens entity details and all report formats produce files", async () => {
  await menu("file.new");
  await page
    .getByRole("button", { name: "New class", exact: true })
    .first()
    .click();
  const form = page.getByRole("form", { name: "Create entity" });
  await form
    .getByRole("textbox", { name: "New entity label" })
    .fill("Course Credit");
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await expect(form).toHaveCount(0);
  const iri = (await state()).selected!;
  const row = page
    .locator('[data-panel="hierarchy"] [data-rename-iri="' + iri + '"]')
    .locator("..");
  await row.dragTo(page.getByRole("region", { name: "Entity inspector" }));
  await expect(page.getByRole("region", { name: "Details" })).toBeVisible();
  await menu("view.graph");
  for (const format of ["html", "md", "csv", "json"]) {
    await menu("graph.export");
    const d = page.getByRole("dialog", { name: "Export", exact: true });
    await d
      .getByRole("combobox", { name: "Export content" })
      .selectOption("report");
    await d
      .getByRole("combobox", { name: "Export format" })
      .selectOption(format);
    await d
      .getByRole("combobox", { name: "Report scope" })
      .selectOption("ontology");
    const file = path.resolve("artifacts/testing/entity-report." + format);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await d.getByRole("button", { name: "Export", exact: true }).click();
    await expect(d).toHaveCount(0);
    const text = await readFile(file, "utf8");
    expect(text).toContain("Course Credit");
    expect(
      format === "md"
        ? text.replace(/\\([\\`*_{}\[\]()#+.!|>-])/g, "$1")
        : text,
    ).toContain(iri);
    if (format === "json")
      expect(JSON.parse(text).statements.length).toBeGreaterThan(1);
  }
});

test("changing an entity IRI keeps its editor, pinned graph position and incoming references", async () => {
  await menu("file.new");
  const oldIri = await page.evaluate(async () => {
    const iri = await window.axiom.request<string>("createClass", {
      name: "Course Credit",
      parent: "http://www.w3.org/2002/07/owl#Thing",
      position: { x: 120, y: 240 },
    });
    await window.axiom.request("createIndividual", {
      name: "First credit",
      type: iri,
    });
    await window.axiom.request("select", { iri });
    return iri;
  });
  const before = (await state()).graph.nodes.find((n) => n.iri === oldIri)!;
  await menu("entity.edit");
  const editor = page.getByRole("region", { name: "Details" });
  const newIri = "https://example.org/CourseCredit";
  await editor.locator(".entity-source > summary").click();
  const source = editor.getByRole("textbox", {
    name: "Entity source",
    exact: true,
  });
  await expect(source).toBeEnabled();
  const local = oldIri.slice(
    Math.max(oldIri.lastIndexOf("#"), oldIri.lastIndexOf("/")) + 1,
  );
  await source.fill(
    (await source.inputValue())
      .replace(":" + local + " ", "<" + newIri + "> ")
      .replace("<" + oldIri + ">", "<" + newIri + ">"),
  );
  await editor
    .getByRole("button", { name: "Save source", exact: true })
    .click();
  await expect(editor).toHaveAttribute("data-entity-iri", newIri);
  await expect(editor.getByRole("alert")).toHaveCount(0);
  const after = await state();
  expect(after.entities.some((e) => e.iri === oldIri)).toBe(false);
  expect(
    after.entities.find((e) => e.label === "First credit")?.types,
  ).toContain(newIri);
  expect(after.graph.nodes.find((n) => n.iri === newIri)).toMatchObject({
    x: before.x,
    y: before.y,
    pinned: true,
  });
  await menu("view.graph");
  await menu("entity.edit");
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toHaveCount(1);
  await editor
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Updated credit");
  await page.locator(":focus").blur();
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === newIri)?.label,
    )
    .toBe("Updated credit");
});

test("graph creation dismisses with Escape, close, Cancel or an outside click without creating an entity", async () => {
  await menu("file.new");
  const canvas = page.getByTestId("graph-canvas"),
    popup = page.locator(".graph-create"),
    filter = page.getByRole("textbox", { name: "Filter hierarchy" });
  for (const action of [
    "escape",
    "close",
    "cancel",
    "canvas",
    "other-pane",
    "escape-outside",
  ]) {
    await page.getByRole("button", { name: "Add entity", exact: true }).click();
    await expect(popup).toBeVisible();
    const input = popup.getByRole("textbox", { name: "New entity label" });
    await expect(input).toBeFocused();
    await input.fill("Discarded " + action);
    await popup
      .getByRole("combobox", { name: "Entity kind" })
      .selectOption("Individual");
    await expect(popup).toBeVisible();
    if (action === "escape") await input.press("Escape");
    else if (action === "close")
      await popup.getByRole("button", { name: "Close create entity" }).click();
    else if (action === "cancel")
      await popup.getByRole("button", { name: "Cancel", exact: true }).click();
    else if (action === "canvas")
      await canvas.click({ position: { x: 8, y: 8 } });
    else if (action === "other-pane") await filter.click();
    else {
      await canvas.focus();
      await page.keyboard.press("Escape");
    }
    await expect(popup).toHaveCount(0);
    await expect(action === "other-pane" ? filter : canvas).toBeFocused();
    const s = await state();
    expect(s.classCount).toBe(1);
    expect(s.individualCount).toBe(0);
    expect(s.entities.some((e) => e.label?.startsWith("Discarded "))).toBe(
      false,
    );
  }
});

test("graph creation light dismissal works in a detached window", async () => {
  await menu("file.new");
  await menu("view.graph");
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((w) => w !== page)!,
    canvas = child.getByTestId("graph-canvas"),
    popup = child.locator(".graph-create");
  child.on("pageerror", (e) => errors.push(e.message));
  await expect(canvas).toBeVisible();
  await child.getByRole("button", { name: "Add entity", exact: true }).click();
  await expect(popup).toBeVisible();
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect(popup).toHaveCount(0);
  await page.evaluate(() =>
    window.axiom.request("select", {
      iri: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await canvas.focus();
  await child.keyboard.press("Shift+F10");
  await child
    .getByRole("menuitem", { name: "New instance", exact: true })
    .click();
  await expect(popup).toHaveAttribute(
    "data-anchor-iri",
    "http://www.w3.org/2002/07/owl#Thing",
  );
  await expect(canvas).toHaveAttribute(
    "data-spotlight",
    "http://www.w3.org/2002/07/owl#Thing",
  );
  await expect(child.locator(".graph-create-link path")).toHaveAttribute(
    "d",
    /^M /,
  );
  await expect(
    popup.getByRole("textbox", { name: "New entity label" }),
  ).toBeFocused();
  await child.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(canvas).toBeFocused();
  expect((await state()).classCount).toBe(1);
  await expect(canvas).toHaveAttribute("data-spotlight", "");
  await expect(child.locator(".graph-create-link")).toHaveCount(0);
  await canvas.dblclick({ position: { x: 55, y: 75 } });
  const input = child.locator(".graph-inline-rename").getByRole("textbox", {
    name: "Rename entity",
    exact: true,
  });
  await expect(popup).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("New class");
  await child.keyboard.type("Detached class");
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect(input).toHaveCount(0);
  const result = await state();
  expect(result.classCount).toBe(2);
  expect(result.entities.some((e) => e.label === "Detached class")).toBe(true);
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
});

test("new instance stays connected to its class through movement, themes, resizing and parent changes", async () => {
  await menu("file.new");
  const source = await page.evaluate(async () => {
    await window.axiom.request("createClass", {
      name: "Other course",
      parent: "http://www.w3.org/2002/07/owl#Thing",
      position: { x: -300, y: 200 },
    });
    return window.axiom.request<string>("createClass", {
      name: "Course Credit",
      parent: "http://www.w3.org/2002/07/owl#Thing",
      position: { x: 320, y: -220 },
    });
  });
  await menu("graph.fit");
  const canvas = page.getByTestId("graph-canvas"),
    popup = page.locator(".graph-create"),
    link = page.locator(".graph-create-link path");
  const camera = () =>
    page.evaluate(
      async () =>
        (await window.axiom.preferences.load()).panelState?.[
          "graph.camera"
        ] as { x: number; y: number; zoom: number },
    );
  await expect.poll(async () => !!(await camera())).toBe(true);
  const n = (await state()).graph.nodes.find((n) => n.iri === source)!,
    c = await camera();
  await canvas.click({
    button: "right",
    position: { x: n.x * c.zoom + c.x, y: n.y * c.zoom + c.y },
  });
  await expect(canvas).toHaveAttribute("data-spotlight", source);
  await page
    .getByRole("menuitem", { name: "New instance", exact: true })
    .click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute("data-anchor-iri", source);
  await expect(
    popup.getByRole("combobox", { name: "Instance of" }),
  ).toHaveValue(source);
  await expect(
    popup.getByRole("textbox", { name: "New entity label" }),
  ).toBeFocused();
  const checkPlacement = async () => {
    const box = (await popup.boundingBox())!,
      area = (await canvas.boundingBox())!,
      s = await state(),
      cameraValue = await camera(),
      iri = await popup.getAttribute("data-anchor-iri"),
      node = s.graph.nodes.find((n) => n.iri === iri)!,
      x = area.x + node.x * cameraValue.zoom + cameraValue.x,
      y = area.y + node.y * cameraValue.zoom + cameraValue.y,
      r = node.radius * cameraValue.zoom + 8;
    expect(box.x).toBeGreaterThanOrEqual(area.x + 7);
    expect(box.y).toBeGreaterThanOrEqual(area.y + 7);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width - 7);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height - 7);
    expect(
      box.x >= x + r ||
        box.x + box.width <= x - r ||
        box.y >= y + r ||
        box.y + box.height <= y - r,
    ).toBe(true);
    expect(await link.getAttribute("d")).toMatch(/^M [\d. -]+ L [\d. -]+$/);
  };
  await checkPlacement();
  for (const theme of ["light", "dark"]) {
    await menu("theme." + theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(canvas).toHaveAttribute("data-spotlight", source);
    await page.screenshot({
      path: "artifacts/testing/graph-callout-" + theme + ".png",
    });
  }
  const previous = await link.getAttribute("d");
  await page.evaluate(
    async ({ iri, x, y }) =>
      window.axiom.request("drag", {
        iri,
        x,
        y,
        dragging: false,
      }),
    { iri: source, x: n.x - 60, y: n.y + 90 },
  );
  await expect.poll(() => link.getAttribute("d")).not.toBe(previous);
  await checkPlacement();
  await popup
    .getByRole("combobox", { name: "Instance of" })
    .selectOption("http://www.w3.org/2002/07/owl#Thing");
  await expect(popup).toHaveAttribute(
    "data-anchor-iri",
    "http://www.w3.org/2002/07/owl#Thing",
  );
  await expect(canvas).toHaveAttribute(
    "data-spotlight",
    "http://www.w3.org/2002/07/owl#Thing",
  );
  await checkPlacement();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1060, 740),
  );
  await menu("graph.fit");
  await expect
    .poll(async () => (await canvas.boundingBox())!.height)
    .toBeLessThan(600);
  await expect(
    popup.getByRole("button", { name: "Close create entity" }),
  ).toBeInViewport();
  // Resizing and fit persist the new camera asynchronously.
  await expect(async () => {
    await checkPlacement();
  }).toPass({ timeout: 5000 });
  await popup
    .getByRole("textbox", { name: "New entity label" })
    .fill("First credit");
  await popup.getByRole("button", { name: "Create", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator(".graph-create-link")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-spotlight", "");
  const result = await state();
  expect(
    result.entities.find((e) => e.label === "First credit")?.types,
  ).toContain("http://www.w3.org/2002/07/owl#Thing");
  expect(result.graph.nodes.length).toBeLessThanOrEqual(result.graph.budget);
});

test("the sample graph fades other nodes while its source remains bright", async () => {
  await menu("view.graph");
  await menu("pane.maximise");
  await menu("graph.fit");
  await page.evaluate(() => window.axiom.request("freeze"));
  const s = await state(),
    source =
      s.graph.nodes.find(
        (n) => n.kind === "Class" && n.label === "Nut Topping",
      ) ?? s.graph.nodes.find((n) => n.kind === "Class")!;
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    source.iri,
  );
  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas).toHaveAttribute("data-rename-iri", source.iri);
  await expect
    .poll(
      async () =>
        !!(await page.evaluate(() => window.axiom.preferences.load()))
          .panelState?.["graph.camera"],
    )
    .toBe(true);
  const c = await page.evaluate(
    async () =>
      (await window.axiom.preferences.load()).panelState?.["graph.camera"] as {
        x: number;
        y: number;
        zoom: number;
      },
  );
  const point = (n: typeof source) => ({
    x: n.x * c.zoom + c.x,
    y: n.y * c.zoom + c.y,
  });
  const before = await canvas.screenshot();
  await canvas.click({ button: "right", position: point(source) });
  await page
    .getByRole("menuitem", { name: "New instance", exact: true })
    .click();
  const popup = page.locator(".graph-create");
  await expect(canvas).toHaveAttribute("data-spotlight", source.iri);
  await expect(popup).toHaveAttribute("data-anchor-iri", source.iri);
  const box = (await popup.boundingBox())!,
    area = (await canvas.boundingBox())!;
  const visible = s.graph.nodes.filter((n) => {
    const p = point(n),
      r = n.radius * c.zoom + 10;
    return (
      n.kind === "Class" &&
      n.iri !== source.iri &&
      p.x > r &&
      p.y > r &&
      p.x < area.width - r &&
      p.y < area.height - r &&
      (p.x + area.x + r < box.x ||
        p.x + area.x - r > box.x + box.width ||
        p.y + area.y + r < box.y ||
        p.y + area.y - r > box.y + box.height)
    );
  });
  expect(visible.length).toBeGreaterThan(0);
  const after = await canvas.screenshot();
  const colors = async (png: Buffer) =>
    app.evaluate(
      ({ nativeImage }, { png, points, width }) => {
        const img = nativeImage.createFromBuffer(Buffer.from(png, "base64")),
          bitmap = img.toBitmap(),
          size = img.getSize(),
          scale = size.width / width;
        return points.map((p) => {
          const offset =
            (Math.floor(p.y * scale) * size.width + Math.floor(p.x * scale)) *
            4;
          return Array.from(bitmap.subarray(offset, offset + 3));
        });
      },
      {
        png: png.toString("base64"),
        points: [source, ...visible].map(point),
        width: area.width,
      },
    );
  const original = await colors(before),
    faded = await colors(after),
    difference = original.map((rgb, i) =>
      Math.hypot(...rgb.map((v, j) => v - faded[i][j])),
    );
  expect(difference[0]).toBeLessThan(3);
  expect(difference.slice(1).every((d) => d > 30)).toBe(true);
  await page.screenshot({
    path: "artifacts/testing/graph-callout-pizza-light.png",
  });
  await menu("theme.dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "artifacts/testing/graph-callout-pizza-dark.png",
  });
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-spotlight", "");
});
