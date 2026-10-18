import {
  completeEditorStatement,
  editorStatements,
  emptyEditorStatement,
} from "../shared/statement-values";
import { editorDraftChanged } from "../shared/editor-state";
import { useEffect, useRef, useState } from "react";
import { request, report, useSnapshot, state } from "./client";
import { LABEL, labelledIri, preferredLabel } from "../domain/rdf-model";
import type { Triple } from "../domain/model";
import {
  type DocumentData,
  type EditorDraft,
  getEditorDraft,
  rememberEditorDraft,
  discardEditorDraft,
  applyEditorDraft,
  isEditorSaving,
} from "./editor-drafts";

// Both entity views edit the same retained draft. Register changes synchronously
// so switching selection or saving the workspace cannot lose the last keystroke.
export function useEntityEditor(
  iri: string,
  automatic = false,
  allowTypingDuringSave = false,
) {
  const s = useSnapshot()!,
    [draft, setDraft] = useState<EditorDraft | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    current = useRef<EditorDraft | null>(null),
    generation = useRef(0);
  const normalize = (d: EditorDraft): EditorDraft => {
    if (d.nextIri !== d.iri && !d.automaticIri) return d;
    const nextIri = labelledIri(
      d.iri,
      preferredLabel(d.statements)?.object.value ?? "",
      (candidate) => !!state?.entities.some((e) => e.iri === candidate),
    );
    return { ...d, nextIri, automaticIri: nextIri !== d.iri };
  };
  const accept = (value: EditorDraft) => {
    current.current = value;
    setDraft(value);
  };
  const reload = async (discard = false) => {
    setError("");
    if (discard) discardEditorDraft(iri, s.datasetEpoch);
    // Discard broadcasts synchronously; this explicit reload owns the final result.
    const ticket = ++generation.current;
    const pending = getEditorDraft(iri, s.datasetEpoch);
    if (
      pending &&
      (pending.loaded.version === state?.version ||
        editorDraftChanged(pending) ||
        isEditorSaving(iri, s.datasetEpoch))
    ) {
      accept(pending);
      return true;
    }
    try {
      const loaded = await request<DocumentData>("entityDocument", { iri });
      if (
        ticket !== generation.current ||
        loaded.datasetEpoch !== s.datasetEpoch
      )
        return false;
      const retained = getEditorDraft(iri, s.datasetEpoch);
      const next =
        retained &&
        (editorDraftChanged(retained) || isEditorSaving(iri, s.datasetEpoch))
          ? retained
          : normalize({
              iri,
              nextIri: iri,
              // An unused row must not keep old values visible after Undo or a
              // change in another view. Refresh the RDF and retain the empty row.
              statements: [
                ...loaded.statements,
                ...(retained?.statements.filter(emptyEditorStatement) ?? []),
              ],
              loaded,
            });
      accept(next);
      if ((retained && next !== retained) || (next.automaticIri && !retained))
        rememberEditorDraft(next);
      return true;
    } catch (e) {
      if (ticket === generation.current) setError((e as Error).message);
      return false;
    }
  };
  useEffect(() => {
    current.current = null;
    setDraft(null);
    void reload();
    return () => {
      ++generation.current;
    };
  }, [iri, s.datasetEpoch]);
  useEffect(() => {
    const sync = () => {
      void reload();
    };
    window.addEventListener("axiom-editor-drafts", sync);
    return () => window.removeEventListener("axiom-editor-drafts", sync);
  }, [iri, s.datasetEpoch]);
  useEffect(() => {
    void reload();
  }, [s.version]);
  const busy = saving || isEditorSaving(iri, s.datasetEpoch);
  const update = (change: (d: EditorDraft) => EditorDraft) => {
    if (!current.current || (busy && !automatic && !allowTypingDuringSave))
      return;
    ++generation.current;
    const next = normalize(change(current.current));
    accept(next);
    rememberEditorDraft(next);
  };
  const triples = draft?.statements ?? [];
  const literalIndex = (ts: Triple[], predicate: string) => {
    const preferred =
      predicate === LABEL
        ? ts.findIndex(
            (t) =>
              t.predicate === predicate &&
              t.object.literal &&
              (t.object.language ?? "") ===
                (draft?.loaded.entity.labelLanguage ?? ""),
          )
        : -1;
    return preferred >= 0
      ? preferred
      : ts.findIndex((t) => t.predicate === predicate && t.object.literal);
  };
  const value = (predicate: string) =>
    triples[literalIndex(triples, predicate)]?.object.value ?? "";
  const setTriples = (change: Triple[] | ((previous: Triple[]) => Triple[])) =>
    update((d) => ({
      ...d,
      statements: typeof change === "function" ? change(d.statements) : change,
    }));
  const setLiteral = (predicate: string, value: string) =>
    setTriples((previous) => {
      const i = literalIndex(previous, predicate);
      return i < 0
        ? [
            ...previous,
            { subject: iri, predicate, object: { literal: true, value } },
          ]
        : previous.map((t, j) =>
            i === j ? { ...t, object: { ...t.object, value } } : t,
          );
    });
  const changed = !!draft && editorDraftChanged(draft);
  // craigtrim/axiom#89: the Inspector announces only a completed Apply or Discard.
  async function save(reportSuccess = true) {
    const pending = current.current;
    if (!pending || (busy && !automatic)) return false;
    if (
      automatic &&
      editorStatements(pending.statements).some(
        (t) =>
          !completeEditorStatement(
            t,
            pending.loaded.statements,
            state?.entities.find((e) => e.iri === t.predicate)?.kind,
          ),
      )
    )
      return false;
    if (
      !editorDraftChanged(pending) &&
      !isEditorSaving(pending.iri, pending.loaded.datasetEpoch)
    )
      return false;
    setSaving(true);
    setError("");
    try {
      await applyEditorDraft(pending, automatic);
      if (reportSuccess) report("Entity changes applied.");
      return true;
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  return {
    loaded: draft?.loaded ?? null,
    triples,
    nextIri: draft?.nextIri ?? iri,
    setTriples,
    setNextIri: (nextIri: string) =>
      update((d) => ({ ...d, nextIri, automaticIri: false })),
    value,
    setLiteral,
    changed,
    error,
    saving: busy,
    save,
    reload,
    stale:
      !!draft &&
      (draft.loaded.datasetEpoch !== s.datasetEpoch ||
        draft.loaded.version !== s.version),
  };
}
