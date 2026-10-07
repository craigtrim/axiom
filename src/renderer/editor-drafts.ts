import {
  completeEditorStatement,
  editorStatements,
} from "../shared/statement-values";
import { editorDraftChanged } from "../shared/editor-state";
import { mergeEntityStatements } from "../domain/entity-merge";
import { compactIri } from "../shared/terms";
import { request, onCommand, report, state } from "./client";
import type { Triple } from "../domain/model";
import type { DocumentData, EditorDraft } from "../shared/editor-state";
export type { DocumentData, EditorDraft } from "../shared/editor-state";
const drafts = new Map<string, EditorDraft>();
const saving = new Map<string, Promise<string>>();
export const editorDraftSnapshot = () => structuredClone([...drafts.values()]);
const documentDrafts = new Map<string, { discard(): void }>();
export function rememberDocumentDraft(
  id: string,
  draft: { discard(): void } | null,
) {
  if (draft) documentDrafts.set(id, draft);
  else documentDrafts.delete(id);
  notify();
}
let epoch: number | undefined;
const key = (iri: string, e: number) => e + ":" + iri;
export const isEditorSaving = (iri: string, e: number) =>
  saving.has(key(iri, e));
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
    !isEditorSaving(d.iri, d.loaded.datasetEpoch) &&
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
      if (saving.get(k) !== operation) return;
      saving.delete(k);
      // A reversal must survive until the pending save settles. If that save
      // failed, the reversal may already match the unchanged document.
      const latest = getEditorDraft(d.iri, d.loaded.datasetEpoch);
      if (latest && !editorDraftChanged(latest)) rememberEditorDraft(latest);
    })
    .catch(() => undefined);
  return operation;
}
async function applyDraftNow(d: EditorDraft, preserveSelection: boolean) {
  d = { ...d, statements: editorStatements(d.statements) };
  if (!editorDraftChanged(d)) {
    // Explicit Save may clear a placeholder, but must not add an empty Undo
    // step. Automatic saves leave it available for the user's next entry.
    if (!preserveSelection) discardEditorDraft(d.iri, d.loaded.datasetEpoch);
    return d.iri;
  }
  const incomplete = d.statements.find(
    (t) =>
      !completeEditorStatement(
        t,
        d.loaded.statements,
        state?.entities.find((e) => e.iri === t.predicate)?.kind,
      ),
  );
  if (incomplete)
    throw Error(
      `Finish or remove the incomplete ${compactIri(incomplete.predicate, state?.ontology.namespace ?? "")} row before saving. Resource values need a matching entity or an IRI.`,
    );
  const { iri: result, document: loaded } = await request<{
    iri: string;
    document: DocumentData;
  }>("updateEntity", {
    iri: d.iri,
    preserveSelection,
    nextIri: d.automaticIri ? d.iri : d.nextIri,
    statements: d.statements,
    original: d.loaded.statements,
    version: d.loaded.version,
    datasetEpoch: d.loaded.datasetEpoch,
    returnDocument: true,
  });
  // A workspace switch clears drafts. Never restore one from the previous file.
  if (epoch !== d.loaded.datasetEpoch) return result;
  const latest = getEditorDraft(d.iri, d.loaded.datasetEpoch);
  const retarget = (t: Triple): Triple => ({
    ...t,
    subject: t.subject === d.iri ? result : t.subject,
    predicate: t.predicate === d.iri ? result : t.predicate,
    object:
      !t.object.literal && t.object.value === d.iri
        ? { ...t.object, value: result }
        : t.object,
    ...(t.graph === d.iri ? { graph: result } : {}),
  });
  if (result !== d.iri) entityRetargeted(d.iri, result, loaded.datasetEpoch);
  if (
    latest &&
    (JSON.stringify(latest.statements) !== JSON.stringify(d.statements) ||
      latest.nextIri !== d.nextIri)
  ) {
    // Rebase keystrokes made while the save was in flight onto what was saved,
    // including changes merged by the worker. Keep the draft on conflict.
    const next = {
      ...latest,
      iri: result,
      nextIri: latest.nextIri === d.nextIri ? result : latest.nextIri,
      statements: latest.statements.map(retarget),
      loaded: { ...loaded, statements: d.statements.map(retarget) },
    };
    drafts.set(key(result, loaded.datasetEpoch), next);
    try {
      next.statements = mergeEntityStatements(
        next.loaded.statements,
        next.statements,
        loaded.statements,
      );
      next.loaded = loaded;
    } finally {
      notify();
    }
  } else drafts.delete(key(result, loaded.datasetEpoch));
  notify();
  return result;
}
onCommand((id) => {
  if (id !== "editors.flushGrid") return;
  void (async () => {
    try {
      // Applying one draft can retarget references in another. Read each
      // remaining draft after the previous identifier change has completed.
      // File Save commits complete grid edits; unfinished rows and source
      // drafts are retained in the workspace for later editing.
      const complete = () =>
        [...drafts.values()].find((d) =>
          editorStatements(d.statements).every((t) =>
            completeEditorStatement(
              t,
              d.loaded.statements,
              state?.entities.find((e) => e.iri === t.predicate)?.kind,
            ),
          ),
        );
      for (let draft = complete(); draft; draft = complete())
        await applyEditorDraft(draft);
      window.axiom.editors.flushed();
    } catch (e) {
      const message = (e as Error).message;
      report(message, true);
      window.axiom.editors.flushed(message);
    }
  })();
});
