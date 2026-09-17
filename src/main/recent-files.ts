import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const maxFiles = 12;
function identity(file: string) {
  const normalized = path.normalize(file);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function validPath(file: unknown): file is string {
  return (
    typeof file === "string" &&
    file.length <= 32768 &&
    !/[\u0000-\u001f]/.test(file) &&
    path.isAbsolute(file)
  );
}

// Recent documents belong to the app profile, not an individual workspace.
export class RecentFiles {
  readonly file: string;
  private files: string[] = [];
  private queue = Promise.resolve();
  constructor(directory: string) {
    this.file = path.join(directory, "recent-files.json");
  }
  list() {
    return [...this.files];
  }
  async load() {
    try {
      if ((await stat(this.file)).size > 1024 * 1024) return;
      const data: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (!Array.isArray(data)) return;
      const seen = new Set<string>();
      this.files = data
        .filter(validPath)
        .filter((file) => {
          const key = identity(file);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, maxFiles)
        .map((file) => path.normalize(file));
    } catch {
      // Missing or damaged history must not prevent opening the workbench.
    }
  }
  remember(file: string) {
    if (!validPath(file)) throw Error("Recent files require an absolute path.");
    this.files = [
      path.normalize(file),
      ...this.files.filter((old) => identity(old) !== identity(file)),
    ].slice(0, maxFiles);
    const text = JSON.stringify(this.files);
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        const temp = this.file + ".tmp";
        await writeFile(temp, text, "utf8");
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(temp, this.file);
            return;
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
      });
    this.queue = operation;
    return operation;
  }
}
