import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../domain/workspace";
import { readPreferences } from "../shared/preferences";
import type { Preferences } from "../shared/protocol";

export interface SavedSession {
  format: "axiom-session";
  version: 1;
  workspace: Workspace;
  workspacePath?: string;
  workbench: Preferences;
}
const limit = 256 * 1024 * 1024;
function readSession(value: unknown): SavedSession {
  const s = value as SavedSession;
  if (
    !s ||
    s.format !== "axiom-session" ||
    s.version !== 1 ||
    s.workspace?.format !== "axiom-workspace" ||
    (s.workspacePath !== undefined &&
      (typeof s.workspacePath !== "string" ||
        s.workspacePath.length > 32768 ||
        !path.isAbsolute(s.workspacePath)))
  )
    throw Error("Invalid saved session.");
  return { ...s, workbench: readPreferences(s.workbench) };
}

// This copy belongs to the app profile, independently of the user's source file.
export class SessionStore {
  readonly file: string;
  private queue = Promise.resolve();
  private previous: string | undefined;
  constructor(directory: string) {
    this.file = path.join(directory, "last-session.json");
  }
  async restore(apply: (session: SavedSession) => Promise<void>) {
    const errors: string[] = [];
    for (const file of [this.file, this.file + ".bak"]) {
      try {
        if ((await stat(file)).size > limit)
          throw Error("Saved session exceeds 256 MB.");
        const text = await readFile(file, "utf8");
        const session = readSession(JSON.parse(text));
        await apply(session);
        this.previous = text;
        return { session, recovered: file !== this.file, errors };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          errors.push(String(e));
      }
    }
    return { session: undefined, recovered: false, errors };
  }
  save(session: SavedSession) {
    const text = JSON.stringify(readSession(session));
    if (Buffer.byteLength(text) > limit)
      throw Error("Saved session exceeds 256 MB.");
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        if (this.previous)
          await this.replace(this.file + ".bak", this.previous);
        await this.replace(this.file, text);
        this.previous = text;
      });
    this.queue = operation;
    return operation;
  }
  private async replace(file: string, text: string) {
    const temp = file + ".tmp";
    await writeFile(temp, text, "utf8");
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temp, file);
        return;
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
  }
}
