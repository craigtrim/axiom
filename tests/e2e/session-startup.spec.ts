import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
let app: ElectronApplication | undefined, page: Page, profile: string;
const errors: string[] = [];
const root = "http://www.w3.org/2002/07/owl#Thing";
const state = () =>
  page.evaluate(() => window.axiom.request<Snapshot>("state"));
async function launch() {
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
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await expect(page.locator(".status-counts")).toBeVisible();
}
async function menu(id: string) {
  await app!.evaluate(({ Menu, BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById(id)!
      .click({} as never, w, w.webContents as never);
  }, id);
}
async function close() {
  await app!.close();
  app = undefined;
}
const stored = async () =>
  JSON.parse(await readFile(path.join(profile, "last-session.json"), "utf8"));
async function save(file: string) {
  await app!.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await menu("file.saveAs");
  await expect.poll(async () => (await state()).dirty).toBe(false);
  await expect
    .poll(async () => {
      try {
        return (await stored()).workspacePath;
      } catch {
        return undefined;
      }
    })
    .toBe(file);
}
async function importFixture() {
  const file = path.join(profile, "courses.ttl");
  await writeFile(
    file,
    '@prefix : <https://example.org/courses#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n:Chemistry a owl:Class; rdfs:label "Chemistry" .\n:Organic a owl:Class; rdfs:subClassOf :Chemistry .',
  );
  await app!.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await menu("file.open");
  await expect
    .poll(async () => {
      try {
        return (await stored()).workspace.ontology.source?.fileName;
      } catch {
        return undefined;
      }
    })
    .toBe("courses.ttl");
  return file;
}
test.beforeEach(async () => {
  errors.length = 0;
  await mkdir("artifacts/testing", { recursive: true });
  profile = await mkdtemp(path.resolve("artifacts/testing/session-"));
  await launch();
});
test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    });
    await close();
  }
  expect(errors).toEqual([]);
});

test("first launch and an empty restart contain no demo data or graph nodes", async () => {
  const first = await state();
  expect(first.ontology.example).toBe(false);
  expect(first.individualCount).toBe(0);
  expect(first.graph.nodes).toHaveLength(0);
  expect(first.selected).toBeNull();
  await page.screenshot({ path: "artifacts/testing/session-empty-start.png" });
  await close();
  await launch();
  expect((await state()).graph.nodes).toHaveLength(0);
  expect((await state()).selected).toBeNull();
});
test("an imported ontology resumes without its original file and does not overwrite it", async () => {
  const file = await importFixture();
  const original = await readFile(file, "utf8");
  const before = await state();
  await close();
  await rename(file, file + ".moved");
  await launch();
  const after = await state();
  expect(after.ontology.source?.fileName).toBe("courses.ttl");
  expect(after.ontology.example).toBe(false);
  expect(after.tripleCount).toBe(before.tripleCount);
  expect(after.entities.some((e) => e.label === "Chemistry")).toBe(true);
  expect(await readFile(file + ".moved", "utf8")).toBe(original);
});
test("saved workspaces resume graph tabs, positions, selected edges, Details, and the Save destination", async () => {
  const a = await page.evaluate(
    (root) =>
      window.axiom.request<string>("createClass", {
        name: "Chemistry",
        parent: root,
        position: { x: 120, y: 180 },
      }),
    root,
  );
  const b = await page.evaluate(
    (a) =>
      window.axiom.request<string>("createClass", {
        name: "Organic",
        parent: a,
        position: { x: 360, y: 180 },
      }),
    a,
  );
  await page.evaluate(
    async ({ a, b }) => {
      await window.axiom.request("seed", { iris: [a, b], expand: false });
      await window.axiom.request("pin", { iri: a });
    },
    { a, b },
  );
  const second = await page.evaluate(
    (a) => window.axiom.request<string>("graphCreate", { iris: [a] }),
    a,
  );
  await menu("view.graph");
  await page.evaluate(() =>
    window.axiom.request("graphActivate", { id: "graph" }),
  );
  const edge = JSON.stringify([
    b,
    "http://www.w3.org/2000/01/rdf-schema#subClassOf",
    a,
  ]);
  await page.evaluate(
    (key) => window.axiom.request("selectEdge", { key }),
    edge,
  );
  await menu("view.details");
  const file = path.join(profile, "Chemistry.axiom");
  await save(file);
  const before = await state();
  await close();
  await launch();
  const after = await state();
  expect(Object.keys(after.graphs!)).toContain(second);
  expect(after.graph.selectedEdge).toBe(edge);
  expect(
    after.graph.nodes.map(({ iri, x, y, pinned }) => ({ iri, x, y, pinned })),
  ).toEqual(
    before.graph.nodes.map(({ iri, x, y, pinned }) => ({ iri, x, y, pinned })),
  );
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Details", exact: true })
      .getByRole("table", { name: "Edge statements" }),
  ).toBeVisible();
  await app!.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => {
      throw Error("Existing Save destination was lost");
    };
  });
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Chemistry revised" }),
    a,
  );
  await menu("file.save");
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(file, "utf8")).entities.find(
          (e: any) => e.iri === a,
        )?.label,
    )
    .toBe("Chemistry revised");
});
test("Cancel keeps the app open and Discard does not resurrect unsaved edits", async () => {
  const iri = await page.evaluate(
    (root) =>
      window.axiom.request<string>("createClass", {
        name: "Saved course",
        parent: root,
      }),
    root,
  );
  await save(path.join(profile, "saved.axiom"));
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Discard this" }),
    iri,
  );
  await app!.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({
      response: 2,
      checkboxChecked: false,
    });
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect
    .poll(
      async () => (await state()).entities.find((e) => e.iri === iri)?.label,
    )
    .toBe("Discard this");
  await app!.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await close();
  await launch();
  expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "Saved course",
  );
});
test("Save on close keeps the latest edits for the next launch", async () => {
  const iri = await page.evaluate(
    (root) =>
      window.axiom.request<string>("createClass", {
        name: "First course",
        parent: root,
      }),
    root,
  );
  const file = path.join(profile, "saved.axiom");
  await save(file);
  await page.evaluate(
    (iri) => window.axiom.request("rename", { iri, name: "Latest course" }),
    iri,
  );
  await app!.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  });
  await close();
  await launch();
  expect((await state()).entities.find((e) => e.iri === iri)?.label).toBe(
    "Latest course",
  );
});
test("Pizza remains available explicitly and closing it leaves the next launch empty", async () => {
  await menu("file.example");
  await expect
    .poll(async () => {
      try {
        return (await stored()).workspace.ontology.example;
      } catch {
        return false;
      }
    })
    .toBe(true);
  expect((await state()).individualCount).toBeGreaterThan(10000);
  await close();
  await launch();
  expect((await state()).ontology.example).toBe(true);
  await menu("file.close");
  await expect
    .poll(async () => !(await stored()).workspace.ontology.example)
    .toBe(true);
  await close();
  await launch();
  expect((await state()).ontology.example).toBe(false);
  expect((await state()).graph.nodes).toHaveLength(0);
});
test("a damaged session restores its last valid backup", async () => {
  await importFixture();
  await close();
  await writeFile(path.join(profile, "last-session.json"), "{ damaged");
  await launch();
  expect((await state()).ontology.source?.fileName).toBe("courses.ttl");
  expect((await state()).entities.some((e) => e.label === "Chemistry")).toBe(
    true,
  );
});
