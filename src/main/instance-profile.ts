import { mkdirSync } from "node:fs";
import path from "node:path";

export const slotProbe = { axiomSlotProbe: true };
export function isSlotProbe(data: unknown) {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).axiomSlotProbe === true
  );
}

interface ProfileApp {
  setPath(name: "userData" | "sessionData", value: string): void;
  requestSingleInstanceLock(data?: Record<string, unknown>): boolean;
}

// Must run synchronously before Electron initializes Chromium's session.
export function selectInstanceProfile(
  app: ProfileApp,
  root: string,
  pinned?: string,
) {
  for (let slot = 1; ; slot++) {
    const directory = pinned
      ? path.resolve(pinned)
      : slot === 1
        ? root
        : path.join(root, "instances", String(slot));
    mkdirSync(directory, { recursive: true });
    app.setPath("userData", directory);
    if (app.requestSingleInstanceLock(pinned ? undefined : slotProbe)) {
      app.setPath("sessionData", directory);
      return directory;
    }
    if (pinned) return undefined;
  }
}
