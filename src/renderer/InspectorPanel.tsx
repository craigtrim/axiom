import { ClassExpressions, IntersectionDetails } from "./ClassExpressions";
import { instanceAction } from "../shared/action-state";
import { showInstances } from "./instance-report";
import { PaneToolbar, PaneDetails } from "./AdaptivePane";
import { LinkedFileCard } from "./LinkedFileCard";
import { EntityInspectorFields } from "./EntityInspectorFields";
import { EdgeInspector } from "./EdgeInspector";
import { editEntity, entityDragType } from "./authoring";
import { displayName } from "../domain/rdf-model";
import { EditableEntityName, startInlineRename } from "./InlineRename";
import { THING } from "../domain/model";
import { useEffect, useState } from "react";
import { useSnapshot, request, act, command, report } from "./client";
import {
  shorten,
  humanise,
  local,
  kindLabel,
  restrictionText,
  type Restriction,
} from "../domain/model";
import type { InspectorData } from "../shared/protocol";
export function EntityLink({ iri }: { iri: string }) {
  const s = useSnapshot();
  const linked = s?.entities.find((e) => e.iri === iri);
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
      {linked ? displayName(linked) : shorten(iri)}
    </button>
  );
}
export function InspectorPanel() {
  const s = useSnapshot()!,
    [data, setData] = useState<InspectorData | null>(null),
    [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
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
        className="panel empty"
        data-panel="inspector"
        aria-label="Entity inspector"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(entityDragType)) e.preventDefault();
        }}
        onDrop={(e) => {
          const iri = e.dataTransfer.getData(entityDragType);
          if (iri) {
            e.preventDefault();
            editEntity(iri);
          }
        }}
      >
        <strong>Entity inspector</strong>
        <p>Select an entity in the hierarchy, graph or table.</p>
      </section>
    );
  if (data.entity.kind === "Intersection")
    return <IntersectionDetails entity={data.entity} panelId="inspector" />;
  const instances = instanceAction(
    s.entities.find((e) => e.iri === data.entity.iri),
  );
  const e = data.entity,
    editable = s.entities.some((entity) => entity.iri === e.iri),
    section = (title: string, items: string[]) =>
      items.length ? (
        <PaneDetails className="inspector-section" title={title}>
          {items.map((iri, i) => (
            <EntityLink key={iri + i} iri={iri} />
          ))}
        </PaneDetails>
      ) : null;
  const axioms = (title: string, rs: Restriction[]) =>
    rs.length ? (
      <PaneDetails className="inspector-section" title={title}>
        {rs.map((r, i) => (
          <div className="axiom" key={i}>
            <code>{restrictionText(r)}</code>
            <div className="axiom-links">
              {r.fillers.map((f) => (
                <EntityLink key={f} iri={f} />
              ))}
            </div>
          </div>
        ))}
      </PaneDetails>
    ) : null;
  return (
    <section
      className="panel inspector-panel"
      data-panel="inspector"
      aria-label="Entity inspector"
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes(entityDragType)) {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(ev) => {
        const iri = ev.dataTransfer.getData(entityDragType);
        if (s.entities.some((e) => e.iri === iri)) {
          ev.preventDefault();
          editEntity(iri);
        }
      }}
    >
      <PaneToolbar
        label="Inspector actions"
        secondary={
          <>
            {" "}
            <button onClick={() => command("view.source")}>View source</button>
            <button
              onClick={(event) =>
                startInlineRename(e.iri, {
                  document: event.currentTarget.ownerDocument,
                  panel: "inspector",
                })
              }
              disabled={
                e.iri === THING ||
                e.iri !== s.selected ||
                !s.entities.some((x) => x.iri === e.iri)
              }
              title="Rename entity"
            >
              Rename
            </button>
            <button
              onClick={() => {
                void act("seed", { iris: [e.iri] }).then(() =>
                  command("graph.fit"),
                );
                command("view.graph");
              }}
            >
              Show in graph
            </button>
          </>
        }
      >
        <button
          onClick={() => editEntity(e.iri)}
          disabled={!s.entities.some((entity) => entity.iri === e.iri)}
          title={
            s.entities.some((entity) => entity.iri === e.iri)
              ? "Show entity details"
              : "Generated sample records are read-only"
          }
        >
          Details
        </button>
        <button onClick={() => command("research.open")}>Research</button>
      </PaneToolbar>
      <div className="inspector-content">
        <LinkedFileCard key={s.datasetEpoch + e.iri} iri={e.iri} />
        <h2>
          <EditableEntityName key={e.iri} iri={e.iri} name={e.name}>
            {displayName(e)}
          </EditableEntityName>
        </h2>
        <span className={"kind-label " + e.kind}>{kindLabel(e.kind)}</span>
        {!editable && (
          <div className="iri-block">
            <code>{e.iri}</code>
            <button
              onClick={() =>
                void window.axiom
                  .copy(e.iri)
                  .then(() => report("Copied entity IRI."))
              }
            >
              Copy IRI
            </button>
          </div>
        )}
        <ClassExpressions entity={e} />
        {editable && (
          <EntityInspectorFields
            key={s.datasetEpoch + e.iri}
            entity={e}
            actionsHost={actionsHost}
          />
        )}
        {!editable && e.comment && <p>{e.comment}</p>}
        {!editable &&
          data.values.some(
            (v) =>
              v.predicate === "http://www.w3.org/2004/02/skos/core#altLabel",
          ) && (
            <PaneDetails className="inspector-section" title="Synonyms">
              <ul>
                {data.values
                  .filter(
                    (v) =>
                      v.predicate ===
                      "http://www.w3.org/2004/02/skos/core#altLabel",
                  )
                  .map((v, i) => (
                    <li key={i}>{v.term.value}</li>
                  ))}
              </ul>
            </PaneDetails>
          )}
        {!editable &&
          section(
            e.kind.endsWith("Property") ? "Subproperty of" : "Subclass of",
            e.parents,
          )}
        {!editable && section("Types", e.types)}
        {axioms("Equivalent to", e.equivalents)}
        {axioms("Restrictions", e.restrictions)}
        {!editable && section("Disjoint with", e.disjoint)}
        {!editable && section("Domain", e.domain ? [e.domain] : [])}
        {!editable && section("Range", e.range ? [e.range] : [])}
        {!editable && section("Inverse", e.inverse ? [e.inverse] : [])}
        {e.characteristics.length > 0 && (
          <PaneDetails className="inspector-section" title="Characteristics">
            <p>{e.characteristics.join(", ")}</p>
          </PaneDetails>
        )}
        <PaneDetails className="inspector-section" title="Usage">
          <dl>
            <dt>Subclasses</dt>
            <dd>{e.children.length}</dd>
            <dt>Descendants</dt>
            <dd>{data.descendants.toLocaleString("en-GB")}</dd>
            <dt>Direct instances</dt>
            <dd>
              {["Class", "Defined"].includes(e.kind) ? (
                <button
                  className="entity-link"
                  disabled={!instances.enabled}
                  title={instances.title}
                  aria-label={instances.label + " of " + displayName(e)}
                  onClick={() => showInstances(e.iri)}
                >
                  {instances.count.toLocaleString("en-GB")}
                </button>
              ) : (
                data.instances.toLocaleString("en-GB")
              )}
            </dd>
          </dl>
        </PaneDetails>
        {data.order && (
          <PaneDetails className="inspector-section" title="Order data">
            <dl>
              <dt>Order reference</dt>
              <dd>{data.order.reference}</dd>
              <dt>Branch</dt>
              <dd>{data.order.branch}</dd>
              <dt>Price</dt>
              <dd>£{data.order.price.toFixed(2)}</dd>
              <dt>Rating</dt>
              <dd>{data.order.rating} / 5</dd>
              <dt>Prepared</dt>
              <dd>
                {new Date(data.order.timestamp).toLocaleString("en-GB", {
                  timeZone: "UTC",
                })}
              </dd>
              <dt>Customer</dt>
              <dd>{data.customer && <EntityLink iri={data.customer.iri} />}</dd>
            </dl>
          </PaneDetails>
        )}
        {!data.order && e.kind === "Individual" && data.values.length > 0 && (
          <PaneDetails className="inspector-section" title="Statements">
            <p>
              {data.values.length.toLocaleString()} statements describe this
              entity.
            </p>
            <button onClick={() => command("view.source")}>
              Open source editor
            </button>
          </PaneDetails>
        )}
        <PaneDetails className="inspector-section" title="Inferred axioms">
          <p className="muted">
            No reasoner has run. This workspace shows asserted axioms.
          </p>
        </PaneDetails>
      </div>
      {editable && (
        <div ref={setActionsHost} className="pane-footer inspector-footer" />
      )}
    </section>
  );
}
