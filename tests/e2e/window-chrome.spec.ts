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
  await page.emulateMedia({ reducedMotion: "reduce" });
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
// Issue 87: render every installed popup and cascade with the pinned reference.
async function mountReference(
  theme: string,
  popup?: string,
  path: number[] = [],
  alt = false,
) {
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
    async ({ BrowserWindow }, { html, popup, path }) => {
      const w = new BrowserWindow({ show: false });
      await w.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      const result = await w.webContents.executeJavaScript(
        `(() => {
          ${popup ? `document.getElementById(${JSON.stringify(popup === "compact" ? "mcompact" : "mt-menu." + popup)}).click();` : ""}
          for (const index of ${JSON.stringify(path)}) {
            const popups = document.querySelectorAll('.menu');
            const rows = popups[popups.length - 1].querySelectorAll('.mi'); rows.forEach(el => el.removeAttribute('data-active')); const row = rows[index]; row.click(); row.setAttribute('data-active', 'true');
          }
          return {css:document.querySelector('style').textContent, header:document.querySelector('.titlebar').outerHTML, menu:[...document.querySelectorAll('.menu')].map(el => el.outerHTML).join('')};
        })()`,
      );
      w.destroy();
      return result;
    },
    { html, popup, path },
  );
  await page.evaluate(
    ({ data, theme, popup, path, alt }) => {
      document.querySelector("#chrome-reference")?.remove();
      const host = document.createElement("div");
      host.id = "chrome-reference";
      host.setAttribute("data-theme", theme);
      host.style.cssText =
        "all:initial;font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;display:none;position:fixed;inset:0;width:100%;height:100%;z-index:99999;container-type:size;container-name:shell";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${data.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.titlebar{padding-left:env(titlebar-area-x,0px);padding-right:calc(100% - env(titlebar-area-width,100%) - env(titlebar-area-x,0px))}.wco{display:none}.menu{animation:none}</style>${data.header}${data.menu ?? ""}`;
      document.body.append(host);
      host.style.display = "block";
      // Position from reference row boxes, including the 4px inset and 2px overlap.
      const trigger = document
        .querySelector(
          popup === "compact"
            ? ".window-chrome .mcompact"
            : `[data-menu-id="menu.${popup ?? "file"}"]`,
        )!
        .getBoundingClientRect();
      const popups = [...shadow.querySelectorAll<HTMLElement>(".menu")];
      popups.forEach((menu, level) => {
        const parent = level
          ? popups[level - 1]
              .querySelectorAll<HTMLElement>(".mi")
              [path[level - 1]].getBoundingClientRect()
          : trigger;
        menu.style.maxHeight =
          Math.max(26, innerHeight - (level ? 8 : trigger.bottom + 4)) + "px";
        menu.style.overflowY = "auto";
        const box = menu.getBoundingClientRect();
        let x = level ? parent.right - 2 : parent.left;
        if (x + box.width > innerWidth - 4)
          x = level ? parent.left - box.width + 2 : innerWidth - box.width - 4;
        menu.style.left = Math.max(4, x) + "px";
        menu.style.top =
          Math.max(
            4,
            Math.min(
              level ? parent.top - 4 : parent.bottom,
              innerHeight - box.height - 4,
            ),
          ) + "px";
      });
      const header = shadow.querySelector<HTMLElement>(".titlebar")!;
      header.classList.add("shell");
      header.style.display = "flex";
      header.setAttribute("data-alt", alt ? "on" : "off");
      host.style.display = "none";
    },
    { data, theme, popup, path, alt },
  );
}
async function compare(
  name: string,
  selector: ".titlebar" | ".menu",
  level = 0,
  focus?: number,
) {
  const actual = selector === ".titlebar" ? title() : menus().nth(level);
  const expected = page
    .locator("#chrome-reference")
    .locator(selector)
    .nth(level);
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
    if (focus !== undefined) {
      const row = loc
        .locator(selector === ".menu" ? ".mi" : ".mtrigger")
        .nth(focus);
      await row.focus();
      if (ref && selector === ".menu")
        await loc.locator(".mi").evaluateAll(
          (rows, focus) =>
            rows.forEach((el, index) => {
              if (index === focus) el.setAttribute("data-active", "true");
              else el.removeAttribute("data-active");
            }),
          focus,
        );
      await loc.evaluate((el) => {
        (el as HTMLElement).style.transform = "";
        el.querySelectorAll<HTMLElement>("button").forEach((button) => {
          button.style.transform = "";
        });
      });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    }
    await loc.evaluate((el) => {
      (el as HTMLElement).style.transform = "translateZ(0)";
    });
    await loc.locator("button").evaluateAll((els) =>
      els.forEach((el) => {
        (el as HTMLElement).style.transform = "translateZ(0)";
      }),
    );
    if (focus !== undefined)
      await loc
        .locator(selector === ".menu" ? ".mi" : ".mtrigger")
        .nth(focus)
        .focus();
    const box = (await loc.boundingBox())!;
    return page.screenshot({ clip: box, animations: "disabled", scale: "css" });
  };
  await page.mouse.move(2, 10);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  if (focus !== undefined) await page.keyboard.press("Shift");
  await shoot(true);
  await shoot(false);
  const a = await shoot(false),
    e = await shoot(true);
  await show(false);
  if (selector === ".menu") await actual.focus();
  else if (focus !== undefined)
    await actual.locator(".mtrigger").nth(focus).focus();
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
    // The other seven popups, plus the four documented cascade routes.
    await resize(1380);
    for (const root of [
      "edit",
      "view",
      "tools",
      "graph",
      "query",
      "window",
      "help",
    ]) {
      await title().locator(`[data-menu-id="menu.${root}"]`).click();
      await mountReference(theme, root);
      await compare(`${theme}-${root}`, ".menu");
      await page.keyboard.press("Escape");
    }
    for (const [root, chain] of [
      ["file", ["menu.file.open", "menu.file.recent"]],
      ["view", ["menu.theme"]],
      ["graph", ["menu.graphLayout"]],
      ["window", ["menu.movePane"]],
      ["compact", ["menu.file"]],
    ] as const) {
      await resize(root === "compact" ? 620 : 1380);
      await title()
        .locator(
          root === "compact" ? ".mcompact" : `[data-menu-id="menu.${root}"]`,
        )
        .click();
      const indices: number[] = [];
      for (const id of chain) {
        const popup = menus().nth(indices.length);
        await expect(popup.locator(`[data-menu-key="${id}"]`)).toBeVisible();
        const keys = await popup
          .locator(".mi")
          .evaluateAll((rows) =>
            rows.map((row) => (row as HTMLElement).dataset.menuKey),
          );
        const at = keys.indexOf(id);
        expect(at, id).toBeGreaterThanOrEqual(0);
        indices.push(at);
        await popup.locator(".mi").nth(at).focus();
        await page.keyboard.press("ArrowRight");
        await expect(menus()).toHaveCount(indices.length + 1);
        const parent = (await popup.locator(".mi").nth(at).boundingBox())!;
        const child = (await menus().last().boundingBox())!;
        expect(child.y + 5).toBe(parent.y + 1);
        expect(child.x).toBe(
          child.x < parent.x
            ? parent.x - child.width + 2
            : parent.x + parent.width - 2,
        );
      }
      await mountReference(theme, root, indices);
      for (let level = 0; level <= indices.length; level++)
        await compare(
          `${theme}-${root}-cascade-${level}`,
          ".menu",
          level,
          level === indices.length ? 0 : undefined,
        );
      for (let level = 0; level <= indices.length; level++)
        await page.keyboard.press("Escape");
    }
    await resize(1380);
    // Model a disabled native Redo row, as frame 04 does. Chrome reads this installed state.
    await app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()!.getMenuItemById("edit.redo")!.enabled = false;
    });
    await page.keyboard.press("Alt+e");
    await expect(menus().locator('[data-menu-key="edit.undo"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menus().locator('[data-menu-key="edit.redo"]')).toBeFocused();
    await mountReference(theme, "edit", [], true);
    await compare(`${theme}-disabled-redo-focused`, ".menu", 0, 1);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Alt");
    await mountReference(theme, undefined, [], true);
    await compare(`${theme}-bare-alt`, ".titlebar", 0, 0);
    await page.keyboard.press("Escape");
    for (const [width, height] of [
      [239, 400],
      [1380, 119],
    ]) {
      await resize(width, height);
      await mountReference(theme);
      await compare(`${theme}-recovery-${width}x${height}`, ".titlebar");
      await expect(
        page
          .locator(
            ".shell-surface.rail,.shell-surface.tabs,.shell-surface.statusbar",
          )
          .filter({ visible: true }),
      ).toHaveCount(0);
      const dock = (await page.locator(".docking-workspace").boundingBox())!;
      expect(dock).toEqual({ x: 0, y: 36, width, height: height - 36 });
    }
  });
test("menus share native state and support keyboard navigation, compact folds, scrolling and the palette", async () => {
  await launch("light");
  const native = await page.evaluate(() => window.axiom.chrome.menus());
  const ready = async (label: string, initial: "first" | "menu") => {
    await expect(menus()).toHaveAttribute("aria-label", label);
    // The DOM can appear before the opening effect assigns focus. Observe the
    // application's focus transition before sending the next navigation key.
    await expect(
      initial === "menu" ? menus() : menus().locator(".mi").first(),
    ).toBeFocused();
  };
  for (const root of native) {
    await title().locator(`[data-menu-id="${root.id}"]`).click();
    await expect(menus()).toHaveCount(1);
    await ready(root.label, "menu");
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
    await ready(root.label, "first");
    await page.keyboard.press("Escape");
    await page.keyboard.press("F10");
    await expect(title().locator('[data-menu-id="menu.file"]')).toBeFocused();
    for (let n = 0; n < i; n++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await ready(root.label, "first");
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Alt");
  await expect(title().locator('[data-menu-id="menu.file"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await ready("Edit", "first");
  await page.keyboard.press("End");
  await expect(menus().locator(".mi").last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menus().locator(".mi").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("F10");
  await expect(title().locator('[data-menu-id="menu.file"]')).toBeFocused();
  await page.keyboard.press("Alt+v");
  await ready("View", "first");
  await page.keyboard.press("Escape");
  await resize(840, 600);
  await title().locator('[data-menu-id="menu.view"]').click();
  await ready("View", "menu");
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
  await ready("Application menu", "menu");
  await page.keyboard.press("Home");
  await expect(menus().locator(".mi").first()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(menus()).toHaveCount(2);
  await expect(menus().last().locator(".mi").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menus()).toHaveCount(1);
  await expect(menus().locator(".mi").first()).toBeFocused();
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
  await child.keyboard.press("Control+Shift+P");
  const palette = child.getByRole("dialog", { name: "Command palette" });
  const input = palette.getByRole("combobox", { name: "Command palette" });
  await expect(input).toBeFocused();
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toHaveCount(0);
  await app.evaluate(() => {
    (globalThis as any).__detachedMenu = undefined;
  });
  await child.keyboard.press("F10");
  await expect(input).toBeFocused();
  expect(
    await app.evaluate(() => (globalThis as any).__detachedMenu),
  ).toBeUndefined();
  const nextTheme =
    (await child.locator("html").getAttribute("data-theme")) === "dark"
      ? "light"
      : "dark";
  await input.fill(nextTheme);
  await input.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(child.locator("html")).toHaveAttribute("data-theme", nextTheme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", nextTheme);
  // Theme changes reinstall the native menu; observe its new popup boundary.
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()!.popup = (options) => {
      (globalThis as any).__detachedMenu = {
        id: options?.window?.id,
        source: options?.sourceType,
      };
    };
  });
  await child.keyboard.press("F10");
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__detachedMenu))
    .toEqual({ id: childId, source: "keyboard" });
});
