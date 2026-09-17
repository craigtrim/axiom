import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  const profile = await mkdtemp(path.resolve("artifacts/testing/inspector-"));
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

const inspector = () =>
  page.getByRole("region", { name: "Entity inspector", exact: true });
const fields = () =>
  inspector().getByRole("form", { name: "Edit entity properties" });
const select = (iri: string) =>
  page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
async function prepare() {
  await menu("file.new");
  await expect(
    page.getByRole("button", { name: "Classes · 1", exact: true }),
  ).toBeVisible();
  const ids = await page.evaluate(async () => {
    const root = "http://www.w3.org/2002/07/owl#Thing";
    const a = await window.axiom.request<string>("createClass", {
      name: "Alpha",
      parent: root,
      position: { x: -150, y: 0 },
    });
    const b = await window.axiom.request<string>("createClass", {
      name: "Beta",
      parent: root,
      position: { x: 150, y: 0 },
    });
    const child = await window.axiom.request<string>("createClass", {
      name: "Child",
      parent: a,
    });
    const d = await window.axiom.request<any>("entityDocument", { iri: a });
    const ns = "http://www.w3.org/2000/01/rdf-schema#",
      g = "https://example.org/labels";
    await window.axiom.request("updateEntity", {
      iri: a,
      ...d,
      statements: [
        ...d.statements.map((t: any) =>
          t.predicate === ns + "label"
            ? {
                ...t,
                graph: g,
                object: { literal: true, value: "Alpha", language: "en" },
              }
            : t,
        ),
        {
          subject: a,
          predicate: ns + "label",
          object: { literal: true, value: "Alpha français", language: "fr" },
          graph: g,
        },
        {
          subject: a,
          predicate: ns + "comment",
          object: { literal: true, value: "Original comment", language: "en" },
          graph: g,
        },
      ],
    });
    await window.axiom.request("seed", {
      iris: [a, b],
      replace: true,
      expand: false,
    });
    await window.axiom.request("freeze");
    await window.axiom.request("select", { iri: a });
    return { a, b, child, g, ns };
  });
  await menu("graph.fit");
  await expect(
    fields().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Alpha");
  return ids;
}

test("inspector edits identifier, label, comment and parent together while preserving RDF metadata and references", async () => {
  const { a, b, child, g, ns } = await prepare();
  const bend = { x: -220, y: 80 };
  await page.evaluate(
    async ({ a, child, ns, bend }) => {
      await window.axiom.request("seed", {
        iris: [child],
        expand: false,
        replace: false,
      });
      const s = await window.axiom.request<Snapshot>("state");
      await window.axiom.request("routeEdge", {
        key: JSON.stringify([child, ns + "subClassOf", a]),
        bend,
        datasetEpoch: s.datasetEpoch,
      });
      await window.axiom.request("select", { iri: a });
    },
    { a, child, ns, bend },
  );
  await fields()
    .getByRole("textbox", { name: "Entity name", exact: true })
    .fill("CourseCredit");
  await fields()
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Course credit");
  await fields()
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .fill("Credits awarded for a course.");
  await fields()
    .getByRole("combobox", { name: "Subclass of 1", exact: true })
    .selectOption(b);
  await inspector()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  const next = a.replace(/Alpha$/, "CourseCredit");
  await expect.poll(async () => (await state()).selected).toBe(next);
  await expect(
    fields().getByRole("textbox", { name: "Entity name", exact: true }),
  ).toHaveValue("CourseCredit");
  const result = await state(),
    entity = result.entities.find((e) => e.iri === next)!;
  expect(entity.label).toBe("Course credit");
  expect(entity.parents).toEqual([b]);
  expect(
    result.graph.edges.find(
      (edge) => edge.source === child && edge.target === next,
    )?.bend,
  ).toEqual(bend);
  expect(result.entities.find((e) => e.iri === child)!.parents).toEqual([next]);
  expect(
    result.graph.nodes.some(
      (n) => n.iri === next && n.label === "Course credit",
    ),
  ).toBe(true);
  const doc = await page.evaluate(
    (iri) => window.axiom.request<any>("entityDocument", { iri }),
    next,
  );
  expect(doc.statements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        predicate: ns + "label",
        graph: g,
        object: { literal: true, value: "Course credit", language: "en" },
      }),
      expect.objectContaining({
        predicate: ns + "label",
        graph: g,
        object: { literal: true, value: "Alpha français", language: "fr" },
      }),
      expect.objectContaining({
        predicate: ns + "comment",
        graph: g,
        object: {
          literal: true,
          value: "Credits awarded for a course.",
          language: "en",
        },
      }),
    ]),
  );
  await page.screenshot({ path: "artifacts/testing/editable-inspector.png" });
  await menu("edit.undo");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === a && e.label === "Alpha"),
    )
    .toBe(true);
  await menu("edit.redo");
  await expect
    .poll(async () =>
      (await state()).entities.some(
        (e) => e.iri === next && e.label === "Course credit",
      ),
    )
    .toBe(true);
});

test("inspector and details share drafts across selection changes, reject conflicts and include drafts in workspace Save", async () => {
  const { a, b } = await prepare();
  await fields()
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Shared label");
  await inspector()
    .getByRole("button", { name: "Details", exact: true })
    .click();
  const editor = page.getByRole("region", {
    name: "Details",
    exact: true,
  });
  await expect(
    editor.getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Shared label");
  await editor
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .fill("Shared comment");
  await expect(
    fields().getByRole("textbox", { name: "Entity comment", exact: true }),
  ).toHaveValue("Shared comment");
  await select(b);
  await expect(
    fields().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Beta");
  await select(a);
  await expect(
    fields().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Shared label");
  await inspector()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Apply changes", exact: true }),
  ).toHaveCount(0);
  await fields()
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Pending label");
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Graph change" }),
    a,
  );
  await inspector()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(inspector().getByRole("alert")).toContainText("changed since");
  expect((await state()).entities.find((e) => e.iri === a)!.label).toBe(
    "Graph change",
  );
  await inspector()
    .getByRole("button", { name: "Reload", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Graph change");
  await fields()
    .getByRole("textbox", { name: "Entity comment", exact: true })
    .fill("Saved from the inspector draft");
  await select(b);
  const file = path.resolve("artifacts/testing/inspector-draft.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.save");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === a)!.comment,
    )
    .toBe("Saved from the inspector draft");
  expect(await readFile(file, "utf8")).toContain(
    "Saved from the inspector draft",
  );
});

async function nodePoint(iri: string, target = page, size?: number) {
  const camera = async () =>
    (await page.evaluate(() => window.axiom.preferences.load())).panelState?.[
      "graph.camera"
    ] as { x: number; y: number; zoom: number };
  await expect.poll(async () => !!(await camera())).toBe(true);
  const c = await camera(),
    n = (await state()).graph.nodes.find((n) => n.iri === iri)!;
  return {
    x: n.x * c.zoom + c.x,
    y: n.y * c.zoom + c.y,
    labelY: n.y * c.zoom + c.y + (size ? size / 2 : n.radius) * c.zoom + 10,
  };
}

async function clickLabel(iri: string, target = page, size?: number) {
  const canvas = target.getByTestId("graph-canvas");
  let p = await nodePoint(iri, target, size);
  // Camera preferences are saved after the fit animation. Wait for the pointer
  // to land on visible text, using the rendered label's text cursor as evidence.
  await expect
    .poll(async () => {
      p = await nodePoint(iri, target, size);
      await canvas.hover({ position: { x: p.x, y: p.labelY } });
      return canvas.evaluate((el) => el.style.cursor);
    })
    .toBe("text");
  await canvas.click({ position: { x: p.x, y: p.labelY } });
  return p;
}

test("one click on a graph label edits it; node selection, Enter, blur, Escape and hidden labels remain correct", async () => {
  const { a, b } = await prepare(),
    canvas = page.getByTestId("graph-canvas");
  await select(b);
  let p = await nodePoint(a);
  await canvas.click({ position: { x: p.x, y: p.y } });
  await expect.poll(async () => (await state()).selected).toBe(a);
  const input = page
    .locator(".graph-inline-rename")
    .getByRole("textbox", { name: "Rename entity", exact: true });
  await expect(input).toHaveCount(0);
  await clickLabel(a);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Alpha");
  await page.keyboard.type("Typed immediately");
  await input.press("Enter");
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === a)!.label)
    .toBe("Typed immediately");
  await expect(
    fields().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Typed immediately");
  await page.evaluate(() =>
    window.axiom.request("stylesheet", {
      text: "node { size: 54px; font-size: 24px; }",
    }),
  );
  p = await clickLabel(a, page, 54);
  await expect(input).toBeFocused();
  await input.fill("Accepted on blur");
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === a)!.label)
    .toBe("Accepted on blur");
  p = await clickLabel(a, page, 54);
  await input.fill("Cancelled");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  expect((await state()).entities.find((e) => e.iri === a)!.label).toBe(
    "Accepted on blur",
  );
  await page.evaluate(() =>
    window.axiom.request("stylesheet", {
      text: "node { size: 54px; label: none; }",
    }),
  );
  await canvas.click({ position: { x: p.x, y: p.labelY } });
  await expect(input).toHaveCount(0);
  const d = await page.evaluate(
    (iri) => window.axiom.request<any>("entityDocument", { iri }),
    a,
  );
  expect(
    d.statements.find((t: any) => t.object.value === "Accepted on blur").object
      .language,
  ).toBe("en");
});

test("property domain, range and inverse are editable in the inspector", async () => {
  const { a, b } = await prepare();
  const ids = await page.evaluate(async () => {
    const p = await window.axiom.request<string>("createProperty", {
      name: "Teaches",
      kind: "ObjectProperty",
    });
    const q = await window.axiom.request<string>("createProperty", {
      name: "Taught by",
      kind: "ObjectProperty",
    });
    await window.axiom.request("select", { iri: p });
    return { p, q };
  });
  await expect(
    fields().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Teaches");
  for (const [name, iri] of [
    ["Domain", a],
    ["Range", b],
    ["Inverse", ids.q],
  ]) {
    await fields()
      .getByRole("button", { name: "Add " + name, exact: true })
      .click();
    await fields()
      .getByRole("combobox", { name: name + " 1", exact: true })
      .selectOption(iri);
  }
  await inspector()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === ids.p)!.inverse,
    )
    .toBe(ids.q);
  const e = (await state()).entities.find((e) => e.iri === ids.p)!;
  expect(e.domain).toBe(a);
  expect(e.range).toBe(b);
  await fields()
    .getByRole("button", { name: "Remove Range 1", exact: true })
    .click();
  await inspector()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === ids.p)!.range,
    )
    .toBeUndefined();
});

test("single-click label editing also works in a detached graph", async () => {
  const { a } = await prepare();
  await menu("view.graph");
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((w) => w !== page)!;
  child.on("pageerror", (e) => errors.push(e.message));
  await expect(child.getByTestId("graph-canvas")).toBeVisible();
  await child.getByRole("button", { name: "Fit", exact: true }).click();
  await clickLabel(a, child);
  const input = child
    .locator(".graph-inline-rename")
    .getByRole("textbox", { name: "Rename entity", exact: true });
  await expect(input).toBeFocused();
  await child.keyboard.type("Detached label");
  await input.press("Enter");
  await expect(
    fields().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Detached label");
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
});

test("default identifiers follow label drafts in both editors and become stable after Apply", async () => {
  await menu("file.new");
  await expect(
    page.getByRole("button", { name: "Classes · 1", exact: true }),
  ).toBeVisible();
  const old = await page.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "New class",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  const label = fields().getByRole("textbox", {
    name: "Entity label",
    exact: true,
  });
  const name = fields().getByRole("textbox", {
    name: "Entity name",
    exact: true,
  });
  await expect(name).toHaveValue("NewClass");
  await label.fill("Alpha Beta !! Gamma");
  await expect(name).toHaveValue("AlphaBetaGamma");
  await inspector()
    .getByRole("button", { name: "Details", exact: true })
    .click();
  const details = page.getByRole("region", {
    name: "Details",
    exact: true,
  });
  await expect(
    details.getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Alpha Beta !! Gamma");
  await details
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Course Credit");
  await expect(name).toHaveValue("CourseCredit");
  await details
    .getByRole("textbox", { name: "Entity label", exact: true })
    .press("Tab");
  const next = old.replace(/NewClass$/, "CourseCredit");
  await expect.poll(async () => (await state()).selected).toBe(next);
  await expect(details).toHaveAttribute("data-entity-iri", next);
  await label.fill("Credit hours");
  await expect(name).toHaveValue("CourseCredit");
  await inspector()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === next)?.label,
    )
    .toBe("Credit hours");
  await page.screenshot({
    path: "artifacts/testing/default-name-normalization.png",
  });
});

test("a saved placeholder mismatch is recognized by its spelling and its repair is included in Save", async () => {
  const source = path.resolve("artifacts/testing/default-name.ttl");
  await writeFile(
    source,
    '<https://example.org/NewClass2> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Course Credit".',
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, source);
  await menu("file.open");
  await expect(
    fields().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Course Credit");
  await expect(
    fields().getByRole("textbox", { name: "Entity name", exact: true }),
  ).toHaveValue("CourseCredit");
  await expect(
    inspector().getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeEnabled();
  const file = path.resolve("artifacts/testing/repaired-name.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.save");
  await expect
    .poll(async () => (await state()).selected)
    .toBe("https://example.org/CourseCredit");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  const saved = await readFile(file, "utf8");
  expect(saved).toContain("https://example.org/CourseCredit");
  expect(saved).not.toContain('"https://example.org/NewClass2"');
});

test("workspace Save promotes related default nodes together and resolves a label collision", async () => {
  await menu("file.new");
  await expect(
    page.getByRole("button", { name: "Classes · 1", exact: true }),
  ).toBeVisible();
  const { a, b, existing } = await page.evaluate(async () => {
    const root = "http://www.w3.org/2002/07/owl#Thing";
    const existing = await window.axiom.request<string>("createClass", {
      name: "Course Credit",
      parent: root,
    });
    const a = await window.axiom.request<string>("createClass", {
      name: "New class",
      parent: root,
    });
    const b = await window.axiom.request<string>("createClass", {
      name: "New class 2",
      parent: a,
    });
    return { a, b, existing };
  });
  await select(a);
  await fields()
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Course Credit");
  await expect(
    fields().getByRole("textbox", { name: "Entity name", exact: true }),
  ).toHaveValue("CourseCredit2");
  await select(b);
  await fields()
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Advanced Credit");
  await expect(
    fields().getByRole("textbox", { name: "Entity name", exact: true }),
  ).toHaveValue("AdvancedCredit");
  const file = path.resolve("artifacts/testing/related-renames.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.save");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  const result = await state();
  expect(result.entities.some((e) => e.iri === a || e.iri === b)).toBe(false);
  expect(
    result.entities.find((e) => e.label === "Advanced Credit")?.parents,
  ).toEqual([existing + "2"]);
  expect(result.entities.find((e) => e.iri === existing)?.label).toBe(
    "Course Credit",
  );
  expect(result.classCount).toBe(4);
});
