// Pixel comparison of the Ontology Quality pane against Craig's pinned visual
// reference (craigtrim/axiom#44). The reference is rendered fresh in the same
// Electron build for every case; the application is never used as a baseline.
// See tests/fixtures/quality-visual/README.md for the amendments and the
// presentation-fixture data.
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
import type { Triple } from "../../src/domain/model";
import {
  defaultQualityOptions,
  qualityRules,
  readQualityOptions,
  type QualityCensusResult,
  type QualityCoverage,
  type QualityFinding,
  type QualityOptions,
  type QualityPreview,
  type QualityReport,
  type QualityStatus,
} from "../../src/shared/ontology-quality";

const reference = path.resolve(
  "tests/fixtures/quality-visual/visual-reference.html",
);
const referenceHash =
  "9eee75ead939e8c1e21a3bd9e23cf756091c57edc9006f1d0a239c58e4e79fe6";
const NSB = "http://devry.edu/courses#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  RDFS = "http://www.w3.org/2000/01/rdf-schema#",
  OWL = "http://www.w3.org/2002/07/owl#";

// ------------------------------------------------ presentation-fixture data
// The settings that make the reference's "13 checks" and "2 checks are
// withdrawn": thirteen admitted rules plus one SKOS and one retired-entity rule.
const on = [
  "label.missing",
  "description.missing",
  "description.repeated",
  "label.whitespace",
  "label.duplicate",
  "label.multiple",
  "alias.legacy",
  "structure.cycle",
  "structure.parent",
  "structure.type",
  "property.domain",
  "metadata.missing",
  "analysis.excluded",
  "skos.multiple",
  "deprecated.reference",
];
const options: QualityOptions = {
  ...defaultQualityOptions(),
  labelPredicates: [RDFS + "label"],
  descriptionPredicates: [RDFS + "comment"],
  languages: ["en"],
  rules: Object.fromEntries(
    qualityRules.map((r) => [
      r.id,
      r.id === "label.missing"
        ? "Violation"
        : r.id === "structure.cycle"
          ? "Information"
          : on.includes(r.id)
            ? r.severity
            : "Off",
    ]),
  ),
};
const census = {
  RDFS: [
    RDFS + "label",
    RDFS + "comment",
    RDFS + "subClassOf",
    RDFS + "seeAlso",
  ],
  OWL: [OWL + "Class", OWL + "Ontology"],
};
const withdrawn = [
  "skos.multiple",
  "skos.disjoint",
  "skos.literal",
  "deprecated.boolean",
  "deprecated.reference",
  "deprecated.guidance",
];
const censusResult: QualityCensusResult = {
  census,
  kinds: { Class: 5868, ObjectProperty: 12, DataProperty: 4 },
};
const ONT = "devry-courses";
const exception = {
  ontology: ONT,
  iri: NSB + "Machine_Tool_Practicum",
  rule: "label.missing",
  signature: "label.missing:Machine_Tool_Practicum",
  reason:
    "Intentional. This class is a scheduling placeholder and is never displayed.",
  recorded: "2026-10-03T12:00:00.000Z",
};
const t = (
  subject: string,
  predicate: string,
  value: string,
  literal = false,
): Triple => ({
  subject: NSB + subject,
  predicate,
  object: { value, literal },
});
const finding = (
  rule: string,
  local: string,
  label: string,
  extra: Partial<QualityFinding> = {},
): QualityFinding => {
  const r = qualityRules.find((r) => r.id === rule)!;
  const id = rule + ":" + local;
  return {
    id,
    signature: id,
    rule,
    severity: options.rules[rule] as QualityFinding["severity"],
    group: r.group,
    basis: r.basis,
    iri: NSB + local,
    label,
    kind: "Class",
    namespace: NSB,
    message: r.title + ".",
    suggestion: "Review the entity.",
    evidence: [],
    related: [],
    ...extra,
  };
};
const industrialSafety = finding(
  "label.missing",
  "Industrial_Safety",
  "Industrial Safety",
  {
    basis: "RDFS. A named class asserting no rdfs:label has no asserted name.",
    suggestion: "Add rdfs:label carrying the name you want shown.",
    evidence: [
      t("Industrial_Safety", RDF + "type", OWL + "Class"),
      t("Industrial_Safety", RDFS + "subClassOf", NSB + "Shop_Class"),
    ],
  },
);
const welding = finding(
  "label.missing",
  "Welding_Technology",
  "Welding Technology",
  {
    basis: "RDFS. A named class asserting no rdfs:label has no asserted name.",
    suggestion: "Add rdfs:label carrying the name you want shown.",
    evidence: [
      t("Welding_Technology", RDF + "type", OWL + "Class"),
      t("Welding_Technology", RDFS + "subClassOf", NSB + "Shop_Class"),
      t("Welding_Technology", RDFS + "seeAlso", "WELD TECH", true),
    ],
  },
);
const zone = (i: number) => "Zone_" + String(i).padStart(4, "0");
const many = (rule: string, prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) =>
    finding(rule, prefix + i, prefix + " " + String(i).padStart(4, "0")),
  );
const checked = (
  ids: string[],
  counts: Record<string, [number, number]> = {},
) =>
  ids.map((rule): QualityCoverage => ({
    rule,
    applicable: counts[rule]?.[0] ?? 5868,
    affected: counts[rule]?.[1] ?? 0,
    notApplicable: 0,
    checked: true,
  }));
let epoch = 0;
function report(
  findings: QualityFinding[],
  extra: Partial<QualityReport> = {},
): QualityReport {
  return {
    ontology: ONT,
    name: "courses.owl",
    datasetEpoch: epoch,
    version: 4812,
    createdAt: new Date(2026, 9, 3, 15, 2).toISOString(),
    options: readQualityOptions(options),
    scanned: 5868,
    candidates: 5868,
    findings,
    coverage: checked(on.filter((id) => !withdrawn.includes(id))),
    imports: [],
    notes: [],
    census,
    withdrawn,
    enabledChecks: 13,
    ...extra,
  };
}
/** Exhibit C's counts: 1,284 violations, 3,945 warnings, 1,576 notes, one suppressed. */
const exhibitC = (extra: QualityFinding[] = []) =>
  report([
    industrialSafety,
    welding,
    ...Array.from({ length: 1282 }, (_, i) =>
      finding(
        "label.missing",
        zone(i + 1),
        "Zone " + String(i + 1).padStart(4, "0"),
      ),
    ),
    finding(
      "label.missing",
      "Machine_Tool_Practicum",
      "Machine Tool Practicum",
    ),
    ...many("description.missing", "Description", 3907),
    ...many("label.duplicate", "Duplicate", 38),
    ...many("structure.parent", "Parent", 1576),
    ...extra,
  ]);
const complete = (r: QualityReport, id = 1): QualityStatus => ({
  id,
  state: "complete",
  scanned: r.scanned,
  total: r.scanned,
  phase: "Complete",
  report: r,
});
const reviewReport = () =>
  report([
    finding("label.missing", "Industrial_Safety", "Industrial Safety"),
    finding("label.missing", "Shop_Class", "Shop Class"),
    finding("label.missing", "Machine_Tool", "Machine Tool"),
    ...Array.from({ length: 1281 }, (_, i) =>
      finding(
        "label.missing",
        zone(i + 1),
        "Zone " + String(i + 1).padStart(4, "0"),
      ),
    ),
    finding("label.multiple", "Fluid_Power", "Fluid Power"),
  ]);
const ontology = [
  "@prefix : <" + NSB + "> .",
  "@prefix owl: <" + OWL + "> .",
  "@prefix rdfs: <" + RDFS + "> .",
  ": a owl:Ontology .",
  ':Shop_Class a owl:Class ; rdfs:label "Shop Class" .',
  ...[
    "Industrial_Safety",
    "Welding_Technology",
    "Machine_Tool_Practicum",
    "Machine_Tool",
    "Fluid_Power",
  ].map((c) => ":" + c + " a owl:Class ; rdfs:subClassOf :Shop_Class ."),
  ...Array.from(
    { length: 1300 },
    (_, i) => ":" + zone(i + 1) + " a owl:Class .",
  ),
].join("\n");

// ------------------------------------------------------------ the harness
let app: ElectronApplication, page: Page, main: Page, specimen: Page;
const host = () => page.locator('.adaptive-pane[data-pane-id="quality"]');
const pane = () => page.locator('[data-panel="quality"]');
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
/**
 * Captures the pixels a region fully covers. A region that starts or ends on
 * a fractional row would otherwise bring in a row of whatever lies next to it.
 */
async function capture(root: Locator, label: string) {
  // Both sides scroll a region the same way, so a region that needs scrolling
  // in the pane meets its body's edge in the reference too.
  await root.evaluate((el) => {
    if (el.closest(".body")) el.scrollIntoView({ block: "end" });
  });
  const b = (await root.boundingBox())!;
  const x = Math.ceil(b.x - 1e-3),
    y = Math.ceil(b.y - 1e-3);
  const clip = {
    x,
    y,
    width: Math.floor(b.x + b.width + 1e-3) - x,
    height: Math.floor(b.y + b.height + 1e-3) - y,
  };
  const shot = () =>
    root.page().screenshot({ clip, animations: "disabled", scale: "css" });
  let previous = await shot();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await shot();
    if (previous.equals(current)) return current;
    previous = current;
  }
  throw new Error(
    label + " did not produce two consecutive identical captures.",
  );
}
async function setFixture(fixture: Record<string, unknown>) {
  await app.evaluate((_, fixture) => {
    (globalThis as any).__qualityFixture = fixture;
  }, fixture);
}
async function setState(override: Record<string, unknown>) {
  // The detached window has no bridge of its own; the main window answers.
  const snapshot = await main.evaluate(() =>
    window.axiom.request<Snapshot>("state"),
  );
  await app.evaluate(
    ({ BrowserWindow }, { override, snapshot }) => {
      (globalThis as any).__stateOverride = override;
      BrowserWindow.getAllWindows().forEach((win) =>
        win.webContents.send("domain:event", { type: "state", data: snapshot }),
      );
    },
    { override, snapshot },
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
  // The real pane, isolated at the specimen's origin and size.
  await host().evaluate(
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
    .poll(async () => (await host().boundingBox())!.width)
    .toBe(width);
  await expect
    .poll(async () => (await host().boundingBox())!.height)
    .toBe(height);
}

async function launch(theme: "light" | "dark", exceptions: unknown[]) {
  expect(
    createHash("sha256")
      .update(await readFile(reference))
      .digest("hex"),
  ).toBe(referenceHash);
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/testing/quality-visual-"),
  );
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({
      version: 1,
      theme,
      panelState: {
        "quality.options": options,
        "quality.exceptions": exceptions,
      },
    }),
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
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--force-color-profile=srgb",
      // One rasterizer for every layer: a busy layer otherwise falls back to a
      // different path antialiasing than a simple one.
      "--disable-gpu-rasterization",
    ],
    env,
  });
  page = main = await app.firstWindow();
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ dialog, BrowserWindow, ipcMain }, file) => {
    BrowserWindow.getAllWindows().forEach((win) => win.setFocusable(false));
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    // Presentation fixtures for the quality requests; everything else is real.
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", async (event, method, args) => {
      const fx = (globalThis as any).__qualityFixture;
      if (fx) {
        if (method === "qualityCensus") return fx.census;
        if (method === "qualityStart" || method === "qualityStatus")
          return fx.status;
        if (method === "qualityCancel") return fx.status;
        if (method === "qualityPreview") {
          if (fx.previewError) throw new Error(fx.previewError);
          return fx.preview;
        }
      }
      return original(event, method, args);
    });
  }, file);
  await setFixture({ census: censusResult });
  await menu("file.open");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .classCount,
    )
    .toBeGreaterThan(1000);
  epoch = (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
    .datasetEpoch;
  await app.evaluate(({ BrowserWindow }) => {
    const wrap = (win: Electron.BrowserWindow) => {
      if ((win.webContents as any).__wrapped) return;
      (win.webContents as any).__wrapped = true;
      const send = win.webContents.send.bind(win.webContents);
      win.webContents.send = (channel: string, ...args: any[]) => {
        const o = (globalThis as any).__stateOverride;
        if (o && channel === "domain:event" && args[0]?.type === "state")
          args[0] = {
            ...args[0],
            data: {
              ...args[0].data,
              ...o,
              ontology: { ...args[0].data.ontology, namespace: o.namespace },
            },
          };
        send(channel, ...args);
      };
    };
    BrowserWindow.getAllWindows().forEach(wrap);
    (globalThis as any).__wrap = wrap;
  });
  await menu("tools.quality");
  await expect(pane()).toBeVisible();
  const detached = app.waitForEvent("window");
  await pane().locator("button").first().focus();
  await menu("pane.detach");
  page = await detached;
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.setFocusable(false);
      (globalThis as any).__wrap(win);
    });
  });
  await expect(pane()).toBeVisible();
  await setState({
    classCount: 5868,
    individualCount: 0,
    tripleCount: 24444,
    version: 4812,
    namespace: NSB,
  });
  await page.addStyleTag({
    content:
      '.adaptive-pane[data-pane-id="quality"] .body { overflow: hidden !important; }',
  });
  const opened = app.waitForEvent("window");
  await app.evaluate(async ({ BrowserWindow }, reference) => {
    const win = new BrowserWindow({
      width: 1600,
      height: 1000,
      show: false,
      focusable: false,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadFile(reference);
    win.showInactive();
  }, reference);
  specimen = await opened;
  await specimen.locator("#a .pane").first().waitFor();
}

// --------------------------------------------- reference specimen amendments
interface Plan {
  section: string;
  index: number;
  /** Render exhibit C's pane at this exhibit's size (exhibits H and J). */
  fromC?: boolean;
  replace?: [string, string][];
  remove?: string[];
  more?: boolean;
  rules?: boolean;
  before?: string[];
  after?: string[];
  maximize?: boolean;
  noRuleId?: boolean;
  detailFromD1?: boolean;
  /** Sets the text of the first element each selector matches. */
  set?: [string, string][];
  /** Adds classes to the first element each selector matches. */
  classes?: [string, string][];
  constrained?: boolean;
  size?: [number, number];
}
/** Every amendment is listed in tests/fixtures/quality-visual/README.md. */
async function prepare(plan: Plan, theme: string) {
  return specimen.evaluate(
    ({ plan, theme }) => {
      const figure = (section: string, index: number) =>
        document.querySelectorAll(`#${section} figure`)[index];
      const original = figure(
        plan.section,
        plan.index,
      ).querySelector<HTMLElement>(".pane")!;
      const box = original.getBoundingClientRect();
      const width = plan.size?.[0] ?? box.width - 2,
        height = plan.size?.[1] ?? box.height - 2;
      const pane = plan.fromC
        ? (figure("c", 0)
            .querySelector(".pane")!
            .cloneNode(true) as HTMLElement)
        : original;
      // Rule names, rule ids and counts are fixture data, not design.
      const replace: [string, string][] = [
        ["Missing explicit label", "Missing explicit primary label"],
        ["completeness.label.missing", "label.missing"],
        ["Hierarchy cycle", "Hierarchy cycle or self-link"],
        [
          "Excluded from the Text Analysis vocabulary",
          "Excluded from Text Analysis vocabulary",
        ],
        ...(plan.replace ?? []),
      ];
      // Exhibit D's second figure abbreviates the detail to four rows; the rows
      // it leaves out come from the first figure, for the same entity.
      if (plan.detailFromD1) {
        const full = figure("d", 0)
          .querySelector(".fdet")!
          .cloneNode(true) as HTMLElement;
        const words = document.createTreeWalker(full, NodeFilter.SHOW_TEXT);
        for (let node = words.nextNode(); node; node = words.nextNode())
          node.textContent = node
            .textContent!.split("Industrial_Safety")
            .join("Welding_Technology")
            .split("Industrial Safety")
            .join("Welding Technology");
        const own = pane.querySelector(".fdet")!;
        const row = (root: Element, key: string) =>
          [...root.querySelectorAll(".kv")].find(
            (kv) => kv.querySelector(".k")!.textContent!.trim() === key,
          )!;
        for (const key of ["Evidence", "Reading", "Also under"])
          row(full, key).replaceWith(row(own, key).cloneNode(true));
        own.replaceWith(full);
      }
      const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode())
        for (const [from, to] of replace)
          if (node.textContent!.includes(from))
            node.textContent = node.textContent!.split(from).join(to);
      // Exhibit C pictures a suppressed row that is hidden by default.
      pane.querySelectorAll(".frow.suppressed").forEach((row) => {
        if (plan.fromC || plan.section === "c") row.remove();
      });
      for (const selector of plan.remove ?? [])
        pane.querySelectorAll(selector).forEach((n) => n.remove());
      if (plan.noRuleId)
        pane.querySelectorAll(".rule .id").forEach((n) => n.remove());
      for (const [selector, text] of plan.set ?? [])
        pane.querySelector(selector)!.textContent = text;
      for (const [selector, names] of plan.classes ?? [])
        pane.querySelector(selector)!.classList.add(...names.split(" "));
      const button = (html: string) => {
        const t = document.createElement("template");
        t.innerHTML = html.trim();
        return t.content.firstElementChild as HTMLElement;
      };
      // The More menu, the one control added to the tools bar.
      if (plan.more)
        pane.querySelectorAll(".tools").forEach((tools) => {
          const more = button(
            '<button class="ib" aria-label="More finding options" title="More"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="3.5" cy="8" r=".9" fill="currentColor"></circle><circle cx="8" cy="8" r=".9" fill="currentColor"></circle><circle cx="12.5" cy="8" r=".9" fill="currentColor"></circle></svg></button>',
          );
          tools.append(more);
        });
      if (plan.constrained)
        pane
          .querySelectorAll(
            ".tools .seg, .tools .btn, .tools .ib, .tools .sel, .tools .txt",
          )
          .forEach((n) => n.remove());
      // Rule configuration is reached from the Checks row.
      if (plan.rules)
        pane
          .querySelectorAll(".srow")[2]
          ?.append(button('<button class="btn">Rules</button>'));
      for (const label of plan.before ?? [])
        pane
          .querySelector(".bar .btn.primary")!
          .before(button(`<button class="btn">${label}</button>`));
      for (const label of plan.after ?? [])
        pane
          .querySelector(".bar")!
          .append(button(`<button class="btn">${label}</button>`));
      if (plan.maximize)
        pane
          .querySelector(".recov")!
          .append(
            button(
              '<button style="box-sizing:border-box;min-height:26px;padding:0 9px;font:inherit;font-size:12.5px;border:1px solid var(--line-2);border-radius:3px;background:var(--bg);color:var(--ink);cursor:pointer">Maximize pane</button>',
            ),
          );
      // Only the exhibit frame changes: no border, no resize grip, same content box.
      pane.style.cssText = `position:relative;border:0;width:100%;height:100%;resize:none;overflow:hidden`;
      return {
        width,
        height,
        html: pane.outerHTML,
        css: [...document.querySelectorAll("style")]
          .map((s) => s.textContent)
          .join("\n"),
      };
    },
    { plan, theme },
  );
}
/**
 * The prepared specimen is rendered in a shadow root in the same window as the
 * real pane, at the same origin, and shown only while it is captured. Only the
 * reference's own CSS applies inside it; `all: initial` on the host stops the
 * workbench's inherited styles. Capturing both at one origin keeps their
 * floating-point positions, and so their antialiasing, identical.
 */
async function mount(
  prepared: { width: number; height: number; html: string; css: string },
  theme: string,
) {
  await page.evaluate(
    ({ prepared, theme }) => {
      document.getElementById("quality-reference")?.remove();
      const host = document.createElement("div");
      host.id = "quality-reference";
      // Mirrors the application's host chain: a fixed size container with a
      // full-size content box around a relatively positioned pane.
      host.style.cssText = `all:initial;display:none;width:100%;height:100%;overflow:hidden;container-type:size;zoom:1`;
      host.attachShadow({ mode: "open" }).innerHTML =
        `<style>${prepared.css}</style>` +
        `<style>.pane .body { overflow: hidden !important; }</style>` +
        `<div lang="en-GB" data-theme="${theme}" style="width:100%;height:100%">${prepared.html}</div>`;
      // Inside the application's own host chain, in place of its pane.
      document
        .querySelector(
          '.adaptive-pane[data-pane-id="quality"] .adaptive-pane-content',
        )!
        .append(host);
    },
    { prepared, theme },
  );
}
/**
 * Shows exactly one side. The application's recovery overlay sits above its
 * content, so it is hidden too, and the reference stays visible even where
 * recovery hides the content box around it.
 */
const showReference = (shown: boolean) =>
  page.evaluate((shown) => {
    const host = '.adaptive-pane[data-pane-id="quality"]';
    const reference = document.getElementById("quality-reference")!;
    reference.style.display = shown ? "block" : "none";
    reference.style.visibility = "visible";
    for (const selector of [
      host + " [data-panel=quality]",
      host + " > .pane-recovery",
    ])
      document.querySelector<HTMLElement>(selector)!.style.display = shown
        ? "none"
        : "";
  }, shown);

// ------------------------------------------------------------- comparisons
interface Region {
  name: string;
  spec: string;
  app?: string;
  text?: string;
  /** For `.kv` rows: the exact label in `.k`. */
  key?: string;
  nth?: number;
}
const find = (root: Locator, selector: string, r: Region) => {
  let l = root.locator(selector);
  if (r.text) l = l.filter({ hasText: r.text });
  if (r.key)
    l = l.filter({
      has: root.page().locator(".k", { hasText: new RegExp(`^${r.key}$`) }),
    });
  return l.nth(r.nth ?? 0);
};
async function differences(a: Buffer, b: Buffer) {
  return app.evaluate(
    ({ nativeImage }, images) => {
      const [x, y] = images.map((data) =>
        nativeImage.createFromBuffer(Buffer.from(data, "base64")),
      );
      const sx = x.getSize(),
        sy = y.getSize();
      if (sx.width !== sy.width || sx.height !== sy.height)
        return { size: [sx, sy], pixels: -1 };
      const p = x.toBitmap(),
        q = y.toBitmap();
      let pixels = 0;
      for (let i = 0; i < p.length; i += 4)
        if (p.readUInt32LE(i) !== q.readUInt32LE(i)) pixels++;
      return { size: [sx], pixels };
    },
    [a.toString("base64"), b.toString("base64")],
  );
}
/** Every element and text run inside a region, relative to the region. */
const layout = (l: Locator) =>
  l.evaluate((el) => {
    const o = el.getBoundingClientRect();
    const out: string[] = [];
    const walk = (n: Node) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          const r = document.createRange();
          r.selectNodeContents(c);
          for (const b of r.getClientRects())
            out.push(
              `"${c.textContent!.trim().slice(0, 24)}" ${b.x - o.x},${b.y - o.y} ${b.width}x${b.height}`,
            );
        } else if (c.nodeType === 1) {
          const b = (c as Element).getBoundingClientRect();
          if (b.width)
            out.push(
              `${(c as Element).tagName} ${b.x - o.x},${b.y - o.y} ${b.width}x${b.height}`,
            );
          walk(c);
        }
      }
    };
    walk(el);
    return out;
  });
interface Shot {
  image: Buffer;
  x: number;
  y: number;
  width: number;
  height: number;
  layout: string[];
}
async function shoot(
  root: Locator,
  located: [string, Locator][],
  side: string,
) {
  const out: Record<string, Shot> = {};
  const origin = (await root.boundingBox())!;
  for (const [region, l] of located) {
    await expect(l, `${region} in ${side}`).toBeVisible();
    const image = await capture(l, `${side} ${region}`);
    const box = (await l.boundingBox())!;
    out[region] = {
      image,
      x: box.x - origin.x,
      y: box.y - origin.y,
      width: box.width,
      height: box.height,
      layout: await layout(l),
    };
  }
  return out;
}
async function compare(name: string, full: boolean, regions: Region[]) {
  const info = test.info();
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const specRoot = page.locator("#quality-reference .pane");
  const appRoot = host();
  const pick = (root: Locator, spec: boolean): [string, Locator][] => [
    ...(full ? [["pane", root] as [string, Locator]] : []),
    ...regions.map(
      (r) =>
        [r.name, find(root, spec ? r.spec : (r.app ?? r.spec), r)] as [
          string,
          Locator,
        ],
    ),
  ];
  // Diagnostic: AXIOM_QUALITY_PROBE=<selector> records computed-style differences.
  const probe = process.env.AXIOM_QUALITY_PROBE;
  const style = (root: Locator) =>
    root
      .locator(probe!)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el),
          out: Record<string, string> = {};
        for (let i = 0; i < s.length; i++)
          if (!s[i].startsWith("--")) out[s[i]] = s.getPropertyValue(s[i]);
        return out;
      });
  // Skia caches rounded-corner coverage across draws, so whichever side paints
  // a shape first decides its antialiasing. Paint both before the captures
  // that count, so both draw from the same cache.
  await showReference(true);
  await shoot(specRoot, pick(specRoot, true), "the reference");
  await showReference(false);
  await shoot(appRoot, pick(appRoot, false), "Axiom");
  const appStyle = probe ? await style(appRoot) : {};
  const actual = await shoot(appRoot, pick(appRoot, false), "Axiom");
  await showReference(true);
  if (probe) {
    const specStyle = await style(specRoot);
    await writeFile(
      `artifacts/issue-44/${name}-probe.json`,
      JSON.stringify(
        Object.keys({ ...specStyle, ...appStyle })
          .filter((k) => specStyle[k] !== appStyle[k])
          .map((k) => `${k}: ${specStyle[k]} | ${appStyle[k]}`),
        null,
        1,
      ),
    );
  }
  const expected = await shoot(specRoot, pick(specRoot, true), "the reference");
  await showReference(false);
  await mkdir("artifacts/issue-44", { recursive: true });
  const results: Record<string, unknown> = {};
  for (const region of Object.keys(expected)) {
    const e = expected[region],
      a = actual[region];
    const file = `artifacts/issue-44/${name}-${region}`;
    await writeFile(file + "-expected.png", e.image);
    await writeFile(file + "-actual.png", a.image);
    await info.attach(`${region} reference`, {
      body: e.image,
      contentType: "image/png",
    });
    await info.attach(`${region} Axiom`, {
      body: a.image,
      contentType: "image/png",
    });
    results[region] = {
      ...(await differences(e.image, a.image)),
      x: [e.x, a.x],
      width: [e.width, a.width],
      y: [e.y, a.y],
      height: [e.height, a.height],
      layout: e.layout
        .map((line, i) =>
          line === a.layout[i] ? "" : `${line} | ${a.layout[i]}`,
        )
        .filter(Boolean)
        .slice(0, 20),
    };
  }
  await writeFile(
    `artifacts/issue-44/${name}-results.json`,
    JSON.stringify(results, null, 1),
  );
  await info.attach("raw-pixel-differences", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  for (const [region, r] of Object.entries(results) as [string, any][]) {
    expect.soft(r.pixels, region + " differing pixels").toBe(0);
    expect.soft(r.x[1], region + " left edge").toBe(r.x[0]);
    expect.soft(r.width[1], region + " width").toBe(r.width[0]);
  }
}

// ------------------------------------------------------------------- cases
const run = async (status: QualityStatus) => {
  await setFixture({ census: censusResult, status });
  await pane()
    .getByRole("button", { name: /^(Run scan|Rerun scan|Rerun)$/ })
    .locator("visible=true")
    .first()
    .click();
};
const expand = (title: string) =>
  pane().locator("button.rule").filter({ hasText: title }).first().click();
const row = (name: string) =>
  pane().locator("button.fname").filter({ hasText: name }).first();
interface Case {
  name: string;
  plan: Plan;
  full?: boolean;
  regions: Region[];
  exceptions?: boolean;
  drive: () => Promise<void>;
}
const bar: Region = { name: "bar", spec: ".bar" };
const foot: Region = { name: "foot", spec: ".foot" };
const tools: Region = { name: "tools", spec: ".tools" };
const firstBand: Region = { name: "band", spec: ".rule" };
const cases: Case[] = [
  {
    name: "a1-idle",
    plan: { section: "a", index: 0 },
    full: true,
    regions: [],
    drive: async () => {},
  },
  {
    name: "a2-running",
    plan: { section: "a", index: 1 },
    full: true,
    regions: [],
    drive: () =>
      run({
        id: 1,
        state: "running",
        scanned: 2524,
        total: 5868,
        phase: "Checking entities",
      }),
  },
  {
    name: "a3-complete",
    exceptions: true,
    plan: {
      section: "a",
      index: 2,
      replace: [
        ["6,844 findings · 0 suppressed", "6,806 findings · 1 suppressed"],
      ],
    },
    regions: [
      bar,
      { ...firstBand, name: "band-violation" },
      { name: "band-warning", spec: ".rule", nth: 1 },
      foot,
    ],
    drive: () => run(complete(exhibitC())),
  },
  {
    name: "a4-clean",
    plan: { section: "a", index: 3 },
    regions: [bar, { name: "state", spec: ".state-body" }, foot],
    drive: () => run(complete(report([]))),
  },
  {
    name: "a5-no-checks",
    plan: { section: "a", index: 4 },
    regions: [bar, { name: "state", spec: ".state-body" }, foot],
    drive: () =>
      run(
        complete(
          report([], {
            enabledChecks: 0,
            createdAt: new Date(2026, 9, 3, 15, 4).toISOString(),
          }),
        ),
      ),
  },
  {
    name: "a6a-stale-store",
    exceptions: true,
    plan: { section: "a", index: 5 },
    regions: [bar, firstBand],
    drive: async () => {
      await run(complete(exhibitC()));
      await setState({
        classCount: 5868,
        individualCount: 0,
        tripleCount: 24444,
        version: 4813,
        namespace: NSB,
      });
    },
  },
  {
    name: "a6b-stale-settings",
    exceptions: true,
    plan: { section: "a", index: 6 },
    regions: [bar],
    drive: async () => {
      await run(complete(exhibitC()));
      await pane().getByRole("button", { name: "Change" }).click();
      await pane()
        .locator(".settings .chip")
        .filter({ hasText: "Data properties" })
        .click();
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "a7-canceled",
    plan: { section: "a", index: 7 },
    full: true,
    regions: [],
    drive: () =>
      run({
        id: 1,
        state: "canceled",
        scanned: 2524,
        total: 5868,
        phase: "Canceled",
      }),
  },
  {
    name: "a8-failed",
    plan: { section: "a", index: 8 },
    full: true,
    regions: [],
    drive: () =>
      run({
        id: 1,
        state: "failed",
        scanned: 0,
        total: 0,
        phase: "Failed",
        error:
          "A subClassOf cycle was reached and the walk could not terminate.",
      }),
  },
  {
    name: "b-census-shallow",
    plan: { section: "b", index: 0, rules: true },
    regions: [
      bar,
      { name: "settings", spec: ".settings" },
      { name: "state", spec: ".state-body" },
    ],
    drive: async () => {},
  },
  {
    name: "b-census-tall",
    plan: { section: "b", index: 0, rules: true, size: [718, 458] },
    regions: [{ name: "settings", spec: ".settings" }],
    drive: async () => {},
  },
  {
    name: "c-findings",
    exceptions: true,
    plan: {
      section: "c",
      index: 0,
      more: true,
      replace: [
        ["6,844 findings · 1 suppressed", "6,806 findings · 1 suppressed"],
      ],
    },
    regions: [
      bar,
      tools,
      firstBand,
      { name: "row-1", spec: ".frow", text: "Industrial Safety" },
      { name: "row-2", spec: ".frow", text: "Welding Technology" },
      { name: "band-zero", spec: ".rule", text: "Hierarchy cycle" },
      { name: "limits", spec: ".limits" },
      foot,
    ],
    drive: async () => {
      await run(complete(exhibitC()));
      await expand("Missing explicit primary label");
    },
  },
  {
    name: "d1-detail",
    exceptions: true,
    plan: { section: "d", index: 0 },
    regions: [
      firstBand,
      { name: "row", spec: ".frow.open" },
      { name: "detail", spec: ".fdet" },
    ],
    drive: async () => {
      await run(
        complete(
          exhibitC([
            finding(
              "analysis.excluded",
              "Industrial_Safety",
              "Industrial Safety",
            ),
          ]),
        ),
      );
      await expand("Missing explicit primary label");
      await row("Industrial Safety").click();
    },
  },
  {
    name: "d2-alias",
    plan: { section: "d", index: 1, detailFromD1: true },
    regions: [
      "Rule",
      "Basis",
      "Entity",
      "Evidence",
      "Reading",
      "Consequence",
      "Correction",
      "Would add",
      "Also under",
    ].map((key) => ({
      name: key.toLowerCase().replace(/ /g, "-"),
      spec: ".fdet .kv",
      key,
    })),
    drive: async () => {
      await run(complete(report([welding])));
      await expand("Missing explicit primary label");
      await row("Welding Technology").click();
    },
  },
  {
    name: "e-coverage",
    exceptions: true,
    plan: {
      section: "e",
      index: 0,
      more: true,
      replace: [
        ["rdfs:label on a named class", "rdfs:label"],
        [
          "rdf:type on a named individual. This ontology asserts no individuals",
          "rdf:type on a named individual",
        ],
        ["Property domain and range", "Property domain"],
        [
          "License and version identifier, counted per ontology",
          "License, version and the rest of the publication checklist, counted per ontology",
        ],
      ],
      // The ontology metadata row: one record cannot have two missing.
      set: [["table.ct tbody tr:last-child td:nth-child(4)", "1"]],
    },
    regions: [
      tools,
      { name: "head", spec: "table.ct thead" },
      ...Array.from({ length: 7 }, (_, nth) => ({
        name: "row-" + (nth + 1),
        spec: "table.ct tbody tr",
        nth,
      })),
      { name: "note-1", spec: ".cov p", nth: 0 },
      { name: "note-2", spec: ".cov p", nth: 1 },
    ],
    drive: async () => {
      await run(
        complete(
          report(
            [
              finding(
                "label.missing",
                "Machine_Tool_Practicum",
                "Machine Tool Practicum",
              ),
            ],
            {
              coverage: checked(
                [
                  "label.missing",
                  "description.missing",
                  "structure.parent",
                  "analysis.excluded",
                  "structure.type",
                  "property.domain",
                  "metadata.missing",
                ],
                {
                  "label.missing": [5868, 1284],
                  "description.missing": [5868, 3907],
                  "structure.parent": [5868, 14],
                  "analysis.excluded": [5868, 30],
                  "structure.type": [0, 0],
                  "property.domain": [16, 7],
                  "metadata.missing": [1, 1],
                },
              ),
            },
          ),
        ),
      );
      await pane()
        .getByRole("button", { name: "Coverage", exact: true })
        .click();
    },
  },
  {
    name: "f-exception",
    exceptions: true,
    // The open detail marks its row open, as exhibit D does.
    plan: { section: "f", index: 0, classes: [[".frow.suppressed", "open"]] },
    regions: [
      { name: "row", spec: ".frow.suppressed" },
      { name: "exception", spec: ".fdet .kv", key: "Exception" },
      { name: "recorded", spec: ".fdet .kv", key: "Recorded" },
    ],
    drive: async () => {
      await run(complete(exhibitC()));
      await pane()
        .locator(".tools .chip")
        .filter({ hasText: "Suppressed" })
        .click();
      await expand("Missing explicit primary label");
      await row("Machine Tool Practicum").click();
    },
  },
  {
    name: "g1-review",
    plan: { section: "g", index: 0, before: ["Select all", "Cancel"] },
    regions: [
      bar,
      { name: "candidate-1", spec: ".lrow", text: "Industrial_Safety" },
      { name: "candidate-2", spec: ".lrow", text: "Shop_Class" },
      { name: "candidate-3", spec: ".lrow", text: "Machine_Tool" },
      { name: "ineligible", spec: ".lrow", text: "Fluid_Power" },
      foot,
    ],
    drive: async () => {
      await run(complete(reviewReport()));
      await pane()
        .getByRole("button", { name: "More finding options" })
        .click();
      await page.getByRole("button", { name: "Review missing labels" }).click();
      await pane().getByLabel("Include Industrial Safety").check();
      await pane().getByLabel("Include Shop Class").check();
    },
  },
  {
    name: "g2-preview",
    plan: { section: "g", index: 1, before: ["Cancel"] },
    full: true,
    regions: [],
    drive: async () => {
      await run(complete(reviewReport()));
      await pane()
        .getByRole("button", { name: "More finding options" })
        .click();
      await page.getByRole("button", { name: "Review missing labels" }).click();
      await pane().getByLabel("Include Industrial Safety").check();
      await pane().getByLabel("Include Shop Class").check();
      const statements = [
        ["Industrial_Safety", "Industrial Safety"],
        ["Shop_Class", "Shop Class"],
      ].map(([s, label]) => ({
        subject: NSB + s,
        predicate: RDFS + "label",
        object: {
          value: label,
          literal: true,
          language: "en",
          datatype: RDF + "langString",
        },
      }));
      const preview: QualityPreview = {
        token: 0x7f21,
        datasetEpoch: epoch,
        version: 4812,
        statements,
        multiGraph: [],
      };
      await setFixture({
        census: censusResult,
        status: complete(reviewReport()),
        preview,
      });
      await pane()
        .getByRole("button", { name: "Preview selected additions" })
        .click();
    },
  },
  {
    name: "g3-rejected",
    plan: { section: "g", index: 2, after: ["Cancel"] },
    regions: [bar, { name: "guard", spec: ".guard" }],
    drive: async () => {
      await run(complete(reviewReport()));
      await pane()
        .getByRole("button", { name: "More finding options" })
        .click();
      await page.getByRole("button", { name: "Review missing labels" }).click();
      await pane().getByLabel("Include Industrial Safety").check();
      await setFixture({
        census: censusResult,
        status: complete(reviewReport()),
        previewError:
          "quality-reject:edits::The ontology changed. Run the scan again before reviewing labels.",
      });
      await pane()
        .getByRole("button", { name: "Preview selected additions" })
        .click();
    },
  },
  {
    name: "h-narrow",
    exceptions: true,
    // Narrow presentations drop the rule id and the bar's Rerun, as exhibit A does.
    plan: {
      section: "h",
      index: 1,
      fromC: true,
      more: true,
      noRuleId: true,
      remove: [".bar .btn + .btn"],
      replace: [
        ["6,844 findings · 1 suppressed", "6,806 findings · 1 suppressed"],
      ],
    },
    regions: [
      bar,
      tools,
      firstBand,
      { name: "row-1", spec: ".frow", text: "Industrial Safety" },
      { name: "limits", spec: ".limits" },
      foot,
    ],
    drive: async () => {
      await run(complete(exhibitC()));
      await expand("Missing explicit primary label");
    },
  },
  {
    name: "h-shallow",
    exceptions: true,
    plan: {
      section: "h",
      index: 2,
      fromC: true,
      more: true,
      replace: [
        ["6,844 findings · 1 suppressed", "6,806 findings · 1 suppressed"],
      ],
    },
    regions: [bar, tools, foot],
    drive: async () => {
      await run(complete(exhibitC()));
      await expand("Missing explicit primary label");
    },
  },
  {
    name: "h-narrow-shallow",
    exceptions: true,
    plan: {
      section: "h",
      index: 3,
      fromC: true,
      constrained: true,
      noRuleId: true,
      remove: [".bar .btn + .btn"],
      replace: [
        ["6,844 findings · 1 suppressed", "6,806 findings · 1 suppressed"],
      ],
    },
    regions: [bar, tools, foot],
    drive: async () => {
      await run(complete(exhibitC()));
      await expand("Missing explicit primary label");
    },
  },
  {
    name: "h-recovery",
    exceptions: true,
    plan: {
      section: "h",
      index: 4,
      maximize: true,
      replace: [["6,844 findings", "6,806 findings"]],
    },
    full: true,
    regions: [],
    drive: () => run(complete(exhibitC())),
  },
];

test.afterEach(async () => {
  await app?.close();
});
for (const theme of ["light", "dark"] as const)
  for (const c of cases)
    test(`${theme} ${c.name}`, async () => {
      test.setTimeout(180000);
      await launch(theme, c.exceptions ? [exception] : []);
      const size = await prepare(c.plan, theme);
      // Drive at a working size, then take the specimen's size.
      await resize(Math.max(size.width, 720), Math.max(size.height, 460));
      await c.drive();
      await resize(size.width, size.height);
      await mount(size, theme);
      await compare(`${theme}-${c.name}`, !!c.full, c.regions);
    });
