import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { InstanceRegistry } from "../../src/main/instance-registry";
const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
function root() {
  const value = mkdtempSync(path.join(os.tmpdir(), "axiom-registry-"));
  roots.push(value);
  return value;
}
it("defers installation until the last instance has completed its final save", () => {
  const directory = root();
  const first = new InstanceRegistry(directory, "Axiom.exe", "1");
  const second = new InstanceRegistry(directory, "Axiom.exe", "2");
  first.leave();
  expect(first.claimUpdate()).toBe(false);
  second.leave();
  expect(second.claimUpdate()).toBe(true);
  expect(first.claimUpdate()).toBe(false);
});
it("does not treat a different installation as an instance the installer would stop", () => {
  const directory = root();
  const first = new InstanceRegistry(directory, "one/Axiom.exe", "1");
  new InstanceRegistry(directory, "two/Axiom.exe", "2");
  first.leave();
  expect(first.claimUpdate()).toBe(true);
});
it("defers installation when a peer registration is unreadable", () => {
  const directory = root();
  const first = new InstanceRegistry(directory, "Axiom.exe", "1");
  writeFileSync(path.join(directory, "running-instances", "peer.json"), "{");
  first.leave();
  expect(first.claimUpdate()).toBe(false);
});

it("prevents a new instance from opening in the installer handoff window", () => {
  const directory = root();
  const last = new InstanceRegistry(directory, "Axiom.exe", "1");
  last.leave();
  expect(last.claimUpdate()).toBe(true);
  expect(() => new InstanceRegistry(directory, "Axiom.exe", "2")).toThrow(
    "installing an update",
  );
});
