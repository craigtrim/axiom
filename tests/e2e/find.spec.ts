// Issue 85: Details fields use predicate names and per-group value numbers.
// craigtrim/axiom#91: reveal the narrow Hierarchy filter through More actions.
import { hierarchyFilter } from "./hierarchy-controls";
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
import type { Snapshot } from "../../src/shared/protocol";
import { NS } from "../../src/domain/model";
import { extendBase, extendOntology } from "../fixtures/extend-visual/ontology";
// craigtrim/axiom#111: retained property authoring previews keep source colours.
import { assertCodeBothThemes } from "./syntax-assertions";
const base = "https://example.test/courses#";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const pane = (p = page) =>
  p.getByRole("region", { name: "Find entities results" });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (id === "file.open")
      (globalThis as any).__openingFileMenu = Menu.getApplicationMenu();
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
  // RDF becomes visible before the workspace reset and session checkpoint finish.
  // File > Recent is rebuilt at completion; waiting for it avoids starting the
  // next file operation or quick Find while the previous import still resets UI.
  if (id === "file.open")
    await expect
      .poll(() =>
        app.evaluate(
          ({ Menu }) =>
            Menu.getApplicationMenu() !== (globalThis as any).__openingFileMenu,
        ),
      )
      .toBe(true);
}
async function launch(modelDirectory?: string) {
  const env = {
    ...process.env,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_USER_DATA: profile,
  } as Record<string, string>;
  if (modelDirectory) env.AXIOM_EMBEDDING_MODEL_DIR = modelDirectory;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  app.on("window", (w) => w.on("pageerror", (e) => errors.push(e.message)));
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    });
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
}
async function find(text: string) {
  await menu("entity.search");
  const d = page.getByRole("dialog", { name: "Find entities" });
  const input = d.getByRole("combobox", { name: "Search entities" });
  await expect(input).toBeFocused();
  await input.fill(text);
  await expect(
    d
      .getByRole("listbox", { name: "Matching entities" })
      .getByRole("option")
      .first(),
  ).toBeVisible();
  await input.press("Enter");
  await expect(d).toHaveCount(0);
  await expect(pane()).toBeVisible();
}
async function openMore() {
  const trigger = pane().getByRole("button", { name: "More", exact: true });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
}
async function resultAction(name: string) {
  await openMore();
  await pane().getByRole("button", { name, exact: true }).click();
}
async function setPageSize(value: string) {
  await openMore();
  const input = pane().getByLabel("Results per page");
  await input.selectOption(value);
  await input.press("Escape");
}
async function expectPageSize(value: string) {
  await openMore();
  const input = pane().getByLabel("Results per page");
  await expect(input).toHaveValue(value);
  await input.press("Escape");
}

async function openNetworkFixture() {
  // Keep page-preservation checks lexical; semantic refresh has separate coverage
  // in find-stability (craigtrim/axiom#83).
  await app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", (event, method, args) =>
      method === "findSemantic" ? undefined : original(event, method, args),
    );
  });
  const file = path.join(profile, "networks.ttl");
  await writeFile(
    file,
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    : a owl:Ontology.
    :Course a owl:Class; rdfs:label "Course".
    :NetworkSecurity a owl:Class; rdfs:label "Network Security".
    :Professional a owl:Class; rdfs:label "Professional Certification".
    :BlockedName a owl:Class; rdfs:label "Different Existing Label".
    :Lower a owl:Class; rdfs:label "network qualification".
    ${Array.from({ length: 55 }, (_, i) => `:Network${i} a owl:Class; rdfs:label "Network Topic ${String(i).padStart(2, "0")}".`).join("\n")}`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("networks.ttl");
  await menu("view.find");
  await expect(pane()).toBeVisible();
}

// craigtrim/axiom#93: class and individual doors now open the persistent Add entity form.
const addForm = () =>
  page.getByRole("region", { name: "Add entity view", exact: true });
for (const chosenParent of [false, true])
  test(`near-match Add entity preserves results and creates with ${chosenParent ? "Course" : "Thing"}`, async () => {
    await openNetworkFixture();
    await pane()
      .getByRole("searchbox", { name: "Search the ontology" })
      .fill("Network Certification");
    await setPageSize("25");
    await pane()
      .getByRole("button", { name: "Next results page", exact: true })
      .click();
    await expect(pane().locator(".pg")).toHaveText("Page 2 of 3");
    const table = pane().locator(".find-results");
    await table.locator("tbody tr").nth(3).locator(".find-result-name").click();
    const before = await table.innerText();
    await pane()
      .getByRole("button", {
        name: 'Add "Network Certification" as a new class',
        exact: true,
      })
      .click();
    const form = addForm();
    await expect(
      form.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue("Network Certification");
    await form
      .getByRole("textbox", { name: "Comment", exact: true })
      .fill("Retained draft description");
    await menu("view.find");
    expect(await table.innerText()).toBe(before);
    await expect(pane().locator(".pg")).toHaveText("Page 2 of 3");
    await menu("view.textentities");
    await expect(
      form.getByRole("textbox", { name: "Comment", exact: true }),
    ).toHaveValue("Retained draft description");
    if (chosenParent) {
      await form
        .getByRole("combobox", { name: "Add a parent", exact: true })
        .fill("Course");
      await form
        .getByRole("option")
        .filter({ hasText: /^Course/ })
        .first()
        .click();
    }
    await form.getByRole("button", { name: "Create", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await state()).entities.find(
            (e) => e.label === "Network Certification",
          )?.parents,
      )
      .toEqual([chosenParent ? base + "Course" : NS.owl + "Thing"]);
    const entity = (await state()).entities.find(
      (e) => e.label === "Network Certification",
    )!;
    expect(entity.comment).toBe("Retained draft description");
    await menu("edit.undo");
    await expect
      .poll(async () =>
        (await state()).entities.some((e) => e.iri === entity.iri),
      )
      .toBe(false);
    await menu("edit.redo");
    await expect
      .poll(async () =>
        (await state()).entities.some((e) => e.iri === entity.iri),
      )
      .toBe(true);
  });
test("Find offers authoring for a near match and Add entity blocks normalized duplicates", async () => {
  await openNetworkFixture();
  const query = pane().getByRole("searchbox", { name: "Search the ontology" });
  for (const [text, label] of [
    ["Network Security", "Network Security"],
    ["Blocked Name", "Different Existing Label"],
  ]) {
    await query.fill(text);
    await expect(
      pane().getByRole("button", {
        name: label + " already exists",
        exact: true,
      }),
    ).toBeDisabled();
  }
  await query.fill("Network Qualification");
  await pane()
    .getByRole("button", {
      name: 'Add "Network Qualification" as a new class',
      exact: true,
    })
    .click();
  await expect(addForm().locator(".vmsg")).toContainText(
    "network qualification already exists",
  );
  await expect(
    addForm().getByRole("button", { name: "Create", exact: true }),
  ).toBeDisabled();
  await menu("view.find");
  await query.fill("asdfasdf");
  await expect(
    pane().getByRole("button", { name: "Add entity", exact: true }),
  ).toBeVisible();
  await expect(pane().locator(".find-result-actions")).toHaveCount(0);
});

async function types(selected: string[]) {
  for (const label of ["Classes", "Instances", "Properties", "Other entities"])
    await pane()
      .getByRole("checkbox", { name: label, exact: true })
      .setChecked(selected.includes(label));
}

async function openExtendFixture(extra = "") {
  const file = path.join(profile, "extend.ttl");
  await writeFile(file, extendOntology + extra);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("extend.ttl");
  await menu("view.find");
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Psy");
  await expect(pane().locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
const extendRow = (name: string) =>
  pane()
    .locator(".find-results tbody tr")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
async function extendMenu(name: string) {
  const row = extendRow(name);
  await row.hover();
  const trigger = row.getByRole("button", {
    name: `More ways to extend ${name}`,
    exact: true,
    includeHidden: true,
  });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return trigger;
}

for (const [target, door, noun, predicate, kind] of [
  ["Psychology", "Subclass", "class", NS.rdfs + "subClassOf", "Class"],
  ["Psychology", "Instance", "individual", NS.rdf + "type", "Individual"],
  [
    "teaches",
    "Subproperty",
    "property",
    NS.rdfs + "subPropertyOf",
    "ObjectProperty",
  ],
  [
    "psychology data",
    "Subproperty",
    "property",
    NS.rdfs + "subPropertyOf",
    "DataProperty",
  ],
  [
    "psychology annotation",
    "Subproperty",
    "property",
    NS.rdfs + "subPropertyOf",
    "AnnotationProperty",
  ],
] as const) {
  test(`#49 ${door} creates a ${kind} with its relation and one Undo`, async () => {
    await openExtendFixture();
    await extendMenu(target);
    await page.getByRole("menuitem", { name: new RegExp("^" + door) }).click();
    if (door !== "Subproperty") {
      const form = addForm(),
        name = "New " + kind,
        iri = extendBase + "New" + kind,
        targetIri = (await state()).entities.find(
          (e) => (e.label || e.name) === target,
        )!.iri;
      await expect(
        form.getByRole("textbox", { name: "Name", exact: true }),
      ).toHaveValue("Psy");
      await expect(
        form.getByRole("button", { name: "Remove " + target, exact: true }),
      ).toBeVisible();
      await form.getByRole("textbox", { name: "Name", exact: true }).fill(name);
      await form
        .getByRole("textbox", { name: "Comment", exact: true })
        .fill("Created from Find");
      await form.getByRole("button", { name: "Create", exact: true }).click();
      await expect
        .poll(
          async () => (await state()).entities.find((e) => e.iri === iri)?.kind,
        )
        .toBe(kind);
      const doc = await page.evaluate(
        (iri) => window.axiom.request<any>("entityDocument", { iri }),
        iri,
      );
      expect(doc.statements).toContainEqual(
        expect.objectContaining({
          predicate,
          object: expect.objectContaining({ literal: false, value: targetIri }),
        }),
      );
      await menu("edit.undo");
      await expect
        .poll(async () => (await state()).entities.some((e) => e.iri === iri))
        .toBe(false);
      await menu("edit.redo");
      await expect
        .poll(async () => (await state()).entities.some((e) => e.iri === iri))
        .toBe(true);
      return;
    }
    const form = pane().getByRole("region", {
      name: "Add to the ontology",
      exact: true,
    });
    const label = form.getByRole("textbox", {
      name: new RegExp("^" + noun + " label$", "i"),
    });
    await expect(
      form
        .getByRole("combobox", { name: "rdf:type", exact: true })
        .locator("option"),
    ).toHaveText([
      "owl:ObjectProperty",
      "owl:DatatypeProperty",
      "owl:AnnotationProperty",
    ]);
    await expect(label).toHaveValue("Psy");
    await expect(pane().locator(".extend-context")).toContainText(target);
    await expect(
      form.getByRole("combobox", { name: "rdf:type", exact: true }),
    ).toHaveValue(
      NS.owl + (kind === "DataProperty" ? "DatatypeProperty" : kind),
    );
    const name = "New " + kind;
    await label.fill(name);
    const iri = extendBase + "Custom" + kind;
    await form
      .getByRole("textbox", { name: "Subject IRI", exact: true })
      .fill(iri);
    await form
      .getByRole("textbox", { name: new RegExp("^" + noun + " comment$", "i") })
      .fill("Created from Find");
    await form.getByRole("button", { name: "Source", exact: true }).click();
    await expect(form.getByLabel("RDF/XML source")).toContainText("rdf:");
    await assertCodeBothThemes(pane(), "code, .entity-source pre");
    const targetIri = (await state()).entities.find(
      (e) => (e.label || e.name) === target,
    )!.iri;
    await form
      .getByRole("button", { name: `Create ${noun}`, exact: true })
      .click();
    await expect
      .poll(
        async () => (await state()).entities.find((e) => e.iri === iri)?.kind,
      )
      .toBe(kind);
    const doc = await page.evaluate(
      (iri) => window.axiom.request<any>("entityDocument", { iri }),
      iri,
    );
    expect(doc.statements).toContainEqual(
      expect.objectContaining({
        predicate,
        object: expect.objectContaining({ literal: false, value: targetIri }),
      }),
    );
    expect(
      doc.statements.some((t: any) => t.predicate === NS.rdfs + "subClassOf"),
    ).toBe(false);
    await pane().getByRole("searchbox").blur();
    await menu("edit.undo");
    await expect
      .poll(async () => (await state()).entities.some((e) => e.iri === iri))
      .toBe(false);
    await menu("edit.redo");
    await expect
      .poll(async () => (await state()).entities.some((e) => e.iri === iri))
      .toBe(true);
    await pane().getByRole("searchbox").fill("Psy");
    await expect(pane().locator(".find-results-scroll")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await extendMenu(target);
    await page.getByRole("menuitem", { name: new RegExp("^" + door) }).click();
    await expect(label).toHaveValue("Psy");
    await expect(
      form.getByRole("textbox", { name: "Subject IRI", exact: true }),
    ).not.toHaveValue(iri);
  });
}

test("#49 menus retain selection, close outside or on Escape, and keep independent door drafts", async () => {
  await openExtendFixture();
  await extendRow("General Psychology").locator(".find-result-name").click();
  const selected = await pane().locator('tr[data-selected="true"]').innerText();
  const first = await extendMenu("Psychology");
  await first.press("Escape");
  // Escape also works while focus remains on the pointer-opened trigger.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(first).toBeFocused();
  await first.press("Enter");
  await expect(
    page.getByRole("menu").getByRole("menuitem").first(),
  ).toBeFocused();
  await page.getByRole("menu").getByRole("menuitem").first().press("Escape");
  await expect(first).toBeFocused();
  await first.press("Space");
  await expect(
    page.getByRole("menu").getByRole("menuitem").first(),
  ).toBeFocused();
  await page.getByRole("menu").getByRole("menuitem").first().press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /^Subclass/ })).toBeFocused();
  await page.getByRole("menuitem", { name: /^Subclass/ }).press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /^Sibling/ })).toBeFocused();
  await page.getByRole("menuitem", { name: /^Sibling/ }).press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /^Instance/ })).toBeFocused();
  await page.getByRole("menuitem", { name: /^Instance/ }).press("Escape");
  await first.click();
  await extendMenu("teaches");
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await pane().getByRole("searchbox").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(pane().getByRole("searchbox")).toBeFocused();
  expect(await pane().locator('tr[data-selected="true"]').innerText()).toBe(
    selected,
  );
  await extendMenu("Psychology");
  await page.getByRole("menuitem", { name: /^Subclass/ }).click();
  const label = addForm().getByRole("textbox", { name: "Name", exact: true });
  await label.fill("Retained class draft");
  await menu("view.find");
  await menu("view.textentities");
  await expect(label).toHaveValue("Retained class draft");
  await menu("view.find");
  await extendMenu("Psychology");
  await page.getByRole("menuitem", { name: /^Instance/ }).click();
  await expect(
    addForm().getByRole("button", { name: "Individual", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(label).toHaveValue("Psy");
  await expect(
    addForm().getByRole("button", { name: "Remove Psychology", exact: true }),
  ).toBeVisible();
});

test("the narrow split reserves 148 pixels and lists Synonym before relations", async () => {
  await openExtendFixture();
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
  const row = extendRow("Psychology");
  await expect
    .poll(
      async () =>
        (await row.locator(".find-extend-column").boundingBox())!.width,
    )
    .toBe(148);
  const trigger = await extendMenu("Psychology");
  await expect(trigger).toHaveText("v");
  await expect(row.locator(".ext-main")).toHaveText("+ Synonym");
  await expect(row.locator(".ext-main")).toBeEnabled();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    "Synonymrdfs:seeAlso",
    "Subclassrdfs:subClassOf",
    "Siblingrdfs:subClassOf",
    "Instancerdf:type",
  ]);
  await expect(page.getByRole("menu")).toHaveAttribute(
    "aria-label",
    "Psychology",
  );
  await page.getByRole("menu").getByRole("menuitem").first().click();
  await expect(pane().locator(".extend-confirmation")).toHaveText(
    "Psy added to Psychology",
  );
  await extendMenu("Psychology");
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveCount(4);
  await expect(page.getByRole("menu").getByRole("menuitem").first()).toHaveText(
    "Synonymrdfs:seeAlso",
  );
});

// #70: the sibling editor must save the generated Subject without recasing its label.
test("#70 uppercase sibling label previews and saves a PascalCase ID", async () => {
  await openExtendFixture();
  await extendMenu("Clinical Psychology");
  await page.getByRole("menuitem", { name: /^Sibling/ }).click();
  const form = addForm(),
    label = form.getByRole("textbox", { name: "Name", exact: true }),
    iri = extendBase + "CreativeThinking";
  for (const input of [
    "creative thinking",
    "Creative Thinking",
    "CREATIVE THINKING",
  ]) {
    await label.fill(input);
    await expect(form.locator(".fnote .mono").first()).toHaveText(iri);
    await expect(
      form.getByRole("button", { name: "Create", exact: true }),
    ).toBeEnabled();
  }
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === iri)?.parents,
    )
    .toEqual([extendBase + "Psychology"]);
  await menu("edit.undo");
  await expect
    .poll(async () => (await state()).entities.some((e) => e.iri === iri))
    .toBe(false);
});
for (const count of [0, 1, 2])
  test(`#55 Sibling shares ${count} named parents and undoes every statement`, async () => {
    await openExtendFixture(
      count === 2
        ? `:ClinicalPsychology rdfs:subClassOf :GeneralPsychology, [a owl:Restriction; owl:onProperty :teaches; owl:someValuesFrom :Psychology].`
        : "",
    );
    const target = count ? "Clinical Psychology" : "Psychology",
      parents =
        count === 2
          ? ["Psychology", "General Psychology"]
          : count
            ? ["Psychology"]
            : [];
    await extendMenu(target);
    await page.getByRole("menuitem", { name: /^Sibling/ }).click();
    const form = addForm();
    await expect(
      form.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue("Psy");
    for (const parent of parents)
      await expect(
        form.getByRole("button", { name: "Remove " + parent, exact: true }),
      ).toBeVisible();
    await form
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Sibling subject");
    await form.getByRole("button", { name: "Create", exact: true }).click();
    const iri = extendBase + "SiblingSubject",
      expected = parents.length
        ? parents.map((p) => extendBase + p.replaceAll(" ", "")).sort()
        : [NS.owl + "Thing"];
    await expect
      .poll(async () =>
        (await state()).entities.find((e) => e.iri === iri)?.parents?.sort(),
      )
      .toEqual(expected);
    await menu("view.details");
    await expect(page.locator('[data-panel="details"]')).toHaveAttribute(
      "data-entity-iri",
      iri,
    );
    await menu("edit.undo");
    await expect
      .poll(async () => (await state()).entities.some((e) => e.iri === iri))
      .toBe(false);
    await menu("edit.redo");
    await expect
      .poll(async () =>
        (await state()).entities.find((e) => e.iri === iri)?.parents?.sort(),
      )
      .toEqual(expected);
  });
test("#55 Sibling and Subclass hand off their own parent chips", async () => {
  await openExtendFixture();
  await extendMenu("Clinical Psychology");
  await page.getByRole("menuitem", { name: /^Sibling/ }).click();
  await expect(
    addForm().getByRole("button", { name: "Remove Psychology", exact: true }),
  ).toBeVisible();
  await menu("view.find");
  await extendMenu("Clinical Psychology");
  await page.getByRole("menuitem", { name: /^Subclass/ }).click();
  await expect(
    addForm().getByRole("button", {
      name: "Remove Clinical Psychology",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    addForm().getByRole("button", { name: "Remove Psychology", exact: true }),
  ).toHaveCount(0);
});

for (const mode of ["expanded", "narrow", "constrained"] as const) {
  test(`#55 ${mode} menu cycles through every S item and wraps`, async () => {
    await openExtendFixture();
    await page.locator('[data-pane-id="find"]').evaluate(
      (el, mode) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          zIndex: "1000",
          width: mode === "expanded" ? "760px" : "500px",
          height: mode === "constrained" ? "320px" : "560px",
        }),
      mode,
    );
    await expect(pane()).toHaveAttribute("data-layout", mode);
    const trigger = await extendMenu("Psychology");
    await trigger.press("Escape");
    await trigger.press("Enter");
    await expect(
      page.getByRole("menu").getByRole("menuitem").first(),
    ).toBeFocused();
    const order = ["Subclass", "Sibling", "Synonym", "Subclass"];
    for (const item of order) {
      await page.keyboard.press("s");
      await expect(
        page.getByRole("menuitem", { name: new RegExp("^" + item) }),
      ).toBeFocused();
    }
  });
}

test("#55 owl:Thing offers Subclass and Instance without Sibling", async () => {
  await openExtendFixture(`owl:Thing a owl:Class; rdfs:label "Thing".`);
  await pane().getByRole("searchbox").fill("Thing");
  await expect(pane().locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await extendMenu("Thing");
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    "Synonymrdfs:seeAlso",
    "Subclassrdfs:subClassOf",
    "Instancerdf:type",
  ]);
});

test("#49 a row door preserves the results page, scroll, selection and its draft", async () => {
  await openNetworkFixture();
  await pane().getByRole("searchbox").fill("Network Certification");
  await setPageSize("25");
  await pane()
    .getByRole("button", { name: "Next results page", exact: true })
    .click();
  await expect(pane().locator(".pg")).toHaveText("Page 2 of 3");
  const rows = pane().locator(".find-results tbody tr");
  await rows.nth(2).locator(".find-result-name").click();
  const selected = await pane()
    .locator('tr[data-selected="true"] .find-result-name')
    .innerText();
  const target = rows.nth(15);
  await target.scrollIntoViewIfNeeded();
  await target.hover();
  const trigger = target.getByRole("button", { name: /^More ways to extend/ });
  await trigger.click();
  const scroll = await pane()
    .locator(".find-results-scroll")
    .evaluate((el) => el.scrollTop);
  await page.getByRole("menuitem", { name: /^Subclass/ }).click();
  const label = addForm().getByRole("textbox", { name: "Name", exact: true });
  await label.fill("Page two draft");
  await menu("view.find");
  await expect(pane().locator(".pg")).toHaveText("Page 2 of 3");
  expect(
    await pane()
      .locator(".find-results-scroll")
      .evaluate((el) => el.scrollTop),
  ).toBe(scroll);
  await expect(
    pane().locator('tr[data-selected="true"] .find-result-name'),
  ).toHaveText(selected);
  await menu("view.textentities");
  await expect(label).toHaveValue("Page two draft");
});

test("#49 shallow rows stay stable when the toolbar must withdraw", async () => {
  await openExtendFixture();
  await page.locator('[data-pane-id="find"]').evaluate((el) =>
    Object.assign((el as HTMLElement).style, {
      position: "fixed",
      left: "24px",
      top: "24px",
      width: "760px",
      height: "320px",
      zIndex: "1000",
    }),
  );
  await expect(pane()).toHaveAttribute("data-layout", "shallow");
  const target = extendRow("Psychology");
  await target.scrollIntoViewIfNeeded();
  await target.focus();
  await expect(target.locator(".ext-main")).toBeVisible();
  const positions = await target.evaluate(async (el) => {
    const samples: number[] = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      samples.push(el.getBoundingClientRect().y);
    }
    return samples;
  });
  expect(new Set(positions).size).toBe(1);
});

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/find-"));
  await launch();
  const file = path.join(profile, "courses.ttl");
  const ttl =
    "@prefix : <" +
    base +
    ">. @prefix owl: <" +
    NS.owl +
    ">. @prefix rdfs: <" +
    NS.rdfs +
    ">. @prefix skos: <" +
    NS.skos +
    ">.\n" +
    ':Course a owl:Class; rdfs:label "Course". :English a owl:Class; rdfs:label "English Language"; rdfs:subClassOf :Course. ' +
    ':Basic a owl:Class; rdfs:label "Basic English"; rdfs:subClassOf :English; skos:altLabel "Preparatory Language"; rdfs:comment "A foundation in written and spoken English.". ' +
    ':student a owl:NamedIndividual, :English; rdfs:label "English learner". :teaches a owl:ObjectProperty; rdfs:label "English teaching". ' +
    Array.from(
      { length: 123 },
      (_, i) =>
        ":Course" +
        i +
        ' a owl:Class; rdfs:label "English Course ' +
        String(i).padStart(3, "0") +
        '"; rdfs:subClassOf :Course.',
    ).join("\n");
  await writeFile(file, ttl);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("courses.ttl");
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
  } finally {
    await app.close();
  }
  expect(errors).toEqual([]);
});
async function openSynonymFixture() {
  const file = path.join(profile, "synonyms.ttl");
  await writeFile(
    file,
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    :Developmental_Psychology a owl:Class; rdfs:label "Developmental Psychology"; rdfs:seeAlso "Developmental Psyc".
    :Psychoanalysis a owl:Class; rdfs:label "Developmental Psychoanalysis".`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => (await state()).ontology.name)
    .toBe("synonyms.ttl");
}
const synonymDocument = () =>
  page.evaluate(
    (iri) =>
      window.axiom.request<
        import("../../src/shared/editor-state").DocumentData
      >("entityDocument", { iri }),
    base + "Developmental_Psychology",
  );

// #127: a colon in a course title stays in the synonym added from Find.
test("Find records a colon title as one synonym literal", async () => {
  await openSynonymFixture();
  const title = "Developmental Psychology: Body Structures";
  await find(title);
  const row = extendRow("Developmental Psychology");
  const before = await synonymDocument();
  await row
    .getByRole("button", {
      name: `Add ${title} as a synonym of Developmental Psychology`,
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await synonymDocument()).statements)
    .toEqual([
      ...before.statements,
      {
        subject: base + "Developmental_Psychology",
        predicate: NS.rdfs + "seeAlso",
        object: { literal: true, value: title },
      },
    ]);
});

test("Find adds its search text as a synonym without clearing results and refreshes Details with Undo and Redo", async () => {
  await openSynonymFixture();
  await find("Developmental Psycho");
  const p = pane(),
    query = p.getByRole("searchbox", { name: "Search the ontology" });
  await query.fill("  Developmental Psycho  ");
  const name = p.getByRole("button", {
    name: "Developmental Psychology",
    exact: true,
  });
  await name.click();
  await resultAction("Details");
  const details = page.locator('[data-panel="details"]');
  const values = details
    .locator('tr[data-predicate="' + NS.rdfs + 'seeAlso"]')
    .getByRole("combobox", { name: / value \d+$/ });
  await expect(values).toHaveValue("Developmental Psyc");
  await menu("view.find");
  await expect(p.locator(".find-results tbody tr")).toHaveCount(2);
  await expect(p.locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "synonyms.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  const before = await synonymDocument();
  await p.locator("tbody").evaluate((body) => {
    const observation = {
      minimum: body.children.length,
      observer: new MutationObserver(() => {
        observation.minimum = Math.min(
          observation.minimum,
          body.children.length,
        );
      }),
    };
    observation.observer.observe(body, { childList: true });
    (window as any).findRowObservation = observation;
  });
  const row = p.locator(".find-results tbody tr").filter({
    has: page.getByRole("button", {
      name: "Developmental Psychology",
      exact: true,
    }),
  });
  const add = row.getByRole("button", {
    name: "Add Developmental Psycho as a synonym of Developmental Psychology",
    exact: true,
  });
  await expect(add).toHaveAttribute(
    "title",
    "Add Developmental Psycho as a synonym of Developmental Psychology",
  );
  await add.click();
  await expect(row.locator(".find-synonym")).toBeEnabled();
  await expect(p).toContainText(
    "Developmental Psycho added to Developmental Psychology",
  );
  await expect(p.locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    await page.evaluate(() => {
      const observation = (window as any).findRowObservation;
      observation.observer.disconnect();
      return observation.minimum;
    }),
  ).toBe(2);
  await expect(query).toHaveValue("  Developmental Psycho  ");
  await expect(name).toHaveAttribute("aria-pressed", "true");
  expect((await state()).dirty).toBe(true);
  const after = await synonymDocument();
  expect(after.statements).toEqual([
    ...before.statements,
    {
      subject: base + "Developmental_Psychology",
      predicate: NS.rdfs + "seeAlso",
      object: { literal: true, value: "Developmental Psycho" },
    },
  ]);
  await menu("view.details");
  await expect(details).toHaveAttribute(
    "data-entity-iri",
    base + "Developmental_Psychology",
  );
  await expect(values).toHaveCount(2);
  await expect(values.nth(1)).toHaveValue("Developmental Psycho");
  await menu("view.find");
  // Find focuses its search box on opening; use ontology Undo, not text Undo.
  await expect(query).toBeFocused();
  await name.focus();
  await expect(name).toBeFocused();
  expect((await state()).undoLabel).toBe("Add synonym");
  await menu("edit.undo");
  await expect(add).toBeEnabled();
  expect((await synonymDocument()).statements).toEqual(before.statements);
  await expect(p.locator(".find-results tbody tr")).toHaveCount(2);
  await name.focus();
  expect((await state()).redoLabel).toBe("Add synonym");
  await menu("edit.redo");
  await expect(p.locator(".find-results-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(row.locator(".find-synonym")).toBeEnabled();
  expect((await synonymDocument()).statements).toEqual(after.statements);
  await page.screenshot({ path: "artifacts/testing/find-add-synonym.png" });
});

test("Find synonym action permits name and synonym matches, withholds blank text and supports keyboard activation", async () => {
  await openSynonymFixture();
  await find("DEVELOPMENTAL PSYCHOLOGY");
  const p = pane(),
    query = p.getByRole("searchbox", { name: "Search the ontology" });
  const name = p.getByRole("button", {
    name: "Developmental Psychology",
    exact: true,
  });
  const row = p.locator(".find-results tbody tr").filter({
    has: page.getByRole("button", {
      name: "Developmental Psychology",
      exact: true,
    }),
  });
  const before = await synonymDocument();
  await expect(row.locator(".find-synonym")).toBeEnabled();
  await query.fill("developmental psyc");
  await expect(row.locator(".find-synonym")).toBeEnabled();
  await query.fill("");
  await expect(p.locator(".find-synonym")).toHaveCount(0);
  await expect(
    p.getByRole("columnheader", { name: "Synonym", exact: true }),
  ).toHaveCount(0);
  await expect(p.locator(".find-empty")).toHaveText(
    "Type to search names, aliases and IRIs.",
  );
  expect((await synonymDocument()).statements).toEqual(before.statements);
  expect((await synonymDocument()).version).toBe(before.version);
  await query.fill("Developmental Psycho");
  await name.click();
  const add = row.getByRole("button", {
    name: "Add Developmental Psycho as a synonym of Developmental Psychology",
    exact: true,
  });
  await add.focus();
  await add.press("Enter");
  await expect(row.locator(".find-synonym")).toBeEnabled();
  expect(
    (await synonymDocument()).statements
      .filter((t) => t.predicate === NS.rdfs + "seeAlso")
      .map((t) => t.object.value),
  ).toEqual(["Developmental Psyc", "Developmental Psycho"]);
});
test("quick Find focuses type-ahead and sends results to a pane without changing the graph", async () => {
  await expect(page.locator(".search-command")).toHaveCount(0);
  await expect(page.locator(".command-bar")).toHaveCount(0);
  const before = (await state()).graph.nodes.map((n) => n.iri);
  await menu("entity.search");
  const d = page.getByRole("dialog", { name: "Find entities" }),
    input = d.getByRole("combobox", { name: "Search entities" });
  await expect(input).toBeFocused();
  await input.fill("prep lang");
  await expect(
    d.getByRole("listbox", { name: "Matching entities" }).getByRole("option"),
  ).toHaveCount(2);
  await expect(
    d
      .getByRole("listbox", { name: "Matching entities" })
      .getByRole("option")
      .first(),
  ).toContainText("Basic English");
  const a = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".quick-find")
    .analyze();
  expect(
    a.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/testing/find-quick.png" });
  await input.press("Enter");
  await expect(pane()).toBeVisible();
  await expect(
    pane().getByRole("button", { name: "Basic English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toBeFocused();
  expect((await state()).graph.nodes.map((n) => n.iri)).toEqual(before);
  await expect(pane()).toContainText(
    "A foundation in written and spoken English.",
  );
  await resultAction("Copy IRI");
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    base + "Basic",
  );
  await resultAction("Details");
  await expect(page.locator('[data-panel="details"]')).toContainText(
    "Basic English",
  );
  await menu("view.find");
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("prep lang");
  await resultAction("Find in taxonomy");
  await expect(page.locator('.tree-row[aria-selected="true"]')).toContainText(
    "Basic English",
  );
});
test("Find filters, sorts and pages every match with useful result actions", async () => {
  await find("English");
  const p = pane();
  await expectPageSize("50");
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p.getByRole("button", { name: "Names only", exact: true }).click();
  await expect(p.getByRole("status").first()).toHaveText(
    /127 matches of [\d,]+ entities/,
  );
  await types(["Classes"]);
  await setPageSize("25");
  await p.getByRole("combobox", { name: "Sort" }).selectOption("name");
  await expect(p.getByRole("status").first()).toHaveText(
    /125 matches of [\d,]+ entities/,
  );
  await expect(p.locator(".find-results tbody tr")).toHaveCount(25);
  await expect(p.locator(".find-results tbody tr").first()).toContainText(
    "Basic English",
  );
  await p.getByRole("button", { name: "Last results page" }).click();
  await expect(p).toContainText("Page 5 of 5");
  await expect(p.locator(".find-results tbody tr")).toHaveCount(25);
  await expect(
    p.getByRole("button", { name: "Next results page" }),
  ).toBeDisabled();
  await types(["Instances"]);
  await expect(p.getByRole("status").first()).toHaveText(
    /1 match of [\d,]+ entities/,
  );
  await p.getByRole("button", { name: "English learner", exact: true }).click();
  await openMore();
  await expect(
    p.getByRole("button", { name: "Find in taxonomy", exact: true }),
  ).toBeDisabled();
  await types(["Properties"]);
  await expect(
    p.getByRole("button", { name: "English teaching", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Reset filters", exact: true }).click();
  await p
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("asic eng");
  await expect(p.getByRole("combobox", { name: "Match mode" })).toHaveCount(0);
  await expect(
    p.getByRole("button", { name: "Basic English", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Basic English", exact: true }).click();
  await page.screenshot({ path: "artifacts/testing/find-results.png" });
  const a = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="find"]')
    .analyze();
  expect(
    a.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await resultAction("New graph");
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  expect(
    (await state()).graph.nodes.some((n) => n.iri === base + "Basic"),
  ).toBe(true);
});
test("Ctrl+F, Escape and remapped Find preserve the previous results", async () => {
  await find("Basic");
  await setPageSize("25");
  await find("Basic");
  await expectPageSize("25");
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .press("Control+f");
  const d = page.getByRole("dialog", { name: "Find entities" }),
    input = d.getByRole("combobox", { name: "Search entities" });
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((e) => [
      (e as HTMLInputElement).selectionStart,
      (e as HTMLInputElement).selectionEnd,
    ]),
  ).toEqual([0, 5]);
  await input.fill("cancelled search");
  await input.press("Escape");
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("Basic");
  await page.evaluate(() =>
    window.axiom.keyboard.save({
      version: 1,
      accessKeys: {},
      bindings: { "entity.search": [{ keys: "Ctrl+Shift+F", scope: "app" }] },
    }),
  );
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .press("Control+Shift+f");
  await expect(input).toBeFocused();
  await input.press("Escape");
});
test("Find refreshes after edits and keeps filters when closed, reopened and restarted", async () => {
  await find("Basic");
  await types(["Classes"]);
  await page.evaluate(async (iri) => {
    const d = await window.axiom.request<any>("entityDocument", { iri });
    await window.axiom.request("updateEntity", {
      iri,
      version: d.version,
      datasetEpoch: d.datasetEpoch,
      statements: d.statements.map((t: any) =>
        t.predicate.endsWith("#label")
          ? { ...t, object: { literal: true, value: "Revised English" } }
          : t,
      ),
    });
  }, base + "Basic");
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  await expect(pane().getByRole("status").first()).toHaveText(
    /0 matches of [\d,]+ entities/,
  );
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Revised");
  await expect(
    pane().getByRole("button", { name: "Revised English", exact: true }),
  ).toBeVisible();
  await pane().getByRole("searchbox", { name: "Search the ontology" }).blur();
  await menu("pane.close");
  await expect(pane()).toHaveCount(0);
  await menu("view.find");
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("Revised");
  await expect(
    pane().getByRole("checkbox", { name: "Classes", exact: true }),
  ).toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Instances", exact: true }),
  ).not.toBeChecked();
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "saved.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app.close();
  await launch();
  await menu("view.find");
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("Revised");
  await expect(
    pane().getByRole("button", { name: "Revised English", exact: true }),
  ).toBeVisible();
});
test("Find is usable in a detached narrow pane and opens quick Find there", async () => {
  await find("English");
  await pane().getByRole("searchbox", { name: "Search the ontology" }).focus();
  const popupPromise = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popupPromise;
  await expect(pane(detached)).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("popout"),
    );
    w?.setSize(650, 650);
  });
  await pane(detached)
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Basic");
  await expect(
    pane(detached).getByRole("button", { name: "Basic English", exact: true }),
  ).toBeVisible();
  await pane(detached)
    .getByRole("searchbox", { name: "Search the ontology" })
    .press("Control+f");
  await expect(
    detached.getByRole("dialog", { name: "Find entities" }),
  ).toBeVisible();
  await detached
    .getByRole("combobox", { name: "Search entities" })
    .fill("English");
  await detached
    .getByRole("combobox", { name: "Search entities" })
    .press("Enter");
  await expect(
    pane(detached).getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("English");
  await detached.screenshot({ path: "artifacts/testing/find-detached.png" });
  await menu("pane.reattach");
  await expect.poll(() => app.windows().length).toBe(1);
  await expect(pane()).toBeVisible();
});

test("MPNet Find recognizes synonyms without spelling overlap and opens the same results in a graph", async () => {
  const modelFile = path.join(profile, "meaning.ttl");
  await writeFile(
    modelFile,
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
      :Vehicle a owl:Class; rdfs:label "Vehicle".
      :Automobile a owl:Class; rdfs:label "Automobile"; rdfs:subClassOf :Vehicle.
      :Carpet a owl:Class; rdfs:label "Carpet".
      :Banana a owl:Class; rdfs:label "Banana".`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, modelFile);
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "Automobile"),
    )
    .toBe(true);
  await menu("view.find");
  const p = pane();
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p.getByRole("button", { name: "Names only", exact: true }).click();
  await p.getByRole("searchbox", { name: "Search the ontology" }).fill("car");
  await expect(
    p.getByRole("button", { name: "Automobile", exact: true }),
  ).toBeVisible({
    timeout: 30000,
  });
  await expect(p.locator(".find-results tbody tr").first()).toContainText(
    "Carpet",
  );
  await expect(p.getByRole("combobox", { name: "Match mode" })).toHaveCount(0);
  const result = await page.evaluate(() =>
    window.axiom.request<{
      model: string;
      precision: string;
      similarities: number[];
    }>("semanticSimilarity", { query: "car", texts: ["automobile", "carpet"] }),
  );
  expect(result.precision).toBe("fp32");
  expect(result.model).toBe("sentence-transformers/all-mpnet-base-v2");
  expect(result.similarities[0]).toBeGreaterThan(result.similarities[1] + 0.3);
  await p
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  expect((await state()).graph.nodes.map((n) => n.iri)).toEqual(
    expect.arrayContaining([base + "Automobile", base + "Vehicle"]),
  );
  expect(
    (await state()).graph.nodes.some((n) => n.iri === base + "Carpet"),
  ).toBe(true);
  await menu("view.find");
  await page.screenshot({ path: "artifacts/testing/find-mpnet.png" });
});

test("automatic Find enriches an unseen query and preserves field and type facets", async () => {
  await menu("entity.search");
  const dialog = page.getByRole("dialog", { name: "Find entities" });
  await expect(
    dialog.getByRole("combobox", { name: "Quick Find match" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Search entities" })
    .fill("English for beginners");
  await expect(
    dialog
      .getByRole("listbox", { name: "Matching entities" })
      .getByRole("option")
      .first(),
  ).toContainText("Basic English", { timeout: 30000 });
  await dialog
    .getByRole("combobox", { name: "Search entities" })
    .press("Enter");
  const p = pane();
  await expect(p.getByRole("combobox", { name: "Match mode" })).toHaveCount(0);
  await expect(p.locator(".find-results tbody tr").first()).toContainText(
    "Basic English",
  );
  await expect(
    p.getByRole("checkbox", { name: "rdfs:comment", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p
    .getByRole("dialog", { name: "More", exact: true })
    .getByRole("button", { name: "Clear", exact: true })
    .click();
  await expect(p).toContainText("Select at least one field");
  await p.getByRole("checkbox", { name: "rdfs:comment", exact: true }).check();
  await p
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("written and spoken English");
  await expect(p.locator(".find-results tbody tr")).toHaveCount(1);
  await expect(p.locator(".find-match-evidence")).toContainText("rdfs:comment");
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p.getByRole("button", { name: "All fields", exact: true }).click();
  await expect(
    p.getByRole("checkbox", { name: "rdf:type", exact: true }),
  ).toBeChecked();
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p.getByRole("button", { name: "Names only", exact: true }).click();
  await p
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Basic English");
  await expect(p.locator(".find-results tbody tr").first()).toContainText(
    "Basic English",
  );
  await types(["Instances"]);
  await p
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("English learner");
  await expect(p.locator(".find-results tbody tr")).toHaveCount(1);
  await expect(p.locator(".find-results tbody tr")).toContainText(
    "English learner",
  );
  expect(
    (await p.locator(".find-results-scroll").boundingBox())!.height,
  ).toBeGreaterThan(120);
  await page.screenshot({ path: "artifacts/testing/find-automatic.png" });
  const axe = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="find"]')
    .analyze();
  expect(
    axe.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("Find similar starts from a taxonomy node and excludes the source entity", async () => {
  await menu("view.hierarchy");
  await (await hierarchyFilter(page)).fill("Basic English");
  const row = page.locator(".tree-row").filter({
    has: page.locator(".tree-name", { hasText: /^Basic English$/ }),
  });
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Find", exact: true }).click();
  await page.getByRole("menuitem", { name: "Similar", exact: true }).click();
  await expect(pane()).toBeVisible();
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("Basic English");
  await expect(
    pane().getByRole("combobox", { name: "Match mode" }),
  ).toHaveCount(0);
  await expect(pane().locator(".find-results tbody tr").first()).toBeVisible();
  await expect(
    pane().getByRole("button", { name: "Basic English", exact: true }),
  ).toHaveCount(0);
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("English Basic");
  await expect(
    pane().getByRole("button", { name: "Basic English", exact: true }),
  ).toBeVisible();
});

test("graph Find similar uses the selected name and field facets survive restart", async () => {
  await page.evaluate(async (iri) => {
    await window.axiom.request("seed", { iris: [iri], expand: false });
    await window.axiom.request("select", { iri });
  }, base + "Basic");
  await menu("view.graph");
  const canvas = page.getByTestId("graph-canvas");
  await canvas.focus();
  await canvas.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Graph node actions" })
    .getByRole("menuitem", { name: "Find", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Similar", exact: true }).click();
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("Basic English");
  await expect(
    pane().getByRole("combobox", { name: "Match mode" }),
  ).toHaveCount(0);
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane()
    .getByRole("dialog", { name: "More", exact: true })
    .getByRole("button", { name: "Clear", exact: true })
    .click();
  await pane()
    .getByRole("checkbox", { name: "rdfs:comment", exact: true })
    .check();
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("written communication");
  await types(["Classes"]);
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "cosine.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app.close();
  await launch();
  await menu("view.find");
  await expect(
    pane().getByRole("combobox", { name: "Match mode" }),
  ).toHaveCount(0);
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("written communication");
  await expect(
    pane().getByRole("slider", { name: "Minimum similarity" }),
  ).toHaveCount(0);
  await expect(
    pane().getByRole("checkbox", { name: "rdfs:comment", exact: true }),
  ).toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Names and aliases", exact: true }),
  ).not.toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Classes", exact: true }),
  ).toBeChecked();
  await expect(
    pane().getByRole("checkbox", { name: "Instances", exact: true }),
  ).not.toBeChecked();
});

test("opens every filtered result and shared ancestry in a separate graph, preserving Find and the original graph", async () => {
  await page.evaluate(async (iri) => {
    await window.axiom.request("seed", { iris: [iri], expand: false });
    await window.axiom.request("layout", { mode: "grid" });
  }, base + "Basic");
  await find("English");
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane().getByRole("button", { name: "Names only", exact: true }).click();
  await types(["Classes"]);
  await setPageSize("25");
  await expect(pane().getByRole("status").first()).toHaveText(
    /125 matches of [\d,]+ entities/,
  );
  await pane().getByRole("button", { name: "Last results page" }).click();
  await expect(pane()).toContainText("Page 5 of 5");
  await expect(pane().locator(".find-results tbody tr")).toHaveCount(25);
  const before = await state();
  const previousId = before.activeGraphId!;
  await page.screenshot({ path: "artifacts/testing/find-open-results.png" });
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  const after = await state();
  expect(after.activeGraphId).not.toBe(previousId);
  expect(after.version).toBe(before.version);
  expect(after.tripleCount).toBe(before.tripleCount);
  expect(after.graph.nodes).toHaveLength(126);
  expect(new Set(after.graph.nodes.map((n) => n.iri)).size).toBe(126);
  expect(after.graph.focus).toEqual([base + "Course"]);
  expect(after.graph.choice).toBe("radial");
  for (const [child, parent] of [
    ["Basic", "English"],
    ["English", "Course"],
    ["Course122", "Course"],
  ])
    expect(after.graph.edges).toContainEqual(
      expect.objectContaining({
        source: base + child,
        target: base + parent,
        predicate: NS.rdfs + "subClassOf",
      }),
    );
  const saved = after.graphs![previousId];
  expect(saved.nodes.map((n) => ({ iri: n.iri, x: n.x, y: n.y }))).toEqual(
    before.graph.nodes.map((n) => ({ iri: n.iri, x: n.x, y: n.y })),
  );
  expect(saved.edges).toEqual(before.graph.edges);
  expect(saved.choice).toBe(before.graph.choice);
  await expect(
    page.getByTestId("graph-canvas").filter({ visible: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/testing/find-results-ancestry.png",
  });
  await menu("view.find");
  await expect(pane()).toBeVisible();
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toHaveValue("English");
  await expect(pane()).toContainText("Page 5 of 5");
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(3);
  await expect(
    page.getByRole("tab", { name: "Graph_3", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(async () => (await state()).activeGraphId)
    .not.toBe(after.activeGraphId);
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "result-graphs.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await app.close();
  await launch();
  const restored = await state();
  expect(Object.keys(restored.graphs!)).toHaveLength(3);
  expect(
    restored.graphs![after.activeGraphId!].nodes.map((n) => n.iri),
  ).toEqual(after.graph.nodes.map((n) => n.iri));
  expect(restored.graphs![after.activeGraphId!].edges).toEqual(
    after.graph.edges,
  );
});

test("result graphs follow field filters and instance ancestry without expanding siblings", async () => {
  await find("Basic");
  await pane().getByRole("button", { name: "More", exact: true }).click();
  await pane()
    .getByRole("dialog", { name: "More", exact: true })
    .getByRole("button", { name: "Clear", exact: true })
    .click();
  await pane()
    .getByRole("checkbox", { name: "rdfs:comment", exact: true })
    .check();
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("A foundation in written and spoken English.");
  await expect(pane().getByRole("status").first()).toHaveText(
    /1 match of [\d,]+ entities/,
  );
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(2);
  expect(new Set((await state()).graph.nodes.map((n) => n.iri))).toEqual(
    new Set(["Basic", "English", "Course"].map((n) => base + n)),
  );
  await menu("view.find");
  await pane()
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("English");
  await types(["Instances"]);
  await expect(pane().getByRole("status").first()).toHaveText(
    /1 match of [\d,]+ entities/,
  );
  await pane()
    .getByRole("button", { name: "Open results in new graph", exact: true })
    .click();
  await expect
    .poll(async () => Object.keys((await state()).graphs ?? {}).length)
    .toBe(3);
  const graph = (await state()).graph;
  expect(new Set(graph.nodes.map((n) => n.iri))).toEqual(
    new Set(["student", "English", "Course"].map((n) => base + n)),
  );
  expect(graph.edges).toContainEqual(
    expect.objectContaining({
      source: base + "student",
      target: base + "English",
      predicate: NS.rdf + "type",
    }),
  );
  await menu("view.find");
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("no such entity anywhere");
  await expect(pane().getByRole("status").first()).toHaveText(
    /0 matches of [\d,]+ entities/,
  );
  await expect(
    pane().getByRole("button", {
      name: "Open results in new graph",
      exact: true,
    }),
  ).toHaveCount(0);
});

async function visibleTaxonomySelection(iri: string, target = page) {
  const selected = target
    .locator(
      '[data-panel="hierarchy"] [data-entity-iri="' +
        iri +
        '"][aria-selected="true"]',
    )
    .first();
  await expect(selected).toBeVisible();
  await expect
    .poll(() =>
      selected.evaluate((el) => {
        const tree = el.closest('[role="tree"]')!,
          r = el.getBoundingClientRect(),
          v = tree.getBoundingClientRect();
        return r.top >= v.top && r.bottom <= v.bottom;
      }),
    )
    .toBe(true);
}
test("quick Find clears a taxonomy filter and reveals the selection in the visible tree", async () => {
  const hierarchy = page.locator('[data-panel="hierarchy"]');
  await (await hierarchyFilter(page)).fill("English Course 122");
  await find("Basic English");
  await expect(hierarchy.getByPlaceholder("Filter hierarchy")).toHaveValue("");
  await visibleTaxonomySelection(base + "Basic");
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toBeFocused();
});
test("clicking a Find result scrolls the open taxonomy to a distant matching entity", async () => {
  await find("English");
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("English Course 122");
  await pane()
    .getByRole("button", { name: "English Course 122", exact: true })
    .click();
  await visibleTaxonomySelection(base + "Course122");
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Basic English");
  await pane()
    .getByRole("button", { name: "Basic English", exact: true })
    .click();
  await visibleTaxonomySelection(base + "Basic");
});
test("Find in taxonomy reveals the same selection again after the user scrolls away", async () => {
  await menu("view.details");
  await find("English Course 122");
  await visibleTaxonomySelection(base + "Course122");
  const tree = page.locator('[data-panel="hierarchy"] [role="tree"]');
  const before = (await state()).selected;
  await tree.evaluate((el) => {
    el.scrollTop = 0;
  });
  await resultAction("Find in taxonomy");
  await visibleTaxonomySelection(base + "Course122");
  expect((await state()).selected).toBe(before);
  await tree.evaluate((el) => {
    el.scrollTop = 0;
  });
  const scroll = await tree.evaluate(async (el) => {
    for (let i = 0; i < 12; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    return el.scrollTop;
  });
  expect(scroll).toBe(0);
});

test("Find keeps a closed taxonomy closed", async () => {
  await menu("view.hierarchy");
  await menu("pane.close");
  await expect(page.locator('[data-panel="hierarchy"]')).toHaveCount(0);
  await find("Basic English");
  await expect(page.locator('[data-panel="hierarchy"]')).toHaveCount(0);
  await expect.poll(async () => (await state()).selected).toBe(base + "Basic");
});
// craigtrim/axiom#142: Find follows Hierarchy only while its tab is on screen.
async function chooseWithHiddenTaxonomy() {
  const hierarchy = page.locator('[data-panel="hierarchy"]');
  await expect(hierarchy).toHaveCount(1);
  await expect(hierarchy).toBeHidden();
  await pane()
    .getByRole("searchbox", { name: "Search the ontology" })
    .fill("Basic English");
  await pane()
    .getByRole("button", { name: "Basic English", exact: true })
    .click();
  await expect.poll(async () => (await state()).selected).toBe(base + "Basic");
  // The reveal follows the select response, so read visibility once it settles.
  const shown = await hierarchy.evaluate(async (el) => {
    for (let i = 0; i < 12; i++)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    return el.checkVisibility();
  });
  expect(shown).toBe(false);
  await expect(pane()).toBeVisible();
}
test("Find leaves a Hierarchy tab hidden behind its results in place", async () => {
  await menu("view.details");
  await menu("pane.move.right");
  await find("English Course 122");
  await menu("view.hierarchy");
  await menu("pane.group");
  await menu("view.find");
  await chooseWithHiddenTaxonomy();
  await expect(page.locator('[data-panel="details"]')).toHaveAttribute(
    "data-entity-iri",
    base + "Basic",
  );
});
test("Find keeps its maximized pane maximized when it selects a result", async () => {
  await find("English Course 122");
  await (await hierarchyFilter(page)).fill("English");
  await menu("view.find");
  await menu("pane.maximise");
  await chooseWithHiddenTaxonomy();
  // Details is not open here, so only Find's reveal could clear the filter.
  await expect(
    page
      .locator('[data-panel="hierarchy"]')
      .getByRole("textbox", { name: "Filter hierarchy", includeHidden: true }),
  ).toHaveValue("English");
});
test("Find reveals properties in the taxonomy Properties tab", async () => {
  await find("English teaching");
  await visibleTaxonomySelection(base + "teaches");
  await expect(
    page
      .locator('[data-panel="hierarchy"]')
      .getByRole("button", { name: /Properties/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Find also scrolls a detached taxonomy without taking focus from the results", async () => {
  await menu("view.hierarchy");
  const popup = app.waitForEvent("window");
  await menu("pane.detach");
  const detached = await popup;
  await expect(detached.locator('[data-panel="hierarchy"]')).toBeVisible();
  await page.bringToFront();
  await find("English Course 122");
  await visibleTaxonomySelection(base + "Course122", detached);
  await expect(
    pane().getByRole("searchbox", { name: "Search the ontology" }),
  ).toBeFocused();
});

test("Find and resource inputs keep lexical results when the local model is absent", async () => {
  await app.close();
  await launch(path.join(profile, "missing-model"));
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    },
    path.join(profile, "courses.ttl"),
  );
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "Basic"),
    )
    .toBe(true);
  await find("prep lang");
  await expect(pane().locator(".find-results tbody tr").first()).toContainText(
    "Basic English",
  );
  const result = await page.evaluate(async () => {
    const args = {
      text: "prep lang",
      fields: ["name"],
      consumer: "missing-test",
      searchId: "find",
    };
    const lexical = await window.axiom.request<any>("find", args);
    const enriched = await window.axiom.request("findSemantic", args);
    const resourceArgs = {
      query: "prep lang",
      classesOnly: true,
      consumer: "missing-test",
      searchId: "resource",
    };
    const resources = await window.axiom.request<any[]>(
      "resourceSuggestions",
      resourceArgs,
    );
    const semanticResources = await window.axiom.request(
      "resourceSuggestionsSemantic",
      resourceArgs,
    );
    return { lexical, enriched, resources, semanticResources };
  });
  expect(result.lexical.rows[0].iri).toBe(base + "Basic");
  expect(result.enriched).toBeUndefined();
  expect(result.resources[0].iri).toBe(base + "Basic");
  expect(result.semanticResources).toBeUndefined();
  await expect(pane().getByRole("alert")).toHaveCount(0);
});

test("a search result token retains its query and rejects stale ontology revisions", async () => {
  const token = await page.evaluate(async () => {
    const result = await window.axiom.request<any>("find", {
      text: "preparatory",
      fields: ["name"],
    });
    await window.axiom.request("find", { text: "English", fields: ["name"] });
    return result.resultId as string;
  });
  await page.evaluate(async (resultId) => {
    const s = await window.axiom.request<Snapshot>("state");
    await window.axiom.request("graphCreate", {
      find: { text: "preparatory", fields: ["name"] },
      findResultId: resultId,
      version: s.version,
      datasetEpoch: s.datasetEpoch,
    });
  }, token);
  expect(new Set((await state()).graph.nodes.map((n) => n.iri))).toEqual(
    new Set(["Basic", "English", "Course"].map((n) => base + n)),
  );
  const graphCount = Object.keys((await state()).graphs ?? {}).length;
  await page.evaluate(async (iri) => {
    const document = await window.axiom.request<any>("entityDocument", { iri });
    await window.axiom.request("updateEntity", {
      iri,
      version: document.version,
      datasetEpoch: document.datasetEpoch,
      statements: [
        ...document.statements,
        {
          subject: iri,
          predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
          object: { literal: true, value: "fresh alias" },
        },
      ],
    });
  }, base + "Basic");
  const error = await page.evaluate(async (resultId) => {
    const s = await window.axiom.request<Snapshot>("state");
    try {
      await window.axiom.request("graphCreate", {
        find: { text: "preparatory", fields: ["name"] },
        findResultId: resultId,
        version: s.version,
        datasetEpoch: s.datasetEpoch,
      });
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  }, token);
  expect(error).toMatch(
    /search results.*changed|search.*refresh|search.*expired/i,
  );
  expect(Object.keys((await state()).graphs ?? {})).toHaveLength(graphCount);
});

test("reading and comp ranks Reading Comprehension first in quick Find and the results pane", async () => {
  const file = path.join(profile, "reading.ttl");
  await writeFile(
    file,
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    :Reading a owl:Class; rdfs:label "Reading Comprehension".
    :German a owl:Class; rdfs:label "German Reading Comprehension".
    :Theory a owl:Class; rdfs:label "Theory of Computation".`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "Reading"),
    )
    .toBe(true);
  await find("reading and comp");
  await expect(pane().locator(".find-results tbody tr").first()).toContainText(
    "Reading Comprehension",
  );
  await expect(
    pane().getByRole("button", { name: "Reading Comprehension", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    pane().getByRole("combobox", { name: "Match mode" }),
  ).toHaveCount(0);
  const resources = await page.evaluate(() =>
    window.axiom.request<any[]>("resourceSuggestions", {
      query: "reading and comp",
      classesOnly: true,
    }),
  );
  expect(resources[0].iri).toBe(base + "Reading");
});
