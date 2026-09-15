import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication, page: Page, profile: string;
const errors: string[] = [];
const ttl =
  '@prefix ex:<https://example.org/>. @prefix owl:<http://www.w3.org/2002/07/owl#>. @prefix rdfs:<http://www.w3.org/2000/01/rdf-schema#>. ex:Course a owl:Class; rdfs:label "Course". ex:Lab a owl:Class; rdfs:subClassOf ex:Course; rdfs:label "Lab".';
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
const source = () =>
  page.getByRole("region", { name: "Ontology source editor" });
async function menu(id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, win, win.webContents as never);
  }, id);
}
async function enter(text: string) {
  await source()
    .getByRole("textbox", { name: "Ontology source", exact: true })
    .focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
  await expect(source().getByRole("status")).toContainText("Unapplied");
}
async function openFile(file: string, command = "file.import") {
  const epoch = (await state()).datasetEpoch;
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu(command);
  await expect
    .poll(async () => (await state()).datasetEpoch)
    .toBeGreaterThan(epoch);
}
async function importText(text: string, name: string) {
  const file = path.join(profile, name);
  await writeFile(file, text, "utf8");
  await openFile(file);
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/source-files-"));
  const env = { ...process.env, AXIOM_USER_DATA: profile } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
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
  await importText(ttl, "fixture.ttl");
});
test.afterEach(async () => {
  await app.close();
  expect(errors).toEqual([]);
});

test("source edits update the graph and taxonomy, inspector edits update source, and all formats preserve the document", async () => {
  await menu("view.source");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await enter(ttl.replace('"Course"', '"University Course"'));
  await source()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://example.org/Course",
        )?.label,
    )
    .toBe("University Course");
  expect(
    (await state()).graph.nodes.find(
      (n) => n.iri === "https://example.org/Course",
    )?.label,
  ).toBe("University Course");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://example.org/Course",
        )?.label,
    )
    .toBe("Course");
  await menu("edit.redo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://example.org/Course",
        )?.label,
    )
    .toBe("University Course");
  await page.evaluate(() =>
    window.axiom.request("select", { iri: "https://example.org/Course" }),
  );
  const fields = page.getByRole("form", { name: "Edit entity properties" });
  await fields
    .getByRole("textbox", { name: "Entity label", exact: true })
    .fill("Course from inspector");
  await page
    .getByRole("region", { name: "Entity inspector", exact: true })
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(source().locator(".monaco-editor")).toContainText(
    "Course from inspector",
  );
  const baseline = (await state()).tripleCount;
  for (const format of [
    "rdfxml",
    "jsonld",
    "ntriples",
    "nquads",
    "trig",
    "turtle",
  ]) {
    await source()
      .getByRole("combobox", { name: "Source format" })
      .selectOption(format);
    await expect(
      source().getByRole("combobox", { name: "Source format" }),
    ).toHaveValue(format);
    await expect(source().getByRole("status")).toContainText("Synchronized");
    expect((await state()).tripleCount).toBe(baseline);
  }
  await page.screenshot({ path: path.join(profile, "source-editor.png") });
});

test("invalid and conflicting source drafts survive switching views and cannot overwrite other edits", async () => {
  await menu("view.source");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await enter("<broken");
  await source()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(source().getByRole("alert")).toBeVisible();
  expect(
    (await state()).entities.find((e) => e.iri === "https://example.org/Course")
      ?.label,
  ).toBe("Course");
  await menu("view.graph");
  await menu("view.source");
  await expect(source().getByRole("status")).toContainText("Unapplied");
  await enter(ttl.replace('"Course"', '"Draft Course"'));
  await page.evaluate(() =>
    window.axiom.request("rename", {
      iri: "https://example.org/Course",
      name: "Changed elsewhere",
    }),
  );
  await expect(
    source().getByText("The ontology changed in another view.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    source().getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeDisabled();
  await expect(source().locator(".monaco-editor")).toContainText(
    "Draft Course",
  );
  await source().getByRole("button", { name: "More source actions" }).click();
  await source()
    .getByRole("button", { name: "Discard draft and reload" })
    .click();
  await expect(source().locator(".monaco-editor")).toContainText(
    "Changed elsewhere",
  );
});

test("saving a workspace flushes source edits from a closed pane and reopening preserves the result", async () => {
  await menu("view.source");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await enter(ttl.replace('"Course"', '"Saved source course"'));
  await menu("pane.close");
  await expect(source()).toHaveCount(0);
  const file = path.join(profile, "source.axiom");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.save");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await expect
    .poll(async () => {
      try {
        return await readFile(file, "utf8");
      } catch {
        return "";
      }
    })
    .toContain("Saved source course");
  await openFile(file, "file.open");
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://example.org/Course",
        )?.label,
    )
    .toBe("Saved source course");
});

test("file observations offer opening, reveal and opt-in native thumbnails without a raw inspector dump", async () => {
  const file = path.join(profile, "example image.png");
  const encoded = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(16, 255), { width: 2, height: 2 })
      .toPNG()
      .toString("base64"),
  );
  await writeFile(file, Buffer.from(encoded, "base64"));
  const uri = pathToFileURL(file).href;
  const data = `<${uri}> a <http://www.w3.org/ns/prov#Entity> . <urn:observation> a <http://www.w3.org/ns/prov#Entity> ; <urn:axiom:filesystem:describes> <${uri}> ; <urn:axiom:filesystem:raw:statBefore> "{raw metadata}" .`;
  await importText(data, "files.ttl");
  await page.evaluate(() =>
    window.axiom.request("select", { iri: "urn:observation" }),
  );
  const card = page.getByRole("region", { name: "Linked file" });
  await expect(card).toContainText(file);
  await expect(card.getByRole("img")).toHaveCount(0);
  await card.getByRole("button", { name: "Show thumbnail" }).click();
  await expect(
    card.getByRole("img", { name: "Thumbnail of example image.png" }),
  ).toBeVisible();
  await app.evaluate(({ shell }) => {
    (globalThis as any).fileActions = [];
    shell.openPath = async (p) => {
      (globalThis as any).fileActions.push(["open", p]);
      return "";
    };
    shell.showItemInFolder = (p) => {
      (globalThis as any).fileActions.push(["reveal", p]);
    };
  });
  await card.getByRole("button", { name: "Open file", exact: true }).click();
  await card.getByRole("button", { name: "Show in folder" }).click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).fileActions))
    .toEqual([
      ["open", file],
      ["reveal", file],
    ]);
  await expect(page.locator('[data-panel="inspector"]')).not.toContainText(
    "{raw metadata}",
  );
  await page
    .locator('[data-panel="inspector"]')
    .getByRole("button", { name: "More inspector actions" })
    .click();
  await page
    .locator('[data-panel="inspector"]')
    .getByRole("button", { name: "View source", exact: true })
    .click();
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await expect(source().locator(".monaco-editor")).toContainText(
    "raw metadata",
  );
  expect((await readFile(file)).toString("base64")).toBe(encoded);
  await page.screenshot({ path: path.join(profile, "file-preview.png") });
});

test("format switching applies valid drafts and preserves invalid drafts unchanged", async () => {
  await menu("view.source");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  const formats = source().getByRole("combobox", { name: "Source format" });
  await enter("<broken");
  await formats.selectOption("rdfxml");
  await expect(source().getByRole("alert")).toBeVisible();
  await expect(formats).toHaveValue("turtle");
  await expect(source().locator(".monaco-editor")).toContainText("<broken");
  expect(
    (await state()).entities.find((e) => e.iri === "https://example.org/Course")
      ?.label,
  ).toBe("Course");
  await enter(ttl.replace('"Course"', '"Converted source course"'));
  await formats.selectOption("rdfxml");
  await expect(formats).toHaveValue("rdfxml");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  expect(
    (await state()).entities.find((e) => e.iri === "https://example.org/Course")
      ?.label,
  ).toBe("Converted source course");
  await expect(source().locator(".monaco-editor")).toContainText(
    "Converted source course",
  );
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://example.org/Course",
        )?.label,
    )
    .toBe("Course");
});

test("native Undo, Redo and Find act on the focused source editor", async () => {
  await menu("view.source");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await source()
    .getByRole("textbox", { name: "Ontology source", exact: true })
    .focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("temporary");
  await expect(source().getByRole("status")).toContainText("Unapplied");
  await menu("edit.undo");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  expect(
    (await state()).entities.find((e) => e.iri === "https://example.org/Course")
      ?.label,
  ).toBe("Course");
  await menu("edit.redo");
  await expect(source().locator(".monaco-editor")).toContainText("temporary");
  await page.keyboard.press("Control+F");
  await expect(source().locator(".find-widget")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Find entities" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await enter(ttl.replace('"Course"', '"Draft source course"'));
  await source()
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await source()
    .getByRole("textbox", { name: "Ontology source", exact: true })
    .focus();
  await menu("edit.undo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://example.org/Course",
        )?.label,
    )
    .toBe("Course");
  await expect(source().getByRole("status")).toContainText("Synchronized");
  await menu("edit.redo");
  await expect
    .poll(
      async () =>
        (await state()).entities.find(
          (e) => e.iri === "https://example.org/Course",
        )?.label,
    )
    .toBe("Draft source course");
});
