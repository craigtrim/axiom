// craigtrim/axiom#91: native tests use the published seed as real RDF, without worker stubs.
import { expect, _electron, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
import { hierarchyFixture } from "../fixtures/hierarchy-visual/fixture";

export async function hierarchyMenu(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
export async function launchHierarchy(theme = "light", savedProfile?: string) {
  const fixture = hierarchyFixture();
  await mkdir("artifacts/issue-91", { recursive: true });
  const profile =
    savedProfile ??
    (await mkdtemp(path.resolve("artifacts/issue-91/profile-")));
  const file = path.join(profile, "hierarchy.ttl");
  if (!savedProfile) {
    await writeFile(
      path.join(profile, "workbench.json"),
      JSON.stringify({
        version: 1,
        theme,
        panelState: { "hierarchy.open": fixture.initialOpen },
      }),
    );
    await writeFile(file, fixture.turtle);
  }
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
      // Load the real RDF through the application launch path. Fixture setup
      // must not request a final-save capture while the renderer is mounting.
      ...(!savedProfile ? [file] : []),
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
    win.setSize(1200, 910);
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: file + ".axiom",
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  }, file);
  const state = () =>
    page.evaluate(() => window.axiom.request<Snapshot>("state"));
  try {
    await expect
      .poll(
        async () =>
          (await state()).entities.some((e) => e.iri === fixture.iri("Agent")),
        {
          timeout: 30000,
          message: "The real Hierarchy seed ontology must finish loading",
        },
      )
      .toBe(true);
  } catch (error) {
    // A failed launch has not returned its app to afterEach; dispose only this
    // fixture's process so it cannot interfere with the remaining native cases.
    await app.evaluate(({ app }) => app.exit(1)).catch(() => {});
    throw error;
  }
  await hierarchyMenu(app, "view.hierarchy");
  const host = page.locator('.adaptive-pane[data-pane-id="hierarchy"]');
  const pane = host.getByRole("region", {
    name: "Hierarchy panel",
    exact: true,
  });
  const size = async (width: number, height: number) => {
    await host.evaluate(
      (el, { width, height }) =>
        Object.assign((el as HTMLElement).style, {
          position: "fixed",
          left: "24px",
          top: "72px",
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
  await size(898, 530);
  const row = (name: string) =>
    pane.locator(`[data-entity-iri="${fixture.iri(name)}"]`);
  // Import resets expansion and selects the root. Reproduce the reference's opening state through the UI.
  for (const name of ["owl:Thing", "Agent", "Artifact"])
    if ((await row(name).getAttribute("aria-expanded")) === "false")
      await row(name).getByRole("button").click();
  await pane.getByRole("button", { name: "Properties", exact: true }).click();
  for (const name of ["owl:topObjectProperty", "owl:topDataProperty"])
    if ((await row(name).getAttribute("aria-expanded")) === "false")
      await row(name).getByRole("button").click();
  await pane.getByRole("button", { name: "Classes", exact: true }).click();
  const drag = async (
    name: string,
    target: string,
    drop = false,
    empty = false,
  ) => {
    await row(name).dispatchEvent("dragstart", {
      dataTransfer: await page.evaluateHandle(() => {
        const dt = new DataTransfer();
        (window as unknown as { hierarchyDrag: DataTransfer }).hierarchyDrag =
          dt;
        return dt;
      }),
    });
    const to = empty ? pane.locator(".rootdrop") : row(target);
    const box = (await to.boundingBox())!;
    const dataTransfer = await page.evaluateHandle(
      () =>
        (window as unknown as { hierarchyDrag: DataTransfer }).hierarchyDrag,
    );
    await to.dispatchEvent("dragover", {
      dataTransfer,
      clientX: box.x + 60,
      clientY: box.y + Math.min(13, box.height / 2),
    });
    if (drop)
      await to.dispatchEvent("drop", {
        dataTransfer,
        clientX: box.x + 60,
        clientY: box.y + 13,
      });
  };
  const more = async (label: string) => {
    await pane
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  return {
    app,
    page,
    pane,
    host,
    size,
    state,
    errors,
    profile,
    file,
    fixture,
    row,
    drag,
    more,
  };
}
export type HierarchyFixture = Awaited<ReturnType<typeof launchHierarchy>>;
