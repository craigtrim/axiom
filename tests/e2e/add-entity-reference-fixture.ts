// craigtrim/axiom#93: the reference cases use the native renderer, worker and RDF store.
import { expect, _electron, type ElectronApplication } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../../src/shared/protocol";
import { addEntityFixture } from "../fixtures/add-entity-visual/fixture";
export async function addEntityMenu(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0],
      item = Menu.getApplicationMenu()!.getMenuItemById(id)!;
    item.click(item, win, win.webContents as never);
  }, id);
}
export async function launchAddEntity(
  theme = "light",
  phrase = "Basic ENGLISH COMPOSITION",
  retainedProfile?: string,
) {
  const fixture = addEntityFixture();
  await mkdir("artifacts/issue-93", { recursive: true });
  const profile =
      retainedProfile ??
      (await mkdtemp(path.resolve("artifacts/issue-93/profile-"))),
    file = path.join(profile, "add-entity.ttl");
  if (!retainedProfile) {
    await writeFile(file, fixture.turtle);
    await writeFile(
      path.join(profile, "workbench.json"),
      JSON.stringify({
        version: 1,
        theme,
        panelState: { "textanalysis.live": false },
      }),
    );
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
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".docking-workspace")).toBeVisible();
  await app.evaluate(({ BrowserWindow, dialog }, file) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setFocusable(false);
    win.unmaximize();
    win.setSize(1560, 940);
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
  if (!retainedProfile) await addEntityMenu(app, "file.open");
  await expect
    .poll(async () =>
      (await state()).entities.some(
        (e) => e.iri === fixture.base + "Engineering",
      ),
    )
    .toBe(true);
  const host = () => page.locator('[data-pane-id="textentities"]'),
    pane = () =>
      page.getByRole("region", { name: "Add entity view", exact: true });
  const open = async (text: string) => {
    if (text) {
      await addEntityMenu(app, "view.textanalysis");
      const editor = page.getByRole("textbox", {
        name: "Text to analyze",
        exact: true,
      });
      await expect(editor).toBeVisible();
      await editor.focus();
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText(text);
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Alt+Enter");
    } else await addEntityMenu(app, "view.textentities");
    await expect(
      pane().getByRole("textbox", { name: "Name", exact: true }),
    ).toBeVisible();
  };
  await open(retainedProfile ? "" : phrase);
  const size = async (width = 898, height = 530) => {
    await host().evaluate(
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
      .poll(async () => Math.round((await host().boundingBox())!.width))
      .toBe(width);
    await expect(host()).toHaveAttribute(
      "data-pane-narrow",
      String(width < 600),
    );
  };
  await size();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const name = () => pane().getByRole("textbox", { name: "Name", exact: true });
  const setName = async (text: string) => {
    await name().fill(text);
    await expect
      .poll(async () => pane().locator(".fnote .mono").first().textContent())
      .toContain(text.trim() ? fixture.base : fixture.base + "Unnamed");
  };
  const picker = (parent?: string) =>
    pane().getByRole("combobox", {
      name: parent ? "Parent for " + parent : "Add a parent",
      exact: true,
    });
  const choose = async (text: string, parent?: string) => {
    const p = picker(parent);
    await p.fill(text);
    await expect(
      pane().getByRole("listbox", { name: "Matching classes" }),
    ).toBeVisible();
    await p.press("Enter");
    await expect(p).toHaveValue("");
  };
  let copied: { before: string; source: string } | undefined;
  const more = async (label: string) => {
    if (label === "Copy the planned source")
      copied = {
        before: await app.evaluate(({ clipboard }) => clipboard.readText()),
        source: (await pane().getByLabel("Planned source").textContent())!,
      };
    await pane()
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  return {
    app,
    close: async () => {
      try {
        if (copied)
          await app.evaluate(async ({ clipboard }, saved) => {
            if ((await clipboard.readText()) === saved.source)
              await clipboard.writeText(saved.before);
          }, copied);
      } finally {
        await app.close();
      }
    },
    page,
    errors,
    profile,
    file,
    fixture,
    state,
    host,
    pane,
    size,
    open,
    name,
    setName,
    picker,
    choose,
    more,
  };
}
export type AddEntityFixture = Awaited<ReturnType<typeof launchAddEntity>>;
