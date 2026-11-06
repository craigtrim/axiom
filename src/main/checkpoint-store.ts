// craigtrim/axiom#207: whole workspace documents stay in the plain-Node process.
// craigtrim/axiom#208: retain immutable JSON chunks while files stream to and from disk.
import { randomUUID } from "node:crypto";
import type { Workspace } from "../domain/workspace";
import {
  readEditorDrafts,
  type SavedEditorDrafts,
} from "../shared/editor-state";
import { readPreferences } from "../shared/preferences";
import type { CheckpointSummary, Preferences } from "../shared/protocol";
import {
  sessionJson,
  workspaceJson,
  type ChunkedCheckpoint,
} from "./autosave-checkpoint";
import { readJsonFile } from "./json-io";
import { SessionStore, type SavedSession } from "./session-store";
import { WorkspaceFiles, workspaceExists } from "./workspace-files";

export interface SessionMetadata {
  format: "axiom-session";
  version: 1;
  workbench: Preferences;
  editorDrafts?: SavedEditorDrafts;
  workspacePath?: string;
  recoveryPath?: string;
  sourceBaseIRI?: string;
}
export interface SessionRestore {
  session?: SessionMetadata;
  recovered: boolean;
  errors: string[];
  missingWorkspacePath?: string;
}
export interface WorkspaceMetadata {
  workbench: Preferences;
  editorDrafts?: SavedEditorDrafts;
  sourceBaseIRI?: string;
}

export class CheckpointStore {
  private checkpoints = new Map<string, ChunkedCheckpoint>();
  private sessions: SessionStore;
  private files = new WorkspaceFiles();
  constructor(directory: string) {
    this.sessions = new SessionStore(directory);
  }
  register(document: ChunkedCheckpoint): CheckpointSummary {
    const id = randomUUID();
    this.checkpoints.set(
      id,
      Object.freeze({
        ...document,
        chunks: Object.freeze([...document.chunks]),
        draftsChunks: document.draftsChunks
          ? Object.freeze([...document.draftsChunks])
          : undefined,
      }),
    );
    return {
      id,
      hasDrafts: !!document.draftsChunks,
      storeVersion: document.storeVersion,
      workspaceRevision: document.workspaceRevision,
      datasetEpoch: document.datasetEpoch,
      sessionRevision: document.sessionRevision,
    };
  }
  release(id: string) {
    this.checkpoints.delete(id);
  }
  private document(id: string) {
    const document = this.checkpoints.get(id);
    if (!document)
      throw Error("This workspace checkpoint is no longer available.");
    return document;
  }
  saveSession(
    id: string,
    workbench: Preferences,
    workspacePath?: string,
    recoveryPath?: string,
  ) {
    return this.sessions.saveChunks(
      sessionJson(this.document(id), workbench, workspacePath, recoveryPath),
    );
  }
  writeWorkspace(
    id: string,
    file: string,
    workbench: Preferences,
    options: { createDirectory?: boolean; allowCreate?: boolean } = {},
  ) {
    return this.files.write(
      file,
      workspaceJson(this.document(id), workbench),
      options,
    );
  }
  async restore(
    apply: (workspace: Workspace) => Promise<unknown>,
    preferences?: Preferences,
  ): Promise<SessionRestore> {
    let missingWorkspacePath: string | undefined;
    const restored = await this.sessions.restore(async (session) => {
      if (
        session.workspacePath &&
        !(await workspaceExists(session.workspacePath))
      ) {
        missingWorkspacePath = session.workspacePath;
        return false;
      }
      if (preferences)
        session.workbench = readPreferences({
          ...session.workbench,
          panelState: {
            ...session.workbench.panelState,
            "warnings.seeAlso": preferences.panelState?.["warnings.seeAlso"],
            "find.extendActions":
              preferences.panelState?.["find.extendActions"],
          },
          keyboard: preferences.keyboard,
          tabSavePolicy: preferences.tabSavePolicy,
        });
      await apply(session.workspace);
    });
    const saved = restored.session;
    return {
      recovered: restored.recovered,
      errors: restored.errors,
      ...(missingWorkspacePath ? { missingWorkspacePath } : {}),
      session: saved ? this.metadata(saved) : undefined,
    };
  }
  private metadata(saved: SavedSession): SessionMetadata {
    return {
      format: saved.format,
      version: saved.version,
      workbench: saved.workbench,
      editorDrafts: saved.editorDrafts,
      workspacePath: saved.workspacePath,
      recoveryPath: saved.recoveryPath,
      sourceBaseIRI: saved.workspace.ontology?.source?.baseIRI,
    };
  }
  async openWorkspace(
    file: string,
    apply: (workspace: Workspace) => Promise<unknown>,
    preferences: Preferences = { version: 1, theme: "light" },
  ): Promise<WorkspaceMetadata> {
    const document = (await readJsonFile(file)) as Workspace & {
      workbench?: unknown;
      editorDrafts?: unknown;
    };
    const saved = document.workbench as Partial<Preferences> | undefined;
    const workbench = readPreferences({
      ...preferences,
      ...saved,
      version: 1,
      layout: saved?.layout,
      panelState: {
        ...saved?.panelState,
        "warnings.seeAlso": preferences.panelState?.["warnings.seeAlso"],
        "find.extendActions": preferences.panelState?.["find.extendActions"],
      },
      tabHistory: saved?.tabHistory,
      keyboard: preferences.keyboard,
      tabSavePolicy: preferences.tabSavePolicy,
    });
    const editorDrafts = readEditorDrafts(document.editorDrafts);
    await apply(document);
    return {
      workbench,
      editorDrafts,
      sourceBaseIRI: document.ontology?.source?.baseIRI,
    };
  }
}
