// craigtrim/axiom#93: Find hands class and individual drafts to the shared authoring view.
import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { NS, THING } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import {
  holdRequests,
  waitForHeld,
  releaseRequests,
  requestCount,
} from "./held-requests";
const base = "https://example.test/find-design#";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const pane = () => page.getByRole("region", { name: "Find entities results" });
const query = () =>
  pane().getByRole("searchbox", { name: "Search the ontology" });
const create = () =>
  page.getByRole("region", { name: "Add entity view", exact: true });
const snapshot = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function openFixture(name = "find-design.ttl", turtle?: string) {
  const file = path.join(profile, name);
  await writeFile(
    file,
    turtle ??
      `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> . @prefix skos: <${NS.skos}> .
    : a owl:Ontology . :Root a owl:Class; rdfs:label "Foundation" .
    :Target a owl:Class; rdfs:label "Ocean Studies"; rdfs:subClassOf :Root; rdfs:comment "Saffron manuscripts"; skos:altLabel "Marine Science" .
    :Prop a owl:ObjectProperty; rdfs:label "Public Property" .
    :student a owl:NamedIndividual, :Target; rdfs:label "Ada Scholar" .
    ${Array.from({ length: 34 }, (_, i) => `:Topic${i} a owl:Class; rdfs:label "Topic ${String(i).padStart(2, "0")}"; rdfs:subClassOf :Root .`).join("\n")}`,
  );
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
  await expect.poll(async () => (await snapshot()).ontology.name).toBe(name);
}
async function miss(text = "Zygomorphic Architecture") {
  await query().fill(text);
  await expect(
    pane().getByRole("button", { name: "Add entity", exact: true }),
  ).toBeVisible();
  await pane().getByRole("button", { name: "Add entity", exact: true }).click();
  await expect(
    create().getByRole("textbox", { name: "Name", exact: true }),
  ).toBeVisible();
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/find-design-"));
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    });
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await openFixture();
  await expect
    .poll(async () => {
      if (!(await pane().isVisible())) await menu("view.find");
      return pane().isVisible();
    })
    .toBe(true);
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
  }
});

// craigtrim/axiom#147: the folded value survives every width and returns with the column.
test("Type folds throughout Narrow and returns beyond its width hysteresis", async () => {
  await query().fill("Ocean Studies");
  const table = pane().getByRole("table", { name: "Found entities" });
  await expect(table.locator("tbody tr")).toHaveCount(1);
  const host = page.locator('[data-pane-id="find"]');
  const resize = async (width: number, height = 560) => {
    await host.evaluate(
      (el, size) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "20px",
          top: "50px",
          zIndex: "1000",
          width: size.width + "px",
          height: size.height + "px",
        }),
      { width, height },
    );
  };
  for (const width of [440, 320, 600, 615]) {
    await resize(width);
    await expect(host).toHaveAttribute("data-pane-narrow", "true");
    await expect(
      table.getByRole("columnheader", { name: "Type", exact: true }),
    ).toHaveCount(0);
    await expect(table.locator(".find-type-column:visible")).toHaveCount(0);
    await expect(table.locator(".find-folded-type")).toHaveText("Type Class");
    await expect(table.locator(".find-folded-type")).toBeVisible();
    await expect(table.locator(".find-folded-synonyms")).toContainText(
      "Marine Science",
    );
    await expect(query()).toHaveValue("Ocean Studies");
    // Issue 156: even hidden columns are absent from the Narrow table structure.
    await expect(table.locator("thead th")).toHaveCount(1);
    await expect(table.locator("tbody td")).toHaveCount(1);
    expect((await table.locator("tbody td").boundingBox())!.width).toBe(
      (await table.boundingBox())!.width,
    );
  }
  for (const [width, height] of [
    [616, 560],
    [860, 320],
    [860, 560],
  ]) {
    await resize(width, height);
    await expect(host).toHaveAttribute("data-pane-narrow", "false");
    await expect(
      table.getByRole("columnheader", { name: "Type", exact: true }),
    ).toBeVisible();
    await expect(table.locator(".find-folded-type")).toBeHidden();
    await expect(table.locator("td.find-type-column")).toHaveText("Class");
    expect(
      (await table.locator("td.find-extend-column").boundingBox())!.width,
    ).toBe(148);
  }
  await resize(440, 300);
  await expect(host).toHaveAttribute("data-pane-shallow", "true");
  await expect(table.locator(".find-folded-type")).toBeVisible();
  await expect(table.locator(".find-type-column:visible")).toHaveCount(0);
  await expect(table.locator("tbody td")).toHaveCount(1);
  await query().fill("Public Property");
  await expect(
    table
      .locator("tbody tr")
      .filter({
        has: page.getByRole("button", { name: "Public Property", exact: true }),
      })
      .locator(".find-folded-type"),
  ).toHaveText("Type Object property");
});

async function narrowResults() {
  await query().fill("Topic");
  const table = pane().getByRole("table", { name: "Found entities" });
  await expect(table.locator("tbody tr")).toHaveCount(34);
  await page.locator('[data-pane-id="find"]').evaluate((el) =>
    Object.assign((el as HTMLElement).style, {
      position: "fixed",
      left: "24px",
      top: "24px",
      width: "502px",
      height: "560px",
      zIndex: "1000",
    }),
  );
  await expect(pane()).toHaveAttribute("data-layout", "narrow");
  await query().focus();
  await page.mouse.move(0, 0);
  return table;
}

// Issue 156: controls reveal out of flow on a fine pointer and in flow on touch.
test("Narrow row controls reveal without moving or resizing any row", async () => {
  const table = await narrowResults();
  const row = table.locator("tbody tr").first();
  const cluster = row.locator(".entity-extend");
  const bounds = () =>
    table.locator("tbody tr").evaluateAll((rows) =>
      rows.map((r) => {
        const b = r.getBoundingClientRect();
        return [b.x, b.y, b.width, b.height];
      }),
    );
  const initial = await bounds();
  await expect(cluster).toBeHidden();
  const cell = (await row.locator("td").boundingBox())!;
  const name = (await row.locator(".find-result-name").boundingBox())!;
  expect(name.width).toBe(cell.width - 16);
  await row.hover();
  await expect(cluster).toBeVisible();
  expect(await bounds()).toEqual(initial);
  const overlay = (await cluster.boundingBox())!;
  expect(overlay.y).toBeGreaterThanOrEqual(name.y + name.height);
  expect(overlay.x + overlay.width).toBeCloseTo(cell.x + cell.width - 8, 1);
  expect(
    await cluster.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(
    await row
      .locator("td")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  await page.mouse.move(0, 0);
  await row.focus();
  await expect(cluster).toBeVisible();
  expect(await bounds()).toEqual(initial);
  await row.press("Space");
  await query().focus();
  await expect(row).toHaveAttribute("data-selected", "true");
  await expect(cluster).toBeVisible();
  expect(await bounds()).toEqual(initial);
  expect(
    await cluster.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(
    await row
      .locator("td")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  const trigger = cluster.locator(".ext-more");
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(await bounds()).toEqual(initial);
  await pane().screenshot({ path: "artifacts/issue-156-narrow.png" });
  await trigger.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /^Subclass/ })).toBeFocused();
  await page.locator('[data-pane-id="find"]').evaluate((el) => {
    (el as HTMLElement).style.width = "616px";
  });
  await expect(pane()).toHaveAttribute("data-layout", "expanded");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Subclass/ })).toBeFocused();
  await page.locator('[data-pane-id="find"]').evaluate((el) => {
    (el as HTMLElement).style.width = "500px";
  });
  await expect(pane()).toHaveAttribute("data-layout", "narrow");
  await expect(page.getByRole("menuitem", { name: /^Subclass/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row.locator(".ext-more")).toBeFocused();
  await page.locator('[data-pane-id="find"]').evaluate((el) => {
    (el as HTMLElement).style.width = "616px";
  });
  await expect(pane()).toHaveAttribute("data-layout", "expanded");
  await expect(row.locator(".ext-more")).toBeFocused();
  await query().focus();
  await page.locator('[data-pane-id="find"]').evaluate((el) => {
    (el as HTMLElement).style.width = "500px";
  });
  await expect(pane()).toHaveAttribute("data-layout", "narrow");
  await expect(query()).toBeFocused();
});

test("Narrow touch controls occupy a visible line below Synonym", async () => {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
  ).toBe(true);
  const table = await narrowResults();
  for (const row of await table.locator("tbody tr").all()) {
    const cluster = row.locator(".entity-extend");
    await expect(cluster).toBeVisible();
    await expect(row.locator("td")).toHaveCount(1);
    const synonym = (await row.locator(".find-folded-synonyms").boundingBox())!;
    const actions = (await cluster.boundingBox())!;
    const cell = (await row.locator("td").boundingBox())!;
    expect(actions.y).toBeGreaterThanOrEqual(synonym.y + synonym.height);
    expect(actions.y + actions.height).toBeLessThanOrEqual(
      cell.y + cell.height,
    );
  }
  await table.locator("tbody tr").first().locator(".ext-more").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await pane().screenshot({ path: "artifacts/issue-156-touch.png" });
});

test("empty queries show instructions and retain field and type totals (#83)", async () => {
  await expect(query()).toHaveValue("");
  const empty = async () => {
    await expect(pane().locator(".find-results tbody tr")).toHaveCount(0);
    await expect(pane().locator(".find-empty")).toHaveText(
      "Type to search names, aliases and IRIs.",
    );
    await expect(pane().locator(".find-summary")).toHaveText("");
    await expect(pane()).toContainText("Page 0 of 0");
    await expect(pane().locator(".find-zero")).toHaveCount(0);
    await expect(
      pane().getByRole("button", { name: "Open results in new graph" }),
    ).toHaveCount(0);
    expect(
      Number(
        await pane().locator(".find-type-facets .c").first().textContent(),
      ),
    ).toBeGreaterThan(0);
    expect(
      Number(
        (await pane()
          .locator(".find-field-facets .c")
          .first()
          .textContent())!.replaceAll(",", ""),
      ),
    ).toBeGreaterThan(0);
  };
  await empty();
  await query().fill("   ");
  await empty();
  await query().fill("Topic");
  await expect(pane().locator(".find-results tbody tr").first()).toBeVisible();
  await pane().getByRole("button", { name: "Clear", exact: true }).click();
  await empty();
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "Clear", exact: true }).click();
  await query().fill("Foundation");
  await expect(
    pane().getByRole("table", { name: "Found entities" }),
  ).toHaveCount(0);
  await expect(pane()).toContainText("Page 0 of 0");
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  const row = pane().locator(".find-results tbody tr").first();
  await row.focus();
  await row.press("Space");
  await expect(row).toHaveAttribute("data-selected", "true");
  const inspector = pane().getByRole("region", { name: "Selected entity" });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("no parent recorded");
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await expect(pane().locator(".find-selected-details")).toContainText(
    "none recorded",
  );
  await pane()
    .getByRole("dialog", { name: "More", exact: true })
    .press("Escape");
  await query().fill("No matching entity");
  await expect(pane().locator(".find-inspector")).toHaveCount(0);
});

test("unchecked field counts predict remedies while the separate draft survives widening", async () => {
  await miss("Saffron manuscripts");
  await create()
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Hand Edited Draft");
  await create()
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Keep this comment");
  await menu("view.find");
  const facet = pane().getByRole("checkbox", {
    name: "rdfs:comment",
    exact: true,
  });
  const scope = pane().getByRole("button", { name: /^Search scope:/ });
  if (await scope.isVisible()) await scope.click();
  await expect(facet).not.toBeChecked();
  await expect(facet.locator("..")).toContainText("1");
  if (await scope.isVisible()) await facet.press("Escape");
  await pane()
    .getByRole("button", { name: /Search all \d+ fields 1 match/ })
    .click();
  await expect(pane().locator(".find-results tbody tr")).toHaveCount(1);
  await expect(pane().locator(".find-match-evidence")).toContainText(
    "matched in rdfs:comment",
  );
  await menu("view.textentities");
  await expect(
    create().getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Hand Edited Draft");
  await expect(
    create().getByRole("textbox", { name: "Comment", exact: true }),
  ).toHaveValue("Keep this comment");
});
test("Find query changes do not rewrite the form and reopening starts the newly selected phrase", async () => {
  await miss("NEW ZYGOMORPHIC DRAFT");
  await expect(
    create().getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("New Zygomorphic Draft");
  await expect(create()).toContainText(
    "from your search NEW ZYGOMORPHIC DRAFT, title cased once when this view opened",
  );
  await create()
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("my Manual spelling");
  await menu("view.find");
  await query().fill("SECOND ZYGOMORPHIC DRAFT");
  await menu("view.textentities");
  await expect(
    create().getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("my Manual spelling");
  await menu("view.find");
  await pane().getByRole("button", { name: "Add entity", exact: true }).click();
  await expect(
    create().getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Second Zygomorphic Draft");
});
// Issue 157: the shared Find draft previews canonical names and their automatic synonym.
for (const label of ["Law & Society", "Law and Society"]) {
  test(`Find previews and saves the ampersand synonym for ${label}`, async () => {
    await miss(label);
    await create()
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(label);
    const source = create().getByLabel("Planned source");
    await expect(source).toContainText("LawAndSociety");
    await expect(source).toContainText("Law and Society");
    await expect(source).toContainText("Law &amp; Society");
    await create().getByRole("button", { name: "Create", exact: true }).click();
    const iri = base + "LawAndSociety";
    await expect
      .poll(
        async () =>
          (await snapshot()).entities.find((e) => e.iri === iri)?.label,
      )
      .toBe("Law and Society");
    const doc = await page.evaluate(
      (iri) => window.axiom.request<any>("entityDocument", { iri }),
      iri,
    );
    expect(
      doc.statements.filter((t: any) => t.predicate === NS.rdfs + "seeAlso"),
    ).toEqual([
      expect.objectContaining({
        object: expect.objectContaining({
          literal: true,
          value: "Law & Society",
        }),
      }),
    ]);
    await create()
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Another draft");
    await create()
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Law & Society");
    await expect(
      create().getByRole("button", { name: "Create", exact: true }),
    ).toBeDisabled();
    await expect(create().locator(".vmsg")).toContainText("already exists");
  });
}

test("hidden class aliases and occupied properties block creation across Find scopes", async () => {
  await miss();
  const name = create().getByRole("textbox", { name: "Name", exact: true }),
    save = create().getByRole("button", { name: "Create", exact: true });
  await name.fill("Marine Science");
  await expect(create().locator(".vmsg")).toContainText(
    "A class named Ocean Studies already exists.",
  );
  await expect(save).toBeDisabled();
  await create()
    .getByRole("button", { name: "Reveal Ocean Studies", exact: true })
    .click();
  await expect(pane().locator('tr[data-selected="true"]')).toContainText(
    "Ocean Studies",
  );
  await menu("view.textentities");
  await name.fill("prop");
  await expect(create().locator(".vmsg")).toContainText(
    "occupied by an object property",
  );
  await expect(save).toBeDisabled();
});
test("a Find draft creates nested parents, comments and whole aliases with one Undo", async () => {
  const before = await snapshot();
  await miss();
  const parent = create().getByRole("combobox", {
    name: "Add a parent",
    exact: true,
  });
  await parent.fill("New Foundation");
  await create()
    .getByRole("option", { name: /^Draft a new parent named New Foundation/ })
    .click();
  const nested = create().getByRole("combobox", {
    name: "Parent for New Foundation",
    exact: true,
  });
  await nested.fill("Foundation");
  await create()
    .getByRole("option")
    .filter({ hasText: /^Foundation/ })
    .click();
  await create()
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("A < B & quoted");
  await create()
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("Culture, Media Studies");
  await create()
    .getByRole("button", { name: "Create both", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await snapshot()).entities.some((e) => e.label === "New Foundation"),
    )
    .toBe(true);
  expect((await snapshot()).version).toBe(before.version + 1);
  const entity = (await snapshot()).entities.find(
    (e) => e.label === "Zygomorphic Architecture",
  )!;
  expect(entity.parents).toEqual([base + "NewFoundation"]);
  expect(entity.comment).toBe("A < B & quoted");
  const doc = await page.evaluate(
    (iri) => window.axiom.request<any>("entityDocument", { iri }),
    entity.iri,
  );
  expect(doc.statements).toContainEqual(
    expect.objectContaining({
      predicate: NS.skos + "altLabel",
      object: expect.objectContaining({
        value: "Culture, Media Studies",
        literal: true,
      }),
    }),
  );
  await menu("edit.undo");
  await expect
    .poll(async () => (await snapshot()).tripleCount)
    .toBe(before.tripleCount);
  await menu("edit.redo");
  await expect
    .poll(async () =>
      (await snapshot()).entities.some((e) => e.iri === entity.iri),
    )
    .toBe(true);
});
test("creation rejects stale versions and epochs before any write", async () => {
  const before = await snapshot();
  for (const change of [
    { version: before.version - 1 },
    { datasetEpoch: before.datasetEpoch - 1 },
  ]) {
    const message = await page.evaluate(
      async (args) => {
        try {
          await window.axiom.request("addEntityCreate", args);
          return "unexpected success";
        } catch (e) {
          return (e as Error).message;
        }
      },
      {
        creation: {
          kind: "class",
          root: { label: "Fresh Draft", comment: "", parents: [] },
        },
        version: before.version,
        datasetEpoch: before.datasetEpoch,
        ...change,
      },
    );
    expect(message).toContain("ontology changed");
  }
  expect((await snapshot()).tripleCount).toBe(before.tripleCount);
  expect((await snapshot()).version).toBe(before.version);
});
test("dataset replacement clears the old form and its created marker", async () => {
  await miss();
  await create().getByRole("button", { name: "Create", exact: true }).click();
  await expect(create().locator(".foot")).toContainText(
    "created, and selected in Hierarchy",
  );
  await openFixture(
    "replacement.ttl",
    `@prefix : <https://example.test/replacement#> . @prefix owl: <${NS.owl}> . : a owl:Ontology . :Replacement a owl:Class .`,
  );
  await menu("view.textentities");
  await expect(
    create().getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("");
  await expect(create().locator(".foot")).not.toContainText(
    "created, and selected in Hierarchy",
  );
});
