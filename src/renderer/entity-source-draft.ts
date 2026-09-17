import { useSyncExternalStore } from "react";
import type { EntitySourceDocument } from "../shared/source";
import { rememberDocumentDraft } from "./editor-drafts";
export interface EntitySourceDraft {
  loaded: EntitySourceDocument;
  text: string;
}
const drafts = new Map<string, EntitySourceDraft>();
const listeners = new Set<() => void>();
const key = (iri: string, epoch: number) =>
  "entity-source:" + epoch + ":" + iri;
const notify = () => listeners.forEach((fn) => fn());
export function setEntitySourceDraft(
  iri: string,
  epoch: number,
  draft: EntitySourceDraft | null,
) {
  const id = key(iri, epoch);
  if (draft && draft.text !== draft.loaded.text) drafts.set(id, draft);
  else drafts.delete(id);
  rememberDocumentDraft(
    id,
    drafts.has(id)
      ? {
          flush: async () => {
            throw Error(
              "Save source or discard source edits in Details before saving the workspace.",
            );
          },
          discard: () => {
            drafts.delete(id);
            notify();
          },
        }
      : null,
  );
  notify();
}
export const useEntitySourceDraft = (iri: string, epoch: number) =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => drafts.get(key(iri, epoch)),
  );
window.addEventListener("axiom-entity-retarget", ((
  event: CustomEvent<{ oldIri: string; iri: string; epoch: number }>,
) => {
  const { oldIri, iri, epoch } = event.detail;
  const draft = drafts.get(key(oldIri, epoch));
  if (draft) {
    setEntitySourceDraft(oldIri, epoch, null);
    setEntitySourceDraft(iri, epoch, draft);
  }
}) as EventListener);
