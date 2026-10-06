import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extendOntology } from "../fixtures/extend-visual/ontology";
import type { Snapshot } from "../../src/shared/protocol";

const reference = path.resolve(
  "tests/fixtures/extend-visual/visual-reference.html",
);
const referenceHash =
  "ccf5025880e27b2536c483574d533b5e58d3f2a032c59d84a95963d0ee55a881";
let app: ElectronApplication, page: Page, specimen: Page;
const pane = () => page.locator('[data-panel="find"]');
const row = (name = "Psychology") =>
  pane()
    .locator(".find-results tbody tr")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
async function menu(id: string) {
  const target = await (
    await app.browserWindow(page)
  ).evaluate((win) => win.id);
  await app.evaluate(
    ({ Menu, BrowserWindow }, { id, target }) => {
      const win = BrowserWindow.fromId(target)!;
      Menu.getApplicationMenu()!
        .getMenuItemById(id)!
        .click({} as never, win, win.webContents as never);
    },
    { id, target },
  );
}
async function resize(width: number, height = 558) {
  await page.locator('[data-pane-id="find"]').evaluate(
    (el, size) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        width: size.width + "px",
        height: size.height + "px",
        zIndex: "1000",
      }),
    { width, height },
  );
  await expect
    .poll(async () => Math.round((await pane().boundingBox())!.width))
    .toBe(width);
}
async function quiet() {
  await page.mouse.move(0, 0);
  await specimen.mouse.move(0, 0);
}
async function openMenu(name = "Psychology") {
  await row(name).hover();
  await row(name).focus();
  await row(name)
    .getByRole("button", { name: `More ways to extend ${name}` })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(1);
  const trigger = (await row(name)
    .getByRole("button", { name: `More ways to extend ${name}` })
    .boundingBox())!;
  const popup = (await page.getByRole("menu").boundingBox())!;
  expect(
    Math.abs(popup.x + popup.width - trigger.x - trigger.width),
  ).toBeLessThan(1);
  expect(Math.abs(popup.y - trigger.y - trigger.height - 3)).toBeLessThan(1);
  await quiet();
}
async function closeMenu() {
  const open = page.locator(".ext-menu:popover-open");
  if (await open.count()) await open.press("Escape");
}
async function referenceControl(
  selector: string,
  theme: string,
  width = 760,
  replacements: [string, string][] = [],
) {
  await specimen.goto(pathToFileURL(reference).href);
  await specimen.evaluate(
    ({ selector, theme, width, replacements }) => {
      document.body.dataset.theme = theme;
      const control = document.querySelector<HTMLElement>(selector)!;
      // #55 amends only these #49 menus in memory; the pinned bytes stay intact.
      if (
        selector === "#b figure:first-child .ramenu" ||
        selector === "#e figure:nth-child(2) .ramenu"
      ) {
        const subclass = [...control.querySelectorAll<HTMLElement>(".mi")].find(
          (item) => item.querySelector(".rm-label")?.textContent === "Subclass",
        )!;
        const sibling = subclass.cloneNode(true) as HTMLElement;
        sibling.querySelector(".rm-label")!.textContent = "Sibling";
        subclass.after(sibling);
      }
      const frame = control.closest<HTMLElement>(".pane")!;
      // Specimen dimensions and the surrounding table are explicitly scaffolding
      // in #49. Render expanded controls above the published narrow threshold.
      Object.assign(frame.style, {
        position: "absolute",
        left: "24px",
        top: "24px",
        width: width + "px",
        height: "650px",
        resize: "none",
        background: theme === "dark" ? "#1e1e1e" : "#ffffff",
      });
      for (const tr of frame.querySelectorAll<HTMLElement>("tr")) {
        tr.classList.remove("is-selected");
        tr.style.background = "transparent";
      }
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      while (walker.nextNode())
        for (const [from, to] of replacements)
          walker.currentNode.textContent =
            walker.currentNode.textContent!.replaceAll(from, to);
      control.dataset.capture = "true";
      document.body.replaceChildren(frame);
    },
    { selector, theme, width, replacements },
  );
  return specimen.locator('[data-capture="true"]');
}
async function capture(control: Locator, owner: Page, pad = 0) {
  // Isolate the same paint layers on both sides. Otherwise Chromium can round
  // a fractional menu-item baseline differently in a top-layer popup and a
  // static HTML exhibit, despite identical measured text geometry.
  const saved = await control.evaluate((el) => {
    const saved = el.getAttribute("style");
    const children = [
      ...el.querySelectorAll<HTMLElement>(".mi, .ext-item"),
    ].map((child) => ({
      child,
      style: child.getAttribute("style"),
    }));
    children.forEach(({ child }) => (child.style.transform = "translateZ(0)"));
    const box = el.getBoundingClientRect();
    const menu = el.getAttribute("role") === "menu";
    const popover = el.getAttribute("popover");
    const wasOpen = el.matches(":popover-open");
    const computed = getComputedStyle(el);
    const placed = ["fixed", "absolute", "relative", "sticky"].includes(
      computed.position,
    );
    Object.assign((el as HTMLElement).style, {
      position: placed ? computed.position : "relative",
      left:
        (placed ? parseFloat(computed.left) || 0 : 0) +
        Math.ceil(box.x) -
        box.x +
        "px",
      top:
        (placed ? parseFloat(computed.top) || 0 : 0) +
        (Math.ceil(box.bottom) - Math.ceil(box.height)) -
        box.y +
        "px",
      transform: "translateZ(0)",
    });
    if (menu) {
      // Put both real menus in the same top layer at the same origin. The
      // neutral backing removes only surrounding table paint from the rounded
      // corners; no part of the control or its shadow is replaced or masked.
      const backing = document.createElement("div");
      backing.dataset.captureBacking = "true";
      Object.assign(backing.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        pointerEvents: "none",
        background:
          document.body.dataset.theme === "dark" ||
          document.documentElement.dataset.theme === "dark"
            ? "#1e1e1e"
            : "#ffffff",
      });
      document.body.append(backing);
      if (wasOpen) (el as HTMLElement).hidePopover();
      el.setAttribute("popover", "manual");
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "64px",
        top: "64px",
        right: "auto",
        bottom: "auto",
        margin: "0",
        width: box.width + "px",
        height: box.height + "px",
      });
      (el as HTMLElement).showPopover();
    }
    return {
      root: saved,
      children: children.map(({ style }) => style),
      menu,
      popover,
      wasOpen,
    };
  });
  const box = (await control.boundingBox())!;
  if (saved.menu) pad = 48; // Include the complete menu shadow against the backing.
  captureLayouts.set(
    control,
    await control.evaluate((el) => {
      const root = el.getBoundingClientRect();
      const walk = document.createTreeWalker(
        el,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      const nodes = [];
      do {
        const node = walk.currentNode;
        if (node.nodeType === 3 && !node.textContent?.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(node);
        const box =
          node instanceof Element
            ? node.getBoundingClientRect()
            : r.getBoundingClientRect();
        nodes.push({
          name: node.nodeName,
          text: node.textContent,
          x: box.x - root.x,
          y: box.y - root.y,
          width: box.width,
          height: box.height,
        });
      } while (walk.nextNode());
      return { origin: { x: root.x, y: root.y }, dpr: devicePixelRatio, nodes };
    }),
  );
  const clip = {
    x: box.x - pad,
    y: box.y - pad,
    width: Math.ceil(box.width) + pad * 2,
    height: Math.ceil(box.height) + pad * 2,
  };
  let previous = await owner.screenshot({
    clip,
    animations: "disabled",
    scale: "css",
  });
  for (let i = 0; i < 5; i++) {
    const current = await owner.screenshot({
      clip,
      animations: "disabled",
      scale: "css",
    });
    if (current.equals(previous)) {
      await control.evaluate((el, saved) => {
        if (saved.menu) {
          if (!saved.wasOpen) (el as HTMLElement).hidePopover();
          saved.popover === null
            ? el.removeAttribute("popover")
            : el.setAttribute("popover", saved.popover);
          document.querySelector('[data-capture-backing="true"]')?.remove();
        }
        saved.root === null
          ? el.removeAttribute("style")
          : el.setAttribute("style", saved.root);
        [...el.querySelectorAll(".mi, .ext-item")].forEach((child, i) => {
          const style = saved.children[i];
          style === null
            ? child.removeAttribute("style")
            : child.setAttribute("style", style);
        });
      }, saved);
      return current;
    }
    previous = current;
  }
  throw Error("The isolated control did not render stably.");
}
const captureLayouts = new Map<Locator, unknown>();

for (const theme of ["light", "dark"] as const)
  test(`#49 ${theme} isolated controls match the independent HTML with zero differing pixels`, async ({}, info) => {
    test.setTimeout(180000);
    if (["all", "changed"].includes(info.config.updateSnapshots))
      throw Error(
        "Generate expected images only from the HTML using AXIOM_UPDATE_REFERENCE=1.",
      );
    expect(
      createHash("sha256")
        .update(await readFile(reference))
        .digest("hex"),
    ).toBe(referenceHash);
    await mkdir("artifacts/testing", { recursive: true });
    await mkdir("artifacts/issue-49", { recursive: true });
    const profile = await mkdtemp(
      path.resolve("artifacts/testing/extend-visual-"),
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
      args: [
        ...(process.env.AXIOM_TEST_EXE ? [] : ["."]),
        "--force-device-scale-factor=1",
        "--disable-lcd-text",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--force-color-profile=srgb",
      ],
      env,
    });
    const errors: string[] = [];
    try {
      page = await app.firstWindow();
      page.on("pageerror", (e) => errors.push(e.message));
      await expect(page.locator(".docking-workspace")).toBeVisible();
      await (
        await app.browserWindow(page)
      ).evaluate((win) => {
        win.setFocusable(false);
        win.unmaximize();
        win.setContentSize(1100, 850);
      });
      const fixture = path.join(profile, "extend.ttl");
      await writeFile(fixture, extendOntology);
      await app.evaluate(({ dialog }, fixture) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [fixture],
        });
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
      }, fixture);
      await menu("file.open");
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
              .ontology.name,
        )
        .toBe("extend.ttl");
      await menu("view.find");
      await menu("theme." + theme);
      await resize(760);
      await pane().getByRole("searchbox").fill("Psy");
      await expect(row()).toBeVisible();
      await expect(pane().locator(".find-results-scroll")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      const referenceWindow = app.waitForEvent("window");
      await app.evaluate(async ({ BrowserWindow }, reference) => {
        const win = new BrowserWindow({
          width: 1100,
          height: 850,
          show: false,
          focusable: false,
          webPreferences: { backgroundThrottling: false },
        });
        await win.loadFile(reference);
        win.showInactive();
      }, reference);
      specimen = await referenceWindow;
      const baselinePath = path.resolve(
        `tests/fixtures/extend-visual/${theme}.json`,
      );
      const generated: Record<string, string> = {};
      const savedBaseline =
        process.env.AXIOM_UPDATE_REFERENCE === "1"
          ? { referenceHash, images: {} }
          : JSON.parse(await readFile(baselinePath, "utf8"));
      expect(savedBaseline.referenceHash).toBe(referenceHash);
      const baseline: Record<string, string> = savedBaseline.images;
      const compare = async (
        name: string,
        expectedControl: Locator,
        actualControl: Locator,
        pad = 0,
      ) => {
        await quiet();
        const expected = await capture(expectedControl, specimen, pad);
        const actual = await capture(actualControl, page, pad);
        generated[name] = expected.toString("base64");
        await writeFile(
          `artifacts/issue-49/${theme}-${name}-expected.png`,
          expected,
        );
        await writeFile(
          `artifacts/issue-49/${theme}-${name}-actual.png`,
          actual,
        );
        const differences = await app.evaluate(
          ({ nativeImage }, data) => {
            const images = data.map((value) =>
              nativeImage.createFromBuffer(Buffer.from(value, "base64")),
            );
            const expected = images[0],
              a = expected.toBitmap();
            return images.slice(1).map((image) => {
              const size = image.getSize();
              if (
                size.width !== expected.getSize().width ||
                size.height !== expected.getSize().height
              )
                return { pixels: -1, size, expected: expected.getSize() };
              const b = image.toBitmap();
              let pixels = 0;
              for (let i = 0; i < a.length; i += 4)
                if (a.readUInt32LE(i) !== b.readUInt32LE(i)) pixels++;
              return { pixels, size, expected: expected.getSize() };
            });
          },
          [
            expected.toString("base64"),
            actual.toString("base64"),
            baseline[name] ?? expected.toString("base64"),
          ],
        );
        const metrics = async (control: Locator) =>
          control.evaluate((el) =>
            [el, ...el.querySelectorAll("*")].map((node) => {
              const s = getComputedStyle(node),
                r = node.getBoundingClientRect();
              return {
                tag: node.tagName,
                text: node.textContent,
                width: r.width,
                height: r.height,
                font: s.font,
                color: s.color,
                background: s.backgroundColor,
                border: s.border,
                padding: s.padding,
                lineHeight: s.lineHeight,
                styles: Object.fromEntries(
                  [...s].map((name) => [name, s.getPropertyValue(name)]),
                ),
              };
            }),
          );
        await writeFile(
          `artifacts/issue-49/${theme}-${name}-metrics.json`,
          JSON.stringify(
            {
              differences,
              expectedLayout: captureLayouts.get(expectedControl),
              actualLayout: captureLayouts.get(actualControl),
              expected: await metrics(expectedControl),
              actual: await metrics(actualControl),
            },
            null,
            2,
          ),
        );
        await info.attach(`${theme}-${name}-expected`, {
          body: expected,
          contentType: "image/png",
        });
        await info.attach(`${theme}-${name}-actual`, {
          body: actual,
          contentType: "image/png",
        });
        expect
          .soft(
            differences.map((d) => d.pixels),
            name,
          )
          .toEqual([0, 0]);
      };

      await page.mouse.move(0, 0);
      await expect(row().locator(".entity-extend")).toHaveCSS(
        "visibility",
        "hidden",
      );
      await expect
        .poll(
          async () =>
            (await row().locator(".find-extend-column").boundingBox())!.width,
        )
        .toBe(148);
      // The column's surrounding row height/padding/border belongs to #34. Compare
      // its reserved 148 x 26 control band, with no control painted at rest.
      const restRef = await referenceControl(
        "#a figure:first-child tbody tr:first-child .c-act",
        theme,
      );
      const blank = async (cell: Locator, owner: Page) => {
        const box = (await cell.boundingBox())!;
        return owner.screenshot({
          clip: {
            x: Math.ceil(box.x),
            y: Math.ceil(box.y) + 8,
            width: 148,
            height: 26,
          },
          scale: "css",
        });
      };
      const restExpected = await blank(restRef, specimen),
        restActual = await blank(row().locator(".find-extend-column"), page);
      generated.rest = restExpected.toString("base64");
      expect.soft(restActual.equals(restExpected), "at-rest column").toBe(true);
      if (baseline.rest)
        expect(restExpected.equals(Buffer.from(baseline.rest, "base64"))).toBe(
          true,
        );

      await row().focus();
      await compare(
        "split",
        await referenceControl("#a figure:nth-child(2) .rowact.show", theme),
        row().locator(".entity-extend"),
      );
      await row("PSY 101 Fall 2026").focus();
      await compare(
        "individual",
        await referenceControl("#b figure:nth-child(3) .rowact", theme),
        row("PSY 101 Fall 2026").locator(".entity-extend"),
      );
      await openMenu();
      await compare(
        "class-menu",
        await referenceControl("#b figure:first-child .ramenu", theme),
        page.getByRole("menu"),
      );
      await closeMenu();
      await openMenu("teaches");
      await compare(
        "property-menu",
        await referenceControl("#b figure:nth-child(2) .ramenu", theme),
        page.getByRole("menu"),
      );
      await closeMenu();
      await row().focus();
      await row().press("Tab");
      await expect(row().locator(".ext-main")).toBeFocused();
      await compare(
        "main-focus",
        await referenceControl("#f figure:nth-child(2) .rowact", theme),
        row().locator(".entity-extend"),
        3,
      );

      await pane()
        .getByRole("button", { name: 'Add "Psy" as a new class', exact: true })
        .click();
      let width =
        (await pane().locator(".extend-context").boundingBox())!.width + 2;
      await compare(
        "header-context",
        await referenceControl("#d figure:first-child .ctx", theme, width, [
          ["Physiological Psychology", "Psy"],
        ]),
        pane().locator(".extend-context"),
      );
      await pane()
        .getByRole("button", { name: "Back to results", exact: true })
        .click();
      for (const [name, target, item, selector, changes] of [
        [
          "subclass-context",
          "Psychology",
          "Subclass",
          "#d figure:nth-child(2) .ctx",
          [],
        ],
        [
          "sibling-context",
          "Psychology",
          "Sibling",
          "#d figure:nth-child(2) .ctx",
          [
            ["Psychology", "owl:Thing"],
            ["subclass of", "sibling of Psychology, under"],
          ],
        ],
        [
          "instance-context",
          "General Psychology",
          "Instance",
          "#d figure:nth-child(3) .ctx",
          [],
        ],
        [
          "subproperty-context",
          "teaches",
          "Subproperty",
          "#d figure:nth-child(2) .ctx",
          [
            ["class", "property"],
            ["subclass", "subproperty"],
            ["Psychology", "teaches"],
            ["rdfs:subClassOf", "rdfs:subPropertyOf"],
          ],
        ],
      ] as const) {
        await openMenu(target);
        await page
          .getByRole("menuitem", { name: new RegExp("^" + item) })
          .click();
        width =
          (await pane().locator(".extend-context").boundingBox())!.width + 2;
        await compare(
          name,
          await referenceControl(
            selector,
            theme,
            width,
            changes.map((p) => [...p]) as [string, string][],
          ),
          pane().locator(".extend-context"),
        );
        await pane()
          .getByRole("button", { name: "Back to results", exact: true })
          .click();
      }
      await resize(760, 320);
      await expect(pane()).toHaveAttribute("data-layout", "shallow");
      await row().scrollIntoViewIfNeeded();
      await row().focus();
      await compare(
        "shallow-split",
        await referenceControl("#a figure:nth-child(2) .rowact.show", theme),
        row().locator(".entity-extend"),
      );
      await resize(500);
      await expect(pane()).toHaveAttribute("data-layout", "narrow");
      await row().focus();
      await expect
        .poll(
          async () =>
            (await row().locator(".find-extend-column").boundingBox())!.width,
        )
        .toBe(44);
      await compare(
        "folded",
        await referenceControl(
          "#e figure:first-child tr:first-child .ra-main",
          theme,
          420,
        ),
        row().locator(".ext-action"),
      );
      await openMenu();
      await compare(
        "folded-menu",
        await referenceControl("#e figure:nth-child(2) .ramenu", theme, 420),
        page.getByRole("menu"),
      );
      await closeMenu();
      await resize(500, 320);
      await expect(pane()).toHaveAttribute("data-layout", "constrained");
      await row().focus();
      await compare(
        "constrained-folded",
        await referenceControl(
          "#e figure:first-child tr:first-child .ra-main",
          theme,
          420,
        ),
        row().locator(".ext-action"),
      );
      await resize(760);
      await row().focus();
      await row()
        .getByRole("button", {
          name: "Add Psy as a synonym of Psychology",
          exact: true,
        })
        .click();
      await expect(pane().locator(".extend-confirmation")).toHaveText(
        "Psy added to Psychology",
      );
      width =
        (await pane().locator(".extend-confirmation").boundingBox())!.width + 2;
      await compare(
        "confirmation",
        await referenceControl(
          "#c figure:nth-child(2) .toastline",
          theme,
          width,
          [["Physiological Psychology", "Psy"]],
        ),
        pane().locator(".extend-confirmation"),
      );
      if (process.env.AXIOM_UPDATE_REFERENCE === "1")
        await writeFile(
          baselinePath,
          JSON.stringify({ referenceHash, images: generated }, null, 2) + "\n",
        );
      else expect(Object.keys(generated)).toEqual(Object.keys(baseline));
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
