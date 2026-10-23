import { afterEach, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
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
import {
  MissingWorkspaceError,
  WorkspaceFiles,
} from "../../src/main/workspace-files";
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, copyFile: vi.fn(actual.copyFile) };
});
const directories: string[] = [];
afterEach(async () => {
  vi.mocked(fs.copyFile).mockReset();
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
  await writer.write(file, "first", { allowCreate: true });
  await writer.write(file, "second");
  expect(await readFile(file, "utf8")).toBe("second");
  expect(await readFile(file + ".bak", "utf8")).toBe("first");
  expect(await stat(file + ".tmp").catch(() => undefined)).toBeUndefined();
});
// #162: an unchanged checkpoint must not recreate a file removed outside Axiom.
it("skips unchanged snapshots but refuses a deleted destination", async () => {
  const file = await location(),
    writer = new WorkspaceFiles();
  await writer.write(file, "unchanged", { allowCreate: true });
  const modified = (await stat(file)).mtimeMs;
  await writer.write(file, "unchanged");
  expect((await stat(file)).mtimeMs).toBe(modified);
  await unlink(file);
  await expect(writer.write(file, "unchanged")).rejects.toBeInstanceOf(
    MissingWorkspaceError,
  );
  await expect(writer.write(file, "edited")).rejects.toBeInstanceOf(
    MissingWorkspaceError,
  );
  await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(file + ".tmp")).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(file + ".bak")).rejects.toMatchObject({ code: "ENOENT" });
  await writer.write(file, "explicit save", { allowCreate: true });
  expect(await readFile(file, "utf8")).toBe("explicit save");
});
it("creates recovery archives in a new directory only when creation is allowed", async () => {
  const file = path.join(
    path.dirname(await location()),
    "recovery",
    "saved.axiom",
  );
  const writer = new WorkspaceFiles();
  await expect(
    writer.write(file, "snapshot", { createDirectory: true }),
  ).rejects.toBeInstanceOf(MissingWorkspaceError);
  await writer.write(file, "snapshot", {
    createDirectory: true,
    allowCreate: true,
  });
  expect(await readFile(file, "utf8")).toBe("snapshot");
});
it("does not replace a destination removed while its backup is being written", async () => {
  const file = await location();
  await writeFile(file, "original");
  const { copyFile: copy } =
    await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.copyFile).mockImplementationOnce(async (...args) => {
    await copy(...args);
    await unlink(file);
  });
  await expect(
    new WorkspaceFiles().write(file, "replacement"),
  ).rejects.toBeInstanceOf(MissingWorkspaceError);
  await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(file + ".tmp")).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(file + ".bak", "utf8")).toBe("original");
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
