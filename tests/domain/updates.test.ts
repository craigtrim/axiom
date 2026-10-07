import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PendingUpdate } from "../../src/main/pending-update";
const mocks = vi.hoisted(() => ({
  app: undefined as any,
  updater: undefined as any,
  spawn: vi.fn(),
}));
vi.mock("electron", () => ({
  app: mocks.app,
  Notification: class {
    show() {}
  },
}));
vi.mock("electron-updater", () => ({ autoUpdater: mocks.updater }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
let directory: string;
beforeEach(async () => {
  vi.resetModules();
  mocks.app ??= Object.assign(new EventEmitter(), {
    isPackaged: true,
    getVersion: () => "1.0.0",
  });
  mocks.app.removeAllListeners();
  mocks.updater ??= new EventEmitter();
  mocks.updater.removeAllListeners();
  Object.assign(mocks.updater, {
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(async () => ({ isUpdateAvailable: false })),
    downloadUpdate: vi.fn(async () => []),
  });
  mocks.spawn
    .mockReset()
    .mockImplementation(() =>
      Object.assign(new EventEmitter(), { unref: vi.fn() }),
    );
  directory = await mkdtemp(path.join(os.tmpdir(), "axiom-update-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function event() {
  const file = path.join(directory, "Axiom-Setup-2.0.0.exe");
  await writeFile(file, "test installer -- never executed");
  return {
    downloadedFile: file,
    version: "2.0.0",
    path: "Axiom-Setup-2.0.0.exe",
    sha512: createHash("sha512")
      .update(await readFile(file))
      .digest("base64"),
    releaseDate: "2026-10-07",
    files: [
      {
        url: "Axiom-Setup-2.0.0.exe",
        sha512: createHash("sha512")
          .update(await readFile(file))
          .digest("base64"),
      },
    ],
  };
}
for (const last of [false, true])
  it(`installs a verified pending update only on a successful last-instance exit (${last})`, async () => {
    const { startUpdates } = await import("../../src/main/updates");
    const claimUpdate = vi.fn(() => last);
    const updates = startUpdates(vi.fn(), {
      claimUpdate,
      updateDirectory: directory,
    });
    await vi.waitFor(() =>
      expect(mocks.updater.checkForUpdates).toHaveBeenCalledOnce(),
    );
    expect(mocks.updater.autoInstallOnAppQuit).toBe(false);
    mocks.app.emit("quit", {}, 0);
    expect(claimUpdate).not.toHaveBeenCalled();
    const download = await event();
    mocks.updater.emit("update-downloaded", download);
    await updates.prepareForQuit();
    mocks.app.emit("quit", {}, 1);
    expect(claimUpdate).not.toHaveBeenCalled();
    mocks.app.emit("quit", {}, 0);
    expect(claimUpdate).toHaveBeenCalledOnce();
    expect(mocks.spawn).toHaveBeenCalledTimes(last ? 1 : 0);
    if (last)
      expect(mocks.spawn).toHaveBeenCalledWith(
        download.downloadedFile,
        ["--updated", "/S"],
        expect.objectContaining({ windowsHide: true, detached: true }),
      );
  });
it("the last instance uses a peer's staged download even when its own release check fails", async () => {
  const download = await event();
  await new PendingUpdate(directory).save(download, "1.0.0");
  mocks.updater.checkForUpdates.mockRejectedValue(Error("offline"));
  const { startUpdates } = await import("../../src/main/updates");
  const updates = startUpdates(vi.fn(), {
    claimUpdate: () => true,
    updateDirectory: directory,
  });
  await updates.prepareForQuit();
  mocks.app.emit("quit", {}, 0);
  expect(mocks.spawn).toHaveBeenCalledOnce();
  expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled();
});
it("a changed installer cannot be launched and keeps the failed update out of workspace close", async () => {
  const download = await event();
  await new PendingUpdate(directory).save(download, "1.0.0");
  await writeFile(download.downloadedFile, "changed after downloading");
  const { startUpdates } = await import("../../src/main/updates");
  const warn = vi.fn();
  const updates = startUpdates(warn, {
    claimUpdate: () => true,
    updateDirectory: directory,
  });
  await updates.prepareForQuit();
  mocks.app.emit("quit", {}, 0);
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("checksum"));
});
it("ignores stale handoffs after the application version changes", async () => {
  const pending = new PendingUpdate(directory);
  await pending.save(await event(), "0.9.0");
  expect(await pending.prepare("1.0.0")).toBeUndefined();
});
