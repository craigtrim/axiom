import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Compare the component specimens in craigtrim/axiom#81, without a captured app baseline.
const reference = path.resolve(
  "tests/fixtures/design-system-visual/visual-reference.html",
);
const digest =
  "076925d259b1ea221a227098f09680cd6f04c0cdb92376e9dfe47714433869e7";
test.use({
  viewport: { width: 1100, height: 1000 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});

async function specimen(
  page: Page,
  actual: boolean,
  theme: "light" | "dark",
  frame: number,
) {
  const bytes = await readFile(reference);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
  const source = bytes.toString();
  await page.goto(pathToFileURL(reference).href);
  await page.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    theme,
  );
  // Capture only shared components. The dock strip and resizing grips belong to #87.
  const heading =
    frame < 9
      ? "Action row"
      : frame < 14
        ? "Pane chrome"
        : frame === 14
          ? "State ink"
          : frame < 18
            ? "Buttons and fields"
            : frame === 18
              ? "Chips"
              : frame === 19
                ? "Status"
                : "Grid";
  await page.evaluate(
    ({ heading, frame }) => {
      const title = [...document.querySelectorAll("h3")].find(
        (el) => el.textContent === heading,
      )!;
      const block = title.nextElementSibling!;
      const host = document.createElement("div");
      host.className = "doc shared-layer";
      if (frame >= 9 && frame <= 13) {
        const pane = block.querySelector<HTMLElement>(".pane")!;
        const width = frame === 11 ? 218 : frame === 13 ? 248 : 458;
        host.style.width = width + "px";
        host.style.height = (frame === 12 ? 170 : 200) + "px";
        host.style.display = "grid";
        host.append(pane);
        // Decisions 8 and 9: draw each More glyph; omit passed checks from findings.
        pane.querySelector<HTMLButtonElement>(".iconbtn")!.innerHTML = (
          window as unknown as { svg: (name: string) => string }
        ).svg("more");
        pane.querySelector(".iconbtn")!.id = "paneMore";
        pane.querySelector("#demoRows tr:last-child")!.remove();
      } else {
        host.append(title, block);
      }
      document.body.replaceChildren(host);
      if (frame === 13) {
        const state = document.querySelector<HTMLElement>("#demoState")!;
        state.textContent = "Scan failed, nothing was written";
        state.title = state.textContent;
        state.className = "state badink";
      }
    },
    { heading, frame },
  );
  if (actual) {
    await page.evaluate(() => document.body.classList.add("shared-layer"));
    await page
      .locator("style")
      .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
    await page.addStyleTag({
      url: pathToFileURL(path.resolve("dist/renderer/app.css")).href,
    });
    await page.addStyleTag({
      content: source.split("\n").slice(293, 324).join("\n"),
    });
    // A static specimen does not mount AdaptivePane; set its presentation explicitly.
    if (frame === 11 || frame === 12)
      await page.evaluate(() => {
        document
          .querySelectorAll<HTMLElement>(".bar, .body, .foot")
          .forEach((el) => (el.hidden = true));
        document.querySelector<HTMLElement>(".recov")!.style.display = "grid";
      });
  } else {
    // Only the issue's approved corrections alter reference component styles.
    await page.addStyleTag({
      content:
        ".pane { position:relative } .recov { grid-row:1/-1 } .bar .state { flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis } .btn.primary:disabled { background:none;color:var(--idle) }",
    });
  }
  // Identical page framing outside the component under comparison.
  await page.addStyleTag({
    content:
      "body { margin:0;padding:20px;background:var(--surface);font:13px/1.45 var(--font);color:var(--text);-webkit-font-smoothing:antialiased;overflow:hidden }",
  });
  const selector =
    frame < 9
      ? ".bar"
      : frame < 14
        ? ".pane"
        : frame === 20
          ? ".grid"
          : ".demo";
  await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const box = el.getBoundingClientRect();
      (el as HTMLElement).dataset.capture = "true";
      Object.assign((el as HTMLElement).style, {
        position: "fixed",
        left: "32px",
        top: "32px",
        width: box.width + "px",
        height: box.height + "px",
      });
      document.querySelector(".doc")!.replaceChildren(el);
    });
  if (frame === 7 || frame === 8) {
    await page.getByRole("button", { name: "More actions" }).click();
    if (frame === 8) await page.keyboard.press("ArrowDown");
  }
  if (frame === 10) await page.locator("#demoRun").click();
  if (frame === 16) await page.locator("#demoSw").click();
  if (frame === 17) {
    await page.getByRole("button", { name: "Primary", exact: true }).focus();
    await page.keyboard.press("Tab");
  }
  await page.mouse.move(1099, 999);
  if (![7, 8, 17].includes(frame))
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.evaluate(() => document.fonts.ready);
}

async function capture(page: Page) {
  const clip = (await page.locator("[data-capture]").boundingBox())!;
  const menu = (await page.locator(".menu").count())
    ? await page.locator(".menu").boundingBox()
    : null;
  return page.screenshot({ clip: menu ?? clip, animations: "disabled" });
}
for (const theme of ["light", "dark"] as const) {
  for (let frame = 6; frame <= 20; frame++)
    test(`shared reference ${theme} frame ${frame}`, async ({
      browser,
    }, info) => {
      const context = await browser.newContext({
        viewport: { width: 1100, height: 1000 },
        deviceScaleFactor: 2,
        reducedMotion: "reduce",
        colorScheme: theme,
      });
      try {
        const referencePage = await context.newPage(),
          actualPage = await context.newPage();
        await specimen(referencePage, false, theme, frame);
        await specimen(actualPage, true, theme, frame);
        const expected = await capture(referencePage),
          actual = await capture(actualPage);
        await writeFile(info.outputPath("actual.png"), actual);
        await writeFile(info.outputPath("reference.png"), expected);
        await info.attach("reference", {
          body: expected,
          contentType: "image/png",
        });
        await info.attach("actual", { body: actual, contentType: "image/png" });
        const difference = await actualPage.evaluate(
          async (images) => {
            const decoded = await Promise.all(
              images.map(async (image) => {
                const bitmap = await createImageBitmap(
                  await (await fetch("data:image/png;base64," + image)).blob(),
                );
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(bitmap, 0, 0);
                return {
                  width: canvas.width,
                  height: canvas.height,
                  pixels: ctx.getImageData(0, 0, canvas.width, canvas.height)
                    .data,
                };
              }),
            );
            const [a, b] = decoded;
            if (a.width !== b.width || a.height !== b.height)
              return {
                sizes: decoded.map((d) => [d.width, d.height]),
                pixels: -1,
              };
            let pixels = 0;
            for (let i = 0; i < a.pixels.length; i += 4)
              if ([0, 1, 2, 3].some((c) => a.pixels[i + c] !== b.pixels[i + c]))
                pixels++;
            return { sizes: decoded.map((d) => [d.width, d.height]), pixels };
          },
          [actual.toString("base64"), expected.toString("base64")],
        );
        expect(difference, JSON.stringify(difference)).toMatchObject({
          pixels: 0,
        });
      } finally {
        await context.close();
      }
    });
}
