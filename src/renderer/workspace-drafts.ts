import {
  readEditorDrafts,
  type SavedEditorDrafts,
} from "../shared/editor-state";
import {
  editorDraftSnapshot,
  rememberEditorDraft,
  syncEditorEpoch,
} from "./editor-drafts";
import { sourceDraftSnapshot, setSourceDraft } from "./source-draft";
import {
  entitySourceDraftSnapshot,
  setEntitySourceDraft,
} from "./entity-source-draft";
import { state, request, onCommand, report } from "./client";
let restoring: Promise<void> | undefined;
export function restoreWorkspaceDrafts() {
  restoring = (async () => {
    const saved = readEditorDrafts(await window.axiom.editors.load());
    const current =
      await request<import("../shared/protocol").Snapshot>("state");
    syncEditorEpoch(current.datasetEpoch);
    if (!saved) return;
    const rebase = <T extends { version: number; datasetEpoch: number }>(
      loaded: T,
    ): T => ({
      ...loaded,
      datasetEpoch: current.datasetEpoch,
      // A stale source draft must remain stale after restart.
      version: loaded.version === saved.storeVersion ? current.version : -1,
    });
    for (const draft of saved.entities)
      rememberEditorDraft({ ...draft, loaded: rebase(draft.loaded) });
    if (saved.source)
      setSourceDraft({ ...saved.source, loaded: rebase(saved.source.loaded) });
    for (const draft of saved.entitySources)
      setEntitySourceDraft(draft.loaded.iri, current.datasetEpoch, {
        ...draft,
        loaded: rebase(draft.loaded),
      });
  })();
  return restoring;
}
export async function captureWorkspaceDrafts(): Promise<
  SavedEditorDrafts | undefined
> {
  await restoring;
  // A workspace can switch before React runs the epoch-reset effect.
  syncEditorEpoch(state!.datasetEpoch);
  const entities = editorDraftSnapshot(),
    source = sourceDraftSnapshot(),
    entitySources = entitySourceDraftSnapshot();
  if (!entities.length && !source && !entitySources.length) return undefined;
  return {
    version: 1,
    storeVersion: state!.version,
    entities,
    source,
    entitySources,
  };
}
onCommand((id) => {
  if (id === "workspace.drafts")
    void restoreWorkspaceDrafts().catch((e) => report(e.message, true));
});
