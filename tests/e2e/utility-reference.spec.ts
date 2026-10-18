// craigtrim/axiom#94: measured controls and retained state work through real keyboard and IPC routes.
import { test, expect } from "@playwright/test";
import { auditReport } from "../../src/shared/audit";
import {
  launchUtility,
  utilityMenu,
  type UtilityFixture,
} from "./utility-reference-fixture";
let f: UtilityFixture;
test.afterEach(async () => {
  await f?.close();
  expect(f?.errors ?? []).toEqual([]);
});
for (const [view, frame] of [
  ["source", 1],
  ["provenance", 10],
  ["suggestionruns", 17],
  ["errorlog", 23],
  ["tabhistory", 30],
] as const) {
  test(`${view} keeps measured chrome inside every width above recovery`, async () => {
    f = await launchUtility("light", view, frame);
    for (const width of [898, 600, 418, 320, 240]) {
      await f.size(width, 530);
      const bounds = await f.pane().evaluate((el) => {
        const bar = el.querySelector(".bar")!,
          foot = el.querySelector(".foot")!,
          more = bar.querySelector('[aria-label="More actions"]')!,
          rect = el.getBoundingClientRect(),
          b = bar.getBoundingClientRect(),
          m = more.getBoundingClientRect();
        return {
          bar: b.height,
          foot: foot.getBoundingClientRect().height,
          right: m.right - rect.right,
          left: m.left - rect.left,
          scroll: bar.scrollWidth - bar.clientWidth,
        };
      });
      expect(bounds.bar).toBe(28);
      expect(bounds.foot).toBe(22);
      expect(bounds.right).toBeLessThanOrEqual(0);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.scroll).toBeLessThanOrEqual(1);
    }
    await f.size(218, 290);
    await expect(
      f.host().getByRole("button", { name: "Maximize pane", exact: true }),
    ).toBeVisible();
    await expect(f.host()).toHaveAttribute("data-pane-recovery", "true");
    await expect(f.pane()).toHaveAttribute(
      "aria-label",
      view === "source"
        ? "Ontology source editor"
        : view === "provenance"
          ? "Filesystem provenance"
          : view === "suggestionruns"
            ? "Suggestion runs"
            : view === "errorlog"
              ? "Error log"
              : "Tab history",
    );
    await f.size(898, 530);
    await expect(f.host()).toHaveAttribute("data-pane-recovery", "false");
  });
}
test("Source preserves pasted text, native clipboard and its draft through recovery", async () => {
  f = await launchUtility("light", "source");
  const before = (await f.state()).version,
    text = f.data.DOC + "\n# keep these exact spaces\n    # indented once";
  const editor = f
    .pane()
    .getByRole("textbox", { name: "Ontology source", exact: true });
  await editor.focus();
  await f.page.keyboard.press("Control+A");
  await f.page.keyboard.insertText(text);
  await expect(f.pane().getByRole("status")).toHaveText("Draft pending");
  expect((await f.state()).version).toBe(before);
  await f.size(218, 290);
  await f.size(898, 530);
  await expect(editor).toBeFocused();
  const saved = await f.app.evaluate(({ clipboard }) => clipboard.readText());
  let copied = "";
  try {
    copied = text.replace(/\r?\n/g, "\r\n");
    await f.page.keyboard.press("Control+A");
    await f.page.keyboard.press("Control+C");
    await expect
      .poll(async () =>
        (await f.app.evaluate(({ clipboard }) => clipboard.readText())).replace(
          /\r\n/g,
          "\n",
        ),
      )
      .toBe(text);
  } finally {
    await f.app.evaluate(
      async ({ clipboard }, { saved, copied }) => {
        if ((await clipboard.readText()) === copied)
          await clipboard.writeText(saved);
      },
      { saved, copied },
    );
  }
  await f.page.keyboard.press("End");
  await f.size(418, 530);
  const rail = f.pane().locator(".source-horizontal");
  await rail.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await expect
    .poll(() => rail.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await expect(f.pane().getByRole("status")).toHaveText("Draft pending");
});
test("history filter returns from overflow without displacing More, and settings remain shared", async () => {
  f = await launchUtility("light", "tabhistory", 30);
  await f.size(240, 530);
  const more = f
    .pane()
    .getByRole("button", { name: "More actions", exact: true });
  await more.click();
  await f.page
    .getByRole("menuitem", { name: "Filter tab history", exact: true })
    .click();
  const filter = f.pane().getByRole("textbox", { name: "Filter tab history" });
  await expect(filter).toBeFocused();
  await filter.fill("Citation");
  await expect(f.pane().locator(".leaf")).toHaveCount(1);
  const box = (await more.boundingBox())!,
    host = (await f.host().boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(host.x + host.width);
  await f.size(218, 290);
  await f.size(898, 530);
  await expect(filter).toHaveValue("Citation");
  await expect(filter).toBeFocused();
  await f.pane().getByRole("button", { name: "All tabs", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.page.evaluate(() => window.axiom.preferences.load()))
          .tabSavePolicy,
    )
    .toBe("all");
  await utilityMenu(f.app, "tabs.settings");
  const dialog = f.page.getByRole("dialog", { name: "Tab history settings" });
  await expect(
    dialog.getByRole("radio", { name: "All tabs", exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole("radio", { name: "Named tabs only", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    f.pane().getByRole("button", { name: "Named tabs only", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("audit disclosures keep bounded previews while Copy report retains the complete record", async () => {
  f = await launchUtility("light", "errorlog", 23);
  await expect(f.pane().locator('.ent[data-open="true"]')).toHaveCount(0);
  await f
    .pane()
    .getByRole("button", { name: /Taxonomy suggestions for Role/ })
    .click();
  const prompt = f
    .pane()
    .locator(".dsec")
    .filter({ hasText: /^Prompt and ontology context/ });
  await expect(prompt.locator("summary")).toContainText(
    "retained 262,144 of 318,149 characters, truncated",
  );
  await prompt.locator("summary").click();
  await expect(prompt.locator("pre")).toContainText(
    "260,744 more characters retained",
  );
  const record = await f.page.evaluate(() => window.axiom.audit.read("e1"));
  await f.copyReport();
  expect(await f.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    auditReport(record),
  );
  await f
    .pane()
    .getByRole("button", { name: /Write error log record/ })
    .click();
  await expect(f.pane().locator('.ent[data-open="true"]')).toHaveAttribute(
    "data-audit-id",
    "e4",
  );
  await expect(
    f.pane().getByRole("button", { name: "Show log file", exact: true }),
  ).toBeDisabled();
  await expect(f.pane().locator('.ent[data-open="true"] .dsec')).toHaveCount(0);
});
