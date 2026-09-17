import { expand } from "../domain/model";
import type { EdgeDocument } from "../shared/protocol";
import { request } from "./client";
import { rememberDocumentDraft } from "./editor-drafts";

export interface EdgeDraft {
  data: EdgeDocument;
  source: string;
  target: string;
  predicate: string;
  statement: number;
}
const drafts = new Map<string, EdgeDraft>();
const id = (edgeId: string, epoch: number) => "edge:" + epoch + ":" + edgeId;
const eventName = "axiom-edge-drafts";
const notify = (key: string) =>
  window.dispatchEvent(new CustomEvent(eventName, { detail: key }));
export const getEdgeDraft = (edgeId: string, epoch: number) =>
  drafts.get(id(edgeId, epoch));
export function onEdgeDraft(edgeId: string, epoch: number, update: () => void) {
  const listen = (event: Event) => {
    if ((event as CustomEvent).detail === id(edgeId, epoch)) update();
  };
  window.addEventListener(eventName, listen);
  return () => window.removeEventListener(eventName, listen);
}
export function clearEdgeDraft(edgeId: string, epoch: number) {
  const key = id(edgeId, epoch);
  drafts.delete(key);
  rememberDocumentDraft(key, null);
  notify(key);
}
export function rememberEdgeDraft(edgeId: string, draft: EdgeDraft) {
  const key = id(edgeId, draft.data.datasetEpoch),
    original = draft.data.edge;
  if (
    draft.source === original.source &&
    draft.target === original.target &&
    expand(draft.predicate.trim().replace(/^<|>$/g, "")) === original.predicate
  ) {
    if (drafts.has(key)) clearEdgeDraft(edgeId, draft.data.datasetEpoch);
    return;
  }
  drafts.set(key, structuredClone(draft));
  rememberDocumentDraft(key, {
    flush: async () => {
      const pending = drafts.get(key);
      if (pending) await applyEdgeDraft(edgeId, pending);
    },
    discard: () => {
      drafts.delete(key);
      notify(key);
    },
  });
  notify(key);
}
export async function applyEdgeDraft(
  edgeId: string,
  draft: EdgeDraft,
  remove = false,
  preserveSelection = false,
) {
  const current = await request<EdgeDocument>("edgeDocument", {
    key: edgeId,
    graphId: draft.data.graphId,
  });
  if (
    current.datasetEpoch !== draft.data.datasetEpoch ||
    JSON.stringify(current.statements) !== JSON.stringify(draft.data.statements)
  )
    throw Error(
      "This edge changed since editing began. Review it and reload before applying changes.",
    );
  const original = draft.data.statements[draft.statement];
  if (!original)
    throw Error(current.reason ?? "This edge has no editable statement.");
  await request("editEdge", {
    key: edgeId,
    graphId: draft.data.graphId,
    original,
    datasetEpoch: current.datasetEpoch,
    version: current.version,
    ...(remove
      ? {}
      : {
          replacement: {
            ...original,
            subject: draft.source,
            predicate: expand(draft.predicate.trim().replace(/^<|>$/g, "")),
            object: { literal: false, value: draft.target },
          },
        }),
  });
  clearEdgeDraft(edgeId, draft.data.datasetEpoch);
}
