import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NS, type Triple } from "../../src/domain/model";
import type { Snapshot } from "../../src/shared/protocol";
import { holdRequests, waitForHeld, releaseRequests } from "./held-requests";

const base = "https://warnings.test/",
  predicate = NS.rdfs + "seeAlso";
let app: ElectronApplication, page: Page, profile: string, errors: string[];
const details = () =>
  page.getByRole("region", { name: "Details", exact: true });
const row = () => details().locator(`tr[data-predicate="${predicate}"]`);
const warning = () =>
  row().getByRole("button", { name: "Shared seeAlso value warning" });
const popup = () =>
  page.getByRole("group", { name: "Shared seeAlso value", exact: true });
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function select(subject: string) {
  await page.evaluate(
    (iri) => window.axiom.request("select", { iri }),
    base + subject,
  );
  await menu("view.details");
  await expect(details()).toHaveAttribute("data-entity-iri", base + subject);
}
async function saved(subject = "A") {
  return page.evaluate(
    async ({ iri, predicate }) => {
      const doc = await window.axiom.request<{ statements: Triple[] }>(
        "entityDocument",
        { iri },
      );
      return doc.statements
        .filter((t) => t.predicate === predicate)
        .map((t) => t.object.value);
    },
    { iri: subject.includes(":") ? subject : base + subject, predicate },
  );
}
async function launch() {
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
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ BrowserWindow, dialog }) => {
    BrowserWindow.getAllWindows().forEach((win) => win.setFocusable(false));
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await expect(page.locator(".docking-workspace")).toBeVisible();
}
async function capture(name: string) {
  await page.screenshot({
    path: `artifacts/seealso-warnings/${process.env.AXIOM_TEST_EXE ? "packaged-" : ""}${name}.png`,
  });
}
async function checkPopupGeometry() {
  await expect
    .poll(() =>
      popup().evaluate((el) => {
        const box = el.getBoundingClientRect();
        const buttons = [...el.querySelectorAll("button")];
        return (
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= innerWidth + 1 &&
          box.bottom <= innerHeight + 1 &&
          el.scrollWidth <= el.clientWidth + 1 &&
          buttons.every(
            (button) =>
              button.getBoundingClientRect().width > box.width * 0.7 &&
              button.scrollWidth <= button.clientWidth + 1,
          )
        );
      }),
    )
    .toBe(true);
}
test.beforeEach(async () => {
  errors = [];
  await mkdir("artifacts/seealso-warnings", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/seealso-warnings/profile-"));
  await launch();
  const file = path.join(profile, "warnings.ttl");
  await writeFile(
    file,
    `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .
    : a owl:Ontology . :A a owl:Class; rdfs:label "First course"; rdfs:seeAlso "Shared", "Unique" .
    :B a owl:Class; rdfs:label "Second course"; rdfs:seeAlso "Shared", "Another shared value" .
    :C a owl:Class; rdfs:label "Shared" .`,
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
    .toBe("warnings.ttl");
  await select("A");
  await expect(warning()).toHaveCount(1);
});
test.afterEach(async ({}, info) => {
  try {
    if (info.status !== info.expectedStatus && page && !page.isClosed())
      await info.attach("warning-ui", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
  }
});

test("shared values stay editable; warnings explain the match, remain accessible, and never block saving or Undo", async () => {
  const fields = row().getByRole("combobox", { name: /Value/ });
  await warning().click();
  await expect(popup()).toContainText("Second course");
  await expect(popup()).toContainText(base + "B");
  await expect(popup()).toContainText("Shared values are allowed");
  await checkPopupGeometry();
  await capture("light-warning");
  const axe = await new AxeBuilder({ page })
    .setLegacyMode()
    .include(".seealso-warning-popup")
    .analyze();
  expect(
    axe.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await popup()
    .getByRole("button", { name: "Dismiss this warning", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(popup()).not.toBeVisible();
  await expect(warning()).toBeFocused();
  await fields.nth(1).fill("Another shared value");
  await expect(warning()).toHaveCount(2);
  await expect(fields.nth(1)).toBeFocused();
  await expect(fields.nth(1)).toHaveAttribute("aria-invalid", "false");
  await fields.nth(1).press("Enter");
  await expect.poll(() => saved()).toEqual(["Shared", "Another shared value"]);
  await warning().last().focus();
  await menu("edit.undo");
  await expect.poll(() => saved()).toEqual(["Shared", "Unique"]);
  await expect(warning()).toHaveCount(1);
  await warning().focus();
  await menu("edit.redo");
  await expect.poll(() => saved()).toEqual(["Shared", "Another shared value"]);
  await expect(warning()).toHaveCount(2);
  await menu("theme.dark");
  await warning().last().click();
  await checkPopupGeometry();
  await capture("dark-warning");
  await expect(popup()).toContainText("Second course");
});

test("instance dismissal is scoped and persisted; global opt-out survives restart and can be reversed", async () => {
  const before = await state();
  await warning().click();
  await popup()
    .getByRole("button", { name: "Dismiss this warning", exact: true })
    .click();
  await expect(warning()).toHaveCount(0);
  expect((await state()).version).toBe(before.version);
  await select("B");
  await expect(warning()).toHaveCount(1);
  await select("A");
  await expect(warning()).toHaveCount(0);
  await row()
    .getByRole("combobox", { name: /Value/ })
    .first()
    .fill("Another shared value");
  await expect(warning()).toHaveCount(1);
  await row().getByRole("combobox", { name: /Value/ }).first().press("Escape");
  await expect(warning()).toHaveCount(0);
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(profile, "warnings.axiom"),
  );
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(path.join(profile, "workbench.json"), "utf8"))
          .panelState["warnings.seeAlso"]?.dismissed.length,
    )
    .toBe(1);
  await app.close();
  await launch();
  await select("A");
  await expect(warning()).toHaveCount(0);
  await select("B");
  await expect(warning()).toHaveCount(1);
  await warning().click();
  await popup()
    .getByRole("button", { name: "Don’t warn about shared seeAlso values" })
    .click();
  await expect(warning()).toHaveCount(0);
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(path.join(profile, "workbench.json"), "utf8"))
          .panelState["warnings.seeAlso"]?.enabled,
    )
    .toBe(false);
  await app.close();
  await launch();
  await select("B");
  await expect(warning()).toHaveCount(0);
  // A workspace may carry old preferences from another computer. It must not
  // override this user's global opt-out or occurrence dismissals.
  const workspaceFile = path.join(profile, "warnings.axiom");
  const workspace = JSON.parse(await readFile(workspaceFile, "utf8"));
  workspace.workbench.panelState["warnings.seeAlso"] = {
    enabled: true,
    dismissed: [],
  };
  await writeFile(workspaceFile, JSON.stringify(workspace));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, workspaceFile);
  await menu("file.open");
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.axiom.preferences.load()).panelState?.[
            "warnings.seeAlso"
          ],
      ),
    )
    .toMatchObject({ enabled: false });
  await select("B");
  await expect(warning()).toHaveCount(0);
  await menu("warnings.settings");
  const dialog = page.getByRole("dialog", { name: "Warnings", exact: true });
  await expect(dialog.locator(".seealso-warning-setting")).toHaveCSS(
    "flex-direction",
    "row",
  );
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Restore dismissed warnings" })
    .click();
  await capture("warning-settings");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(warning()).toHaveCount(1);
  await select("A");
  await expect(warning()).toHaveCount(1);
});

test("Find keeps Synonym for a name match and an existing value, including its folded menu", async () => {
  await select("C");
  await menu("view.find");
  const find = page.getByRole("region", { name: "Find entities results" });
  await find.getByRole("searchbox").fill("Shared");
  const result = find
    .locator(".find-results tbody tr")
    .filter({ has: page.getByRole("button", { name: "Shared", exact: true }) });
  await result.focus();
  const add = result.getByRole("button", {
    name: "Add Shared as a synonym of Shared",
    exact: true,
  });
  const folded = !(await add.count());
  const openFolded = async () => {
    await result
      .getByRole("button", { name: "More ways to extend Shared" })
      .click();
    await page.getByRole("menuitem", { name: /^Synonym/ }).click();
  };
  if (folded) await openFolded();
  else await add.click();
  await expect.poll(() => saved("C")).toEqual(["Shared"]);
  await expect(find).toContainText("Shared added to Shared");
  const version = (await state()).version;
  if (folded) await openFolded();
  else await add.click();
  await expect(find).toContainText("Shared already records Shared");
  expect((await state()).version).toBe(version);
  expect(await saved("C")).toEqual(["Shared"]);
  await select("C");
  await expect(warning()).toHaveCount(1);
  await warning().click();
  await expect(popup()).toContainText("2 other entities");
  await capture("find-added-shared-value");
});

test("Find creation warns while typing but permits creating an entity with the shared value", async () => {
  await menu("view.find");
  const find = page.getByRole("region", { name: "Find entities results" });
  await find.getByRole("searchbox").fill("New course with shared value");
  await find
    .getByRole("button", {
      name: 'Add "New Course With Shared Value" as a new class',
      exact: true,
    })
    .click();
  const form = find.getByRole("region", { name: "Add to the ontology" });
  await form.getByRole("button", { name: "+ Add row", exact: true }).click();
  await form
    .getByRole("combobox", { name: "Predicate 1", exact: true })
    .selectOption(predicate);
  await form
    .getByRole("textbox", { name: "Value 1", exact: true })
    .fill("Shared");
  await expect(
    form.getByRole("button", { name: "Shared seeAlso value warning" }),
  ).toBeVisible();
  const iri = await form
    .getByRole("textbox", { name: "Subject IRI", exact: true })
    .inputValue();
  await expect(
    form.getByRole("button", { name: "Create class", exact: true }),
  ).toBeEnabled();
  await capture("creation-warning");
  await form.getByRole("button", { name: "Create class", exact: true }).click();
  await expect.poll(() => saved(iri)).toEqual(["Shared"]);
});

test("warning popup fits a narrow detached pane at 150% zoom and keeps keyboard dismissal reachable", async () => {
  const tabset = page
    .locator(".flexlayout__tabset")
    .filter({ has: page.getByRole("tab", { name: "Details", exact: true }) });
  const newWindow = app.waitForEvent("window");
  await tabset.getByRole("button", { name: "Popout selected tab" }).click();
  const detached = await newWindow;
  detached.on("pageerror", (error) => errors.push(error.message));
  await (
    await app.browserWindow(detached)
  ).evaluate((win) => {
    win.setFocusable(false);
    win.setMinimumSize(100, 100);
    win.setContentSize(560, 640);
  });
  page = detached;
  const host = page.locator('[data-pane-id="details"]');
  await expect(warning()).toBeVisible();
  await host.dispatchEvent("wheel", {
    ctrlKey: true,
    deltaMode: 0,
    deltaY: -Math.log(1.5) / 0.0015,
  });
  await expect(host).toHaveAttribute("data-pane-zoom", "1.5");
  await warning().scrollIntoViewIfNeeded();
  await warning().press("Enter");
  await expect(popup()).toBeVisible();
  await checkPopupGeometry();
  await capture("detached-zoom-warning");
  await popup()
    .getByRole("button", { name: "Dismiss this warning", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(warning()).toHaveCount(0);
});

test("late duplicate lookups cannot decorate a newer value and failures do not prevent a save", async () => {
  await holdRequests(app, ["seeAlsoMatches"]);
  const field = row().getByRole("combobox", { name: /Value/ }).last();
  await field.fill("Shared");
  await waitForHeld(app);
  await field.fill("Entirely different");
  await waitForHeld(app, 2);
  await releaseRequests(app, { reverse: true });
  await expect(warning()).toHaveCount(1);
  await field.press("Enter");
  await expect.poll(() => saved()).toEqual(["Shared", "Entirely different"]);
  await holdRequests(app, ["seeAlsoMatches"]);
  await field.fill("Another shared value");
  await waitForHeld(app);
  await releaseRequests(app, { fail: true });
  await field.press("Enter");
  await expect.poll(() => saved()).toEqual(["Shared", "Another shared value"]);
});
