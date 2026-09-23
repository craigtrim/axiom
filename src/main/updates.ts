// craigtrim/axiom#6: updates from GitHub Releases, installed when Axiom next starts.
import { app } from "electron";
/**
 * A download runs in the background and is applied on quit, so an update never
 * interrupts editing. A failed check means an unreachable release feed far more often
 * than a defect, so it stays out of the error log and off the workbench.
 */
export function startUpdates(warn: (message: string) => void) {
  if (!app.isPackaged) return;
  void (async () => {
    try {
      const { autoUpdater } = await import("electron-updater");
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on("error", (error: Error) =>
        warn("Update check failed: " + error.message),
      );
      // Notifies through the operating system once a version is ready to install.
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      warn("Update check failed: " + (error as Error).message);
    }
  })();
}
