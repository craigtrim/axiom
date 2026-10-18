// craigtrim/axiom#91: exercise the real worker, keyboard, resize policy and atomic moves.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  launchHierarchy,
  hierarchyMenu,
  type HierarchyFixture,
} from "./hierarchy-reference-fixture";
import type { SuggestionDocument } from "../../src/shared/suggestions";
import { SUBCLASS } from "../../src/domain/model";
import {
  holdRequests,
  waitForHeld,
  releaseRequests,
  requestCount,
} from "./held-requests";
let f: HierarchyFixture;
test.afterEach(async () => {
  await f?.app.close();
  expect(f?.errors ?? []).toEqual([]);
});
const parents = async (name: string) =>
  (
    await f.page.evaluate(
      (iri) =>
        window.axiom.request<SuggestionDocument>("entityDocument", { iri }),
      f.fixture.iri(name),
    )
  ).statements
    .filter((t) => t.predicate === SUBCLASS)
    .map((t) => t.object.value);
for (const theme of ["light", "dark"])
  test(`${theme} hierarchy is accessible with counts, filtering and responsive rows`, async () => {
    f = await launchHierarchy(theme);
    const audit = async () =>
      expect(
        (
          await new AxeBuilder({ page: f.page })
            .setLegacyMode(true)
            .include('[data-panel="hierarchy"]')
            .withTags(["wcag2a", "wcag2aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    await audit();
    await expect(f.row("Person").locator(".cnt")).toHaveText("412 instances");
    for (const width of [898, 418, 298]) {
      await f.size(width, 530);
      expect(
        await f.pane
          .locator(".tree-row")
          .evaluateAll((es) =>
            es.every((e) => e.getBoundingClientRect().height === 26),
          ),
      ).toBe(true);
      expect(
        await f
          .row("Person")
          .locator(".nm")
          .evaluate((e) => e.getBoundingClientRect().width),
      ).toBeGreaterThanOrEqual(58.5);
      expect(
        await f
          .row("Person")
          .locator(".unit")
          .evaluate((e) => e.getBoundingClientRect().width),
      ).toEqual(width < 600 ? 1 : expect.any(Number));
      await audit();
    }
    await f.size(898, 530);
    await f.pane
      .getByRole("textbox", { name: "Filter hierarchy" })
      .fill("  ART  ");
    await expect(f.row("Article")).toHaveCount(1);
    await expect(f.row("Article").locator(".hit")).toHaveText("match");
    await expect(f.row("owl:Thing").locator(".hit")).toHaveCount(0);
    await f.row("Organization").getByRole("button").click();
    await expect(f.pane.locator(".toast")).toContainText(
      "Expansion is held open",
    );
    await f.pane.getByRole("textbox", { name: "Filter hierarchy" }).fill("zzz");
    await expect(f.pane.locator(".empty")).toContainText(
      "Nothing in this hierarchy matches that filter.",
    );
    await audit();
    await f.pane.getByRole("textbox", { name: "Filter hierarchy" }).fill("");
    await f.pane
      .getByRole("button", { name: "Properties", exact: true })
      .click();
    await expect(f.pane.locator(".keys")).not.toContainText("Drag");
    await expect(f.row("title").locator(".cnt")).toHaveText("2,310 assertions");
    const before = (await f.state()).version;
    await f.drag("title", "owl:topObjectProperty", true);
    expect((await f.state()).version).toBe(before);
    await audit();
  });
test("multi-branch drop keeps other parents and descendants and offers one app Undo", async () => {
  f = await launchHierarchy();
  await f.row("Person").getByRole("button").click();
  await f.row("Researcher").click();
  await f.row("Software Agent").click({ modifiers: ["Control"] });
  const before = (await f.state()).version;
  await f.drag("Researcher", "Artifact", true);
  await expect
    .poll(() => parents("Researcher"))
    .toEqual([f.fixture.iri("Artifact"), f.fixture.iri("Role")]);
  await expect
    .poll(() => parents("Software Agent"))
    .toEqual([f.fixture.iri("Artifact")]);
  expect((await f.state()).version).toBe(before + 1);
  await expect(
    f.pane.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(2);
  await expect(f.pane.locator(".toast")).toContainText(
    "Moved 2 branches under Artifact.",
  );
  await f.pane.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect
    .poll(() => parents("Researcher"))
    .toEqual([f.fixture.iri("Person"), f.fixture.iri("Role")]);
  await expect
    .poll(() => parents("Software Agent"))
    .toEqual([f.fixture.iri("Agent")]);
  await expect(f.pane.locator(".toast")).toContainText("Move reversed.");
  await hierarchyMenu(f.app, "edit.redo");
  await expect
    .poll(() => parents("Software Agent"))
    .toEqual([f.fixture.iri("Artifact")]);
  await expect(
    f.pane.getByRole("button", { name: "Undo move", exact: true }),
  ).toHaveCount(0);
});
test("empty-space and existing-parent blocks retain RDF; a changed ontology invalidates the drag", async () => {
  f = await launchHierarchy();
  const before = (await f.state()).version;
  await f.drag("Agent", "", true, true);
  await expect(f.pane.locator(".toast")).toContainText(
    "owl:Thing is already the parent.",
  );
  expect((await f.state()).version).toBe(before);
  await f.drag("Software Agent", "Agent", true);
  await expect(f.pane.locator(".toast")).toContainText(
    "Agent is already the parent.",
  );
  await f.drag("Software Agent", "Artifact");
  await f.page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Changed Artifact" }),
    f.fixture.iri("Artifact"),
  );
  const dt = await f.page.evaluateHandle(
    () => (window as unknown as { hierarchyDrag: DataTransfer }).hierarchyDrag,
  );
  await f.row("Person").dispatchEvent("drop", { dataTransfer: dt });
  await expect(f.pane.locator(".toast")).toContainText(
    "The ontology changed. Drag the class again.",
  );
  expect(await parents("Software Agent")).toEqual([f.fixture.iri("Agent")]);
});
test("keyboard focus, ranges and Enter use the focused row and the existing Details tab", async () => {
  f = await launchHierarchy();
  await f.row("Agent").click();
  await f.row("Agent").press("Control+ArrowDown");
  await expect(f.row("Person")).toBeFocused();
  await expect(f.row("Agent")).toHaveAttribute("aria-selected", "true");
  await f.row("Person").press("Shift+ArrowDown");
  await expect(f.row("Organization")).toBeFocused();
  await expect(
    f.pane.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(3);
  await f.row("Organization").press("Enter");
  await expect(
    f.page.getByRole("region", { name: "Details", exact: true }),
  ).toContainText("Organization");
  await hierarchyMenu(f.app, "view.hierarchy");
  await expect(f.pane.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(
    1,
  );
  await expect(f.pane.getByRole("tree")).not.toHaveAttribute("tabindex", "0");
  await f.row("Software Agent").focus();
  await f.row("Software Agent").press("ArrowRight");
  await expect(f.row("Software Agent")).toBeFocused();
});
test("overflow retains disabled actions, keyboard navigation and the hierarchy search command", async () => {
  f = await launchHierarchy();
  await f.size(418, 530);
  const more = f.pane.getByRole("button", { name: "More actions" });
  await more.click();
  const menu = f.page.getByRole("menu", { name: "More actions" });
  await expect(
    menu.getByRole("menuitem", { name: "Open in Details", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    menu.getByRole("menuitem", { name: "Show in graph", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    menu.getByRole("menuitem", { name: "New class", exact: true }),
  ).toBeFocused();
  await f.page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", {
      name: "Undo the last move",
      exact: true,
    }),
  ).toBeFocused();
  await f.page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await f.size(298, 530);
  await f.more("Filter hierarchy");
  await expect(
    f.pane.getByRole("textbox", { name: "Filter hierarchy" }),
  ).toBeFocused();
  await f.pane
    .getByRole("textbox", { name: "Filter hierarchy" })
    .fill("Person");
  await f.size(218, 270);
  await expect(
    f.host.getByRole("button", { name: "Maximize pane" }),
  ).toBeVisible();
  await f.size(898, 530);
  await expect(
    f.pane.getByRole("textbox", { name: "Filter hierarchy" }),
  ).toHaveValue("Person");
  await f.pane.getByRole("textbox", { name: "Filter hierarchy" }).fill("");
  await f.row("Person").click();
  await f.size(298, 530);
  await f.more("Open in Details");
  await expect(
    f.page.getByRole("region", { name: "Details", exact: true }),
  ).toContainText("Person");
});

test("presentation hysteresis and recovery preserve expansion, selection and scroll", async () => {
  f = await launchHierarchy();
  await f.more("Expand every branch");
  await f.row("Researcher").click();
  const tree = f.pane.getByRole("tree");
  await tree.evaluate((el) => (el.scrollTop = 240));
  const before = await tree.evaluate((el) => el.scrollTop);
  await f.size(598, 398);
  await f.host.evaluate((el) =>
    Object.assign((el as HTMLElement).style, {
      width: "608px",
      height: "408px",
    }),
  );
  await expect(f.host).toHaveAttribute("data-pane-narrow", "true");
  await expect(f.host).toHaveAttribute("data-pane-shallow", "true");
  await f.size(616, 416);
  await expect(f.host).toHaveAttribute("data-pane-narrow", "false");
  await expect(f.host).toHaveAttribute("data-pane-shallow", "false");
  await f.size(218, 270);
  await expect(
    f.host.getByRole("button", { name: "Maximize pane" }),
  ).toBeVisible();
  await f.size(898, 530);
  await expect(f.row("Researcher")).toHaveAttribute("aria-selected", "true");
  await expect(f.row("Person")).toHaveAttribute("aria-expanded", "true");
  expect(await tree.evaluate((el) => el.scrollTop)).toBe(before);
  await hierarchyMenu(f.app, "file.new");
  await expect.poll(async () => (await f.state()).classCount).toBe(1);
  await hierarchyMenu(f.app, "view.hierarchy");
  await f.size(898, 530);
  await expect(f.pane.locator(".foot")).toContainText("1 rows shown of 1");
  expect(f.errors).toEqual([]);
});

test("a move waits for earlier expansion history before becoming the next Undo", async () => {
  f = await launchHierarchy();
  await holdRequests(f.app, ["uiHistory"]);
  await f.row("Person").getByRole("button").click();
  await waitForHeld(f.app);
  const before = (await f.state()).version;
  await f.drag("Software Agent", "Artifact", true);
  expect(await requestCount(f.app, "moveClasses")).toBe(0);
  expect((await f.state()).version).toBe(before);
  await releaseRequests(f.app);
  await expect(
    f.pane.getByRole("button", { name: "Undo move", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await f.state()).undoLabel)
    .toBe("Move Software Agent under Artifact");
  await f.pane.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect
    .poll(() => parents("Software Agent"))
    .toEqual([f.fixture.iri("Agent")]);
});

test("Ctrl+G seeds exactly the selected branches without their unselected children", async () => {
  f = await launchHierarchy();
  await f.row("Agent").click();
  await f.row("Artifact").click({ modifiers: ["Control"] });
  await expect(f.row("Agent")).toHaveAttribute("aria-selected", "true");
  await expect(f.row("Artifact")).toHaveAttribute("aria-selected", "true");
  await expect(f.row("Artifact")).toBeFocused();
  await holdRequests(f.app, []);
  await f.row("Artifact").press("Control+g");
  // The fixture's pending expansion history must finish before this mutation.
  await expect
    .poll(() => requestCount(f.app, "seed"), { timeout: 15000 })
    .toBe(1);
  await expect
    .poll(async () => (await f.state()).graph.nodes.map((n) => n.iri).sort())
    .toEqual([f.fixture.iri("Agent"), f.fixture.iri("Artifact")].sort());
});
