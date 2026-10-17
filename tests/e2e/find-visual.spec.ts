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
// The grouped editor and T1/A4/A5 amendments govern craigtrim/axiom#83.
const groupedReference = path.resolve(
  "tests/fixtures/find-visual/visual-reference-v5.html",
);
const sharedReferencePalette = `
:root[data-theme="light"] { --bg:#ffffff; --raised:#f6f7f9; --sunken:#f0f2f5; --hover:#f6f7f9; --line:#e1e4e8; --line-2:#d0d7de;
  --ink:#1b1f24; --ink-2:#57606a; --ink-3:#57606a; --accent:#0b5fd0; --accent-2:#0a52b4; --on-accent:#ffffff; --tint:#eaf2fd;
  --ok:#0a7a3d; --ok-tint:#e8f5ed; --warn:#8a6116; --warn-tint:#fdf5e3; --bad:#a4201a; --bad-tint:#fdecea; --focus:#0b5fd0;
  --shadow:0 8px 24px rgba(27, 31, 36, .18); }
:root[data-theme="dark"] { --bg:#0d1117; --raised:#161b22; --sunken:#10151c; --hover:#161b22; --line:#30363d; --line-2:#3d444d;
  --ink:#e6edf3; --ink-2:#9ba7b4; --ink-3:#9ba7b4; --accent:#4c9aff; --accent-2:#6aabff; --on-accent:#06192e; --tint:#12243a;
  --ok:#4ade80; --ok-tint:#0f2a1b; --warn:#e3b341; --warn-tint:#2b2211; --bad:#ff8d81; --bad-tint:#3a1a17; --focus:#6aabff;
  --shadow:0 8px 24px rgba(0, 0, 0, .55); }
.frame { resize: none !important; }
.pane { background: var(--bg); transform: translateZ(0); }`;
let app: ElectronApplication, page: Page, specimen: Page;
const pane = () => page.locator('[data-panel="find"]');
async function capture(root: Locator, label: string) {
  // Give both independently rendered More glyphs the same paint boundary.
  // Otherwise Skia can batch their fractional circles with surrounding content
  // and round an edge differently despite identical SVG geometry.
  await root.evaluate((el) => {
    const icon = el.querySelector<SVGElement>('button[aria-label="More"] svg');
    if (icon) icon.style.transform = "translateZ(0)";
  });
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
      "--disable-partial-raster",
      "--disable-zero-copy",
      "--num-raster-threads=1",
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
  expect(
    createHash("sha256")
      .update(await readFile(groupedReference))
      .digest("hex"),
  ).toBe("e2a3a9cc2ee03fd99e8e952db1279063d35f80fd1686eb22fa32e9c06d24f268");
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
  await page.evaluate(() => {
    document.documentElement.lang = "en";
  });
  await pane().evaluate((el) => {
    (el as HTMLElement).style.transform = "translateZ(0)";
  });
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
  const background = await (
    await app.browserWindow(page)
  ).evaluate((win) => {
    win.setPosition(0, 0);
    return win.getBackgroundColor();
  });
  await app.evaluate(
    async ({ BrowserWindow }, { reference, background }) => {
      const win = new BrowserWindow({
        x: 0,
        y: 0,
        backgroundColor: background,
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
    },
    {
      reference: test.info().title.endsWith("zero state")
        ? groupedReference
        : reference,
      background,
    },
  );
  specimen = await opened;
  await specimen.locator("#fr-zero .pane").waitFor();
  // Decision 13: v5 governs only the table. The pinned reference continues
  // to govern the surrounding editor, tools and footer.
  const tables = test.info().title.endsWith("zero state")
    ? await specimen.evaluate(() =>
        Object.fromEntries(
          ["fr-zero", "fr-edit", "fr-edit-s", "fr-wide", "ed-chain"].map(
            (id) => [
              id,
              document.querySelector(`#${id} table.st`)?.outerHTML ?? "",
            ],
          ),
        ),
      )
    : undefined;
  if (tables)
    await (
      await app.browserWindow(specimen)
    ).evaluate((win, file) => win.loadFile(file), reference);
  await specimen.addStyleTag({
    content:
      sharedReferencePalette +
      "table.res tr.sel td:not(:first-child) { box-shadow: none; }",
  });
  await specimen.evaluate(() => {
    const mount = (window as any).mount;
    for (const [id, opts] of Object.entries({
      "fr-exp": {},
      "fr-nar": {},
      "fr-sha": {},
      "fr-ns": {},
      "fr-zero": { query: "synaptic plasticity", zero: true },
      "fr-edit": { query: "synaptic plasticity", zero: true },
      "fr-edit-s": { query: "synaptic plasticity", zero: true },
      "fr-wide": { query: "synaptic plasticity", zero: true },
    }))
      mount(id, { ...opts, dirty: false });
    document.querySelectorAll(".ctx").forEach((el) => {
      if (el.textContent?.trim() === "Select a result to inspect it.")
        el.remove();
    });
  });
  if (tables) {
    const html = await readFile(groupedReference, "utf8");
    await specimen.addStyleTag({
      content: html.slice(
        html.indexOf("/* The statement count"),
        html.indexOf("/* Add row and Source"),
      ),
    });
    await specimen.evaluate((tables) => {
      for (const [id, html] of Object.entries(tables)) {
        const old = document.querySelector(`#${id} table.st`);
        if (old && html) old.outerHTML = html;
      }
    }, tables);
  }
  // Row-extension amendments affect results scaffolding; the #34 HTML stays intact.
  await specimen.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `.res .extend-column { width:148px; }
      @container pane (min-width:600px) {
        .res col.col-type { width:min(120px, calc((100% - 148px - 80px) * .4)) !important; }
        .res col.col-syn { width:min(180px, calc((100% - 148px - 80px) * .6)) !important; }
      }
      @container pane (max-width:599px) { .res .extend-column { width:148px; } }`;
    document.head.append(style);
    document.querySelectorAll("table.res").forEach((table) => {
      table.querySelectorAll(".addsyn").forEach((button) => button.remove());
      const column = document.createElement("col");
      column.className = "extend-column";
      table.querySelector("colgroup")!.append(column);
      table.querySelectorAll("tr").forEach((row) => {
        const cell = document.createElement(row.closest("thead") ? "th" : "td");
        cell.className = "extend-column";
        row.append(cell);
      });
    });
  });
});
test.afterEach(async () => {
  await app?.close();
});

for (const theme of ["light", "dark"] as const) {
  for (const kind of ["exact", "normalized"] as const) {
    test(`reference ${theme} ${kind} collision notice`, async ({}, info) => {
      await menu(`theme.${theme}`);
      await app.evaluate(({ ipcMain }, kind) => {
        const original = (ipcMain as any)._invokeHandlers.get("domain:request");
        ipcMain.removeHandler("domain:request");
        ipcMain.handle("domain:request", async (event, method, args) => {
          const result = await original(event, method, args);
          return method === "findCreatePreview"
            ? {
                ...result,
                errors: [],
                collisions: [
                  {
                    iri: "https://axiom.test/onto/SynapticPlasticity",
                    label: "Synaptic Plasticity",
                    path: "Course › Science › Biology › Neuroscience",
                    kind,
                  },
                ],
              }
            : result;
        });
      }, kind);
      const label = pane().getByRole("textbox", {
        name: "Class label",
        exact: true,
      });
      await label.fill("temporary label");
      await label.fill(
        kind === "exact" ? "Synaptic Plasticity" : "synaptic plasticity",
      );
      const actualNotice = pane().locator(".find-collision");
      await expect(actualNotice).toHaveClass(
        new RegExp(kind === "exact" ? "block" : "caution"),
      );
      await expect(
        pane().getByRole("button", { name: "Create class", exact: true }),
      ).toBeEnabled({ enabled: kind === "normalized" });
      await specimen.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.body.style.background = "var(--bg)";
      }, theme);
      const expectedNotice = specimen
        .locator("h2#f + p + div .guard")
        .nth(kind === "exact" ? 0 : 1);
      for (const [notice, application] of [
        [expectedNotice, false],
        [actualNotice, true],
      ] as const)
        await notice.evaluate((el, application) => {
          const wrapper = document.createElement("div");
          if (application) wrapper.className = "find-panel";
          wrapper.classList.add("capture-notice");
          Object.assign(wrapper.style, {
            position: "fixed",
            left: "24px",
            top: "24px",
            padding: "4px",
            width: "704px",
            height: "auto",
            display: "block",
            background: "var(--bg, var(--ground))",
            zIndex: "9999",
          });
          document.body.append(wrapper);
          wrapper.append(el);
          Object.assign((el as HTMLElement).style, {
            width: "696px",
            margin: "0",
          });
        }, application);
      await page.mouse.move(0, 0);
      await specimen.mouse.move(0, 0);
      const expected = await capture(
          specimen.locator(".capture-notice .guard"),
          "reference",
        ),
        actual = await capture(
          page.locator(".capture-notice .guard"),
          "application",
        );
      const filename = `${theme}-${kind}-collision.png`;
      if (process.env.AXIOM_UPDATE_REFERENCE === "1")
        await writeFile(info.snapshotPath(filename), expected);
      expect(expected).toMatchSnapshot(filename, {
        threshold: 0,
        maxDiffPixels: 0,
      });
      expect
        .soft(actual)
        .toMatchSnapshot(filename, { threshold: 0, maxDiffPixels: 0 });
      const baseline = await readFile(info.snapshotPath(filename));
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
      expect(equal).toEqual({ application: true, baseline: true });
    });
  }
}

// Compose the two governing results specimens: Find supplies the pane and
// extend v3 supplies the selected row's remembered split (craigtrim/axiom#83).
for (const theme of ["light", "dark"] as const) {
  test(`reference ${theme} 21-value group`, async ({}, info) => {
    await menu(`theme.${theme}`);
    await resize(1178, 758);
    const html = await readFile(groupedReference, "utf8");
    const values: string[] = JSON.parse(
      html.match(/var seeAlso = (\[[\s\S]*?\]);/)![1],
    );
    await pane()
      .getByRole("button", { name: "+ Add row", exact: true })
      .click();
    await pane()
      .getByRole("combobox", { name: "Predicate 1", exact: true })
      .selectOption("http://www.w3.org/2000/01/rdf-schema#seeAlso");
    const group = pane().locator(
      'tr[data-predicate="http://www.w3.org/2000/01/rdf-schema#seeAlso"]',
    );
    for (const [index, value] of values.entries()) {
      if (index)
        await group
          .getByRole("button", { name: "+ Add value", exact: true })
          .click();
      await group.getByRole("textbox").last().fill(value);
    }
    await group
      .getByRole("button", { name: "Show fewer", exact: true })
      .click();
    await expect(group.getByRole("textbox")).toHaveCount(3);
    await expect(
      group.getByRole("button", { name: "18 more", exact: true }),
    ).toBeVisible();
    await (
      await app.browserWindow(specimen)
    ).evaluate((win, file) => win.loadFile(file), groupedReference);
    await specimen.addStyleTag({ content: sharedReferencePalette });
    await specimen.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const expectedGroup = specimen
      .locator("#ed-group table.st tbody tr")
      .last();
    // The standalone exhibit has document typography. Its table is used inside
    // Find, so inherit the pinned pane's type as the other editor variants do.
    await specimen.locator("#ed-group").evaluate((el) => {
      el.classList.add("pane");
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        width: "720px",
        height: "auto",
        transform: "translateZ(0)",
      });
    });
    for (const row of [group, expectedGroup]) {
      await row.evaluate((el) => {
        const table = el.closest("table")!;
        table.querySelector("thead")?.remove();
        table.querySelectorAll("tbody tr").forEach((other) => {
          if (other !== el) other.remove();
        });
        Object.assign(table.style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          width: "680px",
          zIndex: "9999",
          background: "var(--bg, var(--ground))",
        });
      });
    }
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.mouse.move(0, 0);
    await specimen.mouse.move(0, 0);
    const expected = await capture(expectedGroup, "reference"),
      actual = await capture(group, "application");
    const filename = `${theme}-21-values.png`;
    if (process.env.AXIOM_UPDATE_REFERENCE === "1")
      await writeFile(info.snapshotPath(filename), expected);
    expect(expected).toMatchSnapshot(filename, {
      threshold: 0,
      maxDiffPixels: 0,
    });
    expect
      .soft(actual)
      .toMatchSnapshot(filename, { threshold: 0, maxDiffPixels: 0 });
    const baseline = await readFile(info.snapshotPath(filename));
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
    expect(equal).toEqual({ application: true, baseline: true });
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const [name, frame] of [
    ["expanded", "fr-exp"],
    ["narrow", "fr-nar"],
    ["shallow", "fr-sha"],
    ["constrained", "fr-ns"],
  ] as const) {
    test(`reference ${theme} ${name} complete results`, async ({}, info) => {
      const extension = await readFile(
        "tests/fixtures/extend-visual/visual-reference-v3.html",
        "utf8",
      );
      expect(createHash("sha256").update(extension).digest("hex")).toBe(
        "e70c7d9b72ca40bc5de6812d26a9cd4af97bc1ac378d632d1a62a28bd8e62502",
      );
      const tokens = extension
        .slice(
          extension.indexOf('[data-theme="light"] {'),
          extension.indexOf(
            "/* --------------------------------------------------------- reference page */",
          ),
        )
        .replaceAll('[data-theme="light"]', '[data-theme="light"] .rowact')
        .replaceAll('[data-theme="dark"]', '[data-theme="dark"] .rowact')
        .replace(":root", ".rowact");
      const controls = extension.slice(
        extension.indexOf(
          "/* ------------------------------------------------------ the control itself */",
        ),
        extension.indexOf(
          "/* ------------------------------------------------------------ editor doors */",
        ),
      );
      await specimen.addStyleTag({
        content:
          tokens +
          controls +
          ".rowact { font:13px/1.5 var(--font); vertical-align:top; } td.extend-column { text-align:end; }",
      });
      const fixture = await specimen.evaluate(
        ({ extension, theme, frame }) => {
          const doc = new DOMParser().parseFromString(extension, "text/html");
          const split = doc.querySelector(
            "#a figure:nth-child(2) .rowact.show",
          )!;
          const selected = document.getElementById(frame)!;
          selected
            .querySelector("tr.sel td.extend-column")!
            .append(split.cloneNode(true));
          selected.querySelectorAll(".pin").forEach((node) => node.remove());
          Object.assign(selected.style, {
            position: "absolute",
            left: "24px",
            top: "24px",
          });
          document.documentElement.dataset.theme = theme;
          document.body.replaceChildren(selected);
          const w = window as any;
          return {
            rows: w.ROWS.map((row: any, i: number) => ({
              iri: `https://axiom.test/onto/result${i}`,
              name: row.n,
              kind: row.t === "Defined class" ? "Defined" : "Class",
              identifier: `result${i}`,
              description: "",
              path: row.p,
              aliases: row.s?.split(", ") ?? [],
              synonym: "available",
            })),
            fields: w.FIELDS_HIT.map((field: any, i: number) => ({
              id: i === 0 ? "name" : i === 1 ? "iri" : field.n,
              label: field.n,
              count: field.c,
            })),
            kinds: w.TYPES.map((kind: any, i: number) => ({
              id: ["classes", "individuals", "properties", "other"][i],
              label: kind.n,
              count: kind.c,
            })),
            total: 10,
            offset: 0,
            storeTotal: 6027,
          };
        },
        { extension, theme, frame },
      );
      await app.evaluate(({ ipcMain }, fixture) => {
        const original = (ipcMain as any)._invokeHandlers.get("domain:request");
        ipcMain.removeHandler("domain:request");
        ipcMain.handle("domain:request", (event, method, args) =>
          method === "find" && args.text === "NEURODIVERSITY"
            ? fixture
            : original(event, method, args),
        );
      }, fixture);
      await menu(`theme.${theme}`);
      await pane().getByRole("searchbox").fill("NEURODIVERSITY");
      await expect(pane().locator(".find-results tbody tr")).toHaveCount(10);
      await pane().locator(".find-results tbody tr").first().press("Space");
      await expect(
        pane().locator(".find-result-actions button").first(),
      ).toBeEnabled();
      const expectedPane = specimen.locator(".pane");
      const dimensions = (await expectedPane.boundingBox())!;
      await resize(dimensions.width, dimensions.height);
      await page
        .locator('[data-pane-id="find"]')
        .evaluate((el) =>
          Object.assign((el as HTMLElement).style, { left: "0px", top: "0px" }),
        );
      await expectedPane.evaluate((el) =>
        Object.assign((el.parentElement as HTMLElement).style, {
          left: "0px",
          top: "0px",
        }),
      );
      await (
        await app.browserWindow(specimen)
      ).evaluate(
        (win, size) => win.setContentSize(size.width + 80, size.height + 80),
        dimensions,
      );
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      await page.mouse.move(0, 0);
      await specimen.mouse.move(0, 0);
      // Match paint boundaries for the pane and its name/metadata text runs.
      // This avoids batching-dependent edge rounding without changing geometry,
      // colors, text, clipping or the strict raw bitmap comparison.
      for (const root of [pane(), expectedPane])
        await root.evaluate((el) => {
          (el as HTMLElement).style.transform = "translateZ(0)";
          el.querySelectorAll<HTMLElement>(
            ".ename, .find-result-name, .efold, .find-folded-type, .find-folded-synonyms",
          ).forEach((name) => {
            name.style.transform = "translateZ(0)";
          });
        });
      const expected = await capture(expectedPane, "reference"),
        actual = await capture(pane(), "application");
      await mkdir("artifacts/issue-83", { recursive: true });
      const metrics = (root: Locator, selectors: string[]) =>
        root.evaluate(
          (el, selectors) =>
            Object.fromEntries(
              selectors.map((selector) => [
                selector,
                [...el.querySelectorAll(selector)].slice(0, 5).map((node) => {
                  const r = node.getBoundingClientRect(),
                    s = getComputedStyle(node);
                  return {
                    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
                    styles: Object.fromEntries(
                      [...s].map((name) => [name, s.getPropertyValue(name)]),
                    ),
                  };
                }),
              ]),
            ),
          selectors,
        );
      await writeFile(
        `artifacts/issue-83/metrics-${theme}-${name}.json`,
        JSON.stringify(
          {
            expected: await metrics(expectedPane, [
              "table.res th",
              "table.res tr",
              ".ename",
              ".epath",
              ".efold",
              ".ctx",
              ".qfield input",
            ]),
            actual: await metrics(pane(), [
              ".find-results th",
              ".find-results tr",
              ".find-result-name",
              ".find-result-path",
              ".find-folded-synonyms",
              ".find-inspector p",
              ".find-query input",
            ]),
          },
          null,
          2,
        ),
      );
      await writeFile(
        `artifacts/issue-83/expected-${theme}-${name}.png`,
        expected,
      );
      await writeFile(`artifacts/issue-83/actual-${theme}-${name}.png`, actual);
      const baselinePath = info.snapshotPath(`${theme}-${name}-results.png`);
      if (process.env.AXIOM_UPDATE_REFERENCE === "1")
        await writeFile(baselinePath, expected);
      const baseline = await readFile(baselinePath);
      expect(expected).toMatchSnapshot(`${theme}-${name}-results.png`, {
        threshold: 0,
        maxDiffPixels: 0,
      });
      expect.soft(actual).toMatchSnapshot(`${theme}-${name}-results.png`, {
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
      expect(equal).toEqual({ application: true, baseline: true });
    });
  }
}

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
        const group = pane().locator(
          'tr[data-predicate="http://www.w3.org/2000/01/rdf-schema#seeAlso"]',
        );
        for (const value of [
          "Hebbian Learning",
          "LTP",
          "Synaptic Scaling",
          "Spike Timing Dependent Plasticity",
          "STDP",
        ]) {
          await group
            .getByRole("button", { name: "+ Add value", exact: true })
            .click();
          await group.getByRole("textbox").last().fill(value);
        }
        await group
          .getByRole("button", { name: "Show fewer", exact: true })
          .click();
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
              inputStyle:
                node instanceof HTMLInputElement
                  ? Object.fromEntries(
                      [...s].map((key) => [key, s.getPropertyValue(key)]),
                    )
                  : undefined,
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
