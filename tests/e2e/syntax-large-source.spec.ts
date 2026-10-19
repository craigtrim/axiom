import { test, expect } from "@playwright/test";
import { launchQuery, queryMenu } from "./query-reference-fixture";
import { assertSyntaxPalette } from "./syntax-assertions";
import { writeFile } from "node:fs/promises";

test.skip(
  !process.env.AXIOM_SYNTAX_PERFORMANCE && !process.env.AXIOM_SYNTAX_BASELINE,
  "Set AXIOM_SYNTAX_PERFORMANCE=1 for the serial desktop timing comparison.",
);

// craigtrim/axiom#111: exercise a document at the reported size through real input.
test("large Source stays responsive while typing and scrolling", async ({}, info) => {
  test.setTimeout(120000);
  const f = await launchQuery();
  try {
    const lines = Array.from(
      { length: 28042 },
      (_, i) => `<urn:${i}> <urn:p> "Value ${i}" .`,
    );
    const padding = 1180150 - lines.join("\n").length;
    const text = lines
      .map(
        (line, i) =>
          line +
          " ".repeat(
            Math.floor(padding / lines.length) +
              (i < padding % lines.length ? 1 : 0),
          ),
      )
      .join("\n");
    expect(text.split("\n")).toHaveLength(28042);
    expect(text.length).toBe(1180150);
    await f.app.evaluate(({ ipcMain }, text) => {
      const original = (ipcMain as any)._invokeHandlers.get("domain:request");
      ipcMain.removeHandler("domain:request");
      ipcMain.handle("domain:request", async (event, method, args) => {
        const result = await original(event, method, args);
        return method === "sourceDocument" ? { ...result, text } : result;
      });
    }, text);
    await f.host.evaluate((el) => el.removeAttribute("style"));
    await queryMenu(f.app, "view.source");
    const host = f.page.locator('[data-pane-id="source"]');
    await host.evaluate((el) =>
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        width: "900px",
        height: "650px",
        zIndex: "1000",
      }),
    );
    const source = host.locator('[data-panel="source"]');
    await expect(source.getByRole("status")).toHaveText("Clean");
    await expect(source.locator(".view-line").first()).toContainText("urn:0");
    const baseline = process.env.AXIOM_SYNTAX_BASELINE === "1";
    if (!baseline)
      await expect
        .poll(
          async () =>
            new Set(
              (
                await assertSyntaxPalette(source.locator(".syntax-overlay"), 0)
              ).map((token) => token.kind),
            ).size,
        )
        .toBeGreaterThanOrEqual(3);
    const input = source.getByRole("textbox", {
      name: "Ontology source",
      exact: true,
    });
    await input.focus();
    const response: number[] = [],
      paint: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = await f.page.evaluate(() => performance.now());
      await f.page.keyboard.press("Control+Home");
      await input.evaluate((input) => {
        (window as any).syntaxInputPaint = new Promise<number>((resolve) => {
          input.addEventListener(
            "beforeinput",
            () => {
              const start = performance.now();
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve(performance.now() - start)),
              );
            },
            { once: true, capture: true },
          );
        });
      });
      await f.page.keyboard.insertText("# sample " + i + "\n");
      paint.push(await f.page.evaluate(() => (window as any).syntaxInputPaint));
      await expect(
        source.locator(baseline ? ".view-line" : ".syntax-line").first(),
      ).toContainText("# sample " + i);
      response.push(
        await f.page.evaluate((start) => performance.now() - start, start),
      );
      await f.page.keyboard.press("Control+z");
      await f.page.keyboard.press("Control+End");
      await f.page.keyboard.press("Home");
      await expect(source.locator(".view-line").last()).toContainText(
        "urn:28041",
      );
      if (!baseline) {
        await expect(source.locator(".syntax-line").last()).toContainText(
          "urn:28041",
        );
        const rows = await source.locator(".syntax-line").count();
        expect(rows).toBeLessThan(100);
      }
    }
    const sorted = [...response].sort((a, b) => a - b);
    const paintSorted = [...paint].sort((a, b) => a - b);
    const result = {
      baseline,
      lines: 28042,
      characters: 1180150,
      response,
      paint,
      paintMedian: paintSorted[10],
      paintP95: paintSorted[18],
      median: sorted[10],
      p95: sorted[18],
    };
    await writeFile(
      info.outputPath("responsiveness.json"),
      JSON.stringify(result, null, 2),
    );
    await info.attach("responsiveness", {
      body: JSON.stringify(result),
      contentType: "application/json",
    });
    expect(result.p95).toBeLessThan(500);
    // The plain editor's measured p95 is 180ms for inserting a new first line
    // in this document. Keep a fixed 250ms ceiling for the highlighted editor.
    expect(result.paintP95).toBeLessThan(250);
    expect(f.errors).toEqual([]);
  } finally {
    await f.app.close();
  }
});
