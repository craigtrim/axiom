// craigtrim/axiom#93: author and undo the full hierarchy through the native form.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  holdRequests,
  waitForHeld,
  releaseRequests,
  requestCount,
} from "./held-requests";
import { NS, THING } from "../../src/domain/model";
import {
  launchAddEntity,
  addEntityMenu,
  type AddEntityFixture,
} from "./add-entity-reference-fixture";
let f: AddEntityFixture;
test.afterEach(async () => {
  await f?.close();
  expect(f?.errors ?? []).toEqual([]);
});
test("pending checks keep the form quiet and Create waits for the current reply", async () => {
  f = await launchAddEntity("light", "Fresh Draft");
  await expect(f.pane().locator(".vmsg")).toHaveCount(0);
  await holdRequests(f.app, ["addEntityCheck"]);
  await f.setName("Fresh Choice");
  await waitForHeld(f.app);
  await expect(f.name()).toBeFocused();
  await expect(f.pane().locator(".vmsg")).toHaveCount(0);
  await f.pane().getByRole("button", { name: "Create", exact: true }).click();
  expect(await requestCount(f.app, "addEntityCreate")).toBe(0);
  await releaseRequests(f.app);
  await expect
    .poll(async () =>
      (await f.state()).entities.some((e) => e.label === "Fresh Choice"),
    )
    .toBe(true);
});
test("a failed check stays visible until a successful check and stale replies cannot commit", async () => {
  f = await launchAddEntity("light", "Valid Start");
  await expect(
    f.pane().getByRole("button", { name: "Create", exact: true }),
  ).toBeEnabled();
  await holdRequests(f.app, ["addEntityCheck"]);
  await f.setName("First Revision");
  await waitForHeld(f.app);
  await releaseRequests(f.app, { fail: true, keepHolding: true });
  await expect(f.pane().locator(".vmsg")).toContainText(
    "Controlled preview failure",
  );
  await f.setName("Second Revision");
  await waitForHeld(f.app);
  await expect(f.pane().locator(".vmsg")).toContainText(
    "Controlled preview failure",
  );
  await releaseRequests(f.app);
  await expect(f.pane().locator(".vmsg")).toHaveCount(0);
  await holdRequests(f.app, ["addEntityCheck"]);
  await f.setName("Old Reply");
  await waitForHeld(f.app);
  await f.pane().getByRole("button", { name: "Create", exact: true }).click();
  await f.setName("New Reply");
  await waitForHeld(f.app, 2);
  await releaseRequests(f.app, { reverse: true });
  await expect(f.name()).toHaveValue("New Reply");
  await expect(f.pane().locator(".vmsg")).toHaveCount(0);
  expect(await requestCount(f.app, "addEntityCreate")).toBe(0);
  expect(
    (await f.state()).entities.some((e) =>
      ["Old Reply", "New Reply"].includes(e.label ?? ""),
    ),
  ).toBe(false);
});
test("Create waits for the pending phrase match and uses its default parent", async () => {
  f = await launchAddEntity("light", "Fresh Draft");
  await expect(
    f.pane().getByRole("button", { name: "Create", exact: true }),
  ).toBeEnabled();
  await holdRequests(f.app, ["addEntityCheck"]);
  await f.setName("New Engineering");
  await waitForHeld(f.app);
  await f.pane().getByRole("button", { name: "Create", exact: true }).click();
  await releaseRequests(f.app);
  await expect
    .poll(
      async () =>
        (await f.state()).entities.find((e) => e.label === "New Engineering")
          ?.iri,
    )
    .toBe(f.fixture.base + "NewEngineering");
  const document = await f.page.evaluate(
    async (base) =>
      window.axiom.request<any>("entityDocument", {
        iri: base + "NewEngineering",
      }),
    f.fixture.base,
  );
  expect(JSON.stringify(document)).toContain(f.fixture.base + "Engineering");
});
test("a create reply preserves edits typed after the submitted draft", async () => {
  f = await launchAddEntity("light", "Submitted Draft");
  await expect(
    f.pane().getByRole("button", { name: "Create", exact: true }),
  ).toBeEnabled();
  await holdRequests(f.app, ["addEntityCreate"]);
  await f.pane().getByRole("button", { name: "Create", exact: true }).click();
  await waitForHeld(f.app);
  await f.setName("My Next Draft");
  await f
    .pane()
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Typed while saving");
  await releaseRequests(f.app);
  await expect(
    f.pane().getByRole("button", { name: "Create", exact: true }),
  ).toBeEnabled();
  await expect(f.name()).toHaveValue("My Next Draft");
  await expect(
    f.pane().getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("Typed while saving");
  await expect(f.pane().locator(".foot .tag")).toHaveCount(0);
  const entities = (await f.state()).entities;
  expect(entities.some((e) => e.label === "Submitted Draft")).toBe(true);
  expect(entities.some((e) => e.label === "My Next Draft")).toBe(false);
});
test("the ranked picker waits for current results and Escape only clears its field", async () => {
  f = await launchAddEntity("light", "Fresh Draft");
  await holdRequests(f.app, ["resourceSuggestions"]);
  await f.picker().fill("Enginee");
  await waitForHeld(f.app);
  await f.picker().press("Enter");
  await expect(f.pane().locator(".pchip")).toHaveCount(0);
  await expect(f.pane().getByRole("listbox")).toHaveCount(0);
  await releaseRequests(f.app);
  await expect(f.pane().locator(".pchip")).toHaveText(["Engineering"]);
  await f.picker().fill("Writing Skills");
  await expect(
    f.pane().getByRole("option", { name: /Draft a new parent/ }),
  ).toBeVisible();
  await f.picker().press("Escape");
  await expect(f.picker()).toHaveValue("");
  await expect(f.name()).toHaveValue("Fresh Draft");
  await expect(f.pane().locator(".pchip")).toHaveCount(1);
  await expect(
    f.pane().getByRole("button", { name: "Suggest", exact: true }),
  ).toHaveCount(0);
});
test("Individuals keep all selected types and comma-bearing statements as one literal", async () => {
  f = await launchAddEntity("light", "ADA LOVELACE");
  await f
    .pane()
    .getByRole("button", { name: "Individual", exact: true })
    .click();
  await f.choose("Person");
  await f.picker().fill("Engineer Profile");
  await f
    .pane()
    .getByRole("option", { name: /^Draft a new parent named Engineer Profile/ })
    .click();
  await f
    .pane()
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("Ada, Countess");
  await f
    .pane()
    .getByRole("button", { name: "Create both", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await f.state()).entities.find((e) => e.label === "Ada Lovelace")
          ?.kind,
    )
    .toBe("Individual");
  const result = await f.page.evaluate(
    async (base) =>
      window.axiom.request<any>("entityDocument", {
        iri: base + "AdaLovelace",
      }),
    f.fixture.base,
  );
  expect(JSON.stringify(result)).toContain("Ada, Countess");
  expect(JSON.stringify(result)).toContain(f.fixture.base + "Person");
  expect(JSON.stringify(result)).toContain(f.fixture.base + "EngineerProfile");
});
test("title case runs only on opening or its explicit action, including repeated phrases", async () => {
  f = await launchAddEntity("light", "PHD SEMINAR IN GIS");
  await expect(f.name()).toHaveValue("PhD Seminar in GIS");
  await f.setName("my exact NAME");
  await f.size(458, 530);
  await expect(f.name()).toHaveValue("my exact NAME");
  await f.more("Re-run the title case conversion");
  await expect(f.name()).toHaveValue("PhD Seminar in GIS");
  await f.size();
  await f.setName("another override");
  await f.open("PHD SEMINAR IN GIS");
  await f.size();
  await expect(f.name()).toHaveValue("PhD Seminar in GIS");
  await f.open("OWL XSD MPNET");
  await f.size();
  await expect(f.name()).toHaveValue("OWL XSD MPNet");
});
test("source copying agrees across sizes, and draft recovery preserves every field", async () => {
  f = await launchAddEntity("light", "Fresh Draft");
  await f.choose("Writing Skills");
  await f.choose("Communication", "Writing Skills");
  await f
    .pane()
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Keep this draft.");
  await f
    .pane()
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("one, whole");
  await f.picker("Communication").fill("Doc");
  const source = await f.pane().getByLabel("Planned source").textContent();
  await f.size(859, 530);
  await expect(f.pane().locator(".srcbox")).toBeHidden();
  await f.more("Copy the planned source");
  await expect
    .poll(() => f.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe(source);
  for (const [width, height] of [
    [240, 210],
    [599, 209],
    [218, 270],
    [900, 179],
    [899, 399],
    [899, 416],
  ]) {
    await f.size(width, height);
  }
  await f.size();
  await expect(f.name()).toHaveValue("Fresh Draft");
  await expect(f.picker("Communication")).toHaveValue("Doc");
  await expect(
    f.pane().getByRole("textbox", { name: "Value", exact: true }),
  ).toHaveValue("one, whole");
  await expect(
    f.pane().getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("Keep this draft.");
  await expect(f.pane().getByLabel("Planned source")).toHaveText(source!);
  expect(
    (
      await new AxeBuilder({ page: f.page })
        .setLegacyMode(true)
        .include('[data-panel="textentities"]')
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("nested drafts, kind and unfinished picker text survive saving and restart", async () => {
  f = await launchAddEntity("light", "Retained Draft");
  await f.choose("Writing Skills");
  await f.choose("Communication", "Writing Skills");
  await f.picker("Communication").fill("Doc");
  await f
    .pane()
    .getByRole("button", { name: "Individual", exact: true })
    .click();
  await f
    .pane()
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("After restart");
  await f
    .pane()
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("retained, literal");
  await addEntityMenu(f.app, "file.save");
  const profile = f.profile;
  await f.close();
  expect(f.errors).toEqual([]);
  f = await launchAddEntity("light", "", profile);
  await expect(f.name()).toHaveValue("Retained Draft");
  await expect(
    f.pane().getByRole("button", { name: "Individual", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(f.picker("Communication")).toHaveValue("Doc");
  await expect(
    f.pane().getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("After restart");
  await expect(
    f.pane().getByRole("textbox", { name: "Value", exact: true }),
  ).toHaveValue("retained, literal");
});
test("Find carries its query and duplicate Reveal navigates without discarding the draft", async () => {
  f = await launchAddEntity();
  await f
    .pane()
    .getByRole("button", {
      name: "Reveal Basic English Composition",
      exact: true,
    })
    .click();
  await f.host().evaluate((el) => el.removeAttribute("style"));
  await expect(
    f.page.locator('.find-results tr[data-selected="true"]'),
  ).toContainText("Basic English Composition");
  const find = f.page.getByRole("region", {
      name: "Find entities results",
      exact: true,
    }),
    query = find.getByRole("searchbox", { name: "Search the ontology" });
  await query.fill("NEW FIND DRAFT");
  await expect(
    find.getByRole("button", { name: "Add entity", exact: true }),
  ).toBeVisible();
  await find.getByRole("button", { name: "Add entity", exact: true }).click();
  await f.size();
  await expect(f.name()).toHaveValue("New Find Draft");
  await expect(f.pane()).toContainText(
    "from your search NEW FIND DRAFT, title cased once when this view opened",
  );
  await f
    .pane()
    .getByRole("button", { name: "Find existing", exact: true })
    .click();
  await f.host().evaluate((el) => el.removeAttribute("style"));
  await expect(query).toHaveValue("New Find Draft");
  await addEntityMenu(f.app, "view.textentities");
  await f.size();
  await expect(f.name()).toHaveValue("New Find Draft");
});
test("creates a recursive draft atomically and retains the form after undo/redo", async () => {
  f = await launchAddEntity();
  await expect(f.name()).toHaveValue("Basic English Composition");
  await expect(f.pane().locator(".vmsg")).toContainText("already exists");
  await f.setName("Technical Writing");
  await f.choose("Enginee");
  await f.choose("Writing Skills");
  await f.choose("Communication", "Writing Skills");
  await f.choose("Document", "Communication");
  await expect(
    f.pane().getByRole("button", { name: "Create all", exact: true }),
  ).toBeEnabled();
  await f
    .pane()
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("A nested transaction.");
  const before = await f.state();
  await f
    .pane()
    .getByRole("button", { name: "Create all", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await f.state()).entities.filter((e) =>
          ["Technical Writing", "Writing Skills", "Communication"].includes(
            e.label ?? "",
          ),
        ).length,
    )
    .toBe(3);
  expect((await f.state()).version).toBe(before.version + 1);
  await expect(f.name()).toHaveValue("Technical Writing");
  await expect(f.pane().locator(".foot")).toContainText(
    "created, and selected in Hierarchy",
  );
  await addEntityMenu(f.app, "edit.undo");
  await expect
    .poll(async () =>
      (await f.state()).entities.some((e) => e.label === "Technical Writing"),
    )
    .toBe(false);
  await addEntityMenu(f.app, "edit.redo");
  await expect
    .poll(async () =>
      (await f.state()).entities.some((e) => e.label === "Communication"),
    )
    .toBe(true);
});
// craigtrim/axiom#119: the class a Create wrote reads as its result, and the duplicate returns once the draft changes.
test("a created class is not its own duplicate until the draft is edited", async () => {
  f = await launchAddEntity();
  await f.setName("Speed Reading");
  const status = f.pane().locator('[data-shared-command="state"]'),
    band = f.pane().locator(".validation-band"),
    create = f.pane().getByRole("button", { name: "Create", exact: true }),
    created = () =>
      f
        .state()
        .then((s) => s.entities.some((e) => e.label === "Speed Reading"));
  await expect(status).toHaveText("Ready to create");
  await create.click();
  await expect(f.pane().locator(".foot")).toContainText(
    "created, and selected in Hierarchy",
  );
  await expect(status).toHaveText("Created");
  await expect(status).toHaveClass(/okink/);
  await expect(band.locator(".vmsg")).toHaveCount(0);
  await expect(create).toBeDisabled();
  await addEntityMenu(f.app, "edit.undo");
  await expect.poll(created).toBe(false);
  await expect(status).toHaveText("Ready to create");
  await expect(create).toBeEnabled();
  await addEntityMenu(f.app, "edit.redo");
  await expect.poll(created).toBe(true);
  await expect(status).toHaveText("Created");
  await expect(create).toBeDisabled();
  await f.setName("Speed Readings");
  await f.setName("Speed Reading");
  await expect(band.locator(".vmsg.bad2")).toContainText(
    "A class named Speed Reading already exists.",
  );
  await expect(
    band.getByRole("button", { name: "Reveal Speed Reading", exact: true }),
  ).toBeVisible();
  await expect(status).toHaveText("1 problem");
  await expect(status).toHaveClass(/badink/);
  await expect(create).toBeDisabled();
  await expect(f.pane().locator(".foot")).not.toContainText(
    "created, and selected in Hierarchy",
  );
});
