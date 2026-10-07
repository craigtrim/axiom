import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  WorkspaceOwnership,
  type WorkspaceLease,
} from "../../src/main/workspace-ownership";

const directories: string[] = [];
const leases: WorkspaceLease[] = [];
afterEach(async () => {
  leases.splice(0).forEach((lease) => lease.release());
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function file() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "axiom-ownership-"));
  directories.push(directory);
  return path.join(directory, "Saved.axiom");
}
async function claim(owner: WorkspaceOwnership, file: string, focus = true) {
  const lease = await owner.claim(file, focus);
  if (lease) leases.push(lease);
  return lease;
}
it("atomically grants only one owner, raises it, and permits opening after release", async () => {
  const target = await file();
  const focus = vi.fn();
  const first = new WorkspaceOwnership(focus),
    second = new WorkspaceOwnership(vi.fn());
  const lease = await claim(first, target);
  expect(lease).toBeDefined();
  expect(await claim(second, target)).toBeUndefined();
  expect(focus).toHaveBeenCalledOnce();
  expect(await claim(second, target, false)).toBeUndefined();
  expect(focus).toHaveBeenCalledOnce();
  lease!.release();
  expect(await claim(second, target)).toBeDefined();
});
it("retains ownership during nested saves and distinguishes different files", async () => {
  const target = await file();
  const first = new WorkspaceOwnership(vi.fn()),
    second = new WorkspaceOwnership(vi.fn());
  const original = await claim(first, target);
  const saving = await claim(first, target);
  saving!.release();
  saving!.release();
  expect(await claim(second, target)).toBeUndefined();
  expect(await claim(second, target + "-other")).toBeDefined();
  original!.release();
  expect(await claim(second, target)).toBeDefined();
});
it("recognizes case variants and junction aliases, including a Save As path before creation", async () => {
  const target = await file();
  const alias = path.dirname(target) + "-alias";
  await symlink(path.dirname(target), alias, "junction");
  directories.push(alias);
  const first = new WorkspaceOwnership(vi.fn()),
    second = new WorkspaceOwnership(vi.fn());
  await claim(first, target);
  expect(
    await claim(second, path.join(alias, path.basename(target))),
  ).toBeUndefined();
  await writeFile(target, "workspace");
  expect(await claim(second, target)).toBeUndefined();
  if (process.platform === "win32")
    expect(await claim(second, target.toUpperCase())).toBeUndefined();
});
it("resolves simultaneous opens to a single writer", async () => {
  const target = await file();
  const results = await Promise.all([
    claim(new WorkspaceOwnership(vi.fn()), target),
    claim(new WorkspaceOwnership(vi.fn()), target),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
});
