import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ChromeMenuItem } from "../../src/shared/window-chrome";
import type { Snapshot } from "../../src/shared/protocol";
import { emptyKeyboardSettings } from "../../src/shared/shortcuts";
const reference = path.resolve(
  "tests/fixtures/window-chrome-visual/shell.html",
);
const hash = "a0f5573c00809578d78a2d75ee39c5993a726a68d28b94ce1582ca31e67f871f";
let app: ElectronApplication, page: Page;
const title = () => page.getByTestId("window-titlebar");
const menus = () => page.locator(".chrome-menu");
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, w, w.webContents as never);
  }, id);
}
async function launch(theme: string) {
  expect(
    createHash("sha256")
      .update(await readFile(reference))
      .digest("hex"),
  ).toBe(hash);
  await mkdir("artifacts/issue-66", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-66/profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
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
  await expect(title()).toBeVisible();
  await expect(title().locator(".mtrigger")).toHaveCount(8);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getMinimumSize(),
    ),
  ).toEqual([840, 600]);
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setFocusable(false);
    w.setMinimumSize(100, 100);
    w.setContentSize(1380, 800);
  });
  return profile;
}
async function resize(width: number, height = 800) {
  await app.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height),
    { width, height },
  );
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
}
async function mountReference(theme: string, popup?: "file" | "compact") {
  const native = await page.evaluate(() => window.axiom.chrome.menus());
  const info = await page.evaluate(() => window.axiom.chrome.info());
  const convert = (items: ChromeMenuItem[]): unknown[] =>
    items
      .filter((i) => i.visible)
      .map((i) =>
        i.separator
          ? { sep: 1 }
          : {
              l: i.label,
              k: i.key,
              s: i.accelerator,
              dis: !i.enabled,
              ...(i.checked !== undefined
                ? { radio: "fixtureChecked", val: i.checked }
                : {}),
              ...(i.children ? { sub: convert(i.children) } : {}),
            },
      );
  let html = await readFile(reference, "utf8");
  // Only live data differs from the specimen: menu contents, state, title and
  // Electron's native caption reservation. The authored CSS remains pinned.
  html = html.replace(
    /var MENUS = \[[\s\S]*?\n  \];/,
    "var MENUS = " +
      JSON.stringify(
        native.map((i) => ({
          id: i.id,
          label: i.label,
          key: i.key,
          items: convert(i.children ?? []),
        })),
      ) +
      ";",
  );
  html = html
    .replace(
      /var FILE = [^;]+;/,
      "var FILE = " + JSON.stringify(info.fileName) + ";",
    )
    .replace(
      /var FOLDER = [^;]+;/,
      "var FOLDER = " +
        JSON.stringify(info.directory.replace(/[\\/]$/, "")) +
        ";",
    );
  html = html
    .replace(
      'theme: "auto"',
      "fixtureChecked: true, theme: " + JSON.stringify(theme),
    )
    .replace("dirty: true", "dirty: " + info.dirty);
  const data = await app.evaluate(
    async ({ BrowserWindow }, { html, popup }) => {
      const w = new BrowserWindow({ show: false });
      await w.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      const result = await w.webContents.executeJavaScript(
        `(() => { ${popup ? `document.querySelector(".${popup === "file" ? "mtrigger" : "mcompact"}").click();` : ""} return {css:document.querySelector('style').textContent, header:document.querySelector('.titlebar').outerHTML, menu:document.querySelector('.menu')?.outerHTML} })()`,
      );
      w.destroy();
      return result;
    },
    { html, popup },
  );
  await page.evaluate(
    ({ data, theme, compact }) => {
      document.querySelector("#chrome-reference")?.remove();
      const host = document.createElement("div");
      host.id = "chrome-reference";
      host.setAttribute("data-theme", theme);
      host.style.cssText =
        "all:initial;font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;display:none;position:fixed;inset:0;width:100%;height:100%;z-index:99999;container-type:size;container-name:shell";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${data.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.titlebar{padding-left:env(titlebar-area-x,0px);padding-right:calc(100% - env(titlebar-area-width,100%) - env(titlebar-area-x,0px))}.wco{display:none}.menu{animation:none}</style>${data.header}${data.menu ?? ""}`;
      // The popup is under the actual trigger, independent of the hidden
      // reference window's size. Native caption glyphs are outside our surface.
      const trigger = document
        .querySelector(
          compact ? ".window-chrome .mcompact" : ".window-chrome .mtrigger",
        )!
        .getBoundingClientRect();
      const popup = shadow.querySelector<HTMLElement>(".menu");
      if (popup) {
        popup.style.left = trigger.left + "px";
        popup.style.top = trigger.bottom + "px";
      }
      document.body.append(host);
    },
    { data, theme, compact: popup === "compact" },
  );
}
async function compare(name: string, selector: ".titlebar" | ".menu") {
  const actual = selector === ".titlebar" ? title() : menus().first();
  const expected = page.locator("#chrome-reference").locator(selector);
  const show = async (ref: boolean) =>
    page.evaluate((ref) => {
      document.querySelector<HTMLElement>("#chrome-reference")!.style.display =
        ref ? "block" : "none";
      document.querySelector<HTMLElement>(".window-chrome")!.style.visibility =
        ref ? "hidden" : "";
      document
        .querySelectorAll<HTMLElement>(".chrome-menu")
        .forEach((e) => (e.style.visibility = ref ? "hidden" : ""));
    }, ref);
  const shoot = async (ref: boolean) => {
    await show(ref);
    const loc = ref ? expected : actual;
    await loc.evaluate((el) => {
      (el as HTMLElement).style.transform = "translateZ(0)";
    });
    await loc.locator("button").evaluateAll((els) =>
      els.forEach((el) => {
        (el as HTMLElement).style.transform = "translateZ(0)";
      }),
    );
    const box = (await loc.boundingBox())!;
    return page.screenshot({ clip: box, animations: "disabled", scale: "css" });
  };
  await page.mouse.move(2, 400);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await shoot(true);
  await shoot(false);
  const a = await shoot(false),
    e = await shoot(true);
  await show(false);
  await writeFile(`artifacts/issue-66/${name}-actual.png`, a);
  await writeFile(`artifacts/issue-66/${name}-expected.png`, e);
  const result = await app.evaluate(
    ({ nativeImage }, images) => {
      const [a, e] = images.map((s) =>
        nativeImage.createFromBuffer(Buffer.from(s, "base64")),
      );
      if (JSON.stringify(a.getSize()) !== JSON.stringify(e.getSize()))
        return { pixels: -1, actual: a.getSize(), expected: e.getSize() };
      const ab = a.toBitmap(),
        eb = e.toBitmap();
      let pixels = 0;
      for (let i = 0; i < ab.length; i += 4)
        if (ab.readUInt32LE(i) !== eb.readUInt32LE(i)) pixels++;
      return { pixels, size: a.getSize() };
    },
    [a.toString("base64"), e.toString("base64")],
  );
  await writeFile(`artifacts/issue-66/${name}.json`, JSON.stringify(result));
  expect.soft(result.pixels, name).toBe(0);
}
test.afterEach(async () => {
  await app?.close();
});
for (const theme of ["light", "dark"])
  test(`title band and popup match the reference in ${theme}`, async () => {
    const profile = await launch(theme);
    const file = path.join(profile, "course-ontology.ttl");
    await writeFile(
      file,
      "<https://chrome.test/Topic> a <http://www.w3.org/2002/07/owl#Class>.",
    );
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    }, file);
    await menu("file.open");
    await expect(title().locator(".name")).toHaveText("course-ontology.ttl");
    await expect(title().locator(".dirty")).toHaveText("*");
    await mountReference(theme);
    for (const width of [1380, 1100, 820, 620]) {
      await resize(width);
      expect((await title().boundingBox())!.height).toBe(36);
      await compare(`${theme}-band-${width}`, ".titlebar");
    }
    await resize(1380);
    await title().locator('[data-menu-id="menu.file"]').click();
    await expect(menus()).toHaveCount(1);
    await mountReference(theme, "file");
    await compare(`${theme}-file`, ".menu");
    await page.keyboard.press("Escape");
    for (const width of [820, 620]) {
      await resize(width);
      await title().locator(".mcompact").click();
      await expect(menus()).toHaveCount(1);
      await mountReference(theme, "compact");
      await compare(`${theme}-compact-${width}`, ".menu");
      await page.keyboard.press("Escape");
    }
  });
test("menus share native state and support keyboard navigation, compact folds, scrolling and the palette", async () => {
  await launch("light");
  const native = await page.evaluate(() => window.axiom.chrome.menus());
  for (const root of native) {
    await title().locator(`[data-menu-id="${root.id}"]`).click();
    await expect(menus()).toHaveCount(1);
    const rows = menus().locator(".mi");
    const expected = root.children!.filter((i) => !i.separator && i.visible);
    expect(await rows.locator(".lab").allTextContents()).toEqual(
      expected.map((i) => i.label),
    );
    for (let i = 0; i < expected.length; i++) {
      expect(await rows.nth(i).getAttribute("aria-disabled")).toBe(
        expected[i].enabled ? null : "true",
      );
      expect(
        (await rows.nth(i).locator(".acc").allTextContents()).join(""),
      ).toBe(expected[i].accelerator ?? "");
    }
    const unavailable = menus().locator('.mi[aria-disabled="true"]').first();
    if (await unavailable.count()) {
      await unavailable.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");
      await expect(unavailable).toBeFocused();
      await expect(menus()).toHaveAttribute("aria-label", root.label);
    }
    await page.keyboard.press("Escape");
  }
  for (const [i, root] of native.entries()) {
    await page.keyboard.press("Alt+" + root.key.toLowerCase());
    await expect(menus()).toHaveAttribute("aria-label", root.label);
    await page.keyboard.press("Escape");
    await page.keyboard.press("F10");
    await expect(title().locator('[data-menu-id="menu.file"]')).toBeFocused();
    for (let n = 0; n < i; n++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(menus()).toHaveAttribute("aria-label", root.label);
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Alt");
  await expect(title().locator('[data-menu-id="menu.file"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(menus()).toHaveAttribute("aria-label", "Edit");
  await page.keyboard.press("End");
  await expect(menus().locator(".mi").last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menus().locator(".mi").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("F10");
  await expect(title().locator('[data-menu-id="menu.file"]')).toBeFocused();
  await page.keyboard.press("Alt+v");
  await expect(menus()).toHaveAttribute("aria-label", "View");
  await page.keyboard.press("Escape");
  await resize(840, 600);
  await title().locator('[data-menu-id="menu.view"]').click();
  await expect(menus()).toHaveAttribute("aria-label", "View");
  await page.keyboard.press("End");
  await expect(menus().locator(".mi").last()).toBeInViewport();
  expect(await menus().evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await resize(820);
  await expect(title().locator(".menubar")).toBeHidden();
  await title()
    .getByRole("button", { name: "Application menu", exact: true })
    .click();
  await expect(menus().locator(".mi")).toHaveCount(8);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(menus()).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(menus()).toHaveCount(1);
  await page.keyboard.press("Escape");
  await title().locator(".doc").click();
  await expect(
    page.getByRole("dialog", { name: /Command palette/i }),
  ).toBeVisible();
});

test("chrome commands update native themes, document state, shortcuts and zoom while detached panes retain their native menu", async () => {
  test.setTimeout(120000);
  const profile = await launch("light");
  const file = path.join(profile, "chrome.ttl"),
    saved = path.join(profile, "chrome.axiom");
  await writeFile(
    file,
    '<https://chrome.test/Topic> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> "Topic".',
  );
  await app.evaluate(
    ({ BrowserWindow, dialog }, { file, saved }) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: saved,
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      const w = BrowserWindow.getAllWindows()[0],
        original = w.setTitleBarOverlay.bind(w);
      (globalThis as any).__overlays = [];
      w.setTitleBarOverlay = (options) => {
        (globalThis as any).__overlays.push(options);
        original(options);
      };
    },
    { file, saved },
  );
  await menu("file.open");
  await expect(title().locator(".name")).toHaveText("chrome.ttl");
  await expect(title().locator(".path")).toHaveText(profile);
  const state = () =>
    page.evaluate(() => window.axiom.request<Snapshot>("state"));
  await expect
    .poll(async () =>
      (await state()).entities.some(
        (e) => e.iri === "https://chrome.test/Topic",
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    window.axiom.request("rename", {
      iri: "https://chrome.test/Topic",
      name: "Changed",
    }),
  );
  await expect(title().locator(".dirty")).toHaveText("*");
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getTitle(),
    ),
  ).toBe("Axiom | " + file + " *");
  await title().locator('[data-menu-id="menu.file"]').click();
  await menus().locator('[data-menu-key="file.save"]').click();
  await expect(title().locator(".name")).toHaveText("chrome.axiom");
  await expect(title().locator(".dirty")).toHaveCount(0);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getTitle(),
    ),
  ).toBe("Axiom | " + saved);
  await title().locator('[data-menu-id="menu.edit"]').click();
  await menus().locator('[data-menu-key="edit.undo"]').click();
  await expect(title().locator(".dirty")).toHaveText("*");
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://chrome.test/Topic",
        )?.label,
    )
    .toBe("Topic");
  for (const theme of ["dark", "light", "system"]) {
    await page.emulateMedia({ colorScheme: null });
    await title().locator('[data-menu-id="menu.view"]').click();
    await menus().locator('[data-menu-key="menu.theme"]').click();
    await menus().locator(`[data-menu-key="theme.${theme}"]`).click();
    await expect
      .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe(theme);
    const dark = await app.evaluate(
      ({ nativeTheme }) => nativeTheme.shouldUseDarkColors,
    );
    await expect(title()).toHaveCSS(
      "background-color",
      dark ? "rgb(17, 22, 29)" : "rgb(236, 239, 243)",
    );
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__overlays.at(-1)))
      .toEqual({
        color: dark ? "#11161d" : "#eceff3",
        symbolColor: dark ? "#9ba7b4" : "#57606a",
        height: 36,
      });
    await title().locator('[data-menu-id="menu.view"]').click();
    await menus().locator('[data-menu-key="menu.theme"]').click();
    await expect(
      menus().locator(`[data-menu-key="theme.${theme}"]`),
    ).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
  const settings = emptyKeyboardSettings();
  settings.bindings["file.save"] = [{ keys: "Ctrl+K Ctrl+S", scope: "app" }];
  settings.accessKeys["menu.file"] = "A";
  await page.evaluate(
    (settings) => window.axiom.keyboard.save(settings),
    settings,
  );
  await expect(title().locator('[data-menu-id="menu.file"] u')).toHaveText("A");
  await page.keyboard.press("Alt+a");
  await expect(menus()).toHaveAttribute("aria-label", "File (A)");
  await expect(menus().locator('[data-menu-key="file.save"] .acc')).toHaveText(
    "Ctrl+K Ctrl+S",
  );
  await page.keyboard.press("Tab");
  await expect(menus()).toHaveCount(0);
  await expect(title().locator(".doc")).toBeFocused();
  await expect(title().locator('.mtrigger[tabindex="0"]')).toHaveCount(1);
  // Reach both folds through the real zoom command at the production minimum.
  await resize(840, 600);
  for (let n = 0; n < 8 && (await page.evaluate(() => innerWidth > 620)); n++) {
    const priorWidth = await page.evaluate(() => innerWidth);
    const compact = await title().locator(".mcompact").isVisible();
    if (compact) {
      await title().locator(".mcompact").click();
      await menus().locator('[data-menu-key="menu.view"]').click();
    } else await title().locator('[data-menu-id="menu.view"]').click();
    await menus().locator('[data-menu-key="role.zoomIn"]').click();
    await expect
      .poll(() => page.evaluate(() => innerWidth))
      .toBeLessThan(priorWidth);
  }
  await expect(title().locator(".mcompact")).toBeVisible();
  await expect(title().locator(".docwrap")).toBeHidden();
  await menu("role.resetZoom");
  await resize(1380);
  await menu("view.graph");
  const waiting = app.waitForEvent("window");
  await menu("pane.detach");
  const child = await waiting;
  await expect(child.getByTestId("graph-canvas")).toBeVisible();
  await expect(child.getByTestId("window-titlebar")).toHaveCount(0);
  // Observe the native popup boundary without leaving an OS menu open in CI.
  await app.evaluate(({ Menu }) => {
    const native = Menu.getApplicationMenu()!;
    native.popup = (options) => {
      (globalThis as any).__detachedMenu = {
        id: options?.window?.id,
        source: options?.sourceType,
      };
    };
  });
  await child.getByTestId("graph-canvas").focus();
  await child.keyboard.press("F10");
  const childId = await (await app.browserWindow(child)).evaluate((w) => w.id);
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__detachedMenu))
    .toEqual({ id: childId, source: "keyboard" });
});
