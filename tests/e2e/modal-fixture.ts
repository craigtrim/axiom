import {
  test as baseTest,
  expect,
  _electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";

export const namespace = "https://example.test/modal-stability#";
export const fixture =
  "@prefix : <" +
  namespace +
  "> . @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
  Array.from(
    { length: 600 },
    (_, i) =>
      `:Topic${i} a owl:Class; rdfs:label "${i < 300 ? "Ethics & social care" : "Marine biology"} topic ${String(i).padStart(3, "0")}" .`,
  ).join("\n");
export interface Desktop {
  app: ElectronApplication;
  page: Page;
  profile: string;
  menu(id: string): Promise<void>;
  request<T = unknown>(
    method: DomainMethod,
    args?: Record<string, unknown>,
  ): Promise<T>;
  resize(width: number, height: number, zoom?: number): Promise<void>;
  load(text: string, name: string): Promise<void>;
}
export const test = baseTest.extend<{ desktop: Desktop }>({
  desktop: async ({}, use, info) => {
    await mkdir("artifacts/testing", { recursive: true });
    const profile = await mkdtemp(path.resolve("artifacts/testing/modal-"));
    const env = {
      ...process.env,
      AXIOM_USER_DATA: profile,
      AXIOM_CACHE_HOME: path.join(profile, "cache"),
      AXIOM_EMBEDDING_MODEL_DIR: path.join(profile, "missing-model"),
    } as Record<string, string>;
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({
      executablePath: process.env.AXIOM_TEST_EXE,
      args: process.env.AXIOM_TEST_EXE ? [] : ["."],
      env,
    });
    const page = await app.firstWindow();
    const errors: string[] = [];
    app.on("window", (p) => p.on("pageerror", (e) => errors.push(e.message)));
    page.on("pageerror", (e) => errors.push(e.message));
    const desktop: Desktop = {
      app,
      page,
      profile,
      menu: (id) =>
        app.evaluate(({ Menu, BrowserWindow }, id) => {
          const w = BrowserWindow.getAllWindows()[0],
            item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
          item.click(item, w, w.webContents as never);
        }, id),
      request: (method, args) =>
        page.evaluate(
          ({ method, args }) => window.axiom.request(method, args),
          { method, args },
        ) as never,
      load: async (text, name) => {
        const file = path.join(profile, name);
        await writeFile(file, text);
        await app.evaluate(({ dialog }, file) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [file],
          });
        }, file);
        await desktop.menu("file.open");
        await expect
          .poll(
            async () =>
              (await desktop.request<Snapshot>("state")).ontology.name,
          )
          .toBe(name);
      },
      resize: (width, height, zoom = 1) =>
        app.evaluate(
          ({ BrowserWindow }, { width, height, zoom }) => {
            const w = BrowserWindow.getAllWindows()[0];
            w.setMinimumSize(360, 300);
            w.setSize(width, height);
            w.webContents.setZoomFactor(zoom);
          },
          { width, height, zoom },
        ),
    };
    try {
      await expect(page.locator(".docking-workspace")).toBeVisible();
      await app.evaluate(({ dialog, BrowserWindow }) => {
        if (process.env.AXIOM_TEST_BACKGROUND === "1")
          BrowserWindow.getAllWindows()[0].setFocusable(false);
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
      });
      await desktop.resize(1280, 900);
      await desktop.load(fixture, "modal.ttl");
      await expect
        .poll(async () => (await desktop.request<Snapshot>("state")).classCount)
        .toBe(601);
      await use(desktop);
      expect(errors).toEqual([]);
    } finally {
      if (info.status !== info.expectedStatus && !page.isClosed())
        await info.attach("desktop", {
          body: await page.screenshot(),
          contentType: "image/png",
        });
      await app.close();
    }
  },
});
export { expect };
export async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}
export async function fixedBox(
  locator: Locator,
  original: Awaited<ReturnType<typeof box>>,
) {
  const current = await box(locator);
  expect(current.x).toBeCloseTo(original.x, 1);
  expect(current.y).toBeCloseTo(original.y, 1);
  expect(current.width).toBeCloseTo(original.width, 1);
}
export async function bounds(dialog: Locator) {
  const result = await dialog.evaluate((d) => {
    const r = d.getBoundingClientRect(),
      win = d.ownerDocument.defaultView!;
    const body = d.querySelector(".modal-body")!;
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: win.innerWidth,
      height: win.innerHeight,
      horizontal: body.scrollWidth > body.clientWidth + 1,
      outer: d.scrollHeight > d.clientHeight + 1,
    };
  });
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.width + 1);
  expect(result.bottom).toBeLessThanOrEqual(result.height + 1);
  expect(result.horizontal).toBe(false);
  expect(result.outer).toBe(false);
}
