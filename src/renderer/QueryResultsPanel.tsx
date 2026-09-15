import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, IDatasource } from "ag-grid-community";
import { gridTheme } from "./IndividualsPanel";
import { act, command, request, useSnapshot } from "./client";
import { shorten, type Term } from "../domain/model";
import type { QuerySummary } from "../shared/protocol";
import type { QueryResultDocument } from "../shared/query-history";
import { connectQueryHistory, useQueryHistory } from "./query-history";
import { openResultQuery, graphQueryResults } from "./query-results";

export function QueryResultsPanel({
  resultId,
  panelId,
}: {
  resultId: string;
  panelId: string;
}) {
  const s = useSnapshot()!,
    history = useQueryHistory();
  const [document, setDocument] = useState<QueryResultDocument | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null),
    [opening, setOpening] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    void connectQueryHistory()
      .then(() => window.axiom.queryHistory.result(resultId))
      .then((result) => {
        if (live) {
          setDocument(result);
          if (!result)
            setError("The saved query for these results could not be found.");
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [resultId]);
  const sameDataset =
    !!document &&
    document.run.session === history.view?.session &&
    document.run.datasetEpoch === s.datasetEpoch;
  useEffect(() => {
    if (!document) return;
    let live = true;
    if (!sameDataset) {
      setAvailable(false);
      return;
    }
    void request<QuerySummary | null>("queryResult", {
      id: document.run.summary.id,
      key: document.queryId,
      epoch: document.run.datasetEpoch,
    })
      .then((r) => live && setAvailable(!!r))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [document, sameDataset, history.view?.revision]);
  const summary = document?.run.summary;
  const columns = useMemo<ColDef<(Term | null)[]>[]>(
    () =>
      summary?.columns.map((c, i) => ({
        colId: String(i),
        headerName: c,
        minWidth: 150,
        flex: 1,
        valueGetter: (p) => p.data?.[i],
        cellRenderer: ({ value }: { value?: Term }) =>
          !value ? null : value.literal ? (
            <span title={value.datatype || value.language || undefined}>
              {value.value}
            </span>
          ) : (
            <button
              className="entity-link"
              title={value.value}
              onClick={() => void act("select", { iri: value.value })}
              onDoubleClick={() => {
                void act("seed", { iris: [value.value] }).then(() =>
                  command("graph.fit"),
                );
                command("view.graph");
              }}
            >
              {shorten(value.value)}
            </button>
          ),
      })) ?? [],
    [summary],
  );
  const source = useMemo<IDatasource | undefined>(
    () =>
      document
        ? {
            getRows(p) {
              void request<{
                rows: (Term | null)[][];
                total: number;
                retained: boolean;
              }>("queryPage", {
                id: document.run.summary.id,
                key: document.queryId,
                epoch: document.run.datasetEpoch,
                start: p.startRow,
                end: p.endRow,
              })
                .then((r) => {
                  if (!r.retained) {
                    setAvailable(false);
                    p.failCallback();
                  } else p.successCallback(r.rows, r.total);
                })
                .catch((e) => {
                  setError(e.message);
                  p.failCallback();
                });
            },
          }
        : undefined,
    [document],
  );
  const activate = () => {
    if (document && sameDataset && available)
      void request("queryActivate", {
        key: document.queryId,
        id: document.run.summary.id,
      }).catch((e) => setError(e.message));
  };
  return (
    <section
      className="panel query-results-panel"
      data-panel={panelId}
      data-result-id={resultId}
      aria-label="Query results"
      onFocusCapture={activate}
      onPointerDownCapture={activate}
    >
      {document && summary && (
        <>
          <div className="panel-toolbar result-actions">
            <strong className="result-query-title" title={document.title}>
              {document.title}
            </strong>
            <button
              disabled={opening}
              onClick={() => {
                setOpening(true);
                void openResultQuery(resultId)
                  .catch((e) => setError(e.message))
                  .finally(() => setOpening(false));
              }}
            >
              Open query
            </button>
            <button
              disabled={!available || !sameDataset || !summary.rowCount}
              onClick={() =>
                void graphQueryResults(document).catch((e) =>
                  setError(e.message),
                )
              }
            >
              Send results to graph
            </button>
          </div>
          <div className="result-provenance">
            <span>
              {summary.queryType ?? "SPARQL"} · Run {document.sequence}
            </span>
            <time dateTime={document.completedAt}>
              {document.completedAt
                ? new Date(document.completedAt).toLocaleString()
                : "Run time unavailable"}
            </time>
            <span title={document.namespace}>
              {document.origin || "Local ontology"}
            </span>
          </div>
          <details className="result-source">
            <summary>Executed SPARQL</summary>
            <pre tabIndex={0} aria-label="Executed SPARQL">
              {document.run.text}
            </pre>
          </details>
          <div className="query-summary" role="status">
            {available && sameDataset
              ? summary.rowCount.toLocaleString("en-GB") +
                " displayed / " +
                summary.total.toLocaleString("en-GB") +
                " result rows · " +
                summary.milliseconds.toFixed(1) +
                " ms"
              : available === null
                ? "Loading results…"
                : "Result rows are no longer retained. The executed query is saved. Open it and run it again to refresh results."}
            {available && sameDataset && summary.capped && (
              <strong> Showing the first 200,000 result rows.</strong>
            )}
            {available && sameDataset && summary.storeVersion !== s.version && (
              <span className="stale">
                Data changed since this run. These results show the earlier
                data.
              </span>
            )}
          </div>
          {available &&
            sameDataset &&
            (summary.rowCount ? (
              <div className="grid-host query-results">
                <AgGridReact<(Term | null)[]>
                  key={resultId}
                  theme={gridTheme(
                    globalThis.document.documentElement.dataset.theme ===
                      "dark",
                  )}
                  columnDefs={columns}
                  rowModelType="infinite"
                  datasource={source}
                  cacheBlockSize={100}
                  maxBlocksInCache={5}
                  defaultColDef={{ resizable: true }}
                  animateRows={false}
                  ensureDomOrder={true}
                  overlayNoRowsTemplate="No matches."
                />
              </div>
            ) : (
              <div className="result-empty">No matches.</div>
            ))}
        </>
      )}
      {loading && <div className="query-loading">Loading query results…</div>}
      {error && (
        <div className="query-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
