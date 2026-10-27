// #165: reveal the responsive filter through the existing real overflow control.
// craigtrim/axiom#94: reviewable run rows replace per-row action buttons.
// craigtrim/axiom#91: the hierarchy type switch no longer embeds counts.
import { hierarchyFilter } from "./hierarchy-controls";
// Reference control names and retained review behavior (craigtrim/axiom#82).
import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { NS } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import type { SuggestionDocument } from "../../src/shared/suggestions";
import type { BatchMode } from "../../src/shared/suggestion-batches";

const base = "https://example.org/batch#";
let app: ElectronApplication,
  page: Page,
  profile: string,
  file: string,
  env: Record<string, string>;
const errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const batches = () => page.evaluate(() => window.axiom.suggestions.batches());
const row = (id: string) =>
  page.locator('.tree-row[data-entity-iri="' + base + id + '"]');
const runs = () => page.locator('[data-panel="suggestionruns"]');
const review = () => page.locator('[data-panel="taxonomy"].suggestions-view');
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
async function launch() {
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      BrowserWindow.getAllWindows()[0].setFocusable(false);
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file + ".axiom",
    });
  }, file);
}
async function select(ids: string[]) {
  await menu("view.hierarchy");
  await (await hierarchyFilter(page)).fill("Subject");
  await row(ids[0]).click();
  for (const id of ids.slice(1))
    await row(id).click({ modifiers: ["Control"] });
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(
    ids.length,
  );
}
async function start(ids: string[], mode: BatchMode = "children") {
  await select(ids);
  await row(ids[0]).click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: ["children", "parents"].includes(mode) ? "Suggest" : "Find",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", {
      name: {
        children: "Add Children",
        parents: "Add Parents",
        instances: "Instances",
        synonyms: "Synonyms",
      }[mode],
      exact: true,
    })
    .click();
  await expect(runs()).toBeVisible();
}
const documentFor = (id: string) =>
  page.evaluate(
    (iri) =>
      window.axiom.request<SuggestionDocument>("entityDocument", { iri }),
    base + id,
  );

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/hierarchy-multi-"));
  file = path.join(profile, "subjects.ttl");
  await writeFile(
    file,
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    :Alpha a owl:Class; rdfs:label "Alpha Subject".
    :Child a owl:Class; rdfs:label "Alpha Subject Child"; rdfs:subClassOf :Alpha.
    :Grandchild a owl:Class; rdfs:label "Alpha Subject Grandchild"; rdfs:subClassOf :Child.
    :Beta a owl:Class; rdfs:label "Beta Subject".
    :Gamma a owl:Class; rdfs:label "Gamma Subject".
    :PropertyA a owl:ObjectProperty; rdfs:label "Subject property A".
    :PropertyB a owl:ObjectProperty; rdfs:label "Subject property B".`,
  );
  const bin = path.join(profile, "bin"),
    folder = path.join(bin, "node_modules/@openai/codex/bin");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(folder, "codex.js"),
    String.raw`import fs from "node:fs";
    if(process.argv.includes("--version")){console.log("fixture-cli 1.0");process.exit(0);}
    let prompt="";process.stdin.on("data",d=>prompt+=d);process.stdin.on("end",()=>{
      const synonym=prompt.startsWith("Suggest synonyms for"), parents=prompt.startsWith("Suggest parents for");
      const name=JSON.parse(prompt.match(/^Suggest (?:synonyms for|parents for|useful additional types of|real, named examples of) (".*?")\./)[1]);
      fs.appendFileSync(process.env.AXIOM_USER_DATA+"/calls.jsonl",JSON.stringify({name,synonym})+"\n");
      // Issue #68: hold a fixture reply until the test finishes applying and undoing.
      setTimeout(async()=>{
        while(fs.existsSync(process.env.AXIOM_USER_DATA+"/hold-"+name))
          await new Promise(resolve=>setTimeout(resolve,25));
        if(name==="Gamma Subject"){console.error("Fixture assistant failure");process.exit(1);}
        const reply=parents?JSON.stringify({suggestions:[]}):synonym?JSON.stringify({suggestions:[{value:name+" Alias",reason:"An equivalent wording variant."}]}):
          "Summary: A direct child for this selected class.\nSuggestions:\n1. "+name+" Addition\nDescription: A distinct direct child.\nReason: Fits this selected class.";
        fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],reply);
      },1200);
    });`,
  );
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({
      version: 1,
      panelState: { "assistant.provider": "codex" },
    }),
  );
  env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
  } as Record<string, string>;
  const prior = env.PATH ?? env.Path ?? "";
  delete env.Path;
  env.PATH = bin + path.delimiter + prior;
  delete env.ELECTRON_RUN_AS_NODE;
  await launch();
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "Alpha"),
    )
    .toBe(true);
});
test.afterEach(async ({}, info) => {
  if (app) {
    if (info.status !== info.expectedStatus && !page.isClosed())
      await info.attach("desktop", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    await app.close();
  }
  expect(errors).toEqual([]);
});

test("mouse selection preserves context targets, disables single-node actions and copies only selected IRIs", async () => {
  await select(["Alpha", "Beta"]);
  await expect(row("Child")).toHaveAttribute("aria-selected", "false");
  await expect(row("Grandchild")).toHaveAttribute("aria-selected", "false");
  await row("Alpha").click({ button: "right" });
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(2);
  for (const name of [
    "Details",
    "Rename",
    "New subclass",
    "New instance",
    "Delete class...",
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("c");
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe(base + "Alpha\r\n" + base + "Beta");
  await row("Alpha").focus();
  await page.keyboard.press("F2");
  await page.keyboard.press("Delete");
  await expect(page.locator("[data-inline-rename] input")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row("Gamma").click({ button: "right" });
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(1);
  await expect(
    page.getByRole("menuitem", { name: "Rename", exact: true }),
  ).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await select(["Alpha"]);
  await row("Beta").click({ modifiers: ["Shift"] });
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(4);
  await row("Child").click({ modifiers: ["Control"] });
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(3);
});

test("keyboard ranges, Ctrl+Space, Ctrl+A and filtering use visible rows only", async () => {
  await select(["Alpha"]);
  await row("Alpha").press("Shift+ArrowDown");
  await expect(row("Child")).toBeFocused();
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(2);
  await page.keyboard.press("Control+End");
  await expect(row("Gamma")).toBeFocused();
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(2);
  await page.keyboard.press("Control+Space");
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(3);
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Details", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await row("Gamma").press("Control+a");
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(5);
  await (await hierarchyFilter(page)).fill("Beta");
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await (await hierarchyFilter(page)).fill("Subject");
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(0);
  await row("PropertyA").click();
  await row("PropertyB").click({ modifiers: ["Control"] });
  await row("PropertyA").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Suggest", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Add Children", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByRole("menuitem", { name: "Add Parents", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
});

test("Add Children runs exactly the selected parent and child and opens each saved review", async () => {
  await start(["Alpha", "Child"]);
  await expect(runs().locator("tbody tr")).toHaveCount(2);
  await expect
    .poll(async () => (await batches())[0].runs.map((r) => r.state))
    .toEqual(["completed", "completed"]);
  const batch = (await batches())[0];
  expect(batch.runs.map((r) => r.iri)).toEqual([
    base + "Alpha",
    base + "Child",
  ]);
  expect(
    (await state()).entities.some((e) => e.name.endsWith(" Addition")),
  ).toBe(false);
  const callsBefore = await readFile(path.join(profile, "calls.jsonl"), "utf8");
  await runs()
    .getByRole("row", {
      name: "Open run for Alpha Subject Child",
      exact: true,
    })
    .click();
  await expect(
    review().getByRole("checkbox", {
      name: "Select Alpha Subject Child Addition",
      exact: true,
    }),
  ).toBeVisible();
  await review()
    .getByRole("checkbox", {
      name: "Select Alpha Subject Child Addition",
      exact: true,
    })
    .check();
  await review()
    .getByRole("button", { name: "Add 1 child", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.label === "Alpha Subject Child Addition",
        )?.parents,
    )
    .toEqual([base + "Child"]);
  await menu("edit.undo");
  await expect
    .poll(async () =>
      (await state()).entities.some(
        (e) => e.label === "Alpha Subject Child Addition",
      ),
    )
    .toBe(false);
  await menu("view.suggestionruns");
  await runs()
    .getByRole("row", { name: "Open run for Alpha Subject", exact: true })
    .click();
  await expect(
    review().getByRole("checkbox", {
      name: "Select Alpha Subject Addition",
      exact: true,
    }),
  ).toBeVisible();
  expect(await readFile(path.join(profile, "calls.jsonl"), "utf8")).toBe(
    callsBefore,
  );
  await menu("view.suggestionruns");
  const violations = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="suggestionruns"]')
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/testing/hierarchy-multi-children.png",
  });
  await menu("theme.dark");
  const dark = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="suggestionruns"]')
    .analyze();
  expect(dark.violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/testing/hierarchy-multi-children-dark.png",
  });
});

test("Find Synonyms retains captured targets while selection changes and applies only the reviewed node", async () => {
  await start(["Alpha", "Beta"], "synonyms");
  await select(["Gamma"]);
  await expect
    .poll(async () => (await batches())[0].runs.map((r) => r.state))
    .toEqual(["completed", "completed"]);
  await menu("view.suggestionruns");
  await runs()
    .getByRole("row", { name: "Open run for Beta Subject", exact: true })
    .click();
  await expect(
    review().getByRole("checkbox", {
      name: "Select Beta Subject Alias",
      exact: true,
    }),
  ).toBeVisible();
  await review()
    .getByRole("checkbox", { name: "Select Beta Subject Alias", exact: true })
    .check();
  await review()
    .getByRole("button", { name: "Add 1 synonym", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await documentFor("Beta")).statements.some(
        (t) => t.object.value === "Beta Subject Alias",
      ),
    )
    .toBe(true);
  for (const id of ["Alpha", "Child", "Grandchild", "Gamma"])
    expect(
      (await documentFor(id)).statements.some(
        (t) => t.predicate === NS.rdfs + "seeAlso",
      ),
    ).toBe(false);
  await menu("edit.undo");
  await expect
    .poll(async () =>
      (await documentFor("Beta")).statements.some(
        (t) => t.object.value === "Beta Subject Alias",
      ),
    )
    .toBe(false);
  expect((await batches())[0].runs.map((r) => r.iri)).toEqual([
    base + "Alpha",
    base + "Beta",
  ]);
});

// Issue #68: these actions must finish while Beta is still running.
for (const undo of [false, true]) {
  test(`completed synonyms can be applied during a batch${undo ? " and undone" : ""}`, async () => {
    const hold = path.join(profile, "hold-Beta Subject");
    await writeFile(hold, "hold");
    try {
      await start(["Alpha", "Beta", "Child"], "synonyms");
      await expect
        .poll(async () => (await batches())[0].runs.map((r) => r.state))
        .toEqual(["completed", "running", "queued"]);
      const batch = (await batches())[0];
      await runs()
        .getByRole("row", {
          name: "Open run for Alpha Subject",
          exact: true,
        })
        .click();
      const checkbox = review().getByRole("checkbox", {
        name: "Select Alpha Subject Alias",
        exact: true,
      });
      await expect(checkbox).toBeEnabled();
      await expect(
        review().getByRole("button", { name: "New run", exact: true }),
      ).toBeDisabled();
      await expect(
        review().getByRole("button", { name: "Run again", exact: true }),
      ).toHaveCount(0);
      await review()
        .getByRole("checkbox", { name: "Select all available suggestions" })
        .check();
      await expect(checkbox).toBeChecked();
      await review()
        .getByRole("button", { name: "Add 1 synonym", exact: true })
        .click();
      const aliases = async (id: string) =>
        (await documentFor(id)).statements
          .filter((t) => t.predicate === NS.rdfs + "seeAlso")
          .map((t) => t.object.value);
      await expect
        .poll(() => aliases("Alpha"))
        .toEqual(["Alpha Subject Alias"]);
      expect(await aliases("Beta")).toEqual([]);
      expect(await aliases("Child")).toEqual([]);
      if (undo) {
        await menu("edit.undo");
        await expect.poll(() => aliases("Alpha")).toEqual([]);
      }
      expect((await batches())[0].runs.map((r) => r.state)).toEqual([
        "completed",
        "running",
        "queued",
      ]);
      await unlink(hold);
      await expect
        .poll(async () => (await batches())[0].runs.map((r) => r.state))
        .toEqual(["completed", "completed", "completed"]);
      const history = await page.evaluate(() =>
        window.axiom.suggestions.history(),
      );
      expect(
        history
          .find((r) => r.id === batch.runs[1].id)
          ?.values.map((v) => v.value),
      ).toEqual(["Beta Subject Alias"]);
      expect(
        history
          .find((r) => r.id === batch.runs[2].id)
          ?.values.map((v) => v.value),
      ).toEqual(["Alpha Subject Child Alias"]);
      expect(await aliases("Alpha")).toEqual(
        undo ? [] : ["Alpha Subject Alias"],
      );
    } finally {
      await unlink(hold).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  });
}

test("completed child suggestions can be added and undone while another target runs", async () => {
  const hold = path.join(profile, "hold-Beta Subject");
  await writeFile(hold, "hold");
  try {
    await start(["Alpha", "Beta"], "children");
    await expect
      .poll(async () => (await batches())[0].runs.map((r) => r.state))
      .toEqual(["completed", "running"]);
    await runs()
      .getByRole("row", { name: "Open run for Alpha Subject", exact: true })
      .click();
    const choice = review().getByRole("checkbox", {
      name: "Select Alpha Subject Addition",
      exact: true,
    });
    await expect(choice).toBeEnabled();
    await choice.check();
    await review()
      .getByRole("button", { name: "Add 1 child", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await state()).entities.find(
            (e) => e.name === "Alpha Subject Addition",
          )?.parents,
      )
      .toEqual([base + "Alpha"]);
    expect((await batches())[0].runs.map((r) => r.state)).toEqual([
      "completed",
      "running",
    ]);
    await menu("edit.undo");
    await expect
      .poll(async () =>
        (await state()).entities.some(
          (e) => e.name === "Alpha Subject Addition",
        ),
      )
      .toBe(false);
    expect((await batches())[0].runs.map((r) => r.state)).toEqual([
      "completed",
      "running",
    ]);
    await unlink(hold);
    await expect
      .poll(async () => (await batches())[0].runs.map((r) => r.state))
      .toEqual(["completed", "completed"]);
  } finally {
    await unlink(hold).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
});

test("a run for the reviewed node explains why selection is blocked", async () => {
  await start(["Alpha", "Beta"], "synonyms");
  await expect
    .poll(async () => (await batches())[0].runs.map((r) => r.state))
    .toEqual(["completed", "completed"]);
  const completed = (await batches())[0];
  const hold = path.join(profile, "hold-Alpha Subject");
  await writeFile(hold, "hold");
  try {
    await page.evaluate((iri) => {
      void window.axiom.suggestions.run({
        iri,
        mode: "synonyms",
        provider: "codex",
        bypassCache: true,
      });
    }, base + "Alpha");
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.axiom.suggestions.status()))?.iri,
      )
      .toBe(base + "Alpha");
    await runs()
      .getByRole("row", { name: "Open run for Alpha Subject", exact: true })
      .click();
    await expect(
      review().getByRole("combobox", { name: "Run history", exact: true }),
    ).toHaveValue(completed.runs[0].id);
    await expect(
      review().getByRole("checkbox", {
        name: "Select Alpha Subject Alias",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      review().getByText(
        "Wait for the suggestions for Alpha Subject to finish before selecting values.",
        { exact: true },
      ),
    ).toBeVisible();
    await unlink(hold);
    await expect(
      review().getByRole("checkbox", {
        name: "Select Alpha Subject Alias",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    await unlink(hold).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
});

test("synonym validation reads current values while retaining edit and workspace guards", async () => {
  const original = await documentFor("Beta");
  const candidates = [
    { value: "Beta Subject Alias", reason: "An equivalent wording variant." },
  ];
  await page.evaluate(
    ({ iri, epoch }) =>
      window.axiom.request("addFindSynonym", {
        iri,
        text: "Beta Subject Alias",
        datasetEpoch: epoch,
      }),
    { iri: base + "Beta", epoch: original.datasetEpoch },
  );
  const result = await page.evaluate(
    ({ iri, epoch, candidates }) =>
      window.axiom.request("validateSynonyms", {
        iri,
        values: candidates,
        datasetEpoch: epoch,
      }),
    { iri: base + "Beta", epoch: original.datasetEpoch, candidates },
  );
  expect(result).toEqual({
    values: [],
    excluded: [
      {
        value: "Beta Subject Alias",
        reason: "Already recorded for this entity.",
      },
    ],
  });
  await expect(
    page.evaluate(
      ({ iri, doc, candidates }) =>
        window.axiom.request("validateSynonyms", {
          iri,
          values: candidates,
          datasetEpoch: doc.datasetEpoch,
          version: doc.version,
        }),
      { iri: base + "Beta", doc: original, candidates },
    ),
  ).rejects.toThrow("The ontology changed");
  await expect(
    page.evaluate(
      ({ iri, epoch, candidates }) =>
        window.axiom.request("validateSynonyms", {
          iri,
          values: candidates,
          datasetEpoch: epoch + 1,
        }),
      { iri: base + "Beta", epoch: original.datasetEpoch, candidates },
    ),
  ).rejects.toThrow("The ontology changed");
});

test("batch cancellation lets the running target finish and keeps its failure reference", async () => {
  const hold = path.join(profile, "hold-Alpha Subject");
  await writeFile(hold, "hold");
  try {
    await start(["Gamma", "Alpha", "Beta"]);
    await expect
      .poll(async () => (await batches())[0].runs.map((r) => r.state))
      .toEqual(["failed", "running", "queued"]);
    const batch = (await batches())[0];
    expect(batch.runs[0].auditId).toBeTruthy();
    // craigtrim/axiom#149: a finished failure must not borrow the next target's progress.
    await runs()
      .getByRole("row", { name: "Open run for Gamma Subject", exact: true })
      .click();
    await expect(review().getByRole("alert")).toContainText(
      "Assistant exited with code 1. Fixture assistant failure",
    );
    await expect(review().locator(".ac-empty")).not.toContainText(
      "Preparing suggestions",
    );
    await expect(review().locator(".ac-scroll")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(
      review().getByRole("combobox", { name: "Run history" }),
    ).toHaveValue(batch.runs[0].id);
    await review()
      .getByRole("button", { name: "Error details", exact: true })
      .click();
    const audit = page.locator(
      '[data-panel="errorlog"] .ent[data-open="true"]',
    );
    await expect(audit).toHaveAttribute(
      "data-audit-id",
      batch.runs[0].auditId!,
    );
    const record = await page.evaluate(
      (id) => window.axiom.audit.read(id),
      batch.runs[0].auditId!,
    );
    expect(record.metadata.exitCode).toBe(1);
    expect(JSON.stringify(record)).toContain("Fixture assistant failure");
    await menu("view.suggestionruns");
    await runs()
      .getByRole("button", { name: "Error details", exact: true })
      .click();
    await expect(audit).toHaveAttribute(
      "data-audit-id",
      batch.runs[0].auditId!,
    );
    expect((await batches())[0].runs.map((r) => r.state)).toEqual([
      "failed",
      "running",
      "queued",
    ]);
    await menu("view.suggestionruns");
    await runs()
      .getByRole("button", { name: "Cancel the batch", exact: true })
      .click();
    await expect
      .poll(async () => (await batches())[0].runs.map((r) => r.state))
      .toEqual(["failed", "running", "cancelled"]);
    await expect(runs().getByRole("status")).toContainText(
      "No further targets will start.",
    );
    await unlink(hold);
    await expect
      .poll(async () => (await batches())[0].runs.map((r) => r.state))
      .toEqual(["failed", "completed", "cancelled"]);
    await expect(
      runs().getByRole("row", {
        name: "Open run for Alpha Subject",
        exact: true,
      }),
    ).toBeVisible();
    await runs()
      .getByRole("button", { name: "Error details", exact: true })
      .click();
    await expect(
      page.locator('[data-panel="errorlog"] .ent[data-open="true"]'),
    ).toHaveAttribute("data-audit-id", batch.runs[0].auditId!);
  } finally {
    await unlink(hold).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
});

test("rerunning uses the frozen batch and clearing does not reveal an older batch", async () => {
  await start(["Alpha", "Beta"], "synonyms");
  await expect
    .poll(async () => (await batches())[0].runs.map((r) => r.state))
    .toEqual(["completed", "completed"]);
  const first = (await batches())[0];
  await select(["Gamma"]);
  await menu("view.suggestionruns");
  await runs()
    .getByRole("button", { name: "Run the batch", exact: true })
    .click();
  await expect.poll(async () => (await batches())[0].id).not.toBe(first.id);
  const repeated = (await batches())[0];
  expect(repeated.runs.map((r) => r.iri)).toEqual(first.runs.map((r) => r.iri));
  expect(repeated.mode).toBe(first.mode);
  expect(repeated.provider).toBe(first.provider);
  await expect
    .poll(async () => (await batches())[0].runs.map((r) => r.state))
    .toEqual(["completed", "completed"]);
  const clear = runs().getByRole("button", {
    name: "Clear results",
    exact: true,
  });
  if (await clear.isVisible()) await clear.click();
  else {
    await runs().getByRole("button", { name: "More actions" }).click();
    await page
      .getByRole("menuitem", { name: "Clear results", exact: true })
      .click();
  }
  await expect(runs()).toContainText("Select nodes in Hierarchy");
  const remaining = await batches();
  expect(remaining.map((b) => b.id)).toContain(first.id);
  expect(remaining.map((b) => b.id)).not.toContain(repeated.id);
  await menu("pane.close");
  await menu("view.suggestionruns");
  await expect(runs()).toContainText("Select nodes in Hierarchy");
  await start(["Alpha", "Child"], "synonyms");
  expect((await batches())[0].id).not.toBe(repeated.id);
  await expect(runs().locator("tbody tr")).toHaveCount(2);
  await expect(runs()).toContainText("Alpha Subject");
});

test("closing and reopening the run list preserves work; completed histories survive restart", async () => {
  await start(["Alpha", "Beta"]);
  await menu("pane.close");
  await expect(runs()).toHaveCount(0);
  await expect
    .poll(async () => (await batches())[0].runs.map((r) => r.state))
    .toEqual(["completed", "completed"]);
  const batchId = (await batches())[0].id;
  await menu("view.suggestionruns");
  await expect(runs().locator("tbody tr")).toHaveCount(2);
  await menu("file.save");
  await app.close();
  await launch();
  await menu("view.suggestionruns");
  await expect(runs().locator("tbody tr")).toHaveCount(2);
  expect((await batches())[0].id).toBe(batchId);
  expect(
    (await readFile(path.join(profile, "calls.jsonl"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(2);
  await runs()
    .getByRole("row", { name: "Open run for Beta Subject", exact: true })
    .click();
  await expect(
    review().getByRole("checkbox", {
      name: "Select Beta Subject Addition",
      exact: true,
    }),
  ).toBeVisible();
});

test("show selected nodes in a new graph excludes unselected children and descendants", async () => {
  await select(["Alpha", "Beta"]);
  await row("Alpha").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Show in graph", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "New graph", exact: true }).click();
  await expect
    .poll(async () => (await state()).graph.nodes.map((n) => n.iri).sort())
    .toEqual([base + "Alpha", base + "Beta"]);
});

for (const mode of ["parents", "instances"] as const) {
  test(`${mode} batches retain the operation and open the corresponding single-node view`, async () => {
    await start(["Alpha", "Beta"], mode);
    await expect
      .poll(async () => (await batches())[0].runs.map((r) => r.state))
      .toEqual(["completed", "completed"]);
    const batch = (await batches())[0];
    expect(batch.mode).toBe(mode);
    const calls = await readFile(path.join(profile, "calls.jsonl"), "utf8");
    await runs()
      .getByRole("row", { name: "Open run for Beta Subject", exact: true })
      .click();
    await expect(
      review().getByRole("combobox", {
        name: /^(Suggest|Suggestion type)$/,
        exact: true,
      }),
    ).toHaveValue(mode);
    await expect(
      review().getByRole("combobox", { name: "Run history", exact: true }),
    ).toHaveValue(batch.runs[1].id);
    expect(await readFile(path.join(profile, "calls.jsonl"), "utf8")).toBe(
      calls,
    );
  });
}

test("collapsing branches prunes hidden selections and external navigation selects a revealed descendant", async () => {
  await select(["Alpha", "Child", "Grandchild", "Beta"]);
  await (await hierarchyFilter(page)).fill("");
  await expect(row("Child")).toHaveCount(0);
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(2);
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri, origin: "graph" }),
    base + "Grandchild",
  );
  await expect(row("Grandchild")).toBeVisible();
  await expect(row("Grandchild")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('.tree-row[aria-selected="true"]')).toHaveCount(1);
});

test("the detached run list keeps live status and opens the saved review", async () => {
  await start(["Alpha", "Beta"]);
  await menu("pane.detach");
  await expect.poll(() => app.windows().length).toBe(2);
  const detached = app.windows().find((w) => w !== page)!;
  const panel = detached.locator('[data-panel="suggestionruns"]');
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("row", {
      name: "Open run for Beta Subject",
      exact: true,
    }),
  ).toBeEnabled({ timeout: 15000 });
  await panel
    .getByRole("row", { name: "Open run for Beta Subject", exact: true })
    .click();
  await expect(
    review().getByRole("checkbox", {
      name: "Select Beta Subject Addition",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await readFile(path.join(profile, "calls.jsonl"), "utf8"))
      .trim()
      .split("\n"),
  ).toHaveLength(2);
});
