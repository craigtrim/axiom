import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceFiles } from "../../src/main/workspace-files";
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function location() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "axiom-autosave-"));
  directories.push(directory);
  return path.join(directory, "workspace.axiom");
}
it("replaces the workspace atomically and retains the previous complete file", async () => {
  const file = await location(),
    writer = new WorkspaceFiles();
  await writer.write(file, "first");
  await writer.write(file, "second");
  expect(await readFile(file, "utf8")).toBe("second");
  expect(await readFile(file + ".bak", "utf8")).toBe("first");
  expect(await stat(file + ".tmp").catch(() => undefined)).toBeUndefined();
});
it("skips unchanged snapshots but recreates a deleted destination", async () => {
  const file = await location(),
    writer = new WorkspaceFiles();
  await writer.write(file, "unchanged");
  const modified = (await stat(file)).mtimeMs;
  await writer.write(file, "unchanged");
  expect((await stat(file)).mtimeMs).toBe(modified);
  await unlink(file);
  await writer.write(file, "unchanged");
  expect(await readFile(file, "utf8")).toBe("unchanged");
});
it("leaves the original intact if backup creation fails, and permits a retry", async () => {
  const file = await location(),
    writer = new WorkspaceFiles();
  await writeFile(file, "original");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(file + ".bak");
  await expect(writer.write(file, "replacement")).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe("original");
  await rm(file + ".bak", { recursive: true });
  await writer.write(file, "replacement");
  expect(await readFile(file, "utf8")).toBe("replacement");
});
