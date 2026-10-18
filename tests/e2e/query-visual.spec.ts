// craigtrim/axiom#88: compare against the pinned reference with the approved data mappings.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  launchQuery,
  queryReference,
  starter,
  type QueryFixture,
} from "./query-reference-fixture";
import { buildQueryPrompt } from "../../src/shared/query-assistant";
import { queryCellText } from "../../src/shared/query-grid";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
let f: QueryFixture, specimen: Page;
let actualPane: Locator;
const output = path.resolve(
  process.env.AXIOM_VISUAL_OUTPUT ?? "artifacts/issue-88-visual",
);
const fixes = `.gutter{white-space:pre}@container pane (min-width:240px) and (min-height:180px){.body{display:grid;grid-template-rows:minmax(0,1fr);min-height:0}}
#pane[aria-labelledby="tab-query"] #aCols,#pane:has(#ctx:empty) #aCols{display:none!important}
.btn.primary:disabled{color:var(--idle);background:none}.pane{position:relative}.hist .hrow{height:auto}.recov{grid-row:1/-1}
/* The pane crop excludes the shell, whose straight group corners belong to #87. */
.dock{border-radius:0}
/* Decision 22 discloses the real, potentially long executable path. */
.comp .cbody > *{min-width:0}.ctxbox>summary{overflow-wrap:anywhere}`;
async function open(theme: string) {
  f = await launchQuery(theme);
  await mkdir(output, { recursive: true });
  actualPane = f.host;
  const opened = f.app.waitForEvent("window");
  await f.app.evaluate(async ({ BrowserWindow }, file) => {
    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      focusable: false,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadFile(file);
    win.showInactive();
  }, queryReference);
  specimen = await opened;
  await specimen.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    theme,
  );
  await specimen.addStyleTag({ content: fixes });
  await specimen
    .locator("#recovBtn")
    .evaluate((el) => (el.textContent = "Maximize pane"));
  await specimen
    .locator("#gDesc")
    .evaluate(
      (el: HTMLTextAreaElement) =>
        (el.placeholder =
          "For example: Find classes whose names start with American."),
    );
}
async function metadata() {
  const history = await f.history();
  const ran = history.current.lastRun?.summary.id;
  const result = ran
    ? await f.page.evaluate(async () => {
        const h = await window.axiom.queryHistory.load();
        const r = h.current.lastRun!;
        return window.axiom.queryHistory.result(`${r.session}:${r.summary.id}`);
      })
    : null;
  await specimen.locator("#foot").evaluate(
    (el, { number, count, time }) => {
      el.innerHTML = `<span>Document <span class="num">${number}</span></span><span><span class="num">63</span> triples</span>${time ? `<span>Ran ${time}</span>` : ""}<span><span class="num">${count}</span> in history</span>`;
    },
    {
      number: history.entries.findIndex((e) => e.id === history.activeId) + 1,
      count: history.entries.length,
      time: result?.completedAt
        ? new Date(result.completedAt).toLocaleTimeString("en-US")
        : "",
    },
  );
  // The prototype redraws this line on sorting; restore the execution's actual time.
  if (result)
    await specimen
      .locator("#ctx .opt .num")
      .first()
      .evaluate(
        (el, time) => (el.textContent = time),
        new Date(result.completedAt).toLocaleTimeString("en-US"),
      );
  const agents = await f.page.evaluate(() =>
    window.axiom.queryAssistant.assistants(),
  );
  const description = await specimen
    .locator("#gDesc")
    .inputValue()
    .catch(() => "");
  const context = await f.page.evaluate(
    (instructions) =>
      window.axiom.request<any>("queryContext", { instructions }),
    description,
  );
  await specimen.evaluate(
    ({ agents, lines, omitted }) => {
      const summary = document.querySelector(".ctxbox>summary");
      if (summary)
        summary.textContent = `What gets sent: ${lines} context lines, ${omitted} omitted, from ${agents.find((a) => a.id === "codex")?.path ?? "no executable"}`;
      const description = document.querySelector<HTMLTextAreaElement>("#gDesc");
      if (description)
        description.placeholder =
          "For example: Find classes whose names start with American.";
      const generate = document.querySelector<HTMLButtonElement>("#gRun");
      if (generate && description && !description.value.trim())
        generate.disabled = true;
    },
    {
      agents,
      lines: context.terms.length + context.predicates.length,
      omitted: context.omitted + (context.omittedPredicates ?? 0),
    },
  );
  const refined = await specimen
    .locator("#gRefine")
    .getAttribute("aria-checked")
    .catch(() => "false");
  const original = await f.page.evaluate(
    async () => (await window.axiom.queryHistory.load()).current.text,
  );
  const prompt = buildQueryPrompt(context, {
    provider: "codex",
    instructions: description,
    currentQuery: refined === "true" ? original : "",
    datasetEpoch: context.datasetEpoch,
    version: context.version,
  });
  await specimen
    .locator(".cc")
    .evaluate((el, prompt) => (el.textContent = prompt), prompt);
  if (refined === "true")
    for (const page of [f.page, specimen])
      await page
        .locator(".cc")
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
}
async function compare(
  name: string,
  actualRoot: Locator = actualPane,
  expectedRoot: Locator = specimen.locator(".pane"),
) {
  await metadata();
  for (const page of [f.page, specimen]) {
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  }
  const inspect = (root: Locator) =>
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
            font: c.font,
            color: c.color,
            background: c.backgroundColor,
            border: c.border,
            padding: c.padding,
          };
        }),
    );
  await writeFile(
    path.join(output, name + "-layout.json"),
    JSON.stringify(
      {
        app: await inspect(actualRoot),
        reference: await inspect(expectedRoot),
      },
      null,
      2,
    ),
  );
  const popupLayout = async (page: Page) =>
    page
      .locator(".menu:visible")
      .evaluateAll((els) =>
        els
          .flatMap((el) => [el, ...el.querySelectorAll("*")])
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            box: el.getBoundingClientRect().toJSON(),
            font: getComputedStyle(el).font,
            lineHeight: getComputedStyle(el).lineHeight,
            padding: getComputedStyle(el).padding,
          })),
      );
  await writeFile(
    path.join(output, name + "-menus.json"),
    JSON.stringify(
      {
        app: await popupLayout(f.page),
        reference: await popupLayout(specimen),
      },
      null,
      2,
    ),
  );
  const capture = async (root: Locator) =>
    root
      .page()
      .screenshot({
        clip: (await root.boundingBox())!,
        animations: "disabled",
        scale: "css",
      });
  const actual = await capture(actualRoot),
    expected = await capture(expectedRoot);
  await writeFile(path.join(output, name + "-app.png"), actual);
  await writeFile(path.join(output, name + "-reference.png"), expected);
  // Keep the measured raster differences visible in the report, with no area mask.
  // Monaco clips one glyph-edge pixel; Chromium paints these curved edges slightly differently.
  const raster = name.includes("13-describe-agents-refreshed")
    ? {
        limit: 15,
        edges: [
          [596, 203, 599, 207, 32],
          [619, 203, 622, 207, 32],
          [606, 203, 608, 207, 4],
        ],
      }
    : name.includes("15-opened-in-editor")
      ? {
          limit: 2,
          edges: [
            [46, 5, 46, 5, 4],
            [49, 101, 49, 102, name.startsWith("dark") ? 60 : 12],
          ],
        }
      : name === "light-02-fields-written"
        ? { limit: 1, edges: [[46, 5, 46, 5, 4]] }
        : { limit: 0, edges: [] };
  const diff = await f.app.evaluate(
    ({ nativeImage }, { data, edges }) => {
      const [a, b] = data.map((v) =>
          nativeImage.createFromBuffer(Buffer.from(v, "base64")),
        ),
        p = a.toBitmap(),
        q = b.toBitmap();
      if (p.length !== q.length || a.getSize().width !== b.getSize().width)
        return {
          pixels: -1,
          unexpected: -1,
          actual: a.getSize(),
          expected: b.getSize(),
        };
      let pixels = 0,
        unexpected = 0;
      const rows: Record<number, number> = {};
      for (let i = 0; i < p.length; i += 4) {
        const delta = Math.max(
          ...[0, 1, 2].map((c) => Math.abs(p[i + c] - q[i + c])),
        );
        if (delta <= 2) continue;
        pixels++;
        const x = (i / 4) % a.getSize().width,
          y = Math.floor(i / 4 / a.getSize().width);
        rows[y] = (rows[y] ?? 0) + 1;
        if (
          !edges.some(
            ([l, t, r, b, max]) =>
              x >= l && x <= r && y >= t && y <= b && delta <= max,
          )
        )
          unexpected++;
      }
      return { pixels, unexpected, rows };
    },
    {
      data: [actual.toString("base64"), expected.toString("base64")],
      edges: raster.edges,
    },
  );
  await writeFile(
    path.join(output, name + "-diff.json"),
    JSON.stringify(diff, null, 2),
  );
  expect.soft(diff.unexpected, name + " unexpected pixels").toBe(0);
  expect
    .soft(diff.pixels, name + " total differing pixels")
    .toBeLessThanOrEqual(raster.limit);
}
async function referenceText(text: string) {
  await specimen.locator("#q").evaluate((el: HTMLTextAreaElement, text) => {
    el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}
async function describe(text = "") {
  await f.describe(text);
  await specimen.locator('[data-cm="nl"]').click();
  await specimen.locator("#gDesc").fill(text);
}
async function outcome(text: string) {
  await describe(text);
  await f.composer
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await specimen.locator("#gRun").click();
  await expect(f.composer.locator(".prop")).toBeVisible();
  await expect(specimen.locator(".prop")).toBeVisible();
  await metadata();
  for (const root of [f.composer, specimen.locator("#comp")])
    await root.evaluate((el) => (el.scrollTop = el.scrollHeight));
}
async function resize(width: number, height: number) {
  // The published sizes include a 28px shell tab strip and 1px outer rule.
  if (actualPane === f.host) await f.size(width - 2, height - 30);
  else
    await actualPane.evaluate(
      (el, { width, height }) =>
        Object.assign((el as HTMLElement).style, {
          width: width - 2 + "px",
          height: height - 30 + "px",
        }),
      { width, height },
    );
  await specimen.locator("#dock").evaluate(
    (el, { width, height }) => {
      Object.assign((el as HTMLElement).style, {
        width: width + "px",
        height: height + "px",
      });
      window.dispatchEvent(new Event("resize"));
    },
    { width, height },
  );
}
const credits = "courses with their credit values";
async function running() {
  await writeFile(path.join(f.profile, "timing.json"), '{"delay":20000}');
  await describe(credits);
  await expect
    .poll(() => f.page.evaluate(() => window.axiom.queryAssistant.status()))
    .toMatchObject({ running: false });
  const now = Date.now();
  await f.page.clock.install({ time: new Date(now) });
  await f.page.clock.pauseAt(new Date(now + 1000));
  await f.composer
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await expect(
    f.composer.getByRole("button", { name: "Cancel generation" }),
  ).toBeVisible();
  // Both windows share Electron's browser context and therefore one test clock.
  await specimen.locator("#gRun").click();
  await f.page.clock.runFor(700);
  // Retain the application's generation lock while the service owns its request.
  await specimen
    .locator("#gDesc,#gProv,#gScan,#gRefine")
    .evaluateAll((els) =>
      els.forEach((el) => ((el as HTMLInputElement).disabled = true)),
    );
  await specimen.addStyleTag({ content: ".sw:disabled{opacity:.45}" });
  await expect(f.composer.locator(".elapsed")).toHaveText("0.7s");
}
async function runResults(text = starter, toast = false) {
  await f.host.evaluate((el) => el.removeAttribute("style"));
  await f.enter(text);
  await referenceText(text);
  await f.pane.getByRole("button", { name: "Run", exact: true }).click();
  await specimen.locator("#run").click();
  const panel = f.page.locator(".query-results-panel:visible");
  await expect(panel.locator(".state")).toContainText(/\d+ rows?/);
  actualPane = panel.locator("..").locator("..");
  actualPane = f.page.locator(".adaptive-pane").filter({ has: panel });
  await actualPane.evaluate((el) =>
    Object.assign((el as HTMLElement).style, {
      position: "fixed",
      left: "24px",
      top: "24px",
      width: "898px",
      height: "530px",
      zIndex: "1000",
    }),
  );
  const data = await f.page.evaluate(async () => {
    const h = await window.axiom.queryHistory.load(),
      r = h.current.lastRun!;
    const id = {
      id: r.summary.id,
      key: r.queryKey ?? h.activeId,
      epoch: r.datasetEpoch,
    };
    return {
      info: await window.axiom.request<any>("queryColumns", id),
      page: await window.axiom.request<any>("queryPage", {
        ...id,
        start: 0,
        end: 100,
      }),
      document: await window.axiom.queryHistory.result(
        `${r.session}:${r.summary.id}`,
      ),
    };
  });
  const rows = data.page.rows.map((row: any[]) =>
    row.map((term) => queryCellText(term, data.info.prefixes)),
  );
  await specimen.evaluate(
    ({ rows, time }) => {
      // The engine controls unsorted result order and actual completion time.
      document
        .querySelectorAll(".grid tbody tr")
        .forEach((tr, i) =>
          tr
            .querySelectorAll("td")
            .forEach((td, j) => (td.textContent = rows[i][j])),
        );
      const at = document.querySelector("#ctx .opt .num");
      if (at) at.textContent = time;
    },
    {
      rows,
      time: new Date(data.document!.completedAt).toLocaleTimeString("en-US"),
    },
  );
  if (rows.length)
    await expect(panel.locator(".ag-row")).toHaveCount(rows.length);
  if (!toast) {
    await expect(panel.locator(".toast")).toBeHidden({ timeout: 6000 });
    await expect(specimen.locator("#toast")).toBeHidden({ timeout: 6000 });
  }
}
async function more(results = false) {
  const root = results ? actualPane : f.pane;
  await root.getByRole("button", { name: "More actions", exact: true }).click();
  await specimen.locator("#aMore").click();
  await specimen.locator(".menu").evaluate((el, results) => {
    const demo = el.querySelector("button:last-child")!;
    demo.previousElementSibling?.remove();
    demo.remove();
    const sep = document.createElement("div");
    sep.className = "sep";
    el.append(sep);
    for (const [label, key] of results
      ? [
          ["Open query", ""],
          ["Send results to graph", ""],
        ]
      : [
          ["Format SPARQL", "Shift+Alt+F"],
          ["Find a query in history", ""],
        ]) {
      const b = document.createElement("button");
      b.textContent = label;
      if (key) {
        const k = document.createElement("span");
        k.className = "k";
        k.textContent = key;
        b.append(k);
      }
      el.append(b);
    }
    (el as HTMLElement).style.left =
      document.querySelector("#aMore")!.getBoundingClientRect().right -
      (el as HTMLElement).offsetWidth +
      "px";
  }, results);
}
const frames: Record<string, () => Promise<void>> = {
  "01-query-fields": async () => {},
  "02-fields-written": async () => {
    await f.composer
      .getByLabel("Subject class")
      .selectOption("https://axiom.test/courses#Marketing");
    await f.composer.getByPlaceholder("Any value").fill("Advert");
    await f.composer
      .getByRole("button", { name: "Write into the editor" })
      .click();
    await specimen.locator("#cClass").selectOption("ax:Marketing");
    await specimen.locator("#cVal").fill("Advert");
    await specimen.locator("#cApply").click();
    // Decision 23 uses the ontology namespace and the full catalog, not demo prefixes.
    await expect
      .poll(async () => (await f.history()).current.text)
      .toContain("LIMIT 50");
    await referenceText((await f.history()).current.text);
  },
  "03-describe-idle": async () => describe(),
  "04-describe-context-open": async () => {
    await describe(credits);
    await f.composer.locator(".ctxbox summary").click();
    await specimen.locator(".ctxbox summary").click();
    await expect(f.composer.locator(".cc")).toContainText(credits);
  },
  "05-describe-refine-on": async () => {
    await describe(credits);
    await f.composer.getByRole("switch").click();
    await specimen.locator("#gRefine").click();
    await f.composer.locator(".ctxbox summary").click();
    await specimen.locator(".ctxbox summary").click();
    await metadata();
    for (const p of [f.page, specimen])
      await p.locator(".cc").evaluate((el) => (el.scrollTop = el.scrollHeight));
  },
  "06-describe-running": running,
  "07-describe-validated": async () => outcome(credits),
  "08-describe-validated-synonyms": async () =>
    outcome("which courses have synonyms"),
  "09-describe-refused-update": async () =>
    outcome("delete every course credit"),
  "10-describe-refused-term": async () =>
    outcome("which instructor teaches each course"),
  "11-describe-unsupported": async () =>
    outcome("what is the weather in Boston"),
  "12-describe-signed-out": async () => {
    await specimen.locator("#aMore").click();
    await specimen.locator(".menu button").last().click();
    await expect(specimen.locator("#toast")).toBeHidden({ timeout: 6000 });
    await outcome("signed out");
    const status = await f.page.evaluate(() =>
      window.axiom.queryAssistant.status(),
    );
    await specimen
      .locator(".prop>span")
      .first()
      .evaluate((el, text) => (el.textContent = text), status.error!);
    await specimen
      .locator("#comp")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
  },
  "13-describe-agents-refreshed": async () => {
    await describe(credits);
    const source = path.join(f.profile, "version.cs");
    await writeFile(
      source,
      'class Version { static void Main() { System.Console.WriteLine("Claude Code 2.1.270"); } }',
    );
    await promisify(execFile)(
      path.join(
        process.env.SystemRoot!,
        "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
      ),
      ["/nologo", "/out:" + path.join(f.bin, "claude.exe"), source],
      { windowsHide: true },
    );
    await f.composer
      .getByRole("button", { name: "Refresh agents", exact: true })
      .click();
    await specimen.locator("#gScan").click();
    await expect(f.pane.locator(".toast")).toContainText("Claude Code 2.1.270");
  },
  "14-describe-cancelled": async () => {
    await running();
    await f.composer.getByRole("button", { name: "Cancel generation" }).click();
    await specimen.locator("#gCancel").click();
    await expect(f.pane.locator(".toast")).toContainText(
      "Generation cancelled.",
    );
  },
  "15-opened-in-editor": async () => {
    await outcome(credits);
    await f.composer
      .getByRole("button", { name: "Open in the editor", exact: true })
      .click();
    await specimen.locator("#gOpen").click();
    await referenceText((await f.history()).current.text);
    await specimen
      .locator("#toast b")
      .evaluate(
        (el, n) => (el.textContent = `Opened as document ${n}.`),
        (await f.history()).entries.length,
      );
  },
  "16-opened-for-correction": async () => {
    await outcome("which instructor teaches each course");
    await f.composer
      .getByRole("button", { name: "Open it for correction" })
      .click();
    await specimen.locator("#gKeep").click();
    await specimen
      .locator("#toast b")
      .evaluate(
        (el, n) => (el.textContent = `Opened for correction as document ${n}.`),
        (await f.history()).entries.length,
      );
  },
  "17-run-error": async () => {
    const invalid = "SELECT ?course WHERE {";
    await f.enter(invalid);
    await referenceText(invalid);
    await f.pane.getByRole("button", { name: "Run", exact: true }).click();
    await specimen.locator("#run").click();
    await expect(f.pane.locator(".state")).toContainText("Not run:");
    const error = (await f.pane.locator(".state").getAttribute("title"))!;
    await specimen
      .locator("#state")
      .evaluate(
        (el, error) => (el.textContent = "Not run: " + error.split(/\r?\n/)[0]),
        error,
      );
    await specimen
      .locator("#toast .sub")
      .evaluate((el, error) => (el.textContent = error), error);
  },
  "18-results-grid": async () => runResults(),
  "19-results-run-toast": async () => runResults(starter, true),
  "20-results-sorted": async () => {
    await runResults();
    await actualPane
      .getByRole("button", { name: "?name", exact: true })
      .click();
    await specimen.locator('[data-sort="?name"]').click();
  },
  "21-results-columns-menu": async () => {
    await runResults();
    await actualPane
      .getByRole("button", { name: "Columns", exact: true })
      .click();
    await specimen.locator("#aCols").click();
  },
  "22-results-zero-rows": async () =>
    runResults(
      'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n\nSELECT ?course ?name WHERE {\n  ?course rdfs:label ?name .\n  FILTER(CONTAINS(?name, "Astronomy"))\n}',
    ),
  "23-history-popup": async () => {
    await f.describe(credits);
    await f.composer.getByRole("switch").click();
    await f.composer
      .getByRole("button", { name: "Generate", exact: true })
      .click();
    await f.composer
      .getByRole("button", { name: "Open in the editor", exact: true })
      .click();
    await expect.poll(async () => (await f.history()).entries.length).toBe(3);
    await runResults();
    await actualPane
      .getByRole("button", { name: "History", exact: true })
      .click();
    await specimen.locator("#aHist").click();
    const view = await f.history();
    await specimen.locator(".menu.hist").evaluate((el, entries) => {
      el.replaceChildren();
      for (let index = entries.length - 1; index >= 0; index--) {
        const e = entries[index],
          b = document.createElement("button");
        b.className = "hrow";
        const q = document.createElement("span");
        q.className = "hq";
        q.textContent =
          e.preview.replace(/\s+/g, " ").slice(0, 70) || "New query";
        const m = document.createElement("span");
        m.className = "hm";
        m.textContent = `document ${index + 1}, ${new Date(e.createdAt).toLocaleTimeString("en-US")}${e.rows === undefined ? "" : `, ${e.rows} ${e.rows === 1 ? "row" : "rows"}`}`;
        if (e.parentId) {
          m.append(", ");
          const parent = document.createElement("span");
          parent.className = "br";
          parent.textContent = `branched from ${entries.findIndex((v) => v.id === e.parentId) + 1}`;
          m.append(parent);
        }
        b.append(q, m);
        el.append(b);
      }
      (el as HTMLElement).style.left =
        document.querySelector("#aHist")!.getBoundingClientRect().right -
        (el as HTMLElement).offsetWidth +
        "px";
    }, view.entries);
  },
  "24-more-menu-query": async () => more(),
  "25-more-menu-results": async () => {
    await runResults();
    await more(true);
  },
  "26-narrow-800x560": async () => resize(800, 560),
  "27-narrow-compose-800x560": async () => {
    await resize(800, 560);
    await f.pane
      .getByRole("button", { name: "Compose query", exact: true })
      .click();
    await specimen.locator("#aCompose").click();
  },
  "28-narrow-results-560x560": async () => {
    await runResults();
    await resize(560, 560);
  },
  "29-narrow-menu-420x560": async () => {
    await runResults();
    await resize(420, 560);
    await more(true);
  },
  "30-shallow-900x360": async () => resize(900, 360),
  "31-shallow-results-900x360": async () => {
    await runResults();
    await resize(900, 360);
  },
  "32-recovery-220x300": async () => resize(220, 300),
};
test.afterEach(async () => {
  await f?.app.close();
});
for (const theme of ["light", "dark"])
  for (const [name, action] of Object.entries(frames))
    test(`Query visual ${theme} ${name}`, async () => {
      await open(theme);
      await action();
      await compare(`${theme}-${name}`);
    });
