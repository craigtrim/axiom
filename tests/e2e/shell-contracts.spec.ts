import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./modal-fixture";
import { branches } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";

// Issue 87: exercise the shell contracts through the installed menus and real dataset.
test("shell names follow the current document and selected tab", async ({
  desktop: d,
}) => {
  const { page } = d;
  await expect(
    page.getByRole("menubar", { name: "Application", exact: true }),
  ).toBeVisible();
  const selected = page.locator('.tabs [aria-selected="true"]');
  const panel = page.locator("#workbench-document");
  await expect(panel).toHaveAttribute(
    "aria-labelledby",
    (await selected.getAttribute("id"))!,
  );
  await page.locator('.rail [data-pane="source"]').click();
  await expect(selected).toHaveAttribute("data-document-id", "source");
  await expect(panel).toHaveAttribute(
    "aria-labelledby",
    (await selected.getAttribute("id"))!,
  );
  await expect(panel).toHaveAccessibleName("modal.ttl");
  const scan = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".window-chrome")
    .include(".shell-surface")
    .include("#workbench-document")
    .exclude(".flexlayout__layout")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await d.menu("file.new");
  await expect(page.locator(".window-chrome .path")).toHaveCount(0);
  const info = await page.evaluate(() => window.axiom.chrome.info());
  const pill = page.locator(".window-chrome .doc");
  await expect(pill).toHaveAccessibleName(
    `Axiom. ${info.fileName}${info.dirty ? ", unsaved changes" : ""}. Open the command palette`,
  );
  await pill.click();
  const dialog = page.getByRole("dialog", {
    name: "Command palette",
    exact: true,
  });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(
    dialog.getByRole("combobox", { name: "Command palette", exact: true }),
  ).toBeFocused();
  // Native F10 and Alt entry points must respect the palette's modal focus.
  for (const key of ["F10", "Alt+f"]) {
    await page.keyboard.press(key);
    await expect(page.locator(".chrome-menu")).toHaveCount(0);
    await expect(
      dialog.getByRole("combobox", { name: "Command palette", exact: true }),
    ).toBeFocused();
  }
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode()
        .include(".chrome-palette-shell")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(pill).toBeFocused();
});

test("Tools dataset radios confirm changes, preserve cancellation, and include a custom current size", async ({
  desktop: d,
}) => {
  const { page } = d;
  const open = async () => {
    await page.locator('[data-menu-id="menu.tools"]').click();
    return page.getByRole("menuitem", { name: "Dataset size", exact: true });
  };
  await expect(await open()).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await d.menu("file.example");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).ontology.example)
    .toBe(true);
  const previous = (await d.request<Snapshot>("state")).orderCount;
  for (const size of [1000, 12000, 50000, 100000]) {
    await (await open()).click();
    const rows = page.getByRole("menu", { name: "Dataset size", exact: true });
    await expect(
      rows.getByRole("menuitemradio", {
        name: previous.toLocaleString("en-GB") + " orders",
        exact: true,
      }),
    ).toHaveAttribute("aria-checked", "true");
    await rows
      .getByRole("menuitemradio", {
        name: size.toLocaleString("en-GB") + " orders",
        exact: true,
      })
      .click();
    const confirm = page.getByRole("dialog", { name: "Regenerate dataset" });
    await expect(confirm).toContainText(
      size.toLocaleString("en-GB") + " seeded orders",
    );
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await d.request<Snapshot>("state")).orderCount).toBe(previous);
  }
  const snapshot = await d.request<Snapshot>("state");
  await d.request("createIndividual", {
    type: snapshot.types[0],
    branch: branches[0],
    price: "12.50",
    rating: 5,
    customerIndex: 0,
  });
  await (await open()).click();
  await expect(
    page.getByRole("menuitemradio", {
      name: (previous + 1).toLocaleString("en-GB") + " orders",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("menuitemradio", {
      name: (previous + 1).toLocaleString("en-GB") + " orders",
      exact: true,
    }),
  ).toHaveAttribute("aria-disabled", "true");
  await page
    .getByRole("menuitemradio", { name: "1,000 orders", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Regenerate dataset" })
    .getByRole("button", { name: "Regenerate", exact: true })
    .click();
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).orderCount)
    .toBe(1000);
  await expect(page.locator(".command-bar")).toHaveCount(0);
  const tabs = (await page.locator(".shell-surface.tabs").boundingBox())!;
  const dock = (await page.locator(".docking-workspace").boundingBox())!;
  expect(dock.y).toBe(tabs.y + tabs.height);
});

test("shell motion honors reduced motion and the palette follows System dark", async ({
  desktop: d,
}) => {
  const { page } = d;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator('[data-menu-id="menu.file"]').click();
  const popup = page.getByRole("menu", { name: "File", exact: true });
  expect(
    await popup.evaluate((el) => [
      getComputedStyle(el).animationName,
      getComputedStyle(el).animationDuration,
    ]),
  ).toEqual(["chrome-pop", "0.12s"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await popup.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  await page.keyboard.press("Escape");
  await d.menu("theme.system");
  await page.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator(".window-chrome .doc").click();
  const palette = page.locator(".chrome-palette-shell");
  expect(
    await palette.evaluate((el) => {
      const own = getComputedStyle(el),
        backdrop = getComputedStyle(el, "::backdrop");
      return [
        own.animationDuration,
        backdrop.animationDuration,
        backdrop.backgroundColor,
      ];
    }),
  ).toEqual(["0.18s", "0.18s", "rgba(0, 0, 0, 0.55)"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await palette.evaluate((el) => [
      getComputedStyle(el).animationName,
      getComputedStyle(el, "::backdrop").animationName,
    ]),
  ).toEqual(["none", "none"]);
});

test("a chrome cascade flips with a two pixel overlap and keeps its first row aligned", async ({
  desktop: d,
}) => {
  const { page } = d;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await d.resize(840, 600, 1.5);
  await page.locator(".mcompact").click();
  await page.getByRole("menuitem", { name: "Window", exact: true }).click();
  const parent = page.getByRole("menuitem", { name: "Move pane", exact: true });
  await parent.focus();
  await page.keyboard.press("ArrowRight");
  const child = page.getByRole("menu", { name: "Move pane", exact: true });
  const p = (await parent.boundingBox())!,
    c = (await child.boundingBox())!;
  expect(c.x).toBeLessThan(p.x);
  expect(c.x).toBe(p.x - c.width + 2);
  expect(c.y + 5).toBe(p.y + 1);
  await page.keyboard.press("Escape");
  await expect(parent).toBeFocused();
});
