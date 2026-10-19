import { expect, type Locator } from "@playwright/test";

// craigtrim/axiom#111: check the painted palette before comparing legacy geometry.
export async function assertSyntaxPalette(root: Locator, minimumKinds = 1) {
  const result = await root.evaluate((el) => {
    const values: {
      kind: string;
      actual: string;
      expected: string;
      text: string;
    }[] = [];
    const probe = el.ownerDocument.createElement("span");
    el.append(probe);
    for (const [key, highlight] of CSS.highlights) {
      if (!key.startsWith("axiom-")) continue;
      const kind = key.slice(6);
      probe.style.color = `var(--syntax-${kind})`;
      for (const range of highlight) {
        if (!el.contains(range.startContainer)) continue;
        const node = range.startContainer.parentElement!;
        values.push({
          kind,
          actual: getComputedStyle(node, `::highlight(${key})`).color,
          expected: getComputedStyle(probe).color,
          text: range.toString(),
        });
      }
    }
    probe.remove();
    return values;
  });
  expect(new Set(result.map((v) => v.kind)).size).toBeGreaterThanOrEqual(
    minimumKinds,
  );
  for (const value of result) {
    expect(value.actual, value.kind).toBe(value.expected);
  }
  return result;
}

export async function monochromeSource(root: Locator) {
  const id = "syntax-comparison-" + Math.random().toString(36).slice(2);
  await root.evaluate((el, id) => {
    el.setAttribute("data-syntax-comparison", id);
    for (const code of el.querySelectorAll<HTMLElement>(".syntax-code"))
      code.style.setProperty(
        "--syntax-comparison-ink",
        getComputedStyle(code.parentElement!).color,
      );
    const style = el.ownerDocument.createElement("style");
    style.id = id;
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
    style.textContent = kinds
      .map(
        (kind) =>
          `[data-syntax-comparison="${id}"] ::highlight(axiom-${kind}) { color: var(--syntax-comparison-ink, var(--text)) !important; }`,
      )
      .join("\n");
    style.textContent += `[data-syntax-comparison="${id}"] .syntax-code { color: var(--syntax-comparison-ink) !important; }`;
    el.ownerDocument.head.append(style);
  }, id);
  return async () =>
    root.evaluate((el, id) => {
      el.removeAttribute("data-syntax-comparison");
      for (const code of el.querySelectorAll<HTMLElement>(".syntax-code"))
        code.style.removeProperty("--syntax-comparison-ink");
      el.ownerDocument.getElementById(id)?.remove();
    }, id);
}

export async function assertCodeSurfaces(root: Locator, selector: string) {
  for (const target of await root.locator(selector).all()) {
    if (!(await target.isVisible()) || !(await target.textContent())?.trim())
      continue;
    await expect(target.locator(".syntax-code"), selector).not.toHaveCount(0);
    await assertSyntaxPalette(target);
  }
}

export async function assertCodeBothThemes(root: Locator, selector: string) {
  await expect(root.locator(selector).first()).toBeVisible();
  const html = root.page().locator("html");
  const original = await html.getAttribute("data-theme");
  try {
    for (const theme of ["light", "dark"]) {
      await html.evaluate(
        (el, theme) => el.setAttribute("data-theme", theme),
        theme,
      );
      await assertCodeSurfaces(root, selector);
    }
  } finally {
    await html.evaluate((el, original) => {
      if (original === null) el.removeAttribute("data-theme");
      else el.setAttribute("data-theme", original);
    }, original);
  }
}

export async function assertGlyphPositions(line: Locator, original = line) {
  const measured = await line.evaluate(
    (el, original) => {
      const positions = (element: Element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const x: number[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          for (let i = 0; i < node.textContent!.length; i++) {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            x.push(
              range.getBoundingClientRect().x -
                element.getBoundingClientRect().x,
            );
          }
        }
        return x;
      };
      const clone = document.createElement("div");
      clone.textContent = el.textContent;
      const css = getComputedStyle(original!),
        bounds = original!.getBoundingClientRect();
      for (let i = 0; i < css.length; i++)
        clone.style.setProperty(css[i], css.getPropertyValue(css[i]));
      clone.style.position = "fixed";
      clone.style.left = bounds.x + "px";
      clone.style.top = bounds.y + "px";
      clone.style.margin = "0";
      clone.style.visibility = "hidden";
      document.body.append(clone);
      const plain = positions(clone),
        highlighted = positions(el);
      clone.remove();
      return {
        plain,
        highlighted,
        actualOrigin: el.getBoundingClientRect().x,
        expectedOrigin: original!.getBoundingClientRect().x,
      };
    },
    await original.elementHandle(),
  );
  expect(measured.highlighted).toEqual(measured.plain);
  expect(measured.actualOrigin).toBe(measured.expectedOrigin);
}
