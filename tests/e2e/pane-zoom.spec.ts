import { launchExample } from "./example-fixture";
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

let app: ElectronApplication, page: Page;
const errors: string[] = [];
const pane = (id: string, target = page) =>
  target.locator('[data-pane-id="' + id + '"]');
const zoom = async (view: Locator) =>
  Number(await view.getAttribute("data-pane-zoom"));
async function appZoom(target = page) {
  return (await app.browserWindow(target)).evaluate((win) =>
    win.webContents.getZoomFactor(),
  );
}
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function wheel(
  target: Locator,
  deltaY: number,
  ctrl = false,
  owner = page,
) {
  await target.hover();
  if (ctrl) await owner.keyboard.down("Control");
  try {
    await owner.mouse.wheel(0, deltaY);
  } finally {
    if (ctrl) await owner.keyboard.up("Control");
  }
}
async function fits(view: Locator) {
  const outer = (await view.boundingBox())!;
  const inner = (await view
    .locator(":scope > .adaptive-pane-content")
    .boundingBox())!;
  expect(inner.width).toBeCloseTo(outer.width, 0);
  expect(inner.height).toBeCloseTo(outer.height, 0);
}
async function focused(view: Locator) {
  await view.evaluate((el) => {
    el.setAttribute("tabindex", "-1");
    (el as HTMLElement).focus();
  });
}

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/pane-zoom-"));
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
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && page && !page.isClosed()) {
    await info.attach("desktop", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  }
  await app?.close();
  expect(errors).toEqual([]);
});

test("Individuals scrolls normally; Ctrl+wheel scales only that view and survives reload", async () => {
  const view = pane("individuals");
  await expect(view.locator(".ag-row").first()).toBeVisible();
  const scroll = view.locator(".ag-grid-viewport");
  const position = () => scroll.evaluate((el) => el.scrollTop);
  const bounds = (await view.boundingBox())!;
  const initialAppZoom = await appZoom();
  await wheel(scroll, 320);
  await expect.poll(position).toBeGreaterThan(0);
  expect(await zoom(view)).toBe(1);

  const header = view.locator(".ag-header-cell-text").first();
  const initialHeight = (await header.boundingBox())!.height;
  await wheel(scroll, -120, true);
  await expect.poll(() => zoom(view)).toBeGreaterThan(1);
  const enlarged = await zoom(view);
  expect((await header.boundingBox())!.height).toBeGreaterThan(initialHeight);
  expect(await zoom(pane("hierarchy"))).toBe(1);
  expect(await zoom(pane("inspector"))).toBe(1);
  expect(await appZoom()).toBe(initialAppZoom);
  expect((await view.boundingBox())!.width).toBeCloseTo(bounds.width, 0);
  expect((await view.boundingBox())!.height).toBeCloseTo(bounds.height, 0);
  await fits(view);

  const beforeScroll = await position();
  await wheel(scroll, 220);
  await expect.poll(position).toBeGreaterThan(beforeScroll);
  expect(await zoom(view)).toBe(enlarged);

  // Keep the grid usable after scaling: cell hit-testing still selects its row.
  const cell = view.locator('.ag-row [col-id="iri"]').first();
  const selectedIri = await cell.evaluate((el) =>
    el.closest(".ag-row")!.getAttribute("row-id"),
  );
  await cell.click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .selected,
    )
    .toBe(selectedIri);
  await page.screenshot({
    path: "artifacts/testing/pane-zoom-individuals.png",
  });

  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.preferences.load()))
          .panelState?.["pane.zoom.individuals"],
    )
    .toBe(enlarged);
  await page.reload();
  await expect(pane("individuals")).toHaveAttribute(
    "data-pane-zoom",
    String(enlarged),
  );
  expect(await zoom(pane("hierarchy"))).toBe(1);
  expect(await appZoom()).toBe(initialAppZoom);
  await fits(pane("individuals"));
});

test("other views share Ctrl+wheel zoom, including Monaco, without changing global zoom", async () => {
  const initialAppZoom = await appZoom();
  for (const id of [
    "hierarchy",
    "inspector",
    "research",
    "query",
    "source",
    "provenance",
  ]) {
    await menu(id === "provenance" ? "file.provenance" : "view." + id);
    const view = pane(id);
    await expect(view).toBeVisible();
    const target =
      id === "query" || id === "source"
        ? view.locator(".monaco-editor").first()
        : view.locator(".adaptive-pane-content");
    await expect(target).toBeVisible();
    await wheel(target, -120, true);
    await expect.poll(() => zoom(view)).toBeGreaterThan(1);
    expect(await appZoom()).toBe(initialAppZoom);
    expect(await zoom(pane("individuals"))).toBe(1);
    await fits(view);
    const enlarged = await zoom(view);
    await wheel(target, 120, true);
    await expect.poll(() => zoom(view)).toBeLessThan(enlarged);
    await expect(view).toHaveAttribute("data-pane-zoom", "1");
  }
});

test("detached Individuals retains its zoom when returned to the main window", async () => {
  const view = pane("individuals");
  await expect(view).toBeVisible();
  await wheel(view.locator(".ag-grid-viewport"), -120, true);
  await expect.poll(() => zoom(view)).toBeGreaterThan(1);
  const before = await zoom(view);
  await focused(view);
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await waiting;
  child.on("pageerror", (error) => errors.push(error.message));
  const detached = pane("individuals", child);
  await expect(detached).toHaveAttribute("data-pane-zoom", String(before));
  const childAppZoom = await appZoom(child);
  await wheel(detached.locator(".ag-grid-viewport"), -120, true, child);
  await expect.poll(() => zoom(detached)).toBeGreaterThan(before);
  const after = await zoom(detached);
  expect(await appZoom(child)).toBe(childAppZoom);
  await fits(detached);
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await expect(pane("individuals")).toHaveAttribute(
    "data-pane-zoom",
    String(after),
  );
  expect(await zoom(pane("hierarchy"))).toBe(1);
});

test("graph keeps unmodified wheel zoom; other views consume Ctrl+wheel at their bounds", async () => {
  const canvas = page.getByTestId("graph-canvas");
  const cameraZoom = async () => {
    const camera = (await page.evaluate(() => window.axiom.preferences.load()))
      .panelState?.["graph.camera"] as { zoom: number } | undefined;
    return camera?.zoom;
  };
  await expect.poll(cameraZoom).toBeDefined();
  const initial = await cameraZoom();
  await wheel(canvas, 120);
  await expect.poll(cameraZoom).toBeLessThan(initial!);
  const before = await cameraZoom();
  await wheel(canvas, -120);
  await expect.poll(cameraZoom).toBeGreaterThan(before!);
  expect(await pane("graph").getAttribute("data-pane-zoom")).toBeNull();
  expect(await zoom(pane("individuals"))).toBe(1);

  // Synthetic line/page-mode gestures cover devices with non-pixel wheel units.
  // Default cancellation must hold even when a scale limit is already reached.
  const view = pane("individuals");
  const initialAppZoom = await appZoom();
  const cancelled = await view.evaluate((el) => {
    return [
      { deltaY: -1000, deltaMode: 1 },
      { deltaY: -1, deltaMode: 2 },
    ].map(
      (delta) =>
        !el.dispatchEvent(
          new WheelEvent("wheel", {
            ...delta,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
    );
  });
  expect(cancelled).toEqual([true, true]);
  await expect(view).toHaveAttribute("data-pane-zoom", "3");
  await view.evaluate((el) =>
    el.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 1000,
        deltaMode: 1,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(view).toHaveAttribute("data-pane-zoom", "0.5");
  expect(await appZoom()).toBe(initialAppZoom);
});

test("Individuals reports remain scrollable and their overflow controls stay on screen when zoomed", async () => {
  const filter = page.getByRole("combobox", { name: "Filter by pizza type" });
  if (!(await filter.isVisible()))
    await page
      .getByRole("button", { name: "More individual actions and filters" })
      .click();
  await filter.selectOption(
    "http://www.co-ode.org/ontologies/pizza/pizza.owl#Giardiniera",
  );
  const view = pane("individuals");
  const report = view.getByRole("region", { name: "Instances report" });
  await expect(report.locator("tbody tr")).toHaveCount(100);
  const scroll = report.locator(".instance-report-scroll");
  await wheel(scroll, -120, true);
  await expect.poll(() => zoom(view)).toBeGreaterThan(1);
  const enlarged = await zoom(view);
  await wheel(scroll, 200);
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await zoom(view)).toBe(enlarged);
  await report
    .getByRole("button", { name: "More instance report filters" })
    .click();
  const popup = report.getByRole("dialog", {
    name: "Instance report filters options",
  });
  await expect(popup).toBeVisible();
  const box = (await popup.boundingBox())!;
  const screen = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(screen.width);
  expect(box.y + box.height).toBeLessThanOrEqual(screen.height);
  await popup.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(popup).not.toBeVisible();
  await expect(report.locator("tbody tr")).toHaveCount(100);
});
