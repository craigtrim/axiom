// craigtrim/axiom#88: real ontology, CLI adapter, validation gate and query engine.
import {
  expect,
  _electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { createHash } from "node:crypto";
export const queryReference = path.resolve(
  "tests/fixtures/query-visual/visual-reference.html",
);
export const queryBase = "https://axiom.test/courses#";
export const starter = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX ax: <https://axiom.test/courses#>

SELECT ?course ?name ?parent WHERE {
  ?course rdfs:label ?name .
  ?course rdfs:subClassOf ?parent .
}`;
export async function launchQuery(theme = "light") {
  const bytes = await readFile(queryReference);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "bba0d1c3b3ac1606bea5aa86c78c22cddb0532349f6519808f319c18711b19ff",
  );
  const html = bytes.toString("utf8");
  const fixture = runInNewContext(
    html.slice(
      html.indexOf("  var PREFIX ="),
      html.indexOf("  var PREDICATES ="),
    ) + ";({store:STORE})",
  ) as { store: string[][] };
  await mkdir("artifacts/issue-88", { recursive: true });
  const profile = await mkdtemp(path.resolve("artifacts/issue-88/profile-"));
  await writeFile(
    path.join(profile, "workbench.json"),
    JSON.stringify({ version: 1, theme }),
  );
  const ontology = path.join(profile, "courses.ttl");
  await writeFile(
    ontology,
    `@prefix ax: <${queryBase}> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n` +
      fixture.store.map((t) => t.join(" ") + " .").join("\n"),
  );
  const bin = path.join(profile, "bin"),
    folder = path.join(bin, "node_modules/@openai/codex/bin");
  await mkdir(folder, { recursive: true });
  // Reuse only seeded response data. Axiom parses, validates and formats it.
  const respond = html.slice(
    html.indexOf("  function respond()"),
    html.indexOf("  function generate()"),
  );
  await writeFile(path.join(folder, "package.json"), '{"type":"module"}');
  await writeFile(
    path.join(folder, "codex.js"),
    `import fs from "node:fs";
if(process.argv.includes("--version")){console.log("codex-cli 0.154.0");process.exit(0);}
let prompt="";process.stdin.on("data",d=>prompt+=d);process.stdin.on("end",()=>{
const request=JSON.parse(prompt.match(/REQUEST\\n(.*)\\nONTOLOGY/)[1]);
const G={desc:request.instructions},PREFIX={rdfs:"http://www.w3.org/2000/01/rdf-schema#",ax:${JSON.stringify(queryBase)}};
${respond}
if(G.desc.includes("signed out")){console.error("Sign in to the fixture agent before generating.");process.exit(1);}
let r=respond();if(r.raw){r.sparql=r.raw.replace(/^\x60\x60\x60sparql\\n|\\n\x60\x60\x60$/g,"");delete r.raw;}
if(G.desc.includes("unbound"))r.sparql="PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?course ?who WHERE { ?course rdfs:label ?name }";
if(G.desc.includes("malformed"))r.assumptions="not a list";
const timing=${JSON.stringify(path.join(profile, "timing.json"))};
setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],JSON.stringify(r)),fs.existsSync(timing)?JSON.parse(fs.readFileSync(timing,"utf8")).delay:G.desc.includes("cancel")?20000:G.desc.includes("slow")?1800:50);
});`,
  );
  const env = {
    ...process.env,
    AXIOM_USER_DATA: profile,
    AXIOM_CACHE_HOME: path.join(profile, "cache"),
    AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
  } as Record<string, string>;
  delete env.Path;
  delete env.ELECTRON_RUN_AS_NODE;
  env.PATH =
    bin +
    path.delimiter +
    path.join(process.env.SystemRoot ?? "C:/Windows", "System32");
  const app = await _electron.launch({
    args: [
      ".",
      "--force-device-scale-factor=1",
      "--disable-lcd-text",
      "--disable-gpu",
      "--force-color-profile=srgb",
    ],
    env,
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  }, ontology);
  await queryMenu(app, "file.open");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await window.axiom.request<any>("state")).tripleCount,
      ),
    )
    .toBe(63);
  await queryMenu(app, "view.query");
  const host = page.locator('.adaptive-pane[data-pane-id="query"]');
  const pane = host.locator(".query-panel");
  await expect(pane.locator(".monaco-editor")).toBeVisible();
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
    await expect(pane.locator(".split")).toHaveAttribute(
      "data-compact",
      String(width < 860),
    );
  };
  await size(898, 530);
  const history = () =>
    page.evaluate(async () => {
      const value = await window.axiom.queryHistory.load();
      value.current.text = value.current.text.replaceAll("\r\n", "\n");
      return value;
    });
  const enter = async (text: string) => {
    text = text.replaceAll("\r\n", "\n");
    const editor = pane.locator(".monaco-editor textarea");
    await editor.focus();
    await page.keyboard.press("Control+A");
    await app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      text,
    );
    await editor.press("Control+v");
    await expect
      .poll(async () => (await history()).current.text.replaceAll("\r\n", "\n"))
      .toBe(text);
  };
  await enter(starter);
  const composer = pane.getByRole("region", { name: "Compose a SPARQL query" });
  const describe = async (text?: string) => {
    if (!(await composer.isVisible()))
      await pane
        .getByRole("button", { name: "Compose query", exact: true })
        .click();
    await composer
      .getByRole("button", { name: "Describe", exact: true })
      .click();
    if (text !== undefined)
      await composer
        .getByRole("textbox", { name: "Describe the query" })
        .fill(text);
  };
  const generate = async (text: string) => {
    await describe(text);
    await composer
      .getByRole("button", { name: "Generate", exact: true })
      .click();
  };
  return {
    app,
    page,
    pane,
    host,
    profile,
    bin,
    env,
    errors,
    size,
    history,
    enter,
    composer,
    describe,
    generate,
  };
}
export async function queryMenu(
  app: ElectronApplication,
  id: string,
  page?: Page,
) {
  const target = page
    ? await (await app.browserWindow(page)).evaluate((win) => win.id)
    : undefined;
  await app.evaluate(
    ({ Menu, BrowserWindow }, { id, target }) => {
      const win = target
        ? BrowserWindow.fromId(target)!
        : BrowserWindow.getAllWindows()[0];
      const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
      item.click(item, win, win.webContents as never);
    },
    { id, target },
  );
}
export type QueryFixture = Awaited<ReturnType<typeof launchQuery>>;
