import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";

let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const reference = path.resolve(
  "tests/fixtures/window-chrome-visual/shell.html",
);
const rail = () => page.getByRole("navigation", { name: "Panes", exact: true });
const tabs = () => page.getByRole("tablist", { name: "Open documents" });
const status = () =>
  page.getByRole("contentinfo", { name: "Workbench status" });
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
async function resize(width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setMinimumSize(100, 100);
      win.setContentSize(size.width, size.height);
    },
    { width, height },
  );
  await expect
    .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
    .toEqual([width, height]);
}
async function launch(theme = "light", classes = 4) {
  errors.length = 0;
  expect(
    createHash("sha256")
      .update(await readFile(reference))
      .digest("hex"),
  ).toBe("a0f5573c00809578d78a2d75ee39c5993a726a68d28b94ce1582ca31e67f871f");
  await mkdir("artifacts/issue-66-full", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/issue-66-full/profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  await mkdir(path.join(profile, "suggestion-history"));
  const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  await writeFile(
    path.join(profile, "suggestion-history", id + ".json"),
    JSON.stringify({
      id,
      mode: "synonyms",
      namespace: "http://example.org/ontology#",
      iri: "http://example.org/ontology#Topic0",
      label: "Topic0",
      state: "completed",
      startedAt: 1,
      values: Array.from({ length: 10 }, (_, i) => ({
        value: "Suggestion " + i,
        label: "Suggestion " + i,
        reason: "Fixture",
      })),
      applied: [],
      session: "fixture",
      document: {
        entity: { iri: "http://example.org/ontology#Topic0", name: "Topic0" },
        statements: [],
        datasetEpoch: 0,
        version: 0,
      },
    }),
  );
  const file = path.join(profile, "shell-ontology.ttl");
  await writeFile(
    file,
    "@prefix : <http://example.org/ontology#>. @prefix owl: <http://www.w3.org/2002/07/owl#>. " +
      Array.from({ length: classes }, (_, i) => `:Topic${i} a owl:Class.`).join(
        "\n",
      ),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_DISABLE_UPDATES: "1",
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: [
      ...(process.env.AXIOM_TEST_EXE ? [] : ["."]),
      "--force-device-scale-factor=1",
      "--disable-lcd-text",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--force-color-profile=srgb",
      "--disable-gpu-rasterization",
    ],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(rail()).toBeVisible();
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    BrowserWindow.getAllWindows()[0].setFocusable(false);
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  }, file);
  await resize(1380, 800);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.namespace)
    .toBe("http://example.org/ontology#");
  await expect(page.locator(".window-chrome .name")).toHaveText(
    "shell-ontology.ttl",
  );
}
async function scan() {
  await rail().locator('[data-pane="quality"]').click();
  const pane = page.getByRole("region", {
    name: "Ontology Quality",
    exact: true,
  });
  await expect(pane).toBeVisible();
  await pane.getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(status()).toContainText("Scan current");
  await expect(rail().locator('[data-pane="quality"] .badge')).toBeVisible();
}
test.afterEach(async ({}, info) => {
  if (page && !page.isClosed() && info.status !== info.expectedStatus)
    await info.attach("shell", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  await app?.close();
  expect(errors).toEqual([]);
});

test("the full shell switches real panes and documents, keeps focus, scrolls, and follows save and scan state", async () => {
  await launch();
  expect(
    (await page.getByTestId("window-titlebar").boundingBox())!.height,
  ).toBe(36);
  expect((await rail().boundingBox())!.width).toBe(48);
  expect((await tabs().boundingBox())!.height).toBe(32);
  expect((await status().boundingBox())!.height).toBe(22);
  await expect(rail().locator(".ri")).toHaveCount(12);
  await expect(rail().locator('[data-pane="taxonomy"] .badge')).toHaveText(
    "10",
  );
  await expect(rail().locator('[data-pane="errorlog"] .badge')).toHaveCount(0);
  for (const id of [
    "hierarchy",
    "graph",
    "details",
    "source",
    "individuals",
    "find",
    "textanalysis",
    "taxonomy",
    "quality",
    "query",
  ]) {
    const button = rail().locator(`[data-pane="${id}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "true");
    await expect(button).toBeFocused();
    await expect(page.locator(`[data-panel="${id}"]`).first()).toBeVisible();
    await expect(status().locator(".si").first()).toHaveText(
      (await button.getAttribute("title")) ?? "",
    );
  }
  await expect(tabs().locator('[data-document-id="source"]')).toBeVisible();
  await expect(tabs().locator('[data-document-id^="query:"]')).toHaveCount(1);
  await tabs().getByRole("tab").first().click();
  await expect(tabs().getByRole("tab").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs().getByRole("tab").first().press("ArrowRight");
  await expect(tabs().locator('[data-document-id="source"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(tabs().locator('[data-document-id="source"]')).toBeFocused();
  await tabs().locator('[data-document-id="source"]').press("End");
  await expect(rail().locator('[data-pane="query"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await rail().locator('[data-pane="settings"]').click();
  await expect(
    page.getByRole("menu", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rail().locator('[data-pane="settings"]')).toBeFocused();
  await scan();
  await page.evaluate(async () => {
    await window.axiom.request("rename", {
      iri: "http://example.org/ontology#Topic0",
      name: "Renamed topic",
    });
  });
  await expect(status()).toContainText("Quality scan out of date");
  await status()
    .getByRole("button", { name: "Quality scan out of date" })
    .click();
  await expect(
    page.getByRole("region", { name: "Ontology Quality", exact: true }),
  ).toBeVisible();
  await expect(status()).toContainText("Quality scan out of date");
  const destination = path.join(profile, "saved.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, destination);
  await menu("file.saveAs");
  await expect(
    status()
      .locator(".si")
      .filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await expect(tabs().getByRole("tab").first()).toHaveText("saved.axiom");
  await menu("edit.undo");
  await expect(status()).toContainText("Unsaved changes");
  await expect(tabs().getByRole("tab").first()).toHaveText("saved.axiom *");
  await resize(620, 400);
  await expect(status().locator(".opt").first()).not.toBeVisible();
  await expect(status()).toContainText("Unsaved changes");
  await expect(rail().locator('[data-pane="errorlog"]')).not.toBeVisible();
  await rail().locator('[data-pane="settings"]').scrollIntoViewIfNeeded();
  await expect(rail().locator('[data-pane="settings"]')).toBeInViewport();
  expect(await rail().evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await resize(239, 400);
  await expect(rail()).not.toBeVisible();
  await expect(tabs()).not.toBeVisible();
  await expect(status()).not.toBeVisible();
  await resize(820, 119);
  await expect(rail()).not.toBeVisible();
  await resize(1380, 800);
  await expect(rail()).toBeVisible();
  await expect(tabs()).toBeVisible();
  await expect(status()).toBeVisible();
});

test("the reference palette searches the installed menus and invokes enabled commands", async () => {
  await launch();
  const opener = page.locator(".window-chrome .doc");
  await opener.click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const input = palette.getByRole("combobox", { name: "Find a command" });
  await expect(input).toBeFocused();
  await input.fill("Cancel query");
  await expect(palette.getByRole("option")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await input.press("Enter");
  await expect(palette).toBeVisible();
  await input.fill("not a command qqq");
  await expect(palette).toContainText("No command matches that text.");
  await input.fill("Ontology Quality");
  await input.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Ontology Quality", exact: true }),
  ).toBeVisible();
  await opener.click();
  await input.press("Escape");
  await expect(opener).toBeFocused();
});

async function mountReference(theme: string, paletteFilter?: string) {
  const live = await page.evaluate(async () => ({
    snapshot: await window.axiom.request<Snapshot>("state"),
    info: await window.axiom.chrome.info(),
    menu: await window.axiom.chrome.menus(),
    tabs: [...document.querySelectorAll<HTMLElement>(".tabs .tab")].map(
      (tab) => ({ label: tab.title }),
    ),
    selected: [...document.querySelectorAll(".tabs .tab")].findIndex(
      (tab) => tab.getAttribute("aria-selected") === "true",
    ),
    pane:
      document
        .querySelector('.rail [aria-current="true"]')
        ?.getAttribute("data-pane") ?? "graph",
    quality: Number(
      document
        .querySelector('.rail [data-pane="quality"]')
        ?.getAttribute("aria-label")
        ?.match(/\d[\d,]*/)?.[0]
        .replaceAll(",", "") ?? 0,
    ),
    suggestions: Number(
      document
        .querySelector('.rail [data-pane="taxonomy"]')
        ?.getAttribute("aria-label")
        ?.match(/\d[\d,]*/)?.[0]
        .replaceAll(",", "") ?? 0,
    ),
    stale: !!document
      .querySelector(".statusbar button")
      ?.textContent?.includes("Quality scan out of date"),
  }));
  const convert = (items: typeof live.menu): unknown[] =>
    items
      .filter((item) => item.visible)
      .map((item) =>
        item.separator
          ? { sep: 1 }
          : {
              l: item.label,
              k: item.key,
              s: item.accelerator,
              dis: !item.enabled,
              ...(item.children ? { sub: convert(item.children) } : {}),
              ...(item.checked !== undefined
                ? { radio: "fixtureChecked", val: item.checked }
                : {}),
            },
      );
  let html = await readFile(reference, "utf8");
  html = html
    .replace(
      /var MENUS = \[[\s\S]*?\n  \];/,
      "var MENUS = " +
        JSON.stringify(
          live.menu.map((item) => ({
            id: item.id.replace("menu.", ""),
            label: item.label,
            key: item.key,
            items: convert(item.children ?? []),
          })),
        ) +
        ";",
    )
    .replace(
      /var FILE = .*?;/,
      "var FILE = " + JSON.stringify(live.info.fileName) + ";",
    )
    .replace(
      /var FOLDER = .*?;/,
      "var FOLDER = " +
        JSON.stringify(live.info.directory.replace(/[\\/]$/, "")) +
        ";",
    )
    .replace(
      /var TABS = \[[\s\S]*?\n  \];/,
      "var TABS = " + JSON.stringify(live.tabs) + ";",
    )
    .replace(
      'pane: "hierarchy"',
      "pane: " +
        JSON.stringify(
          (
            {
              taxonomy: "suggestions",
              textanalysis: "text",
              errorlog: "errors",
            } as Record<string, string>
          )[live.pane] ?? live.pane,
        ),
    )
    .replace("tab: 0", "tab: " + live.selected)
    .replace("dirty: true", "dirty: " + live.info.dirty)
    .replace(
      'theme: "auto"',
      "fixtureChecked: true, theme: " + JSON.stringify(theme),
    )
    .replace("staleScan: true", "staleScan: " + live.stale)
    .replace("badge: 10", "badge: " + live.suggestions)
    .replace("badge: 6844", "badge: " + live.quality)
    .replaceAll("6,172", live.snapshot.classCount.toLocaleString("en-US"))
    .replaceAll("21,461", live.snapshot.individualCount.toLocaleString("en-US"))
    .replaceAll("4,812", live.snapshot.version.toLocaleString("en-US"));
  const data = await app.evaluate(
    async ({ BrowserWindow }, { html, filter }) => {
      const win = new BrowserWindow({ show: false });
      await win.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      const result = await win.webContents.executeJavaScript(`(()=>{
      ${filter === undefined ? "" : `document.querySelector('#doc').click();const input=document.querySelector('#pq');input.value=${JSON.stringify(filter)};input.dispatchEvent(new Event('input'));input.setAttribute('value',input.value);`}
      return {css:document.querySelector('style').textContent,header:document.querySelector('.titlebar').outerHTML,rail:document.querySelector('.rail').outerHTML,tabs:document.querySelector('.tabs').outerHTML,status:document.querySelector('.statusbar').outerHTML,palette:document.querySelector('.palette').outerHTML};
    })()`);
      win.destroy();
      return result;
    },
    { html, filter: paletteFilter },
  );
  await page.evaluate(
    ({ data, theme, palette }) => {
      document.querySelector("#shell-reference")?.remove();
      const host = document.createElement("div");
      host.id = "shell-reference";
      host.setAttribute("data-theme", theme);
      host.style.cssText = `all:initial;color-scheme:${theme};box-sizing:border-box;font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;display:none;position:fixed;inset:0;width:100%;height:100%;z-index:99999;`;
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML =
        `<style>${data.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.titlebar{padding-left:env(titlebar-area-x,0px);padding-right:calc(100% - env(titlebar-area-width,100%) - env(titlebar-area-x,0px))}.wco{display:none}.menu,.scrim{animation:none}input{caret-color:transparent}</style>` +
        (palette
          ? `<div style="display:grid;justify-items:center;align-items:start;padding-top:72px">${data.palette}</div>`
          : `<div class="shell">${data.header}<div class="midrow">${data.rail}<div class="stage">${data.tabs}<div></div></div></div>${data.status}</div>`);
      (palette
        ? document.querySelector(".chrome-palette-shell")!
        : document.body
      ).append(host);
    },
    { data, theme, palette: paletteFilter !== undefined },
  );
}
async function compareRegion(
  name: string,
  selector: ".rail" | ".tabs" | ".statusbar" | ".palette",
) {
  const actual = page.locator(
    selector === ".palette"
      ? ".chrome-palette-shell > .palette"
      : ".shell-surface" + selector,
  );
  const expected = page.locator("#shell-reference").locator(selector);
  const capture = async (reference: boolean) => {
    await page.evaluate(
      ({ reference, palette }) => {
        document.querySelector<HTMLElement>("#shell-reference")!.style.display =
          reference ? "block" : "none";
        if (palette)
          document.querySelector<HTMLElement>(
            ".chrome-palette-shell > .palette",
          )!.style.visibility = reference ? "hidden" : "";
      },
      { reference, palette: selector === ".palette" },
    );
    const target = reference ? expected : actual;
    await target.evaluate(
      (el) => ((el as HTMLElement).style.transform = "translateZ(0)"),
    );
    await target
      .locator("button")
      .evaluateAll((els) =>
        els.forEach(
          (el) => ((el as HTMLElement).style.transform = "translateZ(0)"),
        ),
      );
    if (selector === ".palette") await target.locator("input").focus();
    return page.screenshot({
      clip: (await target.boundingBox())!,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
  };
  await page.mouse.move(2, 10);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await capture(true);
  await capture(false);
  const actualImage = await capture(false),
    expectedImage = await capture(true);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#shell-reference")!.style.display =
      "none";
    const palette = document.querySelector<HTMLElement>(
      ".chrome-palette-shell > .palette",
    );
    if (palette) palette.style.visibility = "";
  });
  await writeFile(`artifacts/issue-66-full/${name}-actual.png`, actualImage);
  await writeFile(
    `artifacts/issue-66-full/${name}-expected.png`,
    expectedImage,
  );
  const result = await app.evaluate(
    ({ nativeImage }, images) => {
      const [a, e] = images.map((image) =>
        nativeImage.createFromBuffer(Buffer.from(image, "base64")),
      );
      if (JSON.stringify(a.getSize()) !== JSON.stringify(e.getSize()))
        return { pixels: -1, actual: a.getSize(), expected: e.getSize() };
      const ab = a.toBitmap(),
        eb = e.toBitmap(),
        size = a.getSize();
      let pixels = 0;
      const bounds = {
        left: size.width,
        top: size.height,
        right: 0,
        bottom: 0,
      };
      for (let i = 0; i < ab.length; i += 4)
        if (ab.readUInt32LE(i) !== eb.readUInt32LE(i)) {
          pixels++;
          const x = (i / 4) % size.width,
            y = Math.floor(i / 4 / size.width);
          bounds.left = Math.min(bounds.left, x);
          bounds.right = Math.max(bounds.right, x);
          bounds.top = Math.min(bounds.top, y);
          bounds.bottom = Math.max(bounds.bottom, y);
        }
      return { pixels, size, bounds };
    },
    [actualImage.toString("base64"), expectedImage.toString("base64")],
  );
  await writeFile(
    `artifacts/issue-66-full/${name}.json`,
    JSON.stringify(result),
  );
  expect.soft(result.pixels, name).toBe(0);
}
for (const theme of ["light", "dark"])
  test(`the complete shell matches its reference in ${theme}`, async () => {
    await launch(theme, 1005);
    await rail().locator('[data-pane="source"]').click();
    await scan();
    await expect(rail().locator('[data-pane="quality"] .badge')).toHaveText(
      "999+",
    );
    for (const [width, height] of [
      [1380, 800],
      [1100, 800],
      [820, 800],
      [620, 800],
      [620, 400],
      [1380, 420],
    ]) {
      await resize(width, height);
      await mountReference(theme);
      for (const selector of [".rail", ".tabs", ".statusbar"] as const)
        await compareRegion(
          `${theme}-${width}x${height}-${selector.slice(1)}`,
          selector,
        );
    }
    await resize(1380, 800);
    await page.evaluate(() =>
      window.axiom.request("rename", {
        iri: "http://example.org/ontology#Topic0",
        name: "Changed topic",
      }),
    );
    await expect(status()).toContainText("Quality scan out of date");
    await mountReference(theme);
    await compareRegion(`${theme}-stale-status`, ".statusbar");
    await page.screenshot({
      path: `artifacts/issue-66-full/${theme}-full-window.png`,
      animations: "disabled",
    });
    await page.locator(".window-chrome .doc").click();
    const input = page.getByRole("combobox", { name: "Find a command" });
    for (const filter of ["", "Ontology Quality", "no matching command qqq"]) {
      await input.fill(filter);
      await mountReference(theme, filter);
      await compareRegion(
        `${theme}-palette-${filter ? (filter.startsWith("no ") ? "empty" : "filtered") : "all"}`,
        ".palette",
      );
    }
  });
