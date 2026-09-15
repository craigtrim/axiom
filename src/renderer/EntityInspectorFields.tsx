import { useEntityEditor } from "./useEntityEditor";
import { useSnapshot, report } from "./client";
import {
  LABEL,
  COMMENT,
  displayName,
  isDefaultIdentifier,
  identifierParts,
} from "../domain/rdf-model";
import {
  NS,
  TYPE,
  SUBCLASS,
  SUBPROPERTY,
  THING,
  shorten,
  type Entity,
} from "../domain/model";

export function EntityInspectorFields({ entity }: { entity: Entity }) {
  const s = useSnapshot()!,
    editor = useEntityEditor(entity.iri),
    {
      loaded,
      triples,
      nextIri,
      setNextIri,
      setTriples,
      value,
      setLiteral,
      changed,
      error,
      saving,
      save,
      reload,
      stale,
    } = editor;
  const isClass = entity.kind === "Class" || entity.kind === "Defined",
    isProperty = entity.kind.endsWith("Property"),
    fixedIri =
      entity.iri === THING ||
      (!!s.ontology.example && !isDefaultIdentifier(entity.iri)),
    { namespace, name } = identifierParts(nextIri);
  const classes = s.entities.filter(
    (e) => e.kind === "Class" || e.kind === "Defined",
  );
  const relationship = (
    title: string,
    predicate: string,
    choices: Entity[],
  ) => {
    const rows = triples
      .map((t, index) => ({ t, index }))
      .filter(
        ({ t }) =>
          t.predicate === predicate &&
          !t.object.literal &&
          !t.object.value.startsWith("_:") &&
          !(
            predicate === TYPE && t.object.value === NS.owl + "NamedIndividual"
          ),
      );
    const available = choices.filter((e) => e.iri !== entity.iri);
    const first = available.find(
      (e) => !rows.some(({ t }) => t.object.value === e.iri),
    );
    return (
      <div className="inspector-relation" key={predicate}>
        <div className="inspector-field-heading">
          <span>{title}</span>
          <button
            type="button"
            aria-label={"Add " + title}
            disabled={!first}
            onClick={() =>
              first &&
              setTriples((ts) => [
                ...ts,
                {
                  subject: entity.iri,
                  predicate,
                  object: { literal: false, value: first.iri },
                },
              ])
            }
          >
            Add
          </button>
        </div>
        {rows.map(({ t, index }, order) => (
          <div className="inspector-relation-row" key={index}>
            <select
              aria-label={title + " " + (order + 1)}
              value={t.object.value}
              title={t.object.value}
              onChange={(event) =>
                setTriples((ts) =>
                  ts.map((x, i) =>
                    i === index
                      ? {
                          ...x,
                          object: { ...x.object, value: event.target.value },
                        }
                      : x,
                  ),
                )
              }
            >
              {!available.some((e) => e.iri === t.object.value) && (
                <option value={t.object.value}>
                  {shorten(t.object.value)}
                </option>
              )}
              {available.map((e) => (
                <option key={e.iri} value={e.iri}>
                  {displayName(e)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={"Remove " + title + " " + (order + 1)}
              onClick={() =>
                setTriples((ts) => ts.filter((_, i) => i !== index))
              }
            >
              Remove
            </button>
            {t.graph && (
              <small className="muted" title={t.graph}>
                {shorten(t.graph)}
              </small>
            )}
          </div>
        ))}
        {!rows.length && <small className="muted">None</small>}
      </div>
    );
  };
  return (
    <form
      className="inspector-fields"
      aria-label="Edit entity properties"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded ? (
        <p>Loading properties...</p>
      ) : (
        <>
          <fieldset disabled={saving}>
            <div className="entity-fields">
              <label>
                Name
                <input
                  aria-label="Entity name"
                  value={name}
                  disabled={fixedIri || nextIri.startsWith("_:")}
                  title="Local part of the identifier (IRI)"
                  required
                  onChange={(event) =>
                    setNextIri(namespace + event.target.value)
                  }
                />
                <small className="muted">Identifier name</small>
              </label>
              <label>
                Label
                <input
                  aria-label="Entity label"
                  value={value(LABEL)}
                  maxLength={256}
                  onChange={(event) => setLiteral(LABEL, event.target.value)}
                />
                <small className="muted">
                  Displayed in the graph
                  {loaded.entity.labelLanguage
                    ? " · " + loaded.entity.labelLanguage
                    : ""}
                </small>
              </label>
              <label className="wide-field">
                Comment
                <textarea
                  aria-label="Entity comment"
                  rows={2}
                  value={value(COMMENT)}
                  onChange={(event) => setLiteral(COMMENT, event.target.value)}
                />
              </label>
            </div>
            <details className="inspector-identifier">
              <summary>Full identifier (IRI)</summary>
              <label>
                <span className="sr-only">Identifier (IRI)</span>
                <input
                  aria-label="Entity IRI"
                  value={nextIri}
                  disabled={fixedIri}
                  onChange={(event) => setNextIri(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  void window.axiom
                    .copy(nextIri)
                    .then(() => report("Copied entity IRI."))
                }
              >
                Copy IRI
              </button>
              {fixedIri && (
                <small className="muted">
                  {entity.iri === THING
                    ? "The root identifier is fixed."
                    : "Identifiers are fixed in the generated example."}
                </small>
              )}
            </details>
            {isClass && relationship("Subclass of", SUBCLASS, classes)}
            {entity.kind === "Individual" &&
              relationship("Types", TYPE, classes)}
            {isProperty && (
              <>
                {relationship(
                  "Subproperty of",
                  SUBPROPERTY,
                  s.entities.filter((e) => e.kind === entity.kind),
                )}
                {relationship("Domain", NS.rdfs + "domain", classes)}
                {relationship(
                  "Range",
                  NS.rdfs + "range",
                  entity.kind === "DataProperty"
                    ? [
                        ...s.entities.filter((e) => e.kind === "Datatype"),
                        ...[
                          "string",
                          "boolean",
                          "integer",
                          "decimal",
                          "double",
                          "dateTime",
                        ]
                          .filter(
                            (n) =>
                              !s.entities.some((e) => e.iri === NS.xsd + n),
                          )
                          .map((n) => ({
                            ...entity,
                            iri: NS.xsd + n,
                            name: n,
                            label: n,
                          })),
                      ]
                    : classes,
                )}
                {entity.kind === "ObjectProperty" &&
                  relationship(
                    "Inverse",
                    NS.owl + "inverseOf",
                    s.entities.filter((e) => e.kind === "ObjectProperty"),
                  )}
              </>
            )}
            <details className="inspector-extra-fields">
              <summary>More properties</summary>
              {isClass &&
                relationship("Disjoint with", NS.owl + "disjointWith", classes)}
              <div className="inspector-field-heading">
                <span>Synonyms</span>
                <button
                  type="button"
                  onClick={() =>
                    setTriples((ts) => [
                      ...ts,
                      {
                        subject: entity.iri,
                        predicate:
                          "http://www.w3.org/2004/02/skos/core#altLabel",
                        object: { literal: true, value: "" },
                      },
                    ])
                  }
                >
                  Add synonym
                </button>
              </div>
              {triples.map((t, index) =>
                t.predicate ===
                  "http://www.w3.org/2004/02/skos/core#altLabel" &&
                t.object.literal ? (
                  <div className="inspector-relation-row" key={index}>
                    <input
                      aria-label={"Synonym " + (index + 1)}
                      value={t.object.value}
                      onChange={(event) =>
                        setTriples((ts) =>
                          ts.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  object: {
                                    ...x.object,
                                    value: event.target.value,
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={"Remove synonym " + (index + 1)}
                      onClick={() =>
                        setTriples((ts) => ts.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                    {(t.object.language || t.graph) && (
                      <small className="muted">
                        {[t.object.language, t.graph && shorten(t.graph)]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    )}
                  </div>
                ) : null,
              )}
            </details>
          </fieldset>
          {stale && changed && (
            <p role="status" className="muted">
              The ontology changed. Applying will check for conflicting edits.
            </p>
          )}
          <div className="inspector-save-actions">
            <button
              type="submit"
              className="primary"
              disabled={!changed || saving}
            >
              Apply changes
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void reload(true)}
            >
              Reload
            </button>
            <span role="status" className="muted">
              {changed ? "Unsaved changes" : "Saved"}
            </span>
          </div>
        </>
      )}
    </form>
  );
}
