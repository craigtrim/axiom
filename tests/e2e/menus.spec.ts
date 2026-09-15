import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NS, THING } from "../../src/domain/model";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";

let app: ElectronApplication,
  page: Page,
  closed = false,
  errors: string[] = [],
  expected: string[] = [],
  visited = new Set<string>();
const coverage: Record<string, string[]> = {};
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const request = (method: DomainMethod, args: Record<string, unknown> = {}) =>
  page.evaluate(({ method, args }) => window.axiom.request(method, args), {
    method,
    args,
  });
const enabled = (id: string) =>
  app.evaluate(
    ({ Menu }, id) => Menu.getApplicationMenu()!.getMenuItemById(id)?.enabled,
    id,
  );
async function menu(id: string) {
  await expect
    .poll(() => enabled(id), {
      message: "Menu command should be available: " + id,
    })
    .toBe(true);
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    // Electron's installed MenuItem wrapper receives the focused WebContents as its third argument.
    item.click({} as never, win, win.webContents as never);
  }, id);
  visited.add(id);
}
function journey(title: string, ids: string[], body: () => Promise<void>) {
  coverage[title] = ids;
  test(title, async () => {
    expected = ids;
    await body();
  });
}
async function saveTo(file: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
}
async function openFrom(file: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
}
async function createClass(name: string) {
  await menu("entity.createClass");
  const d = page.getByRole("form", { name: "Create entity" });
  await d
    .getByRole("textbox", { name: "New entity label", exact: true })
    .fill(name);
  await d.getByRole("button", { name: "Create", exact: true }).click();
  await expect(d).toHaveCount(0);
}
async function queryText(text: string) {
  await menu("view.query");
  const recover = page.locator('[data-pane-id="query"] .pane-recovery button');
  if (await recover.isVisible()) await recover.click();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
  await expect.poll(() => page.evaluate(async () => (await window.axiom.queryHistory.load()).current.text)).toBe(text);
}
test.beforeEach(async () => {
  expected = [];
  visited = new Set();
  closed = false;
  errors = [];
  await mkdir("artifacts/testing", { recursive: true });
  const userData = await mkdtemp(
    path.resolve("artifacts/testing/menu-profile-"),
  );
  const env = { ...process.env, AXIOM_USER_DATA: userData } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  app.on("window", (w) => w.on("pageerror", (e) => errors.push(e.message)));
  app.on("close", () => (closed = true));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
});
test.afterEach(async ({}, info) => {
  if (!closed) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await app.close();
  }
  expect(errors).toEqual([]);
  if (info.status === "passed")
    expect(
      expected.filter((id) => !visited.has(id)),
      "Every assigned menu command must be exercised",
    ).toEqual([]);
  await info.attach("native-menu-actions", {
    body: JSON.stringify([...visited]),
    contentType: "application/json",
  });
});

journey(
  "File creates a blank ontology, saves exact limits and reopens editable data",
  [
    "file.new",
    "file.example",
    "file.save",
    "file.saveAs",
    "file.open",
    "entity.createClass",
    "entity.createIndividual",
    "entity.rename",
    "entity.delete",
    "edit.undo",
    "edit.redo",
  ],
  async () => {
    await page
      .getByRole("textbox", { name: "Filter hierarchy" })
      .fill("NotInNextDocument");
    await menu("file.new");
    await expect.poll(async () => (await state()).classCount).toBe(1);
    expect((await state()).individualCount).toBe(0);
    await expect(
      page.getByRole("textbox", { name: "Filter hierarchy" }),
    ).toHaveValue("");
    await expect(page.getByRole("treeitem")).toHaveCount(1);
    await expect.poll(() => enabled("entity.delete")).toBe(false);
    await expect.poll(() => enabled("entity.rename")).toBe(false);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getTitle(),
        ),
      )
      .toBe("Untitled ontology | Axiom");
    await createClass("Person");
    await menu("entity.rename");
    const rename = page.getByRole("textbox", {
      name: "Rename entity",
      exact: true,
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await rename.fill("Human");
    await rename.press("Enter");
    await expect(rename).toHaveCount(0);
    expect(
      (await state()).entities.find((e) => e.iri.endsWith("#Person"))?.name,
    ).toBe("Human");
    await menu("edit.undo");
    await expect
      .poll(
        async () =>
          (await state()).entities.find((e) => e.iri.endsWith("#Person"))?.name,
      )
      .toBe("Person");
    await menu("edit.redo");
    await expect
      .poll(
        async () =>
          (await state()).entities.find((e) => e.iri.endsWith("#Person"))?.name,
      )
      .toBe("Human");
    await menu("entity.createIndividual");
    const individual = page.getByRole("form", { name: "Create entity" });
    await individual
      .getByRole("textbox", { name: "New entity label", exact: true })
      .fill("Alice");
    await individual
      .getByRole("combobox", { name: "Instance of", exact: true })
      .selectOption("http://example.org/ontology#Person");
    await individual
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(individual).toHaveCount(0);
    await expect.poll(async () => (await state()).individualCount).toBe(1);
    await expect(
      page.locator('[data-panel="individuals"] .ag-row').first(),
    ).toContainText("Alice");
    await expect.poll(() => enabled("entity.delete")).toBe(false);
    const limit = page.getByRole("spinbutton", {
      name: "Visible node limit",
      exact: true,
    });
    await limit.fill("357");
    await limit.press("Enter");
    const first = path.resolve(
        "artifacts/testing/new-" + Date.now() + ".axiom",
      ),
      second = first.replace(".axiom", "-copy.axiom");
    await saveTo(first);
    await menu("file.save");
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(first, "utf8").catch(() => "null"))?.graph
            .budget,
      )
      .toBe(357);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getTitle(),
        ),
      )
      .toBe(path.basename(first) + " | Axiom");
    await createClass("Company");
    await menu("file.save");
    await expect
      .poll(
        async () => JSON.parse(await readFile(first, "utf8")).entities.length,
      )
      .toBe(4);
    await saveTo(second);
    await menu("file.saveAs");
    await expect
      .poll(() => readFile(second, "utf8").catch(() => ""))
      .toContain('"Company"');
    await menu("file.new");
    await expect.poll(async () => (await state()).classCount).toBe(1);
    await openFrom(second);
    await menu("file.open");
    await expect.poll(async () => (await state()).classCount).toBe(3);
    await expect(limit).toHaveValue("357");
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getTitle(),
        ),
      )
      .toBe(path.basename(second) + " | Axiom");
    expect((await state()).ontology.example).toBe(false);
    await request("select", { iri: "http://example.org/ontology#Company" });
    await menu("entity.delete");
    const del = page.getByRole("dialog", { name: "Delete class" });
    await del.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(del).toHaveCount(0);
    await expect.poll(async () => (await state()).classCount).toBe(2);
    await menu("edit.undo");
    await expect.poll(async () => (await state()).classCount).toBe(3);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await menu("file.example");
    await expect.poll(async () => (await state()).classCount).toBe(95);
    await expect(
      page.getByRole("combobox", { name: "Dataset size" }),
    ).toBeEnabled();
  },
);

journey(
  "Edit operates on native text selections and opens global entity search",
  ["role.cut", "role.copy", "role.paste", "role.selectAll", "entity.search"],
  async () => {
    const input = page.getByRole("textbox", { name: "Filter hierarchy" });
    await input.click();
    await input.pressSequentially("Pizza");
    await menu("role.selectAll");
    expect(
      await input.evaluate((e) => [
        (e as HTMLInputElement).selectionStart,
        (e as HTMLInputElement).selectionEnd,
      ]),
    ).toEqual([0, 5]);
    await menu("role.copy");
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("Pizza");
    await menu("role.cut");
    await expect(input).toHaveValue("");
    await menu("role.paste");
    await expect(input).toHaveValue("Pizza");
    await menu("edit.undo");
    await expect(input).toHaveValue("");
    await menu("edit.redo");
    await expect(input).toHaveValue("Pizza");
    await queryText("SELECT ?s WHERE { ?s ?p ?o . } LIMIT 3");
    await menu("entity.search");
    const dialog = page.getByRole("dialog", { name: "Find entities" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Search entities" })
      .fill("NutTopping");
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Search entities" })
      .press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await state()).selected)
      .toBe(NS.pizza + "NutTopping");
  },
);

journey(
  "View restores all panes, resets layout and runs the command palette",
  [
    "view.hierarchy",
    "view.graph",
    "view.inspector",
    "view.individuals",
    "view.query",
    "view.source",
    "layout.reset",
    "palette",
  ],
  async () => {
    for (const id of [
      "hierarchy",
      "graph",
      "inspector",
      "individuals",
      "query",
      "source",
    ]) {
      await menu("view." + id);
      await expect(page.locator('[data-pane-id="' + id + '"]')).toBeVisible();
      await menu("pane.close");
      await expect(page.locator('[data-panel="' + id + '"]')).toHaveCount(0);
      await menu("view." + id);
      await expect(page.locator('[data-pane-id="' + id + '"]')).toBeVisible();
    }
    await menu("view.graph");
    await menu("view.inspector");
    await menu("pane.move.left");
    const inspector = page.locator('[data-panel="inspector"]'),
      graph = page.locator('[data-panel="graph"]');
    await expect
      .poll(async () => {
        const a = await inspector.boundingBox(),
          b = await graph.boundingBox();
        return !!a && !!b && a.x < b.x;
      })
      .toBe(true);
    await menu("layout.reset");
    await expect
      .poll(async () => {
        const a = await inspector.boundingBox(),
          b = await graph.boundingBox();
        return !!a && !!b && a.x > b.x;
      })
      .toBe(true);
    await menu("palette");
    await page
      .getByRole("textbox", { name: "Find a command" })
      .fill("View: Query");
    await page.getByRole("textbox", { name: "Find a command" }).press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-panel="query"]')).toBeVisible();
  },
);

journey(
  "View applies native zoom, full screen and all theme choices",
  [
    "theme.system",
    "theme.light",
    "theme.dark",
    "role.zoomIn",
    "role.zoomOut",
    "role.resetZoom",
    "role.togglefullscreen",
  ],
  async () => {
    for (const t of ["light", "dark", "system"]) {
      await menu("theme." + t);
      await expect
        .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
        .toBe(t);
      if (t !== "system")
        await expect(page.locator("html")).toHaveAttribute("data-theme", t);
      await expect
        .poll(() =>
          app.evaluate(
            ({ Menu }, t) =>
              Menu.getApplicationMenu()!.getMenuItemById("theme." + t)!.checked,
            t,
          ),
        )
        .toBe(true);
    }
    const zoom = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
      );
    await menu("role.zoomIn");
    await expect.poll(zoom).toBeGreaterThan(0);
    await menu("role.zoomOut");
    await expect.poll(zoom).toBe(0);
    await menu("role.zoomIn");
    await menu("role.resetZoom");
    await expect.poll(zoom).toBe(0);
    const fullscreen = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isFullScreen(),
      );
    await menu("role.togglefullscreen");
    await expect.poll(fullscreen).toBe(true);
    await menu("role.togglefullscreen");
    await expect.poll(fullscreen).toBe(false);
  },
);

journey(
  "Graph menus change layouts and bounded membership and export both formats",
  [
    "graph.fit",
    "graph.relayout",
    "graph.layout.auto",
    "graph.layout.force",
    "graph.layout.hierarchy",
    "graph.layout.radial",
    "graph.layout.grid",
    "graph.freeze",
    "graph.expand",
    "graph.collapse",
    "graph.pin",
    "graph.remove",
    "graph.clear",
    "graph.export.svg",
    "graph.export.png",
  ],
  async () => {
    for (const mode of ["auto", "force", "hierarchy", "radial", "grid"]) {
      await menu("graph.layout." + mode);
      await expect.poll(async () => (await state()).graph.choice).toBe(mode);
      await expect(
        page.getByRole("combobox", { name: "Graph layout" }),
      ).toHaveValue(mode);
    }
    await menu("graph.freeze");
    await expect.poll(async () => (await state()).graph.frozen).toBe(true);
    await menu("graph.freeze");
    await expect.poll(async () => (await state()).graph.frozen).toBe(false);
    const center = NS.pizza + "PizzaTopping";
    await request("seed", { iris: [center], expand: false });
    await request("select", { iri: center });
    await menu("graph.expand");
    await expect
      .poll(async () => (await state()).graph.nodes.length)
      .toBeGreaterThan(1);
    const expanded = (await state()).graph.nodes.length;
    await menu("graph.collapse");
    await expect
      .poll(async () => (await state()).graph.nodes.length)
      .toBeLessThan(expanded);
    await menu("graph.pin");
    await expect
      .poll(
        async () =>
          (await state()).graph.nodes.find((n) => n.iri === center)?.pinned,
      )
      .toBe(true);
    await menu("graph.pin");
    await expect
      .poll(
        async () =>
          (await state()).graph.nodes.find((n) => n.iri === center)?.pinned,
      )
      .toBe(false);
    await request("drag", { iri: center, x: 10000, y: 10000, dragging: false });
    await menu("graph.relayout");
    await expect
      .poll(async () =>
        Math.abs((await state()).graph.nodes.find((n) => n.iri === center)!.x),
      )
      .toBeLessThan(1000);
    const canvas = page.getByTestId("graph-canvas");
    await canvas.focus();
    await canvas.press("+");
    const camera = () =>
      page.evaluate(
        async () =>
          (await window.axiom.preferences.load()).panelState?.[
            "graph.camera"
          ] as { zoom: number } | undefined,
      );
    await expect.poll(camera).toBeTruthy();
    const zoom = (await camera())!.zoom;
    await menu("graph.fit");
    await expect.poll(async () => (await camera())?.zoom).not.toBe(zoom);
    const svg = path.resolve(
        "artifacts/testing/menu-graph-" + Date.now() + ".svg",
      ),
      png = svg.replace(".svg", ".png");
    await saveTo(svg);
    await menu("graph.export.svg");
    await page
      .getByRole("dialog", { name: "Export", exact: true })
      .getByRole("button", { name: "Export", exact: true })
      .click();
    await expect
      .poll(() => readFile(svg, "utf8").catch(() => ""))
      .toContain("Pizza ontology");
    expect(await readFile(svg, "utf8")).toContain("<svg");
    await saveTo(png);
    await menu("graph.export.png");
    await page
      .getByRole("dialog", { name: "Export", exact: true })
      .getByRole("button", { name: "Export", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await readFile(png).catch(() => Buffer.alloc(0)))
          .subarray(1, 4)
          .toString(),
      )
      .toBe("PNG");
    await menu("graph.remove");
    await expect
      .poll(async () =>
        (await state()).graph.nodes.some((n) => n.iri === center),
      )
      .toBe(false);
    await request("seed", { iris: [center] });
    await menu("graph.clear");
    await expect.poll(async () => (await state()).graph.nodes.length).toBe(0);
    for (const id of [
      "graph.expand",
      "graph.collapse",
      "graph.pin",
      "graph.remove",
      "graph.fit",
      "graph.export.svg",
    ])
      await expect.poll(() => enabled(id)).toBe(false);
  },
);

journey(
  "Window moves, groups, resizes, maximises, floats and detaches panes",
  [
    "pane.next",
    "pane.previous",
    "pane.move.left",
    "pane.move.right",
    "pane.move.top",
    "pane.move.bottom",
    "pane.group",
    "pane.wider",
    "pane.narrower",
    "pane.maximise",
    "pane.float",
    "pane.detach",
    "pane.reattach",
    "pane.close",
  ],
  async () => {
    const graph = page.locator('[data-panel="graph"]'),
      inspector = page.locator('[data-panel="inspector"]');
    await page.getByTestId("graph-canvas").focus();
    const focus = () =>
      page.evaluate(
        () =>
          document.activeElement?.closest<HTMLElement>("[data-panel]")?.dataset
            .panel,
      );
    expect(await focus()).toBe("graph");
    await menu("pane.next");
    await expect.poll(focus).not.toBe("graph");
    await menu("pane.previous");
    await expect.poll(focus).toBe("graph");
    await menu("view.inspector");
    for (const direction of ["left", "right", "top", "bottom"]) {
      await menu("pane.move." + direction);
      await expect
        .poll(async () => {
          const i = (await inspector.boundingBox())!,
            g = (await graph.boundingBox())!;
          return direction === "left"
            ? i.x < g.x
            : direction === "right"
              ? i.x > g.x
              : direction === "top"
                ? i.y < g.y
                : i.y > g.y;
        })
        .toBe(true);
    }
    // The bottom pane occupies a vertical row. Wider must change its horizontal ancestor, never its height.
    await menu("pane.move.right");
    const before = (await inspector.boundingBox())!;
    await menu("pane.wider");
    await expect
      .poll(async () => (await inspector.boundingBox())!.width)
      .toBeGreaterThan(before.width + 5);
    const wide = (await inspector.boundingBox())!;
    await menu("pane.narrower");
    await expect
      .poll(async () => (await inspector.boundingBox())!.width)
      .toBeLessThan(wide.width - 5);
    expect(
      Math.abs((await inspector.boundingBox())!.height - before.height),
    ).toBeLessThan(2);
    await menu("pane.maximise");
    await expect
      .poll(async () => (await inspector.boundingBox())!.width)
      .toBeGreaterThan(wide.width + 100);
    await menu("pane.maximise");
    await expect
      .poll(async () => (await inspector.boundingBox())!.width)
      .toBeLessThan(wide.width + 10);
    await menu("pane.group");
    await expect(inspector).toBeVisible();
    await expect(graph).not.toBeVisible();
    await expect.poll(() => enabled("pane.group")).toBe(false);
    await menu("pane.float");
    await expect(page.locator(".flexlayout__float_window")).toBeVisible();
    await menu("pane.reattach");
    await expect(page.locator(".flexlayout__float_window")).toHaveCount(0);
    await menu("view.inspector");
    await menu("pane.detach");
    await expect.poll(() => app.windows().length).toBe(2);
    const child = app.windows().find((w) => w !== page)!;
    await expect(child.locator('[data-panel="inspector"]')).toBeVisible();
    await menu("view.inspector");
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getFocusedWindow()?.webContents.getURL(),
        ),
      )
      .toContain("popout.html");
    await menu("pane.reattach");
    await expect.poll(() => app.windows().length).toBe(1);
    await expect(inspector).toBeVisible();
    await menu("view.inspector");
    await menu("pane.close");
    await expect(inspector).toHaveCount(0);
    await expect.poll(() => enabled("pane.close")).toBe(false);
  },
);

journey(
  "Query menus run, cancel and send results even after the query pane closes",
  ["query.run", "query.cancel", "query.graph"],
  async () => {
    await expect.poll(() => enabled("query.cancel")).toBe(false);
    await expect.poll(() => enabled("query.graph")).toBe(false);
    await menu("query.run");
    await expect(page.locator(".query-results-panel:visible .query-summary")).toContainText("103 displayed");
    await menu("graph.clear");
    await page.locator(".monaco-editor textarea").focus();
    await menu("pane.close");
    await menu("query.graph");
    await expect
      .poll(async () => (await state()).graph.nodes.length)
      .toBeGreaterThan(0);
    await page
      .getByRole("combobox", { name: "Dataset size" })
      .selectOption("100000");
    await page
      .getByRole("dialog", { name: "Regenerate dataset" })
      .getByRole("button", { name: "Regenerate", exact: true })
      .click();
    await expect.poll(async () => (await state()).orderCount).toBe(100000);
    await expect.poll(() => enabled("query.graph")).toBe(false);
    await queryText(
      "SELECT ?s ?p ?o ?other WHERE { ?s ?p ?o . ?other ?p ?o . }",
    );
    await menu("query.run");
    await menu("query.cancel");
    await expect(page.locator(".query-error")).toContainText("cancelled");
    await expect.poll(() => enabled("query.cancel")).toBe(false);
    await queryText("SELECT ?s WHERE { ?s a <" + NS.owl + "Class> . } LIMIT 5");
    await menu("query.run");
    await expect(page.locator(".query-results-panel:visible .query-summary")).toContainText("5 displayed");
    await menu("query.graph");
    expect((await state()).graph.nodes.length).toBeLessThanOrEqual(
      (await state()).graph.budget,
    );
  },
);

journey(
  "Help opens shortcuts and About and File Exit closes the application",
  ["help.shortcuts", "help.about", "app.quit"],
  async () => {
    await menu("help.shortcuts");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toContainText("Ctrl+N");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async (
        _w,
        options?: Electron.MessageBoxOptions,
      ) => {
        (globalThis as any).aboutOptions = options;
        return { response: 0, checkboxChecked: false };
      };
    });
    await menu("help.about");
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).aboutOptions?.message))
      .toBe("Axiom Ontology Workbench");
    expect(
      await app.evaluate(() => (globalThis as any).aboutOptions?.detail),
    ).toContain("Version ");
    const finished = app.waitForEvent("close");
    await menu("app.quit");
    await finished;
  },
);

test("file cancellation and malformed input preserve the current ontology", async () => {
  await createClass("MustKeep");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 2,
      checkboxChecked: false,
    });
  });
  await menu("file.new");
  expect((await state()).classCount).toBe(96);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
  });
  await menu("file.new");
  expect((await state()).classCount).toBe(96);
  expect((await state()).dirty).toBe(true);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (
      _w,
      options?: Electron.MessageBoxOptions,
    ) => {
      (globalThis as any).lastMessage = options;
      return { response: 1, checkboxChecked: false };
    };
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await menu("file.open");
  expect((await state()).classCount).toBe(96);
  const bad = path.resolve(
    "artifacts/testing/invalid-" + Date.now() + ".axiom",
  );
  await writeFile(bad, "{}");
  await openFrom(bad);
  await menu("file.open");
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).lastMessage?.type))
    .toBe("error");
  expect((await state()).classCount).toBe(96);
  expect((await state()).dirty).toBe(true);
});

test("graph commands operate in a detached window and reopen a closed graph", async () => {
  await page.getByTestId("graph-canvas").focus();
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const child = app.windows().find((w) => w !== page)!;
  await expect(child.getByTestId("graph-canvas")).toBeVisible();
  await menu("graph.layout.grid");
  await expect.poll(async () => (await state()).graph.choice).toBe("grid");
  await expect(
    child.getByRole("combobox", { name: "Graph layout" }),
  ).toHaveValue("grid");
  await menu("graph.clear");
  await expect(
    child.getByText("The graph is empty", { exact: true }),
  ).toBeVisible();
  await child.getByRole("button", { name: "Show Pizza", exact: true }).click();
  await menu("graph.fit");
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await menu("view.graph");
  await menu("pane.close");
  await menu("graph.layout.radial");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await expect.poll(async () => (await state()).graph.choice).toBe("radial");
});

test("every native menu entry has an assigned outcome test", async () => {
  const entries = await app.evaluate(({ Menu }) => {
    const walk = (
      items: Electron.MenuItem[],
      parents: string[] = [],
    ): { id: string; path: string }[] =>
      items.flatMap((i) =>
        i.type === "separator"
          ? []
          : i.submenu
            ? walk(i.submenu.items, [...parents, i.label.replaceAll("&", "")])
            : [{ id: i.id, path: [...parents, i.label].join(" > ") }],
      );
    return walk(Menu.getApplicationMenu()!.items);
  });
  const assigned = new Set(Object.values(coverage).flat());
  expect(entries.every((e) => !!e.id)).toBe(true);
  expect(entries.map((e) => e.id).sort()).toEqual([...assigned].sort());
  await writeFile(
    "artifacts/testing/native-menu-coverage.json",
    JSON.stringify(
      {
        entries: entries.map((e) => ({
          ...e,
          journey: Object.entries(coverage).find(([, ids]) =>
            ids.includes(e.id),
          )![0],
        })),
      },
      null,
      2,
    ),
  );
});

test("a new ontology runs its own query and keeps Monaco menu Undo and Redo local", async () => {
  await menu("file.new");
  await expect.poll(async () => (await state()).classCount).toBe(1);
  await createClass("Person");
  await menu("entity.createIndividual");
  const dialog = page.getByRole("form", { name: "Create entity" });
  await dialog
    .getByRole("textbox", { name: "New entity label", exact: true })
    .fill("Alice");
  await dialog
    .getByRole("combobox", { name: "Instance of", exact: true })
    .selectOption("http://example.org/ontology#Person");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await menu("query.run");
  await expect(page.locator(".query-results-panel:visible .query-summary")).toContainText("6 displayed");
  await expect(
    page.getByRole("combobox", { name: "Example query" }),
  ).toBeDisabled();
  await queryText(
    "SELECT ?s WHERE { ?s a <http://example.org/ontology#Person> . }",
  );
  await menu("query.run");
  await expect(page.locator(".query-results-panel:visible .query-summary")).toContainText("1 displayed");
  await expect(page.locator(".query-results-panel:visible .query-results")).toContainText("Alice");
  await page.locator(".monaco-editor textarea").focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" LIMIT 1");
  await menu("edit.undo");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        String(
          (await window.axiom.preferences.load()).panelState?.["query.text"],
        ),
      ),
    )
    .not.toContain("LIMIT 1");
  await menu("edit.redo");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        String(
          (await window.axiom.preferences.load()).panelState?.["query.text"],
        ),
      ),
    )
    .toContain("LIMIT 1");
  expect((await state()).individualCount).toBe(1);
  expect((await state()).classCount).toBe(2);
  await menu("query.graph");
  await expect
    .poll(async () => (await state()).graph.nodes.map((n) => n.iri))
    .toEqual(["http://example.org/ontology#Alice"]);
  await page.screenshot({ path: "artifacts/testing/new-ontology.png" });
});

test("View reveals panes behind a maximised pane and reset returns detached windows", async () => {
  await menu("view.inspector");
  await menu("pane.maximise");
  await menu("graph.fit");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await menu("view.query");
  await expect(page.locator(".monaco-editor textarea")).toBeVisible();
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  await menu("layout.reset");
  await expect.poll(() => app.windows().length).toBe(1);
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await menu("view.query");
  await expect(page.locator(".monaco-editor textarea")).toBeVisible();
});
test("New Workspace cancels an active query and clears old results", async () => {
  await queryText("SELECT ?s ?p ?o ?other WHERE { ?s ?p ?o . ?other ?p ?o . }");
  await menu("query.run");
  await expect.poll(() => enabled("query.cancel")).toBe(true);
  await menu("file.new");
  await expect.poll(async () => (await state()).classCount).toBe(1);
  await menu("view.query");
  await expect(page.locator(".query-error")).toHaveCount(0);
  await expect.poll(() => enabled("query.cancel")).toBe(false);
  await expect.poll(() => enabled("query.graph")).toBe(false);
  await menu("query.run");
  await expect(page.locator(".query-results-panel:visible .query-summary")).toContainText("1 displayed");
  await expect(page.locator(".query-error")).toHaveCount(0);
});

journey(
  "Additional graph layouts finish off-thread, honor pins and can be cancelled",
  [
    "graph.layout.circle",
    "graph.layout.elk-layered",
    "graph.layout.elk-stress",
    "graph.layout.elk-tree",
    "graph.cancelLayout",
  ],
  async () => {
    await request("seed", { iris: [NS.pizza + "Pizza"], expand: false });
    await request("expand", { iri: NS.pizza + "Pizza" });
    await request("pin", { iri: NS.pizza + "Pizza" });
    const before = (await state()).graph.nodes.find(
      (n) => n.iri === NS.pizza + "Pizza",
    )!;
    for (const mode of ["circle", "elk-layered", "elk-stress", "elk-tree"]) {
      await menu("graph.layout." + mode);
      await expect
        .poll(
          async () => {
            const g = (await state()).graph;
            return g.choice === mode && !g.layoutPending;
          },
          { timeout: 25000 },
        )
        .toBe(true);
      const s = await state();
      expect(s.message).not.toMatch(/error|timed out|unsupported/i);
      expect(
        s.graph.nodes.every(
          (n) => Number.isFinite(n.x) && Number.isFinite(n.y),
        ),
      ).toBe(true);
      expect(s.graph.nodes.find((n) => n.iri === before.iri)).toMatchObject({
        x: before.x,
        y: before.y,
        pinned: true,
      });
      expect(s.graph.nodes.length).toBeLessThanOrEqual(s.graph.budget);
    }
    await request("layout", { mode: "grid" });
    await request("tableGraph");
    await menu("graph.layout.elk-stress");
    await menu("graph.cancelLayout");
    await expect
      .poll(async () => (await state()).graph.layoutPending)
      .toBe(false);
    expect((await state()).graph.nodes.length).toBeLessThanOrEqual(1000);
  },
);
journey(
  "Graph stylesheet validates, renders in exports, undoes and survives a saved workspace",
  ["graph.styles"],
  async () => {
    await menu("graph.styles");
    const d = page.getByRole("dialog", { name: "Graph stylesheet" }),
      input = d.getByRole("textbox", { name: "Graph stylesheet" });
    await input.fill("node { size: 900px; }");
    await d.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(d.getByRole("alert")).toContainText("size");
    expect((await state()).graph.stylesheet).toBe("");
    const css =
      "node.Class {fill:#bada55;shape:hexagon;size:42px;} edge {stroke:#aa1122;stroke-width:2px;}";
    await input.fill(css);
    await d.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(d).toHaveCount(0);
    expect((await state()).graph.stylesheet).toBe(css);
    await menu("edit.undo");
    await expect.poll(async () => (await state()).graph.stylesheet).toBe("");
    await menu("edit.redo");
    await expect.poll(async () => (await state()).graph.stylesheet).toBe(css);
    const svg = path.resolve("artifacts/testing/styled.svg");
    await saveTo(svg);
    await menu("graph.export.svg");
    await expect
      .poll(async () => {
        try {
          return await readFile(svg, "utf8");
        } catch {
          return "";
        }
      })
      .toContain("#bada55");
    const file = path.resolve("artifacts/testing/styled.axiom");
    await saveTo(file);
    await menu("file.saveAs");
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(file, "utf8")).graph.stylesheet;
        } catch {
          return "";
        }
      })
      .toBe(css);
    await request("stylesheet", { text: "" });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await openFrom(file);
    await menu("file.open");
    await expect.poll(async () => (await state()).graph.stylesheet).toBe(css);
  },
);
journey(
  "Workbench arrangements adapt to widescreen and preserve manual layouts",
  ["arrangement.auto", "arrangement.standard", "arrangement.wide"],
  async () => {
    await menu("arrangement.standard");
    await expect(page.locator("main")).toHaveAttribute(
      "data-arrangement",
      "standard",
    );
    await menu("arrangement.wide");
    await expect(page.locator("main")).toHaveAttribute(
      "data-arrangement",
      "wide",
    );
    const a = await page.locator(".individuals-mode").boundingBox(),
      b = await page.locator('[data-panel="query"]').boundingBox();
    expect(b!.x).toBeGreaterThan(a!.x);
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(10);
    await page.getByTestId("graph-canvas").focus();
    await menu("edit.undo");
    await expect(page.locator("main")).toHaveAttribute(
      "data-arrangement",
      "standard",
    );
    await menu("arrangement.auto");
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.unmaximize();
      w.setBounds({ x: 0, y: 0, width: 2000, height: 1000 });
    });
    await expect(page.locator("main")).toHaveAttribute(
      "data-arrangement",
      "wide",
    );
    await menu("view.inspector");
    await menu("pane.move.left");
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.axiom.preferences.load()))
            .arrangement,
      )
      .toBe("custom");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1300, height: 1000 }),
    );
    await expect(page.locator("main")).toHaveAttribute(
      "data-arrangement",
      "wide",
    );
    await menu("arrangement.auto");
    await expect(page.locator("main")).toHaveAttribute(
      "data-arrangement",
      "standard",
    );
  },
);
journey(
  "Research reviews contextual results, opens sources and applies one undoable batch",
  [
    "research.open",
    "view.research",
    "research.run",
    "research.cancel",
    "research.refresh",
    "research.source.wikipedia",
    "research.source.dbpedia",
    "research.source.ontologies",
    "research.source.web",
  ],
  async () => {
    await menu("file.new");
    await expect.poll(async () => (await state()).classCount).toBe(1);
    await createClass("Person");
    await app.evaluate(({ ipcMain, shell }) => {
      ipcMain.removeHandler("research:assistants");
      ipcMain.handle("research:assistants", () => [
        { id: "codex", name: "Codex", available: true },
        { id: "claude", name: "Claude", available: true },
      ]);
      (globalThis as any).researchInputs = [];
      (globalThis as any).openedSources = [];
      shell.openExternal = async (url: string) => {
        (globalThis as any).openedSources.push(url);
      };
      ipcMain.removeHandler("research:run");
      ipcMain.handle("research:run", (_event, input) => {
        (globalThis as any).researchInputs.push(input);
        return {
          provider: input.provider,
          completedAt: new Date().toISOString(),
          context: {
            datasetEpoch: input.datasetEpoch,
            version: input.version,
            entity: { iri: input.iri, name: "Person" },
          },
          result: {
            summary: "A person in this ontology is a kind of Thing.",
            sources: [
              {
                title: "Wikipedia Person",
                url: "https://en.wikipedia.org/wiki/Person",
              },
            ],
            suggestions: [
              {
                kind: "synonym",
                name: "Human being",
                description: "An alternative label.",
                sourceUrl: "",
              },
              {
                kind: "subclass",
                name: "Employee",
                description: "An employed person.",
                sourceUrl: "",
              },
              {
                kind: "individual",
                name: "Alice",
                description: "Illustrative instance.",
                sourceUrl: "",
              },
            ],
          },
        };
      });
    });
    await menu("research.open");
    const pane = page.getByRole("region", { name: "Ontology research" });
    await expect(pane).toBeVisible();
    await menu("view.research");
    await menu("research.refresh");
    await pane.getByRole("button", { name: "Options", exact: true }).click();
    await pane
      .getByRole("combobox", { name: "Research prompt template" })
      .selectOption("subclasses");
    await pane
      .getByRole("textbox", { name: "Research instructions" })
      .fill("Suggest subclasses suited to this ontology.");
    await pane.locator("#research-options")
      .getByText("Preview prompt and ontology context", { exact: true })
      .click();
    await expect(pane.locator(".research-context")).toContainText("Thing");
    await expect(pane.locator(".research-context")).toContainText("Person");
    for (const id of ["wikipedia", "dbpedia", "ontologies", "web"])
      await menu("research.source." + id);
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).openedSources.length))
      .toBe(4);
    await menu("research.run");
    const resultsButton = pane.getByRole("button", { name: "Results", exact: true });
    if (await resultsButton.isVisible()) await resultsButton.click();
    await expect(pane.locator(".research-summary")).toContainText(
      "kind of Thing",
    );
    expect((await state()).classCount).toBe(2);
    await pane.getByRole("checkbox", { name: "Accept Employee" }).check();
    await pane.getByRole("checkbox", { name: "Accept Human being" }).check();
    await pane.getByRole("checkbox", { name: "Accept Alice" }).check();
    await pane
      .getByRole("button", {
        name: "Apply selected suggestions (3)",
        exact: true,
      })
      .click();
    await expect.poll(async () => (await state()).classCount).toBe(3);
    expect((await state()).individualCount).toBe(1);
    await page.getByTestId("graph-canvas").focus();
    await menu("edit.undo");
    await expect.poll(async () => (await state()).classCount).toBe(2);
    expect((await state()).individualCount).toBe(0);
    await menu("edit.redo");
    await expect.poll(async () => (await state()).classCount).toBe(3);
    expect((await state()).individualCount).toBe(1);
    const inputs = await app.evaluate(() => (globalThis as any).researchInputs);
    await menu("research.cancel");
    await expect(page.locator(".status-message")).toContainText("cancellation");
    expect(inputs[0].instructions).toContain("suited to this ontology");
    expect(inputs[0].iri).toBe("http://example.org/ontology#Person");
    await page.screenshot({ path: "artifacts/testing/research-pane.png" });
  },
);
test("taxonomy double-click expands only the branch and every node exposes a keyboard context menu", async () => {
  const root = page.getByRole("treeitem").first(),
    before = (await state()).graph.nodes.map((n) => n.iri);
  const expanded = await root.getAttribute("aria-expanded");
  await root.dblclick();
  await expect(root).toHaveAttribute(
    "aria-expanded",
    expanded === "true" ? "false" : "true",
  );
  expect((await state()).graph.nodes.map((n) => n.iri)).toEqual(before);
  await root.focus();
  await page.keyboard.press("Control+Z");
  await expect(root).toHaveAttribute("aria-expanded", expanded!);
  await root.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Research..." }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Filter hierarchy" })
    .fill("NutTopping");
  const leaf = page
    .getByRole("treeitem")
    .filter({ hasText: "Nut Topping" })
    .last();
  await leaf.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Copy IRI" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill("");
  await page.getByRole("button", { name: /Properties/ }).click();
  const property = page.getByRole("treeitem").first();
  await property.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Show in graph" }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
});
test("graph changes undo in order including expansion, one drag gesture, styles, limits and saved state", async () => {
  await request("layout", { mode: "grid" });
  await request("seed", { iris: [NS.pizza + "Pizza"], expand: false });
  const before = (await state()).graph.nodes;
  await request("expand", { iri: NS.pizza + "Pizza" });
  const count = (await state()).graph.nodes.length;
  expect(count).toBeGreaterThan(before.length);
  await request("undo");
  expect((await state()).graph.nodes).toEqual(before);
  await request("redo");
  expect((await state()).graph.nodes.length).toBe(count);
  const n = (await state()).graph.nodes[0];
  await request("drag", { iri: n.iri, x: 123, y: 234, dragging: true });
  await request("drag", { iri: n.iri, x: 345, y: 456, dragging: true });
  await request("drag", { iri: n.iri, x: 567, y: 678, dragging: false });
  expect((await state()).undoLabel).toBe("Move node");
  await request("undo");
  expect(
    (await state()).graph.nodes.find((v) => v.iri === n.iri),
  ).toMatchObject({ x: n.x, y: n.y });
  await request("redo");
  expect(
    (await state()).graph.nodes.find((v) => v.iri === n.iri),
  ).toMatchObject({ x: 567, y: 678 });
  await request("budget", { value: 357 });
  await request("stylesheet", { text: "node {fill:#112233}" });
  await request("clear");
  expect((await state()).graph.nodes).toHaveLength(0);
  await request("undo");
  expect((await state()).graph.nodes.length).toBe(count);
  await request("undo");
  expect((await state()).graph.stylesheet).toBe("");
  await request("undo");
  expect((await state()).graph.budget).toBe(1000);
});

test("pointer moves and camera gestures each undo without undoing ontology edits", async () => {
  await request("layout", { mode: "grid" });
  await request("seed", { iris: [NS.pizza + "Pizza"], expand: false });
  await menu("graph.fit");
  const canvas = page.getByTestId("graph-canvas");
  await expect
    .poll(
      async () =>
        !!(await page.evaluate(() => window.axiom.preferences.load()))
          .panelState?.["graph.camera"],
    )
    .toBe(true);
  const camera = () =>
    page.evaluate(
      async () =>
        (await window.axiom.preferences.load()).panelState?.[
          "graph.camera"
        ] as { x: number; y: number; zoom: number },
    );
  const n = (await state()).graph.nodes[0],
    c = await camera(),
    box = (await canvas.boundingBox())!;
  const x = box.x + n.x * c.zoom + c.x,
    y = box.y + n.y * c.zoom + c.y;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await state()).undoLabel).toBe("Move node");
  await canvas.focus();
  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => {
      const p = (await state()).graph.nodes[0];
      return [p.x, p.y];
    })
    .toEqual([n.x, n.y]);
  const before = await camera();
  await canvas.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await camera()).zoom).not.toBe(before.zoom);
  await canvas.focus();
  await page.keyboard.press("Control+Z");
  await expect.poll(camera).toEqual(before);
  await menu("graph.fit");
  await expect(canvas).toBeVisible();
  expect((await state()).classCount).toBe(95);
});
test("stale and invalid research batches cannot partially change the ontology", async () => {
  await menu("file.new");
  await expect.poll(async () => (await state()).classCount).toBe(1);
  await createClass("Person");
  const initial = await state(),
    iri = initial.selected!;
  await request("createClass", { name: "Company", parent: THING });
  const error = await page.evaluate(
    async (a) => {
      try {
        await window.axiom.request("applySuggestions", a);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    },
    {
      iri,
      datasetEpoch: initial.datasetEpoch,
      version: initial.version,
      suggestions: [
        { kind: "synonym", name: "Human", description: "", sourceUrl: "" },
      ],
    },
  );
  expect(error).toContain("changed since this research");
  const now = await state();
  const invalid = await page.evaluate(
    async (a) => {
      try {
        await window.axiom.request("applySuggestions", a);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    },
    {
      iri,
      datasetEpoch: now.datasetEpoch,
      version: now.version,
      suggestions: [
        { kind: "synonym", name: "Human", description: "", sourceUrl: "" },
        { kind: "subclass", name: "Company", description: "", sourceUrl: "" },
      ],
    },
  );
  expect(invalid).toContain("already exists");
  expect((await state()).version).toBe(now.version);
  const inspector = (await request("inspector", { iri })) as {
    values: { predicate: string }[];
  };
  expect(inspector.values.some((v) => v.predicate.endsWith("altLabel"))).toBe(
    false,
  );
});
test("a styled 3000-node graph stays bounded and the renderer answers during ELK work", async () => {
  await request("layout", { mode: "grid" });
  await request("budget", { value: 3000 });
  await request("tableGraph");
  await request("stylesheet", {
    text: "node.Individual {fill:#229977;shape:circle;size:16px} node:selected {stroke:#ee9933;stroke-width:2px}",
  });
  await menu("graph.fit");
  const canvas = page.getByTestId("graph-canvas");
  await expect
    .poll(async () => +((await canvas.getAttribute("data-draws")) ?? 0))
    .toBeGreaterThan(0);
  expect((await state()).graph.nodes.length).toBe(3000);
  await request("layout", { mode: "elk-stress" });
  const started = Date.now();
  await page.getByRole("textbox", { name: "Filter hierarchy" }).fill("Pizza");
  await expect(
    page.getByRole("textbox", { name: "Filter hierarchy" }),
  ).toHaveValue("Pizza");
  const inputMs = Date.now() - started;
  expect(inputMs).toBeLessThan(2000);
  await request("cancelLayout");
  expect((await state()).graph.nodes.length).toBe(3000);
  const warm = await canvas.evaluate(async (el) => {
    const c = el as HTMLCanvasElement,
      samples: number[] = [];
    const listener = (e: Event) =>
      samples.push((e as CustomEvent).detail.milliseconds);
    c.addEventListener("axiom:frame", listener);
    for (let i = 0; i < 150; i++) {
      c.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: i % 2 ? 1 : -1,
          clientX: c.getBoundingClientRect().x + 100,
          clientY: c.getBoundingClientRect().y + 100,
          bubbles: true,
        }),
      );
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    c.removeEventListener("axiom:frame", listener);
    const measured = samples.slice(30).sort((a, b) => a - b);
    return {
      samples: measured.length,
      p95: measured[Math.floor(measured.length * 0.95)] ?? 0,
    };
  });
  expect(warm.samples).toBeGreaterThan(50);
  await writeFile(
    "artifacts/testing/styled-graph-performance.json",
    JSON.stringify(
      {
        nodes: 3000,
        inputWhileLayoutMs: inputMs,
        warmDrawSubmissionP95Ms: warm.p95,
        warmDrawSamples: warm.samples,
        note: "Diagnostic on development host; not a minimum-hardware frame-time certification.",
      },
      null,
      2,
    ),
  );
});

journey(
  "Keyboard settings and graph navigation menus act on the current pane",
  [
    "keyboard.settings",
    "entity.showGraph",
    "pane.nextTab",
    "pane.previousTab",
    "graph.pan.left",
    "graph.pan.right",
    "graph.pan.up",
    "graph.pan.down",
    "graph.zoom.in",
    "graph.zoom.out",
  ],
  async () => {
    await menu("keyboard.settings");
    await expect(
      page.getByRole("dialog", { name: "Customize keyboard shortcuts" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await request("select", { iri: NS.pizza + "PizzaTopping" });
    await menu("entity.showGraph");
    await expect
      .poll(async () =>
        (await state()).graph.nodes.some(
          (n) => n.iri === NS.pizza + "PizzaTopping",
        ),
      )
      .toBe(true);
    await menu("view.inspector");
    await menu("pane.nextTab");
    await expect(page.locator('[data-panel="research"]')).toBeVisible();
    await menu("pane.previousTab");
    await expect(page.locator('[data-panel="inspector"]')).toBeVisible();
    await menu("view.graph");
    const camera = () =>
      page.evaluate(
        async () =>
          (await window.axiom.preferences.load()).panelState?.[
            "graph.camera"
          ] as { x: number; y: number; zoom: number },
      );
    await menu("graph.fit");
    await page.waitForTimeout(350);
    await expect.poll(async () => !!(await camera())).toBe(true);
    for (const [direction, axis, delta] of [
      ["left", "x", 40],
      ["right", "x", -40],
      ["up", "y", 40],
      ["down", "y", -40],
    ] as const) {
      const before = await camera();
      await menu("graph.pan." + direction);
      await expect
        .poll(async () => (await camera())[axis])
        .toBeCloseTo(before[axis] + delta, 4);
    }
    const before = await camera();
    await menu("graph.zoom.in");
    await expect
      .poll(async () => (await camera()).zoom)
      .toBeCloseTo(before.zoom * 1.2, 4);
    await menu("graph.zoom.out");
    await expect
      .poll(async () => (await camera()).zoom)
      .toBeCloseTo(before.zoom, 4);
  },
);

test("inline hierarchy rename validates, cancels and saves without changing the branch", async () => {
  const iri = NS.pizza + "NamedPizza";
  const row = page
    .locator('[data-panel="hierarchy"] [data-rename-iri="' + iri + '"]')
    .locator("..");
  await row.click();
  const expanded = await row.getAttribute("aria-expanded");
  await page.keyboard.press("F2");
  const input = row.getByRole("textbox", {
    name: "Rename entity",
    exact: true,
  });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("NamedPizza");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await input.evaluate((e) => [
      (e as HTMLInputElement).selectionStart,
      (e as HTMLInputElement).selectionEnd,
    ]),
  ).toEqual([0, 10]);
  await input.fill("");
  await input.press("Enter");
  await expect(row.getByRole("alert")).toContainText("required");
  await expect(input).toBeFocused();
  expect(await row.getAttribute("aria-expanded")).toBe(expanded);
  await input.fill("Cancelled label with spaces");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(row).toBeFocused();
  expect((await state()).entities.find((e) => e.iri === iri)!.name).toBe(
    "NamedPizza",
  );
  await page.keyboard.press("F2");
  await input.fill("KeyboardNamedPizza");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === iri)!.name)
    .toBe("KeyboardNamedPizza");
  await expect(row).toBeFocused();
  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === iri)!.name)
    .toBe("NamedPizza");
  await page.keyboard.press("Control+Y");
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === iri)!.name)
    .toBe("KeyboardNamedPizza");
  await page.keyboard.press("F2");
  await input.fill("BlurSavedPizza");
  const filter = page.getByRole("textbox", { name: "Filter hierarchy" });
  await filter.click();
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === iri)!.name)
    .toBe("BlurSavedPizza");
  await expect(filter).toBeFocused();
  await row.click();
  await page.keyboard.press("F2");
  await page.screenshot({
    path: "artifacts/testing/inline-rename-hierarchy.png",
  });
  await input.press("Escape");
});

test("context Rename stays in the hierarchy and supports remapped keys and properties", async () => {
  const iri = NS.pizza + "NamedPizza",
    label = page.locator(
      '[data-panel="hierarchy"] [data-rename-iri="' + iri + '"]',
    ),
    row = label.locator("..");
  await page.getByTestId("graph-canvas").focus();
  await row.click({ button: "right" });
  await page
    .getByRole("menu", { name: "Entity actions" })
    .getByRole("menuitem", { name: "Rename", exact: true })
    .click();
  const input = row.getByRole("textbox", {
    name: "Rename entity",
    exact: true,
  });
  await expect(input).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await input.press("Escape");
  await page.evaluate(() =>
    window.axiom.keyboard.save({
      version: 1,
      bindings: { "entity.rename": [{ keys: "Ctrl+Shift+B", scope: "app" }] },
      accessKeys: {},
    }),
  );
  await row.focus();
  await page.keyboard.press("F2");
  await expect(input).toHaveCount(0);
  await page.keyboard.press("Control+Shift+b");
  await expect(input).toBeFocused();
  await input.press("Escape");
  const property = (await state()).entities.find((e) =>
    e.kind.endsWith("Property"),
  )!;
  await page.getByRole("button", { name: /^Properties ·/ }).click();
  const propertyRow = page
    .locator(
      '[data-panel="hierarchy"] [data-rename-iri="' + property.iri + '"]',
    )
    .locator("..");
  await propertyRow.click();
  await page.keyboard.press("Control+Shift+b");
  const propInput = propertyRow.getByRole("textbox", {
    name: "Rename entity",
    exact: true,
  });
  await expect(propInput).toHaveValue(property.name);
  await propInput.fill("renamedProperty");
  await propInput.press("Enter");
  await expect
    .poll(
      async () =>
        (await state()).entities.find((e) => e.iri === property.iri)!.name,
    )
    .toBe("renamedProperty");
});

test("graph rename edits the selected node label and Enter does not expand the graph", async () => {
  const iri = NS.pizza + "Pizza";
  await request("seed", { iris: [iri], expand: false });
  await request("select", { iri });
  await menu("view.graph");
  await menu("graph.fit");
  const canvas = page.getByTestId("graph-canvas");
  await canvas.focus();
  await page.keyboard.press("F2");
  const input = page
    .locator(".graph-inline-rename")
    .getByRole("textbox", { name: "Rename entity", exact: true });
  await expect(input).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const c = (await canvas.boundingBox())!,
    r = (await input.boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(c.x);
  expect(r.x + r.width).toBeLessThanOrEqual(c.x + c.width);
  expect(r.y).toBeGreaterThanOrEqual(c.y);
  await input.fill("DiagramPizza");
  await page.screenshot({ path: "artifacts/testing/inline-rename-graph.png" });
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === iri)!.name)
    .toBe("DiagramPizza");
  expect((await state()).graph.nodes).toHaveLength(1);
  expect((await state()).graph.nodes[0].label).toContain("Diagram");
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Graph node actions" })
    .getByRole("menuitem", { name: "Rename", exact: true })
    .click();
  await expect(input).toBeFocused();
  await input.press("Escape");
  await page.keyboard.press("Control+Z");
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === iri)!.name)
    .toBe("Pizza");
});

test("individual names edit inside the table and workspace replacement cancels drafts", async () => {
  await menu("file.new");
  await expect.poll(async () => (await state()).classCount).toBe(1);
  await request("createClass", { name: "Person", parent: THING });
  const type = (await state()).selected!;
  await request("createIndividual", { name: "Alice", type });
  const iri = (await state()).selected!;
  await menu("view.individuals");
  await page
    .locator('[data-panel="individuals"]')
    .getByRole("button", { name: "Alice", exact: true })
    .click();
  await page.keyboard.press("F2");
  const input = page
    .locator('[data-panel="individuals"]')
    .getByRole("textbox", { name: "Rename entity", exact: true });
  await expect(input).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await input.fill("Alicia");
  await input.press("Enter");
  await expect
    .poll(async () => (await state()).entities.find((e) => e.iri === iri)!.name)
    .toBe("Alicia");
  await expect(input).toHaveCount(0);
  await page
    .locator('[data-panel="individuals"]')
    .getByRole("button", { name: "Alicia", exact: true })
    .click();
  await page.keyboard.press("F2");
  await input.fill("UnsavedName");
  const epoch = (await state()).datasetEpoch;
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await menu("file.new");
  await expect.poll(async () => (await state()).datasetEpoch).not.toBe(epoch);
  await expect(input).toHaveCount(0);
  await request("createClass", { name: "Person", parent: THING });
  const error = await page.evaluate(
    async (args) => {
      try {
        await window.axiom.request("rename", args);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    },
    { iri: type, name: "StaleName", datasetEpoch: epoch },
  );
  expect(error).toContain("workspace changed");
  expect((await state()).entities.find((e) => e.iri === type)!.name).toBe(
    "Person",
  );
});

journey(
  "RDF files, detailed entity editing and provenance have working menu routes",
  [
    "file.import",
    "file.exportOntology",
    "file.close",
    "file.provenance",
    "entity.edit",
    "entity.createProperty",
    "graph.create",
    "graph.export",
  ],
  async () => {
    await openFrom(path.resolve("tests/fixtures/ontologies/prov.rdf"));
    const source = JSON.parse(
      await readFile("tests/fixtures/ontologies/manifest.json", "utf8"),
    ).find((f: any) => f.id === "prov");
    await openFrom(path.resolve("tests/fixtures/ontologies", source.file));
    await menu("file.import");
    await expect
      .poll(async () => (await state()).ontology.source?.fileName)
      .toBe(source.file);
    const output = path.resolve("artifacts/testing/menu-ontology.ttl");
    await saveTo(output);
    await menu("file.exportOntology");
    await expect
      .poll(async () => readFile(output, "utf8").catch(() => ""))
      .toContain("http://www.w3.org/ns/prov#");
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await menu("file.close");
    await expect.poll(async () => (await state()).classCount).toBe(1);
    await menu("entity.createProperty");
    const form = page.getByRole("form", { name: "Create entity" });
    await form
      .getByRole("textbox", { name: "New entity label" })
      .fill("has course credit");
    await form.getByRole("button", { name: "Create", exact: true }).click();
    await expect(form).toHaveCount(0);
    await menu("entity.edit");
    await expect(
      page.getByRole("region", { name: "Entity details" }),
    ).toBeVisible();
    await menu("graph.create");
    const create = page
      .locator(".graph-create")
      .getByRole("form", { name: "Create entity" });
    await expect(create).toBeVisible();
    await create.getByRole("button", { name: "Cancel", exact: true }).click();
    await menu("graph.export");
    const d = page.getByRole("dialog", { name: "Export", exact: true });
    await expect(d).toBeVisible();
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    await menu("file.provenance");
    await expect(
      page.getByRole("region", { name: "Filesystem provenance" }),
    ).toBeVisible();
  },
);

journey(
  "edge menu commands select, inspect, reroute and remove relationships",
  ["edge.edit", "edge.next", "edge.previous", "edge.remove", "edge.resetRoute"],
  async () => {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await menu("file.new");
    await request("createClass", {
      name: "Edge menu child",
      parent: THING,
      position: { x: 100, y: 0 },
    });
    await menu("edge.next");
    const canvas = page.getByTestId("graph-canvas");
    await expect
      .poll(async () => !!(await state()).graph.selectedEdge)
      .toBe(true);
    const key = (await state()).graph.selectedEdge!;
    await menu("edge.previous");
    await expect(canvas).toHaveAttribute("data-selected-edge", key);
    await menu("edge.edit");
    await expect(
      page.getByRole("region", { name: "Edge inspector" }),
    ).toBeVisible();
    await request("routeEdge", {
      key,
      bend: { x: 40, y: 80 },
      datasetEpoch: (await state()).datasetEpoch,
    });
    await menu("edge.resetRoute");
    await expect
      .poll(async () => (await state()).graph.edges[0].bend)
      .toBeUndefined();
    const count = (await state()).classCount;
    await menu("edge.remove");
    await expect.poll(async () => (await state()).graph.edges.length).toBe(0);
    expect((await state()).classCount).toBe(count);
  },
);

journey(
  "Query menus format text and open the agent composer",
  ["query.format", "query.generate"],
  async () => {
    await queryText("select ?s where { ?s ?p ?o . } limit 3");
    await menu("query.format");
    await expect
      .poll(async () =>
        String(
          (await page.evaluate(() => window.axiom.preferences.load()))
            .panelState?.["query.text"],
        ),
      )
      .toContain("SELECT ?s\nWHERE {");
    await menu("query.generate");
    await expect(
      page.getByRole("region", { name: "Compose a SPARQL query" }),
    ).toBeVisible();
  },
);
