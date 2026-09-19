import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { NS, SUBCLASS, THING } from "../../src/domain/model";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";
import type { SuggestionDocument } from "../../src/shared/suggestions";
import AxeBuilder from "@axe-core/playwright";
const base = "https://example.org/drag#";
const ttl =
  "@prefix : <" +
  base +
  ">. @prefix owl: <" +
  NS.owl +
  ">. @prefix rdfs: <" +
  NS.rdfs +
  ">. " +
  ':A a owl:Class; rdfs:label "A". :B a owl:Class; rdfs:label "B". :Z a owl:Class; rdfs:label "Z". ' +
  ':Child a owl:Class; rdfs:label "Child"; rdfs:subClassOf :A; rdfs:comment "Keep the description". :Leaf a owl:Class; rdfs:subClassOf :Child. ' +
  ":Multi a owl:Class; rdfs:subClassOf :A, :B. :Defined a owl:Class; owl:equivalentClass [a owl:Class; owl:intersectionOf (:A :B)]. " +
  ":Collapsed a owl:Class. :Nested a owl:Class; rdfs:subClassOf :Collapsed. :Instance a :Child.";
let app: ElectronApplication, page: Page, profile: string, file: string;
const errors: string[] = [];
const request = <T = unknown>(
  method: DomainMethod,
  args: Record<string, unknown> = {},
) =>
  page.evaluate(({ method, args }) => window.axiom.request<T>(method, args), {
    method,
    args,
  });
const state = () => request<Snapshot>("state");
const doc = (name = "Child") =>
  request<SuggestionDocument>("entityDocument", { iri: base + name });
const parents = async (name = "Child") =>
  (await doc(name)).statements
    .filter((t) => t.predicate === SUBCLASS)
    .map((t) => t.object.value);
const row = (name: string) =>
  page.locator(
    '[data-panel="hierarchy"] [data-entity-iri="' +
      (name === "Thing" ? THING : base + name) +
      '"]',
  );
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, w, w.webContents as never);
  }, id);
}
async function launch() {
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    if (process.env.AXIOM_TEST_BACKGROUND === "1")
      BrowserWindow.getAllWindows()[0].setFocusable(false);
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file + ".axiom",
    });
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  }, file);
  await expect(page.locator(".docking-workspace")).toBeVisible();
}
async function shownParent(name: string) {
  return page
    .locator('[data-panel="hierarchy"] [role="treeitem"]')
    .evaluateAll((rows, iri) => {
      const stack: string[] = [];
      for (const row of rows) {
        const depth = Number(row.getAttribute("aria-level")) - 1,
          id = row.getAttribute("data-entity-iri")!;
        if (id === iri) return depth ? stack[depth - 1] : null;
        stack[depth] = id;
        stack.length = depth + 1;
      }
      return undefined;
    }, base + name);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/taxonomy-move-"));
  file = path.join(profile, "tree.ttl");
  await writeFile(file, ttl);
  await launch();
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "Child"),
    )
    .toBe(true);
  await menu("view.hierarchy");
  await row("A").getByRole("button", { name: "Expand A", exact: true }).click();
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
test("native drop changes RDF, graph and Details together and survives undo, redo and restart", async () => {
  await request("seed", {
    iris: ["A", "Z", "Child", "Leaf"].map((n) => base + n),
    expand: false,
  });
  await request("freeze");
  await row("Child").dragTo(row("Z"));
  await expect.poll(() => parents()).toEqual([base + "Z"]);
  await expect.poll(() => shownParent("Child")).toBe(base + "Z");
  expect(await parents("Leaf")).toEqual([base + "Child"]);
  expect((await doc("Instance")).entity.types).toEqual([base + "Child"]);
  const g = (await state()).graph;
  expect(
    g.edges.some(
      (e) =>
        e.source === base + "Child" &&
        e.target === base + "Z" &&
        e.predicate === SUBCLASS,
    ),
  ).toBe(true);
  expect(
    g.edges.some(
      (e) =>
        e.source === base + "Child" &&
        e.target === base + "A" &&
        e.predicate === SUBCLASS,
    ),
  ).toBe(false);
  await menu("view.details");
  await expect(
    page.getByRole("region", { name: "Details", exact: true }),
  ).toContainText("Child");
  await expect(
    page
      .getByRole("region", { name: "Details", exact: true })
      .getByRole("combobox", { name: /Value/ }),
  ).toHaveValue("Z");
  await menu("edit.undo");
  await expect.poll(() => parents()).toEqual([base + "A"]);
  await menu("edit.redo");
  await expect.poll(() => parents()).toEqual([base + "Z"]);
  await page.screenshot({ path: "artifacts/testing/taxonomy-move.png" });
  await app.close();
  await launch();
  await expect.poll(() => parents()).toEqual([base + "Z"]);
  await expect.poll(() => shownParent("Child")).toBe(base + "Z");
});
test("a multiply-parented node moves the dragged branch and is shown at the drop target", async () => {
  await row("Multi").dragTo(row("Z"));
  await expect.poll(() => parents("Multi")).toEqual([base + "Z", base + "B"]);
  await expect.poll(() => shownParent("Multi")).toBe(base + "Z");
  await menu("edit.undo");
  await expect.poll(() => parents("Multi")).toEqual([base + "A", base + "B"]);
  await menu("edit.redo");
  await expect.poll(() => shownParent("Multi")).toBe(base + "Z");
  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .include('[data-panel="hierarchy"]')
    .analyze();
  expect(results.violations).toEqual([]);
});
test("moving a defined class adds a subclass assertion without rewriting its equivalent definition", async () => {
  const before = (await doc("Defined")).statements;
  await row("Defined").dragTo(row("Z"));
  await expect.poll(() => parents("Defined")).toEqual([base + "Z"]);
  expect(
    (await doc("Defined")).statements.filter((t) => t.predicate !== SUBCLASS),
  ).toEqual(before);
  await expect.poll(() => shownParent("Defined")).toBe(base + "Z");
});
test("hovering expands a closed destination and dropping on its child reparents the dragged node", async () => {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await row("Child").dispatchEvent("dragstart", { dataTransfer: transfer });
  await row("Collapsed").dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(row("Collapsed")).toHaveClass(/taxonomy-drop-target/);
  await expect(row("Nested")).toBeVisible();
  await row("Nested").dispatchEvent("dragover", { dataTransfer: transfer });
  await row("Nested").dispatchEvent("drop", { dataTransfer: transfer });
  await expect.poll(() => parents()).toEqual([base + "Nested"]);
  await expect.poll(() => shownParent("Child")).toBe(base + "Nested");
  await expect(page.locator(".taxonomy-drop-hint")).toHaveCount(0);
});
test("self and descendant drops are rejected and stale drag data cannot edit a newer ontology", async () => {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await row("A").dispatchEvent("dragstart", { dataTransfer: transfer });
  await row("Child").dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator(".taxonomy-drop-hint")).toContainText(
    "descendants",
  );
  await expect(row("Child")).not.toHaveClass(/taxonomy-drop-target/);
  await row("A").dispatchEvent("dragend", { dataTransfer: transfer });
  const stale = await page.evaluateHandle(() => new DataTransfer());
  await row("Child").dispatchEvent("dragstart", { dataTransfer: stale });
  await request("rename", { iri: base + "B", name: "B changed" });
  await row("Z").dispatchEvent("drop", { dataTransfer: stale });
  await expect.poll(() => parents()).toEqual([base + "A"]);
  await expect(page.locator(".taxonomy-drop-target")).toHaveCount(0);
  const result = await page.evaluate(
    async ({ iri, parent }) => {
      const s = await window.axiom.request<Snapshot>("state");
      try {
        await window.axiom.request("moveClass", {
          iri,
          parent,
          fromParent: null,
          version: s.version,
          datasetEpoch: s.datasetEpoch,
        });
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    },
    { iri: THING, parent: base + "Z" },
  );
  expect(result).toContain("root");
});
test("dragging from the taxonomy into Details still opens the entity without moving it", async () => {
  const before = await parents();
  await row("Child").dragTo(
    page.getByRole("region", { name: "Entity inspector", exact: true }),
  );
  await expect(
    page.getByRole("region", { name: "Details", exact: true }),
  ).toContainText("Child");
  expect(await parents()).toEqual(before);
});

test("dragging near the tree edge scrolls a long taxonomy and cancellation stops scrolling without edits", async () => {
  const extra = Array.from(
    { length: 300 },
    (_, i) => ":Middle" + i + " a owl:Class.",
  ).join(" ");
  await writeFile(file, ttl + " " + extra);
  await menu("file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === base + "Middle299"),
    )
    .toBe(true);
  const expand = row("A").getByRole("button", {
    name: "Expand A",
    exact: true,
  });
  if (await expand.count()) await expand.click();
  await row("Child").scrollIntoViewIfNeeded();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await row("Child").dispatchEvent("dragstart", { dataTransfer: transfer });
  const tree = page.getByRole("tree", { name: "Class hierarchy", exact: true }),
    bounds = (await tree.boundingBox())!;
  await row("A").dispatchEvent("dragover", {
    dataTransfer: transfer,
    clientX: bounds.x + 50,
    clientY: bounds.y + bounds.height - 2,
  });
  await expect
    .poll(() => tree.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(150);
  await row("Child").dispatchEvent("dragend", { dataTransfer: transfer });
  const positions = await tree.evaluate(async (e) => {
    const before = e.scrollTop;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return [before, e.scrollTop];
  });
  expect(positions[0]).toBe(positions[1]);
  expect(await parents()).toEqual([base + "A"]);
  await expect(page.locator(".taxonomy-drop-hint")).toHaveCount(0);
});
