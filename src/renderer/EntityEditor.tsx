import { useEffect, useState } from "react";
import { request, useSnapshot, report } from "./client";
import { editEntity } from "./authoring";
import { displayName, LABEL, COMMENT } from "../domain/rdf-model";
import { type Entity, type Triple, shorten, kindLabel } from "../domain/model";
import {
  type DocumentData,
  getEditorDraft,
  rememberEditorDraft,
  discardEditorDraft,
  applyEditorDraft,
} from "./editor-drafts";
export function EntityEditor({
  iri,
  panelId,
}: {
  iri: string;
  panelId: string;
}) {
  const s = useSnapshot()!,
    [loaded, setLoaded] = useState<DocumentData | null>(null),
    [triples, setTriples] = useState<Triple[]>([]),
    [nextIri, setNextIri] = useState(iri),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [page, setPage] = useState(0);
  const reload = async (discard = false) => {
    try {
      const draft = getEditorDraft(iri, s.datasetEpoch);
      if (draft && !discard) {
        setLoaded(draft.loaded);
        setTriples(draft.statements);
        setNextIri(draft.nextIri);
        return;
      }
      if (discard) discardEditorDraft(iri, s.datasetEpoch);
      const d = await request<DocumentData>("entityDocument", { iri });
      setLoaded(d);
      setTriples(d.statements);
      setNextIri(iri);
      setPage(0);
      setError("");
    } catch (e) {
      setLoaded(null);
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void reload();
  }, [iri, s.datasetEpoch]);
  const changed =
    !!loaded &&
    (nextIri !== iri ||
      JSON.stringify(triples) !== JSON.stringify(loaded.statements));
  useEffect(() => {
    if (loaded)
      rememberEditorDraft({ iri, nextIri, statements: triples, loaded });
  }, [iri, nextIri, triples, loaded]);
  useEffect(() => {
    const check = () => {
      if (!getEditorDraft(iri, s.datasetEpoch)) void reload();
    };
    window.addEventListener("axiom-editor-drafts", check);
    return () => window.removeEventListener("axiom-editor-drafts", check);
  }, [iri, s.datasetEpoch]);
  const stale =
    loaded &&
    (loaded.datasetEpoch !== s.datasetEpoch || loaded.version !== s.version);
  const literalIndex = (ts: Triple[], predicate: string) => {
    const preferred =
      predicate === LABEL
        ? ts.findIndex(
            (t) =>
              t.predicate === predicate &&
              t.object.literal &&
              (t.object.language ?? "") ===
                (loaded?.entity.labelLanguage ?? ""),
          )
        : -1;
    return preferred >= 0
      ? preferred
      : ts.findIndex((t) => t.predicate === predicate && t.object.literal);
  };
  const value = (predicate: string) =>
    triples[literalIndex(triples, predicate)]?.object.value ?? "";
  const setLiteral = (predicate: string, value: string) =>
    setTriples((previous) => {
      const i = literalIndex(previous, predicate);
      if (i < 0)
        return [
          ...previous,
          { subject: iri, predicate, object: { literal: true, value } },
        ];
      return previous.map((t, j) =>
        i === j ? { ...t, object: { ...t.object, value } } : t,
      );
    });
  const edit = (index: number, t: Triple) =>
    setTriples((previous) => previous.map((x, i) => (i === index ? t : x)));
  async function save() {
    if (!loaded) return;
    setSaving(true);
    setError("");
    try {
      const result = await applyEditorDraft({
        iri,
        nextIri,
        statements: triples,
        loaded,
      });
      if (result === iri) await reload();
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
  return (
    <section
      className="panel entity-editor"
      data-panel={panelId}
      aria-label="Entity details"
    >
      <div className="panel-toolbar">
        <strong>
          {loaded ? displayName(loaded.entity) : "Entity details"}
          {changed ? " *" : ""}
        </strong>
        <span className="toolbar-spacer" />
        <button onClick={() => void reload(true)} disabled={saving}>
          Reload
        </button>
        <button
          className="primary"
          onClick={() => void save()}
          disabled={!loaded || !changed || saving}
        >
          Apply changes
        </button>
      </div>
      <div className="entity-editor-content">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {loaded && (
          <>
            <p>
              {kindLabel(loaded.entity.kind)} · Apply changes updates this
              entity. Save workspace also applies retained drafts, including
              drafts in closed tabs.
            </p>
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
            <h2>Statements</h2>
            <p>
              Edit any asserted property, relationship or annotation. Language
              tags and named graphs are preserved. Select Open beside a resource
              to edit its details.
            </p>
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
                Page {page + 1} of {Math.max(1, Math.ceil(triples.length / 50))}
              </span>
              <button
                disabled={(page + 1) * 50 >= triples.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
