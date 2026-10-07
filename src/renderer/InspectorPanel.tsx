import { useEffect, useMemo, useRef, useState } from "react";
import { TYPE, SUBCLASS, THING, NS, kindLabel, shorten } from "../domain/model";
import { displayName, LABEL } from "../domain/rdf-model";
import { compactIri, expandIri, entityNamespace } from "../shared/terms";
import type { InspectorData } from "../shared/protocol";
import { act, command, report, request, useSnapshot } from "./client";
import { useEntityEditor } from "./useEntityEditor";
import { EdgeInspector } from "./EdgeInspector";
import { entityDragType, editEntity } from "./authoring";
import {
  IndividualPaneHeader,
  IndividualPopover,
  InferredTag,
  SaveState,
} from "./IndividualsChrome";
import { StatementGroupRow } from "./StatementGroupRow";
import { groupStatements } from "./statement-groups";

export function EntityLink({ iri }: { iri: string }) {
  const s = useSnapshot();
  const e = s?.entities.find((e) => e.iri === iri);
  return (
    <button
      className="entity-link"
      title={iri}
      onClick={() => void act("select", { iri })}
      onDoubleClick={() => {
        void act("seed", { iris: [iri] }).then(() => command("graph.fit"));
        command("view.graph");
      }}
    >
      {e ? displayName(e) : shorten(iri)}
    </button>
  );
}
export function InspectorPanel() {
  const s = useSnapshot()!,
    [data, setData] = useState<InspectorData | null>(null);
  useEffect(() => {
    let active = true;
    if (!s.selected) {
      setData(null);
      return;
    }
    void request<InspectorData | null>("inspector", { iri: s.selected })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => report(e.message, true));
    return () => {
      active = false;
    };
  }, [s.selected, s.version, s.datasetEpoch]);
  if (s.graph.selectedEdge)
    return (
      <EdgeInspector
        key={s.datasetEpoch + s.graph.selectedEdge}
        edgeId={s.graph.selectedEdge}
      />
    );
  if (!data || data.entity.iri !== s.selected)
    return (
      <section
        className="individuals-surface pane"
        data-panel="inspector"
        aria-label="Entity inspector"
      >
        <IndividualPaneHeader>
          <span className="name">Inspector</span>
        </IndividualPaneHeader>
        <div className="pbody" style={{ padding: 12 }}>
          Select an individual to inspect it.
        </div>
      </section>
    );
  return (
    <InspectorStatements key={s.datasetEpoch + data.entity.iri} data={data} />
  );
}
function InspectorStatements({ data }: { data: InspectorData }) {
  const s = useSnapshot()!,
    e = data.entity,
    editor = useEntityEditor(e.iri, false, true);
  const [renaming, setRenaming] = useState(false),
    [name, setName] = useState(""),
    [adding, setAdding] = useState(false),
    [predicate, setPredicate] = useState("");
  const renameCancelled = useRef(false),
    renameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) renameInput.current?.select();
  }, [renaming]);
  const namespace = entityNamespace(e.iri, s.ontology.namespace);
  const compact = (iri: string) =>
    iri.startsWith(namespace)
      ? ":" + compactIri(iri, namespace)
      : compactIri(iri, namespace);
  const resourceName = (iri: string) => {
    const c = compactIri(iri, namespace);
    return c.includes(":") && c !== iri
      ? c
      : (s.entities.find((e) => e.iri === iri)?.label ?? c);
  };
  const groups = useMemo(
    () =>
      groupStatements(
        editor.triples.map((t, index) => ({
          predicate: t.predicate,
          value: { t, index },
        })),
      ),
    [editor.triples],
  );
  const individual = e.kind === "Individual",
    editable = s.entities.some((entity) => entity.iri === e.iri),
    isClass = ["Class", "Defined"].includes(e.kind),
    property = e.kind.endsWith("Property");
  const inferredPredicate = individual ? TYPE : SUBCLASS;
  const inferred =
    ((individual && e.types.length > 0) || (isClass && e.iri !== THING)) &&
    !editor.loaded?.statements.some(
      (t) =>
        t.predicate === inferredPredicate &&
        !t.object.literal &&
        t.object.value === THING,
    );
  const identity = individual
    ? e.types[0]
    : (e.parents[0] ?? (isClass ? THING : undefined));
  const discard = () => {
    void editor.reload(true);
    report("Draft discarded.");
  };
  const rename = () => {
    if (!renameCancelled.current && name.trim())
      editor.setLiteral(LABEL, name.trim());
    setRenaming(false);
  };
  const closeMenu = (target: HTMLElement) => {
    target.closest<HTMLElement>("[popover]")?.hidePopover();
  };
  const add = (p: string) => {
    const first = editor.triples.find((t) => t.predicate === p);
    editor.setTriples((ts) => [
      ...ts,
      {
        subject: e.iri,
        predicate: p,
        object: first
          ? { ...first.object, value: "" }
          : {
              literal:
                ![
                  TYPE,
                  SUBCLASS,
                  NS.rdfs + "subPropertyOf",
                  NS.rdfs + "domain",
                  NS.rdfs + "range",
                  NS.owl + "inverseOf",
                  NS.owl + "sameAs",
                  NS.owl + "equivalentClass",
                  NS.owl + "equivalentProperty",
                  NS.owl + "disjointWith",
                ].includes(p) &&
                s.entities.find((entity) => entity.iri === p)?.kind !==
                  "ObjectProperty",
              value: "",
            },
      },
    ]);
  };
  return (
    <section
      className="individuals-surface pane"
      data-panel="inspector"
      aria-label="Entity inspector"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !renaming &&
          editor.changed &&
          !(event.target as HTMLElement).closest("[popover]")
        ) {
          event.preventDefault();
          discard();
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(entityDragType))
          event.preventDefault();
      }}
      onDrop={(event) => {
        const iri = event.dataTransfer.getData(entityDragType);
        if (iri) {
          event.preventDefault();
          editEntity(iri);
        }
      }}
    >
      <IndividualPaneHeader>
        {renaming ? (
          <input
            ref={renameInput}
            className="fld name"
            aria-label="Rename entity"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                rename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                renameCancelled.current = true;
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span className="name">{displayName(e)}</span>
        )}
        <SaveState draft={editor.changed}>
          {editor.changed && (
            <>
              <button
                className="btn"
                disabled={editor.saving}
                onClick={discard}
              >
                Discard
              </button>
              <button
                className="btn primary"
                disabled={editor.saving}
                onClick={() => void editor.save()}
              >
                Apply changes
              </button>
            </>
          )}
        </SaveState>
        {!editor.changed && (
          <IndividualPopover label="More actions" buttonClass="ib" button="···">
            <div className="individual-menu">
              <button
                className="btn quiet"
                disabled={!editable}
                onClick={(event) => {
                  closeMenu(event.currentTarget);
                  renameCancelled.current = false;
                  setName(editor.value(LABEL) || displayName(e));
                  setRenaming(true);
                }}
              >
                Rename
              </button>
              <button
                className="btn quiet"
                disabled={e.iri.startsWith("_:")}
                onClick={(event) => {
                  closeMenu(event.currentTarget);
                  command("touchpoints.open");
                }}
              >
                Find touchpoints
              </button>
              <button
                className="btn quiet"
                onClick={(event) => {
                  closeMenu(event.currentTarget);
                  void window.axiom
                    .copy(e.iri)
                    .then(() => report("Copied entity IRI."));
                }}
              >
                Copy IRI
              </button>
            </div>
          </IndividualPopover>
        )}
      </IndividualPaneHeader>
      <div className="ident">
        <span className="kind">{isClass ? "Class" : kindLabel(e.kind)}</span>
        {identity && (
          <>
            <span className="dot">·</span>
            <button
              className="lnk"
              onClick={() => void act("select", { iri: identity })}
            >
              {resourceName(identity)}
            </button>
          </>
        )}
        <span className="dot">·</span>
        <span className="qid">{compact(e.iri)}</span>
        <span className="dot">·</span>
        <span className="iri">{e.iri}</span>
      </div>
      <div className="pbody">
        <div className="scount">
          <span>
            <b>{editor.loaded?.statements.length ?? 0}</b> asserted
          </span>
          {inferred && (
            <>
              <span className="dot">·</span>
              <span>1 inferred</span>
            </>
          )}
          <span className="flex" />
          <button
            className="btn tiny"
            disabled={!editable}
            onClick={() => setAdding(!adding)}
          >
            Add row
          </button>
        </div>
        {adding && (
          <form
            className="inspector-predicate"
            onSubmit={(event) => {
              event.preventDefault();
              if (!predicate.trim()) return;
              add(expandIri(predicate, namespace));
              setAdding(false);
              setPredicate("");
            }}
          >
            <input
              className="fld"
              aria-label="Predicate for new row"
              placeholder="Predicate"
              value={predicate}
              onChange={(event) => setPredicate(event.target.value)}
              autoFocus
            />
            <button className="btn" type="submit">
              Add row
            </button>
          </form>
        )}
        {editor.error && (
          <div role="alert" className="inspector-message">
            {editor.error}
          </div>
        )}
        <table className="st">
          <colgroup>
            <col className="c-pred" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Predicate</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <StatementGroupRow
                inspector
                key={g.predicate}
                group={g}
                name={compact(g.predicate)}
                predicate={compact(g.predicate)}
                valueKey={(v, i) => i}
                add={editable ? () => add(g.predicate) : undefined}
                removable={() => editable}
                remove={(v) =>
                  editor.setTriples((ts) => ts.filter((_, i) => i !== v.index))
                }
                renderValue={({ t, index }, i) => (
                  <input
                    className="val"
                    readOnly={!editable}
                    aria-label={`${compact(t.predicate)} value ${i + 1}`}
                    value={
                      t.object.literal
                        ? t.object.value
                        : resourceName(t.object.value)
                    }
                    onChange={(event) => {
                      const text = event.target.value;
                      const value = t.object.literal
                        ? text
                        : (s.entities.find((e) => displayName(e) === text)
                            ?.iri ?? expandIri(text, namespace));
                      editor.setTriples((ts) =>
                        ts.map((v, j) =>
                          j === index
                            ? { ...v, object: { ...v.object, value } }
                            : v,
                        ),
                      );
                    }}
                  />
                )}
              />
            ))}
            {inferred && (
              <tr>
                <td>
                  <div className="pred">
                    {compact(inferredPredicate)}
                    <InferredTag />
                  </div>
                </td>
                <td>
                  <div className="vals">
                    <input
                      className="val"
                      aria-label="Inferred owl:Thing"
                      value="owl:Thing"
                      readOnly
                    />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="usage">
        {isClass && (
          <>
            <span className="u">
              Subclasses <b>{e.children.length.toLocaleString("en-US")}</b>
            </span>
            <span className="u">
              Descendants <b>{data.descendants.toLocaleString("en-US")}</b>
            </span>
            <span className="u">
              Direct instances <b>{data.instances.toLocaleString("en-US")}</b>
            </span>
          </>
        )}
        {property && (
          <span className="u">
            Sub properties <b>{e.children.length.toLocaleString("en-US")}</b>
          </span>
        )}
        <span className="u">
          Referenced by <b>{data.referencedBy.toLocaleString("en-US")}</b>
        </span>
        <span className="u">
          Inferred axioms <b>{inferred ? 1 : 0}</b>
        </span>
        {!isClass && (
          <span className="u">
            Revision <b>{s.version.toLocaleString("en-US")}</b>
          </span>
        )}
      </div>
    </section>
  );
}
