import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RecentFiles } from "../../src/main/recent-files";
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith("axiom-recent-")
    )
      throw Error("Unexpected test directory");
    await rm(resolved, { recursive: true, force: true });
  }
});
async function storage() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "axiom-recent-"));
  directories.push(directory);
  return new RecentFiles(directory);
}
it("retains newest-first history across restart and deduplicates reopened paths", async () => {
  const recent = await storage();
  await recent.load();
  expect(recent.list()).toEqual([]);
  const first = path.resolve("first.ttl"),
    second = path.resolve("second.axiom");
  await recent.remember(first);
  await recent.remember(second);
  await recent.remember(
    process.platform === "win32" ? first.toUpperCase() : first,
  );
  const restarted = new RecentFiles(path.dirname(recent.file));
  await restarted.load();
  expect(restarted.list()).toEqual([
    process.platform === "win32" ? first.toUpperCase() : first,
    second,
  ]);
});
it("serializes rapid writes and keeps only the most recent 12 documents", async () => {
  const recent = await storage();
  const files = Array.from({ length: 20 }, (_, i) =>
    path.resolve("recent-" + i + ".owl"),
  );
  await Promise.all(files.map((file) => recent.remember(file)));
  expect(JSON.parse(await readFile(recent.file, "utf8"))).toEqual(
    files.slice(-12).reverse(),
  );
  const copy = recent.list();
  copy.length = 0;
  expect(recent.list()).toHaveLength(12);
});
it("ignores damaged history and rejects unusable paths without losing valid entries", async () => {
  const recent = await storage();
  await writeFile(recent.file, "{broken");
  await recent.load();
  expect(recent.list()).toEqual([]);
  const file = path.resolve("valid.owl");
  await writeFile(
    recent.file,
    JSON.stringify([
      42,
      "relative.owl",
      file,
      file,
      path.resolve("bad\npath.owl"),
    ]),
  );
  await recent.load();
  expect(recent.list()).toEqual([file]);
  expect(() => recent.remember("relative.owl")).toThrow("absolute path");
  expect(recent.list()).toEqual([file]);
});
