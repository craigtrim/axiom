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
import {
  defaultQualityOptions,
  qualityRules,
} from "../../src/shared/ontology-quality";
const reference = path.resolve(
  "tests/fixtures/quality-settings-visual/visual-reference.html",
);
const hash = "ee21c1b68a1a4ca50053ee368a79ff1031f9c392d820ba470c996181d2e0247a";
const base = "http://devry.edu/courses#";
let app: ElectronApplication, page: Page;
const pane = () => page.locator("[data-panel=quality]");
const host = () => page.locator('[data-pane-id="quality"]');
const census = {
  census: {
    RDFS: ["http://www.w3.org/2000/01/rdf-schema#label"],
    OWL: ["http://www.w3.org/2002/07/owl#Class"],
    SKOS: ["http://www.w3.org/2004/02/skos/core#altLabel"],
  },
  kinds: { Class: 5559, Defined: 612, AnnotationProperty: 11, Datatype: 1 },
};
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
  await mkdir("artifacts/issue-65", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-65/profile-"));
  const options = {
    ...defaultQualityOptions(),
    kinds: ["Class", "Defined"],
    namespace: "devry.edu/courses",
    root: base + "Shop_Class",
  };
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({
      version: 1,
      theme,
      panelState: { "quality.options": options },
    }),
  );
  const file = path.join(profile, "courses.ttl");
  await writeFile(
    file,
    `@prefix : <${base}>. @prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. :Shop_Class a owl:Class; rdfs:label "Shop Class".`,
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
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(
    ({ BrowserWindow, dialog, ipcMain }, { file, census }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setFocusable(false);
      win.setMinimumSize(100, 100);
      win.setContentSize(1380, 850);
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      const original = (ipcMain as any)._invokeHandlers.get("domain:request");
      ipcMain.removeHandler("domain:request");
      ipcMain.handle("domain:request", (e, method, args) =>
        method === "qualityCensus" ? census : original(e, method, args),
      );
    },
    { file, census },
  );
  await menu("file.open");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.axiom.request<any>("state").then((s) => s.ontology.name),
      ),
    )
    .toBe("courses.ttl");
  await menu("tools.quality");
  await expect(pane().locator(".chipc").first()).toContainText("5,559");
  const prepared = await app.evaluate(async ({ BrowserWindow }, reference) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await win.loadFile(reference);
    const data = await win.webContents.executeJavaScript(
      `({ css:document.querySelector('style').textContent, html:document.querySelector('#set1').closest('.pane').outerHTML })`,
    );
    win.destroy();
    return data;
  }, reference);
  await page.evaluate(
    ({ prepared, theme }) => {
      const ref = document.createElement("div");
      ref.id = "settings-reference";
      ref.setAttribute("data-theme", theme);
      ref.style.cssText =
        "all:initial;font:14px/1.6 var(--font);display:none;position:absolute;inset:0;width:100%;height:100%;overflow:hidden;container-type:size";
      const shadow = ref.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${prepared.css.replace(/:root(\[[^\]]+\])/g, ":host($1)").replaceAll(":root", ":host")}</style><style>.pane {width:100%;height:100%;border:0;border-radius:0;position:relative} .pbody{scrollbar-width:none}</style>${prepared.html}`;
      // Data fields are supplied by the real store/census, not the reference's
      // inconsistent illustrative total. No geometry, palette or control edits.
      shadow.querySelector(".statusline")!.innerHTML = document.querySelector(
        ".quality-panel .statusline",
      )!.innerHTML;
      shadow.querySelector(".hint")!.textContent = document.querySelector(
        ".quality-settings .hint",
      )!.textContent;
      document
        .querySelector('[data-pane-id="quality"] .adaptive-pane-content')!
        .append(ref);
    },
    { prepared, theme },
  );
  await page.mouse.move(0, 0);
}
async function resize(width: number, height: number) {
  await host().evaluate(
    (el, size) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "72px",
        width: size.width + "px",
        height: size.height + "px",
        zIndex: "1000",
      }),
    { width, height },
  );
  await expect
    .poll(() => host().getAttribute("data-pane-narrow"))
    .toBe(String(width < 600));
  await expect
    .poll(() => host().getAttribute("data-pane-shallow"))
    .toBe(String(height < 400));
  await expect
    .poll(async () => (await pane().boundingBox())?.width)
    .toBe(width);
}
async function showReference(show: boolean) {
  await page.evaluate((show) => {
    document.querySelector<HTMLElement>("[data-panel=quality]")!.style.display =
      show ? "none" : "";
    document.querySelector<HTMLElement>("#settings-reference")!.style.display =
      show ? "block" : "none";
  }, show);
}
async function compare(name: string, selector = "") {
  const actual = selector ? pane().locator(selector) : pane();
  const ref = page.locator("#settings-reference").locator(selector || ".pane");
  const shoot = async (reference: boolean) => {
    await showReference(reference);
    const loc = reference ? ref : actual;
    // Match Chromium's compositing boundaries on both sides, as the Details
    // and Individuals comparisons do. Keep all reference pixels and geometry.
    const root = reference ? page.locator("#settings-reference") : pane();
    await root.evaluate((el) => {
      (el as HTMLElement).style.transform = "translateZ(0)";
    });
    await root
      .locator(".btn,.sel,.chipc,.tagf,.rail,.srow>.k,.hint")
      .evaluateAll((els) =>
        els.forEach((el) => {
          (el as HTMLElement).style.transform = "translateZ(0)";
        }),
      );
    const box = (await loc.boundingBox())!;
    const shot = () =>
      page.screenshot({ clip: box, animations: "disabled", scale: "css" });
    let previous = await shot();
    for (let i = 0; i < 5; i++) {
      const current = await shot();
      if (previous.equals(current)) return current;
      previous = current;
    }
    throw Error("Unstable capture");
  };
  await shoot(true);
  await shoot(false);
  const a = await shoot(false),
    e = await shoot(true);
  await showReference(false);
  await writeFile(`artifacts/issue-65/${name}-actual.png`, a);
  await writeFile(`artifacts/issue-65/${name}-expected.png`, e);
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
  await writeFile(`artifacts/issue-65/${name}.json`, JSON.stringify(result));
  expect.soft(result.pixels, name).toBe(0);
}
test.afterEach(async () => {
  await app?.close();
});
test("settings rails retain their position, running keeps four unavailable rows, and failures keep the settings", async () => {
  await launch("light");
  await resize(420, 620);
  const body = pane().locator(".pbody");
  const kinds = pane()
    .getByRole("group", { name: "Entity kinds", exact: true })
    .locator(".rail");
  const beforeTop = await body.evaluate((el) => el.scrollTop);
  await pane()
    .getByRole("button", { name: "Datatypes, 1", exact: true })
    .focus();
  await expect(
    pane().getByRole("button", { name: "Datatypes, 1", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => kinds.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  expect(await body.evaluate((el) => el.scrollTop)).toBe(beforeTop);
  const left = await kinds.evaluate((el) => el.scrollLeft);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.axiom.preferences
          .load()
          .then(
            (p) =>
              (p.panelState?.["quality.rails"] as Record<string, number>)
                ?.kinds,
          ),
      ),
    )
    .toBe(left);
  await menu("pane.close");
  await expect(pane()).toHaveCount(0);
  await menu("tools.quality");
  await expect(pane().locator(".chipc").first()).toContainText("5,559");
  await resize(420, 620);
  await expect.poll(() => kinds.evaluate((el) => el.scrollLeft)).toBe(left);
  await app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    (globalThis as any).__settingsStatus = {
      id: 700,
      state: "running",
      scanned: 12,
      total: 100,
      phase: "Checking entities",
    };
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", (event, method, args) => {
      const status = (globalThis as any).__settingsStatus;
      if (status && ["qualityStart", "qualityStatus"].includes(method))
        return status;
      return original(event, method, args);
    });
  });
  await pane().getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(pane().locator(".headline")).toHaveText("Scanning");
  await expect(pane().locator(".cbar")).toContainText("12 of 100 entities");
  await expect(pane().locator(".srow")).toHaveCount(4);
  for (const control of await pane()
    .locator(".quality-settings button,.quality-settings select")
    .all())
    await expect(control).toBeDisabled();
  await app.evaluate(() => {
    (globalThis as any).__settingsStatus = {
      id: 700,
      state: "failed",
      scanned: 12,
      total: 100,
      phase: "Failed",
      error: "Fixture scan failure",
    };
  });
  await expect(pane().locator(".headline")).toHaveText("The scan failed");
  await expect(pane()).toContainText("Fixture scan failure");
  await expect(pane().locator(".srow")).toHaveCount(4);
  await expect(
    pane().getByRole("button", { name: "Run scan", exact: true }),
  ).toBeEnabled();
  await app.evaluate(() => {
    (globalThis as any).__settingsStatus = undefined;
  });
  await pane().getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(pane().locator(".bar .sum")).toContainText(
    /Whole ontology · \d+ checks · revision \d+/,
  );
  await expect(pane().locator(".settings")).toHaveCount(0);
  await resize(239, 300);
  await expect(host().locator(".pane-recovery")).toBeVisible();
  await resize(420, 119);
  await expect(host().locator(".pane-recovery")).toBeVisible();
});
for (const theme of ["light", "dark"])
  test(`settings reference, rails and control states in ${theme}`, async () => {
    test.setTimeout(180000);
    await launch(theme);
    for (const [width, height] of [
      [1180, 620],
      [619, 620],
      [420, 620],
      [1180, 300],
      [420, 300],
    ]) {
      await resize(width, height);
      await compare(`${theme}-${width}x${height}`);
      expect(
        await pane()
          .locator(".srow")
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().height),
          ),
      ).toEqual([32, 32, 32, 32]);
    }
    await resize(1180, 620);
    const empty = pane().getByRole("button", {
      name: "Individuals, none in this ontology, unavailable",
    });
    await empty.focus();
    await page.keyboard.press("Space");
    await expect(empty).not.toHaveAttribute("aria-pressed");
    await expect(pane().locator(".sr")).toContainText("none in this ontology");
    const publication = pane().getByRole("button", {
      name: "Publication metadata",
      exact: true,
    });
    await expect(publication).toHaveAttribute("aria-pressed", "false");
    await publication.click();
    await expect(publication).toHaveAttribute("aria-pressed", "true");
    await publication.click();
    const withdrawals = pane().getByRole("button", { name: "3 withdrawn" });
    await withdrawals.click();
    const pop = pane().getByRole("region", { name: "Withdrawn checks" });
    await expect(pop.locator("li")).toHaveCount(3);
    await expect(pop).toContainText("owl:deprecated is not used here");
    await page.evaluate(
      (rows) => {
        const shadow = document.querySelector(
          "#settings-reference",
        )!.shadowRoot!;
        const pop = document.createElement("div");
        pop.className = "pop";
        pop.innerHTML =
          "<h4>Withdrawn checks</h4><ul>" +
          rows.map((row) => `<li>${row}</li>`).join("") +
          "</ul>";
        shadow.querySelector(".actline")!.after(pop);
      },
      qualityRules
        .filter((r) => r.requires === "owl:deprecated")
        .map((r) => r.title + ", because owl:deprecated is not used here"),
    );
    await withdrawals.blur();
    await page.mouse.move(0, 0);
    await compare(`${theme}-withdrawals`, ".pop");
    await withdrawals.focus();
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await expect(withdrawals).toBeFocused();
  });
