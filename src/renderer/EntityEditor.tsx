import { PaneToolbar, PaneDetails } from "./AdaptivePane";
import { useEffect, useState } from "react";
import { useSnapshot } from "./client";
import { editEntity } from "./authoring";
import { displayName, LABEL, COMMENT } from "../domain/rdf-model";
import { type Triple, shorten, kindLabel } from "../domain/model";
import { useEntityEditor } from "./useEntityEditor";
export function EntityEditor({
  iri,
  panelId,
}: {
  iri: string;
  panelId: string;
}) {
  const s = useSnapshot()!,
    editor = useEntityEditor(iri),
    [page, setPage] = useState(0);
  const {
    loaded,
    triples,
    nextIri,
    setTriples,
    setNextIri,
    value,
    setLiteral,
    changed,
    error,
    saving,
    save,
    reload,
    stale,
  } = editor;
  useEffect(() => {
    setPage(0);
  }, [iri, s.datasetEpoch]);
  const edit = (index: number, t: Triple) =>
    setTriples((previous) => previous.map((x, i) => (i === index ? t : x)));
  return (
    <section
      className="panel entity-editor"
      data-panel={panelId}
      aria-label="Entity details"
    >
      <PaneToolbar
        label="Entity actions"
        secondary={
          <button onClick={() => void reload(true)} disabled={saving}>
            Reload
          </button>
        }
      >
        <strong>
          {loaded ? displayName(loaded.entity) : "Entity details"}
          {changed ? " *" : ""}
        </strong>

        <button
          className="primary"
          onClick={() => void save()}
          disabled={!loaded || !changed || saving}
        >
          Apply changes
        </button>
      </PaneToolbar>
      <div className="entity-editor-content">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {loaded && (
          <>
            <div className="entity-basics">
              <PaneDetails title="About entity editing">
                <p>
                  {kindLabel(loaded.entity.kind)} · Apply changes updates this
                  entity. Save workspace also applies retained drafts, including
                  drafts in closed tabs.
                </p>
              </PaneDetails>
              {stale && (
                <p role="alert">
                  The ontology changed. Applying will check this entity for
                  conflicting edits.
                </p>
              )}
              <div className="entity-fields">
                <label>
                  Label
                  <input
                    aria-label="Entity label"
                    value={value(LABEL)}
                    maxLength={256}
                    onChange={(e) => setLiteral(LABEL, e.target.value)}
                  />
                </label>
                <label>
                  Identifier (IRI)
                  <input
                    aria-label="Entity IRI"
                    value={nextIri}
                    onChange={(e) => setNextIri(e.target.value)}
                  />
                </label>
                <label className="wide-field">
                  Comment
                  <textarea
                    aria-label="Entity comment"
                    rows={3}
                    value={value(COMMENT)}
                    onChange={(e) => setLiteral(COMMENT, e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="entity-statements">
              <h2>Statements</h2>
              <PaneDetails title="About statements">
                <p>
                  Edit any asserted property, relationship or annotation.
                  Language tags and named graphs are preserved. Select Open
                  beside a resource to edit its details.
                </p>
              </PaneDetails>
              <div className="panel-toolbar">
                <span>{triples.length.toLocaleString()} statements</span>
                <span className="toolbar-spacer" />
                <button
                  onClick={() => {
                    setTriples((ts) => [
                      ...ts,
                      {
                        subject: iri,
                        predicate: "",
                        object: { literal: true, value: "" },
                      },
                    ]);
                    setPage(Math.floor(triples.length / 50));
                  }}
                >
                  Add statement
                </button>
              </div>
              <div className="statement-list">
                {triples.slice(page * 50, page * 50 + 50).map((t, j) => {
                  const index = page * 50 + j;
                  return (
                    <fieldset key={index} className="statement-editor">
                      <legend>{shorten(t.predicate) || "New statement"}</legend>
                      <label>
                        Property IRI
                        <input
                          aria-label={"Property " + (index + 1)}
                          value={t.predicate}
                          onChange={(e) =>
                            edit(index, { ...t, predicate: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Value type
                        <select
                          aria-label={"Value type " + (index + 1)}
                          value={t.object.literal ? "literal" : "resource"}
                          onChange={(e) =>
                            edit(index, {
                              ...t,
                              object: {
                                value: t.object.value,
                                literal: e.target.value === "literal",
                              },
                            })
                          }
                        >
                          <option value="literal">Literal value</option>
                          <option value="resource">
                            Resource IRI or blank node
                          </option>
                        </select>
                      </label>
                      <label className="wide-field">
                        Value
                        <textarea
                          aria-label={"Value " + (index + 1)}
                          rows={2}
                          value={t.object.value}
                          onChange={(e) =>
                            edit(index, {
                              ...t,
                              object: { ...t.object, value: e.target.value },
                            })
                          }
                        />
                      </label>
                      <PaneDetails
                        className="statement-metadata"
                        title="Language, datatype and graph"
                      >
                        {t.object.literal && (
                          <>
                            <label>
                              Language
                              <input
                                aria-label={"Language " + (index + 1)}
                                value={t.object.language ?? ""}
                                placeholder="e.g. en"
                                onChange={(e) =>
                                  edit(index, {
                                    ...t,
                                    object: {
                                      ...t.object,
                                      language: e.target.value || undefined,
                                      datatype: e.target.value
                                        ? undefined
                                        : t.object.datatype,
                                    },
                                  })
                                }
                              />
                            </label>
                            <label>
                              Datatype IRI
                              <input
                                aria-label={"Datatype " + (index + 1)}
                                disabled={!!t.object.language}
                                value={t.object.datatype ?? ""}
                                placeholder="Optional"
                                onChange={(e) =>
                                  edit(index, {
                                    ...t,
                                    object: {
                                      ...t.object,
                                      datatype: e.target.value || undefined,
                                    },
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                        <label className="wide-field">
                          Named graph
                          <input
                            aria-label={"Named graph " + (index + 1)}
                            value={t.graph ?? ""}
                            placeholder="Default graph"
                            onChange={(e) =>
                              edit(index, {
                                ...t,
                                graph: e.target.value || undefined,
                              })
                            }
                          />
                        </label>
                      </PaneDetails>
                      <div className="statement-actions">
                        {!t.object.literal &&
                          s.entities.some((e) => e.iri === t.object.value) && (
                            <button onClick={() => editEntity(t.object.value)}>
                              Open resource
                            </button>
                          )}
                        <button
                          onClick={() =>
                            setTriples((ts) => ts.filter((_, i) => i !== index))
                          }
                        >
                          Remove statement
                        </button>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              <div className="panel-toolbar">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} of{" "}
                  {Math.max(1, Math.ceil(triples.length / 50))}
                </span>
                <button
                  disabled={(page + 1) * 50 >= triples.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
