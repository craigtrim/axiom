import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Snapshot } from "../../src/shared/protocol";

// Baselines come only from the supplied HTML, never from the implementation.
// Its static sample counts are a presentation fixture. Real search/commit behavior
// is covered separately by find-redesign, find-stability and domain tests.
const reference = path.resolve(
  "tests/fixtures/find-visual/visual-reference.html",
);
const referenceHash =
  "5fb508df79392f7212bf313127e90ad2787a363ffd24ed5f95309610a32ba73c";
let app: ElectronApplication, page: Page, specimen: Page;
const pane = () => page.locator('[data-panel="find"]');
async function capture(root: Locator, label: string) {
  let previous = await root.screenshot({
    animations: "disabled",
    scale: "css",
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await root.screenshot({
      animations: "disabled",
      scale: "css",
    });
    if (previous.equals(current)) return current;
    if (attempt === 4) {
      await test.info().attach(`${label}-unstable-previous`, {
        body: previous,
        contentType: "image/png",
      });
      await test.info().attach(`${label}-unstable-current`, {
        body: current,
        contentType: "image/png",
      });
    }
    previous = current;
  }
  throw new Error(
    "The pane did not produce two consecutive identical captures.",
  );
}
async function menu(id: string) {
  const win = await app.browserWindow(page);
  const target = await win.evaluate((win) => win.id);
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
async function resize(width: number, height: number) {
  const win = await app.browserWindow(page);
  await win.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(100, 100);
  });
  await win.evaluate(
    (win, size) => win.setContentSize(size.width + 80, size.height + 80),
    { width, height },
  );
  // Isolate the real pane at the same integer origin and dimensions as the
  // specimen; docking chrome can otherwise place it on a fractional CSS pixel.
  await page.locator('[data-pane-id="find"]').evaluate(
    (host, size) =>
      Object.assign((host as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        width: `${size.width + 2}px`,
        height: `${size.height + 2}px`,
        border: "1px solid #c6c6c6",
        boxShadow: "0 2px 8px rgba(0,0,0,.14), 0 0 1px rgba(0,0,0,.24)",
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

test.beforeEach(async ({}, info) => {
  if (["all", "changed"].includes(info.config.updateSnapshots))
    throw new Error(
      "Generate baselines from the HTML with AXIOM_UPDATE_REFERENCE=1; do not bless application screenshots.",
    );
  expect(
    createHash("sha256")
      .update(await readFile(reference))
      .digest("hex"),
  ).toBe(referenceHash);
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/find-visual-"));
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  // Keep both windows at native 1x scale: CSS-size screenshots then need no
  // scale transition. Use the same SwiftShader renderer and grayscale text.
  // Raw bitmap assertions below include every antialiased pixel.
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
  page = await app.firstWindow();
  await expect(page.locator(".docking-workspace")).toBeVisible();
  const file = path.join(profile, "reference.ttl");
  await writeFile(
    file,
    `@prefix : <https://axiom.test/onto/> . @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    : a owl:Ontology . :Course a owl:Class; rdfs:label "Course" .
    :Neuroscience a owl:Class; rdfs:label "Neuroscience"; rdfs:subClassOf :Course; rdfs:comment "synaptic plasticity" .`,
  );
  await app.evaluate(({ dialog, BrowserWindow }, file) => {
    BrowserWindow.getAllWindows().forEach((win) => win.setFocusable(false));
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .ontology.name,
    )
    .toBe("reference.ttl");
  const snapshot = await page.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    const labels = [
      "Names and aliases",
      "IRI",
      "implies",
      "notPartOf",
      "owl:equivalentClass",
      "partOf",
      "rdf:type",
      "rdfs:comment",
      "rdfs:label",
      "rdfs:seeAlso",
      "rdfs:subClassOf",
      "rdfs:subPropertyOf",
      "similarTo",
      "skos:altLabel",
      "skos:definition",
      "skos:prefLabel",
    ];
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", async (event, method, args) => {
      if (method === "findSemantic") return undefined;
      if (method === "find" && args.text.trim() === "synaptic plasticity")
        return {
          rows: [],
          total: 0,
          offset: 0,
          storeTotal: 6027,
          fields: labels.map((label, index) => ({
            id: index === 0 ? "name" : index === 1 ? "iri" : label,
            label,
            count: label === "rdfs:comment" ? 1 : 0,
          })),
          kinds: ["classes", "individuals", "properties", "other"].map(
            (id, index) => ({
              id,
              label: ["Classes", "Instances", "Properties", "Other entities"][
                index
              ],
              count: 0,
            }),
          ),
          remedies: [
            { id: "fields", count: 1 },
            { id: "reset", count: 4 },
          ],
        };
      const result = await original(event, method, args);
      if (method === "findCreatePreview" && !args.creation.iri)
        return { ...result, iri: "https://axiom.test/onto/SynapticPlasticity" };
      return result;
    });
  });
  await menu("view.find");
  await expect(pane()).toBeVisible();
  const detached = app.waitForEvent("window");
  await pane().getByRole("searchbox", { name: "Search the ontology" }).focus();
  await menu("pane.detach");
  page = await detached;
  await (
    await app.browserWindow(page)
  ).evaluate((win) => win.setFocusable(false));
  await expect(pane()).toBeVisible();
  await resize(858, 558);
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("synaptic plasticity");
  await expect(pane().locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    pane().getByRole("textbox", { name: "Class label", exact: true }),
  ).toHaveValue("Synaptic Plasticity");
  await app.evaluate(
    ({ BrowserWindow }, data) =>
      BrowserWindow.getAllWindows().forEach((win) => {
        const send = win.webContents.send.bind(win.webContents);
        win.webContents.send = (channel, ...args) => {
          if (channel === "domain:event" && args[0]?.type === "state")
            args[0] = {
              ...args[0],
              data: {
                ...args[0].data,
                classCount: 6005,
                individualCount: 0,
                tripleCount: 24444,
              },
            };
          send(channel, ...args);
        };
        win.webContents.send("domain:event", { type: "state", data });
      }),
    snapshot,
  );
  const opened = app.waitForEvent("window");
  await app.evaluate(async ({ BrowserWindow }, reference) => {
    const win = new BrowserWindow({
      width: 1600,
      height: 1000,
      show: false,
      focusable: false,
      // Keep the reference rendering without taking keyboard focus. Packaged
      // Electron can suspend frames in a window that has never been shown.
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadFile(reference);
    win.showInactive();
  }, reference);
  specimen = await opened;
  await specimen.locator("#fr-zero .pane").waitFor();
});
test.afterEach(async () => {
  await app?.close();
});

for (const theme of ["light", "dark"] as const) {
  test(`reference ${theme} issue48 results actions`, async ({}, info) => {
    await menu(`theme.${theme}`);
    await pane()
      .getByRole("searchbox", { name: "Search the ontology" })
      .fill("neuro");
    await expect(
      pane().getByRole("button", {
        name: 'Add "Neuro" as a new class',
        exact: true,
      }),
    ).toBeEnabled();
    await pane().locator(".find-result-name").first().click();
    await specimen.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      const frame = document.getElementById("fr-exp")!;
      Object.assign(frame.style, {
        position: "absolute",
        left: "24px",
        top: "24px",
        resize: "none",
      });
      frame.querySelectorAll(".pin").forEach((node) => node.remove());
      document.body.replaceChildren(frame);
    }, theme);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.mouse.move(0, 0);
    await specimen.mouse.move(0, 0);
    await mkdir("artifacts/issue-48", { recursive: true });
    for (const [name, expectedControl, actualControl] of [
      [
        "create-action",
        specimen.locator("#fr-exp .rhead .od-row"),
        pane().locator(".find-result-actions"),
      ],
      [
        "synonym-action",
        specimen.locator("#fr-exp .addsyn").first(),
        pane().locator(".find-synonym").first(),
      ],
    ] as const) {
      // Compare isolated controls at integer origins in both independent renders.
      // Fractional crop edges otherwise include different neighbouring row pixels.
      for (const control of [expectedControl, actualControl])
        await control.evaluate((el) => {
          const r = el.getBoundingClientRect();
          Object.assign((el as HTMLElement).style, {
            position: "relative",
            left: `${Math.ceil(r.x) - r.x}px`,
            top: `${Math.ceil(r.y) - r.y}px`,
            transform: "translateZ(0)",
          });
        });
      const expected = await capture(expectedControl, "reference");
      const actual = await capture(actualControl, "application");
      const metrics = async (control: Locator) =>
        control.evaluate((el) =>
          [el, ...el.querySelectorAll("*")].map((node) => {
            const r = node.getBoundingClientRect(),
              s = getComputedStyle(node);
            return {
              tag: node.tagName,
              rect: { x: r.x, y: r.y, width: r.width, height: r.height },
              font: s.font,
              color: s.color,
              background: s.backgroundColor,
              padding: s.padding,
              border: s.border,
              lineHeight: s.lineHeight,
              styles: Object.fromEntries(
                [...s].map((name) => [name, s.getPropertyValue(name)]),
              ),
            };
          }),
        );
      await writeFile(
        `artifacts/issue-48/metrics-${theme}-${name}.json`,
        JSON.stringify(
          {
            expected: await metrics(expectedControl),
            actual: await metrics(actualControl),
          },
          null,
          2,
        ),
      );
      const baselinePath = info.snapshotPath(`${theme}-${name}.png`);
      if (process.env.AXIOM_UPDATE_REFERENCE === "1") {
        await mkdir(path.dirname(baselinePath), { recursive: true });
        await writeFile(baselinePath, expected);
      }
      const baseline = await readFile(baselinePath);
      await writeFile(
        `artifacts/issue-48/expected-${theme}-${name}.png`,
        expected,
      );
      await writeFile(`artifacts/issue-48/actual-${theme}-${name}.png`, actual);
      expect(expected).toMatchSnapshot(`${theme}-${name}.png`, {
        threshold: 0,
        maxDiffPixels: 0,
      });
      expect.soft(actual).toMatchSnapshot(`${theme}-${name}.png`, {
        threshold: 0,
        maxDiffPixels: 0,
      });
      const equal = await app.evaluate(
        ({ nativeImage }, buffers) => {
          const [expected, actual, baseline] = buffers.map((s) =>
            nativeImage.createFromBuffer(Buffer.from(s, "base64")).toBitmap(),
          );
          return {
            application: actual.equals(expected),
            baseline: baseline.equals(expected),
          };
        },
        [expected, actual, baseline].map((b) => b.toString("base64")),
      );
      expect.soft(equal).toEqual({ application: true, baseline: true });
    }
    await page.screenshot({ path: `artifacts/issue-48/results-${theme}.png` });
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const [name, frame] of [
    ["wide", "fr-zero"],
    ["wide-bottom", "fr-zero"],
    ["narrow", "fr-edit"],
    ["narrow-bottom", "fr-edit"],
    ["shallow", "fr-edit-s"],
    ["extra-wide", "fr-wide"],
    ["extra-wide-bottom", "fr-wide"],
    ["chain-wide", "fr-zero"],
    ["chain-wide-bottom", "fr-zero"],
    ["chain-narrow", "fr-edit"],
    ["chain-narrow-bottom", "fr-edit"],
  ] as const) {
    test(`reference ${theme} ${name} zero state`, async ({}, info) => {
      await menu(`theme.${theme}`);
      if (name.startsWith("chain")) {
        await pane()
          .getByRole("combobox", { name: "Parent classes" })
          .fill("Neuroscience");
        await page.getByRole("option", { name: /Neuroscience/ }).click();
        await pane()
          .getByRole("button", { name: "+ Add row", exact: true })
          .click();
        await pane()
          .getByRole("combobox", { name: "Predicate 1", exact: true })
          .selectOption("http://www.w3.org/2000/01/rdf-schema#seeAlso");
        await pane()
          .getByRole("textbox", { name: "Value 1", exact: true })
          .fill("Long Term Potentiation");
      }
      await specimen.evaluate(
        ({ theme, frame, name }) => {
          document.documentElement.dataset.theme = theme;
          const selected = document.getElementById(frame)!;
          // The resizable exhibit frame is outside the Find design. Its native
          // grip otherwise paints over the bottom-right pixels of the pane crop.
          selected.style.resize = "none";
          Object.assign(selected.style, {
            position: "absolute",
            left: "24px",
            top: "24px",
          });
          if (name.startsWith("chain"))
            selected
              .querySelector(".zero-editor")!
              .replaceChildren(document.querySelector("#ed-chain .ed-wrap")!);
          // #34's only exception: word match modes remain removed.
          selected.querySelectorAll(".rem").forEach((button) => {
            if (button.textContent?.startsWith("Match any word"))
              button.remove();
          });
          document.body.replaceChildren(selected);
        },
        { theme, frame, name },
      );
      const expectedPane = specimen.locator(".pane");
      const dimensions = (await expectedPane.boundingBox())!;
      await resize(dimensions.width, dimensions.height);
      await (
        await app.browserWindow(specimen)
      ).evaluate(
        (win, size) => win.setContentSize(size.width + 80, size.height + 80),
        { width: dimensions.width, height: dimensions.height },
      );
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      await page.mouse.move(0, 0);
      await specimen.mouse.move(0, 0);
      await pane()
        .locator(".find-results-scroll")
        .evaluate(
          (el, bottom) => (el.scrollTop = bottom ? el.scrollHeight : 0),
          name.endsWith("bottom"),
        );
      await expectedPane
        .locator(".rbody")
        .evaluate(
          (el, bottom) => (el.scrollTop = bottom ? el.scrollHeight : 0),
          name.endsWith("bottom"),
        );
      // #36 changes the context band only. Keep this evidence separate from
      // the full-pane pixel comparison, which also covers the statement editor.
      const contextGeometry = (root: Locator, selectors: string[]) =>
        root.evaluate((el, selectors) => {
          const origin = el.getBoundingClientRect();
          return selectors.map((selector) => {
            const node = el.querySelector<HTMLElement>(selector)!;
            if (!node.checkVisibility({ visibilityProperty: true }))
              return null;
            const r = node.getBoundingClientRect();
            return {
              x: r.x - origin.x,
              y: r.y - origin.y,
              width: r.width,
              height: r.height,
            };
          });
        }, selectors);
      await expect(pane().locator(".find-inspector")).toHaveCount(0);
      await expect(expectedPane.locator(".ctx")).toHaveCount(0);
      const context = {
        expected: await contextGeometry(expectedPane, [
          ".rbody",
          ".rfoot",
          ".store",
        ]),
        actual: await contextGeometry(pane(), [
          ".find-results-scroll",
          ".find-pagination",
          ".find-store",
        ]),
      };
      expect(context.actual).toEqual(context.expected);
      await mkdir("artifacts/issue-36", { recursive: true });
      await writeFile(
        `artifacts/issue-36/context-${theme}-${name}.json`,
        JSON.stringify(context, null, 2),
      );
      const expected = await capture(expectedPane, "reference");
      const expectedPath = info.snapshotPath(`${theme}-${name}.png`);
      if (process.env.AXIOM_UPDATE_REFERENCE === "1") {
        await mkdir(path.dirname(expectedPath), { recursive: true });
        await writeFile(expectedPath, expected);
      }
      // A missing reference baseline is an error, never a request to bless Axiom.
      const baseline = await readFile(expectedPath);
      const actual = await capture(pane(), "application");
      await info.attach("reference", {
        body: expected,
        contentType: "image/png",
      });
      await info.attach("application", {
        body: actual,
        contentType: "image/png",
      });
      await mkdir("artifacts/issue-34", { recursive: true });
      await writeFile(`artifacts/issue-34/actual-${theme}-${name}.png`, actual);
      await writeFile(
        `artifacts/issue-34/expected-${theme}-${name}.png`,
        expected,
      );
      const moreIconMetrics: unknown[] = [];
      for (const [label, target, root] of [
        ["actual", page, '[data-panel="find"]'],
        ["expected", specimen, ".pane"],
      ] as const) {
        const metrics = await target.locator(root).evaluate((el) =>
          [el, ...el.querySelectorAll("*")].map((node) => {
            const r = node.getBoundingClientRect(),
              origin = el.getBoundingClientRect(),
              s = getComputedStyle(node);
            return {
              tag: node.tagName,
              cls: node.className,
              text: node.children.length ? undefined : node.textContent,
              x: r.x - origin.x,
              y: r.y - origin.y,
              w: r.width,
              h: r.height,
              font: s.font,
              color: s.color,
              bg: s.backgroundColor,
              padding: s.padding,
              border: s.border,
              display: s.display,
              moreIcon: !!node.closest('button[aria-label="More"]'),
              svg:
                "getScreenCTM" in node
                  ? {
                      matrix: (() => {
                        const m = (node as SVGGraphicsElement).getScreenCTM()!;
                        return [m.a, m.b, m.c, m.d, m.e, m.f];
                      })(),
                      attributes: Object.fromEntries(
                        [...node.attributes].map((a) => [a.name, a.value]),
                      ),
                      fill: s.fill,
                      stroke: s.stroke,
                      strokeWidth: s.strokeWidth,
                      shapeRendering: s.shapeRendering,
                    }
                  : undefined,
            };
          }),
        );
        await writeFile(
          `artifacts/issue-34/${label}-${theme}-${name}.json`,
          JSON.stringify(metrics, null, 2),
        );
        moreIconMetrics.push(metrics.filter((node) => node.moreIcon));
      }
      expect(moreIconMetrics[0]).toEqual(moreIconMetrics[1]);
      expect(expected).toMatchSnapshot(`${theme}-${name}.png`, {
        threshold: 0,
        maxDiffPixels: 0,
      });
      expect(actual).toMatchSnapshot(`${theme}-${name}.png`, {
        threshold: 0,
        maxDiffPixels: 0,
      });
      // Playwright's comparator can disregard antialiased edge pixels even at
      // threshold zero. Require full bitmap equality as well.
      const differences = await app.evaluate(
        ({ nativeImage }, images) => {
          const [reference, actual, baseline] = images.map((data) =>
            nativeImage.createFromBuffer(Buffer.from(data, "base64")),
          );
          const compare = (image: typeof reference) => {
            const size = image.getSize(),
              expectedSize = reference.getSize();
            if (
              size.width !== expectedSize.width ||
              size.height !== expectedSize.height
            )
              return -1;
            const a = reference.toBitmap(),
              b = image.toBitmap();
            let different = 0;
            for (let offset = 0; offset < a.length; offset += 4)
              if (a.readUInt32LE(offset) !== b.readUInt32LE(offset))
                different++;
            return different;
          };
          return { reference: compare(baseline), application: compare(actual) };
        },
        [
          expected.toString("base64"),
          actual.toString("base64"),
          baseline.toString("base64"),
        ],
      );
      await info.attach("raw-pixel-differences", {
        body: JSON.stringify(differences, null, 2),
        contentType: "application/json",
      });
      expect(differences).toEqual({ reference: 0, application: 0 });
    });
  }
}
