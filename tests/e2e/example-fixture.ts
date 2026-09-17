import { _electron as electron, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// These desktop journeys exercise the Pizza fixture, opened through File > Example.
export async function launchExample(
  options: Parameters<typeof electron.launch>[0],
) {
  const app = await electron.launch(options);
  const page = await app.firstWindow();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await app.evaluate(({ Menu, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById("file.example")!
      .click({} as never, win, win.webContents as never);
  });
  const profile = await app.evaluate(({ app }) => app.getPath("userData"));
  await expect
    .poll(async () => {
      try {
        return JSON.parse(
          await readFile(path.join(profile, "last-session.json"), "utf8"),
        ).workspace.ontology.example;
      } catch {
        return false;
      }
    })
    .toBe(true);
  return app;
}
