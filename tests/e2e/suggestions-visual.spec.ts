import { assertCodeSurfaces, monochromeSource } from "./syntax-assertions";
import type {} from "../fixtures/suggestions-visual/workbench";
import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Every specified view frame, using real React controls (craigtrim/axiom#82).
const fixture = path.resolve(
  "tests/fixtures/suggestions-visual/visual-reference.html",
);
const directory = path.resolve("artifacts/suggestions-harness");
const corrections = `
.app { grid-template-columns:minmax(0,1fr); }
#runbar > h1 { margin-inline-end:auto; }
@media(max-width:900px) { #grid col:nth-child(2){width:auto!important} #grid col:nth-child(3){display:none} }
@media(max-width:680px) { .actionbar{flex-wrap:wrap} }
tbody.row.is-open .def,tbody.row.is-open .def-inline{-webkit-line-clamp:none}
.od-field{--od-gap:0px}.ctx-grid{margin:0}.pop-title{margin-top:0}
.def-inline{font-size:16px;color:var(--text)}input.check{margin:0}
/* Compare the view below the shell; #87 owns the tab strip. */
.tabstrip{visibility:hidden}
/* Decision 20 supplies real menu options; retain the measured control widths. */
#suggestKind{width:153px;flex-shrink:0}#assistant{width:151px;flex-shrink:0}
`;
test.beforeAll(async ({ browser }) => {
  const source = await readFile(fixture);
  expect(createHash("sha256").update(source).digest("hex")).toBe(
    "89dbb81700c3710da07e8c7fec04238dfd6d928dccec57975a6a03886beba458",
  );
  await mkdir(directory, { recursive: true });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(fixture).href);
  const targets = await page.evaluate("TARGETS");
  await page.close();
  await build({
    entryPoints: ["tests/fixtures/suggestions-visual/workbench.tsx"],
    outfile: path.join(directory, "workbench.js"),
    bundle: true,
    jsx: "automatic",
    format: "iife",
    platform: "browser",
  });
  await writeFile(
    path.join(directory, "index.html"),
    `<!doctype html><html lang="en" data-theme="auto"><head><link rel="stylesheet" href="${pathToFileURL(path.resolve("dist/renderer/app.css"))}"><link rel="stylesheet" href="workbench.css"><style>html,body{height:100%;margin:0;background:var(--ground)}#host{position:absolute;top:43.5px;left:0;width:100%;height:calc(100% - 43.5px)}</style></head><body><div id="host"></div><script>window.fixtureTargets=${JSON.stringify(targets)};window.axiom={preferences:{save:async()=>{}},keyboard:{modal:()=>{}}}</script><script src="workbench.js"></script></body></html>`,
  );
});
async function prepare(page: Page, actual: boolean, cached: boolean) {
  await page.clock.setFixedTime(new Date("2026-09-27T13:39:00-05:00"));
  if (!actual)
    await page.route("**/visual-reference.html", async (route) => {
      const source = (await readFile(fixture)).toString();
      await route.fulfill({
        contentType: "text/html",
        body: source.replace("</style>", corrections + "</style>"),
      });
    });
  await page.goto(
    pathToFileURL(actual ? path.join(directory, "index.html") : fixture).href,
  );
  if (actual) {
    await expect(
      page.getByRole("button", { name: "New run", exact: true }),
    ).toBeVisible();
    if (cached)
      await page.evaluate(() =>
        window.configureSuggestions({
          entry: {
            id: "fm-2",
            state: "completed",
            provider: "claude",
            cache: {
              hit: true,
              completedAt: Date.parse("2026-09-23T14:35:46-05:00"),
            } as never,
          },
        }),
      );
    return;
  }
  await page.evaluate((cached) => {
    const newRun = document.querySelector("#newRun")!;
    const another = document.createElement("button");
    another.className = "iconbtn";
    another.textContent = "⧉";
    another.setAttribute("aria-label", "Open another view");
    newRun.after(another);
    // Fixture-only overlap has no production source (issue Summary); #19 uses real IRIs.
    // The pinned script owns this fixture global.
    const targets = (0, eval)("TARGETS") as {
      runs: {
        items: {
          label: string;
          norm: string;
          overlap: string | null;
          match: string | null;
          iri: string;
        }[];
      }[];
    }[];
    targets.forEach((t) =>
      t.runs.forEach((r) =>
        r.items.forEach((it) => {
          it.overlap = null;
          it.norm = it.label.toLowerCase();
          if (it.match) it.match = it.label + " · " + it.iri;
        }),
      ),
    );
    if (cached) {
      const again = document.createElement("button");
      again.className = "btn";
      again.textContent = "Run again";
      newRun.before(again);
      const line = document.createElement("span");
      line.className = "runpeek";
      line.style.cssText = "flex:none;white-space:nowrap";
      line.textContent =
        "Cached result from 9/23/2026, 2:35:46 PM · Model not reported.";
      document.querySelector("#analysisPeek")!.after(line);
    }
  }, cached);
}
async function state(page: Page, frame: number, actual: boolean) {
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const check = async (name: string) =>
    page.getByRole("checkbox", { name: "Select " + name, exact: true }).check();
  const expand = async (name: string) =>
    button("Show details for " + name).click();
  if (frame === 2) {
    await page.keyboard.press("Tab");
    await page
      .getByRole("checkbox", {
        name: "Select Fashion Marketing and Promotion",
        exact: true,
      })
      .focus();
  }

  if (frame === 3)
    for (const label of [
      "Fashion Marketing and Promotion",
      "Fashion Sourcing and Production",
      "Assortment Planning",
    ])
      await check(label);
  if (frame === 4)
    await page
      .getByRole("checkbox", { name: "Select all available suggestions" })
      .check();
  if (frame === 5) await expand("Fashion Marketing and Promotion");
  if (frame === 6 || frame === 24) await expand("Fashion Buying");
  if (frame === 7) await expand("Merchandise Planning and Allocation");
  if (frame === 8) {
    await check("Assortment Planning");
    await expand("Assortment Planning");
  }
  if (frame === 9 || frame === 26) await button("Analysis").click();
  if (frame === 10) await button("Context").click();
  if (frame === 11) await button("Already exist 3").click();
  if (frame === 12 || frame === 13)
    await page.getByRole("searchbox").fill(frame === 12 ? "retail" : "zoology");
  if (frame === 14) {
    await button("Next target").click();
    await button("Added 0").click();
  }
  if (frame === 15) await button("Suggestion").click();
  if (frame === 16) {
    await button("Status").click();
    await button("Status").click();
  }
  if (frame === 17) {
    await check("Fashion Sourcing and Production");
    await check("Assortment Planning");
    await button("Add 2 children").click();
  }
  if (frame === 18) {
    await button("New run").click();
    await expect(
      page.getByText("New run recorded · 10 suggestions", { exact: true }),
    ).toBeVisible();
  }
  if (frame === 19)
    await page
      .getByRole("combobox", { name: "Run history" })
      .selectOption(actual ? "fm-1" : "1");
  if (frame === 20) await button("Next target").click();
  if (!actual)
    await page.evaluate(() => {
      document
        .querySelectorAll(".detail-label")
        .forEach(
          (l) =>
            (l.textContent = l.textContent!.replace(
              / proposed it$/,
              " proposed these",
            )),
        );
      if (innerWidth <= 900)
        document
          .querySelectorAll<HTMLTableCellElement>("tr.detail > td")
          .forEach((td) => (td.colSpan = 4));
      const panel = document.querySelector<HTMLElement>("#analysisPanel")!;
      if (!panel.hidden) {
        const delta = 16 - panel.getBoundingClientRect().left;
        if (delta > 0) panel.style.right = -delta + "px";
      }
    });
  await page.mouse.move(0, 0);
  if (frame !== 2)
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.waitForTimeout(50);
}
for (const theme of ["light", "dark"] as const)
  for (const frame of [...Array.from({ length: 26 }, (_, i) => i + 1), 28]) {
    test(`Suggestions ${theme} frame ${frame}`, async ({ browser }, info) => {
      const width =
        frame === 21
          ? 1000
          : frame === 22
            ? 800
            : frame === 23 || frame === 24
              ? 600
              : frame === 25 || frame === 26
                ? 375
                : 1280;
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: "reduce",
        locale: "en-US",
        timezoneId: "America/Chicago",
      });
      try {
        const expectedPage = await context.newPage(),
          actualPage = await context.newPage();
        await prepare(expectedPage, false, frame === 28);
        await prepare(actualPage, true, frame === 28);
        await state(expectedPage, frame, false);
        await state(actualPage, frame, true);
        // craigtrim/axiom#111: syntax colours change, reference geometry does not.
        const root = actualPage.locator("body");
        await assertCodeSurfaces(root, "code");
        await writeFile(
          info.outputPath("coloured.png"),
          await actualPage.screenshot(),
        );
        const restore = await monochromeSource(root);
        const expected = await expectedPage.screenshot(),
          actual = await actualPage.screenshot();
        await restore();
        await writeFile(info.outputPath("reference.png"), expected);
        await writeFile(info.outputPath("actual.png"), actual);
        const pixels = await actualPage.evaluate(
          async (images) => {
            const buffers = await Promise.all(
              images.map(async (data) => {
                const bitmap = await createImageBitmap(
                  await (await fetch("data:image/png;base64," + data)).blob(),
                );
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(bitmap, 0, 0);
                return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              }),
            );
            let count = 0;
            for (let i = 0; i < buffers[0].length; i += 4)
              if (
                [0, 1, 2, 3].some(
                  (c) => buffers[0][i + c] !== buffers[1][i + c],
                )
              )
                count++;
            return count;
          },
          [actual.toString("base64"), expected.toString("base64")],
        );
        expect(pixels).toBe(0);
      } finally {
        await context.close();
      }
    });
  }

test("Suggestions preserves hidden selections and only selects visible available rows", async ({
  page,
}) => {
  await prepare(page, true, false);
  const search = page.getByRole("searchbox");
  await page
    .getByRole("checkbox", { name: "Select Assortment Planning", exact: true })
    .check();
  await search.fill("Fashion Sourcing");
  const visible = await page.locator("tbody .ac-check:not(:disabled)").count();
  await page
    .getByRole("checkbox", { name: "Select all available suggestions" })
    .check();
  await expect(page.locator(".ac-selection")).toContainText(
    `${visible + 1} of`,
  );
  await search.clear();
  await expect(
    page.getByRole("checkbox", {
      name: "Select Assortment Planning",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select all available suggestions" }),
  ).toHaveJSProperty("indeterminate", true);
  await page
    .getByRole("button", { name: "Already exist 3", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Already exist 3", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("checkbox", { name: "Select all available suggestions" }),
  ).toBeDisabled();
  await expect(page.locator(".ac-selection")).toContainText(
    `${visible + 1} of`,
  );
});

test("Suggestions keeps an added row, filter and search, then clears its acknowledgement after four seconds", async ({
  page,
}) => {
  await page.clock.install();
  await prepare(page, true, false);
  await page.getByRole("searchbox").fill("Assortment");
  await page
    .getByRole("button", {
      name: "Show details for Assortment Planning",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Add this child", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Hide details for Assortment Planning",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("searchbox")).toHaveValue("Assortment");
  await expect(page.locator(".ac-toast")).toHaveText(
    "1 child added under Fashion Merchandising",
  );
  await expect(page.locator(".ac-selection")).toHaveText(
    "No suggestions selected",
  );
  await expect(
    page.getByRole("checkbox", {
      name: "Assortment Planning, Added, cannot be added",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => window.suggestionCalls.applied),
  ).toHaveLength(1);
  await page.clock.fastForward(4000);
  await expect(page.locator(".ac-toast")).toHaveCount(0);
  await page.getByRole("searchbox").fill("no matching suggestion");
  await page
    .getByRole("button", { name: "Clear filter and search", exact: true })
    .click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.getByRole("searchbox")).toHaveValue("");
});

test("Suggestions retains sorting while target and run changes reset review state", async ({
  page,
}) => {
  await prepare(page, true, false);
  const sort = page.getByRole("button", { name: "Suggestion", exact: true });
  const heading = page.getByRole("columnheader", {
    name: "Suggestion",
    exact: true,
  });
  await sort.click();
  await sort.click();
  await expect(heading).toHaveAttribute("aria-sort", "descending");
  await page
    .getByRole("checkbox", { name: "Select Assortment Planning", exact: true })
    .check();
  await page
    .getByRole("button", {
      name: "Show details for Assortment Planning",
      exact: true,
    })
    .click();
  await page.getByRole("searchbox").fill("Assortment");
  await page.getByRole("button", { name: "Available 5", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Run history" })
    .selectOption("fm-1");
  await expect(heading).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.locator(".ac-selection")).toHaveText(
    "No suggestions selected",
  );
  await expect(page.locator(".ac-detail-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^All \d/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Next target", exact: true }).click();
  await expect(heading).toHaveAttribute("aria-sort", "descending");
  await sort.click();
  await expect(heading).not.toHaveAttribute("aria-sort");
});

test("Suggestions panels keep trigger focus, follow tab order and stay open over table scrolling", async ({
  page,
}) => {
  await prepare(page, true, false);
  const analysis = page.getByRole("button", { name: "Analysis", exact: true });
  const context = page.getByRole("button", { name: "Context", exact: true });
  await analysis.click();
  await expect(analysis).toBeFocused();
  await expect(
    page.getByRole("group", { name: "Run analysis", exact: true }),
  ).toBeVisible();
  await page.locator(".ac-scroll").evaluate((e) => (e.scrollTop = 150));
  await expect(analysis).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(context).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("group", { name: "Run analysis", exact: true }),
  ).toHaveCount(0);
  await expect(context).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(context).toBeFocused();
  await expect(context).toHaveAttribute("aria-expanded", "false");
  await analysis.click();
  await page.getByRole("button", { name: "All 10", exact: true }).click();
  await expect(analysis).toHaveAttribute("aria-expanded", "false");
});

test("Suggestions uses pane width for its tiers and retains review state through shared recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await prepare(page, true, false);
  const resize = async (width: number, height = 850) => {
    await page.locator("#host").evaluate(
      (e, size) => {
        e.style.width = size.width + "px";
        e.style.height = size.height + "px";
      },
      { width, height },
    );
    await expect
      .poll(() =>
        page.locator(".add-children-panel").evaluate((e) => e.clientWidth),
      )
      .toBe(width);
  };
  await page
    .getByRole("checkbox", { name: "Select Assortment Planning", exact: true })
    .check();
  await page
    .getByRole("button", {
      name: "Show details for Assortment Planning",
      exact: true,
    })
    .click();
  for (const width of [1101, 1100, 901, 900, 681, 680, 375, 374, 300, 240]) {
    await resize(width);
    await expect(page.locator(".ac-peek")).toBeVisible({
      visible: width > 1100,
    });
    await expect(
      page.getByRole("columnheader", { name: "Definition", exact: true }),
    ).toBeVisible({ visible: width > 900 });
    const dimensions = await page
      .locator(".add-children-panel")
      .evaluate((e) => {
        const table = e.querySelector(".ac-scroll")!;
        return {
          outer: e.scrollWidth - e.clientWidth,
          table: table.scrollWidth - table.clientWidth,
        };
      });
    expect(dimensions.outer, `outer width ${width}`).toBeLessThanOrEqual(1);
    if (width >= 375)
      expect(dimensions.table, `table width ${width}`).toBeLessThanOrEqual(1);
    else expect(dimensions.table).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await resize(239);
  await expect(
    page.getByRole("button", { name: "Maximize pane", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ac-popover")).toBeHidden();
  await resize(600);
  await expect(
    page.getByRole("checkbox", {
      name: "Select Assortment Planning",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", {
      name: "Hide details for Assortment Planning",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("group", { name: "Run analysis", exact: true }),
  ).toBeVisible();
  await resize(600, 179);
  await expect(
    page.getByRole("button", { name: "Maximize pane", exact: true }),
  ).toBeVisible();
});

test("Suggestions shows cache controls only on cached runs and bypasses the cache explicitly", async ({
  page,
}) => {
  await prepare(page, true, false);
  await expect(
    page.getByRole("button", { name: "Run again", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".ac-cached")).toHaveCount(0);
  await page.evaluate(() =>
    window.configureSuggestions({
      entry: {
        id: "fm-2",
        state: "completed",
        provider: "claude",
        cache: { hit: true, completedAt: Date.now() } as never,
      },
    }),
  );
  await expect(page.locator(".ac-cached")).toContainText("Cached result from");
  await page.setViewportSize({ width: 375, height: 900 });
  for (const locator of [
    page.locator(".ac-cached"),
    page.getByRole("button", { name: "Analysis", exact: true }),
    page.getByRole("button", { name: "Context", exact: true }),
  ]) {
    const box = await locator.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  expect(await page.evaluate(() => window.suggestionCalls.bypass)).toEqual([
    true,
  ]);
});

test("Suggestions clamps zoomed panels and flips above a low docked view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await prepare(page, true, false);
  await page.locator("#host").evaluate((e) => {
    e.style.top = "550px";
    e.style.width = "600px";
    e.style.height = "340px";
  });
  await page
    .locator(".add-children-panel")
    .dispatchEvent("wheel", { deltaY: -148.762, ctrlKey: true, bubbles: true });
  await expect(page.locator(".adaptive-pane")).toHaveAttribute(
    "data-pane-zoom",
    "1.25",
  );
  const trigger = page.getByRole("button", { name: "Analysis", exact: true });
  await trigger.click();
  const panel = page.getByRole("group", { name: "Run analysis", exact: true });
  await expect
    .poll(async () => {
      const box = await panel.boundingBox(),
        button = await trigger.boundingBox();
      return (
        !!box &&
        !!button &&
        box.x >= 16 &&
        box.x + box.width <= 984 &&
        box.y >= 16 &&
        box.y + box.height <= button.y
      );
    })
    .toBe(true);
});
