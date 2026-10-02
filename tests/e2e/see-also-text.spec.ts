// craigtrim/axiom#35: typed annotation text survives the pointer, arrow keys and long match lists.
import type { Locator } from "@playwright/test";
import { test, expect, type Desktop } from "./modal-fixture";

const base = "https://example.test/see-also#";
const seeAlso = "http://www.w3.org/2000/01/rdf-schema#seeAlso";
const typed = "Rdg/Stdyg Collg Text";
// Enough "Text" labels that the fuzzy list scrolls, as in the original report.
const textClasses = [
  "Text Analysis",
  "Text Linguistics",
  "Textile Arts",
  "Textiles",
  "Textual Analysis",
  "Text Mining",
  "Text Editing",
  "Text Encoding",
  "Text Criticism",
  "Text Retrieval",
  "Textbook Studies",
  "Textile Design",
];
const iri = (label: string) => base + label.replace(/\W/g, "");

async function focusedStudy(d: Desktop) {
  await d.load(
    `@prefix : <${base}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:AbstractCourse a owl:Class; rdfs:label "Abstract Course" .
:FocusedStudy a owl:Class; rdfs:label "Focused Study";
  rdfs:subClassOf :AbstractCourse; rdfs:seeAlso :TextAnalysis .
${textClasses.map((label) => `<${iri(label)}> a owl:Class; rdfs:label "${label}" .`).join("\n")}`,
    "see-also.ttl",
  );
  await d.request("select", { iri: base + "FocusedStudy" });
  await d.menu("view.details");
  return d.page.getByRole("region", { name: "Details", exact: true });
}
async function existingSeeAlso(d: Desktop) {
  // Located by predicate, because the stored value (and so the title) changes.
  const field = (await focusedStudy(d))
    .locator("tbody tr")
    .filter({ has: d.page.locator(`select[title="${seeAlso}"]`) })
    .getByRole("combobox", { name: /Value/ });
  await expect(field).toHaveAttribute("title", base + "TextAnalysis");
  return field;
}
async function newSeeAlso(d: Desktop) {
  const details = await focusedStudy(d);
  await details.getByRole("button", { name: "Add row", exact: true }).click();
  const row = details.locator("tbody tr").last();
  await row.getByRole("combobox", { name: /Predicate/ }).selectOption(seeAlso);
  const field = row.getByRole("combobox", { name: /Value/ });
  await expect(field).toBeVisible();
  return field;
}
async function seeAlsoObjects(d: Desktop) {
  const document = await d.request<any>("entityDocument", {
    iri: base + "FocusedStudy",
  });
  return document.statements
    .filter((t: any) => t.predicate === seeAlso)
    .map((t: any) => ({ literal: t.object.literal, value: t.object.value }));
}
// Paced typing lets each 120 ms search debounce settle between keystrokes.
const type = (d: Desktop, text: string) =>
  d.page.keyboard.type(text, { delay: 160 });
// Moves the pointer in steps from the field onto a match, like a hand would.
async function crossTo(d: Desktop, from: Locator, to: Locator) {
  const start = (await from.boundingBox())!;
  const end = (await to.boundingBox())!;
  await d.page.mouse.move(start.x + 20, start.y + start.height / 2);
  await d.page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 12,
  });
}

test("a pointer resting on a match does not replace typed seeAlso text", async ({
  desktop: d,
}) => {
  const field = await existingSeeAlso(d);
  await field.click();
  await type(d, "Rdg/Stdyg Collg Te");
  const matches = d.page.getByRole("listbox");
  const match = matches.getByRole("option", { name: /^Text Analysis/ });
  await expect(match).toBeVisible();
  await crossTo(d, field, match);
  await type(d, "xt");
  await expect(field).toHaveValue(typed);
  await crossTo(d, field, match);
  await d.page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(() => seeAlsoObjects(d))
    .toEqual([{ literal: true, value: typed }]);
});

test("typing after an arrow-key highlight keeps the typed seeAlso text", async ({
  desktop: d,
}) => {
  const field = await newSeeAlso(d);
  await field.click();
  await type(d, "Rdg/Stdyg Collg Te");
  const matches = d.page.getByRole("listbox");
  await expect(
    matches.getByRole("option", { name: /^Text Analysis/ }),
  ).toBeVisible();
  await d.page.keyboard.press("ArrowDown");
  await d.page.keyboard.press("ArrowDown");
  await expect(matches.getByRole("option", { selected: true })).toHaveCount(1);
  await type(d, "xt");
  await expect(matches.getByRole("option", { selected: true })).toHaveCount(0);
  await d.page.keyboard.press("Enter");
  await expect
    .poll(() => seeAlsoObjects(d))
    .toEqual(
      expect.arrayContaining([
        { literal: false, value: base + "TextAnalysis" },
        { literal: true, value: typed },
      ]),
    );
  expect(await seeAlsoObjects(d)).toHaveLength(2);
});

test("a cancelled text highlight does not pass to a match when the field reopens", async ({
  desktop: d,
}) => {
  const field = await newSeeAlso(d);
  await field.click();
  await type(d, "Text");
  const matches = d.page.getByRole("listbox");
  await expect(
    matches.getByRole("option", { name: /^Text Analysis/ }),
  ).toBeVisible();
  await d.page.keyboard.press("ArrowDown");
  await expect(matches.getByRole("option").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // Escape empties the field, which removes the text option from the list.
  await d.page.keyboard.press("Escape");
  await expect(field).toHaveValue("");
  await field.focus();
  await expect(
    matches.getByRole("option", { name: /^Text Analysis/ }),
  ).toBeVisible();
  await expect(matches.getByRole("option", { selected: true })).toHaveCount(0);
  await expect(field).not.toHaveAttribute("aria-activedescendant");
  await d.page.keyboard.press("Enter");
  await expect(field).toHaveValue("");
  expect(await seeAlsoObjects(d)).toEqual([
    { literal: false, value: base + "TextAnalysis" },
  ]);
});

for (const theme of ["light", "dark"] as const)
  test(`the typed text option leads the match list in ${theme}`, async ({
    desktop: d,
  }) => {
    await d.menu("theme." + theme);
    await expect(d.page.locator("html")).toHaveAttribute("data-theme", theme);
    const field = await existingSeeAlso(d);
    await field.click();
    await type(d, typed);
    const matches = d.page.getByRole("listbox");
    await expect(
      matches.getByRole("option", { name: /^Text Analysis/ }),
    ).toBeVisible();
    const options = matches.getByRole("option");
    expect(await options.count()).toBeGreaterThan(6);
    const first = options.first();
    await expect(first.locator("span")).toHaveText(`“${typed}”`);
    await expect(first.locator("small")).toHaveText("Store a text value");
    await expect(matches).not.toContainText("Use text");
    // The option is on screen without scrolling the list.
    expect(await matches.evaluate((list) => list.scrollTop)).toBe(0);
    const list = (await matches.boundingBox())!;
    const row = (await first.boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(list.y);
    expect(row.y + row.height).toBeLessThanOrEqual(list.y + list.height);
    // The quoted text is blue and distinct from the entity labels below it.
    const rgb = (color: string) => color.match(/\d+(\.\d+)?/g)!.map(Number);
    const quoted = rgb(
      await first.locator("span").evaluate((e) => getComputedStyle(e).color),
    );
    const label = await options
      .nth(1)
      .locator("span")
      .evaluate((e) => getComputedStyle(e).color);
    expect(quoted[2]).toBeGreaterThan(quoted[0] + 40);
    expect(quoted[2]).toBeGreaterThan(quoted[1]);
    expect(rgb(label)).not.toEqual(quoted);
    // Down from the field reaches the text option before any match.
    await d.page.keyboard.press("ArrowDown");
    await expect(first).toHaveAttribute("aria-selected", "true");
    // The highlighted text option stays readable (WCAG AA) in this theme.
    const contrast = await first.evaluate((option) => {
      const channel = (c: number) =>
        (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      const luminance = (color: string) => {
        const [r, g, b] = color.match(/\d+(\.\d+)?/g)!.map(Number);
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const text = luminance(
        getComputedStyle(option.querySelector("span")!).color,
      );
      const ground = luminance(getComputedStyle(option).backgroundColor);
      return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await d.page.keyboard.press("Enter");
    await expect
      .poll(() => seeAlsoObjects(d))
      .toEqual([{ literal: true, value: typed }]);
  });
