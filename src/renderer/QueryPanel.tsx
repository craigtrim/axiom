import { registerEditorMenu } from "./editor-menu-keys";
// craigtrim/axiom#111: share SPARQL tokens and theme with query previews.
import "./sparql-language";
import { syntaxTheme } from "./syntax-theme";
import { paintEditorSyntax } from "./syntax-paint";
import { usePaneLayout } from "./AdaptivePane";
import { SharedPane, usePaneToast } from "./SharedPane";
import { QueryActions, QueryFooter, queryCount } from "./QueryChrome";
import { queryResultId, queryTitle } from "../shared/query-history";
import { showQueryResults, copyQueryResults } from "./query-results";
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
import { useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/contrib/format/browser/formatActions.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import {
  useSnapshot,
  request,
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
  // craigtrim/axiom#88: a single shared row and footer surround the retained editor.
  return (
    <section
      className="panel shared-layer query-panel"
      data-panel="query"
      aria-label="Query panel"
    >
      <SharedPane className="query-surface" footer={<QueryFooter />}>
        <QueryEditor />
      </SharedPane>
    </section>
  );
}
function QueryEditor() {
  const notify = usePaneToast();
  const s = useSnapshot()!,
    history = useQueryHistory(),
    view = history.view,
    entry = view?.current;
  const host = useRef<HTMLDivElement>(null),
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
  const compact = paneLayout.width < 860;
  const compactNow = useRef(compact);
  compactNow.current = compact;
  const [mode, setMode] = useState<"fields" | "describe">("fields");
  const [choosing, setChoosing] = useState(false),
    [navigating, setNavigating] = useState(false);
  const running = !!history.runningId,
    text = entry?.text ?? "";
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
    if (navigating) return false;
    setNavigating(true);
    persistEditor();
    focusNext.current = true;
    if (compactNow.current) showComposer(false);
    try {
      await selectQuery(id);
      host.current?.ownerDocument.defaultView?.requestAnimationFrame(() =>
        editor.current?.focus(),
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      if (alive.current) setNavigating(false);
    }
  };
  const create = async (
    value = "",
    title?: string,
    source: "manual" | "example" = "manual",
  ) => {
    if (navigating) return false;
    setNavigating(true);
    persistEditor();
    focusNext.current = true;
    if (compactNow.current) showComposer(false);
    try {
      await addQuery(value, title, source);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
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
      notify("SPARQL formatted.");
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
    if (proposal?.validation && text === proposal.result.sparql) {
      setError("");
      return;
    }
    busy.current = true;
    setError("");
    try {
      persistEditor();
      await flushQueryHistory();
      // Cancel targets the worker; expose it only after local saving finishes.
      beginQueryRun(id);
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
      savePanel("query.toastRun", queryResultId(record), false);
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
      ) {
        setError((e as Error).message);
        notify("The query was not run.", (e as Error).message);
      }
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
      theme: syntaxTheme(host.current.ownerDocument),
      fontFamily: "Cascadia Mono, Cascadia Code, Consolas, monospace",
      fontSize: 13,
      lineHeight: 20,
      padding: { top: 8, bottom: 8 },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: false,
      wordWrap: "off",
      glyphMargin: false,
      folding: false,
      renderLineHighlight: "none",
      lineDecorationsWidth: 20,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      guides: { indentation: false, highlightActiveIndentation: false },
      scrollbar: { useShadows: false },
      accessibilitySupport: "auto",
      ariaLabel: "SPARQL query",
      lineNumbersMinChars: 4,
      tabSize: 2,
    });
    editor.current = e;
    const removeSyntax = paintEditorSyntax(host.current);
    const removeEditorMenu = registerEditorMenu(e);
    const change = e.onDidChangeModelContent(() => {
      if (activeId.current)
        editQuery(activeId.current, e.getValue(), e.saveViewState());
    });
    const ro = new ResizeObserver(() => e.layout());
    ro.observe(host.current);
    const theme = new MutationObserver(() =>
      monaco.editor.setTheme(syntaxTheme(host.current!.ownerDocument)),
    );
    theme.observe(host.current.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const authoring = () => {
      const pending = panel<string>("query.pending", "");
      savePanel("query.pending", "", false);
      if (pending === "query.format") format();
      if (pending === "query.generate") {
        setMode("describe");
        showComposer(true);
      }
      if (pending === "query.new") void create();
    };
    const un = onCommand((id) => {
      if (id === "query.authoring") authoring();
      if (id === "query.focus") {
        if (compactNow.current) showComposer(false);
        e.focus();
      }
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
      removeEditorMenu();
      removeSyntax();
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

  const generation = entry?.generation;
  const validation = useMemo(
    () =>
      generation?.validation && text === generation.result.sparql
        ? generation.validation
        : null,
    [text, generation],
  );
  const queryChanged = useMemo(
    () =>
      !!selectedSummary && !sameQueryContent(entry?.lastRun?.text ?? "", text),
    [!!selectedSummary, entry?.lastRun?.text, text],
  );
  useEffect(() => {
    editor.current?.updateOptions({
      lineNumbers: paneLayout.shallow ? "off" : "on",
      lineNumbersMinChars: 4,
      lineDecorationsWidth: paneLayout.shallow ? 12 : 20,
    });
  }, [paneLayout.shallow, !!view]);
  const backToEditor = () => {
    if (compact) showComposer(false);
    host.current?.ownerDocument.defaultView?.requestAnimationFrame(() =>
      editor.current?.focus(),
    );
  };
  const activate = () => {
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
  };
  const count = selectedSummary?.rowCount ?? entry?.lastRun?.summary.rowCount;
  const stateText = running
    ? "Running"
    : history.error
      ? "Not saved"
      : validation
        ? "Generated query failed validation; edit it to run"
        : error
          ? "Not run: " + error.split(/\r?\n/)[0]
          : count !== undefined
            ? queryCount(count, "row") + (queryChanged ? ", out of date" : "")
            : "Not run yet";
  return view && entry ? (
    <>
      <QueryActions
        state={stateText}
        stateText={
          history.error ||
          error ||
          (queryChanged
            ? "The query changed. These results are from its previous run."
            : stateText)
        }
        stateKind={
          history.error || validation || error
            ? "badink"
            : queryChanged
              ? "warnink"
              : undefined
        }
        running={running}
        disabled={!text.trim() || !!validation}
        composing={!compact || composing}
        run={() => void run()}
        compose={() => {
          setMode("describe");
          showComposer(compact ? !composing : true);
        }}
        create={() => {
          void create().then((created) => {
            if (created)
              notify("New query.", "The previous document stays in history.");
          });
        }}
        select={navigate}
        retry={
          history.error
            ? () => void flushQueryHistory().catch(() => {})
            : undefined
        }
        copy={
          !!selectedSummary?.rowCount && entry.lastRun
            ? () => copyQueryResults(entry.lastRun!, entry.id)
            : undefined
        }
        items={[
          {
            id: "format",
            label: "Format SPARQL",
            shortcut: "Shift+Alt+F",
            disabled: !text.trim(),
            run: format,
          },
          {
            id: "search-history",
            label: "Find a query in history",
            run: () => setChoosing(true),
          },
          ...(s.ontology.example
            ? examples.map((example, i) => ({
                id: "example-" + i,
                label: example.Title,
                run: () => void create(example.Text, example.Title, "example"),
              }))
            : []),
        ]}
      />
      <div className="body query-body" onFocusCapture={activate}>
        <div
          className="split"
          data-compose={compact && composing ? "open" : "closed"}
          data-compact={compact}
        >
          <div className="ed">
            <div ref={host} className="query-editor" />
          </div>
          <QueryComposer
            text={text}
            queryId={entry.id}
            mode={mode}
            visible={!compact || composing}
            setMode={setMode}
            close={backToEditor}
            write={(value) => {
              insert(value);
              backToEditor();
            }}
            opened={() => {
              focusNext.current = true;
              backToEditor();
            }}
          />
        </div>
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
    <>
      <div className="bar" />
      <div className="body">
        <div className="empty">
          {history.error ? (
            <>
              <p role="alert">{history.error}</p>
              <button
                className="btn"
                onClick={() => void connectQueryHistory().catch(() => {})}
              >
                Retry
              </button>
            </>
          ) : (
            "Loading query history…"
          )}
        </div>
      </div>
    </>
  );
}
