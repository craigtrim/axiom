// Issue 164 exercises grouped drafts through the native form and saved workspace.
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NS } from "../../src/domain/model";
import { addEntityPredicates } from "../../src/shared/add-entity";
import {
  launchAddEntity,
  addEntityMenu,
  type AddEntityFixture,
} from "./add-entity-reference-fixture";

let f: AddEntityFixture;
const group = (predicate: string) =>
  f.pane().locator(`.statement-group-row[data-predicate="${predicate}"]`);
const fields = (predicate: string) =>
  group(predicate).getByRole("textbox", { name: "Value", exact: true });
const add = (predicate: string) =>
  group(predicate).getByRole("button", { name: "+ Add value", exact: true });
const alt = NS.skos + "altLabel",
  see = NS.rdfs + "seeAlso";
test.afterEach(async () => {
  await f?.close();
  expect(f?.errors ?? []).toEqual([]);
});

test("grouped values focus, collapse, preview and commit as separate statements", async () => {
  f = await launchAddEntity("light", "Grouped Draft");
  await fields(alt).fill("one, whole");
  await fields(alt).press("Tab");
  await expect(
    group(alt).getByRole("button", { name: "Remove statement" }),
  ).toBeFocused();
  await f.page.keyboard.press("Tab");
  await expect(add(alt)).toBeFocused();
  await f.page.keyboard.press("Enter");
  await expect(fields(alt).nth(1)).toBeFocused();
  await fields(alt).nth(1).fill("second");
  for (const value of ["third", "fourth"]) {
    await add(alt).click();
    await expect(fields(alt).last()).toBeFocused();
    await fields(alt).last().fill(value);
  }
  await group(alt).getByRole("button", { name: "Show fewer" }).click();
  await expect(fields(alt)).toHaveCount(3);
  await expect(
    group(alt).getByRole("button", { name: "1 more" }),
  ).toHaveAttribute("aria-expanded", "false");
  await add(alt).click();
  await expect(fields(alt)).toHaveCount(5);
  await expect(fields(alt).last()).toBeFocused();
  await fields(alt).last().fill("fifth");
  await expect(
    group(alt).getByRole("combobox", { name: "Predicate" }),
  ).toHaveValue(alt);
  await f.pane().getByRole("button", { name: "Add a statement" }).click();
  await expect(fields(see)).toBeFocused();
  await fields(see).fill("https://example.test/one");
  await add(see).click();
  await expect(fields(see).nth(1)).toBeFocused();
  await fields(see).nth(1).fill("https://example.test/two");
  await expect(
    f.pane().locator(".sect2").filter({ hasText: "Additional statements" }),
  ).toContainText("7 with a value");
  const source = f.pane().getByLabel("Planned source");
  await expect(source).toContainText(
    "<skos:altLabel>one, whole</skos:altLabel>",
  );
  expect((await source.textContent())!.match(/<skos:altLabel>/g)).toHaveLength(
    5,
  );
  await f.size(458, 530);
  await expect(group(alt).locator("select")).toHaveCSS("width", "112px");
  await expect(group(alt)).toHaveCSS("padding-left", "90px");
  await f.size();
  await f.pane().getByRole("button", { name: "Create", exact: true }).click();
  const iri = f.fixture.base + "GroupedDraft";
  await expect
    .poll(async () =>
      (await f.state()).entities.some((entity) => entity.iri === iri),
    )
    .toBe(true);
  const document = await f.page.evaluate(
    async (iri) => window.axiom.request<any>("entityDocument", { iri }),
    iri,
  );
  expect(
    document.statements
      .filter((s: any) => s.predicate === alt)
      .map((s: any) => s.object.value),
  ).toEqual(["one, whole", "second", "third", "fourth", "fifth"]);
  expect(
    document.statements
      .filter((s: any) => s.predicate === see)
      .map((s: any) => s.object.value),
  ).toEqual(["https://example.test/one", "https://example.test/two"]);
});

test("unused predicates, merging and final removal keep groups and focus coherent", async () => {
  f = await launchAddEntity("dark", "Merged Draft");
  await fields(alt).fill("original alias");
  for (const predicate of [
    see,
    NS.skos + "prefLabel",
    NS.skos + "definition",
    NS.dc + "source",
  ]) {
    const previous = await f
      .pane()
      .locator(".statement-group-row")
      .evaluateAll((rows) =>
        rows.map((row) => (row as HTMLElement).dataset.predicate),
      );
    await f.pane().getByRole("button", { name: "Add a statement" }).click();
    await expect(fields(predicate)).toBeFocused();
    const options = await group(predicate)
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      );
    expect(options).not.toEqual(expect.arrayContaining(previous));
    for (const occupied of previous) expect(options).not.toContain(occupied);
  }
  await expect(
    f.pane().getByRole("button", { name: "Add a statement" }),
  ).toHaveCount(0);
  await fields(see).fill("merged alias");
  await group(see)
    .getByRole("combobox", { name: "Predicate" })
    .selectOption(alt);
  await expect(group(see)).toHaveCount(0);
  await expect(fields(alt)).toHaveCount(2);
  await expect(fields(alt).nth(0)).toHaveValue("original alias");
  await expect(fields(alt).nth(1)).toHaveValue("merged alias");
  await expect(group(alt).locator("select")).toBeFocused();
  await f.pane().getByRole("button", { name: "Add a statement" }).click();
  await expect(fields(see)).toBeFocused();
  await expect(f.pane().locator(".statement-group-row")).toHaveCount(5);
  for (const predicate of addEntityPredicates) {
    while (await group(predicate).count())
      await group(predicate)
        .getByRole("button", { name: "Remove statement" })
        .first()
        .click();
  }
  await expect(f.pane().locator(".statement-group-row")).toHaveCount(0);
  await expect(
    f.pane().getByRole("button", { name: "Add a statement" }),
  ).toBeFocused();
  await f.page.keyboard.press("Enter");
  await expect(fields(see)).toBeFocused();
});

test("single-value actions follow pointer and keyboard visibility", async () => {
  f = await launchAddEntity("light", "Visibility Draft");
  await f.name().focus();
  await f.page.mouse.move(0, 0);
  await expect(add(alt)).toBeHidden();
  await group(alt).hover();
  await expect(add(alt)).toBeVisible();
  await f.page.mouse.move(0, 0);
  await expect(add(alt)).toBeHidden();
  await group(alt).locator("select").focus();
  await expect(add(alt)).toBeVisible();
  await f.name().focus();
  const cdp = await f.page.context().newCDPSession(f.page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  expect(
    await f.page.evaluate(
      () => matchMedia("(hover: hover) and (pointer: fine)").matches,
    ),
  ).toBe(false);
  await expect(add(alt)).toBeVisible();
  await add(alt).click();
  await f.name().focus();
  await expect(add(alt)).toBeVisible();
  await cdp.detach();
});

test("recovered interleaved values retain flat order and RDF metadata after editing and restart", async () => {
  f = await launchAddEntity("light", "Recovered Draft");
  await addEntityMenu(f.app, "file.save");
  const profile = f.profile,
    file = f.file + ".axiom";
  await f.close();
  expect(f.errors).toEqual([]);
  const saved = JSON.parse(await readFile(file, "utf8"));
  const statements = [
    {
      predicate: alt,
      object: { literal: true, value: "premier", language: "fr" },
    },
    {
      predicate: see,
      object: { literal: false, value: "https://example.test/resource" },
    },
    {
      predicate: alt,
      object: { literal: true, value: "second", datatype: NS.xsd + "string" },
    },
    ...["third", "fourth"].map((value) => ({
      predicate: alt,
      object: { literal: true, value },
    })),
  ];
  saved.editorDrafts.addEntity.root.statements = statements;
  await writeFile(file, JSON.stringify(saved));
  const sessionFile = path.join(profile, "last-session.json");
  const session = JSON.parse(await readFile(sessionFile, "utf8"));
  session.editorDrafts.addEntity.root.statements = statements;
  await writeFile(sessionFile, JSON.stringify(session));
  f = await launchAddEntity("light", "", profile);
  await expect(f.pane().locator(".statement-group-row")).toHaveCount(2);
  await expect(fields(alt)).toHaveCount(3);
  await expect(
    group(alt).getByRole("button", { name: "1 more" }),
  ).toBeVisible();
  await add(alt).click();
  await expect(fields(alt).last()).toBeFocused();
  await fields(alt).last().fill("fifth");
  await fields(alt).first().fill("premier modifié");
  await group(alt)
    .getByRole("button", { name: "Remove statement" })
    .nth(2)
    .click();
  await expect(
    group(alt).getByRole("button", { name: "Remove statement" }).nth(1),
  ).toBeFocused();
  await addEntityMenu(f.app, "file.save");
  await f.close();
  expect(f.errors).toEqual([]);
  const expected = [
    {
      ...statements[0],
      object: { ...statements[0].object, value: "premier modifié" },
    },
    statements[1],
    statements[2],
    statements[4],
    { predicate: alt, object: { literal: true, value: "fifth" } },
  ];
  expect(
    JSON.parse(await readFile(file, "utf8")).editorDrafts.addEntity.root
      .statements,
  ).toEqual(expected);
  f = await launchAddEntity("light", "", profile);
  await expect(fields(alt).first()).toHaveValue("premier modifié");
  const source = (await f.pane().getByLabel("Planned source").textContent())!;
  expect(source).toContain(
    '<skos:altLabel xml:lang="fr">premier modifié</skos:altLabel>',
  );
  expect(source).toContain(
    '<rdfs:seeAlso rdf:resource="https://example.test/resource"/>',
  );
  expect(source.indexOf("premier modifié")).toBeLessThan(
    source.indexOf("https://example.test/resource"),
  );
  expect(source.indexOf("https://example.test/resource")).toBeLessThan(
    source.indexOf(">second<"),
  );
});
