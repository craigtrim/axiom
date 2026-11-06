// craigtrim/axiom#208: session reads and atomic writes never join the document.
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import {
  readEditorDrafts,
  type SavedEditorDrafts,
} from "../shared/editor-state";
import type { Workspace } from "../domain/workspace";
import { readPreferences } from "../shared/preferences";
import type { Preferences } from "../shared/protocol";
import {
  encodeJson,
  readJsonFile,
  writeJsonFile,
  type JsonChunks,
} from "./json-io";

export interface SavedSession {
  format: "axiom-session";
  version: 1;
  workspace: Workspace;
  workspacePath?: string;
  recoveryPath?: string;
  editorDrafts?: SavedEditorDrafts;
  workbench: Preferences;
}
function readSession(value: unknown): SavedSession {
  const s = value as SavedSession;
  if (
    !s ||
    s.format !== "axiom-session" ||
    s.version !== 1 ||
    s.workspace?.format !== "axiom-workspace" ||
    [s.workspacePath, s.recoveryPath].some(
      (file) =>
        file !== undefined &&
        (typeof file !== "string" ||
          file.length > 32768 ||
          !path.isAbsolute(file)),
    )
  )
    throw Error("Invalid saved session.");
  return {
    ...s,
    workbench: readPreferences(s.workbench),
    editorDrafts: readEditorDrafts(s.editorDrafts),
  };
}

// This copy belongs to the app profile, independently of the user's source file.
export class SessionStore {
  readonly file: string;
  private queue = Promise.resolve();
  private previous: JsonChunks | undefined;
  constructor(directory: string) {
    this.file = path.join(directory, "last-session.json");
  }
  async restore(apply: (session: SavedSession) => Promise<void | false>) {
    const errors: string[] = [];
    for (const file of [this.file, this.file + ".bak"]) {
      try {
        const chunks: string[] = [];
        const session = readSession(
          await readJsonFile(file, { onChunk: (chunk) => chunks.push(chunk) }),
        );
        // #162: a deliberately skipped session must not revive an older workspace.
        if ((await apply(session)) === false)
          return { session: undefined, recovered: false, errors: [] };
        this.previous = Object.freeze(chunks);
        return { session, recovered: file !== this.file, errors };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          errors.push(String(e));
      }
    }
    return { session: undefined, recovered: false, errors };
  }
  save(session: SavedSession) {
    return this.saveChunks(encodeJson(readSession(session)));
  }
  /** Trusted, already captured worker output, frozen before entering the write queue. */
  saveChunks(chunks: JsonChunks) {
    const captured = Object.freeze([...chunks]);
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        if (this.previous)
          await this.replace(this.file + ".bak", this.previous);
        await this.replace(this.file, captured);
        this.previous = captured;
      });
    this.queue = operation;
    return operation;
  }
  private async replace(file: string, chunks: JsonChunks) {
    const temp = file + ".tmp";
    try {
      await writeJsonFile(temp, chunks);
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
          await new Promise((resolve) =>
            setTimeout(resolve, 25 * (attempt + 1)),
          );
        }
      }
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
}
