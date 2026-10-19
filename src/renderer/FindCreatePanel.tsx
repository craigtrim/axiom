// craigtrim/axiom#111: source terms use the shared grammar and palette.
import { Code } from "./Code";
import { useEffect, useId, useRef, useState } from "react";
import { NS, THING } from "../domain/model";
import { entityIdentifier } from "../shared/entity-names";
import { compactIri } from "../shared/terms";
import {
  fixedFindPredicates,
  type FindCreationInput,
  type FindCreationPreview,
  findCreationKinds,
  creationType,
  creationNoun,
  creationRelation,
  creationTargetMatches,
  type FindCreationKind,
} from "../shared/find-create";
import type { Snapshot } from "../shared/protocol";
import { request, setState, state, useSnapshot } from "./client";
import { markFindCreated, updateFindDraft, useFindState } from "./find-state";
import { TextParentPicker } from "./TextParentPicker";
import { PredicateSelect, usePredicateOptions } from "./PredicateSelect";
import {
  AddStatementAction,
  AncestryChain,
  SourceDisclosure,
  StatementTable,
} from "./EntityEditorParts";
import { openClassDraft } from "./text-analysis-state";
import { useRetainedPreview } from "./use-retained-preview";
import { FindGlyph } from "./FindGlyph";
import { groupStatements } from "./statement-groups";
import { StatementGroupRow } from "./StatementGroupRow";
import { SeeAlsoWarning } from "./SeeAlsoWarning";

export function FindCreatePanel({
  reveal,
}: {
  reveal(iri: string, label: string, message: string): Promise<void>;
}) {
  const { draft } = useFindState();
  const kind = draft.kind ?? "Class";
  const noun = creationNoun(kind);
  const relation = creationRelation(kind);
  const relationName =
    kind === "Class"
      ? "rdfs:subClassOf"
      : kind === "Individual"
        ? "rdf:type"
        : "rdfs:subPropertyOf";
  const snapshot = useSnapshot()!;
  const id = useId();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [activeParent, setActiveParent] = useState(() =>
    Math.max(0, draft.parents.indexOf("")),
  );
  const parentValues = draft.parents.length ? draft.parents : [""];
  const selectedParents = draft.parents.filter(Boolean);
  const statementGroups = groupStatements(
    draft.statements.map((row, index) => ({
      predicate: row.predicate,
      value: { id: row.id, text: row.value, index },
    })),
  );
  const creation: FindCreationInput = {
    kind,
    label: draft.label,
    iri: draft.iri,
    comment: draft.comment,
    parents: selectedParents,
    statements: draft.statements,
  };
  const key = JSON.stringify([
    creation,
    snapshot.datasetEpoch,
    snapshot.version,
  ]);
  const check = useRetainedPreview(
    key,
    String(snapshot.datasetEpoch),
    () =>
      request<FindCreationPreview>("findCreatePreview", {
        creation,
        datasetEpoch: snapshot.datasetEpoch,
        version: snapshot.version,
      }),
    100,
  );
  const preview = check.value;
  const latest = useRef({ key, parentText: draft.parentText }),
    mounted = useRef(true);
  latest.current = { key, parentText: draft.parentText };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = (checkParentText = true) =>
    mounted.current &&
    latest.current.key === key &&
    (!checkParentText || latest.current.parentText === draft.parentText) &&
    state?.datasetEpoch === snapshot.datasetEpoch &&
    state.version === snapshot.version;
  const predicates = usePredicateOptions(
    draft.statements.map((row) => row.predicate),
  ).filter((p) => !fixedFindPredicates.includes(p));
  const unusedPredicate = predicates.find(
    (p) => !draft.statements.some((row) => row.predicate === p),
  );
  const iri =
    draft.iri ??
    (check.fresh ? preview?.iri : undefined) ??
    snapshot.ontology.namespace + entityIdentifier(draft.label);
  useEffect(() => {
    if (check.fresh) setError("");
  }, [preview]);
  const fieldErrors = (field: string) =>
    preview?.errors
      .filter((e) => e.field === field)
      .map((e) => e.message)
      .join(" ") ?? "";
  const fieldError = (field: string) => (
    <span
      id={`${id}-${field}`}
      hidden={!fieldErrors(field)}
      className={fieldErrors(field) ? "validation-error" : undefined}
    >
      {fieldErrors(field)}
    </span>
  );
  const ready = !!preview && !preview.errors.length && !check.error;
  const valid =
    ready &&
    !preview.collisions.some((c) => c.kind !== "normalized") &&
    !draft.parentText.trim();
  const handoff = async (parentLabel?: string) => {
    if (kind !== "Class" || !ready || busy || pending.current) return;
    pending.current = true;
    try {
      const fresh = await check.validate();
      if (!fresh || fresh.errors.length || !current(false)) return;
      openClassDraft(
        {
          label: draft.label,
          comment: draft.comment,
          parents: selectedParents.map((iri) => ({ iri })),
          manualParents: true,
          iri: fresh.iri,
          statements: fresh.creation.statements,
          checkAllEntities: true,
          allowSimilarName: true,
          findDraft: { ...draft },
        },
        parentLabel,
      );
    } finally {
      pending.current = false;
    }
  };
  const submit = async () => {
    if (!valid || pending.current) return;
    pending.current = true;
    const datasetEpoch = snapshot.datasetEpoch;
    try {
      const fresh = await check.validate();
      if (
        !fresh ||
        fresh.errors.length ||
        fresh.collisions.some((c) => c.kind !== "normalized") ||
        !current()
      )
        return;
      setBusy(true);
      setError("");
      const createdIri = await request<string>("findCreate", {
        creation,
        datasetEpoch,
        version: fresh.version,
      });
      const next = await request<Snapshot>("state");
      if (
        next.datasetEpoch !== datasetEpoch ||
        state?.datasetEpoch !== datasetEpoch
      )
        return;
      setState(next);
      const entity = next.entities.find((e) => e.iri === createdIri);
      if (!entity)
        throw Error("The saved entity is no longer in this ontology.");
      const label = entity.label || entity.name;
      const parentLabels = selectedParents.map((iri) => {
        const parent = next.entities.find((e) => e.iri === iri);
        return (
          parent?.label ||
          parent?.name ||
          compactIri(iri, next.ontology.namespace)
        );
      });
      const message =
        kind === "Class" &&
        (!selectedParents.length ||
          (selectedParents.length === 1 && selectedParents[0] === THING))
          ? `${label} added under owl:Thing`
          : `${label} added as a ${noun} ${kind === "Individual" ? "of" : "under"} ${parentLabels.join(", ")}`;
      markFindCreated(createdIri);
      await reveal(createdIri, label, message);
    } catch (reason) {
      if (state?.datasetEpoch === datasetEpoch)
        setError((reason as Error).message);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const setRow = (
    index: number,
    change: Partial<FindCreationInput["statements"][number]>,
  ) =>
    updateFindDraft({
      statements: draft.statements.map((row, i) =>
        i === index ? { ...row, ...change } : row,
      ),
    });
  const parentLabels = draft.parents.map((iri) => {
    const parent = snapshot.entities.find((entity) => entity.iri === iri);
    return (
      parent?.label ||
      parent?.name ||
      compactIri(iri, snapshot.ontology.namespace)
    );
  });
  return (
    <section aria-label="Add to the ontology" className="find-create ed-wrap">
      <div className="ed-label">Add to the ontology</div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy} className="find-create-fields">
          <legend className="sr-only">New {noun}</legend>
          {kind === "Class" && (
            <AncestryChain
              snapshot={snapshot}
              label={draft.label}
              parents={selectedParents}
            />
          )}
          <div className="entity-subject subj">
            <label className="k" htmlFor={id + "-subject"}>
              Subject
            </label>
            <input
              className="v"
              id={id + "-subject"}
              aria-label="Subject IRI"
              maxLength={10000}
              value={iri}
              aria-invalid={!!fieldErrors("iri")}
              aria-describedby={id + "-iri"}
              onChange={(event) => updateFindDraft({ iri: event.target.value })}
            />
            <span className="follows">
              {draft.iri === undefined ? "follows rdfs:label" : "overridden"}
            </span>
            {draft.iri !== undefined && (
              <button
                type="button"
                onClick={() => updateFindDraft({ iri: undefined })}
              >
                Use label for IRI
              </button>
            )}
            {fieldError("iri")}
          </div>
          <StatementTable
            count={
              // Count filled values, not empty input slots (craigtrim/axiom#83).
              1 +
              Number(!!draft.label.trim()) +
              Number(!!draft.comment.trim()) +
              selectedParents.length +
              draft.statements.filter((row) => row.value.trim()).length
            }
          >
            <tr className="find-kind-row">
              <th scope="row">
                <code>
                  <Code>rdf:type</Code>
                </code>
              </th>
              <td>
                <div className="statement-value-line">
                  <select
                    className="w-label"
                    aria-label="rdf:type"
                    value={creationType(kind)}
                    onChange={(event) => {
                      const next = findCreationKinds.find(
                        (k) => creationType(k) === event.target.value,
                      )!;
                      updateFindDraft({
                        kind: next,
                        parents: selectedParents.filter((iri) => {
                          const target = snapshot.entities.find(
                            (e) => e.iri === iri,
                          );
                          return target && creationTargetMatches(next, target);
                        }),
                        parentText: "",
                      });
                    }}
                  >
                    {/* craigtrim/axiom#93: classes and individuals use Add entity. */}
                    {findCreationKinds
                      .filter((k) => k !== "Class" && k !== "Individual")
                      .map((k) => (
                        <option key={k} value={creationType(k)}>
                          {compactIri(
                            creationType(k),
                            snapshot.ontology.namespace,
                          )}
                        </option>
                      ))}
                  </select>
                  <span className="find-value-action-slot" />
                  {/* Kind remains a single choice; reserve the same space as the
                    repeatable value rows without adding a dead control. */}
                  <span className="find-kind-action-space" aria-hidden="true">
                    + Add value
                  </span>
                </div>
                {fieldError("kind")}
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor={id + "-label"}>
                  <code>
                    <Code>rdfs:label</Code>
                  </code>
                </label>
              </th>
              <td>
                <input
                  id={id + "-label"}
                  className="w-label"
                  aria-label={`${noun[0].toUpperCase() + noun.slice(1)} label`}
                  maxLength={256}
                  value={draft.label}
                  aria-invalid={!draft.label.trim() || !!fieldErrors("label")}
                  aria-describedby={id + "-label-error"}
                  onChange={(event) =>
                    updateFindDraft({
                      label: event.target.value,
                      labelEdited: true,
                    })
                  }
                />
                {(draft.origin || kind !== "Class") && (
                  <span className="find-label-hint">
                    The label the {noun} will carry.
                  </span>
                )}
                <span
                  id={id + "-label-error"}
                  hidden={!!draft.label.trim() && !fieldErrors("label")}
                  className={
                    !draft.label.trim() || fieldErrors("label")
                      ? "validation-error"
                      : undefined
                  }
                >
                  {!draft.label.trim()
                    ? "Give rdfs:label a value to continue."
                    : fieldErrors("label")}
                </span>
              </td>
            </tr>
            <StatementGroupRow
              find
              group={{
                predicate: relation,
                values: parentValues as [string, ...string[]],
              }}
              name={relationName}
              predicate={
                <code>
                  <Code>{relationName}</Code>
                </code>
              }
              valueKey={(value, index) => value || "parent-" + index}
              add={() => {
                setActiveParent(parentValues.length);
                updateFindDraft({ parents: [...parentValues, ""] });
              }}
              remove={(_, index) => {
                updateFindDraft({
                  parents: parentValues.filter((_, i) => i !== index),
                  parentText: "",
                });
              }}
              removable={(value) => !!value || parentValues.length > 1}
              renderValue={(parent, index) => (
                <>
                  {kind === "Class" ? (
                    <TextParentPicker
                      snapshot={snapshot}
                      value={{
                        label: draft.label,
                        comment: draft.comment,
                        parents: selectedParents.map((iri) => ({ iri })),
                        manualParents: true,
                      }}
                      preview={preview}
                      disabled={busy}
                      ready={ready}
                      compact
                      selectedText={parentLabels[index] ?? ""}
                      placeholder="owl:Thing (root). Search or type a name."
                      excludeIri={preview?.iri ?? iri}
                      text={activeParent === index ? draft.parentText : ""}
                      setText={(parentText) => {
                        setActiveParent(index);
                        updateFindDraft({ parentText });
                      }}
                      add={(iri) => {
                        updateFindDraft({
                          parents: parentValues.map((p, i) =>
                            i === index ? iri : p,
                          ),
                          parentText: "",
                        });
                      }}
                      create={(parentLabel) => void handoff(parentLabel)}
                    />
                  ) : (
                    <select
                      className="w-label"
                      aria-label={
                        kind === "Individual"
                          ? "Instance type"
                          : "Parent property"
                      }
                      value={parent}
                      onChange={(event) =>
                        updateFindDraft({
                          parents: parentValues.map((p, i) =>
                            i === index ? event.target.value : p,
                          ),
                          parentText: "",
                        })
                      }
                    >
                      <option value="">
                        {kind === "Individual"
                          ? "Choose a class"
                          : "Choose a parent property"}
                      </option>
                      {snapshot.entities
                        .filter(
                          (e) =>
                            e.iri !== iri &&
                            creationTargetMatches(kind, e) &&
                            (e.iri === parent ||
                              !selectedParents.includes(e.iri)),
                        )
                        .sort((a, b) =>
                          (a.label || a.name).localeCompare(b.label || b.name),
                        )
                        .map((e) => (
                          <option key={e.iri} value={e.iri}>
                            {e.label || e.name}
                          </option>
                        ))}
                    </select>
                  )}
                  {index === 0 && fieldError("parents")}
                </>
              )}
            />
            <tr>
              <th scope="row">
                <label htmlFor={id + "-comment"}>
                  <code>
                    <Code>rdfs:comment</Code>
                  </code>
                </label>
              </th>
              <td>
                <input
                  id={id + "-comment"}
                  className="w-comment"
                  aria-label={`${noun[0].toUpperCase() + noun.slice(1)} comment`}
                  maxLength={10000}
                  value={draft.comment}
                  placeholder="One sentence saying what this is"
                  aria-invalid={!!fieldErrors("comment")}
                  aria-describedby={id + "-comment-error"}
                  onChange={(event) =>
                    updateFindDraft({ comment: event.target.value })
                  }
                />
                <span
                  id={id + "-comment-error"}
                  hidden={!fieldErrors("comment")}
                  className={
                    fieldErrors("comment") ? "validation-error" : undefined
                  }
                >
                  {fieldErrors("comment")}
                </span>
              </td>
            </tr>
            {statementGroups.map((group) => (
              <StatementGroupRow
                find
                key={group.predicate}
                group={group}
                name={compactIri(group.predicate, snapshot.ontology.namespace)}
                valueKey={(value) => value.id}
                add={() => {
                  const last = group.values.at(-1)!.index;
                  updateFindDraft({
                    statements: [
                      ...draft.statements.slice(0, last + 1),
                      {
                        id: crypto.randomUUID(),
                        predicate: group.predicate,
                        value: "",
                      },
                      ...draft.statements.slice(last + 1),
                    ],
                  });
                }}
                remove={(value) =>
                  updateFindDraft({
                    statements: draft.statements.filter(
                      (row) => row.id !== value.id,
                    ),
                  })
                }
                predicate={
                  <span className="pk predicate-picker">
                    <FindGlyph name="chev" />
                    <PredicateSelect
                      value={group.predicate}
                      options={predicates.filter(
                        (p) =>
                          p === group.predicate ||
                          !statementGroups.some((g) => g.predicate === p),
                      )}
                      namespace={snapshot.ontology.namespace}
                      label={`Predicate ${group.values[0].index + 1}`}
                      change={(predicate) =>
                        updateFindDraft({
                          statements: draft.statements.map((row) =>
                            row.predicate === group.predicate
                              ? { ...row, predicate }
                              : row,
                          ),
                        })
                      }
                    />
                  </span>
                }
                renderValue={({ text, index }) => (
                  <span className="seealso-value">
                    <input
                      className="w-comment"
                      aria-label={`Value ${index + 1}`}
                      value={text}
                      maxLength={10000}
                      onChange={(event) =>
                        setRow(index, { value: event.target.value })
                      }
                      aria-invalid={!!fieldErrors(`statement-${index}`)}
                      aria-describedby={`${id}-statement-${index}`}
                    />
                    {fieldError(`statement-${index}`)}
                    {group.predicate === NS.rdfs + "seeAlso" && (
                      <SeeAlsoWarning
                        subject={iri}
                        term={{ literal: true, value: text }}
                      />
                    )}
                  </span>
                )}
              />
            ))}
          </StatementTable>
          {fieldError("statements")}
          <div className="ed-tools">
            <AddStatementAction
              find
              disabled={!unusedPredicate}
              add={() =>
                unusedPredicate &&
                updateFindDraft({
                  statements: [
                    ...draft.statements,
                    {
                      id: crypto.randomUUID(),
                      predicate: unusedPredicate,
                      value: "",
                    },
                  ],
                })
              }
            />
            {!unusedPredicate && (
              <p className="muted">
                All available predicates are already in use.
              </p>
            )}
            <SourceDisclosure
              plain
              open={draft.sourceOpen}
              change={(sourceOpen) => updateFindDraft({ sourceOpen })}
              source={preview?.source ?? ""}
            />
          </div>
          {preview?.collisions.map((collision) => (
            <div
              className={`find-collision guard ${collision.kind === "normalized" ? "caution" : "block"}`}
              role="status"
              key={collision.iri}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                {collision.kind === "normalized" ? (
                  <>
                    <path d="M8 2.2 14.5 13.3h-13z" />
                    <path d="M8 6.3v3M8 11.4v.6" />
                  </>
                ) : (
                  <>
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M8 4.5v4.2M8 11.2v.6" />
                  </>
                )}
              </svg>
              <span>
                {collision.kind === "normalized" ? (
                  <>
                    <span className="b">{draft.label}</span>
                    {" is very close to "}
                    <span className="b">{collision.label}</span>
                    {` under ${collision.path}.`}
                  </>
                ) : (
                  <>
                    <span className="b">{collision.label}</span>
                    {` already exists${collision.kind === "iri" ? " at this subject IRI" : ""} under ${collision.path}. `}
                  </>
                )}
                {collision.kind === "normalized" ? null : collision.openable ===
                  false ? (
                  <span>
                    This IRI is already used in RDF. Choose another subject IRI.
                  </span>
                ) : (
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      void check
                        .validate()
                        .then((fresh) => {
                          if (
                            !current() ||
                            !fresh?.collisions.some(
                              (item) =>
                                item.iri === collision.iri &&
                                item.openable !== false,
                            )
                          )
                            return;
                          return reveal(
                            collision.iri,
                            collision.label,
                            `Opened ${collision.label}`,
                          );
                        })
                        .catch((reason) => setError(reason.message))
                    }
                  >
                    {`Open ${collision.label}`}
                  </button>
                )}
              </span>
            </div>
          ))}
          <footer className="find-create-actions cfoot">
            <span
              className="dest"
              title={`Creates ${draft.label} ${kind === "Individual" ? "as an instance of" : "under"} ${parentLabels.filter(Boolean).join(", ") || (kind === "Class" ? "owl:Thing" : "a target you choose")}.`}
            >
              Creates <b>{draft.label}</b>
              {kind === "Individual" ? " as an instance of " : " under "}
              <b>
                {parentLabels.filter(Boolean).join(", ") ||
                  (kind === "Class" ? "owl:Thing" : "a target you choose")}
              </b>
              .
            </span>
            <span className="acts">
              {kind === "Class" && (
                <button
                  className="btn"
                  type="button"
                  disabled={!ready}
                  onClick={() =>
                    void handoff(draft.parentText.trim() || undefined)
                  }
                >
                  Continue in Add entity
                </button>
              )}
              <button
                className="btn primary"
                type="submit"
                disabled={!valid || busy}
              >
                {busy ? "Adding…" : `Create ${noun}`}
              </button>
            </span>
          </footer>
        </fieldset>
        {(error || check.error) && (
          <p role="alert" className="validation-error">
            {error || check.error}
          </p>
        )}
      </form>
    </section>
  );
}
