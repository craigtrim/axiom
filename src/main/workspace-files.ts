import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { workspaceFilePath } from "./workspace-ownership";
// #162: only an explicit Save destination or recovery archive may create a file.
export class MissingWorkspaceError extends Error {
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
    text: string,
    { createDirectory = false, allowCreate = false } = {},
  ) {
    // Keep writes and ownership on the same target when a workspace is opened
    // through a filesystem alias. Replacing the alias would change its identity.
    file = workspaceFilePath(file);
    const requireDestination = async () => {
      if (!allowCreate && !(await workspaceExists(file)))
        throw new MissingWorkspaceError(file);
    };
    await requireDestination();
    const digest = createHash("sha256").update(text).digest("hex");
    const previous = this.previous.get(file);
    if (previous?.digest === digest) {
      try {
        if ((await stat(file)).mtimeMs === previous.modified) return;
      } catch {}
    }
    if (createDirectory) await mkdir(path.dirname(file), { recursive: true });
    const temp = file + ".tmp";
    try {
      await writeFile(temp, text, "utf8");
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
