import { ResourceInput } from "./ResourceInput";
import { PredicateSelect, usePredicateOptions } from "./PredicateSelect";
import { DetailsBack } from "./DetailsNavigation";
import { expandIri, entityNamespace } from "./StatementGrid";
import { edgeKey } from "../domain/viewport";
import {
  applyEdgeDraft,
  clearEdgeDraft,
  getEdgeDraft,
  onEdgeDraft,
  rememberEdgeDraft,
  type EdgeDraft,
} from "./edge-editor-drafts";
import { PaneToolbar, PaneDetails, usePaneLayout } from "./AdaptivePane";
import { useEffect, useRef, useState } from "react";
import { request, useSnapshot, command } from "./client";
import { resetEdgeRoute } from "./edge-actions";
import { editEntity } from "./authoring";
import { SUBCLASS, shorten } from "../domain/model";
import { displayName } from "../domain/rdf-model";
import type { EdgeDocument } from "../shared/protocol";
export function EdgeInspector({
  edgeId,
  panelId = "inspector",
}: {
  edgeId: string;
  panelId?: string;
}) {
  const automatic = panelId !== "inspector";
  const predicateOptions = usePredicateOptions([]);
  const { compact } = usePaneLayout();
  const s = useSnapshot()!,
    [data, setData] = useState<EdgeDocument | null>(null),
    [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    [predicate, setPredicate] = useState(""),
    [statement, setStatement] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    alive = useRef(true);
  const accept = (draft: EdgeDraft) => {
    setData(draft.data);
    setSource(draft.source);
    setTarget(draft.target);
    setPredicate(draft.predicate);
    setStatement(draft.statement);
    setError("");
  };
  const update = (patch: Partial<Omit<EdgeDraft, "data">>) => {
    if (!data || busy) return;
    const draft = { data, source, target, predicate, statement, ...patch };
    accept(draft);
    rememberEdgeDraft(edgeId, draft);
    if (automatic) {
      setBusy(true);
      void applyEdgeDraft(edgeId, draft, false, true)
        .then(() => {
          if (alive.current) void load();
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        })
        .finally(() => {
          if (alive.current) {
            setBusy(false);
          }
        });
    }
  };
  async function load(discard = false) {
    if (discard) clearEdgeDraft(edgeId, s.datasetEpoch);
    const pending = getEdgeDraft(edgeId, s.datasetEpoch);
    if (pending) {
      accept(pending);
      return;
    }
    try {
      const doc = await request<EdgeDocument>("edgeDocument", { key: edgeId });
      if (!alive.current) return;
      if (doc.datasetEpoch !== s.datasetEpoch) return;
      accept(
        getEdgeDraft(edgeId, s.datasetEpoch) ?? {
          data: doc,
          source: doc.edge.source,
          target: doc.edge.target,
          predicate: shorten(doc.edge.predicate),
          statement: 0,
        },
      );
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
    () => onEdgeDraft(edgeId, s.datasetEpoch, () => void load()),
    [edgeId, s.datasetEpoch],
  );
  const stale =
    !!data &&
    (s.datasetEpoch !== data.datasetEpoch || s.version !== data.version);
  async function save(remove = false) {
    if (!data || busy || stale) return;
    setBusy(true);
    setError("");
    try {
      await applyEdgeDraft(
        edgeId,
        { data, source, target, predicate, statement },
        remove,
      );
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
  const edge = s.graph.edges.find((e) => edgeKey(e) === edgeId);
  return (
    <section
      className="panel inspector-panel"
      data-panel={panelId}
      aria-label={panelId === "inspector" ? "Edge inspector" : "Details"}
    >
      <PaneToolbar
        label="Edge actions"
        secondary={
          <button onClick={() => void load(true)} disabled={busy}>
            Reload edge
          </button>
        }
      >
        <DetailsBack />
        {panelId === "inspector" && (
          <button type="button" onClick={() => command("view.details")}>
            Details
          </button>
        )}
        {!!data?.statements.length && (
          <div className="edge-editor-actions">
            {!automatic && (
              <button
                type="button"
                onClick={() => void save()}
                className="primary"
                aria-label="Apply edge changes"
                disabled={busy || stale}
              >
                {compact ? "Apply" : "Apply edge changes"}
              </button>
            )}
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
        {data && (
          <>
            <div className="edge-source-compact">
              <span>From</span>{" "}
              <ResourceInput
                label="Edge source"
                value={source}
                namespace={s.ontology.namespace}
                change={(source) => update({ source })}
                disabled={
                  !data.statements.length || busy || !!data.edge.intersection
                }
              />
            </div>
            {data.edge.intersection && (
              <p className="muted">
                {data.edge.predicate === SUBCLASS
                  ? "Subclass of every member"
                  : "Equivalent to the intersection"}
                . This branch belongs to a shared OWL expression.
              </p>
            )}
            <table className="statement-grid" aria-label="Edge statements">
              <colgroup>
                <col className="statement-predicate-column" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Predicate</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <PredicateSelect
                      label="Edge relationship"
                      value={expandIri(
                        predicate,
                        entityNamespace(source, s.ontology.namespace),
                      )}
                      options={predicateOptions}
                      namespace={entityNamespace(source, s.ontology.namespace)}
                      change={(predicate) => update({ predicate })}
                      disabled={
                        !data.statements.length ||
                        busy ||
                        !!data.edge.intersection
                      }
                    />
                  </td>
                  <td>
                    {" "}
                    <ResourceInput
                      label="Edge target"
                      value={target}
                      namespace={s.ontology.namespace}
                      change={(target) => update({ target })}
                      disabled={!data.statements.length || busy}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            {data.statements.length > 1 && (
              <label>
                Statement graph
                <select
                  aria-label="Edge statement graph"
                  value={statement}
                  onChange={(e) => {
                    setStatement(+e.target.value);
                    if (getEdgeDraft(edgeId, s.datasetEpoch))
                      update({ statement: +e.target.value });
                  }}
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
                Drag the middle handle to bend the line. Use the From and To
                fields or the edge context menu to reconnect it.
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
