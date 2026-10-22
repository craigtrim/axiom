// craigtrim/axiom#148: real utility rows flow without clipping labels or losing frozen order.
import { test, expect } from "@playwright/test";
import {
  launchUtility,
  utilityMenu,
  type UtilityFixture,
} from "./utility-reference-fixture";
let f: UtilityFixture;
const labels = Array.from({ length: 25 }, (_, i) =>
  i === 24
    ? "Computing and Information Technology"
    : `Target ${String(i + 1).padStart(2, "0")}`,
);
test.beforeEach(async () => {
  f = await launchUtility("light", "suggestionruns", 17);
  // Hold the workspace arrangement fixed while measuring the pane itself.
  await f.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send(
      "command",
      "arrangement.standard",
    ),
  );
  await expect
    .poll(
      async () =>
        (await f.page.evaluate(() => window.axiom.preferences.load()))
          .arrangement,
    )
    .toBe("standard");
  await utilityMenu(f.app, "view.suggestionruns");
  await expect(f.pane()).toBeVisible();
  await f.app.evaluate(({ BrowserWindow }, labels) => {
    const g = globalThis as any;
    const completed = g.utilityBatch.runs[0],
      failed = g.utilityBatch.runs[2];
    g.utilityBatch.runs = labels.map((label, i) => ({
      ...(i === 4 ? failed : completed),
      id: `layout-${i}`,
      iri: `urn:layout:${i}`,
      label,
      reviewable: true,
    }));
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(2500, 1100);
    win.webContents.send("command", "suggestions.batchesChanged");
  }, labels);
  await expect(f.pane().locator("tbody tr")).toHaveCount(25);
});
test.afterEach(async () => {
  await f?.close();
  expect(f?.errors ?? []).toEqual([]);
});
const tables = () =>
  f.pane().getByRole("table", { name: /^Selected node runs/ });
async function checkLabels() {
  const cells = f.pane().locator("tbody tr td:first-child");
  expect(await cells.allTextContents()).toEqual(labels);
  expect(
    await cells.evaluateAll((nodes) =>
      nodes.every((cell) => cell.scrollWidth <= cell.clientWidth),
    ),
  ).toBe(true);
}
test("25 targets use the fewest fitting sets and retain order and resize focus", async () => {
  await f.size(2300, 380);
  await expect(tables()).toHaveCount(3);
  expect(
    await tables().evaluateAll((nodes) =>
      nodes.map((table) => table.querySelectorAll("tbody tr").length),
    ),
  ).toEqual([9, 9, 7]);
  await checkLabels();
  const rows = f.pane().locator("tbody tr");
  await rows.nth(8).focus();
  await f.page.keyboard.press("Tab");
  await expect(rows.nth(9)).toBeFocused();
  await rows.nth(22).focus();
  await f.size(2300, 900);
  await expect(tables()).toHaveCount(1);
  await expect(rows.nth(22)).toBeFocused();
  await checkLabels();
  await f.size(2300, 500);
  await expect(tables()).toHaveCount(2);
  expect(
    await tables().evaluateAll((nodes) =>
      nodes.map((table) => table.querySelectorAll("tbody tr").length),
    ),
  ).toEqual([13, 12]);
  await expect(rows.nth(22)).toBeFocused();
  await checkLabels();
  await expect(f.pane().locator(".rows")).toHaveJSProperty("scrollTop", 0);
  await f.page.screenshot({
    path: "artifacts/issue-148-two-sets.png",
    clip: (await f.host().boundingBox())!,
    scale: "css",
  });
});
test("the widest target limits width capacity and all sets share one scroller", async () => {
  await f.size(1000, 380);
  await expect(tables()).toHaveCount(1);
  await checkLabels();
  const scroller = f.pane().locator(".rows");
  expect(
    await scroller.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await f.size(2300, 220);
  await expect(tables()).toHaveCount(3);
  await checkLabels();
  expect(
    await scroller.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  expect(
    await f
      .pane()
      .locator(".run-sets, .run-sets table")
      .evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).overflowY === "visible"),
      ),
  ).toBe(true);
  await scroller.evaluate((el) => {
    el.scrollTop = 100;
  });
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await f
    .pane()
    .getByRole("button", { name: "Error details", exact: true })
    .click();
  await expect(
    f.page.locator('[data-panel="errorlog"] .ent[data-open="true"]'),
  ).toHaveAttribute("data-audit-id", "e1");
});

test("resizing uses sixteen pixels of hysteresis without column oscillation", async () => {
  await f.size(1000, 220);
  await expect(tables()).toHaveCount(1);
  const minimum = await f
    .pane()
    .locator(".run-sets")
    .evaluate((el) => parseFloat((el as HTMLElement).style.minWidth));
  const gutter =
    1000 -
    (await f
      .pane()
      .locator(".rows")
      .evaluate((el) => el.clientWidth));
  const boundary = 2 * minimum + 16 + gutter;
  for (const [width, count] of [
    [boundary - 1, 1],
    [boundary + 15, 1],
    [boundary + 16, 2],
    [boundary, 2],
    [boundary - 1, 1],
  ]) {
    await f.size(width, 220);
    await expect(tables()).toHaveCount(count);
    await checkLabels();
    // A further observer turn must not undo the height-independent decision.
    await f.page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(tables()).toHaveCount(count);
  }
});
