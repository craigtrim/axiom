import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  type ColDef,
  type IDatasource,
  type IHeaderParams,
} from "ag-grid-community";
import { gridTheme } from "./IndividualsPanel";
import { act, command, request, useSnapshot, panel, savePanel } from "./client";
import type { Term } from "../domain/model";
import type { QueryResultDocument } from "../shared/query-history";
import {
  connectQueryHistory,
  useQueryHistory,
  selectQuery,
} from "./query-history";
import {
  openResultQuery,
  graphQueryResults,
  copyQueryResults,
  queryResultLayout,
  rememberQueryResultLayout,
} from "./query-results";
import {
  queryCellText,
  type QueryGridInfo,
  type QueryGridSort,
} from "../shared/query-grid";
import { SharedPane, usePaneToast } from "./SharedPane";
import {
  QueryActions,
  QueryFooter,
  queryCount,
  queryTime,
} from "./QueryChrome";

// craigtrim/axiom#88: retain AG Grid paging while sorting and profiling the complete result.
export function QueryResultsPanel(props: {
  resultId: string;
  panelId: string;
}) {
  const [document, setDocument] = useState<QueryResultDocument | null>(null);
  return (
    <section
      className="panel shared-layer query-results-panel"
      data-panel={props.panelId}
      data-result-id={props.resultId}
      aria-label="Query results"
    >
      <SharedPane
        className="query-surface"
        footer={<QueryFooter document={document} />}
      >
        <QueryResultsContent {...props} onDocument={setDocument} />
      </SharedPane>
    </section>
  );
}
function QuerySortHeader(props: IHeaderParams) {
  const [sort, setSort] = useState(props.column.getSort());
  useEffect(() => {
    const change = () => setSort(props.column.getSort());
    props.column.addEventListener("sortChanged", change);
    return () => props.column.removeEventListener("sortChanged", change);
  }, [props.column]);
  return (
    <button
      className="query-sort"
      onClick={() => props.setSort(sort === "asc" ? "desc" : "asc", false)}
    >
      {props.displayName}
      {sort && (
        <span
          className={"srt " + (sort === "asc" ? "up" : "dn")}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
function QueryResultsContent({
  resultId,
  onDocument,
}: {
  resultId: string;
  panelId: string;
  onDocument(document: QueryResultDocument | null): void;
}) {
  const s = useSnapshot()!,
    history = useQueryHistory(),
    notify = usePaneToast();
  const [document, setDocument] = useState<QueryResultDocument | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [info, setInfo] = useState<QueryGridInfo>();
  const [shown, setShown] = useState<number[]>(
    queryResultLayout(resultId)?.shown ?? [],
  );
  const [sort, setSort] = useState<QueryGridSort | undefined>(
    queryResultLayout(resultId)?.sort,
  );
  const firstSelection = useRef(true);
  const toastShown = useRef(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    void connectQueryHistory()
      .then(() => window.axiom.queryHistory.result(resultId))
      .then((value) => {
        if (!live) return;
        setDocument(value);
        onDocument(value);
        if (!value)
          setError("The saved query for these results could not be found.");
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [resultId, onDocument]);
  const sameDataset =
    !!document &&
    document.run.session === history.view?.session &&
    document.run.datasetEpoch === s.datasetEpoch;
  const available = sameDataset && info?.retained;
  const summary = document?.run.summary;
  useEffect(() => {
    if (!document) return;
    let live = true;
    if (!sameDataset) {
      setInfo({ retained: false, columns: [], prefixes: {} });
      return;
    }
    void request<QueryGridInfo>("queryColumns", {
      id: document.run.summary.id,
      key: document.run.queryKey ?? document.queryId,
      epoch: document.run.datasetEpoch,
    })
      .then((value) => {
        if (!live) return;
        setInfo(value);
        if (value.retained)
          setShown((current) => {
            const kept = current.filter((index) =>
              value.columns.some((column) => column.index === index),
            );
            if (kept.length) return kept;
            const filled = value.columns
              .filter((column) => column.fill)
              .map((column) => column.index);
            return filled.length
              ? filled
              : document.run.summary.rowCount && value.columns.length
                ? [0]
                : [];
          });
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [document, sameDataset, history.view?.revision]);
  useEffect(() => {
    if (shown.length) rememberQueryResultLayout(resultId, { shown, sort });
  }, [resultId, shown, sort]);
  useEffect(() => {
    if (
      !summary ||
      toastShown.current ||
      panel("query.toastRun", "") !== resultId
    )
      return;
    toastShown.current = true;
    savePanel("query.toastRun", "", false);
    notify(queryCount(summary.rowCount, "row"), "Added to history.");
  }, [summary, resultId]);
  const columns = useMemo<ColDef<(Term | null)[]>[]>(
    () =>
      summary?.columns.map((name, index) => ({
        colId: String(index),
        headerName: name,
        flex: 1,
        minWidth: 40,
        hide: !shown.includes(index),
        // Keep equal fractions through browser layout instead of rounding each flex column.
        cellStyle: {
          "--query-col-index": shown.indexOf(index),
          "--query-col-count": Math.max(1, shown.length),
        },
        headerStyle: {
          "--query-col-index": shown.indexOf(index),
          "--query-col-count": Math.max(1, shown.length),
        },
        sortable: true,
        sortingOrder: ["asc", "desc"],
        initialSort: sort?.column === index ? sort.direction : undefined,
        headerComponent: QuerySortHeader,
        // Native button activation owns Enter and Space; AG Grid must not sort again.
        suppressHeaderKeyboardEvent: ({ event }) =>
          !!(event.target as HTMLElement)?.closest("button.query-sort") &&
          ["Enter", " "].includes(event.key),
        valueGetter: (params) => params.data?.[index],
        cellRenderer: ({ value }: { value?: Term | null }) => (
          <span
            className={!value ? "muted" : undefined}
            title={value ? queryCellText(value, info?.prefixes) : "blank"}
          >
            {value ? queryCellText(value, info?.prefixes) : "blank"}
          </span>
        ),
        onCellClicked: (event) => {
          if (event.value && !event.value.literal)
            void act("select", { iri: event.value.value });
        },
        onCellDoubleClicked: (event) => {
          if (event.value && !event.value.literal) {
            void act("seed", { iris: [event.value.value] }).then(() =>
              command("graph.fit"),
            );
            command("view.graph");
          }
        },
      })) ?? [],
    [summary, shown, info?.prefixes],
  );
  const source = useMemo<IDatasource | undefined>(
    () =>
      document
        ? {
            getRows(params) {
              const ordered = params.sortModel[0];
              void request<{
                rows: (Term | null)[][];
                total: number;
                retained: boolean;
              }>("queryPage", {
                id: document.run.summary.id,
                key: document.run.queryKey ?? document.queryId,
                epoch: document.run.datasetEpoch,
                start: params.startRow,
                end: params.endRow,
                sort: ordered
                  ? { column: Number(ordered.colId), direction: ordered.sort }
                  : undefined,
              })
                .then((result) => {
                  if (!result.retained) {
                    setInfo((old) => old && { ...old, retained: false });
                    params.failCallback();
                  } else params.successCallback(result.rows, result.total);
                })
                .catch((e) => {
                  setError(e.message);
                  params.failCallback();
                });
            },
          }
        : undefined,
    [document],
  );
  const activate = () => {
    if (document && available)
      void request("queryActivate", {
        key: document.run.queryKey ?? document.queryId,
        id: document.run.summary.id,
      }).catch((e) => setError(e.message));
  };
  const stale = available && summary?.storeVersion !== s.version;
  const stateText = history.runningId
    ? "Running"
    : error
      ? "Not run: " + error.split(/\r?\n/)[0]
      : summary
        ? queryCount(summary.rowCount, "row") + (stale ? ", out of date" : "")
        : "Loading results…";
  const theme = useMemo(
    () =>
      gridTheme(false).withParams({
        browserColorScheme: "inherit",
        backgroundColor: "var(--ground)",
        foregroundColor: "var(--text)",
        headerBackgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        accentColor: "var(--accent)",
        rowHoverColor: "var(--row-hover)",
        selectedRowBackgroundColor: "var(--row-selected)",
        fontFamily: "var(--font)",
        fontSize: 13,
        headerFontSize: 11,
        headerFontWeight: 600,
        cellHorizontalPadding: 8,
        rowHeight: 26,
        headerHeight: 26,
        wrapperBorder: false,
        headerColumnBorder: false,
      }),
    [],
  );
  if (loading || !document || !summary)
    return (
      <>
        <div className="bar" />
        <div className="body">
          <div className="empty" role={error ? "alert" : undefined}>
            {error || "Loading results…"}
          </div>
        </div>
      </>
    );
  return (
    <>
      <QueryActions
        state={stateText}
        stateText={
          error ||
          (stale
            ? "Data changed since this run. These results show the earlier data."
            : stateText)
        }
        stateKind={error ? "badink" : stale ? "warnink" : undefined}
        running={!!history.runningId}
        disabled={
          !history.view?.current.text.trim() ||
          !!(
            history.view.current.generation?.validation &&
            history.view.current.text ===
              history.view.current.generation.result.sparql
          )
        }
        run={() => command("query.run")}
        compose={() => command("query.generate")}
        create={() => command("query.new")}
        select={async (id) => {
          await selectQuery(id);
          command("view.query");
          command("query.focus");
        }}
        copy={
          available && summary.rowCount
            ? () => copyQueryResults(document.run, document.queryId)
            : undefined
        }
        columns={
          available && info
            ? {
                all: info.columns,
                shown,
                rows: summary.rowCount,
                toggle: (index) =>
                  setShown((old) =>
                    old.includes(index)
                      ? old.filter((i) => i !== index)
                      : info.columns
                          .filter(
                            (column) =>
                              old.includes(column.index) ||
                              column.index === index,
                          )
                          .map((column) => column.index),
                  ),
              }
            : undefined
        }
        items={[
          {
            id: "open-query",
            label: "Open query",
            run: () =>
              void openResultQuery(resultId).catch((e) => setError(e.message)),
          },
          {
            id: "graph",
            label: "Send results to graph",
            disabled: !available || !summary.rowCount,
            run: () =>
              void graphQueryResults(document).catch((e) =>
                setError(e.message),
              ),
          },
        ]}
      />
      <div
        className="body query-result-body"
        onFocusCapture={activate}
        onPointerDownCapture={activate}
      >
        <div className="ctx">
          <span className="q" title={document.run.text}>
            {document.run.text.replace(/\s+/g, " ").slice(0, 120)}
          </span>
          <span className="opt">
            ran <span className="num">{queryTime(document.completedAt)}</span>
          </span>
          <span className="opt">
            <span className="num">
              {summary.rowCount.toLocaleString("en-US")}
            </span>{" "}
            {summary.rowCount === 1 ? "row" : "rows"}
          </span>
          {summary.capped && (
            <span className="opt warnink">
              Showing the first 200,000 result rows.
            </span>
          )}
          <span className="opt">
            <span className="num">{shown.length}</span>
            {` of ${summary.columns.length} ${summary.columns.length === 1 ? "column" : "columns"}`}
          </span>
        </div>
        {available ? (
          summary.rowCount ? (
            <div className="query-results rows">
              <AgGridReact<(Term | null)[]>
                theme={theme}
                columnDefs={columns}
                rowModelType="infinite"
                datasource={source}
                cacheBlockSize={100}
                maxBlocksInCache={5}
                defaultColDef={{ resizable: false, suppressMovable: true }}
                rowSelection={{
                  mode: "singleRow",
                  checkboxes: false,
                  enableClickSelection: true,
                }}
                animateRows={false}
                ensureDomOrder
                onSortChanged={(event) => {
                  const sorted = event.api
                    .getColumnState()
                    .find((column) => column.sort);
                  setSort(
                    sorted
                      ? {
                          column: Number(sorted.colId),
                          direction: sorted.sort!,
                        }
                      : undefined,
                  );
                  firstSelection.current = true;
                }}
                onModelUpdated={(event) => {
                  const first = event.api.getDisplayedRowAtIndex(0);
                  if (firstSelection.current && first?.data) {
                    first.setSelected(true);
                    firstSelection.current = false;
                  }
                }}
              />
            </div>
          ) : (
            <div className="empty">
              <b>Zero rows.</b> The query parsed and ran; nothing in the store
              satisfies it. Loosen a triple pattern or drop the filter.
            </div>
          )
        ) : (
          <div className="empty">
            {!info ? (
              "Loading results…"
            ) : (
              <>
                <b>Result rows are no longer retained.</b> The executed query is
                saved. Open it and run it again to refresh results.
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
