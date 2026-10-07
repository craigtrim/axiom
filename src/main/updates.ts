// craigtrim/axiom#60: downloads are shared; installation waits for the last window.
import { app, Notification } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { PendingUpdate } from "./pending-update";
import { WorkspaceOwnership, type WorkspaceLease } from "./workspace-ownership";
import type { InstanceRegistry } from "./instance-registry";

export function startUpdates(
  warn: (message: string) => void,
  registry: Pick<InstanceRegistry, "claimUpdate" | "updateDirectory">,
) {
  const enabled = app.isPackaged && process.env.AXIOM_DISABLE_UPDATES !== "1";
  let quitting = false;
  let installer: string | undefined;
  let publishing: Promise<void> = Promise.resolve();
  let cancelDownload: (() => void) | undefined;
  let downloadFinished: Promise<unknown> = Promise.resolve();
  // electron-updater uses shared, fixed temporary/cache filenames. Serialize its
  // downloads and final validation across processes. Checks run independently.
  const ownership = new WorkspaceOwnership(() => {});
  const validationOwnership = new WorkspaceOwnership(() => {});
  const lockFile = path.join(registry.updateDirectory, "download");
  const pending = new PendingUpdate(registry.updateDirectory);

  if (enabled) {
    app.on("quit", (_event, code) => {
      if (code !== 0 || !installer) return;
      try {
        if (registry.claimUpdate()) {
          // Same per-user NSIS invocation used by electron-updater's NsisUpdater.
          // The downloader already verified the release; prepareForQuit rechecks
          // its SHA-512 before this process may take the installation gate.
          const child = spawn(installer, ["--updated", "/S"], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });
          child.on("error", (error) =>
            warn("Update installation deferred: " + error.message),
          );
          child.unref();
        }
      } catch (error) {
        warn("Update installation deferred: " + (error as Error).message);
      }
    });
    void (async () => {
      let lease: WorkspaceLease | undefined;
      try {
        const { autoUpdater } = await import("electron-updater");
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
        autoUpdater.on("error", (error: Error) =>
          warn("Update check failed: " + error.message),
        );
        autoUpdater.on("update-downloaded", (event) => {
          publishing = pending.save(event, app.getVersion());
          void publishing.catch((error) =>
            warn("Update handoff failed: " + error.message),
          );
          new Notification({
            title: "Axiom update ready",
            body: `Version ${event.version} will install after the last Axiom window closes.`,
          }).show();
        });
        const result = await autoUpdater.checkForUpdates();
        if (!result?.isUpdateAvailable || quitting) return;
        cancelDownload = () => result.cancellationToken?.cancel();
        while (!quitting && !(lease = await ownership.claim(lockFile, false)))
          await new Promise((resolve) => setTimeout(resolve, 500));
        if (quitting) return;
        downloadFinished = (async () => {
          try {
            await autoUpdater.downloadUpdate(result.cancellationToken);
            await publishing;
          } finally {
            lease?.release();
            lease = undefined;
          }
        })();
        await downloadFinished;
      } catch (error) {
        if (!quitting) warn("Update check failed: " + (error as Error).message);
      } finally {
        lease?.release();
        cancelDownload = undefined;
      }
    })();
  }

  return {
    async prepareForQuit() {
      if (!enabled) return;
      quitting = true;
      cancelDownload?.();
      let validationLease: WorkspaceLease | undefined;
      try {
        await downloadFinished.catch(() => {});
        await publishing;
        // A peer still downloading is active and will handle installation later.
        // Do not hold up closing this workspace for a network request.
        const deadline = Date.now() + 2000;
        do {
          validationLease = await validationOwnership.claim(lockFile, false);
          if (validationLease) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        } while (Date.now() < deadline);
        if (!validationLease) return;
        installer = await pending.prepare(app.getVersion());
      } catch (error) {
        warn("Update installation deferred: " + (error as Error).message);
      } finally {
        validationLease?.release();
      }
    },
  };
}
