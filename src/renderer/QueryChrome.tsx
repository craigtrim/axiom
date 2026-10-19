import { useEffect, useRef, useState, type ReactNode } from "react";
// craigtrim/axiom#111: the compact history menu is another SPARQL preview.
import { Code } from "./Code";
import {
  SharedActionRow,
  SharedMenu,
  usePaneToast,
  type SharedMenuItem,
  type SharedCommand,
} from "./SharedPane";
import { registerPaneRecovery } from "./AdaptivePane";
import { useQueryHistory } from "./query-history";
import { act, report, useSnapshot } from "./client";
import {
  queryResultId,
  type QueryResultDocument,
} from "../shared/query-history";
import { queryColumnReason, type QueryGridColumn } from "../shared/query-grid";
import "./query-reference.css";

// craigtrim/axiom#88: Query and its independent results tabs use the same chrome.
for (const id of ["query", "queryResults"])
  registerPaneRecovery(id, {
    Body: ({ maximize }) => (
      <div className="query-recovery">
        <div className="id">{id === "query" ? "Query" : "Query results"}</div>
        <div className="why">
          {id === "query"
            ? "Too little room to edit. The query, its cursor and its results are retained."
            : "Your work is retained."}
        </div>
        <div>{maximize}</div>
      </div>
    ),
  });
export const queryCount = (n: number, noun: string) =>
  `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;
export const queryTime = (value: string) =>
  value ? new Date(value).toLocaleTimeString("en-US") : "";
function historyTime(value: string) {
  const date = new Date(value),
    today = new Date();
  return (
    (date.toDateString() === today.toDateString()
      ? ""
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        ", ") + queryTime(value)
  );
}
export function QueryFooter({
  document,
}: {
  document?: QueryResultDocument | null;
}) {
  const history = useQueryHistory(),
    snapshot = useSnapshot()!;
  const entry = history.view?.current;
  const [completed, setCompleted] = useState("");
  const lastId = entry?.lastRun ? queryResultId(entry.lastRun) : "";
  useEffect(() => {
    let live = true;
    setCompleted("");
    if (document === undefined && lastId)
      void window.axiom.queryHistory
        .result(lastId)
        .then((result) => {
          if (live) setCompleted(result?.completedAt ?? "");
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [lastId, document]);
  const number =
    (history.view?.entries.findIndex(
      (e) => e.id === (document?.queryId ?? entry?.id),
    ) ?? -1) + 1;
  const time = document?.completedAt ?? completed;
  return (
    <>
      <span>
        Document <span className="num">{number || "?"}</span>
      </span>
      <span>
        <span className="num">
          {snapshot.tripleCount.toLocaleString("en-US")}
        </span>
        {" triples"}
      </span>
      {time && <span>{`Ran ${queryTime(time)}`}</span>}
      <span>
        <span className="num">{history.view?.entries.length ?? 0}</span>
        {" in history"}
      </span>
    </>
  );
}
export function QueryActions(props: {
  state: ReactNode;
  stateText?: string;
  stateKind?: "badink" | "warnink";
  running: boolean;
  disabled: boolean;
  composing?: boolean;
  run(): void;
  compose(): void;
  create(): void;
  select(id: string): Promise<unknown>;
  items?: SharedMenuItem[];
  retry?: () => void;
  copy?: () => Promise<{ rows: number; columns: number }>;
  columns?: {
    all: QueryGridColumn[];
    shown: number[];
    rows: number;
    toggle(index: number): void;
  };
}) {
  const history = useQueryHistory(),
    notify = usePaneToast();
  const more = useRef<HTMLButtonElement>(null),
    historyButton = useRef<HTMLButtonElement>(null),
    columnsButton = useRef<HTMLButtonElement>(null);
  const historyAnchor = useRef<HTMLButtonElement>(null),
    columnsAnchor = useRef<HTMLButtonElement>(null);
  const [historyKey, setHistoryKey] = useState(0),
    [columnsKey, setColumnsKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false),
    [columnsOpen, setColumnsOpen] = useState(false);
  const showHistory = (anchor: HTMLButtonElement | null) => {
    historyAnchor.current = anchor;
    setHistoryKey((v) => v + 1);
  };
  const showColumns = (anchor: HTMLButtonElement | null) => {
    columnsAnchor.current = anchor;
    setColumnsKey((v) => v + 1);
  };
  const historyItems: SharedMenuItem[] = (history.view?.entries ?? [])
    .map((entry, index) => ({ entry, index }))
    .reverse()
    .slice(0, 12)
    .map(({ entry, index }) => ({
      id: entry.id,
      label: entry.preview || "New query",
      className: "hrow",
      content: (
        <>
          <span className="hq">
            {entry.preview ? (
              <Code language="sparql">
                {entry.preview.replace(/\s+/g, " ").slice(0, 70)}
              </Code>
            ) : (
              "New query"
            )}
          </span>
          <span className="hm">
            {`document ${index + 1}, ${historyTime(entry.createdAt)}${entry.rows === undefined ? "" : ", " + queryCount(entry.rows, "row")}`}
            {entry.parentId && (
              <>
                ,{" "}
                <span className="br">
                  branched from{" "}
                  {(history.view?.entries.findIndex(
                    (e) => e.id === entry.parentId,
                  ) ?? -1) + 1}
                </span>
              </>
            )}
          </span>
        </>
      ),
      run: () => {
        void props
          .select(entry.id)
          .then((selected) => {
            if (selected !== false) notify(`Document ${index + 1} loaded.`);
          })
          .catch((e) => report(e.message, true));
      },
    }));
  const commands: SharedCommand[] = [
    {
      id: "compose",
      priority: 1,
      content: (
        <button
          className="btn quiet"
          aria-expanded={props.composing}
          onClick={props.compose}
        >
          Compose query
        </button>
      ),
      overflow: [{ id: "compose", label: "Compose query", run: props.compose }],
    },
    {
      id: "new",
      priority: 2,
      content: (
        <button className="btn quiet" onClick={props.create}>
          New query
        </button>
      ),
      overflow: [{ id: "new", label: "New query", run: props.create }],
    },
    {
      id: "history",
      priority: 3,
      content: (
        <button
          ref={historyButton}
          className="btn quiet"
          aria-haspopup="menu"
          aria-expanded={historyOpen}
          onClick={() => showHistory(historyButton.current)}
        >
          History
        </button>
      ),
      overflow: [
        {
          id: "history",
          label: "History",
          run: () => showHistory(more.current),
        },
      ],
    },
    ...(props.columns
      ? [
          {
            id: "columns",
            priority: 4,
            content: (
              <button
                ref={columnsButton}
                className="btn quiet"
                aria-haspopup="menu"
                aria-expanded={columnsOpen}
                onClick={() => showColumns(columnsButton.current)}
              >
                Columns
              </button>
            ),
            overflow: [
              {
                id: "columns",
                label: "Columns",
                run: () => showColumns(more.current),
              },
            ],
          },
        ]
      : []),
  ];
  const columnItems: SharedMenuItem[] =
    props.columns?.all.map((column) => ({
      id: String(column.index),
      label: column.name,
      className: "crow",
      checkbox: true,
      checked: props.columns!.shown.includes(column.index),
      keepOpen: true,
      content: (
        <>
          <span className="box" aria-hidden="true" />
          <span>{column.name}</span>
          <span className="why">
            {queryColumnReason(column, props.columns!.rows)}
          </span>
        </>
      ),
      run: () => {
        if (
          props.columns!.shown.length === 1 &&
          props.columns!.shown[0] === column.index
        )
          notify(
            "At least one column stays shown.",
            "A grid with no columns reports nothing.",
          );
        else props.columns!.toggle(column.index);
      },
    })) ?? [];
  return (
    <>
      <SharedActionRow
        label="Query actions"
        moreRef={more}
        separateOverflow
        primary={
          <button
            className="btn primary"
            disabled={props.disabled || props.running}
            onClick={props.run}
          >
            {props.running ? "Running" : "Run"}
          </button>
        }
        state={
          typeof props.state === "string" &&
          /^[\d,]+ rows?/.test(props.state) ? (
            <>
              <span className="num">{props.state.split(" ")[0]}</span>
              {props.state.slice(props.state.indexOf(" "))}
            </>
          ) : (
            props.state
          )
        }
        stateText={props.stateText}
        stateKind={props.stateKind}
        afterState={
          props.running ? (
            <button
              className="btn quiet"
              onClick={() => void act("cancelQuery")}
            >
              Cancel
            </button>
          ) : undefined
        }
        commands={commands}
        leadingItems={
          props.retry
            ? [{ id: "retry", label: "Retry saving", run: props.retry }]
            : []
        }
        items={[
          {
            id: "run",
            label: "Run",
            shortcut: "Ctrl+Enter",
            disabled: props.disabled || props.running,
            run: props.run,
          },
          {
            id: "csv",
            label: "Copy results as CSV",
            disabled: !props.copy,
            run: () => {
              void props
                .copy?.()
                .then(({ rows, columns }) =>
                  notify(
                    "Copied as CSV.",
                    `${queryCount(rows, "row")} and ${queryCount(columns, "column")}.`,
                  ),
                )
                .catch((e) => report(e.message, true));
            },
          },
          ...(props.items?.length
            ? [{ id: "extras", separator: true as const }, ...props.items]
            : []),
        ]}
      />
      <SharedMenu
        renderTrigger={false}
        openKey={historyKey}
        onOpenChange={setHistoryOpen}
        trigger={historyAnchor}
        label="History"
        items={historyItems}
        menuClassName="query-popup hist"
        minWidth={320}
        maxHeight={260}
      />
      <SharedMenu
        renderTrigger={false}
        openKey={columnsKey}
        onOpenChange={setColumnsOpen}
        trigger={columnsAnchor}
        label="Columns"
        items={columnItems}
        menuClassName="query-popup cols"
        minWidth={230}
        maxHeight={280}
      />
    </>
  );
}
