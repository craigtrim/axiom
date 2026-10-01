import {
  test,
  expect,
  box,
  fixedBox,
  bounds,
  namespace,
} from "./modal-fixture";
import AxeBuilder from "@axe-core/playwright";
import type { Snapshot } from "../../src/shared/protocol";
for (const size of ["default", "short", "narrow"] as const) {
  for (const item of [
    { command: "palette", title: "Command palette", field: "Find a command" },
    {
      command: "help.shortcuts",
      title: "Keyboard shortcuts",
      field: "Filter shortcut reference",
    },
    {
      command: "keyboard.settings",
      title: "Customize keyboard shortcuts",
      field: "Search keyboard commands",
    },
  ]) {
    test(`${item.title} keeps its anchor and input while filtering in a ${size} window`, async ({
      desktop: d,
    }) => {
      await d.resize(
        size === "narrow" ? 480 : 1280,
        size === "short" ? 450 : 900,
      );
      await d.menu(item.command);
      const dialog = d.page.getByRole("dialog", {
        name: item.title,
        exact: true,
      });
      const input = dialog.getByRole("textbox", {
        name: item.field,
        exact: true,
      });
      const original = await box(dialog),
        inputBox = await box(input);
      for (const text of ["Find", "NoSuchCommandzzzzz", ""]) {
        await input.fill(text);
        await fixedBox(dialog, original);
        await fixedBox(input, inputBox);
        await bounds(dialog);
        await expect(input).toBeFocused();
      }
      if (item.command === "keyboard.settings") {
        await dialog.getByRole("checkbox", { name: "Customized only" }).check();
        await dialog
          .getByRole("button", { name: "Menu access keys", exact: true })
          .click();
        await fixedBox(dialog, original);
        await bounds(dialog);
      }
      if (size === "default") {
        const result = await new AxeBuilder({ page: d.page })
          .setLegacyMode(true)
          .include("dialog[open]")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        expect(result.violations).toEqual([]);
      }
      await d.page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });
  }
}
for (const size of ["default", "short", "narrow"] as const) {
  test(`Query history retains its input geometry and has no horizontal overflow in a ${size} window`, async ({
    desktop: d,
  }) => {
    await d.page.evaluate(async () => {
      for (let i = 0; i < 9; i++)
        await window.axiom.queryHistory.apply({
          type: "add",
          text: `SELECT ?topic${i} WHERE {}`,
          title: i === 0 ? "Unique saved query" : `Example query ${i}`,
          origin: "stability",
          namespace: "https://example.test/",
        });
    });
    await d.menu("view.query");
    await d.page.getByRole("button", { name: "Browse query history" }).click();
    await d.resize(
      size === "narrow" ? 480 : 1280,
      size === "short" ? 450 : 900,
    );
    const dialog = d.page.getByRole("dialog", { name: "Query history" });
    const input = dialog.getByRole("searchbox", { name: "Find queries" });
    const original = await box(dialog),
      inputBox = await box(input);
    for (const text of ["Unique saved query", "zzzz-no-query", ""]) {
      await input.fill(text);
      await expect(dialog.locator(".query-history-list")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await fixedBox(dialog, original);
      await fixedBox(input, inputBox);
      await bounds(dialog);
      await expect(input).toBeFocused();
    }
    await d.resize(1280, 900);
    await input.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      d.page.getByRole("button", { name: "Browse query history" }),
    ).toBeFocused();
    await d.page.getByRole("button", { name: "Browse query history" }).click();
    await input.fill("Unique saved query");
    await dialog.getByRole("button", { name: /^Unique saved query/ }).click();
    await expect(dialog).toHaveCount(0);
  });
}
test("query-history failure retains disabled rows and recovers on a new query", async ({
  desktop: d,
}) => {
  await d.menu("view.query");
  await d.page.getByRole("button", { name: "Browse query history" }).click();
  const dialog = d.page.getByRole("dialog", { name: "Query history" });
  await expect(dialog.locator(".query-history-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const original = await box(dialog);
  await d.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get(
      "queryHistory:search",
    );
    ipcMain.removeHandler("queryHistory:search");
    ipcMain.handle("queryHistory:search", (e, text) => {
      if (text === "fail") throw Error("History search failed");
      return original(e, text);
    });
  });
  await dialog.getByRole("searchbox").fill("fail");
  await expect(dialog.getByRole("alert")).toContainText(
    "History search failed",
  );
  await expect(
    dialog.locator(".query-history-list button").first(),
  ).toBeDisabled();
  await fixedBox(dialog, original);
  await dialog.getByRole("searchbox").fill("");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(
    dialog.locator(".query-history-list button").first(),
  ).toBeEnabled();
});
test("tab settings and Rename keep geometry, validate empty names and restore focus", async ({
  desktop: d,
}) => {
  await d.menu("tabs.settings");
  let dialog = d.page.getByRole("dialog", { name: "Tab history settings" });
  const original = await box(dialog);
  await dialog.getByRole("radio", { name: "All tabs", exact: true }).check();
  await fixedBox(dialog, original);
  await bounds(dialog);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await d.menu("view.find");
  await d.page
    .getByRole("tab", { name: "Find", exact: true })
    .click({ button: "right" });
  await d.page
    .getByRole("menuitem", { name: "Rename tab", exact: true })
    .click();
  dialog = d.page.getByRole("dialog", { name: "Rename tab" });
  const renameBox = await box(dialog),
    input = dialog.getByRole("textbox", { name: "Tab name" }),
    inputBox = await box(input);
  await input.fill("");
  await expect(
    dialog.getByRole("button", { name: "Rename", exact: true }),
  ).toBeDisabled();
  await input.fill("A".repeat(120));
  await fixedBox(dialog, renameBox);
  await fixedBox(input, inputBox);
  await input.fill("Stable results");
  await input.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(
    d.page.getByRole("tab", { name: "Stable results", exact: true }),
  ).toBeVisible();
});
test("Delete keeps its anchor when an operation fails and Cancel preserves the ontology", async ({
  desktop: d,
}) => {
  await d.request("select", { iri: namespace + "Topic0" });
  await d.menu("entity.delete");
  const dialog = d.page.getByRole("dialog", { name: "Delete class" });
  const original = await box(dialog);
  await d.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", (e, method, args) => {
      if (method === "deleteClass")
        throw Error("Deletion blocked for this test");
      return original(e, method, args);
    });
  });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Deletion blocked for this test",
  );
  await fixedBox(dialog, original);
  await bounds(dialog);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await d.request<Snapshot>("state")).classCount).toBe(601);
});
test("Regenerate confirmation remains bounded and Cancel retains the example dataset", async ({
  desktop: d,
}) => {
  await d.menu("file.example");
  const input = d.page.getByRole("combobox", { name: "Dataset size" });
  await expect(input).toBeVisible();
  const previous = await input.inputValue();
  await input.focus();
  await input.selectOption(previous === "1000" ? "12000" : "1000");
  const dialog = d.page.getByRole("dialog", { name: "Regenerate dataset" });
  await bounds(dialog);
  await d.resize(480, 450);
  await bounds(dialog);
  await d.resize(1280, 900);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(input).toHaveValue(previous);
  await expect(input).toBeFocused();
});
for (const advanced of [false, true]) {
  test(`${advanced ? "Graph stylesheet" : "Graph appearance"} remains anchored through conditional controls and errors`, async ({
    desktop: d,
  }) => {
    await d.menu(advanced ? "graph.styles" : "graph.appearance");
    const dialog = d.page.getByRole("dialog", {
      name: advanced ? "Graph stylesheet" : "Graph appearance",
      exact: true,
    });
    const original = await box(dialog);
    if (advanced) {
      await dialog
        .getByRole("textbox", { name: "Graph stylesheet" })
        .fill("node { invalid-property: 20; }");
      await expect(dialog.getByRole("status")).not.toBeEmpty();
      await expect(
        dialog.getByRole("button", { name: "Apply", exact: true }),
      ).toBeDisabled();
    } else {
      for (const name of ["Sizing", "Advanced", "Nodes"]) {
        await dialog.getByRole("tab", { name, exact: true }).click();
        await fixedBox(dialog, original);
      }
    }
    await fixedBox(dialog, original);
    await bounds(dialog);
    await d.resize(480, 450);
    await bounds(dialog);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}
test("Export stays anchored through preview and content switches and native Save cancellation", async ({
  desktop: d,
}) => {
  await d.menu("graph.export.png");
  const dialog = d.page.getByRole("dialog", { name: "Export", exact: true });
  const original = await box(dialog);
  await dialog
    .getByRole("combobox", { name: "Export content" })
    .selectOption("report");
  await dialog
    .getByRole("combobox", { name: "Export format" })
    .selectOption("csv");
  await fixedBox(dialog, original);
  await bounds(dialog);
  await dialog
    .getByRole("combobox", { name: "Export content" })
    .selectOption("diagram");
  await fixedBox(dialog, original);
  await d.app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({
      canceled: true,
      filePath: "",
    });
  });
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled();
  await fixedBox(dialog, original);
  await expect(dialog).toBeVisible();
  await d.resize(480, 450);
  await bounds(dialog);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});
