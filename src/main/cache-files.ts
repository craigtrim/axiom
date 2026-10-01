import { homedir } from "node:os";
import path from "node:path";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const axiomCacheRoot = () =>
  path.resolve(process.env.AXIOM_CACHE_HOME || path.join(homedir(), ".axiom"));

export async function readCacheFile(file: string, limit = 2_000_000) {
  try {
    if ((await stat(file)).size > limit) return;
    const data = await readFile(file);
    if (data.length <= limit) return data.toString("utf8");
  } catch {
    /* A cache failure is a miss. */
  }
}

export async function atomicCacheFile(file: string, data: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, data, { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

/** Delete only the named cache inside its explicitly supplied parent. */
export async function clearCacheDirectory(
  root: string,
  purpose: "wikipedia" | "model",
) {
  const parent = path.resolve(root),
    target = path.resolve(parent, purpose);
  if (path.dirname(target) !== parent || path.basename(target) !== purpose)
    throw Error("Invalid cache directory.");
  await rm(target, { recursive: true, force: true });
}
