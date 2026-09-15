import { PaneToolbar, usePaneLayout } from "./AdaptivePane";
import { queryResultId, queryTitle } from "../shared/query-history";
import { showQueryResults } from "./query-results";
import { QueryHistoryDialog } from "./QueryHistoryDialog";
import {
  useQueryHistory,
  connectQueryHistory,
  historyState,
  editQuery,
  flushQueryHistory,
  selectQuery,
  addQuery,
  beginQueryRun,
  endQueryRun,
  rememberQueryRun,
} from "./query-history";
import { QueryComposer } from "./QueryComposer";
import { formatQuery, sameQueryContent } from "../domain/query-format";
import { keyHint } from "./keyboard";
import { useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/contrib/format/browser/formatActions.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import {
  useSnapshot,
  request,
  act,
  onCommand,
  panel,
  savePanel,
  report,
  state,
  takeQuery,
} from "./client";
import type { QuerySummary } from "../shared/protocol";
import examples from "../domain/data/examples.json";

window.MonacoEnvironment = {
  getWorker: () => new Worker(new URL("editor.worker.js", location.href)),
};
monaco.languages.register({ id: "sparql" });
monaco.languages.setMonarchTokensProvider("sparql", {
  ignoreCase: true,
  keywords: [
    "SELECT",
    "DISTINCT",
    "WHERE",
    "PREFIX",
    "FILTER",
    "ORDER",
    "BY",
    "ASC",
    "DESC",
    "LIMIT",
    "OFFSET",
    "BASE",
    "REDUCED",
    "OPTIONAL",
    "UNION",
    "MINUS",
    "EXISTS",
    "NOT",
    "IN",
    "VALUES",
    "BIND",
    "AS",
    "UNDEF",
    "GROUP",
    "HAVING",
    "ASK",
    "CONSTRUCT",
    "DESCRIBE",
    "GRAPH",
    "FROM",
    "NAMED",
    "SERVICE",
    "SILENT",
    "COUNT",
    "SUM",
    "AVG",
    "MIN",
    "MAX",
    "SAMPLE",
    "GROUP_CONCAT",
    "STR",
    "LANG",
    "DATATYPE",
    "STRSTARTS",
    "STRENDS",
    "CONTAINS",
    "REGEX",
    "REPLACE",
    "LCASE",
    "UCASE",
    "COALESCE",
    "IF",
    "BOUND",
    "true",
    "false",
    "a",
  ],
  tokenizer: {
    root: [
      [/#[^\n]*/, "comment"],
      [/<[^>]*>/, "string"],
      [/"(?:[^"\\]|\\.)*"/, "string"],
      [/\?[\w]+/, "variable"],
      [
        /[\w:]+/,
        { cases: { "@keywords": "keyword", "@default": "identifier" } },
      ],
      [/\d+(\.\d+)?/, "number"],
    ],
  },
});
monaco.languages.registerDocumentFormattingEditProvider("sparql", {
  provideDocumentFormattingEdits(model) {
    return [
      { range: model.getFullModelRange(), text: formatQuery(model.getValue()) },
    ];
  },
});
const modelUri = (id: string) =>
  monaco.Uri.parse("inmemory://axiom/query/" + id + ".rq");
const modelOrder: string[] = [];
const views = new Map<string, monaco.editor.ICodeEditorViewState>();
export function QueryPanel() {
  const s = useSnapshot()!,
    history = useQueryHistory(),
    view = history.view,
    entry = view?.current;
  const root = useRef<HTMLElement>(null),
    host = useRef<HTMLDivElement>(null),
    editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeId = useRef(""),
    alive = useRef(true),
    busy = useRef(false),
    focusNext = useRef(false),
    priorAgent = useRef("");
  const [summary, setSummary] = useState<QuerySummary | null>(null),
    [resultKey, setResultKey] = useState(""),
    [error, setError] = useState("");
  const [composing, setComposing] = useState(panel("query.composing", false));
  const paneLayout = usePaneLayout();
  const compact = paneLayout.width < 860 || paneLayout.shallow;
  const [choosing, setChoosing] = useState(false),
    [navigating, setNavigating] = useState(false);
  const running = !!history.runningId,
    text = entry?.text ?? "";
  const example = examples.findIndex(
    (e) => e.Text.replaceAll("\r\n", "\n") === text.replaceAll("\r\n", "\n"),
  );
  const showComposer = (open: boolean) => {
    setComposing(open);
    savePanel("query.composing", open, false);
  };
  const persistEditor = () => {
    const e = editor.current;
    if (!e || !activeId.current) return;
    const state = e.saveViewState();
    if (state) views.set(activeId.current, state);
    editQuery(activeId.current, e.getValue(), state);
  };
  const navigate = async (id: string) => {
    if (navigating) return;
    setNavigating(true);
    persistEditor();
    focusNext.current = true;
    if (compact) showComposer(false);
    try {
      await selectQuery(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (alive.current) setNavigating(false);
    }
  };
  const create = async (
    value = "",
    title?: string,
    source: "manual" | "example" = "manual",
  ) => {
    if (navigating) return;
    setNavigating(true);
    persistEditor();
    focusNext.current = true;
    if (compact) showComposer(false);
    try {
      await addQuery(value, title, source);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (alive.current) setNavigating(false);
    }
  };
  const insert = (value: string) => {
    const e = editor.current,
      m = e?.getModel();
    if (!e || !m || value === m.getValue()) return;
    e.pushUndoStop();
    e.executeEdits("query-authoring", [
      { range: m.getFullModelRange(), text: value },
    ]);
    e.pushUndoStop();
    e.focus();
  };
  const format = () => {
    try {
      insert(formatQuery(editor.current?.getValue() ?? ""));
      setError("");
      report("SPARQL formatted.");
    } catch (e) {
      setError("Could not format this query: " + (e as Error).message);
    }
  };
  const run = async () => {
    const selected = historyState().view;
    if (!selected || busy.current) return;
    const id = selected.activeId,
      text = editor.current?.getValue() ?? selected.current.text,
      epoch = state?.datasetEpoch,
      origin = state?.ontology.name ?? "",
      namespace = state?.ontology.namespace ?? "";
    if (!text.trim()) return;
    const proposal = selected.current.generation;
    if (
      proposal?.validation &&
      sameQueryContent(text, proposal.result.sparql)
    ) {
      setError("Review this generated query: " + proposal.validation);
      return;
    }
    busy.current = true;
    beginQueryRun(id);
    setError("");
    try {
      persistEditor();
      await flushQueryHistory();
      const r = await request<QuerySummary>("query", { text, queryKey: id });
      if (epoch !== state?.datasetEpoch) return;
      const record = {
        summary: r,
        text,
        datasetEpoch: epoch!,
        session: selected.session,
        origin,
        namespace,
        title:
          selected.current.source === "manual"
            ? queryTitle(text)
            : selected.current.title,
      };
      await rememberQueryRun(id, record);
      showQueryResults(queryResultId(record));
      if (alive.current && activeId.current === id) {
        setSummary(r);
        setResultKey(id);
      }
      report(
        "Query completed: " + r.rowCount.toLocaleString("en-GB") + " rows.",
      );
    } catch (e) {
      if (
        epoch === state?.datasetEpoch &&
        alive.current &&
        activeId.current === id
      )
        setError((e as Error).message);
    } finally {
      busy.current = false;
      endQueryRun();
    }
  };
  useEffect(() => {
    alive.current = true;
    void connectQueryHistory().catch(() => {});

    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!view || !host.current) return;
    const e = monaco.editor.create(host.current, {
      model: null,
      editContext: false,
      theme:
        document.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs",
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: false,
      wordWrap: "on",
      accessibilitySupport: "auto",
      ariaLabel: "SPARQL query editor",
      lineNumbersMinChars: 3,
      tabSize: 2,
    });
    editor.current = e;
    const change = e.onDidChangeModelContent(() => {
      if (activeId.current)
        editQuery(activeId.current, e.getValue(), e.saveViewState());
    });
    const ro = new ResizeObserver(() => e.layout());
    ro.observe(host.current);
    const theme = new MutationObserver(() =>
      monaco.editor.setTheme(
        host.current?.ownerDocument.documentElement.dataset.theme === "dark"
          ? "vs-dark"
          : "vs",
      ),
    );
    theme.observe(host.current.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const authoring = () => {
      const pending = panel<string>("query.pending", "");
      savePanel("query.pending", "", false);
      if (pending === "query.format") format();
      if (pending === "query.generate") showComposer(true);
    };
    const un = onCommand((id) => {
      if (id === "query.authoring") authoring();
      if (id === "query.execute") {
        takeQuery();
        void run();
      }
      if (id === "query.find") {
        e.focus();
        void e.getAction("actions.find")?.run();
      }
      if (id === "edit.undo" && e.hasTextFocus())
        e.trigger("menu", "undo", null);
      if (id === "edit.redo" && e.hasTextFocus())
        e.trigger("menu", "redo", null);
    });
    // Attach the first model before handling a queued Run or Format command.
    const first = historyState().view!.current;
    activeId.current = first.id;
    const m =
      monaco.editor.getModel(modelUri(first.id)) ??
      monaco.editor.createModel(first.text, "sparql", modelUri(first.id));
    e.setModel(m);
    const initialView =
      views.get(first.id) ??
      (first.viewState as monaco.editor.ICodeEditorViewState | undefined);
    if (initialView) e.restoreViewState(initialView);
    if (!modelOrder.includes(first.id)) modelOrder.push(first.id);
    authoring();
    if (takeQuery()) void run();
    return () => {
      persistEditor();
      void flushQueryHistory().catch(() => {});
      change.dispose();
      ro.disconnect();
      theme.disconnect();
      un();
      e.dispose();
      editor.current = null;
    };
  }, [!!view]);
  useEffect(() => {
    if (!entry || !editor.current) return;
    const e = editor.current;
    if (activeId.current !== entry.id) {
      const old = e.saveViewState();
      if (old && activeId.current) views.set(activeId.current, old);
      activeId.current = entry.id;
      const model =
        monaco.editor.getModel(modelUri(entry.id)) ??
        monaco.editor.createModel(entry.text, "sparql", modelUri(entry.id));
      e.setModel(model);
      const saved =
        views.get(entry.id) ??
        (entry.viewState as monaco.editor.ICodeEditorViewState | undefined);
      if (saved) e.restoreViewState(saved);
      setError("");
      setSummary(null);
      setResultKey("");
      const position = modelOrder.indexOf(entry.id);
      if (position >= 0) modelOrder.splice(position, 1);
      modelOrder.push(entry.id);
      while (modelOrder.length > 20) {
        const id = modelOrder.shift()!;
        monaco.editor.getModel(modelUri(id))?.dispose();
      }
      if (focusNext.current) {
        e.focus();
        focusNext.current = false;
      }
    }
    if (e.getValue() !== entry.text) e.setValue(entry.text);
    if (entry.generation && priorAgent.current !== entry.id) {
      priorAgent.current = entry.id;
      if (compact) showComposer(false);
    }
  }, [entry?.id, entry?.text]);
  useEffect(() => {
    if (!entry || !view) return;
    let live = true;
    const id = entry.id;
    const last = entry.lastRun;
    const available =
      last?.session === view.session && last.datasetEpoch === s.datasetEpoch;
    void request<QuerySummary | null>("queryActivate", {
      key: last?.queryKey ?? id,
      id: available ? last!.summary.id : undefined,
    })
      .then((result) => {
        if (live) {
          setSummary(result);
          setResultKey(id);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [entry?.id, entry?.lastRun?.summary.id, s.datasetEpoch, view?.session]);
  const selectedSummary = resultKey === entry?.id ? summary : null;
  const index = view?.entries.findIndex((e) => e.id === view.activeId) ?? 0;
  const generation = entry?.generation;
  const validation = useMemo(
    () =>
      generation?.validation && sameQueryContent(text, generation.result.sparql)
        ? generation.validation
        : null,
    [text, generation],
  );
  const queryChanged = useMemo(
    () =>
      !!selectedSummary && !sameQueryContent(entry?.lastRun?.text ?? "", text),
    [!!selectedSummary, entry?.lastRun?.text, text],
  );
  const contextChanged =
    generation &&
    (entry?.createdSession !== view?.session ||
      generation.context.datasetEpoch !== s.datasetEpoch ||
      generation.context.version !== s.version);
  return (
    <section
      ref={root}
      className={"panel query-panel" + (compact ? " is-compact" : "")}
      data-panel="query"
      aria-label="Query panel"
      onFocusCapture={() => {
        const selected = historyState().view;
        if (!selected) return;
        const last = selected.current.lastRun;
        const available =
          last?.session === selected.session &&
          last.datasetEpoch === state?.datasetEpoch;
        void request("queryActivate", {
          key: last?.queryKey ?? selected.activeId,
          id: available ? last!.summary.id : undefined,
        }).catch((e) => setError(e.message));
      }}
    >
      {view && entry ? (
        <>
          <nav
            className="query-history-bar"
            aria-label="Query history navigation"
          >
            <div className="query-history-controls">
              <button
                className="query-arrow"
                aria-label="Previous query"
                title="Previous query"
                disabled={index <= 0 || navigating}
                onClick={() => void navigate(view.entries[index - 1].id)}
              >
                ‹
              </button>
              <button
                className="query-position"
                aria-label="Browse query history"
                title="Find a query in history"
                onClick={() => setChoosing(true)}
              >
                {index + 1} / {view.entries.length}
              </button>
              <button
                className="query-arrow"
                aria-label="Next query"
                title="Next query"
                disabled={index >= view.entries.length - 1 || navigating}
                onClick={() => void navigate(view.entries[index + 1].id)}
              >
                ›
              </button>
            </div>
            <span className="query-entry-title" title={entry.title}>
              {entry.title}
            </span>
            <button
              className="query-new"
              aria-label="New query"
              title="Start a new query and keep this one"
              disabled={navigating}
              onClick={() => void create()}
            >
              <span aria-hidden="true">＋</span>
              <span className="query-new-label">New query</span>
            </button>
          </nav>
          {view.pendingId && (
            <div className="query-arrival" role="status">
              A generated query is ready.{" "}
              <button onClick={() => void navigate(view.pendingId!)}>
                Open generated query
              </button>
            </div>
          )}
          <PaneToolbar
            label="Query actions"
            className="query-actions"
            secondary={
              <>
                <button
                  onClick={format}
                  disabled={!text.trim()}
                  title={"Format SPARQL (" + keyHint("query.format") + ")"}
                >
                  Format
                </button>{" "}
                <select
                  aria-label="Example query"
                  disabled={!s.ontology.example}
                  value={s.ontology.example ? example : -1}
                  onChange={(e) => {
                    const index = +e.target.value;
                    if (index >= 0)
                      void create(
                        examples[index].Text,
                        examples[index].Title,
                        "example",
                      );
                  }}
                >
                  <option value={-1}>
                    {s.ontology.example ? "Examples…" : "Custom ontology query"}
                  </option>
                  {examples.map((e, i) => (
                    <option key={i} value={i}>
                      {e.Title}
                    </option>
                  ))}
                </select>
              </>
            }
          >
            <button
              className="primary"
              onClick={() => void run()}
              disabled={running || !text.trim() || !!validation}
            >
              Run <kbd>{keyHint("query.run")}</kbd>
            </button>
            {running && (
              <button onClick={() => void act("cancelQuery")}>Cancel</button>
            )}

            <button
              aria-expanded={composing}
              onClick={() => showComposer(!composing)}
            >
              Compose query
            </button>
          </PaneToolbar>
          {history.error && (
            <div className="query-error" role="alert">
              {history.error}{" "}
              <button onClick={() => void flushQueryHistory().catch(() => {})}>
                Retry saving
              </button>
            </div>
          )}
          <div
            className={"query-workspace" + (composing ? " is-composing" : "")}
          >
            {composing && (
              <QueryComposer
                text={text}
                queryId={entry.id}
                close={() => showComposer(false)}
              />
            )}
            <div className="query-main">
              <div className="query-document">
                <div className="query-document-heading">
                  <strong>SPARQL</strong>
                  <span>{history.saving ? "Saving…" : "Saved locally"}</span>
                </div>
                {generation && (
                  <details className="query-generation-details" key={entry.id}>
                    <summary>
                      Generated with{" "}
                      {generation.request.provider === "codex"
                        ? "Codex"
                        : "Claude"}{" "}
                      ·{" "}
                      {contextChanged
                        ? "Review ontology context"
                        : entry.lastRun
                          ? "Query details"
                          : "Not run"}
                    </summary>
                    <p>{generation.result.explanation}</p>
                    {generation.result.assumptions.length > 0 && (
                      <ul>
                        {generation.result.assumptions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    )}
                    {contextChanged && (
                      <p>
                        The ontology may have changed since this query was
                        generated. Review it before running.
                      </p>
                    )}
                  </details>
                )}
                {validation && (
                  <div className="query-error" role="alert">
                    Review this generated query: {validation} Edit it here or
                    generate again.
                  </div>
                )}
                <div ref={host} className="query-editor" />
              </div>
              <div className="query-run-status" role="status">
                {history.runningId === entry.id
                  ? "Running query…"
                  : entry.lastRun
                    ? "Results opened in a separate tab."
                    : generation
                      ? "Generated query ready. Review the SPARQL and choose Run."
                      : text.trim()
                        ? "Ready to run."
                        : "Write SPARQL or choose Compose query."}
                {entry.lastRun && (
                  <button
                    onClick={() =>
                      showQueryResults(queryResultId(entry.lastRun!))
                    }
                  >
                    Open results
                  </button>
                )}
                {queryChanged && (
                  <span className="stale">
                    The query changed. These results are from its previous run.
                  </span>
                )}
              </div>
              {error && (
                <div className="query-error" role="alert">
                  {error}
                </div>
              )}
            </div>
          </div>
          <div className="panel-note query-footnote">
            SPARQL 1.1 · Local asserted data
          </div>
          {choosing && (
            <QueryHistoryDialog
              history={view}
              close={() => setChoosing(false)}
              select={(id) => void navigate(id)}
            />
          )}
        </>
      ) : (
        <div className="query-loading">
          {history.error ? (
            <>
              <p role="alert">{history.error}</p>
              <button
                onClick={() => void connectQueryHistory().catch(() => {})}
              >
                Retry
              </button>
            </>
          ) : (
            "Loading query history…"
          )}
        </div>
      )}
    </section>
  );
}
