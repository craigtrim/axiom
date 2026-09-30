import { useEffect, useId, useRef, useState } from "react";
import { NS, THING } from "../domain/model";
import { entityIdentifier } from "../shared/entity-names";
import { compactIri } from "../shared/terms";
import { fixedFindPredicates, type FindCreationInput, type FindCreationPreview } from "../shared/find-create";
import type { Snapshot } from "../shared/protocol";
import { request, setState, state, useSnapshot } from "./client";
import { markFindCreated, updateFindDraft, useFindState } from "./find-state";
import { TextParentPicker } from "./TextParentPicker";
import { PredicateSelect, usePredicateOptions } from "./PredicateSelect";
import { AddStatementAction, AncestryChain, SectionPanel, SourceDisclosure, StatementTable } from "./EntityEditorParts";
import { openClassDraft } from "./text-analysis-state";

export function FindCreatePanel({ storeTotal, reveal }: { storeTotal: number; reveal(iri: string, label: string, message: string): Promise<void> }) {
  const { draft } = useFindState();
  const snapshot = useSnapshot()!;
  const id = useId();
  const [result, setResult] = useState<{ key: string; value: FindCreationPreview }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const creation: FindCreationInput = { label: draft.label, iri: draft.iri, comment: draft.comment, parents: draft.parents, statements: draft.statements };
  const key = JSON.stringify([creation, snapshot.datasetEpoch, snapshot.version]);
  const preview = result?.key === key ? result.value : undefined;
  const predicates = usePredicateOptions(draft.statements.map(row => row.predicate)).filter(p => !fixedFindPredicates.includes(p));
  const iri = draft.iri ?? snapshot.ontology.namespace + entityIdentifier(draft.label);
  useEffect(() => {
    let active = true;
    setError("");
    const timer = setTimeout(() => {
      void request<FindCreationPreview>("findCreatePreview", { creation, datasetEpoch: snapshot.datasetEpoch, version: snapshot.version })
        .then(value => { if (active) setResult({ key, value }); })
        .catch(reason => { if (active) setError(reason.message); });
    }, 100);
    return () => { active = false; clearTimeout(timer); };
  }, [key]);
  const fieldErrors = (field: string) => preview?.errors.filter(e => e.field === field).map(e => e.message).join(" ") ?? "";
  const fieldError = (field: string) => <span id={`${id}-${field}`} className="validation-error">{fieldErrors(field)}</span>;
  const ready = !!preview && !preview.errors.length;
  const valid = ready && !preview.collisions.length && !draft.parentText.trim();
  const handoff = (parentLabel?: string) => {
    if (!ready || busy) return;
    openClassDraft({ label: draft.label, comment: draft.comment, parents: draft.parents.map(iri => ({ iri })),
      manualParents: true, iri: preview.iri, statements: preview.creation.statements, checkAllEntities: true,
      findDraft: { ...draft } }, parentLabel);
  };
  const submit = async () => {
    if (!valid || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const datasetEpoch = snapshot.datasetEpoch;
    try {
      const createdIri = await request<string>("findCreate", { creation, datasetEpoch, version: preview.version });
      const next = await request<Snapshot>("state");
      if (next.datasetEpoch !== datasetEpoch || state?.datasetEpoch !== datasetEpoch) return;
      setState(next);
      const entity = next.entities.find(e => e.iri === createdIri);
      if (!entity) throw Error("The saved class is no longer in this ontology.");
      const label = entity.label || entity.name;
      const parentLabels = entity.parents.map(iri => {
        const parent = next.entities.find(e => e.iri === iri);
        return parent?.label || parent?.name || compactIri(iri, next.ontology.namespace);
      });
      const message = entity.parents.length === 1 && entity.parents[0] === THING
        ? `${label} created at the root` : `${label} created under ${parentLabels.join(", ")}`;
      await reveal(createdIri, label, message + ". Showing the saved class.");
      markFindCreated(createdIri);
    } catch (reason) {
      if (state?.datasetEpoch === datasetEpoch) setError((reason as Error).message);
    } finally { pending.current = false; setBusy(false); }
  };
  const setRow = (index: number, change: Partial<FindCreationInput["statements"][number]>) =>
    updateFindDraft({ statements: draft.statements.map((row, i) => i === index ? { ...row, ...change } : row) });
  return <SectionPanel title="Not in the ontology? Add it." className="find-create">
    <p className="find-create-sub">Checked against all {(preview?.storeTotal ?? storeTotal).toLocaleString()} entities as you type, not just the fields above.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={busy} className="find-create-fields">
        <legend className="sr-only">New class</legend>
        <AncestryChain snapshot={snapshot} label={draft.label} parents={draft.parents} />
        <div className="entity-subject">
          <label htmlFor={id + "-subject"}>Subject</label>
          <input id={id + "-subject"} aria-label="Subject IRI" maxLength={10000} value={iri}
            aria-invalid={!!fieldErrors("iri")} aria-describedby={id + "-iri"}
            onChange={event => updateFindDraft({ iri: event.target.value })} />
          <span>{draft.iri === undefined ? "follows rdfs:label" : "overridden"}</span>
          {draft.iri !== undefined && <button type="button" onClick={() => updateFindDraft({ iri: undefined })}>Use label for IRI</button>}
          {fieldError("iri")}
        </div>
        <StatementTable count={preview?.statementCount ?? 2 + Math.max(1, draft.parents.length) + Number(!!draft.comment.trim()) + draft.statements.filter(row => row.value.trim()).length}>
          <tr><th scope="row"><code>rdf:type</code></th><td><code>owl:Class</code></td><td /></tr>
          <tr><th scope="row"><label htmlFor={id + "-label"}><code>rdfs:label</code></label></th><td>
            <input id={id + "-label"} aria-label="Class label" maxLength={256} value={draft.label}
              aria-invalid={!draft.label.trim() || !!fieldErrors("label")} aria-describedby={id + "-label-error"}
              onChange={event => updateFindDraft({ label: event.target.value, labelEdited: true })} />
            <span id={id + "-label-error"} className="validation-error">{!draft.label.trim() ? "Give rdfs:label a value to continue." : fieldErrors("label")}</span>
          </td><td /></tr>
          <tr><th scope="row"><code>rdfs:subClassOf</code></th><td>
            <div className="text-parent-chips">
              {draft.parents.map(iri => {
                const parent = snapshot.entities.find(e => e.iri === iri);
                const label = parent?.label || parent?.name || compactIri(iri, snapshot.ontology.namespace);
                return <span className="text-parent-chip" key={iri}><span title={iri}>{label}</span>
                  <button type="button" aria-label={`Remove parent ${label}`} onClick={() => updateFindDraft({ parents: draft.parents.filter(p => p !== iri) })}>×</button></span>;
              })}
              {!draft.parents.length && <span className="muted">owl:Thing (root)</span>}
            </div>
            <TextParentPicker snapshot={snapshot} value={{ label: draft.label, comment: draft.comment, parents: draft.parents.map(iri => ({ iri })), manualParents: true }} preview={preview}
              disabled={busy} ready={ready} compact excludeIri={preview?.iri ?? iri} text={draft.parentText}
              setText={parentText => updateFindDraft({ parentText })}
              add={iri => updateFindDraft({ parents: [...new Set([...draft.parents, iri])], parentText: "" })}
              create={parentLabel => handoff(parentLabel)} />
            {fieldError("parents")}
          </td><td /></tr>
          <tr><th scope="row"><label htmlFor={id + "-comment"}><code>rdfs:comment</code></label></th><td>
            <textarea id={id + "-comment"} aria-label="Class comment" rows={2} maxLength={10000} value={draft.comment} placeholder="One sentence saying what this is"
              aria-invalid={!!fieldErrors("comment")} aria-describedby={id + "-comment-error"} onChange={event => updateFindDraft({ comment: event.target.value })} />
            <span id={id + "-comment-error"} className="validation-error">{fieldErrors("comment")}</span>
          </td><td /></tr>
          {draft.statements.map((row, index) => <tr key={row.id}>
            <th scope="row"><PredicateSelect value={row.predicate} options={predicates} namespace={snapshot.ontology.namespace} label={`Predicate ${index + 1}`} change={predicate => setRow(index, { predicate })} /></th>
            <td><input aria-label={`Value ${index + 1}`} value={row.value} maxLength={10000} onChange={event => setRow(index, { value: event.target.value })}
              aria-invalid={!!fieldErrors(`statement-${index}`)} aria-describedby={`${id}-statement-${index}`} />{fieldError(`statement-${index}`)}</td>
            <td><button type="button" aria-label={`Remove statement ${index + 1}`} onClick={() => updateFindDraft({ statements: draft.statements.filter(item => item.id !== row.id) })}>×</button></td>
          </tr>)}
        </StatementTable>
        {fieldError("statements")}
        <AddStatementAction disabled={draft.statements.length >= 100} add={() => updateFindDraft({ statements: [...draft.statements, { id: crypto.randomUUID(), predicate: predicates.find(p => !draft.statements.some(row => row.predicate === p)) ?? NS.rdfs + "seeAlso", value: "" }] })} />
        <SourceDisclosure open={draft.sourceOpen} change={sourceOpen => updateFindDraft({ sourceOpen })} source={preview?.source ?? ""} />
        {preview?.collisions.map(collision => <div className="find-collision" role="status" key={collision.iri}>
          <p><strong>{collision.label}</strong> already exists{collision.kind === "normalized" ? ", and its normalised name is the same as yours" : collision.kind === "iri" ? " at this subject IRI" : ""}. It sits under {collision.path}.</p>
          <button type="button" onClick={() => void reveal(collision.iri, collision.label, `Opened ${collision.label}`).catch(reason => setError(reason.message))}>Open {collision.label}</button>
        </div>)}
        <footer className="find-create-actions">
          <span>{!draft.parents.length ? "Adding under owl:Thing." : "Class and statements are saved together."}</span>
          <button type="button" disabled={!ready} onClick={() => handoff(draft.parentText.trim() || undefined)}>Continue in Add entity</button>
          <button className="primary" type="submit" disabled={!valid || busy}>{busy ? "Adding…" : "Create class"}</button>
        </footer>
      </fieldset>
      {!preview && !error && <p role="status" className="muted">Checking draft…</p>}
      {error && <p role="alert" className="validation-error">{error}</p>}
    </form>
  </SectionPanel>;
}
