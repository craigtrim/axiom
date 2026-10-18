// craigtrim/axiom#89: test retained drafts, RDF identity and measured actions in Electron.
import { test, expect } from "@playwright/test";
import type { SourceDocument } from "../../src/shared/source";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";
import {
  launchInspector,
  inspectorMenu,
  inspectorBase,
  type InspectorFixture,
} from "./inspector-reference-fixture";
let f: InspectorFixture;
test.beforeEach(async () => {
  f = await launchInspector();
});
test.afterEach(async () => {
  await f?.app.close();
  expect(f?.errors ?? []).toEqual([]);
});
test("name and label share validation and Apply remains one undoable edit", async () => {
  const name = f.pane.getByRole("textbox", { name: "Name", exact: true });
  const label = f.pane.getByRole("textbox", {
    name: "rdfs:label value 1",
    exact: true,
  });
  await name.fill("");
  await expect(label).toHaveValue("");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(f.pane.locator(".bar .state")).toHaveText("A name is required.");
  await expect(f.pane.locator(".ident .state")).toHaveText(
    "A name is required.",
  );
  await expect(
    f.pane.getByRole("button", { name: "Apply changes", exact: true }),
  ).toHaveCount(0);
  await label.fill("Marketing research");
  await expect(name).toHaveValue("Marketing research");
  await f.pane
    .getByRole("textbox", { name: "rdfs:comment value 1", exact: true })
    .fill("Updated comment");
  await f.pane
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(f.pane.locator(".toast")).toHaveText(
    "Applied as one edit. Use Undo to take it back.",
  );
  await expect
    .poll(async () => (await f.data()).entity.label)
    .toBe("Marketing research");
  await inspectorMenu(f.app, "edit.undo");
  await expect(name).toHaveValue("Marketing");
  await expect(
    f.pane.getByRole("textbox", { name: "rdfs:comment value 1", exact: true }),
  ).toHaveValue("A course of study in marketing");
});

test("Name waits for its draft before accepting edits", async () => {
  await holdRequests(f.app, ["entityDocument"]);
  await f.page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    inspectorBase + "Course",
  );
  await waitForHeld(f.app);
  const name = f.pane.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toHaveValue("Course");
  await expect(name).toHaveAttribute("readonly", "");
  await releaseRequests(f.app);
  await expect(name).toBeEditable();
  await name.fill("Loaded course");
  await expect(
    f.pane.getByRole("textbox", { name: "rdfs:label value 1", exact: true }),
  ).toHaveValue("Loaded course");
});

test("returning to a subject during Apply keeps save actions disabled and later typing retained", async () => {
  const name = f.pane.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("First save");
  await holdRequests(f.app, ["updateEntity"]);
  await f.pane
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await waitForHeld(f.app);
  await f.select("Course");
  await f.page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    inspectorBase + "Marketing",
  );
  await expect(name).toHaveValue("First save");
  await expect(
    f.pane.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeDisabled();
  await expect(
    f.pane.getByRole("button", { name: "Discard", exact: true }),
  ).toBeDisabled();
  await name.fill("Typed after returning");
  await releaseRequests(f.app);
  await expect(
    f.pane.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeEnabled();
  await expect(name).toHaveValue("Typed after returning");
  expect((await f.data()).entity.label).toBe("First save");
  await f.pane.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(name).toHaveValue("First save");
});
test("collapsed values expand to the new field and survive selection changes", async () => {
  const group = f.pane.locator(
    'tr[data-predicate="http://www.w3.org/2000/01/rdf-schema#seeAlso"]',
  );
  await expect(group.locator(".vrow")).toHaveCount(3);
  await group
    .getByRole("button", { name: "Add value for rdfs:seeAlso" })
    .click();
  const added = group.getByRole("textbox", {
    name: "rdfs:seeAlso value 6",
    exact: true,
  });
  await expect(added).toBeFocused();
  await added.fill("Marketing evidence");
  await f.select("Course");
  await f.select("Marketing");
  await expect(added).toHaveValue("Marketing evidence");
  await expect(group.getByRole("button", { name: "Show fewer" })).toBeVisible();
  await added.press("Escape");
  await expect(group.locator(".vrow")).toHaveCount(5);
  await expect(f.pane.locator(".toast")).toContainText("Draft discarded.");
});
test("usage counts are kind-specific and the predicate menu retains RDF type", async () => {
  await expect(f.pane.locator(".usage .k")).toHaveText([
    "Subclasses",
    "Descendants",
    "Direct instances",
    "Used as a value",
  ]);
  const data = await f.data();
  expect(data.referencedBy).toBe(3);
  expect(data.referencingSubjects).toBe(3);
  await f.select("MKT3100");
  await expect(f.pane.locator(".usage .k")).toHaveText([
    "Types",
    "Statements",
    "Used as a value",
    "Referenced by",
  ]);
  await expect(
    f.pane.getByRole("textbox", { name: "rdf:type inferred value" }),
  ).toHaveValue("owl:Thing");
  await f.select("credits");
  await expect(f.pane.locator(".usage .k")).toHaveText([
    "Subproperties",
    "Used as a predicate",
  ]);
  await expect(f.pane.locator(".usage .v")).toHaveText(["0", "2"]);
  await f.pane
    .getByRole("button", { name: "Add statement", exact: true })
    .first()
    .click();
  const menu = f.pane.getByRole("menu", { name: "Add statement", exact: true });
  await expect(menu.getByRole("menuitem").first()).toHaveText("rdf:type");
  await expect(
    menu.getByRole("menuitem", { name: "rdf:type", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await menu
    .getByRole("menuitem", { name: "rdfs:domain", exact: true })
    .click();
  await expect(
    f.pane.getByRole("textbox", { name: "rdfs:domain value 1", exact: true }),
  ).toBeFocused();
  await f.pane
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(f.pane.getByRole("alert")).toContainText("rdfs:domain");
  await expect(f.pane.locator(".toast")).not.toContainText(
    "Applied as one edit.",
  );
  expect((await f.state()).selected).toBe(inspectorBase + "credits");
});

test("long and blank names retain validation through selection and recovery", async () => {
  const name = f.pane.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("x".repeat(257));
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(f.pane.locator(".bar .state")).toHaveText(
    "A name is at most 256 characters; this is 257.",
  );
  await f.select("Course");
  await f.page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    inspectorBase + "Marketing",
  );
  await expect(name).toHaveValue("x".repeat(257));
  await name.fill("   ");
  await f.size(218, 530);
  await expect(f.host).toHaveAttribute("data-pane-recovery", "true");
  await expect(
    f.host.getByRole("button", { name: "Maximize pane" }),
  ).toBeFocused();
  await f.size(678, 530);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("   ");
  await expect(f.pane.locator(".ident .state")).toHaveText(
    "A name is required.",
  );
  await name.press("Escape");
  await expect(name).toHaveValue("Marketing");
});

test("actions overflow in order and menus preserve the draft and owner focus", async () => {
  await f.pane
    .getByRole("textbox", { name: "rdfs:comment value 1", exact: true })
    .fill("A pending comment");
  const more = f.pane.getByRole("button", {
    name: "More actions",
    exact: true,
  });
  for (const [width, hidden] of [
    [478, ["add"]],
    [378, ["add", "details"]],
    [258, ["add", "details", "discard"]],
  ] as const) {
    await f.size(width, 530);
    for (const id of ["add", "details", "discard"])
      await expect(
        f.pane.locator(`[data-shared-command="${id}"]`),
      ).toHaveAttribute(
        "data-overflowed",
        String((hidden as readonly string[]).includes(id)),
      );
    await expect(f.pane.locator(".bar")).toHaveJSProperty("offsetHeight", 28);
    const bounds = (await more.boundingBox())!,
      host = (await f.host.boundingBox())!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(host.x + host.width);
    expect(
      await f.pane
        .locator(".ibody")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await more.click();
  const popup = f.pane.getByRole("menu", { name: "More actions", exact: true });
  await expect(popup.getByRole("menuitem")).toHaveText([
    "Add statement",
    "Open in Details",
    "Discard",
    "Copy IRI",
    "Find touchpoints",
  ]);
  await f.page.keyboard.press("End");
  await expect(
    popup.getByRole("menuitem", { name: "Find touchpoints", exact: true }),
  ).toBeFocused();
  await f.page.keyboard.press("Home");
  await expect(
    popup.getByRole("menuitem", { name: "Add statement", exact: true }),
  ).toBeFocused();
  await f.page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await expect(f.pane.locator(".bar .state")).toHaveText("Unapplied changes");
  await more.click();
  await popup
    .getByRole("menuitem", { name: "Add statement", exact: true })
    .click();
  const predicates = f.pane.getByRole("menu", {
    name: "Add statement",
    exact: true,
  });
  await expect(predicates).toBeVisible();
  await f.page.keyboard.press("Tab");
  await expect(predicates).toBeHidden();
  await expect(more).toBeFocused();
});

test("shared size hysteresis and Maximize retain the same focused draft field", async () => {
  const name = f.pane.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Retained Marketing");
  const resize = async (width: number, height: number) =>
    f.host.evaluate(
      (el, { width, height }) =>
        Object.assign((el as HTMLElement).style, {
          width: width + "px",
          height: height + "px",
        }),
      { width, height },
    );
  for (const [width, narrow] of [
    [599, true],
    [600, true],
    [615, true],
    [616, false],
  ] as const) {
    await resize(width, 530);
    await expect(f.host).toHaveAttribute("data-pane-narrow", String(narrow));
  }
  for (const [height, shallow] of [
    [399, true],
    [400, true],
    [415, true],
    [416, false],
  ] as const) {
    await resize(678, height);
    await expect(f.host).toHaveAttribute("data-pane-shallow", String(shallow));
  }
  await f.size(478, 209);
  await expect(f.host).toHaveAttribute("data-pane-recovery", "true");
  const maximize = f.host.getByRole("button", { name: "Maximize pane" });
  await expect(maximize).toBeFocused();
  // Remove only the fixture's size override so the dock can perform a real maximize.
  await maximize.click();
  await f.host.evaluate((el) => (el as HTMLElement).removeAttribute("style"));
  await expect(f.host).toHaveAttribute("data-pane-recovery", "false");
  await expect(name).toHaveValue("Retained Marketing");
  await expect(name).toBeFocused();
});

test("Copy IRI, Details navigation, and removing a predicate preserve the subject", async () => {
  const more = f.pane.getByRole("button", {
    name: "More actions",
    exact: true,
  });
  await more.click();
  await f.pane.getByRole("menuitem", { name: "Copy IRI", exact: true }).click();
  expect(
    await f.app.evaluate(async ({ clipboard }) => await clipboard.readText()),
  ).toBe(inspectorBase + "Marketing");
  await f.pane
    .getByRole("textbox", { name: "rdfs:comment value 1", exact: true })
    .focus();
  const comment = f.pane.locator(
    'tr[data-predicate="http://www.w3.org/2000/01/rdf-schema#comment"]',
  );
  await comment.getByRole("button", { name: "Remove this value" }).click();
  await expect(comment).toHaveCount(0);
  await expect(
    f.pane.getByRole("button", { name: "Add statement", exact: true }).first(),
  ).toBeFocused();
  await f.pane
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Retained in Details");
  await f.pane
    .getByRole("button", { name: "Open in Details", exact: true })
    .click();
  const details = f.page.getByRole("region", {
    name: "Details",
    exact: true,
  });
  await expect(details).toBeVisible();
  await expect(
    details.getByRole("textbox", { name: "rdfs:label value 1", exact: true }),
  ).toHaveValue("Retained in Details");
  expect((await f.state()).selected).toBe(inspectorBase + "Marketing");
});

test("root classes expose inferred-only groups and an empty selection has no actions", async () => {
  await f.select("Course");
  await expect(f.pane.locator(".sect .n")).toHaveText("2 over 2 predicates");
  const inferred = f.pane.locator(
    'tr[data-predicate="http://www.w3.org/2000/01/rdf-schema#subClassOf"]',
  );
  await expect(inferred.getByRole("textbox")).toHaveValue("owl:Thing");
  await expect(inferred.getByRole("textbox")).toHaveAttribute("readonly", "");
  await expect(
    inferred.getByRole("button", { name: "Remove this value" }),
  ).toHaveCount(0);
  await expect(
    inferred.getByRole("button", { name: "Add value for rdfs:subClassOf" }),
  ).toBeVisible();
  await f.pane.locator(".inspector-content-grid").evaluate((el, iri) => {
    const transfer = new DataTransfer();
    transfer.setData("application/x-axiom-entity", iri);
    el.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  }, inspectorBase + "Marketing");
  await expect(
    f.page.getByRole("region", { name: "Details", exact: true }),
  ).toHaveAttribute("data-entity-iri", inspectorBase + "Marketing");
  await f.page.evaluate(() => window.axiom.request("select", { iri: null }));
  await expect(f.pane).toHaveText("Select an entity to inspect it.");
  await expect(
    f.pane.getByRole("group", { name: "Inspector actions" }),
  ).toBeEmpty();
});

test("usage distinguishes referencing subjects and excludes self references", async () => {
  await f.page.evaluate(async (base) => {
    const document = await window.axiom.request<SourceDocument>(
      "sourceDocument",
      { format: "turtle" },
    );
    await window.axiom.request("applySource", {
      ...document,
      text:
        document.text +
        `\n<${base}Loose> <http://www.w3.org/2000/01/rdf-schema#label> "Loose"; <${base}p> <${base}Marketing>; <${base}q> <${base}Marketing>.\n<${base}Marketing> <${base}p> <${base}Marketing>.\n<${base}Decimal> a <http://www.w3.org/2000/01/rdf-schema#Datatype>; <http://www.w3.org/2000/01/rdf-schema#label> "Decimal".\n`,
    });
  }, inspectorBase);
  await expect.poll(async () => (await f.data()).referencedBy).toBe(5);
  expect((await f.data()).referencingSubjects).toBe(4);
  for (const id of ["Loose", "Decimal"]) {
    await f.page.evaluate(
      (iri) => window.axiom.request("select", { iri }),
      inspectorBase + id,
    );
    await expect(
      f.pane.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue(id);
    await expect(f.pane.locator(".usage .k")).toHaveText(["Used as a value"]);
  }
  for (const kind of ["ObjectProperty", "AnnotationProperty"]) {
    await f.page.evaluate(
      (kind) => window.axiom.request("createProperty", { name: kind, kind }),
      kind,
    );
    await expect(
      f.pane.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue(kind);
    await expect(f.pane.locator(".usage .k")).toHaveText([
      "Subproperties",
      "Used as a predicate",
    ]);
    await expect(f.pane.locator(".usage .v")).toHaveText(["0", "0"]);
  }
});
