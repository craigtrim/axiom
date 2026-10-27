import { _electron as electron, expect } from "@playwright/test";
import type { Snapshot } from "../../src/shared/protocol";
import { waitWorkspaceCheckpoint } from "./workspace-checkpoint";

// These desktop journeys exercise the Pizza fixture, opened through File > Example.
export async function launchExample(
  options: Parameters<typeof electron.launch>[0],
) {
  const app = await electron.launch(options);
  const page = await app.firstWindow();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const epoch = await page.evaluate(
    async () => (await window.axiom.request<Snapshot>("state")).datasetEpoch,
  );
  await app.evaluate(({ Menu, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    Menu.getApplicationMenu()!
      .getMenuItemById("file.example")!
      .click({} as never, win, win.webContents as never);
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.axiom.request<Snapshot>("state")).datasetEpoch,
      ),
    )
    .toBeGreaterThan(epoch);
  await waitWorkspaceCheckpoint(app, page);
  return app;
}
