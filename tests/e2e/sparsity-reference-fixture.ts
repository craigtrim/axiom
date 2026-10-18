// craigtrim/axiom#90: native tests use the published seed as real RDF, without worker stubs.
import { expect, _electron, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
import { sparsityFixture } from "../fixtures/sparsity-visual/fixture";

export async function sparsityMenu(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
export async function launchSparsity(theme = "light", savedProfile?: string) {
  const fixture = sparsityFixture();
  await mkdir("artifacts/issue-90", { recursive: true });
  const profile =
    savedProfile ??
    (await mkdtemp(path.resolve("artifacts/issue-90/profile-")));
  const file = path.join(profile, "sparsity.ttl");
  if (!savedProfile) {
    await writeFile(
      path.join(profile, "workbench.json"),
      JSON.stringify({ version: 1, theme }),
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
  if (!savedProfile) await sparsityMenu(app, "file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some((e) => e.iri === fixture.iri("Business")),
    )
    .toBe(true);
  await sparsityMenu(app, "view.sparsity");
  const host = page.locator('.adaptive-pane[data-pane-id="sparsity"]');
  const pane = host.getByRole("region", {
    name: "Sparsity analysis",
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
  const group = (name: string) =>
    pane.locator(`[data-band="${fixture.iri(name)}"]`);
  const finding = (parent: string, name: string) =>
    pane.locator(
      `[data-row='${JSON.stringify([fixture.iri(parent), fixture.iri(name)])}']`,
    );
  const compute = async () => {
    await pane
      .getByRole("button", { name: /^(Compute|Recompute)$/, exact: true })
      .click();
    await expect(pane.locator(".bar .state")).toContainText(
      "measured, highest",
    );
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
    group,
    finding,
    compute,
    more,
  };
}
export type SparsityFixture = Awaited<ReturnType<typeof launchSparsity>>;
