import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Test the common implementation, including keyboard and zoom contracts (#81).
const directory = path.resolve("artifacts/shared-pane-harness");
test.beforeAll(async () => {
  await mkdir(directory, { recursive: true });
  await build({
    entryPoints: ["tests/fixtures/design-system-visual/behavior.tsx"],
    outfile: path.join(directory, "behavior.js"),
    bundle: true,
    jsx: "automatic",
    format: "iife",
    platform: "browser",
  });
  await writeFile(
    path.join(directory, "index.html"),
    `<!doctype html><html data-theme="light"><head><link rel="stylesheet" href="${pathToFileURL(path.resolve("dist/renderer/app.css"))}"></head><body><div id="root"></div><script>window.axiom={preferences:{save:async()=>{}},keyboard:{modal:()=>{}}}</script><script src="behavior.js"></script></body></html>`,
  );
});
test.beforeEach(async ({ page }) => {
  await page.goto(pathToFileURL(path.join(directory, "index.html")).href);
  await expect(page.getByRole("button", { name: "Run scan" })).toBeVisible();
});
async function resize(page: Page, width: number, height = 500) {
  await page.locator("#host").evaluate(
    (el, size) =>
      Object.assign((el as HTMLElement).style, {
        width: size.width + "px",
        height: size.height + "px",
      }),
    { width, height },
  );
}
const hidden = (page: Page) =>
  page
    .locator('[data-shared-command][data-overflowed="true"]')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-shared-command")!),
    );

test("actions leave in priority order, return in reverse, and reserve primary and More at pane zoom", async ({
  page,
}) => {
  await expect.poll(() => hidden(page)).toEqual([]);
  const changes: string[][] = [];
  for (let width = 900; width >= 250; width -= 10) {
    await resize(page, width);
    await page.waitForTimeout(25);
    const current = await hidden(page);
    if (JSON.stringify(current) !== JSON.stringify(changes.at(-1)))
      changes.push(current);
    await expect(page.getByRole("button", { name: "Run scan" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More actions", exact: true }),
    ).toBeVisible();
  }
  expect(changes).toEqual([
    [],
    ["first"],
    ["middle", "first"],
    ["keep", "middle", "first"],
  ]);
  const returning: string[][] = [];
  for (let width = 250; width <= 900; width += 10) {
    await resize(page, width);
    await page.waitForTimeout(25);
    const current = await hidden(page);
    if (JSON.stringify(current) !== JSON.stringify(returning.at(-1)))
      returning.push(current);
  }
  expect(returning).toEqual([...changes].reverse());
  await page
    .locator(".adaptive-pane")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -150 });
  await resize(page, 450);
  await expect.poll(() => hidden(page)).not.toEqual([]);
  await page.getByRole("button", { name: "Long state" }).click();
  await expect.poll(() => hidden(page)).toEqual(["keep", "middle", "first"]);
  const state = page.locator(".bar .state");
  expect(await state.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await expect(state).toHaveCSS("text-overflow", "ellipsis");
  await expect(state).toHaveAttribute("title", /retained report/);
});

test("menu handles disabled items, keyboard, outside press and one popup per document", async ({
  page,
}) => {
  const more = page.getByRole("button", { name: "More actions", exact: true });
  await more.click();
  await expect(
    page.getByRole("menuitem", { name: "Export findings" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Unavailable" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.locator("output")).toHaveText("Ready");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Copy summary" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Export findings" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("menuitem", { name: "Copy summary" }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("output")).toHaveText("Copy summary");
  await expect(more).toBeFocused();
  for (const key of ["Escape", "Tab"]) {
    await more.click();
    await page.keyboard.press(key);
    await expect(more).toBeFocused();
    await expect(page.locator(":popover-open")).toHaveCount(0);
  }
  await more.click();
  await page.getByRole("textbox", { name: "Retained draft" }).click();
  await expect(
    page.getByRole("textbox", { name: "Retained draft" }),
  ).toBeFocused();
  await expect(page.locator(":popover-open")).toHaveCount(0);
  await more.click();
  await page
    .getByRole("button", { name: "Other actions", exact: true })
    .click();
  await expect(page.locator(":popover-open")).toHaveCount(1);
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("menu is placed within the viewport at pane zoom and flips above its owner", async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 600 });
  await resize(page, 480, 300);
  await page
    .locator("#host")
    .evaluate((el) => ((el as HTMLElement).style.marginTop = "280px"));
  await page
    .locator(".adaptive-pane")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -150 });
  const owner = page.getByRole("button", {
    name: "Other actions",
    exact: true,
  });
  await owner.evaluate((el) => {
    const zoom = Number(
      el.closest<HTMLElement>(".adaptive-pane")!.dataset.paneZoom,
    );
    Object.assign((el as HTMLElement).style, {
      position: "fixed",
      top: 570 / zoom + "px",
      left: 460 / zoom + "px",
    });
  });
  await owner.click();
  const menu = (await page.locator(":popover-open").boundingBox())!,
    box = (await owner.boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(4);
  expect(menu.x + menu.width).toBeLessThanOrEqual(496);
  expect(menu.y + menu.height).toBeLessThanOrEqual(box.y - 1);
});

test("toast replaces and announces the current message for 4.2 seconds", async ({
  page,
}) => {
  const time = Date.now();
  await page.clock.install({ time: new Date(time) });
  await page.clock.pauseAt(new Date(time + 1000));
  await page.getByRole("button", { name: "Run scan" }).click();
  await expect(page.locator('.toast[role="status"]')).toHaveText("Saved Ready");
  await page.clock.fastForward(3000);
  await page.getByRole("button", { name: "Replace toast" }).click();
  await expect(page.locator('.toast[role="status"]')).toHaveText(
    "Replaced Second message",
  );
  await page.clock.fastForward(4199);
  await expect(page.locator('.toast[role="status"]')).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.locator('.toast[role="status"]')).toBeHidden();
});

test("recovery covers the pane, retains mounted drafts and restores focus", async ({
  page,
}) => {
  const draft = page.getByRole("textbox", { name: "Retained draft" });
  await draft.fill("Retained edits");
  await draft.evaluate((el) => el.setAttribute("data-original", "true"));
  await resize(page, 239);
  const recovery = page.getByRole("region", { name: "Test pane pane" });
  await expect(
    recovery.getByRole("button", { name: "Maximize pane" }),
  ).toBeFocused();
  await expect(page.locator(".adaptive-pane-content")).toHaveAttribute(
    "inert",
    "",
  );
  const pane = (await page.locator(".adaptive-pane").boundingBox())!,
    overlay = (await recovery.boundingBox())!;
  expect(overlay).toEqual(pane);
  await recovery.getByRole("button", { name: "Maximize pane" }).click();
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue("Retained edits");
  await expect(draft).toHaveAttribute("data-original", "true");
  for (const [width, height, recover] of [
    [600, 180, false],
    [600, 179, true],
    [599, 209, true],
    [599, 210, false],
  ] as const) {
    await resize(page, 900, 500);
    await expect(recovery).toBeHidden();
    await resize(page, width, height);
    if (recover) await expect(recovery).toBeVisible();
    else await expect(recovery).toBeHidden();
  }
});

test("a moving focused action returns focus to More and disabled primary keeps its border", async ({
  page,
}) => {
  await expect(page.locator(".bar .state")).toHaveAttribute(
    "title",
    "6,844 findings",
  );
  await page.getByRole("button", { name: "Move first", exact: true }).focus();
  await resize(page, 400);
  const more = page.getByRole("button", { name: "More actions", exact: true });
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole("menuitem", { name: "Move first", exact: true }).focus();
  await resize(page, 900);
  await expect(more).toBeFocused();
  await expect(page.locator(":popover-open")).toHaveCount(0);
  const primary = page.getByRole("button", { name: "Run scan" });
  await primary.evaluate((el) => ((el as HTMLButtonElement).disabled = true));
  await expect(primary).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(primary).toHaveCSS("border-top-color", "rgb(11, 95, 208)");
  await expect(primary).toHaveCSS("color", "rgb(87, 96, 106)");
  await expect(primary).toHaveCSS("opacity", "1");
});
