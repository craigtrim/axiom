// craigtrim/axiom#79: compare the pane with the hashed reference, not an app baseline.
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
import { runInNewContext } from "node:vm";
import path from "node:path";
import { entityHue } from "../../src/shared/text-analysis";

let app: ElectronApplication, page: Page, specimen: Page;
const reference = path.resolve(
  "tests/fixtures/text-analysis-visual/visual-reference.html",
);
const output = path.resolve(
  process.env.AXIOM_VISUAL_OUTPUT ?? "artifacts/issue-79-visual",
);
const host = () => page.locator('.adaptive-pane[data-pane-id="textanalysis"]');
const pane = () => page.locator(".text-analysis-panel");
const editor = () => pane().getByRole("textbox", { name: "Text to analyze" });
const menuCommand = async (id: string) =>
  app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);

async function launch(theme: string) {
  const bytes = await readFile(reference);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "9b03390692b0871189b2120186238921568079afe65ebf7e851aaa55d6542b04",
  );
  const html = bytes.toString("utf8");
  // Only the reference's fixture data/matcher supplies parse replies. Native parsing
  // and navigation are exercised separately by text-analysis.spec.ts.
  const fixture = runInNewContext(
    html.slice(html.indexOf("var ONTOLOGY ="), html.indexOf("var S =")) +
      ";({sample:SAMPLE,matches:analyze(SAMPLE)})",
  ) as {
    sample: string;
    matches: { id: string; label: string; hue: number; text: string }[];
  };
  const matches = fixture.matches.map((match) => {
    let key = match.id,
      suffix = 0;
    while (1 + (entityHue(key) % 6) !== match.hue) key = match.id + ++suffix;
    return { ...match, key };
  });
  await mkdir(output, { recursive: true });
  const profile = await mkdtemp(path.join(output, "profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  const ontology = path.join(profile, "courses.owl");
  await writeFile(
    ontology,
    `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#"><owl:Class rdf:about="urn:course"/></rdf:RDF>`,
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
      "--disable-gpu",
      "--force-color-profile=srgb",
    ],
    env,
  });
  page = await app.firstWindow();
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(
    ({ BrowserWindow, dialog, ipcMain }, { ontology, matches }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setFocusable(false);
      win.unmaximize();
      win.setSize(1200, 900);
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [ontology],
      });
      ipcMain.removeHandler("textAnalysis:parse");
      ipcMain.handle("textAnalysis:parse", (_event, input) => {
        const entities: any[] = [];
        const unique = new Map(matches.map((m) => [m.text, m]));
        for (const m of unique.values()) {
          let start = input.text.indexOf(m.text);
          while (start >= 0) {
            entities.push({
              key: m.key,
              label: m.label,
              source: "ontology",
              method: "label",
              start,
              end: start + m.text.length,
            });
            start = input.text.indexOf(m.text, start + m.text.length);
          }
        }
        entities.sort((a, b) => a.start - b.start || b.end - a.end);
        let end = -1;
        return {
          ...input,
          canonical: input.text,
          milliseconds: 1,
          concepts: {},
          entities: entities.filter((e) => {
            if (e.start < end) return false;
            end = e.end;
            return true;
          }),
        };
      });
    },
    { ontology, matches },
  );
  await menuCommand("file.open");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.axiom.request<any>("state")).ontology.name,
      ),
    )
    .toBe("courses.owl");
  await menuCommand("view.textanalysis");
  await expect(editor()).toBeVisible();
  await editor().focus();
  await page.keyboard.insertText(fixture.sample);
  await expect(pane().locator(".state")).toHaveText("15 matches");
  const opened = app.waitForEvent("window");
  // #165: #128 explicitly replaced click navigation and its help copy. Keep the
  // hashed #79 design and its pixel assertions; apply only that approved wording.
  const previousHelp = " Click a highlight to open <b>Details</b>.";
  expect(html.split(previousHelp)).toHaveLength(2);
  const currentReference = html.replace(
    previousHelp,
    " Ctrl+click a highlight to open <b>Details</b>.",
  );
  await app.evaluate(async ({ BrowserWindow }, currentReference) => {
    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      focusable: false,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(currentReference),
    );
    win.showInactive();
  }, currentReference);
  specimen = await opened;
  await specimen.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    theme,
  );
  // The three corrections explicitly approved in #79.
  await specimen.addStyleTag({
    content:
      ".btn.primary:disabled{color:var(--idle);background:none}.recov{grid-row:1/-1}.dock{border-radius:0}:root{--border-ctl:#7d868f}:root[data-theme=dark]{--border-ctl:#5f6a78}.sw[aria-checked=true],.seg,.seg button+button{border-color:var(--border-ctl)}",
  });
  await specimen
    .locator("#recovBtn")
    .evaluate((el) => (el.textContent = "Maximize pane"));
}
async function resize(width: number, height: number) {
  await host().evaluate(
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
  await specimen.locator(".dock").evaluate(
    (el, { width, height }) => {
      Object.assign((el as HTMLElement).style, {
        width: width + 2 + "px",
        height: height + 30 + "px",
      });
      window.dispatchEvent(new Event("resize"));
    },
    { width, height },
  );
  await expect
    .poll(async () => Math.round((await host().boundingBox())!.width))
    .toBe(width);
}
async function blur() {
  for (const p of [page, specimen]) {
    await p.mouse.move(1, 1);
    await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  }
}
async function capture(root: Locator) {
  const box = (await root.boundingBox())!;
  return root
    .page()
    .screenshot({ clip: box, animations: "disabled", scale: "css" });
}
async function compare(
  name: string,
  region?: string,
  keepFocus = false,
  cornerPixels = 0,
) {
  if (!keepFocus) await blur();
  const inspect = async (root: Locator) =>
    root.evaluate((el) =>
      [el, ...el.querySelectorAll("*")]
        .filter((e) => (e as HTMLElement).checkVisibility())
        .map((e) => {
          const c = getComputedStyle(e),
            r = e.getBoundingClientRect();
          return {
            tag: e.tagName,
            cls: e.className,
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            border: c.border,
            shadow: c.boxShadow,
            font: c.font,
            opacity: c.opacity,
          };
        }),
    );
  await writeFile(
    path.join(output, name + "-layout.json"),
    JSON.stringify(
      {
        app: await inspect(host()),
        reference: await inspect(specimen.locator(".pane")),
      },
      null,
      2,
    ),
  );
  const actual = await capture(region ? pane().locator(region) : host());
  const expected = await capture(
    region ? specimen.locator(region) : specimen.locator(".pane"),
  );
  await writeFile(path.join(output, name + "-app.png"), actual);
  await writeFile(path.join(output, name + "-reference.png"), expected);
  const diff = await app.evaluate(
    ({ nativeImage }, data) => {
      const [a, b] = data.map((v) =>
        nativeImage.createFromBuffer(Buffer.from(v, "base64")),
      );
      const p = a.toBitmap(),
        q = b.toBitmap();
      if (
        p.length !== q.length ||
        a.getSize().width !== b.getSize().width ||
        a.getSize().height !== b.getSize().height
      )
        return { pixels: -1, actual: a.getSize(), expected: b.getSize() };
      let pixels = 0;
      const rows: Record<number, number> = {};
      for (let i = 0; i < p.length; i += 4)
        if ([0, 1, 2].some((c) => Math.abs(p[i + c] - q[i + c]) > 2)) {
          pixels++;
          const y = Math.floor(i / 4 / a.getSize().width);
          rows[y] = (rows[y] ?? 0) + 1;
        }
      return { pixels, rows };
    },
    [actual.toString("base64"), expected.toString("base64")],
  );
  await writeFile(
    path.join(output, name + "-diff.json"),
    JSON.stringify(diff, null, 2),
  );
  // Monaco rounds each wrapped decoration fragment; the HTML backdrop slices its mark.
  // Only the documented 24 corner pixels may differ in wrapped editor frames.
  // #165: retain failed images for CI diagnosis without changing the comparison.
  if (diff.pixels < 0 || diff.pixels > cornerPixels) {
    await test
      .info()
      .attach(name + " actual", { body: actual, contentType: "image/png" });
    await test
      .info()
      .attach(name + " expected", { body: expected, contentType: "image/png" });
    await test.info().attach(name + " layout", {
      path: path.join(output, name + "-layout.json"),
      contentType: "application/json",
    });
  }
  expect.soft(diff.pixels, name + " dimensions").toBeGreaterThanOrEqual(0);
  expect.soft(diff.pixels, name).toBeLessThanOrEqual(cornerPixels);
}
async function openMenus() {
  await pane()
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await specimen.locator("#more").click();
  // #79 decision 1 keeps an access-key label together as one flex child.
  await specimen.locator(".menu button").evaluateAll((buttons) =>
    buttons.forEach((button) => {
      const label = document.createElement("span");
      for (const node of [...button.childNodes])
        if (!(node instanceof HTMLElement && node.classList.contains("k")))
          label.append(node);
      label.textContent = label.textContent;
      button.prepend(label);
    }),
  );
}
async function closeMenus() {
  await page.keyboard.press("Escape");
  await specimen.keyboard.press("Escape");
  // Screenshots blur controls, so dispatch to the menus themselves.
  if (await pane().locator(".menu:popover-open").count())
    await pane().locator(".menu").press("Escape");
  if (await specimen.locator(".menu").count())
    await specimen.locator(".menu").press("Escape");
}
test.afterEach(async () => {
  if (app) await app.close();
});
for (const theme of ["light", "dark"])
  test(`Text Analysis reference ${theme}`, async () => {
    test.setTimeout(180000);
    await launch(theme);
    await resize(758, 530);
    await compare(theme + "-01-expanded");
    await editor().focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
    await specimen.locator("#ta").evaluate((element: HTMLTextAreaElement) => {
      element.focus();
      const at = element.value.indexOf("Media Studies") + 3;
      element.setSelectionRange(at, at);
      element.ownerDocument.dispatchEvent(new Event("selectionchange"));
    });
    await page.addStyleTag({
      content: ".text-analysis-panel .cursor{visibility:hidden!important}",
    });
    await specimen.addStyleTag({ content: "#ta{caret-color:transparent}" });
    await compare(theme + "-02-caret", undefined, true);
    await blur();
    await openMenus();
    await compare(theme + "-06-menu");
    await closeMenus();
    await openMenus();
    await page.keyboard.press("h");
    await specimen.keyboard.press("h");
    await compare(theme + "-07-help");
    await pane().getByRole("button", { name: "Close help" }).click();
    await specimen.locator("#sheetX").click();
    for (const p of [page, specimen])
      await p.locator(p === page ? ".sw" : "#auto").click();
    await compare(theme + "-manual-current");
    await editor().focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.insertText("Notes ");
    await specimen.locator("#ta").focus();
    await specimen.keyboard.press("Control+Home");
    await specimen.keyboard.insertText("Notes ");
    await compare(theme + "-manual-stale");
    await pane()
      .getByRole("button", { name: "Analyze now", exact: true })
      .click();
    await specimen.locator("#go").click();
    await expect(pane().locator(".state")).toHaveText("15 matches");
    for (const p of [page, specimen])
      await p.locator(p === page ? ".sw" : "#auto").click();
    await pane().getByRole("button", { name: "Summary", exact: true }).click();
    await specimen.locator("#segSum").click();
    await compare(theme + "-summary");
    await pane().getByRole("button", { name: "Text", exact: true }).click();
    await specimen.locator("#segText").click();
    for (const [width, height] of [
      [418, 530],
      [358, 530],
      [298, 530],
      [378, 270],
      [758, 270],
      [218, 270],
    ]) {
      await resize(width, height);
      await compare(
        `${theme}-${width}x${height}`,
        undefined,
        false,
        [358, 298, 378].includes(width) ? 24 : 0,
      );
      if ([418, 358, 298].includes(width)) {
        await openMenus();
        await compare(
          `${theme}-${width}-menu`,
          undefined,
          false,
          width === 418 ? 0 : 24,
        );
        await closeMenus();
      }
    }
    await resize(758, 530);
    // Frame 16 settles its explicit analysis before showing the retained toast.
    for (const p of [page, specimen])
      await p.locator(p === page ? ".sw" : "#auto").click();
    await editor().focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.insertText("Notes ");
    await specimen.locator("#ta").focus();
    await specimen.keyboard.press("Control+Home");
    await specimen.keyboard.insertText("Notes ");
    await pane()
      .getByRole("button", { name: "View in Graph", exact: true })
      .click();
    await specimen.locator("#graph").click();
    await expect(pane().locator(".state")).toHaveText("15 matches");
    await compare(theme + "-16-toast");
    await expect(pane().locator(".toast")).toHaveCount(0, { timeout: 6000 });
    await expect(specimen.locator("#toast")).toBeHidden({ timeout: 6000 });
    for (const p of [page, specimen])
      await p.locator(p === page ? ".sw" : "#auto").click();
    await editor().focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await specimen.locator("#ta").fill("");
    await expect(pane().locator(".state")).toHaveText("0 matches");
    await compare(theme + "-empty");
    // Expired session notices must not be replayed by a freshly mounted pane.
    await menuCommand("pane.close");
    await expect(pane()).toHaveCount(0);
    await menuCommand("view.textanalysis");
    await expect(editor()).toBeVisible();
    await expect(pane().locator(".toast")).toHaveCount(0);
  });
