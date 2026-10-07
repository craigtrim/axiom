// Whole-pane pixels from Craig's unchanged reference, never an app baseline.
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
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";

const reference = path.resolve(
  "tests/fixtures/details-visual/visual-reference.html",
);
const hash = "3387b593125c5ba95e338c3dbdd6e0f8775b4ecf390eebd829d3401476e67e90";
const base = "http://devry.edu/courses#";
const ontology = `@prefix : <${base}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:TechnicalAlgebra a owl:Class ; rdfs:label "Technical Algebra" ; rdfs:subClassOf :Algebra ; rdfs:seeAlso "Algebra Tech", "TECH ALG" .
:Algebra a owl:Class ; rdfs:label "Algebra" ; rdfs:subClassOf :Math, :PureMathematics .
:Math a owl:Class ; rdfs:label "Math" ; rdfs:subClassOf :Course .
:PureMathematics a owl:Class ; rdfs:label "Pure Mathematics" ; rdfs:subClassOf :Course .
:Course a owl:Class ; rdfs:label "Course" .`;
let app: ElectronApplication, main: Page, page: Page, specimen: Page;
const host = () => page.locator('.adaptive-pane[data-pane-id="details"]');
const pane = () => host().locator(".details-pane:visible");
const state = () =>
  main.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  const target = (await app.browserWindow(page)).evaluate((win) => win.id);
  await app.evaluate(
    ({ Menu, BrowserWindow }, { id, target }) => {
      const win = BrowserWindow.fromId(target)!;
      Menu.getApplicationMenu()!
        .getMenuItemById(id)!
        .click({} as never, win, win.webContents as never);
    },
    { id, target: await target },
  );
}
async function launch(theme: "light" | "dark") {
  expect(
    createHash("sha256")
      .update(await readFile(reference))
      .digest("hex"),
  ).toBe(hash);
  await mkdir("artifacts/issue-57", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-57/profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  const file = path.join(profile, "courses.ttl");
  await writeFile(file, ontology);
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
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
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    BrowserWindow.getAllWindows().forEach((win) => win.setFocusable(false));
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "TechnicalAlgebra"),
    )
    .toBe(true);
  await main.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "Course",
  );
  await menu("view.details");
  await expect(pane().locator(".name")).toHaveText("Course");
  await main.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + "TechnicalAlgebra",
  );
  await expect(pane().locator(".name")).toHaveText("Technical Algebra");
  await pane().getByRole("button", { name: "Back", exact: true }).focus();
  const detached = app.waitForEvent("window");
  await menu("pane.detach");
  page = await detached;
  await expect(pane()).toBeVisible();
  const win = await app.browserWindow(page);
  await win.evaluate((win) => {
    win.setFocusable(false);
    win.unmaximize();
    win.setMinimumSize(100, 100);
  });
  await expect.poll(() => win.evaluate((win) => win.isMaximized())).toBe(false);
  await win.evaluate((win) => win.setContentSize(1200, 800));
  const opened = app.waitForEvent("window");
  await app.evaluate(async ({ BrowserWindow }, reference) => {
    const win = new BrowserWindow({
      width: 1250,
      height: 900,
      show: false,
      focusable: false,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadFile(reference);
    win.showInactive();
  }, reference);
  specimen = await opened;
  await specimen.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    theme,
  );
}
async function resize(width: number, height: number) {
  for (const root of [host()])
    await root.evaluate(
      (el, { width, height }) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          width: width + "px",
          height: height + "px",
          zIndex: "1000",
        }),
      { width, height },
    );
  await specimen.locator(".frame").evaluate(
    (el, { width, height }) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "16px",
        top: "16px",
        width: width + 16 + "px",
        height: height + 16 + "px",
        zIndex: "1000",
      }),
    { width, height },
  );
  await expect
    .poll(async () => (await pane().boundingBox())!.width)
    .toBe(width);
  await expect
    .poll(async () => (await pane().boundingBox())!.height)
    .toBe(height);
}
async function capture(root: Locator) {
  // Give each specimen the same compositing boundary; no geometry or visual styles change.
  await root.evaluate(
    (el) => ((el as HTMLElement).style.transform = "translateZ(0)"),
  );
  const b = (await root.boundingBox())!;
  await root.page().mouse.move(1, 1);
  await root
    .page()
    .evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const take = () =>
    root.page().screenshot({ clip: b, animations: "disabled", scale: "css" });
  let previous = await take();
  for (let i = 0; i < 6; i++) {
    const next = await take();
    if (next.equals(previous)) return next;
    previous = next;
  }
  throw Error("Unstable screenshot");
}
const layoutData = (root: Locator) =>
  root.evaluate((el) => {
    const o = el.getBoundingClientRect();
    return [
      ...el.querySelectorAll(
        ".phead,.card,.join,.fan,.scount,table,th,td,input,.addrow,.srcline,.src,.srcnote,.pfoot",
      ),
    ]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      })
      .map((e) => {
        const b = e.getBoundingClientRect(),
          c = getComputedStyle(e);
        return [
          e.tagName,
          e.className,
          [b.x - o.x, b.y - o.y, b.width, b.height],
          c.font,
          c.color,
          c.backgroundColor,
          c.padding,
        ];
      });
  });

async function compare(name: string) {
  const actual = await capture(pane());
  const expected = await capture(specimen.locator(".pane"));
  const appLayout = await layoutData(pane()),
    referenceLayout = await layoutData(specimen.locator(".pane"));
  await writeFile(`artifacts/issue-57/${name}-app.png`, actual);
  await writeFile(`artifacts/issue-57/${name}-reference.png`, expected);
  const differences = await app.evaluate(
    ({ nativeImage }, images) => {
      const [a, b] = images.map((image) =>
        nativeImage.createFromBuffer(Buffer.from(image, "base64")),
      );
      const p = a.toBitmap(),
        q = b.toBitmap();
      if (p.length !== q.length) throw Error("Image dimensions differ");
      let pixels = 0,
        aboveRounding = 0,
        maxChannelDifference = 0;
      const rows: Record<number, number> = {};
      const boxes: number[][] = [];
      for (let i = 0; i < p.length; i += 4)
        if (p.readUInt32LE(i) !== q.readUInt32LE(i)) {
          pixels++;
          const delta = Math.max(
            ...[0, 1, 2, 3].map((channel) =>
              Math.abs(p[i + channel] - q[i + channel]),
            ),
          );
          maxChannelDifference = Math.max(maxChannelDifference, delta);
          if (delta > 2) aboveRounding++;
          const y = Math.floor(i / 4 / a.getSize().width);
          rows[y] = (rows[y] ?? 0) + 1;
          boxes.push([(i / 4) % a.getSize().width, y]);
        }
      return {
        pixels,
        aboveRounding,
        maxChannelDifference,
        rows,
        boxes: boxes.slice(0, 200),
      };
    },
    [actual.toString("base64"), expected.toString("base64")],
  );
  await writeFile(
    `artifacts/issue-57/${name}-layout.json`,
    JSON.stringify(
      { differences, app: appLayout, reference: referenceLayout },
      null,
      2,
    ),
  );
  // Independent Chromium surfaces can round antialiased corners by 1–2 RGB
  // levels. No masks, pixel-count budget, or perceptual threshold: every channel
  // of every pixel must agree within that rounding, and geometry/styles are exact.
  expect
    .soft(differences.aboveRounding, name + " pixels beyond 2/255 rounding")
    .toBe(0);
  expect
    .soft(
      appLayout.map((entry) => entry.slice(2)),
      name + " exact layout and styles",
    )
    .toEqual(referenceLayout.map((entry) => entry.slice(2)));
}
test.afterEach(async () => {
  if (app) await app.close();
});
async function scroll(bottom: boolean) {
  for (const root of [pane(), specimen.locator(".pane")])
    await root
      .locator(".pbody")
      .evaluate(
        (el, bottom) => (el.scrollTop = bottom ? el.scrollHeight : 0),
        bottom,
      );
}
async function matrix(theme: string, stateName: string) {
  for (const [shape, width, height] of [
    ["expanded", 1100, 660],
    ["narrow", 360, 680],
    ["shallow", 1100, 260],
    ["constrained", 360, 260],
    ["recovery-height", 1100, 100],
    ["recovery-width", 230, 260],
  ] as const) {
    await resize(width, height);
    if (!shape.startsWith("recovery")) await scroll(false);
    await compare(theme + "-" + shape + "-" + stateName);
    if (shape === "expanded" || shape === "narrow") {
      await scroll(true);
      await compare(theme + "-" + shape + "-" + stateName + "-source");
    }
  }
  await resize(1100, 660);
}
for (const theme of ["light", "dark"] as const)
  test("Details reference " + theme, async () => {
    test.setTimeout(240000);
    await launch(theme);
    await resize(1100, 660);
    const editor = () => pane().locator("textarea.src");
    await expect(editor()).toBeEnabled();
    await specimen.evaluate(
      (revision) => {
        (window as any).STORE.revision = revision;
        (window as any).render();
      },
      (await state()).version,
    );
    const original = await editor().inputValue();
    expect(original).toBe(await specimen.locator(".src").inputValue());
    await matrix(theme, "clean");
    const draft = original.replace("Algebra Tech", "Local alias");
    await editor().fill(draft);
    await specimen.locator(".src").fill(draft);
    await expect(pane().locator(".state")).toHaveClass(/pending/);
    await matrix(theme, "pending");
    expect(await editor().inputValue()).toBe(draft);
    await pane().getByRole("button", { name: "Discard", exact: true }).click();
    await specimen
      .getByRole("button", { name: "Discard", exact: true })
      .click();
    await expect(editor()).toBeEnabled();
    await editor().fill("invalid rdf {");
    await pane()
      .getByRole("button", { name: "Save source", exact: true })
      .click();
    await expect(pane().locator(".state")).toHaveClass(/invalid/);
    await expect(pane().locator(".srcerr")).toContainText(
      'Unexpected "invalid" on line 1.',
    );
    // Parser diagnostics are data. The reference's toy Turtle parser is replaced
    // here only with N3's documented diagnostic for this exact invalid fixture.
    await specimen.evaluate(() => {
      const w = window as any;
      w.S.draft = "invalid rdf {";
      w.S.error = { line: 1, message: 'Unexpected "invalid" on line 1' };
      w.render();
    });
    await matrix(theme, "invalid");
    await pane()
      .getByRole("button", { name: "Discard draft", exact: true })
      .click();
    await specimen
      .getByRole("button", { name: "Discard draft", exact: true })
      .click();
    await expect(editor()).toBeEnabled();
    await editor().fill(draft);
    await specimen.locator(".src").fill(draft);
    await main.evaluate(async (iri) => {
      const doc = await window.axiom.request<any>("entityDocument", { iri });
      await window.axiom.request("updateEntity", {
        iri,
        nextIri: iri,
        version: doc.version,
        datasetEpoch: doc.datasetEpoch,
        preserveSelection: true,
        statements: doc.statements.map((t: any) =>
          t.object.value === "Algebra Tech"
            ? { ...t, object: { ...t.object, value: "Remote alias" } }
            : t,
        ),
      });
    }, base + "TechnicalAlgebra");
    await expect(pane().locator(".state")).toHaveClass(/pending/);
    await pane()
      .getByRole("button", { name: "Save source", exact: true })
      .click();
    await expect(pane().locator(".state")).toHaveClass(/stale/);
    await specimen.evaluate(
      (revision) => {
        const w = window as any;
        w.STORE.statements.find(
          (s: any) => s.pred === "rdfs:seeAlso",
        ).values[0] = "Remote alias";
        w.axiomDetails.stale();
        w.STORE.revision = revision;
        w.render();
      },
      (await state()).version,
    );
    await matrix(theme, "stale");
    expect(await editor().inputValue()).toBe(draft);
  });
