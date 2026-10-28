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
// #165: an older debounced check can already be held when the next name is typed.
// Match the draft being tested before resolving or rejecting its worker reply.
const waitForPreview = async (label: string) => {
  await expect
    .poll(() =>
      f.app.evaluate(
        (_, label) =>
          (globalThis as any).__heldRequests.held.some(
            (item: any) =>
              item.method === "addEntityCheck" &&
              item.args.creation.root.label === label,
          ),
        label,
      ),
    )
    .toBe(true);
};
test.afterEach(async () => {
  await f?.close();
  expect(f?.errors ?? []).toEqual([]);
});
test("pending checks keep the form quiet and Create waits for the current reply", async () => {
  f = await launchAddEntity("light", "Fresh Draft");
  await expect(f.pane().locator(".vmsg")).toHaveCount(0);
  await holdRequests(f.app, ["addEntityCheck"]);
  await f.setName("Fresh Choice");
  await waitForPreview("Fresh Choice");
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
  await waitForPreview("First Revision");
  await releaseRequests(f.app, { fail: true, keepHolding: true });
  await expect(f.pane().locator(".vmsg")).toContainText(
    "Controlled preview failure",
  );
  await f.setName("Second Revision");
  await waitForPreview("Second Revision");
  await expect(f.pane().locator(".vmsg")).toContainText(
    "Controlled preview failure",
  );
  await releaseRequests(f.app);
  await expect(f.pane().locator(".vmsg")).toHaveCount(0);
  await holdRequests(f.app, ["addEntityCheck"]);
  await f.setName("Old Reply");
  await waitForPreview("Old Reply");
  await f.pane().getByRole("button", { name: "Create", exact: true }).click();
  await f.setName("New Reply");
  await waitForHeld(f.app, 2);
  await waitForPreview("New Reply");
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
  await waitForPreview("New Engineering");
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
// #177: Name edits retain the created root; other edits still start a new draft.
test("a created class stays its own result when Name changes and returns", async () => {
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
  await expect(status).toHaveText("Created");
  await expect(status).toHaveClass(/okink/);
  await expect(band.locator(".vmsg")).toHaveCount(0);
  await expect(create).toBeDisabled();
  await expect(f.pane().locator(".foot")).toContainText(
    "created, and selected in Hierarchy",
  );
});

// #169: the fresh form must discard fields and validation without writing RDF.
test("Discard draft leaves a fresh form while validation is pending", async () => {
  f = await launchAddEntity("light", "Engineering");
  const pane = f.pane(),
    status = pane.locator('[data-shared-command="state"]'),
    discard = pane.getByRole("button", { name: "Discard draft", exact: true });
  await f.choose("Writing Skills");
  await pane
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Discard this comment");
  await pane
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("Discard this value");
  await f.picker().fill("Unselected parent");
  await pane.getByRole("button", { name: "Individual", exact: true }).click();
  await expect(pane.locator(".vmsg.bad2")).toContainText("already exists");
  const before = await f.state();
  await holdRequests(f.app, ["addEntityCheck"]);
  await f.setName("Seminar");
  await waitForPreview("Seminar");
  await discard.click();
  await expect(pane.locator(".toast")).toContainText("Draft discarded.");
  await waitForPreview("");
  await expect(f.name()).toHaveValue("");
  await expect(
    pane.getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("");
  await expect(f.picker()).toHaveValue("");
  await expect(pane.locator(".pchip")).toHaveCount(0);
  await expect(
    pane.getByRole("textbox", { name: "Value", exact: true }),
  ).toHaveValue("");
  await expect(pane.locator(".vmsg")).toHaveCount(0);
  await expect(status).toHaveText("Draft");
  await expect(status).not.toHaveClass(/badink|warnink|okink/);
  await expect(
    pane.getByRole("button", { name: "Create", exact: true }),
  ).toBeDisabled();
  await expect(discard).toBeDisabled();
  await expect(
    pane.getByRole("button", { name: "Individual", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(pane).toContainText("nothing, this is a blank form");
  await releaseRequests(f.app, { reverse: true });
  await expect(status).toHaveText("Draft");
  await expect(pane.locator(".vmsg")).toHaveCount(0);
  const after = await f.state();
  expect(after.version).toBe(before.version);
  expect(after.entities).toEqual(before.entities);
  await f.setName("Next Draft");
  await expect(discard).toBeEnabled();
  await expect(status).toHaveText("Ready to create");
});

test("blank forms enable Discard only for content in the row and overflow menu", async () => {
  f = await launchAddEntity("light", "");
  const pane = f.pane(),
    status = pane.locator('[data-shared-command="state"]'),
    discard = pane.getByRole("button", { name: "Discard draft", exact: true });
  await expect(status).toHaveText("Draft");
  await expect(status).not.toHaveClass(/badink|warnink|okink/);
  await expect(pane.locator(".vmsg")).toHaveCount(0);
  await expect(discard).toBeDisabled();
  const blankWidth = (await discard.boundingBox())!.width;
  await pane.getByRole("button", { name: "Individual", exact: true }).click();
  await expect(discard).toBeDisabled();
  for (const field of [
    f.name(),
    pane.getByRole("textbox", { name: "Comment", exact: true }),
    f.picker(),
    pane.getByRole("textbox", { name: "Value", exact: true }),
  ]) {
    await field.fill(" ");
    await expect(discard).toBeEnabled();
    expect((await discard.boundingBox())!.width).toBe(blankWidth);
    await field.fill("");
    await expect(discard).toBeDisabled();
  }
  await expect(status).toHaveText("Draft");
  await expect(pane.locator(".vmsg")).toHaveCount(0);
  await f.choose("Enginee");
  await expect(pane.locator(".pchip")).toHaveText(["Engineering"]);
  await expect(discard).toBeEnabled();
  await pane
    .getByRole("button", { name: "Remove Engineering", exact: true })
    .click();
  await expect(discard).toBeDisabled();
  await pane
    .getByRole("button", { name: "Add a statement", exact: true })
    .click();
  await expect(discard).toBeDisabled();
  await f.size(368, 530);
  const more = pane.getByRole("button", { name: "More actions", exact: true });
  await more.click();
  await expect(
    f.page.getByRole("menuitem", { name: "Discard draft", exact: true }),
  ).toBeDisabled();
  await f.page.keyboard.press("Escape");
  await f.setName("Overflow Draft");
  await more.click();
  const overflowDiscard = f.page.getByRole("menuitem", {
    name: "Discard draft",
    exact: true,
  });
  await expect(overflowDiscard).toBeEnabled();
  await overflowDiscard.click();
  await expect(f.name()).toHaveValue("");
  await f.size();
  await expect(status).toHaveText("Draft");
  await expect(pane.locator(".vmsg")).toHaveCount(0);
  await expect(discard).toBeDisabled();
  await expect(
    pane.getByRole("button", { name: "Create", exact: true }),
  ).toBeDisabled();
});

// #177: exercise both explicit outcomes against the real store, including persisted identity.
const createAction = (name: string) =>
  f.pane().getByRole("button", { name, exact: true });
const draftStatus = () => f.pane().locator('[data-shared-command="state"]');
const rootDocument = (iri: string) =>
  f.page.evaluate(
    async (iri) =>
      (
        await window.axiom.request<{
          statements: import("../../src/domain/model").Triple[];
        }>("entityDocument", { iri })
      ).statements,
    iri,
  );
async function createTracked(name = "Speed Reading") {
  await f.setName(name);
  await createAction("Create").click();
  await expect(draftStatus()).toHaveText("Created");
  return (await f.state()).entities.find((e) => e.label === name)!.iri;
}
async function expectRenameChoice(
  from = "Speed Reading",
  to = "Speed Readings",
) {
  await expect(createAction("Rename")).toBeEnabled();
  await expect(createAction("Create new")).toBeVisible();
  await expect(createAction("Create")).toHaveCount(0);
  await expect(f.pane().locator(".rename-choice")).toContainText(
    `${from} was created from this draft. Rename changes its name; Create new adds ${to} beside it.`,
  );
  await expect(f.page.locator("dialog[open], :popover-open")).toHaveCount(0);
}
for (const kind of ["Class", "Individual"] as const)
  test(`Add entity renames its created ${kind} only and one Undo restores every statement`, async () => {
    f = await launchAddEntity("light", "Speed Reading");
    await createAction(kind).click();
    await f.choose("Writing Skills");
    await f
      .pane()
      .getByRole("textbox", { name: "Comment", exact: true })
      .fill("Keep this description.");
    await f
      .pane()
      .getByRole("textbox", { name: "Value", exact: true })
      .fill("Read quickly");
    await createAction("Create both").click();
    await expect(draftStatus()).toHaveText("Created");
    const original = (await f.state()).entities.find(
      (e) => e.label === "Speed Reading",
    )!;
    const parent = (await f.state()).entities.find(
      (e) => e.label === "Writing Skills",
    )!;
    const before = await rootDocument(original.iri),
      parentBefore = await rootDocument(parent.iri);
    await f.setName("Speed Readings");
    await expectRenameChoice();
    await expect(draftStatus()).toHaveText("Ready to rename or create");
    await expect(f.pane().locator(".fnote").first()).toContainText(
      `Rename keeps IRI ${original.iri}; Create new writes ${f.fixture.base}SpeedReadings`,
    );
    if (kind === "Class") {
      await f.page.screenshot({ path: "artifacts/issue-177/choice-wide.png" });
      await f.size(360, 530);
      await f.page.screenshot({
        path: "artifacts/issue-177/choice-narrow.png",
      });
      for (const name of ["Rename", "Create new"]) {
        const box = await createAction(name).boundingBox(),
          bar = await f.pane().locator(".bar").boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(bar!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(bar!.x + bar!.width);
      }
    }
    const version = (await f.state()).version;
    await createAction("Rename").click();
    await expect(draftStatus()).toHaveText("Created");
    await expect(createAction("Create")).toBeDisabled();
    await expect(f.pane().locator(".toast")).toContainText(
      "Renamed Speed Reading to Speed Readings.",
    );
    await expect(f.pane().locator(".toast")).toContainText(
      "The IRI did not change",
    );
    const after = await f.state();
    expect(after.version).toBe(version + 1);
    expect(
      after.entities.filter((e) => e.label === "Speed Reading"),
    ).toHaveLength(0);
    expect(
      after.entities
        .filter((e) => e.label === "Speed Readings")
        .map((e) => e.iri),
    ).toEqual([original.iri]);
    expect(after.selected).toBe(original.iri);
    const changed = await rootDocument(original.iri);
    expect(changed.filter((t) => t.predicate !== NS.rdfs + "label")).toEqual(
      before.filter((t) => t.predicate !== NS.rdfs + "label"),
    );
    expect(await rootDocument(parent.iri)).toEqual(parentBefore);
    await addEntityMenu(f.app, "edit.undo");
    await expect.poll(() => rootDocument(original.iri)).toEqual(before);
    await expectRenameChoice();
    expect(await rootDocument(parent.iri)).toEqual(parentBefore);
    await addEntityMenu(f.app, "edit.redo");
    await expect(draftStatus()).toHaveText("Created");
    expect(await rootDocument(original.iri)).toEqual(changed);
  });

for (const kind of ["Class", "Individual"] as const)
  test(`Add entity Create new preserves the first ${kind} and tracks the second`, async () => {
    f = await launchAddEntity("light", "Speed Reading");
    await createAction(kind).click();
    const first = await createTracked(),
      before = await rootDocument(first);
    await f.setName("Speed Readings");
    await expectRenameChoice();
    await createAction("Create new").click();
    await expect(draftStatus()).toHaveText("Created");
    const second = (await f.state()).entities.find(
      (e) => e.label === "Speed Readings",
    )!.iri;
    expect(second).not.toBe(first);
    expect(await rootDocument(first)).toEqual(before);
    await f.setName("Speed Reading Skills");
    await expectRenameChoice("Speed Readings", "Speed Reading Skills");
    await createAction("Rename").click();
    await expect(draftStatus()).toHaveText("Created");
    expect(
      (await f.state()).entities.find((e) => e.iri === second)?.label,
    ).toBe("Speed Reading Skills");
    expect(await rootDocument(first)).toEqual(before);
  });

test("Add entity edited Name choice follows creation Undo and Redo", async () => {
  f = await launchAddEntity("light", "Speed Reading");
  const iri = await createTracked();
  await f.setName("Speed Readings");
  await expectRenameChoice();
  // Native Undo belongs to Name while it has text focus; target ontology history here.
  await createAction("Rename").focus();
  await addEntityMenu(f.app, "edit.undo");
  await expect(createAction("Rename")).toHaveCount(0);
  await expect(createAction("Create")).toBeEnabled();
  expect((await f.state()).entities.some((e) => e.iri === iri)).toBe(false);
  await addEntityMenu(f.app, "edit.redo");
  await expectRenameChoice();
  await f.setName("Speed Reading");
  await expect(draftStatus()).toHaveText("Created");
  await expect(f.pane().locator(".validation-band .vmsg")).toHaveCount(0);
  await expect(createAction("Create")).toBeDisabled();
});

test("Add entity non-Name edits release the created root identity", async () => {
  f = await launchAddEntity("light", "Speed Reading");
  const iri = await createTracked();
  const before = await rootDocument(iri);
  await f.setName("Speed Readings");
  await expectRenameChoice();
  await f
    .pane()
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Another description");
  await expect(createAction("Rename")).toHaveCount(0);
  await expect(createAction("Create")).toBeEnabled();
  await f.setName("Speed Reading");
  await expect(draftStatus()).toHaveText("1 problem");
  await expect(f.pane().locator(".vmsg.bad2")).toContainText("already exists");
  expect(await rootDocument(iri)).toEqual(before);
});

test("Add entity rename choice survives saving and restart", async () => {
  f = await launchAddEntity("light", "Speed Reading");
  const iri = await createTracked();
  await f.setName("Speed Readings");
  await expectRenameChoice();
  await addEntityMenu(f.app, "file.save");
  const profile = f.profile;
  await f.close();
  expect(f.errors).toEqual([]);
  f = await launchAddEntity("light", "", profile);
  await expectRenameChoice();
  await createAction("Rename").click();
  await expect(draftStatus()).toHaveText("Created");
  expect((await f.state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "Speed Readings",
  );
});

test("Add entity placeholder rename keeps existing rename rules and survives Undo and Redo", async () => {
  f = await launchAddEntity("light", "New Class");
  const original = await createTracked("New Class");
  const engineering = await rootDocument(f.fixture.base + "Engineering");
  await f.setName("Engineering");
  await expectRenameChoice("New Class", "Engineering");
  await expect(createAction("Create new")).toBeDisabled();
  await expect(draftStatus()).toHaveText("Ready to rename");
  await expect(f.pane().locator(".fnote").first()).toContainText(
    "Rename replaces the placeholder IRI",
  );
  await createAction("Rename").click();
  await expect(draftStatus()).toHaveText("Created");
  await expect(f.pane().locator(".validation-band .vmsg")).toHaveCount(0);
  const renamed = f.fixture.base + "Engineering2";
  expect((await f.state()).entities.some((e) => e.iri === original)).toBe(
    false,
  );
  expect((await f.state()).entities.find((e) => e.iri === renamed)?.label).toBe(
    "Engineering",
  );
  await expect(f.pane().locator(".toast")).toContainText(
    `The placeholder IRI changed to ${renamed}`,
  );
  expect(await rootDocument(f.fixture.base + "Engineering")).toEqual(
    engineering,
  );
  await addEntityMenu(f.app, "edit.undo");
  await expectRenameChoice("New Class", "Engineering");
  expect(
    (await f.state()).entities.find((e) => e.iri === original)?.label,
  ).toBe("New Class");
  await addEntityMenu(f.app, "edit.redo");
  await expect(draftStatus()).toHaveText("Created");
  await f.setName("Engineering Seminar");
  await expectRenameChoice("Engineering", "Engineering Seminar");
  await createAction("Rename").click();
  await expect(draftStatus()).toHaveText("Created");
  expect((await f.state()).entities.find((e) => e.iri === renamed)?.label).toBe(
    "Engineering Seminar",
  );
});

test("Add entity pending rename preserves newer Name edits and the root identity", async () => {
  f = await launchAddEntity("light", "Speed Reading");
  const iri = await createTracked();
  await f.setName("Speed Readings");
  await expectRenameChoice();
  await holdRequests(f.app, ["rename"]);
  try {
    await createAction("Rename").click();
    await waitForHeld(f.app);
    // The real store broadcasts the completed rename before this fixture releases its reply.
    await expect
      .poll(
        async () =>
          (await f.state()).entities.find((e) => e.iri === iri)?.label,
      )
      .toBe("Speed Readings");
    await expect(createAction("Create")).toBeDisabled();
    await f.setName("Speed Reading Skills");
    await expect(createAction("Rename")).toBeDisabled();
    await expect(createAction("Create new")).toBeDisabled();
    expect(await requestCount(f.app, "rename")).toBe(1);
    await releaseRequests(f.app);
    await expect
      .poll(
        async () =>
          (await f.state()).entities.find((e) => e.iri === iri)?.label,
      )
      .toBe("Speed Readings");
    await expect(f.name()).toHaveValue("Speed Reading Skills");
    await expectRenameChoice("Speed Readings", "Speed Reading Skills");
    await createAction("Rename").click();
    await expect(draftStatus()).toHaveText("Created");
    expect((await f.state()).entities.find((e) => e.iri === iri)?.label).toBe(
      "Speed Reading Skills",
    );
  } finally {
    await releaseRequests(f.app);
  }
});
