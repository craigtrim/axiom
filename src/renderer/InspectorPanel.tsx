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
  const e = data.entity,
    editable = s.entities.some((entity) => entity.iri === e.iri),
    section = (title: string, items: string[]) =>
      items.length ? (
        <section className="inspector-section">
          <h3>{title}</h3>
          {items.map((iri, i) => (
            <EntityLink key={iri + i} iri={iri} />
          ))}
        </section>
      ) : null;
  const axioms = (title: string, rs: Restriction[]) =>
    rs.length ? (
      <section className="inspector-section">
        <h3>{title}</h3>
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
      </section>
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
      <div className="panel-toolbar">
        <span>Entity</span>
        <button
          onClick={() => editEntity(e.iri)}
          disabled={!s.entities.some((entity) => entity.iri === e.iri)}
          title={
            s.entities.some((entity) => entity.iri === e.iri)
              ? "Edit all entity statements"
              : "Generated sample records are read-only"
          }
        >
          Edit details
        </button>
        <button onClick={() => command("research.open")}>Research</button>
        <button onClick={() => command("view.source")}>View source</button>
        <span className="toolbar-spacer" />
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
      </div>
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
        {editable && (
          <EntityInspectorFields key={s.datasetEpoch + e.iri} entity={e} />
        )}
        {!editable && e.comment && <p>{e.comment}</p>}
        {!editable &&
          data.values.some(
            (v) =>
              v.predicate === "http://www.w3.org/2004/02/skos/core#altLabel",
          ) && (
            <section className="inspector-section">
              <h3>Synonyms</h3>
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
            </section>
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
          <section className="inspector-section">
            <h3>Characteristics</h3>
            <p>{e.characteristics.join(", ")}</p>
          </section>
        )}
        <section className="inspector-section">
          <h3>Usage</h3>
          <dl>
            <dt>Subclasses</dt>
            <dd>{e.children.length}</dd>
            <dt>Descendants</dt>
            <dd>{data.descendants.toLocaleString("en-GB")}</dd>
            <dt>Direct instances</dt>
            <dd>{data.instances.toLocaleString("en-GB")}</dd>
          </dl>
        </section>
        {data.order && (
          <section className="inspector-section">
            <h3>Order data</h3>
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
          </section>
        )}
        {!data.order && e.kind === "Individual" && data.values.length > 0 && (
          <section className="inspector-section">
            <h3>Statements</h3>
            <p>{data.values.length.toLocaleString()} statements describe this entity.</p>
            <button onClick={() => command("view.source")}>Open source editor</button>
          </section>
        )}
        <section className="inspector-section">
          <h3>Inferred axioms</h3>
          <p className="muted">
            No reasoner has run. This workspace shows asserted axioms.
          </p>
        </section>
      </div>
    </section>
  );
}
