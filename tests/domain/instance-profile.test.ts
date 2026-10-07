import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isSlotProbe,
  selectInstanceProfile,
} from "../../src/main/instance-profile";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
function root() {
  const value = mkdtempSync(path.join(os.tmpdir(), "axiom-slots-"));
  roots.push(value);
  return value;
}
it("keeps the original profile in slot 1 and probes silently to the lowest free slot", () => {
  const directory = root();
  const app = {
    setPath: vi.fn(),
    requestSingleInstanceLock: vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true),
  };
  expect(selectInstanceProfile(app, directory)).toBe(
    path.join(directory, "instances", "3"),
  );
  expect(app.setPath.mock.calls).toEqual([
    ["userData", directory],
    ["userData", path.join(directory, "instances", "2")],
    ["userData", path.join(directory, "instances", "3")],
    ["sessionData", path.join(directory, "instances", "3")],
  ]);
  expect(
    app.requestSingleInstanceLock.mock.calls.every(([data]) =>
      isSlotProbe(data),
    ),
  ).toBe(true);
});
it("pins AXIOM_USER_DATA without probing or changing the existing handoff", () => {
  const directory = root();
  const app = {
    setPath: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => false),
  };
  expect(
    selectInstanceProfile(app, directory, path.join(directory, "pinned")),
  ).toBeUndefined();
  expect(app.setPath).toHaveBeenCalledExactlyOnceWith(
    "userData",
    path.join(directory, "pinned"),
  );
  expect(app.requestSingleInstanceLock).toHaveBeenCalledExactlyOnceWith(
    undefined,
  );
  expect(isSlotProbe(undefined)).toBe(false);
});
