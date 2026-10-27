// Issue #86 compares both governing references as raw bitmaps, with zero differing pixels.
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
const referenceV2 = path.resolve(
  "tests/fixtures/individuals-visual/visual-reference-v2.html",
);
const referenceKeys = [
  "subject",
  "rdf:type",
  ":hasType",
  "rdfs:label",
  "rdfs:comment",
  "rdfs:seeAlso",
  ":establishedYear",
  ":hasCountry",
  ":locatedIn",
  ":hasCoordinates",
  ":hasWebsite",
  ":hasLanguage",
  ":hasQID",
  "owl:sameAs",
  "iri",
];
const referenceWidths = [
  260, 110, 118, 240, 280, 200, 122, 114, 114, 176, 260, 120, 118, 260, 300,
];
const referenceLayout = {
  vis: {
    subject: true,
    ":hasType": true,
    "rdfs:comment": true,
    ":establishedYear": true,
    ":hasWebsite": true,
  },
  order: referenceKeys,
  w: Object.fromEntries(
    referenceKeys.map((key, i) => [key, referenceWidths[i]]),
  ),
};
const polytechnicOrder = JSON.parse(
  await readFile(
    "tests/fixtures/individuals-visual/polytechnic-order.json",
    "utf8",
  ),
) as string[];
// The issue's capture.js copies these specimen rules onto the older workbench.
const specimenLook = `
  body { line-height: 1.6; }
  #gridPane { border-color: var(--border-strong); }
  .fwrap { min-width: 70px; max-width: 300px; } .fwrap .mag { display: none; }
  @container pane (max-width: 599px) { .fwrap { max-width: none; } .tbar { flex-wrap: wrap; row-gap: 4px; } }
  .fld { min-height: 26px; padding: 0 var(--sp-2); font-size: 12.5px; }
  #filter::-webkit-search-cancel-button { -webkit-appearance: none; }
  #colsBtn svg { display: none; }
  .sel { min-height: 24px; font-size: 12px; }
  #gridMore { display: none; }
  .gfoot { padding: 0 var(--sp-3); }
  table.g td.num .cellwrap { justify-content: flex-end; }
  .ib:disabled { opacity: .5; cursor: default; }
`;
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
  expect(
    createHash("sha256")
      .update(
        await readFile(
          "tests/fixtures/individuals-visual/visual-reference-v2.html",
        ),
      )
      .digest("hex"),
  ).toBe("bd7108c30dced68c104ce221cfd46da1c724e9bb6185b9048021e5f9259f5900");
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
  // Decisions 2, 8, 9 and 10 correct the specimen's documented defects.
  await specimen.addStyleTag({
    content: `
    table.g td.num .cellwrap { justify-content: flex-end; }
    @container pane (max-width: 599px) { .tbar { flex-wrap: wrap; row-gap: 4px; } }
    .nums .f { width: 34px; } .nums .d { width: 42px; }
    .crow > label { flex: 1 0 auto; }
    .crow .why { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .frame { resize: none; }
  `,
  });
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
async function capture(
  root: Locator,
  crop?: "touchpoints",
  preserveInteraction = false,
) {
  const legend = await root.evaluate((el) => el.classList.contains("legend"));
  await root.evaluate(async (el) => {
    // Reused React nodes and rebuilt reference nodes need fresh compositor layers.
    for (const node of [el.parentElement!, el, ...el.querySelectorAll("*")]) {
      (node as HTMLElement).style.removeProperty("transform");
      (node as HTMLElement).style.removeProperty("will-change");
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  // Match compositing boundaries, as Details and Extend do, so Chromium uses
  // the same fractional-edge rasterization. Geometry and reference tokens stay.
  await root.evaluate((el, legend) => {
    (el as HTMLElement).style.transform = "translateZ(0)";
    // #165: composite each independently rendered pane against its own backing.
    // This retains the full rounded border and avoids inherited blend groups.
    (el as HTMLElement).style.isolation = "isolate";
    if (!legend) (el as HTMLElement).style.willChange = "transform";
  }, legend);
  if (await root.evaluate((el) => el.classList.contains("pane"))) {
    await root.locator("..").evaluate((el) => {
      (el as HTMLElement).style.transform = "translateZ(0)";
      (el as HTMLElement).style.willChange = "transform";
      (el as HTMLElement).style.isolation = "isolate";
      // #165: isolate the opaque backing without making a new fixed-position
      // containing block, which a transform would do to other specimen panes.
      if (el.parentElement) el.parentElement.style.willChange = "opacity";
    });
  }
  await root
    .locator(
      legend
        ? ".tbar, .tbar .btn, .tbar .fld, .pill"
        : // #165: give both keyboard separator focus rings the same paint boundary.
          ".tbar, .tbar .btn, .tbar .fld, .pill, .pgn, .gstat, .rz",
    )
    .evaluateAll((els, legend) => {
      for (const el of els) {
        (el as HTMLElement).style.transform = "translateZ(0)";
        if (!legend) (el as HTMLElement).style.willChange = "transform";
      }
    }, legend);
  if (!preserveInteraction) {
    await root.page().mouse.move(1, 1);
    await root
      .page()
      .evaluate(() => (document.activeElement as HTMLElement)?.blur());
  }
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
  preserveInteraction = false,
) {
  const a = await capture(actual, crop, preserveInteraction),
    b = await capture(expected, crop, preserveInteraction);
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
          ".phead,.tbar,.gstat,.gstat b,.gwrap,.hcell,.hlab,.rz,.ident,.scount,.st th,.st td,.val,.usage,.tpbar,.tpq,.cand,.tpfoot,.chooser,.ph,.pb,.pf,.crow,.btn,.sel,.fld,.pill,.pgn,.vpop",
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
          text: e.matches(".gstat,.gstat b,.btn") ? e.textContent : undefined,
        };
      });
    });
  // #165: rounded-edge differences need the clipping ancestors as well as content.
  const paintAncestors = (root: Locator) =>
    root.evaluate((el) => {
      const result = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        result.push({
          tag: node.tagName,
          cls: node.className,
          box: node.getBoundingClientRect().toJSON(),
          styles: Object.fromEntries(
            [
              "background-color",
              "border",
              "border-radius",
              "overflow",
              "transform",
              "will-change",
              "contain",
              "clip-path",
              "opacity",
            ].map((key) => [key, style.getPropertyValue(key)]),
          ),
        });
      }
      return result;
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
        ...(result.pixels
          ? {
              appFrame: await paintAncestors(actual),
              referenceFrame: await paintAncestors(expected),
            }
          : {}),
      },
      null,
      2,
    ),
  );
  // #165: keep original captures and pixel coordinates available on CI failures.
  if (result.pixels) {
    await test
      .info()
      .attach(name + " actual", { body: a, contentType: "image/png" });
    await test
      .info()
      .attach(name + " expected", { body: b, contentType: "image/png" });
    await test.info().attach(name + " layout", {
      path: `artifacts/issue-61/${name}-layout.json`,
      contentType: "application/json",
    });
  }
  expect.soft(result.pixels, name + " raw differing pixels").toBe(0);
}
test.afterEach(async () => {
  if (app) await app.close();
});
for (const theme of ["light", "dark"] as const) {
  test(`Individuals supplementary reference ${theme}`, async () => {
    test.setTimeout(240000);
    await launch(
      theme,
      path.resolve("tests/fixtures/individuals-visual/five-hundred.ttl"),
    );
    await detach("individuals", ".fld");
    await host().evaluate((el) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        width: "1100px",
        height: "660px",
        zIndex: "1000",
      }),
    );
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
    await specimen.goto(pathToFileURL(referenceV2).href);
    await specimen.addStyleTag({ content: specimenLook });
    await specimen.evaluate(
      ({ theme, layout, polytechnicOrder }) => {
        document.documentElement.dataset.theme = theme;
        const w = window as any;
        w.S.layouts = { all: layout };
        // Decision 4 keeps the application's locale order, including accented labels.
        w.sorted = () => {
          // Decision 6 retains #59's ranked order, recorded independently of UI captures.
          if (w.S.q === "polytechnic")
            return polytechnicOrder.map((id) =>
              w.ROWS.find((r: any) => r.id === id),
            );
          const c = w.BYKEY[w.S.sortKey] || w.BYKEY.subject;
          return w
            .matched()
            .slice()
            .sort((a: any, b: any) => {
              const x = w.sortVal(a, c),
                y = w.sortVal(b, c);
              if (x === null || y === null)
                return (
                  (x === null && y === null ? 0 : x === null ? 1 : -1) ||
                  a.id.localeCompare(b.id)
                );
              return (
                (c.kind === "num" ? x - y : x.localeCompare(y)) * w.S.sortDir ||
                a.id.localeCompare(b.id)
              );
            });
        };
        w.renderGrid();
        const grid = document.querySelector<HTMLElement>("#gridPane")!;
        const frame = document.createElement("div");
        const backdrop = document.createElement("div");
        Object.assign(backdrop.style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          width: "1100px",
          height: "660px",
          background: "var(--surface)",
        });
        document.body.append(backdrop);
        backdrop.append(frame);
        frame.append(grid);
        Object.assign(frame.style, {
          position: "relative",
          left: "0",
          top: "0",
          width: "1100px",
          height: "660px",
          borderRadius: "6px",
          overflow: "hidden",
        });
        Object.assign(grid.style, {
          position: "relative",
          left: "0",
          top: "0",
          width: "1100px",
          height: "660px",
          zIndex: "1000",
        });
        const select = document.querySelector<HTMLSelectElement>("#classSel")!;
        select.innerHTML =
          '<option value="School">School (500)</option><option value="Thing" disabled>Thing (0)</option><option value="all">All classes</option>';
        select.value = "all";
      },
      { theme, layout: referenceLayout, polytechnicOrder },
    );
    const ref = specimen.locator("#gridPane");
    const glyphs = () =>
      specimen.locator("#ghead .hlab").evaluateAll((els) => {
        for (const el of els) {
          if ((window as any).S.q.trim()) {
            el.removeAttribute("data-dir");
            el.closest("th")?.removeAttribute("aria-sort");
          }
          el.querySelector(".sg")!.textContent =
            (el as HTMLElement).dataset.dir === "desc" ? "↓" : "↑";
        }
      });
    const frame = async (name: string, preserve = false) => {
      await glyphs();
      await compare(`${theme}-${name}`, pane(), ref, undefined, preserve);
    };
    await frame("12-many-rows");
    for (const target of [pane(), ref])
      await target
        .getByRole("button", { name: "Last page", exact: true })
        .click();
    await expect(
      pane().getByRole("textbox", { name: "Page number" }),
    ).toHaveValue("5");
    await frame("13-last-page");
    for (const target of [pane(), ref])
      await target
        .getByRole("button", { name: "First page", exact: true })
        .click();
    await expect(
      pane().getByRole("textbox", { name: "Page number" }),
    ).toHaveValue("1");
    for (const target of [pane(), ref])
      await target
        .locator("tbody tr")
        .nth(2)
        .click({ position: { x: 120, y: 15 } });
    await frame("14-row-selected");
    for (const target of [pane(), ref]) {
      await target.page().mouse.move(1, 1);
      await target.locator(".gwrap").focus();
      await target.page().keyboard.press("Home");
      await target.page().keyboard.press("ArrowDown");
      await target.page().keyboard.press("ArrowDown");
    }
    await frame("15-keyboard-selection", true);
    for (const target of [pane(), ref])
      await target.locator(".fwrap input").fill("polytechnic");
    await expect(pane().locator(".gstat")).toContainText("match");
    await frame("16-filter-matches", true);
    for (const target of [pane(), ref])
      await target.locator(".fwrap input").fill("zzqx");
    await expect(pane().locator(".empty")).toBeVisible();
    await frame("17-filter-no-match");
    for (const target of [pane(), ref])
      await target.getByRole("button", { name: "Clear the filter" }).click();
    await pane()
      .getByRole("button", { name: /^Columns/ })
      .click();
    await pane()
      .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
      .check();
    await page.keyboard.press("Escape");
    await ref.locator("#colsBtn").click();
    await specimen.locator('.pop input[value="rdfs:seeAlso"]').check();
    await specimen.keyboard.press("Escape");
    for (const target of [pane(), ref])
      await target.locator(".fwrap input").fill("colorado");
    await expect(
      pane().getByRole("button", { name: "28 more values of rdfs:seeAlso" }),
    ).toBeVisible();
    await pane()
      .getByRole("button", { name: "28 more values of rdfs:seeAlso" })
      .click();
    await ref.locator('tr[data-id="Q736674"] .plus').click();
    await frame("18-value-list");
    await page.keyboard.press("Escape");
    await specimen.keyboard.press("Escape");
    for (const target of [pane(), ref])
      await target.getByRole("button", { name: "Clear the filter" }).click();
    await pane()
      .getByRole("button", { name: /^Columns/ })
      .click();
    await pane()
      .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
      .uncheck();
    await page.keyboard.press("Escape");
    await ref.locator("#colsBtn").click();
    await specimen.locator('.pop input[value="rdfs:seeAlso"]').uncheck();
    await specimen.keyboard.press("Escape");
    await glyphs();
    for (const target of [pane(), ref]) {
      await target
        .page()
        .evaluate(() => (document.activeElement as HTMLElement)?.blur());
      const source = (await target
        .getByRole("button", { name: /^:hasWebsite/ })
        .boundingBox())!;
      const destination = (await target
        .getByRole("button", { name: /^rdfs:comment/ })
        .boundingBox())!;
      await target.page().mouse.move(source.x + 30, source.y + 14);
      await target.page().mouse.down();
      await target
        .page()
        .mouse.move(source.x + 10, source.y + 14, { steps: 3 });
      await target
        .page()
        .mouse.move(destination.x + 40, destination.y + 14, { steps: 8 });
    }
    await frame("19-reorder-drag", true);
    await page.mouse.up();
    await specimen.mouse.up();
  });
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
    const ref = specimen.locator('section[aria-label="Individuals, expanded"]');
    await resize(ref, 1100, 660);
    for (const target of [pane(), ref]) {
      await target.getByRole("button", { name: /^:establishedYear/ }).click();
      await target.getByRole("button", { name: /^:establishedYear/ }).click();
    }
    await compare(`${theme}-08-year-descending`, pane(), ref);
    for (const target of [pane(), ref])
      await target.getByRole("button", { name: /^Individual/ }).click();
    await pane()
      .getByRole("button", { name: /^Columns/ })
      .click();
    await pane()
      .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
      .check();
    await page.keyboard.press("Escape");
    await specimen.locator('#chooser input[value="rdfs:seeAlso"]').check();
    await specimen
      .locator("#colsBtn")
      .evaluate((el) => (el.textContent = "Columns 6 of 15"));
    await compare(`${theme}-09-multi-valued`, pane(), ref);
    await pane()
      .getByRole("button", { name: /^Columns/ })
      .click();
    await pane()
      .getByRole("checkbox", { name: "rdfs:seeAlso", exact: true })
      .uncheck();
    await page.keyboard.press("Escape");
    await specimen.locator('#chooser input[value="rdfs:seeAlso"]').uncheck();
    await specimen
      .locator("#colsBtn")
      .evaluate((el) => (el.textContent = "Columns 5 of 15"));
    for (const target of [pane(), ref]) {
      await target.page().mouse.move(1, 1);
      await target.getByRole("button", { name: /^rdfs:comment/ }).focus();
      await target.page().keyboard.press("Tab");
      await target.page().keyboard.press("ArrowRight");
      await target.page().keyboard.press("ArrowRight");
    }
    await compare(
      `${theme}-10-keyboard-separator`,
      pane(),
      ref,
      undefined,
      true,
    );
    for (const target of [pane(), ref]) {
      const separator = target.getByRole("separator", {
        name: "Width of rdfs:comment",
        exact: true,
      });
      await separator.press("Home");
      await target
        .page()
        .evaluate(() => (document.activeElement as HTMLElement)?.blur());
      const box = (await separator.boundingBox())!;
      await target.page().mouse.move(box.x + 4, box.y + 14);
      await target.page().mouse.down();
      await target.page().mouse.move(box.x + 84, box.y + 14, { steps: 8 });
    }
    await compare(`${theme}-11-resize-drag`, pane(), ref, undefined, true);
    await page.mouse.up();
    await specimen.mouse.up();
  });
  // craigtrim/axiom#89: Inspector compares against its own pinned reference.
  // craigtrim/axiom#92: Touchpoints compares every shipping state in touchpoints-visual.spec.ts.
}
