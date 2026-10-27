// #165: hidden native windows must still render and handle real DOM input.
import { test, expect } from "../e2e/modal-fixture";

test("quiet windows remain hidden through rendering and activation", async ({
  desktop: d,
}) => {
  expect(process.env.AXIOM_TEST_QUIET).toBe("1");
  await d.menu("view.find");
  const search = d.page.getByRole("searchbox", { name: "Search the ontology" });
  await search.fill("Marine biology");
  await search.focus();
  await expect(search).toBeFocused();
  await search.press("End");
  await search.press("Backspace");
  await expect(search).toHaveValue("Marine biolog");

  const png = await d.page.screenshot();
  const pixels = await d.app.evaluate(
    ({ nativeImage }, bytes) => {
      const image = nativeImage.createFromBuffer(Buffer.from(bytes));
      const bitmap = image.toBitmap();
      const colors = new Set<number>();
      for (let i = 0; i + 3 < bitmap.length; i += 4)
        colors.add(bitmap.readUInt32LE(i));
      return { size: image.getSize(), colors: colors.size };
    },
    [...png],
  );
  expect(pixels.size.width).toBeGreaterThan(1000);
  expect(pixels.size.height).toBeGreaterThan(600);
  expect(pixels.colors).toBeGreaterThan(100);

  const detached = d.app.waitForEvent("window");
  await d.menu("pane.detach");
  const child = await detached;
  await expect(child.locator("body")).toContainText("Find");
  // Reference helpers use the same hidden constructor options; an unqualified
  // fixture that shows a reference window is never selected by the quiet runner.
  await d.app.evaluate(async ({ BrowserWindow }) => {
    const reference = new BrowserWindow({ show: false, focusable: false });
    await reference.loadURL("data:text/html,<p>Quiet reference rendering</p>");
    for (const win of BrowserWindow.getAllWindows()) {
      win.show();
      win.showInactive();
      win.focus();
      win.restore();
      win.webContents.focus();
    }
    reference.destroy();
  });
  await expect(
    d.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].maximize(),
    ),
  ).rejects.toThrow("requires the normal Windows CI suite");
  await expect(
    d.app.evaluate(({ dialog }) =>
      dialog.showMessageBoxSync({ message: "must not appear" }),
    ),
  ).rejects.toThrow("requires the normal Windows CI suite");
});
