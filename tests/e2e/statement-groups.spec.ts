import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { NS, TYPE, SUBCLASS, type Triple } from "../../src/domain/model";
import { parseRdf, writeRdf } from "../../src/domain/rdf-io";
import type { Snapshot } from "../../src/shared/protocol";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";

const base = "https://group.test/";
const aliases = [
  "Exercise Physiology and Wellness",
  "Fitness",
  "GEN PHYS ED",
  "Gym Class",
  "LIFETIME FIT",
  "LIFETIME FITNESS",
  "PE",
  "PE:PE",
  "PHY ED",
  "PHY ED LIFETIME FIT",
  "PHYS CON",
  "PHYS FIT CON",
  "PHYSICAL E",
  "PHYSICAL ED",
  "PHYSICAL EDU",
  "PHYSICAL EDUC",
  "PHYSICAL EDUCA",
  "PHYSICAL EDUCAT",
  "PHYSICAL EDUCATI",
  "PHYSICAL EDUCATIO",
  "Per Well",
];
let app: ElectronApplication, page: Page, profile: string;
let errors: string[];
const details = () =>
  page.getByRole("region", { name: "Details", exact: true });
const group = (predicate: string, root = details()) =>
  root.locator(`tr[data-predicate="${predicate}"]`);
const fields = (row: Locator) => row.locator(".statement-value-field input");
const saved = (predicate: string, subject = "PhysicalEducation") =>
  page.evaluate(
    async ({ predicate, iri }) => {
      const doc = await window.axiom.request<{ statements: Triple[] }>(
        "entityDocument",
        { iri },
      );
      return doc.statements
        .filter((t) => t.predicate === predicate)
        .map((t) => t.object.value);
    },
    { predicate, iri: subject.includes(":") ? subject : base + subject },
  );
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function select(name: string) {
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + name,
  );
}
test.beforeEach(async () => {
  errors = [];
  await mkdir("artifacts/grouped-statements", { recursive: true });
  profile = await mkdtemp(
    path.resolve("artifacts/grouped-statements/profile-"),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.setFocusable(false)),
  );
  await expect(page.locator(".docking-workspace")).toBeVisible();
  const ttl = `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> .
    : a owl:Ontology . :Course a owl:Class; rdfs:label "Course" .
    :Education a owl:Class; rdfs:label "Education"; rdfs:subClassOf :Course .
    :Sports a owl:Class; rdfs:label "Sports"; rdfs:subClassOf :Course .
    :PhysicalEducation a owl:Class; rdfs:label "Physical Education"; rdfs:comment "Exercise and learning"; rdfs:subClassOf :Education, :Sports;
      rdfs:seeAlso ${aliases.map((a) => JSON.stringify(a)).join(", ")}; skos:altLabel "One", "Two", "Three", "Four"; :custom "Only" .
    :Student a owl:NamedIndividual, :PhysicalEducation; rdfs:label "Student" .`;
  const parsed = await parseRdf(ttl, "group.ttl", base);
  const file = path.join(profile, "groups.rdf");
  await writeFile(file, await writeRdf(parsed.triples, "rdfxml"));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.axiom.request<Snapshot>("state")))
          .ontology.name,
    )
    .toBe("groups.rdf");
  await select("PhysicalEducation");
  await menu("view.details");
  await expect(group(NS.rdfs + "seeAlso")).toBeVisible();
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && page && !page.isClosed())
      await info.attach("grouped-editor", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
  }
});

test("21 values use one predicate, three fields and independent expansion within the height budget", async () => {
  const row = group(NS.rdfs + "seeAlso"),
    other = group(NS.skos + "altLabel");
  await expect(row).toHaveCount(1);
  await expect(row.locator("select")).toHaveCount(1);
  await expect(fields(row)).toHaveCount(3);
  await expect(row.locator(".statement-value-count")).toHaveText("21");
  const metrics = await row.evaluate((el) => {
    const stack = el.querySelector(".statement-value-stack")!;
    const style = getComputedStyle(stack);
    return {
      height: el.getBoundingClientRect().height,
      overflow: style.overflowY,
      background: style.backgroundColor,
      top: getComputedStyle(el.children[0]).verticalAlign,
    };
  });
  expect(metrics.height).toBeGreaterThanOrEqual(130);
  expect(metrics.height).toBeLessThanOrEqual(135);
  expect(metrics.overflow).toBe("visible");
  expect(metrics.background).toBe("rgba(0, 0, 0, 0)");
  expect(metrics.top).toBe("top");
  await writeFile(
    "artifacts/grouped-statements/details-geometry.json",
    JSON.stringify(metrics, null, 2),
  );
  await row.screenshot({
    path: "artifacts/grouped-statements/details-group.png",
  });
  await details()
    .locator(".ancestry")
    .screenshot({ path: "artifacts/grouped-statements/ancestry.png" });
  await row.getByRole("button", { name: "18 more", exact: true }).click();
  await expect(fields(row)).toHaveCount(21);
  expect(
    await fields(row).evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value),
    ),
  ).toEqual(aliases);
  await expect(row.locator(".statement-value-count")).toHaveCount(0);
  await expect(fields(other)).toHaveCount(3);
  await row.getByRole("button", { name: "Show fewer", exact: true }).click();
  await expect(fields(row)).toHaveCount(3);
  await expect(
    details().locator("table textarea, table [draggable=true]"),
  ).toHaveCount(0);
  await expect(
    group(NS.rdfs + "label").getByRole("button", {
      name: "+ Add value",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    group(NS.rdfs + "comment").getByRole("button", {
      name: "+ Add value",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("adding, editing and removing one value preserves order through save and reload", async () => {
  const row = group(NS.rdfs + "seeAlso");
  await row.getByRole("button", { name: "+ Add value", exact: true }).click();
  await expect(fields(row)).toHaveCount(22);
  await expect(fields(row).last()).toBeFocused();
  await expect(row.locator("select")).toHaveCount(1);
  await fields(row).last().fill("Zulu:PE,PE <A&B>");
  await fields(row).last().press("Tab");
  await expect
    .poll(() => saved(NS.rdfs + "seeAlso"))
    .toEqual([...aliases, "Zulu:PE,PE <A&B>"]);
  await fields(row).nth(1).fill("Fitness changed");
  await fields(row).nth(1).press("Tab");
  const expected = [...aliases, "Zulu:PE,PE <A&B>"];
  expected[1] = "Fitness changed";
  await expect.poll(() => saved(NS.rdfs + "seeAlso")).toEqual(expected);
  await row
    .getByRole("button", {
      name: "Remove this rdfs:seeAlso value",
      exact: true,
    })
    .nth(2)
    .click();
  expected.splice(2, 1);
  await expect.poll(() => saved(NS.rdfs + "seeAlso")).toEqual(expected);
  await select("Sports");
  await expect(group(NS.rdfs + "seeAlso")).toHaveCount(0);
  await select("PhysicalEducation");
  await row.getByRole("button", { name: "18 more", exact: true }).click();
  expect(
    await fields(row).evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value),
    ),
  ).toEqual(expected);

  await expect(
    details().getByRole("textbox", { name: /^Source for / }),
  ).toBeVisible();
  const source = await page.evaluate(
    (iri) => window.axiom.request<{ text: string }>("entitySource", { iri }),
    base + "PhysicalEducation",
  );
  const parsed = await parseRdf(source.text, "source.rdf", base);
  expect(
    parsed.triples
      .filter((t) => t.predicate === NS.rdfs + "seeAlso")
      .map((t) => t.object.value),
  ).toEqual(expected);
});

test("single value actions take no extra line and keyboard removal removes the last statement", async () => {
  const row = group(base + "custom");
  await fields(row).first().scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const add = row.getByRole("button", { name: "+ Add value", exact: true });
  await expect(add).toHaveCSS("opacity", "0");
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(39);
  await fields(row).first().focus();
  await expect(add).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab");
  await expect(
    row.getByRole("button", { name: "Remove this custom value", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(fields(row)).toHaveCount(2);
  await expect(fields(row).last()).toBeFocused();
  await fields(row).last().fill("Second");
  await fields(row).last().press("Tab");
  await expect.poll(() => saved(base + "custom")).toEqual(["Only", "Second"]);
  await expect(details().locator(".phead .state.clean")).toHaveText("Saved");
  await expect(
    row
      .getByRole("button", { name: "Remove this custom value", exact: true })
      .last(),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(fields(row)).toHaveCount(1);
  await expect(fields(row).first()).toHaveValue("Only");
  await fields(row).first().focus();
  await page.keyboard.press("Tab");
  await expect(
    row.getByRole("button", { name: "Remove this custom value", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row).toHaveCount(0);
  await expect.poll(() => saved(base + "custom")).toEqual([]);
});

test("ancestry peers are separate cards and an individual has one rdf:type row", async () => {
  const peers = details().locator(".ancestry-peers");
  await expect(peers).toHaveCount(1);
  await expect(peers.locator(".ancestry-crumb")).toHaveCount(2);
  await expect(
    details().locator(".ancestry-group, .ancestry-group-label"),
  ).toHaveCount(0);
  expect(
    await peers.evaluate((el) => ({
      border: getComputedStyle(el).borderLeftStyle,
      otherBorders: [
        getComputedStyle(el).borderTopWidth,
        getComputedStyle(el).borderRightWidth,
        getComputedStyle(el).borderBottomWidth,
      ],
      background: getComputedStyle(el).backgroundColor,
    })),
  ).toEqual({
    border: "solid",
    otherBorders: ["0px", "0px", "0px"],
    background: "rgba(0, 0, 0, 0)",
  });
  await select("Student");
  const types = group(TYPE);
  await expect(types).toHaveCount(1);
  await expect(fields(types)).toHaveCount(2);
  await expect(types.locator("select")).toHaveCount(0);
  await expect(
    types.getByRole("button", { name: "+ Add value", exact: true }),
  ).toHaveCount(0);
  await expect(group(SUBCLASS)).toHaveCount(0);
});

test("keyboard traversal reaches each field, remove action, add action and expansion", async () => {
  const row = group(NS.rdfs + "seeAlso");
  await fields(row).first().focus();
  for (let i = 0; i < 3; i++) {
    await expect(fields(row).nth(i)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      row
        .getByRole("button", {
          name: "Remove this rdfs:seeAlso value",
          exact: true,
        })
        .nth(i),
    ).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await expect(
    row.getByRole("button", { name: "+ Add value", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    row.getByRole("button", { name: "18 more", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(fields(row)).toHaveCount(21);
  await fields(row).first().focus();
  for (let i = 0; i < 21; i++) {
    await expect(fields(row).nth(i)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      row
        .getByRole("button", {
          name: "Remove this rdfs:seeAlso value",
          exact: true,
        })
        .nth(i),
    ).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Tab");
  await expect(
    row.getByRole("button", { name: "Show fewer", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(fields(row)).toHaveCount(3);
});

test("removing a newly entered value while its save reply is pending keeps it removed", async () => {
  const row = group(base + "custom");
  await holdRequests(app, ["updateEntity"]);
  await row.getByRole("button", { name: "+ Add value", exact: true }).click();
  await fields(row).last().fill("Pending value");
  await fields(row).last().press("Tab");
  await waitForHeld(app);
  await row
    .getByRole("button", { name: "Remove this custom value", exact: true })
    .last()
    .press("Enter");
  await releaseRequests(app);
  await expect.poll(() => saved(base + "custom")).toEqual(["Only"]);
  await expect(fields(row)).toHaveCount(1);
  await expect(fields(row).first()).toHaveValue("Only");
});

test("Find adds and saves more than 100 values without a statement limit", async () => {
  test.setTimeout(120000);
  await menu("view.find");
  const pane = page.getByRole("region", { name: "Find entities results" });
  await pane
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Many Grouped Values");
  const create = pane.getByRole("region", { name: "Add to the ontology" });
  await create.getByRole("button", { name: "+ Add row", exact: true }).click();
  await create
    .getByRole("combobox", { name: "Predicate 1", exact: true })
    .selectOption(NS.rdfs + "seeAlso");
  const row = group(NS.rdfs + "seeAlso", create);
  const values = Array.from(
    { length: 101 },
    (_, i) => `Value ${101 - i}:PE,PE`,
  );
  for (const [i, value] of values.entries()) {
    if (i)
      await row
        .getByRole("button", { name: "+ Add value", exact: true })
        .click();
    if (i) await expect(fields(row).last()).toBeFocused();
    await fields(row).last().fill(value);
  }
  await expect(
    create.getByRole("button", { name: "+ Add row", exact: true }),
  ).toBeEnabled();
  const createdIri = await create
    .getByRole("textbox", { name: "Subject IRI", exact: true })
    .inputValue();
  await create
    .getByRole("button", { name: "Create class", exact: true })
    .click();
  await expect
    .poll(async () =>
      (
        await page.evaluate(() => window.axiom.request<Snapshot>("state"))
      ).entities.some((e) => e.iri === createdIri),
    )
    .toBe(true);
  await expect
    .poll(() => saved(NS.rdfs + "seeAlso", createdIri))
    .toEqual(values);
});

test("Find values share one predicate, source keeps delimiters and parents use individual fields", async () => {
  await menu("view.find");
  const pane = page.getByRole("region", { name: "Find entities results" });
  await pane
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Unlisted Grouped Subject");
  const create = pane.getByRole("region", { name: "Add to the ontology" });
  await expect(create).toBeVisible();
  await create.getByRole("button", { name: "+ Add row", exact: true }).click();
  await create
    .getByRole("combobox", { name: "Predicate 1", exact: true })
    .selectOption(NS.rdfs + "seeAlso");
  const row = group(NS.rdfs + "seeAlso", create);
  const values = ["PE:PE", "A,B;C|D", "<Course>&Fitness", "Final"];
  for (const [i, value] of values.entries()) {
    if (i)
      await row
        .getByRole("button", { name: "+ Add value", exact: true })
        .click();
    await fields(row).nth(i).fill(value);
  }
  await row.getByRole("button", { name: "Show fewer", exact: true }).click();
  await expect(fields(row)).toHaveCount(3);
  await expect(
    row.getByRole("button", { name: "1 more", exact: true }),
  ).toBeVisible();
  const height = (await row.boundingBox())!.height;
  expect(height).toBeGreaterThanOrEqual(130);
  expect(height).toBeLessThanOrEqual(135);
  await writeFile(
    "artifacts/grouped-statements/find-geometry.json",
    JSON.stringify({ height }, null, 2),
  );
  const parent = group(SUBCLASS, create);
  await fields(parent).first().fill("Education");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Education/ })
    .first()
    .click();
  await parent
    .getByRole("button", { name: "+ Add value", exact: true })
    .click();
  await expect(fields(parent)).toHaveCount(2);
  await expect(fields(parent).last()).toBeFocused();
  await fields(parent).last().fill("Sports");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Sports/ })
    .first()
    .click();
  await expect(fields(parent).first()).toHaveValue("Education");
  await expect(fields(parent).last()).toHaveValue("Sports");
  await create.getByRole("button", { name: "Source", exact: true }).click();
  const source = create.getByLabel("RDF/XML source");
  await expect(source).toContainText("&lt;Course&gt;&amp;Fitness");
  const parsed = await parseRdf(
    (await source.textContent())!,
    "source.rdf",
    base,
  );
  expect(
    parsed.triples
      .filter((t) => t.predicate === NS.rdfs + "seeAlso")
      .map((t) => t.object.value),
  ).toEqual(values);
  await row.screenshot({
    path: "artifacts/grouped-statements/find-grouped.png",
  });
  const createdIri = await create
    .getByRole("textbox", { name: "Subject IRI", exact: true })
    .inputValue();
  await create
    .getByRole("button", { name: "Create class", exact: true })
    .click();
  await expect
    .poll(async () =>
      (
        await page.evaluate(() => window.axiom.request<Snapshot>("state"))
      ).entities.some((e) => e.iri === createdIri),
    )
    .toBe(true);
  await expect
    .poll(() => saved(NS.rdfs + "seeAlso", createdIri))
    .toEqual(values);
  await expect
    .poll(() => saved(SUBCLASS, createdIri))
    .toEqual([base + "Education", base + "Sports"]);
});
