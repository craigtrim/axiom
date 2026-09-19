import { createHash } from "node:crypto";
import { copyFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
// Save beside the destination and replace it only after the complete write succeeds.
export class WorkspaceFiles {
  private previous = new Map<string, { digest: string; modified: number }>();
  async write(file: string, text: string, createDirectory = false) {
    const digest = createHash("sha256").update(text).digest("hex");
    const previous = this.previous.get(file);
    if (previous?.digest === digest) {
      try {
        if ((await stat(file)).mtimeMs === previous.modified) return;
      } catch {}
    }
    if (createDirectory) await mkdir(path.dirname(file), { recursive: true });
    const temp = file + ".tmp";
    await writeFile(temp, text, "utf8");
    try {
      await copyFile(file, file + ".bak");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    for (let attempt = 0; ; attempt++) {
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
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
    this.previous.set(file, { digest, modified: (await stat(file)).mtimeMs });
  }
}
