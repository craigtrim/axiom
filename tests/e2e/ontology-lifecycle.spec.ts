import { launchExample } from "./example-fixture";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const manifest = JSON.parse(
  await readFile("tests/fixtures/ontologies/manifest.json", "utf8"),
) as { id: string; title: string; file: string }[];
import type { Snapshot } from "../../src/shared/protocol";
import type { ProvenanceStatus } from "../../src/shared/provenance";
let app: ElectronApplication,
  page: Page,
  errors: string[] = [];
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function source(file: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
}
async function destination(file: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
}
test.beforeEach(async () => {
  errors = [];
  await mkdir("artifacts/testing", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/testing/lifecycle-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await launchExample({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
});
test.afterEach(async () => {
  await app.close();
  expect(errors).toEqual([]);
});
for (const fixture of manifest)
  test(
    fixture.title + ": import, view, edit, create, save, close and reopen",
    async () => {
      await page.evaluate(() => window.axiom.request("budget", { value: 100 }));
      await source(path.resolve("tests/fixtures/ontologies", fixture.file));
      await menu("file.import");
      await expect
        .poll(async () => (await state()).ontology.source?.fileName, {
          timeout: 30000,
        })
        .toBe(fixture.file);
      const imported = await state();
      expect(imported.tripleCount).toBeGreaterThan(0);
      expect(imported.graph.nodes.length).toBeGreaterThan(0);
      expect(imported.graph.nodes.length).toBeLessThanOrEqual(100);
      const entity = imported.entities.find(
        (e) =>
          (e.kind === "Class" || e.kind.endsWith("Property")) &&
          e.iri !== "http://www.w3.org/2002/07/owl#Thing",
      )!;
      expect(entity).toBeTruthy();
      await page.evaluate(
        (iri) => window.axiom.request("select", { iri }),
        entity.iri,
      );
      const inspector = page.locator('[data-panel="inspector"]');
      await inspector.getByText("Full identifier (IRI)", { exact: true }).click();
      await expect(inspector.getByRole("textbox", { name: "Entity IRI", exact: true })).toHaveValue(entity.iri);
      await menu("entity.rename");
      const rename = page.getByRole("textbox", {
        name: "Rename entity",
        exact: true,
      });
      await rename.fill("Edited " + fixture.title);
      await rename.press("Enter");
      await menu("entity.createClass");
      const form = page.getByRole("form", { name: "Create entity" });
      await form
        .getByRole("textbox", { name: "New entity label" })
        .fill("Course Credit");
      await form.getByRole("button", { name: "Create", exact: true }).click();
      await expect(form).toHaveCount(0);
      const edited = await state(),
        file = path.resolve(
          "artifacts/testing",
          fixture.id + "-lifecycle.axiom",
        );
      await destination(file);
      await menu("file.save");
      await expect
        .poll(async () => {
          try {
            return JSON.parse(await readFile(file, "utf8")).tbox?.length ?? 0;
          } catch {
            return 0;
          }
        })
        .toBeGreaterThan(0);
      await expect.poll(async () => (await state()).dirty).toBe(false);
      await menu("file.close");
      await expect.poll(async () => (await state()).classCount).toBe(1);
      await source(file);
      await menu("file.open");
      await expect
        .poll(async () => (await state()).tripleCount)
        .toBe(edited.tripleCount);
      const reopened = await state();
      expect(reopened.entities.find((e) => e.iri === entity.iri)?.label).toBe(
        "Edited " + fixture.title,
      );
      expect(reopened.entities.some((e) => e.label === "Course Credit")).toBe(
        true,
      );
      expect(reopened.graph.budget).toBe(100);
    },
  );
test("Windows metadata produces auditable PROV and retains source content", async () => {
  test.setTimeout(120000);
  const root = await mkdtemp(path.resolve("artifacts/testing/evidence-tree-"));
  await mkdir(path.join(root, "nested"));
  const file = path.join(root, "nested", "evidence.txt");
  await writeFile(file, "Original source content.\n");
  await writeFile(
    file + ":Zone.Identifier",
    "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.org/evidence.txt\r\n",
  );
  const original = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  await menu("file.provenance");
  const panel = page.getByRole("region", { name: "Filesystem provenance" });
  await expect(panel).toBeVisible();
  await source(root);
  await panel.getByRole("button", { name: "Choose folder" }).click();
  await expect(
    panel.getByRole("textbox", { name: "Provenance folder" }),
  ).toHaveValue(root);
  await panel
    .getByRole("button", { name: "Collect metadata", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          window.axiom.provenance.status().then((s) => s.status),
        ),
      { timeout: 90000 },
    )
    .toBe("complete");
  const result = await page.evaluate(() => window.axiom.provenance.status());
  expect(result.entries).toBe(3);
  expect(result.files).toBe(1);
  const records = (await readFile(result.evidencePath!, "utf8"))
    .trim()
    .split("\n")
    .map((v) => JSON.parse(v));
  const record = records.find((e) => e.path === file);
  expect(record.metadata.contentHash.value).toBe(original);
  expect(record.metadata.windows.native.value.basic.status).toBe("collected");
  expect(
    record.metadata.windows.properties.value.properties.length,
  ).toBeGreaterThan(15);
  expect(record.metadata.windows.security.value.ownerSid).toMatch(/^S-1-/);
  expect(
    record.metadata.windows.streams.value.some(
      (s: any) => s.name === "Zone.Identifier",
    ),
  ).toBe(true);
  expect(
    record.metadata.streamHashes.some(
      (s: any) => s.name === "Zone.Identifier" && s.value,
    ),
  ).toBe(true);
  expect(record.metadata.embedded.status).toBe("collected");
  expect(
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex"),
  ).toBe(original);
  const rdf = await readFile(result.rdfPath!, "utf8");
  expect(rdf).toContain("http://www.w3.org/ns/prov#wasGeneratedBy");
  expect(rdf).not.toContain("http://www.w3.org/ns/prov#wasAttributedTo");
  await page.screenshot({
    path: "artifacts/testing/filesystem-provenance.png",
  });
  await panel
    .getByRole("button", { name: "Open provenance ontology", exact: true })
    .click();
  await expect
    .poll(async () => (await state()).ontology.source?.fileName)
    .toBe("provenance.nt");
  const count = (await state()).tripleCount;
  expect(count).toBeGreaterThan(200);
  const workspace = path.resolve(
    "artifacts/testing/filesystem-provenance.axiom",
  );
  await destination(workspace);
  await menu("file.save");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await menu("file.close");
  await expect.poll(async () => (await state()).classCount).toBe(1);
  await source(workspace);
  await menu("file.open");
  await expect.poll(async () => (await state()).tripleCount).toBe(count);
});
