import { test, expect, _electron, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import { sharedTokens } from "../../src/renderer/shared-tokens";

// Exercise the actual theme commands and detached documents (craigtrim/axiom#81).
const normalize = (value: string) =>
  value
    .replace(/(\d*\.?\d+)ms\b/g, (_, n) => Number(n) / 1000 + "s")
    .replace(
      /(^|[\s,(])(\d*\.\d+)(?=[s),\s]|$)/g,
      (_, prefix, n) => prefix + String(Number(n)),
    )
    .replace(/\s+/g, "")
    .replace(/\b0\./g, ".")
    .toLowerCase();
test("shared tokens remain stylesheet-owned in both themes and detached windows", async () => {
  test.setTimeout(90000);
  await mkdir("artifacts/shared-theme", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/shared-theme/profile-"),
  );
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme: "system" }),
  );
  const env = {
    ...process.env,
    AXIOM_TEST_BACKGROUND: "1",
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_DISABLE_UPDATES: "1",
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    args: [".", "--force-dark-mode", "--disable-gpu"],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ colorScheme: null });
    await expect(page.locator(".docking-workspace")).toBeVisible();
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase(),
      ),
    ).toBe("#0d1117");
    const source = (
      await readFile(
        "tests/fixtures/design-system-visual/visual-reference.html",
        "utf8",
      )
    )
      .split("\n")
      .slice(49, 126)
      .join("\n");
    const light: Record<string, string> = {},
      dark: Record<string, string> = {};
    postcss.parse(source).walkDecls(/^--/, (d) => {
      (d.parent?.type === "rule" && d.parent.selector === ":root"
        ? light
        : dark)[d.prop] = normalize(d.value);
    });
    // #165: #111 added syntax tokens after this pinned layout reference. Keep
    // their approved palette explicit rather than omitting them from the check.
    const syntax = {
      light: {
        keyword: "#6f2c91",
        prefixed: "#0a5a75",
        iri: "#164ba0",
        string: "#8b3516",
        language: "#7c386a",
        datatype: "#7c386a",
        number: "#704d00",
        comment: "#3f4c45",
        punctuation: "#3b4652",
        "xml-tag": "#6f2c91",
        "xml-attribute": "#0a5a75",
        "json-key": "#0a5a75",
        variable: "#8b1962",
      },
      dark: {
        keyword: "#d2a8ff",
        prefixed: "#7ed6df",
        iri: "#91bcff",
        string: "#ffa985",
        language: "#f2a6de",
        datatype: "#f2a6de",
        number: "#eac971",
        comment: "#b2beb2",
        punctuation: "#bac7d5",
        "xml-tag": "#d2a8ff",
        "xml-attribute": "#7ed6df",
        "json-key": "#7ed6df",
        variable: "#f2a6de",
      },
    };
    for (const [name, value] of Object.entries(syntax.light))
      light["--syntax-" + name] = value;
    for (const [name, value] of Object.entries(syntax.dark))
      dark["--syntax-" + name] = value;
    const check = async (target: Page, theme: "light" | "dark") => {
      await expect(target.locator("html")).toHaveAttribute("data-theme", theme);
      const result = await target.evaluate(
        (names) => {
          const style = getComputedStyle(document.documentElement);
          return {
            computed: Object.fromEntries(
              names.map((n) => ["--" + n, style.getPropertyValue("--" + n)]),
            ),
            inline: names.filter((n) =>
              document.documentElement.style.getPropertyValue("--" + n),
            ),
          };
        },
        [...sharedTokens],
      );
      expect(result.inline).toEqual([]);
      expect(
        Object.fromEntries(
          Object.entries(result.computed).map(([key, value]) => [
            key,
            normalize(value),
          ]),
        ),
      ).toEqual(theme === "light" ? light : { ...light, ...dark });
    };
    const command = async (id: string) =>
      app.evaluate(({ Menu, BrowserWindow }, id) => {
        const window = BrowserWindow.getAllWindows()[0],
          item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
        item.click(item, window, window.webContents as never);
      }, id);
    await check(page, "dark");
    await command("view.graph");
    await page.getByTestId("graph-canvas").focus();
    const detached = app.waitForEvent("window");
    await command("pane.detach");
    const child = await detached;
    await child.emulateMedia({ colorScheme: null });
    await expect(child.getByTestId("graph-canvas")).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      await page
        .getByTestId("window-titlebar")
        .locator('[data-menu-id="menu.view"]')
        .click();
      await page.locator('.chrome-menu [data-menu-key="menu.theme"]').click();
      await page
        .locator(`.chrome-menu [data-menu-key="theme.${theme}"]`)
        .click();
      await check(page, theme);
      await check(child, theme);
    }
  } finally {
    await app.close();
  }
});
