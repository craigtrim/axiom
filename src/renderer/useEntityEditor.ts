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
} from "./editor-drafts";

// Both entity views edit the same retained draft. Register changes synchronously
// so switching selection or saving the workspace cannot lose the last keystroke.
export function useEntityEditor(iri: string, automatic = false) {
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
    const ticket = ++generation.current;
    setError("");
    if (discard) discardEditorDraft(iri, s.datasetEpoch);
    const pending = getEditorDraft(iri, s.datasetEpoch);
    if (pending) {
      accept(pending);
      return;
    }
    try {
      const loaded = await request<DocumentData>("entityDocument", { iri });
      if (
        ticket !== generation.current ||
        loaded.datasetEpoch !== s.datasetEpoch
      )
        return;
      const next =
        getEditorDraft(iri, s.datasetEpoch) ??
        normalize({
          iri,
          nextIri: iri,
          statements: loaded.statements,
          loaded,
        });
      accept(next);
      if (next.automaticIri && !getEditorDraft(iri, s.datasetEpoch))
        rememberEditorDraft(next);
    } catch (e) {
      if (ticket === generation.current) setError((e as Error).message);
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
  const update = (change: (d: EditorDraft) => EditorDraft) => {
    if (!current.current || (saving && !automatic)) return;
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
  const changed =
    !!draft &&
    (draft.nextIri !== iri ||
      JSON.stringify(triples) !== JSON.stringify(draft.loaded.statements));
  async function save() {
    const pending = current.current;
    if (!pending || (saving && !automatic)) return;
    if (
      automatic &&
      pending.statements.some(
        (t) => !t.predicate || (!t.object.literal && !t.object.value),
      )
    )
      return;
    if (
      JSON.stringify(pending.statements) ===
        JSON.stringify(pending.loaded.statements) &&
      pending.nextIri === pending.iri
    )
      return;
    setSaving(true);
    setError("");
    try {
      await applyEditorDraft(pending, automatic);
      report("Entity changes applied.");
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
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
    saving,
    save,
    reload,
    stale:
      !!draft &&
      (draft.loaded.datasetEpoch !== s.datasetEpoch ||
        draft.loaded.version !== s.version),
  };
}
