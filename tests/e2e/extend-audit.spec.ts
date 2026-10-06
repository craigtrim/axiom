import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { extendBase, extendOntology } from "../fixtures/extend-visual/ontology";
import type { Snapshot } from "../../src/shared/protocol";

let app: ElectronApplication, main: Page, page: Page;
const longName = "Psychology" + "UnbrokenName".repeat(17);
const pane = () => page.locator('[data-panel="find"]');
const host = () => page.locator('[data-pane-id="find"]');
const query = () => pane().getByRole("searchbox");
const row = (name = "Psychology") =>
  pane()
    .locator(".find-results tbody tr")
    .filter({
      has: page.getByRole("button", { name, exact: true }),
    });
const trigger = (name = "Psychology") =>
  row(name).getByRole("button", { name: `More ways to extend ${name}` });
const popup = () => page.getByRole("menu");
const editor = () =>
  pane().getByRole("region", { name: "Add to the ontology", exact: true });
async function menu(id: string) {
  const targetId = await (await app.browserWindow(page)).evaluate((w) => w.id);
  await app.evaluate(
    ({ Menu, BrowserWindow }, { id, targetId }) => {
      const w = BrowserWindow.fromId(targetId)!;
      Menu.getApplicationMenu()!
        .getMenuItemById(id)!
        .click({} as never, w, w.webContents as never);
    },
    { id, targetId },
  );
}
async function size(width: number, height: number) {
  const inset = await host().evaluate((el) => ({
    width: innerWidth - el.getBoundingClientRect().width,
    height: innerHeight - el.getBoundingClientRect().height,
  }));
  await (
    await app.browserWindow(page)
  ).evaluate(
    (w, s) => {
      w.unmaximize();
      w.setMinimumSize(100, 100);
      w.setContentSize(Math.round(s.width), Math.round(s.height));
    },
    { width: width + inset.width, height: height + inset.height },
  );
  await expect
    .poll(async () => Math.round((await host().boundingBox())!.width))
    .toBe(width);
  await expect
    .poll(async () => Math.round((await host().boundingBox())!.height))
    .toBe(height);
}
async function zoom(value: number) {
  const previous = Number(await host().getAttribute("data-pane-zoom"));
  await host().dispatchEvent("wheel", {
    ctrlKey: true,
    deltaMode: 0,
    deltaY: -Math.log(value / previous) / 0.0015,
  });
  await expect(host()).toHaveAttribute("data-pane-zoom", String(value));
}
async function open(name = "Psychology") {
  await row(name).scrollIntoViewIfNeeded();
  await row(name).focus();
  await trigger(name).click();
  await expect(popup()).toBeVisible();
  await page.mouse.move(0, 0);
}
async function fitsViewport(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1
        );
      }),
    )
    .toBe(true);
}
async function anchored() {
  await expect
    .poll(async () => {
      const a = (await popup().boundingBox())!,
        b = (await trigger().boundingBox())!;
      return Math.abs(a.x + a.width - b.x - b.width);
    })
    .toBeLessThan(1);
}
async function noOverflow(target: Locator) {
  await expect
    .poll(() => target.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
    .toBe(true);
}
async function capture(name: string) {
  await mkdir("artifacts/issue-56", { recursive: true });
  await page.screenshot({ path: `artifacts/issue-56/${name}.png` });
}

test.beforeEach(async () => {
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/testing/extend-audit-"),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  main = page = await app.firstWindow();
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await (
    await app.browserWindow(page)
  ).evaluate((w) => {
    w.setFocusable(false);
    w.unmaximize();
    w.setContentSize(1280, 900);
  });
  const file = path.join(profile, "extend-audit.ttl");
  await writeFile(
    file,
    extendOntology + `\n:Long a owl:Class; rdfs:label "${longName}".\n`,
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
  await expect
    .poll(
      async () =>
        (await main.evaluate(() => window.axiom.request<Snapshot>("state")))
          .ontology.name,
    )
    .toBe("extend-audit.ttl");
  await menu("view.find");
  await query().fill("Psy");
  await expect(row()).toBeVisible();
  await expect(pane().locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await query().focus();
  const detached = app.waitForEvent("window");
  await menu("pane.detach");
  page = await detached;
  await (
    await app.browserWindow(page)
  ).evaluate((w) => {
    w.setFocusable(false);
    w.unmaximize();
  });
  await expect(pane()).toBeVisible();
  await size(760, 558);
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && page && !page.isClosed())
      await info.attach("Find audit failure", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
  } finally {
    await app?.close();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`#56 ${theme}: dropdown follows native resize and live pane zoom`, async () => {
    await menu("theme." + theme);
    await open();
    await size(850, 600);
    await anchored();
    await fitsViewport(popup());
    await capture(`${theme}-resized-menu`);
    await popup().press("Escape");
    await size(760, 558);
    await open();
    await zoom(1.1);
    await anchored();
    await fitsViewport(popup());
    await capture(`${theme}-zoomed-open-menu`);
    await popup().getByRole("menuitem").last().focus();
    await size(240, 210);
    await zoom(2);
    await fitsViewport(popup());
    await fitsViewport(popup().getByRole("menuitem").last());
  });
  test(`#56 ${theme}: minimum pane and zoom keep choices and keyboard focus visible`, async () => {
    await menu("theme." + theme);
    await size(240, 210);
    await open();
    await fitsViewport(popup());
    await noOverflow(popup());
    await popup().press("Escape");
    await zoom(2);
    await open();
    await fitsViewport(popup());
    await noOverflow(popup());
    const items = popup().getByRole("menuitem");
    await items.first().focus();
    await items.first().press("End");
    await expect(items.last()).toBeFocused();
    await fitsViewport(items.last());
    await capture(`${theme}-minimum-zoom-end`);
    await items.last().press("Home");
    await expect(items.first()).toBeFocused();
    await fitsViewport(items.first());
    await capture(`${theme}-minimum-zoom-home`);
  });
  test(`#56 ${theme}: recovery dismisses the open dropdown and restores working focus`, async () => {
    await menu("theme." + theme);
    await open();
    await size(238, 558);
    await expect(host()).toHaveAttribute("data-pane-recovery", "true");
    await expect(page.locator(".ext-menu")).toHaveCount(0);
    const recover = page.getByRole("button", {
      name: "Maximize pane",
      exact: true,
    });
    await expect(recover).toBeFocused();
    await capture(`${theme}-recovery`);
    await recover.click();
    await expect(host()).toHaveAttribute("data-pane-recovery", "false");
    await expect(trigger()).toBeFocused();
    // A keyboard-open menu owns focus in an item that is removed in recovery.
    // Restore a visible working input when that original element no longer exists.
    await trigger().press("Enter");
    await expect(popup().getByRole("menuitem").first()).toBeFocused();
    await size(238, 558);
    await expect(recover).toBeFocused();
    await expect(page.locator(".ext-menu")).toHaveCount(0);
    await recover.click();
    await expect(query()).toBeFocused();
  });
  test(`#56 ${theme}: long target names remain readable in the menu and context`, async () => {
    await menu("theme." + theme);
    for (const width of [760, 360]) {
      await size(width, 558);
      await open(longName);
      await noOverflow(popup());
      await fitsViewport(popup());
      await expect(popup().locator(".ext-caption").first()).toContainText(
        longName,
      );
      await capture(`${theme}-${width}-long-menu`);
      await page.getByRole("menuitem", { name: /^Subclass/ }).click();
      await noOverflow(pane().locator(".extend-context"));
      await expect(pane().locator(".extend-context")).toContainText(longName);
      await capture(`${theme}-${width}-long-context`);
      await pane()
        .getByRole("button", { name: "Back to results", exact: true })
        .click();
    }
  });
  test(`#56 ${theme}: visible separators and accessible split targets`, async () => {
    await menu("theme." + theme);
    await open();
    expect((await trigger().boundingBox())!.width).toBeGreaterThanOrEqual(24);
    for (const separator of await popup().getByRole("separator").all()) {
      expect((await separator.boundingBox())!.width).toBeGreaterThan(0);
      expect((await separator.boundingBox())!.height).toBe(1);
    }
    const result = await new AxeBuilder({ page })
      .setLegacyMode()
      .include(".entity-extend[data-open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await capture(`${theme}-expanded-accessibility`);
    await popup().press("Escape");
    await size(500, 558);
    await open();
    const separator = popup().getByRole("separator");
    expect((await separator.boundingBox())!.height).toBe(1);
    expect((await separator.boundingBox())!.width).toBeGreaterThan(0);
    await capture(`${theme}-folded-separator`);
  });
}

test("#56 outside dismissal keeps the clicked input's focus and accepts typing", async () => {
  await open();
  await query().click();
  await expect(popup()).toHaveCount(0);
  await expect(query()).toBeFocused();
  await page.keyboard.type("XYZ");
  await expect(query()).toHaveValue("PsyXYZ");
});
for (const [name, folded] of [
  ["Psychology", false],
  ["PSY 101 Fall 2026", false],
  ["PSY 101 Fall 2026", true],
] as const)
  test(`#56 synonym withdrawal retains row focus: ${name}, folded=${folded}`, async () => {
    if (folded) await size(500, 558);
    await row(name).focus();
    let action = row(name).getByRole("button", {
      name: `Add Psy as a synonym of ${name}`,
      exact: true,
    });
    if (folded) {
      await open(name);
      action = page.getByRole("menuitem", { name: /^Synonym/ });
    }
    await action.focus();
    await action.press("Space");
    await expect(pane().locator(".extend-confirmation")).toHaveText(
      `Psy added to ${name}`,
    );
    await expect(row(name)).toBeFocused();
    const doc = await main.evaluate(
      (iri) => window.axiom.request<any>("entityDocument", { iri }),
      extendBase + (name === "Psychology" ? name : "PSY101"),
    );
    expect(
      doc.statements.filter(
        (s: any) =>
          s.predicate.endsWith("#seeAlso") && s.object.value === "Psy",
      ),
    ).toHaveLength(1);
    if (name === "Psychology") {
      await row(name).press("Tab");
      await expect(trigger(name)).toBeFocused();
    }
    await capture(
      `focus-after-synonym-${folded ? "folded" : name === "Psychology" ? "class" : "individual"}`,
    );
  });
for (const [type, noun, target, predicate] of [
  ["NamedIndividual", "individual", "Psychology", "rdf:type"],
  ["ObjectProperty", "property", "teaches", "rdfs:subPropertyOf"],
] as const)
  test(`#56 Sibling context follows an edited ${noun} kind and the saved RDF`, async () => {
    await open("Clinical Psychology");
    await page.getByRole("menuitem", { name: /^Sibling/ }).click();
    await editor()
      .getByRole("combobox", { name: "rdf:type", exact: true })
      .selectOption("http://www.w3.org/2002/07/owl#" + type);
    if (noun === "property")
      await editor()
        .getByLabel("Parent property", { exact: true })
        .selectOption(extendBase + "teaches");
    await editor()
      .getByLabel(noun[0].toUpperCase() + noun.slice(1) + " label", {
        exact: true,
      })
      .fill("Audit " + type);
    await expect(pane().locator(".extend-context")).toHaveText(
      `Back to resultsNew ${noun}, ${noun === "individual" ? "instance" : "subproperty"} of ${target}, asserted with ${predicate}`,
    );
    const iri = await editor()
      .getByLabel("Subject IRI", { exact: true })
      .inputValue();
    await capture(`sibling-changed-${noun}`);
    await editor()
      .getByRole("button", { name: "Create " + noun, exact: true })
      .click();
    await expect
      .poll(async () =>
        (
          await main.evaluate(() => window.axiom.request<Snapshot>("state"))
        ).entities.some((e) => e.iri === iri),
      )
      .toBe(true);
    const doc = await main.evaluate(
      (iri) => window.axiom.request<any>("entityDocument", { iri }),
      iri,
    );
    expect(doc.statements).toContainEqual(
      expect.objectContaining({
        predicate:
          predicate === "rdf:type"
            ? "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
            : "http://www.w3.org/2000/01/rdf-schema#subPropertyOf",
        object: expect.objectContaining({ value: extendBase + target }),
      }),
    );
    expect(
      doc.statements.some((s: any) => s.predicate.endsWith("#subClassOf")),
    ).toBe(false);
  });
test("#56 removing a Subclass parent names the actual owl:Thing fallback", async () => {
  await open();
  await page.getByRole("menuitem", { name: /^Subclass/ }).click();
  await editor()
    .getByRole("button", {
      name: "Remove this rdfs:subClassOf value",
      exact: true,
    })
    .click();
  await expect(pane().locator(".extend-context")).toContainText(
    "subclass of owl:Thing, asserted with rdfs:subClassOf",
  );
  await expect(
    editor().getByRole("button", { name: "Create class", exact: true }),
  ).toBeEnabled();
  await capture("cleared-subclass-parent");
});
