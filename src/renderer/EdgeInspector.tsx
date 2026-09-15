import { PaneToolbar, PaneDetails, usePaneLayout } from "./AdaptivePane";
import { useEffect, useRef, useState } from "react";
import { request, useSnapshot, onCommand } from "./client";
import { resetEdgeRoute } from "./edge-actions";
import { editEntity } from "./authoring";
import {
  NS,
  SUBCLASS,
  SUBPROPERTY,
  TYPE,
  expand,
  shorten,
} from "../domain/model";
import { displayName } from "../domain/rdf-model";
import type { EdgeDocument } from "../shared/protocol";
export function EdgeInspector({ edgeId }: { edgeId: string }) {
  const { compact } = usePaneLayout();
  const s = useSnapshot()!,
    [data, setData] = useState<EdgeDocument | null>(null),
    [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    [predicate, setPredicate] = useState(""),
    [statement, setStatement] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    sourceInput = useRef<HTMLSelectElement>(null),
    alive = useRef(true);
  async function load() {
    try {
      const doc = await request<EdgeDocument>("edgeDocument", { key: edgeId });
      if (!alive.current) return;
      setData(doc);
      setSource(doc.edge.source);
      setTarget(doc.edge.target);
      setPredicate(shorten(doc.edge.predicate));
      setStatement(0);
      setError("");
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [edgeId]);
  useEffect(
    () =>
      onCommand((id) => {
        if (id === "edge.focus") sourceInput.current?.focus();
      }),
    [],
  );
  const stale =
    !!data &&
    (s.datasetEpoch !== data.datasetEpoch || s.version !== data.version);
  async function save(remove = false) {
    if (!data || busy || stale) return;
    setBusy(true);
    setError("");
    try {
      const original = data.statements[statement];
      await request("editEdge", {
        key: edgeId,
        original,
        datasetEpoch: data.datasetEpoch,
        version: data.version,
        ...(remove
          ? {}
          : {
              replacement: {
                ...original,
                subject: source,
                predicate: expand(predicate.trim().replace(/^<|>$/g, "")),
                object: { literal: false, value: target },
              },
            }),
      });
      if (alive.current) void load();
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).message.replace(
            /^Error invoking remote method '[^']+': Error: /,
            "",
          ),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const entities = new Map(s.entities.map((e) => [e.iri, displayName(e)]));
  for (const n of s.graph.nodes)
    if (!entities.has(n.iri)) entities.set(n.iri, n.label);
  const predicates = [
    ...new Set([
      SUBCLASS,
      SUBPROPERTY,
      TYPE,
      NS.owl + "equivalentClass",
      NS.owl + "disjointWith",
      NS.rdfs + "domain",
      NS.rdfs + "range",
      NS.owl + "inverseOf",
      ...s.entities
        .filter((e) => e.kind.endsWith("Property"))
        .map((e) => e.iri),
      ...s.graph.edges.map((e) => e.predicate),
    ]),
  ];
  const edge = s.graph.edges.find(
    (e) => JSON.stringify([e.source, e.predicate, e.target]) === edgeId,
  );
  return (
    <section
      className="panel inspector-panel"
      data-panel="inspector"
      aria-label="Edge inspector"
    >
      <PaneToolbar
        label="Edge actions"
        secondary={
          <button onClick={() => void load()} disabled={busy}>
            Reload edge
          </button>
        }
      >
        {" "}
        {!!data?.statements.length && (
          <div className="edge-editor-actions">
            <button
              type="button"
              onClick={() => void save()}
              className="primary"
              aria-label="Apply edge changes"
              disabled={busy || stale}
            >
              {compact ? "Apply" : "Apply edge changes"}
            </button>
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={busy || stale}
            >
              Remove edge
            </button>
          </div>
        )}
      </PaneToolbar>
      <form
        className="edge-editor inspector-content"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2>Relationship</h2>
        {data && (
          <>
            <label>
              From
              <select
                ref={sourceInput}
                aria-label="Edge source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={!data.statements.length || busy}
              >
                {[...entities].map(([iri, label]) => (
                  <option key={iri} value={iri}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Relationship
              <input
                aria-label="Edge relationship"
                list="edge-predicates"
                value={predicate}
                onChange={(e) => setPredicate(e.target.value)}
                disabled={!data.statements.length || busy}
              />
            </label>
            <datalist id="edge-predicates">
              {predicates.map((p) => (
                <option key={p} value={shorten(p)} />
              ))}
            </datalist>
            <label>
              To
              <select
                aria-label="Edge target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={!data.statements.length || busy}
              >
                {[...entities].map(([iri, label]) => (
                  <option key={iri} value={iri}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {data.statements.length > 1 && (
              <label>
                Statement graph
                <select
                  aria-label="Edge statement graph"
                  value={statement}
                  onChange={(e) => setStatement(+e.target.value)}
                >
                  {data.statements.map((t, i) => (
                    <option value={i} key={i}>
                      {t.graph ?? "Default graph"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {data.statements.length === 1 && data.statements[0].graph && (
              <p className="edge-graph-name">
                Statement graph: {data.statements[0].graph}
              </p>
            )}
            {data.reason && <p>{data.reason}</p>}
            {stale && (
              <p role="alert">
                The ontology changed. Reload this edge before saving.
              </p>
            )}
            <PaneDetails className="inspector-section" title="Route">
              <p>
                Drag the middle handle to bend the line. Drag an endpoint onto a
                node to reconnect it. Use the From and To fields to choose any
                ontology entity.
              </p>
              <button
                type="button"
                disabled={!edge?.bend}
                onClick={() => void resetEdgeRoute(edgeId)}
              >
                Reset edge route
              </button>
            </PaneDetails>
            <button type="button" onClick={() => editEntity(data.edge.source)}>
              Open source details
            </button>
          </>
        )}
        {error && <div role="alert">{error}</div>}
      </form>
    </section>
  );
}
