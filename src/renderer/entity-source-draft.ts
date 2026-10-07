import { useSyncExternalStore } from "react";
import type { EntitySourceDraft } from "../shared/editor-state";
import { rememberDocumentDraft } from "./editor-drafts";
export type { EntitySourceDraft } from "../shared/editor-state";
const drafts = new Map<string, EntitySourceDraft>();
export const entitySourceDraftSnapshot = () =>
  structuredClone([...drafts.values()]);
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
