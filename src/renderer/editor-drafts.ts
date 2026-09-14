import { request, onCommand, report } from "./client";
import type { Entity, Triple } from "../domain/model";
export interface DocumentData {
  entity: Entity;
  statements: Triple[];
  version: number;
  datasetEpoch: number;
}
export interface EditorDraft {
  iri: string;
  nextIri: string;
  statements: Triple[];
  loaded: DocumentData;
}
const drafts = new Map<string, EditorDraft>();
let epoch: number | undefined;
const key = (iri: string, e: number) => e + ":" + iri;
function notify() {
  window.axiom.editors.dirty(drafts.size);
  window.dispatchEvent(new Event("axiom-editor-drafts"));
}
export function syncEditorEpoch(next: number) {
  if (epoch !== next) {
    epoch = next;
    drafts.clear();
    notify();
  }
}
export const getEditorDraft = (iri: string, e: number) =>
  drafts.get(key(iri, e));
export function rememberEditorDraft(d: EditorDraft) {
  const k = key(d.iri, d.loaded.datasetEpoch);
  if (
    d.nextIri === d.iri &&
    JSON.stringify(d.statements) === JSON.stringify(d.loaded.statements)
  )
    drafts.delete(k);
  else drafts.set(k, structuredClone(d));
  window.axiom.editors.dirty(drafts.size);
}
export function discardEditorDraft(iri: string, e: number) {
  drafts.delete(key(iri, e));
  notify();
}
export async function applyEditorDraft(d: EditorDraft) {
  const current = await request<DocumentData>("entityDocument", { iri: d.iri });
  if (
    current.datasetEpoch !== d.loaded.datasetEpoch ||
    JSON.stringify(current.statements) !== JSON.stringify(d.loaded.statements)
  )
    throw Error(
      "This entity changed since editing began. Review it and reload before applying changes.",
    );
  const result = await request<string>("updateEntity", {
    iri: d.iri,
    nextIri: d.nextIri,
    statements: d.statements,
    version: current.version,
    datasetEpoch: current.datasetEpoch,
  });
  drafts.delete(key(d.iri, d.loaded.datasetEpoch));
  if (result !== d.iri)
    window.dispatchEvent(
      new CustomEvent("axiom-entity-retarget", {
        detail: { oldIri: d.iri, iri: result, epoch: current.datasetEpoch },
      }),
    );
  notify();
  return result;
}
onCommand((id) => {
  if (id !== "editors.flush") return;
  void (async () => {
    try {
      for (const d of [...drafts.values()]) await applyEditorDraft(d);
      window.axiom.editors.flushed();
    } catch (e) {
      const message = (e as Error).message;
      report(message, true);
      window.axiom.editors.flushed(message);
    }
  })();
});
