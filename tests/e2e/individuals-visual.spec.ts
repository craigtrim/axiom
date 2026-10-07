// Reference-derived, raw bitmap comparisons. No app baselines or pixel budget.
import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
const rows = JSON.parse(
  await readFile("tests/fixtures/individuals-visual/rows.json", "utf8"),
) as { id: string; p: Record<string, string[]> }[];
const wiki = JSON.parse(
  await readFile("tests/fixtures/wikipedia/colorado.json", "utf8"),
);
const reference = path.resolve(
    "tests/fixtures/individuals-visual/visual-reference.html",
  ),
  hash = "a331ecb4a08aafba275b1a19acfbe5b18d76004d0185b496660435575a38501a",
  base = "http://devry.edu/school-names#";
const shapes = [
  ["expanded", 1100, 660],
  ["narrow", 360, 680],
  ["shallow", 1100, 260],
  ["constrained", 360, 260],
  ["recovery-width", 230, 660],
  ["recovery-height", 1100, 110],
] as const;
let app: ElectronApplication,
  main: Page,
  page: Page,
  specimen: Page,
  profile: string;
let surface = "individuals";
const host = () => page.locator(`.adaptive-pane[data-pane-id="${surface}"]`);
const pane = () => host().locator(".individuals-surface.pane:visible");
const state = () =>
  main.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string, target = page) {
  const win = await app.browserWindow(target);
  await app.evaluate(
    ({ Menu, BrowserWindow }, { id, win }) => {
      const w = BrowserWindow.fromId(win)!;
      Menu.getApplicationMenu()!
        .getMenuItemById(id)!
        .click({} as never, w, w.webContents as never);
    },
    { id, win: await win.evaluate((w) => w.id) },
  );
}
async function launch(theme: "light" | "dark", file: string) {
  expect(
    createHash("sha256")
      .update(await readFile(reference))
      .digest("hex"),
  ).toBe(hash);
  await mkdir("artifacts/issue-61", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/issue-61/profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
    AXIOM_DISABLE_UPDATES: "1",
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: [
      ...(process.env.AXIOM_TEST_EXE ? [] : ["."]),
      "--force-device-scale-factor=1",
      "--disable-lcd-text",
      "--disable-gpu",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--force-color-profile=srgb",
      "--disable-gpu-rasterization",
    ],
    env,
  });
  main = page = await app.firstWindow();
  await expect(main.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(
    ({ BrowserWindow, dialog, protocol }, { file, wiki }) => {
      BrowserWindow.getAllWindows().forEach((w) => w.setFocusable(false));
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      protocol.handle("https", () => Response.json(wiki));
    },
    { file, wiki },
  );
  await menu("file.open");
  await expect
    .poll(
      async () =>
        (await state()).entities.some((e) => e.iri === base + "School"),
      { timeout: 30000 },
    )
    .toBe(true);
  const opened = app.waitForEvent("window");
  await app.evaluate(async ({ BrowserWindow }, file) => {
    const w = new BrowserWindow({
      width: 4000,
      height: 1000,
      show: false,
      focusable: false,
      webPreferences: { backgroundThrottling: false },
    });
    await w.loadFile(file);
    w.showInactive();
    w.setContentSize(4000, 1000);
  }, reference);
  specimen = await opened;
  await specimen.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    theme,
  );
}
async function detach(id: string, focus: string) {
  surface = id;
  page = main;
  await menu(id.startsWith("touchpoints:") ? "touchpoints.open" : "view." + id);
  await expect(pane()).toBeVisible();
  await pane().locator(focus).first().focus();
  const opened = app.waitForEvent("window");
  await menu("pane.detach");
  page = await opened;
  await expect(pane()).toBeVisible();
  const win = await app.browserWindow(page);
  await win.evaluate((w) => {
    w.setFocusable(false);
    w.unmaximize();
    w.setMinimumSize(100, 100);
    w.setContentSize(4000, 1000);
  });
}
async function resize(ref: Locator, width: number, height: number, extra = 0) {
  await specimen.locator(".frame").evaluateAll((els) => {
    for (const el of els)
      if ((el as HTMLElement).style.position === "fixed")
        (el as HTMLElement).style.left = "1500px";
  });
  await host().evaluate(
    (el, { width, height, extra }) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: 24 + extra + "px",
        width: width + "px",
        height: height + "px",
        zIndex: "1000",
      }),
    { width, height: height - extra, extra },
  );
  await ref.locator("..").evaluate(
    (el, { width, height, extra }) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        width: width + "px",
        height: height + "px",
        maxWidth: "none",
        zIndex: "1000",
      }),
    { width, height, extra },
  );
  if (extra) {
    // Exhibit G's mock dock strip is outside the comparison. Reserve its
    // 33px above the real body so both outer raster frames share a rectangle.
    await host()
      .locator(":scope > .adaptive-pane-content, :scope > .pane-recovery-own")
      .evaluateAll((els, extra) => {
        for (const el of els)
          Object.assign((el as HTMLElement).style, {
            position: "absolute",
            top: -extra + "px",
            height: `calc(100% + ${extra}px)`,
          });
      }, extra);
    await host()
      .locator(".individuals-surface.pane")
      .evaluateAll((els, extra) => {
        for (const el of els)
          (el as HTMLElement).style.paddingTop = extra + "px";
      }, extra);
  }
  await expect
    .poll(async () => (await pane().boundingBox())?.width)
    .toBe(width);
  await expect
    .poll(async () => (await pane().boundingBox())?.height)
    .toBe(height);
}
async function capture(root: Locator, crop?: "touchpoints") {
  // Match compositing boundaries, as Details and Extend do, so Chromium uses
  // the same fractional-edge rasterization. Geometry and reference tokens stay.
  if (await root.evaluate((el) => el.classList.contains("pane"))) {
    await root
      .locator("..")
      .evaluate(
        (el) => ((el as HTMLElement).style.transform = "translateZ(0)"),
      );
  } else
    await root.evaluate(
      (el) => ((el as HTMLElement).style.transform = "translateZ(0)"),
    );
  await root
    .locator(".tbar, .tbar .btn, .tbar .fld, .pill")
    .evaluateAll((els) => {
      for (const el of els)
        (el as HTMLElement).style.transform = "translateZ(0)";
    });
  await root.page().mouse.move(1, 1);
  await root
    .page()
    .evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const b = (await root.boundingBox())!;
  if (crop) {
    const top = (await root.locator(".phead:visible").boundingBox())!.y;
    b.height = b.y + b.height - 1 - top;
    b.y = top;
    b.x++;
    b.width -= 2;
  }
  const take = () =>
    root.page().screenshot({ clip: b, animations: "disabled", scale: "css" });
  let previous = await take();
  for (let i = 0; i < 8; i++) {
    const next = await take();
    if (next.equals(previous)) return next;
    previous = next;
  }
  throw Error("Unstable capture");
}
async function compare(
  name: string,
  actual: Locator,
  expected: Locator,
  crop?: "touchpoints",
) {
  const a = await capture(actual, crop),
    b = await capture(expected, crop);
  await writeFile(`artifacts/issue-61/${name}-app.png`, a);
  await writeFile(`artifacts/issue-61/${name}-reference.png`, b);
  const result = await app.evaluate(
    ({ nativeImage }, images) => {
      const [a, b] = images.map((s) =>
        nativeImage.createFromBuffer(Buffer.from(s, "base64")),
      );
      const size = a.getSize();
      if (JSON.stringify(size) !== JSON.stringify(b.getSize()))
        throw Error(JSON.stringify([size, b.getSize()]));
      const p = a.toBitmap(),
        q = b.toBitmap(),
        diff = Buffer.alloc(p.length, 255);
      let pixels = 0;
      const coords: unknown[] = [];
      const rows: Record<number, number> = {};
      for (let i = 0; i < p.length; i += 4) {
        if (p.readUInt32LE(i) !== q.readUInt32LE(i)) {
          pixels++;
          if (coords.length < 120)
            coords.push([
              (i / 4) % size.width,
              Math.floor(i / 4 / size.width),
              [...p.subarray(i, i + 4)],
              [...q.subarray(i, i + 4)],
            ]);
          rows[Math.floor(i / 4 / size.width)] =
            (rows[Math.floor(i / 4 / size.width)] ?? 0) + 1;
          diff[i] = 30;
          diff[i + 1] = 30;
          diff[i + 2] = 230;
        }
      }
      return {
        pixels,
        rows,
        coords,
        diff: nativeImage
          .createFromBitmap(diff, size)
          .toPNG()
          .toString("base64"),
      };
    },
    [a.toString("base64"), b.toString("base64")],
  );
  await writeFile(
    `artifacts/issue-61/${name}-difference.png`,
    Buffer.from(result.diff, "base64"),
  );
  const geometry = (root: Locator) =>
    root.evaluate((el) => {
      const o = el.getBoundingClientRect();
      return [
        ...el.querySelectorAll(
          ".phead,.tbar,.gstat,.gwrap,.hcell,.hlab,.rz,.ident,.scount,.st th,.st td,.val,.usage,.tpbar,.tpq,.cand,.tpfoot,.chooser,.ph,.pb,.pf,.crow,.btn,.sel,.fld,.pill",
        ),
      ].map((e) => {
        const b = e.getBoundingClientRect(),
          c = getComputedStyle(e);
        return {
          tag: e.tagName,
          cls: e.className,
          box: [b.x - o.x, b.y - o.y, b.width, b.height],
          font: c.font,
          color: c.color,
          background: c.backgroundColor,
          padding: c.padding,
        };
      });
    });
  await writeFile(
    `artifacts/issue-61/${name}-layout.json`,
    JSON.stringify(
      {
        pixels: result.pixels,
        rows: result.rows,
        coords: result.coords,
        app: await geometry(actual),
        reference: await geometry(expected),
      },
      null,
      2,
    ),
  );
  expect.soft(result.pixels, name + " raw differing pixels").toBe(0);
}
test.afterEach(async () => {
  if (app) await app.close();
});
for (const theme of ["light", "dark"] as const) {
  test(`Column chooser reference ${theme}`, async () => {
    test.setTimeout(180000);
    await mkdir("artifacts/issue-61", { recursive: true });
    const file = path.resolve("artifacts/issue-61/schools.ttl");
    await writeFile(
      file,
      gunzipSync(
        await readFile("tests/fixtures/individuals-visual/schools.ttl.gz"),
      ),
    );
    await launch(theme, file);
    await detach("individuals", ".fld");
    await pane()
      .getByLabel("Filter by class")
      .selectOption(base + "School");
    await pane()
      .getByRole("button", { name: /^Columns/ })
      .click();
    const chooser = page.locator(".chooser:visible"),
      ref = specimen.locator("#chooser");
    await ref.locator(".crow").evaluateAll((els) => {
      const counts: Record<string, string> = {
        "rdfs:label": "20,265",
        "rdfs:comment": "11,589",
        "rdfs:seeAlso": "20,194",
      };
      for (const el of els) {
        const key = el.querySelector(".cn")!.textContent!;
        if (counts[key]) el.querySelector(".d")!.textContent = counts[key];
      }
    });
    for (const [shape, w, h] of shapes) {
      await host().evaluate(
        (el, { w, h }) =>
          Object.assign((el as HTMLElement).style, {
            position: "fixed",
            left: "24px",
            top: "24px",
            width: w + "px",
            height: h + "px",
          }),
        { w, h },
      );
      // A top-layer chooser is bounded by its window, independently of its
      // originating pane's recovery presentation.
      await chooser.locator("..").evaluate((el) =>
        Object.assign((el as HTMLElement).style, {
          left: "24px",
          top: "24px",
          width: "408px",
        }),
      );
      await ref.evaluate((el) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          width: "408px",
          zIndex: "2000",
        }),
      );
      await compare(`${theme}-chooser-${shape}`, chooser, ref);
    }
  });
  test(`Legend reference ${theme}`, async () => {
    test.setTimeout(180000);
    await launch(
      theme,
      path.resolve("tests/fixtures/individuals-visual/eleven.ttl"),
    );
    const moduleFile = path.join(profile, "tokens.mjs");
    await build({
      entryPoints: ["src/renderer/IndividualTokens.tsx"],
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      outfile: moduleFile,
      jsx: "automatic",
    });
    const { IndividualsLegend } = await import(pathToFileURL(moduleFile).href);
    const file = path.join(profile, "tokens.html");
    await writeFile(
      file,
      `<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="${pathToFileURL(path.resolve("dist/renderer/app.css"))}"></head><body><div class="individuals-surface" style="position:fixed;left:24px;top:24px;background:var(--surface)">${renderToStaticMarkup(createElement(IndividualsLegend))}</div></body></html>`,
    );
    const opened = app.waitForEvent("window");
    await app.evaluate(async ({ BrowserWindow }, file) => {
      const win = new BrowserWindow({
        width: 1300,
        height: 900,
        show: false,
        focusable: false,
      });
      await win.loadFile(file);
      win.showInactive();
    }, file);
    const tokens = await opened;
    const actual = tokens.locator(".legend"),
      ref = specimen.locator(theme === "dark" ? "#legDark" : "#legLight");
    for (const [shape, w, h] of shapes) {
      await actual
        .locator("..")
        .evaluate((el, w) => ((el as HTMLElement).style.width = w + "px"), w);
      await ref.evaluate(
        (el, w) =>
          Object.assign((el as HTMLElement).style, {
            position: "fixed",
            left: "24px",
            top: "24px",
            width: w + "px",
            zIndex: "2000",
          }),
        w,
      );
      await compare(`${theme}-legend-${shape}`, actual, ref);
    }
  });
  test(`Individuals reference ${theme}`, async () => {
    test.setTimeout(240000);
    await launch(
      theme,
      path.resolve("tests/fixtures/individuals-visual/eleven.ttl"),
    );
    await detach("individuals", ".fld");
    await pane()
      .getByLabel("Filter by class")
      .selectOption(base + "School");
    await pane()
      .getByRole("button", { name: /^Columns/ })
      .click();
    await pane().getByRole("button", { name: "None", exact: true }).click();
    for (const name of [
      ":hasType",
      "rdfs:comment",
      ":establishedYear",
      ":hasWebsite",
    ])
      await pane().getByRole("checkbox", { name, exact: true }).check();
    await page.keyboard.press("Escape");
    await specimen
      .locator("#colsBtn")
      .evaluate((el) => (el.textContent = "Columns 5 of 15"));
    await specimen
      .getByRole("region", { name: "Individuals, expanded", exact: true })
      .getByRole("button", { name: "New individual" })
      .evaluate((el) => ((el as HTMLButtonElement).disabled = false));
    for (const [shape, w, h] of shapes) {
      const ref = specimen.locator(
        shape.startsWith("recovery")
          ? "#p4"
          : 'section[aria-label="Individuals, expanded"]',
      );
      await resize(ref, w, h);
      await compare(`${theme}-grid-${shape}`, pane(), ref);
    }
  });
  for (const kind of ["individual", "class"] as const)
    test(`Inspector ${kind} reference ${theme}`, async () => {
      test.setTimeout(180000);
      const root = path.resolve("artifacts/issue-61");
      await mkdir(root, { recursive: true });
      const eleven = await readFile(
        "tests/fixtures/individuals-visual/eleven.ttl",
        "utf8",
      );
      const prefixes = eleven.slice(0, eleven.indexOf(":Q10357800"));
      const aliases = rows.find((r) => r.id === "Q736674")!.p["rdfs:seeAlso"]!;
      const leading = [
        "CU Boulder",
        "University of Colorado at Boulder",
        "CU‐Boulder",
      ];
      const ordered = [
        ...leading,
        ...aliases.filter(
          (v) =>
            ![
              "CU Boulder",
              "University of Colorado at Boulder",
              "CU-Boulder",
            ].includes(v),
        ),
      ];
      const turtle =
        kind === "class"
          ? eleven + '\n:School a owl:Class ; rdfs:label "School" .'
          : prefixes +
            ':Q736674 a :School ; rdfs:label "University of Colorado Boulder" ; rdfs:seeAlso ' +
            ordered.map((v) => JSON.stringify(v)).join(", ") +
            " .";
      const file = path.join(root, `inspector-${kind}.ttl`);
      await writeFile(file, turtle);
      await launch(theme, file);
      await main.evaluate(
        (iri) => window.axiom.request("select", { iri }),
        base + (kind === "class" ? "School" : "Q736674"),
      );
      await detach("inspector", ".val");
      if (kind === "class")
        await pane()
          .getByRole("textbox", { name: "rdfs:label value 1", exact: true })
          .fill("School (edited)");
      const ref = specimen.locator(
        `section[aria-label="Inspector on ${kind === "class" ? "a class" : "an individual"}"]`,
      );
      await ref
        .locator(".scount b")
        .evaluate(
          (el, n) => (el.textContent = String(n)),
          kind === "class" ? 2 : 31,
        );
      const version = (await state()).version;
      await ref.locator(".usage .u").evaluateAll(
        (els, { kind, version }) => {
          for (const el of els) {
            if (el.textContent?.includes("Revision"))
              el.querySelector("b")!.textContent =
                version.toLocaleString("en-US");
            if (
              kind === "class" &&
              (el.textContent?.includes("Direct instances") ||
                el.textContent?.includes("Referenced by"))
            )
              el.querySelector("b")!.textContent = "11";
          }
        },
        { kind, version },
      );
      for (const [shape, w, h] of shapes) {
        await resize(ref, w, h);
        await compare(`${theme}-inspector-${kind}-${shape}`, pane(), ref);
      }
    });
  test(`Touchpoints reference ${theme}`, async () => {
    test.setTimeout(180000);
    await launch(
      theme,
      path.resolve("tests/fixtures/individuals-visual/eleven.ttl"),
    );
    await main.evaluate(
      (iri) => window.axiom.request("select", { iri }),
      base + "Q736674",
    );
    const id = "touchpoints:" + encodeURIComponent(base + "Q736674");
    await detach(id, ".fld");
    await pane().getByRole("button", { name: "Search", exact: true }).click();
    await expect(pane().locator(".cand")).toHaveCount(4);
    await pane()
      .getByRole("checkbox", {
        name: "Select University of Colorado",
        exact: true,
      })
      .check();
    await pane()
      .getByLabel("Relationship for University of Colorado", { exact: true })
      .selectOption("http://www.w3.org/2004/02/skos/core#closeMatch");
    const ref = specimen.locator('section[aria-label="Touchpoints"]');
    await ref
      .locator(".state .word")
      .evaluate(
        (el, value) => (el.textContent = value),
        await pane().locator(".state .word").innerText(),
      );
    for (const [shape, w, h] of shapes) {
      await resize(ref, w, h, 33);
      await compare(
        `${theme}-touchpoints-${shape}`,
        pane(),
        ref,
        "touchpoints",
      );
    }
  });
}
