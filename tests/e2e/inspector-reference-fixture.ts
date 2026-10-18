// craigtrim/axiom#89: load the reference's subjects and statements as real Turtle.
import { expect, _electron, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import path from "node:path";
import type { InspectorData, Snapshot } from "../../src/shared/protocol";
export const inspectorReference = path.resolve(
  "tests/fixtures/inspector-visual/visual-reference.html",
);
export const inspectorBase = "https://axiom.test/inspector#";
export interface FixtureEntity {
  id: string;
  kind: string;
  label: string;
  iri: string;
  st: [string, string[]][];
}
export async function launchInspector(theme = "light") {
  const bytes = await readFile(inspectorReference);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "8cbf4bb2ba402c3a2a874284c89fdb0b9cf8454a70f7634499c17fc954e562a9",
  );
  const html = bytes.toString("utf8");
  const entities = runInNewContext(
    html.slice(
      html.indexOf("  var ENTITIES ="),
      html.indexOf("  var PREDICATES ="),
    ) + ";ENTITIES",
  ) as FixtureEntity[];
  await mkdir("artifacts/issue-89", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-89/profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  const file = path.join(profile, "inspector.ttl");
  const triples = entities.flatMap((e) =>
    e.st.flatMap(([p, values]) =>
      values.map(
        (v) =>
          `${e.iri} ${p} ${/^(ax|xsd):/.test(v) ? v : JSON.stringify(v)} .`,
      ),
    ),
  );
  triples.push("ax:credits a owl:DatatypeProperty .");
  await writeFile(
    file,
    `@prefix ax: <${inspectorBase}> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n` +
      triples.join("\n"),
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    args: [
      ".",
      "--force-device-scale-factor=2",
      "--disable-lcd-text",
      "--disable-gpu",
      "--force-color-profile=srgb",
    ],
    env,
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setFocusable(false);
    win.unmaximize();
    win.setSize(1200, 900);
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  }, file);
  await inspectorMenu(app, "file.open");
  const state = () =>
    page.evaluate(() => window.axiom.request<Snapshot>("state"));
  await expect
    .poll(async () => (await state()).tripleCount)
    .toBe(triples.length);
  await inspectorMenu(app, "view.inspector");
  const host = page.locator('.adaptive-pane[data-pane-id="inspector"]');
  const pane = host.getByRole("region", {
    name: "Entity inspector",
    exact: true,
  });
  const select = async (id: string) => {
    const entity = entities.find((e) => e.id === id)!;
    const iri = inspectorBase + entity.iri.slice(3);
    await page.evaluate((iri) => window.axiom.request("select", { iri }), iri);
    await expect(
      pane.getByRole("textbox", { name: "Name", exact: true }),
    ).toHaveValue(entity.label);
    await expect(
      pane.getByRole("textbox", { name: "rdfs:label value 1", exact: true }),
    ).toBeVisible();
    return iri;
  };
  const size = async (width: number, height: number) => {
    await host.evaluate(
      (el, { width, height }) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "24px",
          width: width + "px",
          height: height + "px",
          zIndex: "1000",
        }),
      { width, height },
    );
    await expect
      .poll(async () => Math.round((await host.boundingBox())!.width))
      .toBe(width);
    await expect(host).toHaveAttribute("data-pane-narrow", String(width < 600));
    await expect(host).toHaveAttribute(
      "data-pane-shallow",
      String(height < 400),
    );
  };
  await size(678, 530);
  await select("Marketing");
  const data = async () => {
    const selected = (await state()).selected!;
    return page.evaluate(
      (iri) => window.axiom.request<InspectorData>("inspector", { iri }),
      selected,
    );
  };
  return {
    app,
    page,
    pane,
    host,
    select,
    size,
    data,
    state,
    errors,
    entities,
    profile,
  };
}
export async function inspectorMenu(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
export type InspectorFixture = Awaited<ReturnType<typeof launchInspector>>;
