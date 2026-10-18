import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { NS } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";

let app: ElectronApplication, main: Page, page: Page;
const errors: string[] = [];
const base = "https://example.test/find-adaptive#";
const pane = () => page.locator('[data-panel="find"]');
const host = () => page.locator('[data-pane-id="find"]');
const query = () =>
  pane().getByRole("searchbox", { name: "Search the ontology", exact: true });
const rows = () => pane().locator(".find-results tbody tr");
const scope = () => pane().getByRole("button", { name: /^Search scope:/ });
const create = () =>
  pane().getByRole("region", {
    name: "Add to the ontology",
    exact: true,
  });
async function menu(id: string, target = page) {
  const win = await app.browserWindow(target);
  const targetId = await win.evaluate((window) => window.id);
  await app.evaluate(
    ({ Menu, BrowserWindow }, { id, targetId }) => {
      const window = BrowserWindow.fromId(targetId)!;
      Menu.getApplicationMenu()!
        .getMenuItemById(id)!
        .click({} as never, window, window.webContents as never);
    },
    { id, targetId },
  );
}
async function size(width: number, height: number) {
  const window = await app.browserWindow(page);
  // Capture the stable pane insets before native restore starts. The native
  // viewport can resize before the docking layout receives its new bounds.
  const inset = await host().evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      width: innerWidth - rect.width,
      height: innerHeight - rect.height,
    };
  });
  if (await window.evaluate((win) => win.isMaximized())) {
    await window.evaluate((win) => win.unmaximize());
    await expect
      .poll(() => window.evaluate((win) => win.isMaximized()))
      .toBe(false);
  }
  await window.evaluate(
    (win, target) => {
      win.setMinimumSize(100, 100);
      win.setContentSize(Math.round(target.width), Math.round(target.height));
    },
    { width: width + inset.width, height: height + inset.height },
  );
  await expect
    .poll(async () => {
      const bounds = (await host().boundingBox())!;
      const actual = {
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
      // Native frame insets can settle after detaching; target the measured pane (#83).
      if (actual.width !== width || actual.height !== height)
        await window.evaluate(
          (win, delta) => {
            const [w, h] = win.getContentSize();
            win.setContentSize(w + delta.width, h + delta.height);
          },
          { width: width - actual.width, height: height - actual.height },
        );
      return actual;
    })
    .toEqual({ width, height });
}
async function fits(locator: Locator) {
  await expect(locator).toBeVisible();
  const outer = (await host().boundingBox())!,
    inner = (await locator.boundingBox())!;
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(
    outer.y + outer.height + 1,
  );
}
async function settled() {
  await expect(pane().locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
async function more() {
  await pane().getByRole("button", { name: "More", exact: true }).click();
  return pane().getByRole("dialog", { name: "More", exact: true });
}
async function pageSize(limit: number) {
  const popover = await more();
  await popover.getByLabel("Results per page").selectOption(String(limit));
  await popover.getByLabel("Results per page").press("Escape");
  await settled();
}
async function noOverflow() {
  expect(await pane().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(
    await pane()
      .locator(".find-results-scroll")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
}

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(
    path.resolve("artifacts/testing/find-adaptive-"),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "no-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  main = page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.setFocusable(false)),
    );
  await expect(page.locator(".docking-workspace")).toBeVisible();
  const file = path.join(profile, "find-adaptive.ttl");
  await writeFile(
    file,
    `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> .
    : a owl:Ontology . :Root a owl:Class; rdfs:label "Foundation with a long ancestry name for left truncation" .
    :ReadingComprehension a owl:Class; rdfs:label "Reading Comprehension"; rdfs:subClassOf :Root .
    ${Array.from({ length: 260 }, (_, i) => `:Topic${i} a owl:Class; rdfs:label "Topic ${String(i).padStart(3, "0")}"; rdfs:subClassOf :Root; skos:altLabel "Alias ${i}"; rdfs:comment "Description ${i}" .`).join("\n")}`,
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
    .toBe("find-adaptive.ttl");
  await menu("view.find");
  await expect(pane()).toBeVisible();
  await query().focus();
  const detached = app.waitForEvent("window");
  await menu("pane.detach");
  page = await detached;
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((win) => win.setFocusable(false));
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(pane()).toBeVisible();
  await size(1100, 660);
  await settled();
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("Find", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
  } finally {
    await app?.close();
  }
  expect(errors).toEqual([]);
});

test("control homes fit at 600 by 400 and More owns all four page sizes", async () => {
  // Approach the entry threshold from Expanded; a pane already compact
  // must first cross the 616/416 exit thresholds (#83).
  await size(800, 600);
  await expect(host()).toHaveAttribute("data-pane-layout", "expanded");
  await size(600, 400);
  await expect(host()).toHaveAttribute("data-pane-layout", "expanded");
  await expect(rows()).toHaveCount(0);
  await expect(
    pane().getByRole("button", { name: "Clear", exact: true }),
  ).toHaveCount(0);
  await query().fill("Topic");
  await expect(rows()).toHaveCount(50);
  await expect(
    pane().getByRole("button", { name: "Reset filters", exact: true }),
  ).toBeHidden();
  await expect(
    pane().getByRole("button", { name: "Recent searches", exact: true }),
  ).toBeVisible();
  const boxes = await pane()
    .locator(
      '.find-controls > .find-query, .find-controls > .find-sort select, .find-controls > button[aria-label="More"]',
    )
    .evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
  expect(Math.max(...boxes.map((r) => r.top))).toBeLessThan(
    Math.min(...boxes.map((r) => r.bottom)),
  );
  const popup = await more();
  await expect(
    popup.getByLabel("Results per page").locator("option"),
  ).toHaveText(["25", "50", "100", "200"]);
  await popup.getByLabel("Results per page").selectOption("200");
  await popup.getByLabel("Results per page").press("Escape");
  await expect(rows()).toHaveCount(200);
  await noOverflow();
  await fits(pane().getByRole("columnheader", { name: "Entity", exact: true }));
  await page.screenshot({ path: "artifacts/testing/find-expanded-600.png" });
});

for (const [width, height, mode, columns] of [
  [1100, 660, "expanded", 3],
  [360, 660, "narrow", 2],
  [1100, 260, "shallow", 3],
  [360, 260, "constrained", 1],
  [240, 416, "narrow", 2],
  [240, 210, "constrained", 1],
  [616, 180, "shallow", 3],
] as const) {
  test(`${mode} at ${width} by ${height} presents every result value without horizontal scrolling`, async () => {
    await query().fill("Topic");
    await settled();
    await size(width, height);
    await expect(host()).toHaveAttribute("data-pane-layout", mode);
    // #49 adds the reserved trailing action column in every presentation.
    await expect(pane().getByRole("columnheader")).toHaveCount(columns + 1);
    await fits(
      pane().getByRole("columnheader", { name: "Entity", exact: true }),
    );
    await expect(rows().first()).toContainText("Alias");
    await expect(rows().first()).toContainText("Class");
    if (mode !== "expanded") {
      await expect(scope()).toHaveAttribute(
        "aria-label",
        /2 of \d+ fields, 4 of 4 types/,
      );
    }
    if (mode === "narrow" || mode === "constrained") {
      await expect(rows().first().locator("td").first()).toContainText("Alias");
    }
    if (mode === "constrained") {
      await expect(rows().first().locator("td").first()).toContainText("Class");
      await expect(pane().getByLabel("Sort")).toBeHidden();
    }
    await noOverflow();
    const undersized = await pane()
      // Entity names sit inside a clickable row; measure that row as
      // their target, and retain the 24 px minimum for standalone controls (#83).
      .locator(
        "button:visible:not(.find-store button):not(.find-result-name), select:visible",
      )
      .evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width < 24 || r.height < 24;
          })
          .map((el) => el.outerHTML),
      );
    expect(undersized).toEqual([]);
    expect((await rows().first().boundingBox())!.height).toBeGreaterThanOrEqual(
      24,
    );
    await page.screenshot({ path: `artifacts/testing/find-${mode}.png` });
  });
}

test("hysteresis preserves query, scope, sort, page, selection and scroll at every crossing", async () => {
  await query().fill("Topic");
  await pageSize(25);
  await pane().getByLabel("Sort").selectOption("name");
  await settled();
  await pane()
    .getByRole("button", { name: "Next results page", exact: true })
    .click();
  await settled();
  await rows().nth(8).focus();
  await rows().nth(8).press("Space");
  const text = await rows().nth(8).textContent();
  // Seed a real scroll position. The reference's shorter rows can leave the
  // focused ninth result visible without scrolling the initial pane (#83).
  const scroll = pane().locator(".find-results-scroll");
  await scroll.evaluate((el) => (el.scrollTop = 200));
  const initialScroll = await scroll.evaluate((el) => el.scrollTop);
  expect(initialScroll).toBe(200);
  for (const [width, height, mode] of [
    [598, 660, "narrow"],
    [600, 660, "narrow"],
    [614, 660, "narrow"],
    [616, 660, "expanded"],
    [616, 398, "shallow"],
    [616, 400, "shallow"],
    [616, 414, "shallow"],
    [616, 416, "expanded"],
    [598, 398, "constrained"],
    [616, 416, "expanded"],
  ] as const) {
    await size(width, height);
    await expect(host()).toHaveAttribute("data-pane-layout", mode);
    // The rail and its entry use the same hysteresis (craigtrim/axiom#83).
    await expect(scope()).toBeVisible({ visible: mode !== "expanded" });
    await expect(pane().locator(".find-facets")).toBeVisible({
      visible: mode === "expanded",
    });
    await expect(query()).toHaveValue("Topic");
    await expect(rows().nth(8)).toHaveAttribute("aria-selected", "true");
    await expect(rows().nth(8)).toContainText("Topic 033");
    expect(await rows().nth(8).textContent()).toContain("Topic 033");
    await expect(pane().getByLabel("Sort")).toHaveValue("name");
  }
  expect(text).toContain("Topic 033");
  await expect(
    pane().getByRole("group", { name: "Result pages" }),
  ).toContainText("Page 2 of 11");
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(initialScroll);
});

test("Options retains the result scroll and returns focus on Escape, even after growing", async () => {
  await query().fill("Topic");
  await settled();
  await size(360, 660);
  const scroll = pane().locator(".find-results-scroll");
  await scroll.evaluate((el) => (el.scrollTop = 400));
  const previous = await scroll.evaluate((el) => el.scrollTop);
  await scope().click();
  await expect(scope()).toHaveAttribute("aria-expanded", "true");
  await expect(
    pane().getByRole("checkbox", { name: "Classes", exact: true }),
  ).toBeVisible();
  await size(1100, 660);
  await expect(
    pane().getByRole("button", { name: "Close Options" }),
  ).toBeVisible();
  await size(360, 660);
  await expect(scope()).toHaveAttribute("aria-expanded", "true");
  await pane()
    .getByRole("checkbox", { name: "Classes", exact: true })
    .press("Escape");
  await expect(scope()).toBeFocused();
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(previous);
  await scope().click();
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  await pane()
    .getByRole("checkbox", { name: "Classes", exact: true })
    .uncheck();
  await pane()
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(
    pane().getByRole("button", { name: "Reset filters", exact: true }),
  ).toBeHidden();
  await expect(query()).toHaveValue("Topic");
  await expect(query()).toBeFocused();
});

test("query and result keyboard bindings select, page and open Details deliberately", async () => {
  await query().fill("Topic");
  await pageSize(25);
  await pane().getByLabel("Sort").selectOption("name");
  await settled();
  await query().focus();
  await query().press("ArrowDown");
  await expect(rows().first()).toBeFocused();
  await rows().first().press("ArrowUp");
  await expect(query()).toBeFocused();
  await query().press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(rows().nth(1)).toBeFocused();
  const selected = await main.evaluate(
    async () => (await window.axiom.request<Snapshot>("state")).selected,
  );
  await page.keyboard.press("Space");
  await expect(
    pane().getByRole("region", { name: "Selected entity" }),
  ).toContainText("Topic 001");
  expect(
    await main.evaluate(
      async () => (await window.axiom.request<Snapshot>("state")).selected,
    ),
  ).toBe(selected);
  await page.keyboard.press("End");
  await expect(rows().last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(rows().first()).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(rows().first()).toContainText("Topic 025");
  await expect(rows().first()).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(rows().first()).toContainText("Topic 000");
  await expect(rows().first()).toBeFocused();
  await query().focus();
  await query().press("Escape");
  await expect(query()).toHaveValue("");
  await settled();
  await query().press("Escape");
  await expect(pane().locator(".find-results-scroll")).toBeFocused();
  await expect(rows()).toHaveCount(0);
  await query().fill("Topic");
  await settled();
  await query().press("ArrowDown");
  await expect(rows().first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(
      async () =>
        (await main.evaluate(() => window.axiom.request<Snapshot>("state")))
          .selected,
    )
    .not.toBe("");
  await expect(main.locator('[data-panel="details"]')).toBeVisible();
});

test("Recent searches and More disclose by keyboard and remain open across resizing", async () => {
  await query().fill("Topic 010");
  await settled();
  await query().press("Alt+ArrowDown");
  const recent = pane().getByRole("dialog", {
    name: "Recent searches",
    exact: true,
  });
  await expect(recent).toBeVisible();
  await expect(
    recent.getByRole("button", { name: "Topic 010", exact: true }),
  ).toBeFocused();
  await recent.press("Escape");
  await expect(
    pane().getByRole("button", { name: "Recent searches", exact: true }),
  ).toBeFocused();
  const popover = await more();
  await size(360, 660);
  await expect(popover).toBeVisible();
  await popover.getByLabel("Results per page").press("Escape");
  await expect(
    pane().getByRole("button", { name: "More", exact: true }),
  ).toBeFocused();
  await query().fill("Other");
  await query().press("Alt+ArrowDown");
  await recent.getByRole("button", { name: "Topic 010", exact: true }).click();
  await expect(query()).toHaveValue("Topic 010");
});

// craigtrim/axiom#93: Find retains its own layout while authoring moves to Add entity.
test("near-match creation in a shallow detached Find opens the shared form", async () => {
  await query().fill("Topic Certification");
  await settled();
  await size(360, 260);
  const popup = await more();
  await popup
    .getByRole("button", {
      name: 'Add "Topic Certification" as a new class',
      exact: true,
    })
    .click();
  const form = main.getByRole("region", {
    name: "Add entity view",
    exact: true,
  });
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Topic Certification");
  await form
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Topic Specialization");
  await size(1100, 660);
  await expect(
    form.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Topic Specialization");
  await noOverflow();
});
test("zero-state copy, remedies and one Add entity action survive all usable sizes", async () => {
  await query().fill("Absent Unicorn");
  await settled();
  await expect(pane().getByRole("heading", { level: 3 })).toHaveText(
    /Nothing matched in 2 of \d+ fields\./,
  );
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "All fields", exact: true }).click();
  await settled();
  await expect(pane().getByRole("heading", { level: 3 })).toHaveText(
    "Nothing matched anywhere in the ontology.",
  );
  for (const [w, h] of [
    [1100, 660],
    [600, 400],
    [360, 260],
    [240, 210],
  ]) {
    await size(w, h);
    await expect(
      pane().getByRole("button", { name: "Add entity", exact: true }),
    ).toBeVisible();
    await expect(pane().locator(".find-create")).toHaveCount(0);
    await noOverflow();
  }
});
test("Find recovery retains its query and returns focus through Maximize pane", async () => {
  await query().fill("Absent Unicorn");
  await query().evaluate((el) => {
    (window as any).__findQuery = el;
  });
  await size(238, 660);
  await expect(host()).toHaveAttribute("data-pane-recovery", "true");
  await page
    .getByRole("button", { name: "Maximize pane", exact: true })
    .click();
  await expect(host()).toHaveAttribute("data-pane-recovery", "false");
  await expect(query()).toHaveValue("Absent Unicorn");
  expect(
    await query().evaluate((el) => el === (window as any).__findQuery),
  ).toBe(true);
  for (const [w, h] of [
    [360, 208],
    [616, 178],
  ]) {
    await size(w, h);
    await expect(host()).toHaveAttribute("data-pane-recovery", "true");
  }
  await size(616, 416);
  await expect(query()).toHaveValue("Absent Unicorn");
});
test("focused scope stays mounted and withdrawn pager focus returns to the query", async () => {
  const field = pane().getByRole("checkbox", { name: "IRI", exact: true });
  await field.focus();
  await size(360, 660);
  await expect(scope()).toHaveAttribute("aria-expanded", "true");
  await expect(field).toBeFocused();
  await expect(field).toBeChecked();
  await field.press("Escape");
  await size(1100, 660);
  await pane()
    .getByRole("button", { name: "Next results page", exact: true })
    .focus();
  await size(1100, 180);
  await expect(query()).toBeFocused();
});

for (const theme of ["light", "dark"] as const)
  test(`${theme} Find supports larger text, reduced motion and accessible controls`, async () => {
    await menu("theme." + theme);
    await query().fill("Topic");
    await settled();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await host().evaluate((el) => {
      for (const [name, size] of [
        ["fs-label", 19.5],
        ["fs-subtitle", 24],
        ["fs-detail", 22.5],
        ["fs-title", 30],
        ["fs-code", 19.5],
      ] as const)
        (el as HTMLElement).style.setProperty("--" + name, size + "px");
    });
    await size(360, 660);
    await noOverflow();
    await rows().first().focus();
    await rows().first().press("Space");
    const contrast = await pane().evaluate((el) => {
      const style = (selector: string) =>
        getComputedStyle(el.querySelector(selector)!);
      const luminance = (color: string) =>
        color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a: string, b: string) => {
        const x = luminance(a),
          y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const selected = style('tr[data-selected="true"]');
      const input = style(".find-query input");
      return {
        label: ratio(
          style(".find-result-name").color,
          selected.backgroundColor,
        ),
        breadcrumb: ratio(
          style(".find-result-path").color,
          selected.backgroundColor,
        ),
        // The authoritative reference uses subtle control borders; its focus
        // outline, rather than its resting border, provides the strong outline.
        border: input.borderTopColor,
        focus: ratio(selected.outlineColor, selected.backgroundColor),
      };
    });
    expect(contrast.label).toBeGreaterThanOrEqual(4.5);
    expect(contrast.breadcrumb).toBeGreaterThanOrEqual(4.5);
    expect(contrast.border).toBe(
      theme === "light" ? "rgb(208, 215, 222)" : "rgb(61, 68, 77)",
    );
    expect(contrast.focus).toBeGreaterThanOrEqual(3);
    const results = await new AxeBuilder({ page })
      .setLegacyMode()
      .include('[data-panel="find"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(
      await pane()
        .getByRole("button", { name: "More", exact: true })
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    await page.screenshot({
      path: `artifacts/testing/find-${theme}-large-text.png`,
    });
  });
