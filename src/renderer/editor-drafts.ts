import { request, onCommand, report } from "./client";
import type { Entity, Triple } from "../domain/model";
export interface DocumentData {
  parentExpressions?: Record<string, string[]>;
  entity: Entity;
  statements: Triple[];
  version: number;
  datasetEpoch: number;
}
export interface EditorDraft {
  iri: string;
  nextIri: string;
  automaticIri?: boolean;
  statements: Triple[];
  loaded: DocumentData;
}
const drafts = new Map<string, EditorDraft>();
const documentDrafts = new Map<
  string,
  { flush(): Promise<unknown>; discard(): void }
>();
export function rememberDocumentDraft(
  id: string,
  draft: { flush(): Promise<unknown>; discard(): void } | null,
) {
  if (draft) documentDrafts.set(id, draft);
  else documentDrafts.delete(id);
  notify();
}
let epoch: number | undefined;
const key = (iri: string, e: number) => e + ":" + iri;
function notify() {
  window.axiom.editors.dirty(drafts.size + documentDrafts.size);
  window.dispatchEvent(new Event("axiom-editor-drafts"));
}
export function syncEditorEpoch(next: number) {
  if (epoch !== next) {
    epoch = next;
    drafts.clear();
    for (const d of documentDrafts.values()) d.discard();
    documentDrafts.clear();
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
  notify();
}
export function discardEditorDraft(iri: string, e: number) {
  drafts.delete(key(iri, e));
  notify();
}
export function entityRetargeted(oldIri: string, iri: string, epoch: number) {
  const retarget = (t: Triple): Triple => ({
    ...t,
    subject: t.subject === oldIri ? iri : t.subject,
    predicate: t.predicate === oldIri ? iri : t.predicate,
    object:
      !t.object.literal && t.object.value === oldIri
        ? { ...t.object, value: iri }
        : t.object,
    ...(t.graph === oldIri ? { graph: iri } : {}),
  });
  for (const [k, d] of [...drafts]) {
    if (d.loaded.datasetEpoch !== epoch) continue;
    drafts.delete(k);
    const next = {
      ...d,
      iri: d.iri === oldIri ? iri : d.iri,
      nextIri: d.nextIri === oldIri ? iri : d.nextIri,
      statements: d.statements.map(retarget),
      loaded: {
        ...d.loaded,
        statements: d.loaded.statements.map(retarget),
        entity: {
          ...d.loaded.entity,
          iri: d.loaded.entity.iri === oldIri ? iri : d.loaded.entity.iri,
        },
      },
    };
    drafts.set(key(next.iri, epoch), next);
  }
  window.dispatchEvent(
    new CustomEvent("axiom-entity-retarget", {
      detail: { oldIri, iri, epoch },
    }),
  );
  notify();
}
const saving = new Map<string, Promise<string>>();
export function applyEditorDraft(d: EditorDraft, preserveSelection = false) {
  const k = key(d.iri, d.loaded.datasetEpoch);
  const previous = saving.get(k);
  const operation = (
    previous ? previous.catch(() => undefined) : Promise.resolve()
  ).then(() =>
    previous && !getEditorDraft(d.iri, d.loaded.datasetEpoch)
      ? previous
      : applyDraftNow(
          getEditorDraft(d.iri, d.loaded.datasetEpoch) ?? d,
          preserveSelection,
        ),
  );
  saving.set(k, operation);
  void operation
    .finally(() => {
      if (saving.get(k) === operation) saving.delete(k);
    })
    .catch(() => undefined);
  return operation;
}
async function applyDraftNow(d: EditorDraft, preserveSelection: boolean) {
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
    preserveSelection,
    nextIri: d.automaticIri ? d.iri : d.nextIri,
    statements: d.statements,
    version: current.version,
    datasetEpoch: current.datasetEpoch,
  });
  const latest = getEditorDraft(d.iri, d.loaded.datasetEpoch);
  drafts.delete(key(d.iri, d.loaded.datasetEpoch));
  if (
    latest &&
    JSON.stringify(latest.statements) !== JSON.stringify(d.statements)
  ) {
    const loaded = await request<DocumentData>("entityDocument", {
      iri: result,
    });
    drafts.set(key(d.iri, d.loaded.datasetEpoch), {
      ...(getEditorDraft(d.iri, d.loaded.datasetEpoch) ?? latest),
      loaded,
    });
  }
  if (result !== d.iri) entityRetargeted(d.iri, result, current.datasetEpoch);
  notify();
  return result;
}
onCommand((id) => {
  if (id !== "editors.flush") return;
  void (async () => {
    try {
      // Applying one draft can retarget references in another. Read each
      // remaining draft after the previous identifier change has completed.
      while (documentDrafts.size)
        await documentDrafts.values().next().value!.flush();
      while (drafts.size) await applyEditorDraft(drafts.values().next().value!);
      window.axiom.editors.flushed();
    } catch (e) {
      const message = (e as Error).message;
      report(message, true);
      window.axiom.editors.flushed(message);
    }
  })();
});
