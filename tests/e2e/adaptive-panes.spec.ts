import { launchExample } from "./example-fixture";
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";

let app: ElectronApplication, main: Page;
const errors: string[] = [];
const thing = "http://www.w3.org/2002/07/owl#Thing";
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function detach(id: string) {
  await main.bringToFront();
  await menu(id === "provenance" ? "file.provenance" : "view." + id);
  const pane = main.locator('[data-pane-id="' + id + '"]');
  await expect(pane).toBeVisible();
  await pane.evaluate((el) => {
    el.setAttribute("tabindex", "-1");
    (el as HTMLElement).focus();
  });
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await waiting;
  child.on("pageerror", (e) => errors.push(e.message));
  await child.bringToFront();
  await expect(child.locator(".adaptive-pane")).toBeVisible();
  return child;
}
async function resize(page: Page, width: number, height: number, mode: string) {
  await expect(page.locator(".adaptive-pane")).toBeVisible();
  await (
    await app.browserWindow(page)
  ).evaluate(
    (win, size) => {
      win.setMinimumSize(160, 100);
      win.setContentSize(size.width, size.height);
    },
    { width, height },
  );
  await expect(page.locator(".adaptive-pane")).toHaveAttribute(
    "data-pane-layout",
    mode,
  );
}
async function fits(pane: Locator, action: Locator) {
  await expect(action).toBeVisible();
  const outer = (await pane.boundingBox())!,
    inner = (await action.boundingBox())!;
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(
    outer.y + outer.height + 1,
  );
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/adaptive-"));
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  main = await app.firstWindow();
  main.on("pageerror", (e) => errors.push(e.message));
  await expect(main.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await menu("file.new");
  await expect
    .poll(
      async () =>
        (await main.evaluate(() => window.axiom.request<Snapshot>("state")))
          .classCount,
    )
    .toBe(1);
});
test.afterEach(async () => {
  await app.close();
  expect(errors).toEqual([]);
});

test("Inspector preserves an unapplied draft and keeps Apply visible in a shallow pane", async () => {
  const iri = await main.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "Editable",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await main.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  const child = await detach("inspector");
  await resize(child, 360, 740, "narrow");
  const pane = child.getByRole("region", {
    name: "Entity inspector",
    exact: true,
  });
  const label = pane.getByRole("textbox", {
    name: "Entity label",
    exact: true,
  });
  await label.fill("Retained label");
  await label.evaluate((el) => {
    (globalThis as any).adaptiveInput = el;
  });
  await resize(child, 1100, 300, "shallow");
  await expect(label).toHaveValue("Retained label");
  await expect(label).toBeFocused();
  expect(
    await label.evaluate((el) => el === (globalThis as any).adaptiveInput),
  ).toBe(true);
  const apply = pane.getByRole("button", {
    name: "Apply changes",
    exact: true,
  });
  await fits(child.locator(".adaptive-pane"), apply);
  await child.screenshot({
    path: "artifacts/testing/adaptive-inspector-shallow.png",
  });
  await apply.click();
  await expect
    .poll(
      async () =>
        (
          await main.evaluate(() => window.axiom.request<Snapshot>("state"))
        ).entities.find((e) => e.iri === iri)?.label,
    )
    .toBe("Retained label");
  await label.focus();
  await resize(child, 180, 160, "constrained");
  await expect(
    child.getByRole("button", { name: "Maximize pane" }),
  ).toBeFocused();
  await child.getByRole("button", { name: "Maximize pane" }).click();
  await expect(child.locator(".pane-recovery")).toBeHidden();
  await expect(label).toBeFocused();
  await expect(label).toHaveValue("Retained label");
});

test("Query keeps one editor and its draft through narrow and shallow windows", async () => {
  const child = await detach("query");
  await resize(child, 1100, 740, "expanded");
  const input = child.locator(".monaco-editor textarea");
  await input.focus();
  await child.keyboard.press("Control+A");
  await child.keyboard.insertText("SELECT ?s WHERE { ?s ?p ?o } LIMIT 3");
  for (const [w, h, mode] of [
    [360, 740, "narrow"],
    [1100, 300, "shallow"],
    [1100, 740, "expanded"],
  ] as const) {
    await resize(child, w, h, mode);
    await expect(child.locator(".monaco-editor")).toHaveCount(1);
    await fits(
      child.locator(".adaptive-pane"),
      child.getByRole("button", { name: /^Run(?: |$)/ }),
    );
    await expect
      .poll(async () =>
        main.evaluate(async () =>
          String(
            (await window.axiom.preferences.load()).panelState?.["query.text"],
          ),
        ),
      )
      .toContain("LIMIT 3");
  }
  await input.focus();
  await child.keyboard.press("Control+z");
  await expect
    .poll(async () =>
      main.evaluate(async () =>
        String(
          (await window.axiom.preferences.load()).panelState?.["query.text"],
        ),
      ),
    )
    .not.toContain("LIMIT 3");
});

test("Graph remains visual and retains its canvas and graph state when narrowed", async () => {
  const child = await detach("graph");
  await resize(child, 1100, 740, "expanded");
  await main.evaluate(() => window.axiom.request("freeze"));
  const before = await main.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  const canvas = child.getByTestId("graph-canvas");
  await canvas.evaluate((el) => {
    (globalThis as any).adaptiveCanvas = el;
  });
  await resize(child, 360, 300, "constrained");
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((el) => el === (globalThis as any).adaptiveCanvas),
  ).toBe(true);
  await expect(child.locator(".pane-recovery")).toBeHidden();
  const after = await main.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  expect(after.graph.budget).toBe(before.graph.budget);
  expect(after.graph.nodes).toEqual(before.graph.nodes);
});

test("Hierarchy, Individuals, Source and provenance keep usable actions in each pane shape", async () => {
  for (const id of ["hierarchy", "individuals", "source", "provenance"]) {
    const child = await detach(id);
    const root = child.locator(".adaptive-pane");
    for (const [width, height, mode] of [
      [1100, 740, "expanded"],
      [360, 740, "narrow"],
      [1100, 300, "shallow"],
    ] as const) {
      await resize(child, width, height, mode);
      const action = root.locator(".pane-primary button").first();
      await fits(root, action);
      expect(await root.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
        false,
      );
      await child.screenshot({
        path: "artifacts/testing/adaptive-" + id + "-" + mode + ".png",
      });
    }
    if (id === "source") {
      const editor = child.locator(".monaco-editor");
      await expect(editor).toHaveCount(1);
    }
    if (id === "provenance") {
      await expect(
        child.getByRole("button", { name: "Choose folder", exact: true }),
      ).toBeVisible();
      await child.getByRole("button", { name: "Options", exact: true }).click();
      await child.getByText("Collection options", { exact: true }).click();
      await child
        .getByRole("spinbutton", { name: "Collection entry limit" })
        .fill("123");
      await resize(child, 360, 740, "narrow");
      await expect(
        child.getByRole("spinbutton", { name: "Collection entry limit" }),
      ).toHaveValue("123");
    }
    await menu("pane.reattach");
    await expect.poll(() => app.windows().length).toBe(1);
  }
});

test("Entity statements and query results retain their working content when resized", async () => {
  const iri = await main.evaluate(() =>
    window.axiom.request<string>("createClass", {
      name: "Sample",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await main.evaluate((iri) => window.axiom.request("select", { iri }), iri);
  await menu("view.inspector");
  await main.getByRole("button", { name: "Details", exact: true }).click();
  const editor = main.getByRole("region", {
    name: "Details",
    exact: true,
  });
  await editor.evaluate((el) => {
    el.setAttribute("tabindex", "-1");
    (el as HTMLElement).focus();
  });
  let waiting = app.waitForEvent("window");
  await menu("pane.detach");
  let child = await waiting;
  child.on("pageerror", (e) => errors.push(e.message));
  await child.bringToFront();
  const label = child.getByRole("textbox", {
    name: "Entity label",
    exact: true,
  });
  await label.fill("Retained statement draft");
  for (const [width, height, mode] of [
    [360, 740, "narrow"],
    [1100, 300, "shallow"],
  ] as const) {
    await resize(child, width, height, mode);
    await expect(label).toHaveValue("Retained statement draft");
    await child
      .getByRole("button", { name: "+ Add row", exact: true })
      .scrollIntoViewIfNeeded();
    await fits(
      child.locator(".adaptive-pane"),
      child.getByRole("button", { name: "+ Add row", exact: true }),
    );
    expect(
      await child
        .locator(".entity-editor-content")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      // Issue 57 follows the reference's intrinsic narrow table widths.
    ).toBe(mode === "narrow");
  }
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await main.bringToFront();
  await menu("view.query");
  await main.locator(".monaco-editor textarea").focus();
  await main.keyboard.press("Control+A");
  await main.keyboard.insertText("SELECT ?s WHERE { ?s ?p ?o } LIMIT 3");
  await menu("query.run");
  const result = main.getByRole("region", {
    name: "Query results",
    exact: true,
  });
  await expect(result.locator(".ag-root")).toBeVisible();
  const identity = await result.getAttribute("data-result-id");
  await result.evaluate((el) => {
    el.setAttribute("tabindex", "-1");
    (el as HTMLElement).focus();
  });
  waiting = app.waitForEvent("window");
  await menu("pane.detach");
  child = await waiting;
  child.on("pageerror", (e) => errors.push(e.message));
  await child.bringToFront();
  for (const [width, height, mode] of [
    [360, 740, "narrow"],
    [1100, 300, "shallow"],
  ] as const) {
    await resize(child, width, height, mode);
    await expect(child.locator(".query-results-panel")).toHaveAttribute(
      "data-result-id",
      identity!,
    );
    await expect(child.locator(".ag-root")).toBeVisible();
    await fits(
      child.locator(".adaptive-pane"),
      child.getByRole("button", { name: "Open query", exact: true }),
    );
    expect(
      await child
        .locator(".query-results-panel")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(false);
  }
});

test("Compact edge actions, overflow and recovery remain keyboard accessible", async () => {
  await main.evaluate(async () => {
    const a = await window.axiom.request<string>("createClass", {
      name: "Parent",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    });
    const b = await window.axiom.request<string>("createClass", {
      name: "Child",
      parent: a,
    });
    await window.axiom.request("seed", { iris: [a, b], expand: false });
    await window.axiom.request("freeze");
    await window.axiom.request("selectEdge", {
      key: JSON.stringify([
        b,
        "http://www.w3.org/2000/01/rdf-schema#subClassOf",
        a,
      ]),
    });
  });
  let child = await detach("inspector");
  const root = child.locator(".adaptive-pane");
  for (const [width, height, mode] of [
    [320, 740, "narrow"],
    [1100, 300, "shallow"],
  ] as const) {
    await resize(child, width, height, mode);
    await fits(root, child.getByRole("button", { name: "Apply edge changes" }));
    await fits(
      root,
      child.getByRole("button", { name: "Remove edge", exact: true }),
    );
    const scan = await new AxeBuilder({ page: child })
      .setLegacyMode()
      .include(".adaptive-pane")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
  }
  await child.getByRole("button", { name: "More edge actions" }).click();
  await expect(
    child.getByRole("button", { name: "Reload edge" }),
  ).toBeFocused();
  await resize(child, 180, 160, "constrained");
  await expect(child.locator(":popover-open")).toHaveCount(0);
  await expect(
    child.getByRole("button", { name: "Maximize pane" }),
  ).toBeFocused();
  await resize(child, 360, 740, "narrow");
  await expect
    .poll(() =>
      child.evaluate(() => {
        const focused = document.activeElement as HTMLElement;
        return focused?.matches("button") && focused.checkVisibility()
          ? focused.textContent?.trim()
          : focused?.tagName;
      }),
    )
    .toMatch(/^(Apply|More)$/);
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()!.getMenuItemById("pane.reattach")!.enabled,
      ),
    )
    .toBe(true);
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await main.evaluate(() => window.axiom.request("selectEdge", { key: null }));
  for (const id of ["touchpoints", "source"]) {
    child = await detach(id);
    await resize(child, 360, 740, "narrow");
    const scan = await new AxeBuilder({ page: child })
      .setLegacyMode()
      .include(".adaptive-pane")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await menu("pane.reattach");
    await expect.poll(() => app.windows().length).toBe(1);
  }
});
