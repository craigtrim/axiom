// craigtrim/axiom#90: verify real report behavior before comparing its reference frames.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  launchSparsity,
  sparsityMenu,
  type SparsityFixture,
} from "./sparsity-reference-fixture";
let f: SparsityFixture;
test.afterEach(async () => {
  await f?.app.close();
  expect(f?.errors ?? []).toEqual([]);
});

for (const theme of ["light", "dark"])
  test(`${theme} settings, selected report and invalid minimum are accessible`, async () => {
    f = await launchSparsity(theme);
    const audit = async () =>
      expect(
        (
          await new AxeBuilder({ page: f.page })
            .setLegacyMode(true)
            .include('[data-panel="sparsity"]')
            .withTags(["wcag2a", "wcag2aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    await audit();
    const minimum = f.pane.getByRole("spinbutton", { name: "Minimum score" });
    for (const width of [898, 318]) {
      await f.size(width, 530);
      expect(
        await f.pane
          .locator(".srow,.actline")
          .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height)),
      ).toEqual([32, 32, 32, 32, 36]);
      for (const invalid of ["", "250", "abc", "2.5"]) {
        await minimum.fill(invalid);
        await minimum.press("Enter");
        await expect(minimum).toHaveValue(invalid);
        await expect(minimum).toHaveAttribute("aria-invalid", "true");
        await expect(
          f.pane.getByText("Enter a whole number from 0 to 100."),
        ).toBeVisible();
        await expect(
          f.pane.getByRole("button", { name: "Compute sparsity", exact: true }),
        ).toBeEnabled();
      }
      await minimum.fill("2");
      await expect(minimum).toHaveValue("2");
      await expect(minimum).toHaveAttribute("aria-invalid", "false");
      await minimum.fill("25");
    }
    await f.size(898, 530);
    await f.compute();
    await f.group("Business").click();
    await f.finding("Business", "Business Artifact 1.4").click();
    await audit();
  });

test("overflow runs navigation, pins a revealed filter and retains the keyboard menu model", async () => {
  f = await launchSparsity();
  const more = f.pane.getByRole("button", {
    name: "More actions",
    exact: true,
  });
  await more.click();
  const menu = f.page.getByRole("menu", { name: "More actions" });
  await expect(menu).toBeFocused();
  await menu.press("Escape");
  await expect(more).toBeFocused();
  await more.click();
  await menu.press("Tab");
  await expect(more).toBeFocused();
  await f.compute();
  await f.group("Business").click();
  await f.finding("Business", "Business Artifact 1.4").click();
  for (const [width, hidden] of [
    [898, []],
    [558, ["hierarchy"]],
    [418, ["hierarchy", "details"]],
    [378, ["hierarchy", "details", "filter"]],
  ] as const) {
    await f.size(width, 530);
    await expect
      .poll(() =>
        f.pane
          .locator('[data-shared-command][data-overflowed="true"]')
          .evaluateAll((es) =>
            es.map((e) => e.getAttribute("data-shared-command")).sort(),
          ),
      )
      .toEqual([...hidden].sort());
  }
  await f.more("Filter classes");
  const filter = f.pane.getByRole("textbox", { name: "Filter classes" });
  await expect(filter).toBeFocused();
  await filter.fill("Business");
  await f.size(250, 530);
  await expect(filter).toBeVisible();
  await expect(more).toBeVisible();
  await expect(f.pane.locator(".bar .state")).toBeHidden();
  await f.more("Show in Hierarchy");
  await expect
    .poll(async () => (await f.state()).selected)
    .toBe(f.fixture.iri("Business Artifact 1.4"));
  await expect(more).toBeFocused();
  await f.more("Open in Details");
  await expect(
    f.page.getByRole("region", { name: "Details", exact: true }),
  ).toContainText("Business Artifact 1.4");
  await sparsityMenu(f.app, "view.sparsity");
  await f.size(898, 530);
  await filter.fill("");
  await more.focus();
  await expect(
    f.pane.locator('[data-shared-command][data-overflowed="true"]'),
  ).toHaveCount(0);
  await more.press("ArrowDown");
  await expect(
    f.page.getByRole("menuitem", { name: "Expand every group", exact: true }),
  ).toBeFocused();
  await f.page.keyboard.press("End");
  await expect(
    f.page.getByRole("menuitem", { name: "Change settings", exact: true }),
  ).toBeFocused();
  await f.page.keyboard.press("Home");
  await f.page.keyboard.press("Enter");
  await expect(f.pane.locator(".foot")).toContainText("Page 1 of 6");
});

test("recovery and hysteresis preserve page, filter and selected baseline across close and restart", async () => {
  f = await launchSparsity();
  await f.compute();
  await f.more("Expand every group");
  await f.pane.getByRole("button", { name: "Next", exact: true }).click();
  const selected = f.pane.locator(".fin").first();
  const key = await selected.getAttribute("data-row");
  await selected.click();
  const retained = async () => {
    await expect(f.pane.locator(".foot")).toContainText("Page 2 of 6");
    await expect(f.pane.locator(`[data-row='${key}']`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(f.pane.locator(".sibs")).toBeVisible();
  };
  await f.size(598, 398);
  await f.host.evaluate((el) =>
    Object.assign((el as HTMLElement).style, {
      width: "607px",
      height: "407px",
    }),
  );
  await expect(f.host).toHaveAttribute("data-pane-narrow", "true");
  await expect(f.host).toHaveAttribute("data-pane-shallow", "true");
  await f.size(616, 416);
  await f.size(228, 370);
  await expect(f.host).toHaveAttribute("data-pane-recovery", "true");
  await expect(
    f.host.getByRole("button", { name: "Maximize pane" }),
  ).toBeVisible();
  await f.size(898, 530);
  await retained();
  await f.pane.getByRole("button", { name: "Recompute", exact: true }).focus();
  await sparsityMenu(f.app, "pane.close");
  await sparsityMenu(f.app, "view.sparsity");
  await f.size(898, 530);
  await retained();
  await sparsityMenu(f.app, "file.saveAs");
  const profile = f.profile;
  await f.app.close();
  f = await launchSparsity("light", profile);
  await retained();
  await f.pane
    .getByRole("textbox", { name: "Filter classes" })
    .fill("Business");
  await expect(f.pane.locator(".foot")).toContainText("Page 1 of");
  await f.pane.getByRole("button", { name: "Recompute", exact: true }).focus();
  await sparsityMenu(f.app, "pane.close");
  await sparsityMenu(f.app, "view.sparsity");
  await expect(
    f.pane.getByRole("textbox", { name: "Filter classes" }),
  ).toHaveValue("Business");
});

test("a held worker leaves settings usable and a failed recomputation retains the report", async () => {
  f = await launchSparsity();
  await f.app.evaluate(({ ipcMain }) => {
    const holder = globalThis as any;
    holder.sparsityMode = "hold";
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", (e, method, args) => {
      if (method !== "analyzeSparsity" || holder.sparsityMode === "pass")
        return original(e, method, args);
      if (holder.sparsityMode === "fail")
        throw Error("Deliberate analysis failure");
      return new Promise((resolve, reject) => {
        holder.releaseSparsity = () =>
          Promise.resolve(original(e, method, args)).then(resolve, reject);
      });
    });
  });
  await f.pane.getByRole("button", { name: "Compute", exact: true }).click();
  await expect(f.pane.locator(".bar .state")).toHaveText(
    "Analyzing hierarchy…",
  );
  await expect(
    f.pane.getByRole("button", { name: "Compute", exact: true }),
  ).toBeDisabled();
  await expect(
    f.pane.getByRole("group", { name: "Sparsity settings" }),
  ).toBeVisible();
  await f.app.evaluate(() => {
    (globalThis as any).sparsityMode = "pass";
    (globalThis as any).releaseSparsity();
  });
  await expect(f.pane.locator(".bar .state")).toHaveText(
    "769 measured, highest 100",
  );
  await f.group("Business").click();
  await expect(f.pane.locator(".toast")).toBeHidden({ timeout: 6000 });
  await f.app.evaluate(() => {
    (globalThis as any).sparsityMode = "fail";
  });
  await f.compute();
  await expect(f.pane.getByRole("alert")).toContainText(
    "Deliberate analysis failure",
  );
  await expect(f.group("Business")).toHaveAttribute("aria-expanded", "true");
  await f.app.evaluate(() => {
    (globalThis as any).sparsityMode = "pass";
  });
  await f.compute();
  await expect(f.pane.getByRole("alert")).toHaveCount(0);
  await expect(f.pane.locator(".toast")).toContainText("Recomputed.");
});
test("published RDF fixture measures, groups and selects the full sibling baseline", async () => {
  f = await launchSparsity();
  const before = await f.state();
  await expect(f.pane).toContainText("467 named classes in the store");
  await f.compute();
  await expect(f.pane.locator(".bar .state")).toHaveText(
    "769 measured, highest 100",
  );
  await expect(f.pane.locator(".foot")).toContainText("824 compared");
  await expect(f.pane.locator(".foot")).toContainText("51 unscored");
  await expect(f.pane.locator(".foot")).toContainText("4 excluded");
  await expect(f.pane.locator(".band")).toHaveCount(40);
  await f.group("Business").click();
  await f.finding("Business", "Business Artifact 1.4").click();
  await expect(f.pane.locator(".sibs")).toContainText(
    "Measured against the other children of Business",
  );
  const expected = f.fixture
    .compute()
    .groups.find((g) => g.parent === "Business")!.all.length;
  await expect(f.pane.locator(".sibs .sib")).toHaveCount(expected);
  const after = await f.state();
  expect(after.version).toBe(before.version);
  expect(after.tripleCount).toBe(before.tripleCount);
});
