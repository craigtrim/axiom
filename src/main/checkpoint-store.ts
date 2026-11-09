// craigtrim/axiom#207: whole workspace documents stay in the plain-Node process.
// craigtrim/axiom#208: retain immutable JSON chunks while files stream to and from disk.
// craigtrim/axiom#223: reference sessions and retained bytes avoid encoding unchanged data.
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
import { extractJsonFieldAsync } from "./json-fields";
import { readJsonFile, type JsonChunks } from "./json-io";
import { SessionStore, type StoredSession } from "./session-store";
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
  private loadedWorkspaceChunks?: JsonChunks;
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
      layoutKey: document.layoutKey,
      reusedOntology: document.reusedOntology,
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
  saveReference(
    workbench: Preferences,
    workspacePath: string,
    editorDrafts?: SavedEditorDrafts,
  ) {
    return this.sessions.save(
      {
        format: "axiom-session",
        version: 2,
        workbench,
        workspacePath,
        editorDrafts,
      },
      // The file being referenced already preserves the complete workspace.
      { backup: false },
    );
  }
  takeLoadedWorkspaceChunks(): JsonChunks | undefined {
    const chunks = this.loadedWorkspaceChunks;
    this.loadedWorkspaceChunks = undefined;
    return chunks;
  }
  writeWorkspace(
    id: string,
    file: string,
    workbench: Preferences,
    options: {
      createDirectory?: boolean;
      allowCreate?: boolean;
      force?: boolean;
    } = {},
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
    let sourceBaseIRI: string | undefined;
    this.loadedWorkspaceChunks = undefined;
    const restored = await this.sessions.restore(async (session, chunks) => {
      if (
        session.workspacePath &&
        !(await workspaceExists(session.workspacePath))
      ) {
        missingWorkspacePath = session.workspacePath;
        return false;
      }
      let document: Workspace;
      let workspaceChunks: JsonChunks | undefined;
      if (session.version === 2) {
        const raw: string[] = [];
        try {
          document = (await readJsonFile(session.workspacePath, {
            onChunk: (chunk) => raw.push(chunk),
          })) as Workspace;
        } catch (error) {
          if (
            ["ENOENT", "ENOTDIR"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          ) {
            missingWorkspacePath = session.workspacePath;
            return false;
          }
          throw error;
        }
        workspaceChunks = Object.freeze(raw);
      } else {
        document = session.workspace;
        workspaceChunks = await extractJsonFieldAsync(chunks, "workspace");
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
      await apply(document);
      sourceBaseIRI = document.ontology?.source?.baseIRI;
      this.loadedWorkspaceChunks = workspaceChunks;
    });
    const saved = restored.session;
    return {
      recovered: restored.recovered,
      errors: restored.errors,
      ...(missingWorkspacePath ? { missingWorkspacePath } : {}),
      session: saved ? this.metadata(saved, sourceBaseIRI) : undefined,
    };
  }
  private metadata(
    saved: StoredSession,
    sourceBaseIRI?: string,
  ): SessionMetadata {
    return {
      format: saved.format,
      version: 1,
      workbench: saved.workbench,
      editorDrafts: saved.editorDrafts,
      workspacePath: saved.workspacePath,
      recoveryPath: saved.recoveryPath,
      sourceBaseIRI,
    };
  }
  async openWorkspace(
    file: string,
    apply: (workspace: Workspace) => Promise<unknown>,
    preferences: Preferences = { version: 1, theme: "light" },
  ): Promise<WorkspaceMetadata> {
    this.loadedWorkspaceChunks = undefined;
    const chunks: string[] = [];
    const document = (await readJsonFile(file, {
      onChunk: (chunk) => chunks.push(chunk),
    })) as Workspace & {
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
    this.loadedWorkspaceChunks = Object.freeze(chunks);
    return {
      workbench,
      editorDrafts,
      sourceBaseIRI: document.ontology?.source?.baseIRI,
    };
  }
}
