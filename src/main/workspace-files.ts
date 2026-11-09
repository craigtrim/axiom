// craigtrim/axiom#208: hash and save bounded chunks with the same file protections.
// craigtrim/axiom#223: explicit Save can force a write of unchanged bytes.
import { createHash } from "node:crypto";
import { copyFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { workspaceFilePath } from "./workspace-ownership";
import { writeJsonFile, type JsonChunks } from "./json-io";
// #162: only an explicit Save destination or recovery archive may create a file.
export class MissingWorkspaceError extends Error {
  // craigtrim/axiom#207: main must retain missing-file handling after IPC.
  readonly code = "AXIOM_WORKSPACE_MISSING";
  constructor(readonly file: string) {
    super("The workspace file no longer exists: " + file);
  }
}
export async function workspaceExists(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (
      ["ENOENT", "ENOTDIR"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      return false;
    throw error;
  }
}
// Save beside the destination and replace it only after the complete write succeeds.
export class WorkspaceFiles {
  private previous = new Map<string, { digest: string; modified: number }>();
  async write(
    file: string,
    chunks: JsonChunks,
    { createDirectory = false, allowCreate = false, force = false } = {},
  ) {
    chunks = Object.freeze([...chunks]);
    // Keep writes and ownership on the same target when a workspace is opened
    // through a filesystem alias. Replacing the alias would change its identity.
    file = workspaceFilePath(file);
    const requireDestination = async () => {
      if (!allowCreate && !(await workspaceExists(file)))
        throw new MissingWorkspaceError(file);
    };
    await requireDestination();
    const hash = createHash("sha256");
    for (const chunk of chunks) hash.update(chunk, "utf8");
    const digest = hash.digest("hex");
    const previous = this.previous.get(file);
    if (!force && previous?.digest === digest) {
      try {
        if ((await stat(file)).mtimeMs === previous.modified) return;
      } catch {}
    }
    if (createDirectory) await mkdir(path.dirname(file), { recursive: true });
    const temp = file + ".tmp";
    try {
      await writeJsonFile(temp, chunks);
      try {
        await copyFile(file, file + ".bak");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        if (!allowCreate) throw new MissingWorkspaceError(file);
      }
      for (let attempt = 0; ; attempt++) {
        await requireDestination();
        try {
          await rename(temp, file);
          break;
        } catch (e) {
          if (
            attempt >= 4 ||
            !["EPERM", "EBUSY", "EACCES"].includes(
              (e as NodeJS.ErrnoException).code ?? "",
            )
          )
            throw e;
          await new Promise((resolve) =>
            setTimeout(resolve, 25 * (attempt + 1)),
          );
        }
      }
      this.previous.set(file, { digest, modified: (await stat(file)).mtimeMs });
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
}
