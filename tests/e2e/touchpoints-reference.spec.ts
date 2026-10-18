// craigtrim/axiom#92: native checks cover retained results, atomic writes and adaptive controls.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  launchTouchpoints,
  touchpointsMenu,
  type TouchpointsFixture,
} from "./touchpoints-reference-fixture";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";
let f: TouchpointsFixture;
test.afterEach(async () => {
  await f?.app.close();
  expect(f?.errors ?? []).toEqual([]);
});
test("opening and Search reuse a saved result; failed Refresh keeps every choice", async () => {
  f = await launchTouchpoints();
  expect(await f.calls()).toBe(0);
  await expect(f.pane().locator(".foot")).toContainText("2 March 2026, 14:11");
  await f.search();
  expect(await f.calls()).toBe(0);
  await f.select("Academic journal");
  await f.relation("Academic journal", "rdfs:seeAlso");
  await f.reply("429");
  await f.search(true);
  await expect(f.pane().getByRole("alert")).toContainText(
    "No Retry-After header",
  );
  await expect(f.row("Academic journal").getByRole("checkbox")).toBeChecked();
  await expect(
    f.row("Academic journal").getByRole("combobox", {
      name: "Target for Academic journal",
      exact: true,
    }),
  ).toHaveValue("wikipedia");
  await expect(f.pane().locator(".cand")).toHaveCount(20);
  expect(await f.calls()).toBe(1);
  await f.reply("refresh");
  await f.search(true);
  await expect(f.pane().locator(".touchpoints-note")).toContainText(
    "One new candidate arrived",
  );
  await expect(f.row("Learned society")).toHaveCount(1);
  await expect(f.row("Publication")).toHaveCount(0);
  expect(await f.calls()).toBe(2);
});
test("row defaults reset, selects retain selection, and two applies are separately undoable", async () => {
  f = await launchTouchpoints();
  await f.select("Academic journal");
  await f.relation("Academic journal", "rdfs:seeAlso");
  const row = f.row("Academic journal");
  await f.relation("Academic journal", "skos:broadMatch");
  await expect(
    row.getByRole("combobox", {
      name: "Target for Academic journal",
      exact: true,
    }),
  ).toHaveValue("wikipedia");
  await row
    .getByRole("combobox", {
      name: "Relationship for Academic journal",
      exact: true,
    })
    .click();
  await f.page.keyboard.press("Escape");
  await expect(row.getByRole("checkbox")).toBeChecked();
  await f.select("Academic journal");
  await f.select("Academic journal");
  await expect(
    row.getByRole("combobox", {
      name: "Relationship for Academic journal",
      exact: true,
    }),
  ).toHaveValue("http://www.w3.org/2004/02/skos/core#exactMatch");
  await f.select("Peer review");
  await f.relation("Peer review", "rdfs:seeAlso");
  const document = () =>
    f.page.evaluate(
      (iri) => window.axiom.request<any>("entityDocument", { iri }),
      f.fixture.classIri,
    );
  const original = await document();
  await f
    .pane()
    .getByRole("button", { name: "Apply selected touchpoints" })
    .click();
  await expect(f.pane().locator(".touchpoints-note")).toContainText(
    "Added 2 resource statements",
  );
  await expect(row).toContainText("Linked");
  const first = await document();
  expect(first.statements.length).toBe(original.statements.length + 2);
  await f.select("Research");
  await f.relation("Research", "rdfs:seeAlso");
  await f
    .pane()
    .getByRole("button", { name: "Apply selected touchpoints" })
    .click();
  await expect(f.pane().locator(".touchpoints-note")).toContainText(
    "Added 1 resource statement",
  );
  expect((await document()).statements.length).toBe(
    first.statements.length + 1,
  );
  await touchpointsMenu(f.app, "edit.undo");
  expect((await document()).statements).toEqual(first.statements);
  await touchpointsMenu(f.app, "edit.undo");
  expect((await document()).statements).toEqual(original.statements);
});
test("duplicates reject the whole batch and an outside edit refuses Apply without clearing choices", async () => {
  f = await launchTouchpoints();
  await f.select("Academic journal");
  await f.select("Research");
  const before = (await f.state()).version;
  const apply = f
    .pane()
    .getByRole("button", { name: "Apply selected touchpoints" });
  await apply.click();
  await expect(f.pane().getByRole("alert")).toContainText(
    "Research already has that statement",
  );
  expect((await f.state()).version).toBe(before);
  await expect(f.pane().locator('.pick[aria-checked="true"]')).toHaveCount(2);
  await f.page.evaluate(() =>
    window.axiom.request("createClass", {
      name: "Outside edit",
      parent: "http://www.w3.org/2002/07/owl#Thing",
    }),
  );
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(f.pane().getByRole("alert")).toContainText(
    "The ontology changed after this search.",
  );
  await expect(f.pane().locator('.pick[aria-checked="true"]')).toHaveCount(2);
});
test("subject cache clear preserves another pane and query typing sends nothing", async () => {
  f = await launchTouchpoints();
  await f.open(true);
  await f.size();
  await expect(
    f.pane().getByRole("button", { name: "Refresh", exact: true }),
  ).toBeDisabled();
  await f.search();
  await expect(f.pane().locator(".cand")).toHaveCount(14);
  await f.select("Marie Curie");
  await f.relation("Marie Curie", "owl:sameAs");
  await f
    .row("Marie Curie")
    .getByRole("combobox", { name: "Target for Marie Curie", exact: true })
    .selectOption("wikidata");
  await expect(f.row("Marie Curie").locator(".ciri")).toHaveText(
    "http://www.wikidata.org/entity/Q7186",
  );
  await f.more("Clear the Wikipedia cache for this subject");
  await expect(f.pane().locator(".empty")).toContainText(
    "Nothing fetched yet for Marie Curie.",
  );
  await f.open();
  await f.size();
  await expect(f.pane().locator(".cand")).toHaveCount(20);
  await f
    .pane()
    .getByRole("textbox", { name: "Wikipedia query" })
    .fill("Retained editable query");
  expect(await f.calls()).toBe(1);
  await f.more("Clear the Wikipedia cache for this subject");
  await expect(
    f.pane().getByRole("textbox", { name: "Wikipedia query" }),
  ).toHaveValue("Retained editable query");
  await expect(f.pane().locator(".cand")).toHaveCount(0);
});
test("pending requests stay with their subject and rapid clicks send one search", async () => {
  f = await launchTouchpoints();
  await holdRequests(f.app, ["touchpoints:search"], "touchpoints:search");
  await f
    .pane()
    .getByRole("button", { name: "Search", exact: true })
    .evaluate((el) => {
      for (let i = 0; i < 100; i++) (el as HTMLButtonElement).click();
    });
  await waitForHeld(f.app);
  await expect(f.pane().locator(".body")).toHaveAttribute("aria-busy", "true");
  await expect(f.pane().locator(".cand")).toHaveCount(0);
  await f.open(true);
  await f.size();
  await expect(f.pane().locator(".empty")).toContainText("Marie Curie");
  await releaseRequests(f.app);
  await f.open();
  await f.size();
  await expect(f.pane().locator(".cand")).toHaveCount(20);
  expect(await f.calls()).toBe(0);
});
test("keyboard, recovery and narrow controls preserve the selected row", async () => {
  f = await launchTouchpoints();
  await f.select("Academic journal");
  for (const [width, height] of [
    [518, 530],
    [358, 530],
    [898, 270],
    [358, 270],
  ]) {
    await f.size(width, height);
    expect((await f.pane().locator(".bar").boundingBox())!.height).toBeCloseTo(
      width < 400 ? 74.4 : 28,
      0,
    );
    const box = (await f.host().boundingBox())!;
    for (const name of [
      "Search",
      "Refresh",
      "More actions",
      "Apply selected touchpoints",
    ]) {
      const button = f.pane().getByRole("button", { name, exact: true });
      const rect = (await button.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(box.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width);
      expect(rect.y).toBeGreaterThanOrEqual(box.y);
      expect(rect.y + rect.height).toBeLessThanOrEqual(
        box.y + box.height + 0.5,
      );
    }
  }
  const query = f.pane().getByRole("textbox", { name: "Wikipedia query" });
  await query.focus();
  await f.size(218, 530);
  await expect(
    f.host().getByRole("button", { name: "Maximize pane" }),
  ).toBeFocused();
  await expect(f.host().locator(".pane-recovery")).toContainText(
    'query "Journal Article" and its results from 2 March 2026, 14:11',
  );
  await f.size();
  await expect(query).toBeFocused();
  await expect(f.row("Academic journal").getByRole("checkbox")).toBeChecked();
  await f.pane().getByRole("button", { name: "More actions" }).click();
  await expect(
    f.page.getByRole("menuitem", { name: "Select every selectable candidate" }),
  ).toBeFocused();
  await f.page.keyboard.press("End");
  await expect(
    f.page.getByRole("menuitem", {
      name: "Clear the Wikipedia cache for this subject",
    }),
  ).toBeFocused();
  await f.page.keyboard.press("Escape");
  await expect(
    f.pane().getByRole("button", { name: "More actions" }),
  ).toBeFocused();
  const scan = await new AxeBuilder({ page: f.page })
    .setLegacyMode()
    .include(".touchpoints-panel")
    .analyze();
  expect(scan.violations).toEqual([]);
});

test("blank queries, disambiguation and absent Wikidata keep their explicit controls", async () => {
  f = await launchTouchpoints("dark", true);
  await expect(f.pane().locator(".rank")).toHaveCount(0);
  await expect(f.pane().locator(".foot")).toContainText(
    "Wikipedia order, local model unavailable",
  );
  const query = f.pane().getByRole("textbox", { name: "Wikipedia query" });
  await query.fill("   ");
  await query.press("Enter");
  await expect(
    f.pane().getByRole("button", { name: "Search", exact: true }),
  ).toBeDisabled();
  expect(await f.calls()).toBe(0);
  await query.fill("Journal Article");
  await f.row("Journal").getByRole("checkbox").focus();
  await f.page.keyboard.press("Space");
  await expect(f.pane().locator(".toast")).toContainText(
    "A disambiguation page cannot be selected.",
  );
  await expect(f.row("Journal").getByRole("checkbox")).not.toBeChecked();
  await f.select("Scholarly communication");
  expect(
    await f
      .row("Scholarly communication")
      .getByRole("combobox", {
        name: "Target for Scholarly communication",
        exact: true,
      })
      .locator("option")
      .allTextContents(),
  ).toEqual(["DBpedia", "Wikipedia"]);
  expect(
    await f
      .row("Scholarly communication")
      .getByRole("combobox", {
        name: "Relationship for Scholarly communication",
        exact: true,
      })
      .locator("option")
      .allTextContents(),
  ).toEqual([
    "skos:exactMatch",
    "skos:closeMatch",
    "skos:broadMatch",
    "skos:narrowMatch",
    "skos:relatedMatch",
    "rdfs:seeAlso",
  ]);
  await f.more("Select every selectable candidate");
  await expect(f.pane().locator('.pick[aria-checked="true"]')).toHaveCount(19);
  await expect(f.row("Research").getByRole("checkbox")).toBeChecked();
  await f.more("Clear the selection");
  await expect(f.pane().locator('.pick[aria-checked="true"]')).toHaveCount(0);
});

test("empty and entirely linked results remain usable, and clearing all caches updates the open pane", async () => {
  f = await launchTouchpoints();
  await f.app.evaluate(() => {
    const fixture = (globalThis as any).touchpointsFixture.fixture;
    fixture.classResponse.query.pages = fixture.classResponse.query.pages
      .filter((p: any) => p.title === "Research")
      .map((p: any) => ({ ...p, index: 1 }));
  });
  await f.search(true);
  // A refresh notice takes precedence until a subsequent search clears it.
  await f.search();
  await expect(f.pane().locator(".touchpoints-note")).toContainText(
    "Every candidate is already linked.",
  );
  await expect(f.row("Research").getByRole("checkbox")).toBeEnabled();
  await f.reply("empty");
  await f.search(true);
  await expect(f.pane().locator(".empty")).toHaveText(
    "No candidate was returned for this query.",
  );
  await expect(f.pane().locator(".foot")).toContainText(
    "0 candidates, fetched",
  );
  const before = await f.calls();
  await f.search();
  expect(await f.calls()).toBe(before);
  await touchpointsMenu(f.app, "cache.clearWikipedia");
  await expect(f.pane().locator(".empty")).toContainText(
    "Nothing fetched yet for Journal Article.",
  );
  await expect(
    f.pane().getByRole("button", { name: "Refresh", exact: true }),
  ).toBeDisabled();
});
