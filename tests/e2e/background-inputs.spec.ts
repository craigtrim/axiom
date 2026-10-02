import { test, expect, type Desktop, box } from "./modal-fixture";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";
import type { Snapshot } from "../../src/shared/protocol";

const base = "https://example.test/background#";
async function resourceField(d: Desktop, predicate = "subClassOf") {
  await d.load(
    `@prefix : <${base}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:Alpha a owl:Class; rdfs:label "Alpha"; rdfs:${predicate} :Beta .
:Beta a owl:Class; rdfs:label "Beta" .
:Betamax a owl:Class; rdfs:label "Betamax" .
:Gamma a owl:Class; rdfs:label "Gamma" .`,
    "resources.ttl",
  );
  await d.request("select", { iri: base + "Alpha" });
  await d.menu("view.details");
  const field = d.page
    .getByRole("region", { name: "Details", exact: true })
    .locator(`input[role="combobox"][title="${base}Beta"]`);
  await expect(field).toBeVisible();
  return field;
}

test("statement matches survive a pending search and an edit clears the active resource", async ({
  desktop: d,
}) => {
  const field = await resourceField(d);
  await field.fill("Bet");
  const matches = d.page.getByRole("listbox");
  await expect(matches.getByRole("option")).toHaveCount(2);
  await field.press("ArrowDown");
  await expect(matches.getByRole("option", { selected: true })).toHaveCount(1);
  await holdRequests(d.app, ["resourceSuggestions"]);
  await field.fill("Beta ");
  await waitForHeld(d.app);
  await expect(matches.getByRole("option")).toHaveCount(2);
  // craigtrim/axiom#35: an edit drops the highlight, so Enter commits the typed text.
  await expect(matches.getByRole("option", { selected: true })).toHaveCount(0);
  await releaseRequests(d.app);
  await expect(matches.getByRole("option")).toHaveCount(2);
  await expect(matches.getByRole("option", { selected: true })).toHaveCount(0);
  await field.press("Enter");
  await expect(field).toHaveAttribute("aria-expanded", "false");
});

test("the active resource survives a background refresh", async ({
  desktop: d,
}) => {
  const field = await resourceField(d);
  await field.fill("Bet");
  const matches = d.page.getByRole("listbox");
  await expect(matches.getByRole("option")).toHaveCount(2);
  await field.press("ArrowDown");
  await field.press("ArrowDown");
  const selected = await matches
    .getByRole("option", { selected: true })
    .getAttribute("title");
  await holdRequests(d.app, ["resourceSuggestions"]);
  // Another view renames Gamma, so the open search reruns without a keystroke.
  await d.page.evaluate(async (iri) => {
    const doc = await window.axiom.request<any>("entityDocument", { iri });
    await window.axiom.request("updateEntity", {
      iri,
      nextIri: iri,
      statements: doc.statements.map((t: any) =>
        t.predicate.endsWith("#label")
          ? { ...t, object: { ...t.object, value: "Gamma renamed" } }
          : t,
      ),
      version: doc.version,
      datasetEpoch: doc.datasetEpoch,
      preserveSelection: true,
    });
  }, base + "Gamma");
  await waitForHeld(d.app);
  await expect(matches.getByRole("option", { selected: true })).toHaveAttribute(
    "title",
    selected!,
  );
  await releaseRequests(d.app);
  await expect(matches.getByRole("option", { selected: true })).toHaveAttribute(
    "title",
    selected!,
  );
  await field.press("Enter");
  await expect
    .poll(
      async () =>
        (await d.request<Snapshot>("state")).entities.find(
          (e) => e.iri === base + "Alpha",
        )?.parents,
    )
    .toEqual([selected]);
});

test("a retained option cannot commit after a new search stops matching it", async ({
  desktop: d,
}) => {
  const field = await resourceField(d);
  await field.fill("Bet");
  await expect(d.page.getByRole("listbox").getByRole("option")).toHaveCount(2);
  await holdRequests(d.app, ["resourceSuggestions"]);
  await field.fill("Gamma");
  // Picked from the retained list after the edit, before Gamma's matches arrive.
  await field.press("ArrowDown");
  await field.press("Enter");
  await waitForHeld(d.app);
  await expect(field).toHaveValue("Gamma");
  await releaseRequests(d.app);
  await expect(field.locator("..").getByRole("alert")).toContainText(
    "no longer available",
  );
  expect(
    (await d.request<Snapshot>("state")).entities.find(
      (e) => e.iri === base + "Alpha",
    )?.parents,
  ).toContain(base + "Beta");
  await d.page
    .getByRole("listbox")
    .getByRole("option", { name: /Gamma/ })
    .click();
  await expect
    .poll(
      async () =>
        (await d.request<Snapshot>("state")).entities.find(
          (e) => e.iri === base + "Alpha",
        )?.parents,
    )
    .toContain(base + "Gamma");
});

for (const action of ["Enter", "Tab"] as const) {
  test(`annotation ${action} waits for current matches before deciding resource versus text`, async ({
    desktop: d,
  }) => {
    const field = await resourceField(d, "seeAlso");
    await field.fill("Bet");
    await expect(d.page.getByRole("listbox").getByRole("option")).toHaveCount(
      3,
    );
    await holdRequests(d.app, ["resourceSuggestions"]);
    await field.fill("Gamma");
    await field.press(action);
    await waitForHeld(d.app);
    await releaseRequests(d.app);
    await expect
      .poll(async () => {
        const document = await d.request<any>("entityDocument", {
          iri: base + "Alpha",
        });
        return document.statements.find((t: any) =>
          t.predicate.endsWith("#seeAlso"),
        )?.object;
      })
      .toEqual({ literal: false, value: base + "Gamma" });
  });
}

test("Escape cancels a resource commit awaiting search and preserves the original statement", async ({
  desktop: d,
}) => {
  const field = await resourceField(d);
  await holdRequests(d.app, ["resourceSuggestions"]);
  await field.fill("Gamma");
  await field.press("Enter");
  await waitForHeld(d.app);
  await field.press("Escape");
  await releaseRequests(d.app);
  await expect(field).toHaveAttribute("title", base + "Beta");
  expect(
    (await d.request<Snapshot>("state")).entities.find(
      (e) => e.iri === base + "Alpha",
    )?.parents,
  ).toContain(base + "Beta");
});

test("editing again replaces a pending resource intent and late replies cannot commit the old value", async ({
  desktop: d,
}) => {
  const field = await resourceField(d);
  await holdRequests(d.app, ["resourceSuggestions"]);
  await field.fill("Gamma");
  await field.press("Enter");
  await waitForHeld(d.app);
  await field.fill("Betamax");
  await field.press("Enter");
  await waitForHeld(d.app, 2);
  await releaseRequests(d.app, { reverse: true });
  await expect
    .poll(
      async () =>
        (await d.request<Snapshot>("state")).entities.find(
          (e) => e.iri === base + "Alpha",
        )?.parents,
    )
    .toEqual([base + "Betamax"]);
});

test("Example orders retains loaded rows and counts and discards an older filter response", async ({
  desktop: d,
}) => {
  await d.menu("file.example");
  const panel = d.page.locator('[data-panel="individuals"]');
  const cells = panel.locator('.ag-row[row-index="0"] [col-id="ref"]');
  await expect(cells).not.toBeEmpty();
  const first = await cells.innerText();
  const summary = await panel.locator(".table-summary > span").innerText();
  await holdRequests(d.app, ["table"]);
  const filter = panel.getByRole("textbox", { name: "Filter individuals" });
  await filter.fill("no-such-order");
  await waitForHeld(d.app);
  await expect(cells).toHaveText(first);
  await expect(panel.locator(".table-summary > span")).toHaveText(summary);
  await filter.fill(first);
  await releaseRequests(d.app);
  await expect(panel.locator(".table-summary > span")).toHaveText(/1 rows \/ /);
  await expect(cells).toHaveText(first);
  await filter.fill("");
  await expect(panel.locator(".table-summary > span")).toHaveText(summary);
});

test("stylesheet validation waits for a pause and keeps the footer fixed", async ({
  desktop: d,
}) => {
  await d.menu("graph.styles");
  const dialog = d.page.getByRole("dialog", {
    name: "Graph stylesheet",
    exact: true,
  });
  const field = dialog.getByRole("textbox", {
    name: "Graph stylesheet",
    exact: true,
  });
  const apply = dialog.getByRole("button", { name: "Apply", exact: true });
  const original = await box(apply);
  const status = dialog.locator(".appearance-validation");
  await field.fill("node {");
  await expect(apply).toBeDisabled();
  await expect(status).toBeEmpty();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(status).not.toBeEmpty();
  expect((await box(apply)).y).toBeCloseTo(original.y, 1);
  await field.fill("node { size: ");
  expect((await box(apply)).y).toBeCloseTo(original.y, 1);
  await field.fill("node { size: 48 }");
  await expect(apply).toBeEnabled();
  await expect(status).toBeEmpty();
  expect((await box(apply)).y).toBeCloseTo(original.y, 1);
  await apply.click();
  await expect
    .poll(async () => (await d.request<Snapshot>("state")).graph.stylesheet)
    .toBe("node { size: 48 }");
});
