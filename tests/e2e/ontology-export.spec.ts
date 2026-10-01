import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonize } from "rdf-canonize";
import { parseRdf, writeRdf } from "../../src/domain/rdf-io";
import { NS, type Triple } from "../../src/domain/model";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";
import type { SourceDocument } from "../../src/shared/source";

const base = "https://example.test/export/";
const iri = base + "Course";
const fixture = `@prefix ex: <${base}> .
@prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .
ex:Course a owl:Class; rdfs:label "Course"@en; rdfs:comment "Original comment";
  ex:detail [ex:note "A & B < C"; ex:count "003"^^<${NS.xsd}integer>] .
ex:Lab a owl:Class; rdfs:label "Lab"; rdfs:subClassOf ex:Course .`;
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const request = <T = unknown>(method: DomainMethod, args = {}) =>
  page.evaluate(({ method, args }) => window.axiom.request<T>(method, args), {
    method,
    args,
  });
const state = () => request<Snapshot>("state");
const sourceDocument = () => request<SourceDocument>("sourceDocument");
const details = () =>
  page.getByRole("region", { name: "Details", exact: true });
const source = () =>
  page.getByRole("region", { name: "Ontology source editor" });
const canonical = async (triples: Triple[]) =>
  canonize(await writeRdf(triples, "nquads"), {
    algorithm: "RDFC-1.0",
    inputFormat: "application/n-quads",
  });
const canonicalText = async (text: string, file: string) =>
  canonical((await parseRdf(text, file, base)).triples);
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, undefined as never);
  }, id);
}
async function importText(text: string, name = "fixture.ttl") {
  const file = path.join(profile, name);
  await writeFile(file, text);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  const epoch = (await state()).datasetEpoch;
  await menu("file.open");
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
  await request("select", { iri });
}
async function chooseOutput(
  name = "export.ttl",
  canceled = false,
  hold = false,
) {
  const file = path.join(profile, name);
  await app.evaluate(
    ({ dialog }, { file, canceled, hold }) => {
      (globalThis as any).__exportCalls = 0;
      dialog.showSaveDialog = async () => {
        (globalThis as any).__exportCalls++;
        if (hold)
          await new Promise<void>((resolve) => {
            (globalThis as any).__releaseExport = resolve;
          });
        return { canceled, filePath: file };
      };
    },
    { file, canceled, hold },
  );
  return file;
}
async function written(file: string) {
  await expect
    .poll(() => readFile(file, "utf8").catch(() => null))
    .not.toBeNull();
  return readFile(file, "utf8");
}
async function exportMatches(before: SourceDocument, name = "export.ttl") {
  const file = await chooseOutput(name);
  await menu("file.exportOntology");
  expect(await canonicalText(await written(file), file)).toBe(
    await canonicalText(
      before.text,
      "before." + (before.format === "trig" ? "trig" : "ttl"),
    ),
  );
  return file;
}
async function openDetails() {
  await menu("view.details");
  await expect(
    details().getByRole("textbox", { name: "Entity label", exact: true }),
  ).toHaveValue("Course");
}
async function incompleteRow() {
  await openDetails();
  await details().getByRole("button", { name: "Add row", exact: true }).click();
  const predicate = details()
    .getByRole("combobox", { name: /^Predicate / })
    .last();
  await predicate.selectOption(NS.rdfs + "subClassOf");
  return predicate;
}
async function enterSource(text: string) {
  await menu("view.source");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  const editor = source().getByRole("textbox", {
    name: "Ontology source",
    exact: true,
  });
  await editor.focus();
  await editor.press("Control+a");
  await page.keyboard.insertText(text);
  await expect(source().getByRole("status")).toContainText("Unapplied");
}
async function history() {
  const s = await state();
  return {
    version: s.version,
    dirty: s.dirty,
    canUndo: s.canUndo,
    canRedo: s.canRedo,
    undoLabel: s.undoLabel,
    redoLabel: s.redoLabel,
  };
}

test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/ontology-export-"));
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.AXIOM_TEST_EXE,
    args: process.env.AXIOM_TEST_EXE ? [] : ["."],
    env,
  });
  page = await app.firstWindow();
  if (process.env.AXIOM_TEST_BACKGROUND === "1")
    await (
      await app.browserWindow(page)
    ).evaluate((w) => w.setFocusable(false));
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ dialog }) => {
    (globalThis as any).__exportErrors = [];
    dialog.showMessageBox = async (...args: any[]) => {
      (globalThis as any).__exportErrors.push(args.at(-1).detail);
      return { response: 0, checkboxChecked: false };
    };
  });
  await importText(fixture);
});
test.afterEach(async () => {
  const dialogs = await app.evaluate(() => {
    (globalThis as any).__releaseExport?.();
    (globalThis as any).__releaseEdit?.();
    return (globalThis as any).__exportErrors;
  });
  await app.close();
  expect(errors).toEqual([]);
  expect(dialogs).toEqual([]);
});

test("exports committed triples while leaving an unfinished Details row intact", async () => {
  const before = await sourceDocument();
  const predicate = await incompleteRow();
  const rows = await details().locator("tbody tr").count();
  const original = await history();
  await exportMatches(before);
  await expect(predicate).toHaveValue(NS.rdfs + "subClassOf");
  await expect(details().locator("tbody tr")).toHaveCount(rows);
  expect(await history()).toEqual(original);
  expect((await sourceDocument()).text).toBe(before.text);
});

test("a complete focused cell remains a draft until its normal commit", async () => {
  await openDetails();
  const before = await sourceDocument();
  const comment = details().getByRole("textbox", {
    name: "Entity comment",
    exact: true,
  });
  await comment.fill("Uncommitted cell");
  expect((await sourceDocument()).text).toBe(before.text);
  const original = await history();
  await exportMatches(before);
  await expect(comment).toHaveValue("Uncommitted cell");
  expect(await history()).toEqual(original);
  await comment.press("Tab");
  await expect
    .poll(async () => (await sourceDocument()).text)
    .toContain("Uncommitted cell");
  await exportMatches(await sourceDocument(), "after-commit.ttl");
});

for (const kind of ["valid", "invalid", "stale"] as const)
  for (const closed of [false, true])
    test(`${kind} ontology source stays unapplied with its pane ${closed ? "closed" : "open"}`, async () => {
      const initial = await sourceDocument();
      const text =
        kind === "invalid"
          ? "<broken source draft"
          : initial.text.replace('"Course"', '"Unapplied course"');
      await enterSource(text);
      if (kind === "stale")
        await request("rename", { iri, name: "Committed elsewhere" });
      const before = await sourceDocument();
      if (closed) {
        await menu("pane.close");
        await expect(source()).toHaveCount(0);
      }
      const original = await history();
      await exportMatches(before);
      expect(await history()).toEqual(original);
      expect((await sourceDocument()).text).toBe(before.text);
      if (closed) await menu("view.source");
      await expect(source().getByRole("status")).toContainText("Unapplied");
      await expect(source().locator(".monaco-editor")).toContainText(
        kind === "invalid" ? "broken source draft" : "Unapplied course",
      );
      if (kind === "stale")
        await expect(
          source().getByRole("button", { name: "Apply changes", exact: true }),
        ).toBeDisabled();
      else if (kind === "valid") {
        await source()
          .getByRole("button", { name: "Apply changes", exact: true })
          .click();
        await expect
          .poll(async () => (await sourceDocument()).text)
          .toContain("Unapplied course");
      }
    });

for (const valid of [true, false])
  test(`${valid ? "valid" : "invalid"} Details source does not block or change export`, async () => {
    const before = await sourceDocument();
    await openDetails();
    await details().locator(".entity-source > summary").click();
    const editor = details().getByRole("textbox", {
      name: "Entity source",
      exact: true,
    });
    await expect(editor).toBeEnabled();
    await editor.focus();
    await editor.press("Control+a");
    const text = valid
      ? `<${iri}> <${NS.rdfs}label> "Entity source draft" .`
      : "<broken entity source";
    await page.keyboard.insertText(text);
    const save = details().getByRole("button", {
      name: "Save source",
      exact: true,
    });
    await expect(save).toBeEnabled();
    const original = await history();
    await exportMatches(before);
    expect(await history()).toEqual(original);
    await expect(save).toBeEnabled();
    await expect(details().locator(".monaco-editor")).toContainText(
      valid ? "Entity source draft" : "broken entity source",
    );
  });

test("canceling export leaves simultaneous grid and source drafts and Undo history untouched", async () => {
  const before = await sourceDocument();
  await incompleteRow();
  await enterSource(before.text.replace('"Course"', '"Canceled source draft"'));
  const original = await history();
  const file = await chooseOutput("canceled.ttl", true);
  await menu("file.exportOntology");
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__exportCalls))
    .toBe(1);
  expect(await readFile(file, "utf8").catch(() => null)).toBeNull();
  expect((await sourceDocument()).text).toBe(before.text);
  expect(await history()).toEqual(original);
  await expect(source().getByRole("status")).toContainText("Unapplied");
  await menu("view.details");
  await expect(
    details()
      .getByRole("combobox", { name: /^Predicate / })
      .last(),
  ).toHaveValue(NS.rdfs + "subClassOf");
});

test("an automatic cell save finishing during the file dialog belongs to the next export", async () => {
  await openDetails();
  const before = await sourceDocument();
  // Hold the real update request before it reaches the worker, then release it
  // while the export dialog is open. No timing assumptions or fake store edits.
  await app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get("domain:request");
    ipcMain.removeHandler("domain:request");
    ipcMain.handle("domain:request", async (event, method, args) => {
      if (method === "updateEntity") {
        (globalThis as any).__editWaiting = true;
        await new Promise<void>((resolve) => {
          (globalThis as any).__releaseEdit = resolve;
        });
      }
      return original(event, method, args);
    });
  });
  const comment = details().getByRole("textbox", {
    name: "Entity comment",
    exact: true,
  });
  await comment.fill("Automatic commit during dialog");
  await comment.press("Tab");
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__editWaiting))
    .toBe(true);
  const file = await chooseOutput("pending.ttl", false, true);
  await menu("file.exportOntology");
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__exportCalls))
    .toBe(1);
  await app.evaluate(() => (globalThis as any).__releaseEdit());
  await expect
    .poll(async () => (await sourceDocument()).text)
    .toContain("Automatic commit during dialog");
  await app.evaluate(() => (globalThis as any).__releaseExport());
  expect(await canonicalText(await written(file), file)).toBe(
    await canonicalText(before.text, "before.ttl"),
  );
  await expect(comment).toHaveValue("Automatic commit during dialog");
  await exportMatches(await sourceDocument(), "subsequent.ttl");
});

for (const extension of [
  "ttl",
  "rdf",
  "owl",
  "xml",
  "nt",
  "trig",
  "nq",
  "jsonld",
])
  test(`.${extension} export retains RDF semantics and includes committed unsaved changes`, async () => {
    await request("rename", { iri, name: "Committed without workspace Save" });
    const before = await sourceDocument();
    const original = await history();
    expect(original.dirty).toBe(true);
    await exportMatches(before, "ontology." + extension);
    expect(await history()).toEqual(original);
  });

for (const extension of ["trig", "nq", "jsonld"])
  test(`.${extension} export preserves named graphs with a pending draft`, async () => {
    await importText(
      fixture + `\nex:graph { ex:Course ex:note "Named graph value" . }`,
      "named.trig",
    );
    const before = await sourceDocument();
    await incompleteRow();
    await exportMatches(before, "named." + extension);
  });

test("workspace Save still commits complete grid edits and retains incomplete and source drafts", async () => {
  await incompleteRow();
  const before = await sourceDocument();
  await enterSource(
    before.text.replace('"Course"', '"Retained workspace source"'),
  );
  await request("select", { iri: base + "Lab" });
  await menu("view.details");
  const label = details().getByRole("textbox", {
    name: "Entity label",
    exact: true,
  });
  await expect(label).toHaveValue("Lab");
  await label.fill("Saved grid label");
  const file = await chooseOutput("saved.axiom");
  await menu("file.saveAs");
  const saved = JSON.parse(await written(file));
  expect(saved.entities.some((e: any) => e.label === "Saved grid label")).toBe(
    true,
  );
  expect(saved.editorDrafts.source.text).toContain("Retained workspace source");
  expect(
    saved.editorDrafts.entities.some(
      (d: any) =>
        d.iri === iri &&
        d.statements.some(
          (t: Triple) =>
            t.predicate === NS.rdfs + "subClassOf" && !t.object.value,
        ),
    ),
  ).toBe(true);
});

test("the internal snapshot and serialization operations are unavailable to renderer callers", async () => {
  await expect(request("rdfExportSnapshot")).rejects.toThrow(
    "Unknown operation",
  );
  await expect(
    request("rdfExport", { statements: [], format: "turtle" }),
  ).rejects.toThrow("Unknown operation");
});
