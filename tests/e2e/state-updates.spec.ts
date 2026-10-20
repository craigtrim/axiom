// #125: all ontology panes consume the same incremental entity records.
import { test, expect } from "./modal-fixture";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { schoolBase, schoolOntology } from "../fixtures/large-ontology";
import { NS } from "../../src/domain/model";

test("a label delta refreshes Hierarchy, Find, Individuals and Details", async ({
  desktop: d,
}) => {
  const savedName = async () =>
    JSON.parse(
      await readFile(path.join(d.profile, "last-session.json"), "utf8"),
    ).workspace.ontology.name;
  await expect.poll(() => savedName().catch(() => "")).toBe("modal.ttl");
  await d.load(schoolOntology(4), "delta.ttl");
  await expect.poll(() => savedName().catch(() => "")).toBe("delta.ttl");
  const iri = schoolBase + "School";
  await d.request("select", { iri });
  await d.menu("view.find");
  const find = d.page.getByRole("region", { name: "Find entities results" });
  await find
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("School");
  await expect(
    find.getByRole("button", { name: "School", exact: true }),
  ).toBeVisible();
  await d.page.evaluate(() => {
    (window as any).__entityEvents = [];
    window.axiom.onEvent(({ type, data }) => {
      if (type === "state") (window as any).__entityEvents.push(data);
    });
  });
  const document = await d.request<any>("entityDocument", { iri });
  document.statements.find(
    (t: any) => t.predicate === NS.rdfs + "label",
  ).object.value = "School Revised";
  await d.request("updateEntity", {
    iri,
    nextIri: iri,
    version: document.version,
    datasetEpoch: document.datasetEpoch,
    statements: document.statements,
  });
  const events = await d.page.evaluate(() => (window as any).__entityEvents);
  expect(events.every((e: any) => e.entities === undefined)).toBe(true);
  expect(
    events
      .flatMap((e: any) => e.entityChanges?.changed ?? [])
      .map((e: any) => e.iri),
  ).toEqual([iri]);
  await expect(
    find.getByRole("button", { name: "School Revised", exact: true }),
  ).toBeVisible();
  await d.menu("view.hierarchy");
  await expect(
    d.page.locator(`[role="treeitem"][data-entity-iri="${iri}"] .tree-name`),
  ).toHaveText("School Revised");
  await d.menu("view.individuals");
  const individuals = d.page.getByRole("region", {
    name: "Individuals",
    exact: true,
  });
  await expect(
    individuals.getByLabel("Filter by class").locator(`option[value="${iri}"]`),
  ).toHaveText(/School Revised/);
  await d.menu("view.inspector");
  await expect(
    d.page
      .getByRole("region", { name: "Entity inspector", exact: true })
      .getByRole("textbox", { name: "rdfs:label value 1", exact: true }),
  ).toHaveValue("School Revised");
});
