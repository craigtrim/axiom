import { test, expect } from "./modal-fixture";
import type { Snapshot } from "../../src/shared/protocol";
import { readFile } from "node:fs/promises";
import path from "node:path";

for (const [format, label, bad, corrected] of [
  ["png", "Export scale", "9", "2.5"],
  ["jpg", "Image quality", "101", "75"],
  ["pdf", "PDF margins", "41", "12.5"],
] as const) {
  test(`${label} preserves empty and invalid text and gates Export`, async ({
    desktop: d,
  }) => {
    await d.menu("graph.export.png");
    const dialog = d.page.getByRole("dialog", { name: "Export", exact: true });
    await dialog
      .getByRole("combobox", { name: "Export format" })
      .selectOption(format);
    const field = dialog.getByRole("spinbutton", { name: label, exact: true });
    const save = dialog.getByRole("button", { name: "Export", exact: true });
    for (const text of ["", bad, "-", "1e", "abc"]) {
      await field.fill(text);
      await field.press("Tab");
      await expect(field).toHaveValue(text);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(save).toBeDisabled();
      await expect(field.locator("..")).toContainText("from");
    }
    await field.fill("");
    await field.pressSequentially("2");
    await expect(field).toHaveValue("2");
    await field.fill(corrected);
    await field.press("Enter");
    await expect(field).toHaveValue(corrected);
    await expect(save).toBeEnabled();
    await field.fill(bad);
    await dialog
      .getByRole("combobox", { name: "Export format" })
      .selectOption("svg");
    await expect(save).toBeEnabled();
    await dialog
      .getByRole("combobox", { name: "Export format" })
      .selectOption(format);
    await expect(
      dialog.getByRole("spinbutton", { name: label, exact: true }),
    ).toHaveValue(corrected);
  });
}

test("Visible node limit rejects incomplete and fractional edits without resetting on blur or Enter", async ({
  desktop: d,
}) => {
  const field = d.page.getByRole("spinbutton", {
    name: "Visible node limit",
    exact: true,
  });
  const original = (await d.request<Snapshot>("state")).graph.budget;
  for (const text of ["", "2", "99", "15001", "100.5", "-", "1e", "12,50"]) {
    await field.fill(text);
    await field.press("Enter");
    await expect(field).toHaveValue(text);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    expect((await d.request<Snapshot>("state")).graph.budget).toBe(original);
  }
  await field.fill("0200");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).graph.budget)
    .toBe(200);
  await expect(field).toHaveValue("0200");
  await field.press("Tab");
  await expect(field).toHaveValue("0200");
  const slider = d.page.getByRole("slider", {
    name: "Visible node limit slider",
  });
  await slider.focus();
  await slider.press("End");
  await expect(field).toHaveValue("15000");
  await field.focus();
  await field.press("ArrowDown");
  await expect(field).toHaveValue("14999");
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).graph.budget)
    .toBe(14999);
});

test("Styles keeps invalid numeric edits visible and leaves the last valid stylesheet intact", async ({
  desktop: d,
}) => {
  await d.menu("graph.appearance");
  const dialog = d.page.getByRole("dialog", {
    name: "Graph appearance",
    exact: true,
  });
  await dialog.getByRole("tab", { name: "Sizing", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Size by", exact: true })
    .selectOption("fixed");
  const field = dialog.getByRole("spinbutton", {
    name: "Diameter (px)",
    exact: true,
  });
  const apply = dialog.getByRole("button", { name: "Apply", exact: true });
  for (const text of ["", "2", "121", "32.5"]) {
    await field.fill(text);
    await field.press("Tab");
    await expect(field).toHaveValue(text);
    await expect(apply).toBeDisabled();
  }
  await field.fill("48");
  await field.press("Enter");
  await expect(field).toHaveValue("48");
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).graph.stylesheet)
    .toContain("48");
});

test("Provenance number edits retain their text and block collection until valid", async ({
  desktop: d,
}) => {
  await d.menu("file.provenance");
  const panel = d.page.getByRole("region", { name: "Filesystem provenance" });
  await d.app.evaluate(({ dialog }, profile) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [profile],
    });
  }, d.profile);
  await panel
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await panel.getByText("Collection options", { exact: true }).click();
  const collect = panel.getByRole("button", {
    name: "Collect metadata",
    exact: true,
  });
  for (const [name, bad, valid] of [
    ["Collection entry limit", "1000001", "2"],
    ["Metadata timeout", "9", "20"],
  ]) {
    const field = panel.getByRole("spinbutton", { name, exact: true });
    for (const text of ["", bad, "2.5"]) {
      await field.fill(text);
      await field.press("Enter");
      await expect(field).toHaveValue(text);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(collect).toBeDisabled();
    }
    await field.fill("");
    await field.pressSequentially(valid);
    await expect(field).toHaveValue(valid);
    await expect(collect).toBeEnabled();
  }
});

test("invalid Example orders prices keep their editor and error until corrected", async ({
  desktop: d,
}) => {
  await d.menu("file.example");
  await expect
    .poll(async () => {
      try {
        return JSON.parse(
          await readFile(path.join(d.profile, "last-session.json"), "utf8"),
        ).workspace.ontology.example;
      } catch {
        return false;
      }
    })
    .toBe(true);
  const price = d.page.locator(
    '[data-panel="individuals"] .ag-row[row-index="0"] [col-id="price"]',
  );
  await expect(price).toContainText("£10.86");
  await price.click();
  const field = price.locator("input");
  for (const text of ["12,50", "", "-2", "word"]) {
    await field.fill(text);
    await field.press("Enter");
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(text);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(
      d.page.locator('[data-panel="individuals"] .validation-error'),
    ).toBeVisible();
  }
  await field.fill("12.50");
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(price).toContainText("£12.50");
});
