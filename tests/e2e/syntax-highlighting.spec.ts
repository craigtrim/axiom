import { test, expect } from "@playwright/test";
import { launchQuery, queryMenu, queryBase } from "./query-reference-fixture";
import { assertGlyphPositions, assertSyntaxPalette } from "./syntax-assertions";
import { launchUtility, utilityMenu } from "./utility-reference-fixture";

// craigtrim/axiom#111: a real query exercises every SPARQL preview through theme changes.
test("SPARQL shares colours in the editor, both history views and result context", async () => {
  const f = await launchQuery();
  try {
    const query =
      'PREFIX : <urn:>\nSELECT ?s WHERE { ?s a :Class; :label "Title"; :p <urn:x> FILTER(?s<10) }';
    await f.enter(query);
    for (const theme of ["light", "dark"]) {
      await queryMenu(f.app, "theme." + theme);
      await expect(f.page.locator("html")).toHaveAttribute("data-theme", theme);
      await queryMenu(f.app, "view.query");
      const line = f.pane.locator(".view-line").filter({ hasText: "SELECT" });
      await expect(line).toBeVisible();
      await expect
        .poll(() =>
          line
            .locator("span")
            .evaluateAll(
              (spans) =>
                new Set(spans.map((span) => getComputedStyle(span).color)).size,
            ),
        )
        .toBeGreaterThanOrEqual(4);
      await assertGlyphPositions(
        f.pane.locator(".syntax-line").filter({ hasText: "SELECT" }),
        line,
      );
      await f.pane
        .getByRole("button", { name: "History", exact: true })
        .click();
      const popup = f.pane.getByRole("menu", { name: "History", exact: true });
      await assertSyntaxPalette(popup, 4);
      await f.page.keyboard.press("Escape");
      await f.pane
        .getByRole("button", { name: "More actions", exact: true })
        .click();
      await f.pane
        .getByRole("menuitem", { name: "Find a query in history", exact: true })
        .click();
      const dialog = f.page.getByRole("dialog", {
        name: "Query history",
        exact: true,
      });
      await expect(dialog.locator(".syntax-code").first()).toBeVisible();
      const history = await assertSyntaxPalette(dialog, 4);
      expect(
        history
          .filter((token) => token.kind === "iri")
          .map((token) => token.text),
      ).toEqual(["<urn:>", "<urn:x>"]);
      expect(
        history.some((token) => token.kind === "number" && token.text === "10"),
      ).toBe(true);
      await f.page.keyboard.press("Escape");
      const editorColours = await assertSyntaxPalette(
        f.pane.locator(".syntax-overlay"),
        4,
      );
      for (const [text, kind] of [
        ["SELECT", "keyword"],
        [":Class", "prefixed"],
        ['"Title"', "string"],
        ["<urn:x>", "iri"],
      ]) {
        const token = editorColours.find((value) => value.text?.includes(text));
        expect(token?.actual, text).toBe(
          history.find((value) => value.kind === kind)?.actual,
        );
      }
      await queryMenu(f.app, "query.run");
      const results = f.page.locator(".query-results-panel");
      await expect(results.locator(".ctx .q")).toBeVisible();
      await assertSyntaxPalette(results.locator(".ctx"), 4);
    }
    expect(f.errors).toEqual([]);
  } finally {
    await f.app.close();
  }
});

test("Source and Details re-highlight every format and preserve glyph positions in both themes", async () => {
  const f = await launchQuery();
  try {
    await f.host.evaluate((el) => el.removeAttribute("style"));
    const formats = [
      "turtle",
      "trig",
      "ntriples",
      "nquads",
      "rdfxml",
      "jsonld",
    ];
    for (const theme of ["light", "dark"]) {
      await queryMenu(f.app, "theme." + theme);
      await queryMenu(f.app, "view.source");
      const sourceHost = f.page.locator('[data-pane-id="source"]');
      await sourceHost.evaluate((el) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          width: "900px",
          height: "650px",
          zIndex: "1000",
        }),
      );
      const source = f.page.locator('[data-panel="source"]');
      for (const format of formats) {
        await source
          .getByRole("combobox", { name: "Source format" })
          .selectOption(format);
        await expect(source.getByRole("status")).toHaveText("Clean");
        await expect(source.locator(".syntax-line").first()).toBeVisible();
        const required =
          format === "rdfxml"
            ? "xml-tag"
            : format === "jsonld"
              ? "json-key"
              : "iri";
        await expect
          .poll(async () =>
            (
              await assertSyntaxPalette(source.locator(".syntax-overlay"), 0)
            ).some(
              (token) =>
                token.kind === required ||
                (required === "xml-tag" && token.kind === "keyword"),
            ),
          )
          .toBe(true);
        for (
          let i = 0;
          i < Math.min(3, await source.locator(".syntax-line").count());
          i++
        )
          await assertGlyphPositions(
            source.locator(".syntax-line").nth(i),
            source.locator(".view-line").nth(i),
          );
      }
      await sourceHost.evaluate((el) => el.removeAttribute("style"));
      await f.page.evaluate(
        (iri) => window.axiom.request("select", { iri }),
        queryBase + "Marketing",
      );
      await queryMenu(f.app, "view.details");
      const detailsHost = f.page.locator('[data-pane-id="details"]');
      await detailsHost.evaluate((el) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          width: "900px",
          height: "650px",
          zIndex: "1000",
        }),
      );
      const details = f.page.locator(".details-pane");
      for (const format of formats) {
        await details
          .getByRole("combobox", { name: "Source format", exact: true })
          .selectOption(format);
        await expect(details.locator(".syntax-code")).toHaveAttribute(
          "data-language",
          format,
        );
        await assertSyntaxPalette(details.locator(".source-highlight"), 2);
        await assertGlyphPositions(details.locator(".source-highlight"));
        const editor = details.locator("textarea.src");
        const text = await editor.inputValue();
        expect(await details.locator(".source-highlight").textContent()).toBe(
          text + "\n",
        );
      }
      await detailsHost.evaluate((el) => el.removeAttribute("style"));
    }
    expect(f.errors).toEqual([]);
  } finally {
    await f.app.close();
  }
});

test("syntax colours meet 4.5 contrast on code backgrounds in both themes", async () => {
  const f = await launchQuery();
  try {
    for (const theme of ["light", "dark"]) {
      await queryMenu(f.app, "theme." + theme);
      await expect(f.page.locator("html")).toHaveAttribute("data-theme", theme);
      const ratios = await f.page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const kinds = [
          "keyword",
          "prefixed",
          "iri",
          "string",
          "language",
          "datatype",
          "number",
          "comment",
          "punctuation",
          "xml-tag",
          "xml-attribute",
          "json-key",
          "variable",
        ];
        const backgrounds = [
          "ground",
          "surface",
          "raised",
          "sunken",
          "chrome",
          "accent-soft",
          "row-selected",
          "bad-soft",
          "warn-soft",
          "ok-soft",
        ];
        const rgb = (hex: string) =>
          [1, 3, 5].map((offset) =>
            parseInt(hex.slice(offset, offset + 2), 16),
          );
        const luminance = (rgb: number[]) => {
          const channels = rgb
            .map((value) => value / 255)
            .map((n) =>
              n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
            );
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const selection = css
          .getPropertyValue("--sel")
          .match(/[\d.]+/g)!
          .map(Number);
        return kinds.flatMap((kind) =>
          backgrounds.flatMap((background) => {
            const a = luminance(
                rgb(css.getPropertyValue("--syntax-" + kind).trim()),
              ),
              base = rgb(css.getPropertyValue("--" + background).trim());
            return [false, true].map((selected) => {
              const b = luminance(
                selected
                  ? base.map((v, i) =>
                      Math.round(
                        selection[i] * selection[3] + v * (1 - selection[3]),
                      ),
                    )
                  : base,
              );
              return {
                kind,
                background: background + (selected ? " selected" : ""),
                ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              };
            });
          }),
        );
      });
      for (const result of ratios)
        expect(
          result.ratio,
          `${theme} ${result.kind} on ${result.background}`,
        ).toBeGreaterThanOrEqual(4.5);
    }
  } finally {
    await f.app.close();
  }
});

test("detached Query keeps syntax colours and glyph positions through theme changes", async () => {
  const f = await launchQuery();
  try {
    await f.enter('SELECT ?s WHERE { ?s a <urn:Class>; <urn:label> "Title" }');
    await f.host.evaluate((el) => el.removeAttribute("style"));
    await queryMenu(f.app, "pane.detach");
    await expect.poll(() => f.app.windows().length).toBe(2);
    const child = f.app.windows().find((page) => page !== f.page)!;
    const editor = child.locator(".query-panel");
    await expect(editor.locator(".syntax-line").first()).toContainText(
      "SELECT",
    );
    for (const theme of ["light", "dark"]) {
      await queryMenu(f.app, "theme." + theme);
      await expect(child.locator("html")).toHaveAttribute("data-theme", theme);
      await expect
        .poll(
          async () =>
            new Set(
              (
                await assertSyntaxPalette(editor.locator(".syntax-overlay"), 0)
              ).map((token) => token.kind),
            ).size,
        )
        .toBeGreaterThanOrEqual(4);
      await assertGlyphPositions(
        editor.locator(".syntax-line").first(),
        editor.locator(".view-line").first(),
      );
    }
    await queryMenu(f.app, "pane.reattach");
    await expect.poll(() => f.app.windows().length).toBe(1);
    await expect(f.pane.locator(".syntax-overlay")).toHaveCount(1);
    await assertSyntaxPalette(f.pane.locator(".syntax-overlay"), 4);
  } finally {
    await f.app.close();
  }
});

test("truncated string and IRI previews cannot colour adjacent context or become markup", async () => {
  const f = await launchQuery();
  try {
    for (const term of [
      '"' + "<img onerror=alert(1)>".repeat(15) + '"',
      "<urn:" + "x".repeat(260) + ">",
    ]) {
      const query = "PREFIX : <urn:> SELECT ?s WHERE { ?s :p " + term + " }";
      await queryMenu(f.app, "view.query");
      await f.enter(query);
      await f.pane
        .getByRole("button", { name: "More actions", exact: true })
        .click();
      await f.pane
        .getByRole("menuitem", { name: "Find a query in history", exact: true })
        .click();
      const dialog = f.page.getByRole("dialog", {
        name: "Query history",
        exact: true,
      });
      const preview = dialog.locator('button[aria-current="true"] code');
      await expect(preview).toHaveText(query.slice(0, 180));
      await assertSyntaxPalette(preview, 3);
      await expect(preview.locator("img,script")).toHaveCount(0);
      await f.page.keyboard.press("Escape");
      await queryMenu(f.app, "query.run");
      const context = f.page.locator(".query-results-panel:visible .ctx");
      await expect(context.locator(".q")).toHaveText(query.slice(0, 120));
      await expect(context.locator(".q")).toHaveAttribute("title", query);
      await assertSyntaxPalette(context, 3);
      const leaked = await context
        .locator(".opt")
        .first()
        .evaluate((el) =>
          [...CSS.highlights].some(([, highlight]) =>
            [...highlight].some(
              (range) =>
                range instanceof Range && el.contains(range.startContainer),
            ),
          ),
        );
      expect(leaked).toBe(false);
    }
    expect(f.errors).toEqual([]);
  } finally {
    await f.app.close();
  }
});

test("Query and Error log highlight JSON while preserving prompt prose and stderr", async () => {
  const f = await launchQuery();
  let prompt = "";
  try {
    await f.composer
      .getByRole("button", { name: "Describe", exact: true })
      .click();
    await f.composer
      .getByRole("textbox", { name: "Describe the query" })
      .fill("Find courses");
    await f.composer.locator(".ctxbox summary").click();
    const preview = f.composer.locator("pre.cc");
    for (const theme of ["light", "dark"]) {
      await queryMenu(f.app, "theme." + theme);
      const tokens = await assertSyntaxPalette(preview, 3);
      expect(tokens.some((token) => token.kind === "json-key")).toBe(true);
      expect(tokens.some((token) => token.text.includes("REQUEST"))).toBe(
        false,
      );
    }
    prompt = (await preview.textContent())!;
  } finally {
    await f.app.close();
  }
  const log = await launchUtility("light", "errorlog", 24);
  try {
    // Feed the real composer prompt through the audit protocol, rather than the
    // old visual fixture's prose-only filler. Retention and rendering stay real.
    await log.app.evaluate(
      ({ ipcMain }, prompt) => {
        const key = "audit:read";
        const handler = (ipcMain as any)._invokeHandlers.get(key);
        ipcMain.removeHandler(key);
        ipcMain.handle(key, async (...args: any[]) => {
          const result = await handler(...args);
          return { ...result, details: { ...result.details, Prompt: prompt } };
        });
      },
      "Request excerpt\n" + prompt.slice(prompt.indexOf("\nREQUEST\n") + 1),
    );
    await log
      .pane()
      .getByRole("button", { name: /Taxonomy suggestions for Role/ })
      .click();
    const detail = log
      .pane()
      .locator(".dsec")
      .filter({ has: log.page.locator("summary", { hasText: "Prompt" }) });
    await detail.locator("summary").click();
    for (const theme of ["light", "dark"]) {
      await utilityMenu(log.app, "theme." + theme);
      await assertSyntaxPalette(detail.locator("pre"), 3);
    }
    const stderr = log
      .pane()
      .locator(".dsec")
      .filter({ has: log.page.locator("summary", { hasText: "stderr" }) });
    await stderr.locator("summary").click();
    await expect(stderr.locator(".syntax-code")).toHaveCount(0);
    expect(await assertSyntaxPalette(stderr, 0)).toEqual([]);
  } finally {
    await log.close();
  }
});
