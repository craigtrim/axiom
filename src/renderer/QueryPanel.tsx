import { keyHint } from "./keyboard";
import { useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, IDatasource } from "ag-grid-community";
import { gridTheme } from "./IndividualsPanel";
import {
  useSnapshot,
  request,
  act,
  onCommand,
  command,
  panel,
  savePanel,
  report,
  state,
  takeQuery,
} from "./client";
import { shorten, type Term } from "../domain/model";
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
const uri = monaco.Uri.parse("inmemory://axiom/query.rq");
let remembered: QuerySummary | null = null;
let rememberedError = "";
let rememberedEpoch = -1;
export function QueryPanel() {
  const s = useSnapshot()!,
    host = useRef<HTMLDivElement>(null),
    editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null),
    [summary, setSummary] = useState(remembered),
    [running, setRunning] = useState(false),
    [error, setError] = useState(rememberedError),
    [example, setExample] = useState(panel("query.example", 0)),
    [height, setHeight] = useState(panel("query.height", 210));
  const alive = useRef(true),
    busy = useRef(false);
  const run = async () => {
    if (busy.current) return;
    const text =
      editor.current?.getValue() ?? panel("query.text", examples[0].Text);
    const runEpoch = state?.datasetEpoch;
    busy.current = true;
    setRunning(true);
    setError("");
    try {
      const r = await request<QuerySummary>("query", { text });
      if (runEpoch !== state?.datasetEpoch) return;
      remembered = r;
      rememberedEpoch = state!.datasetEpoch;
      rememberedError = "";
      if (alive.current) setSummary(r);
      report(
        "Query completed: " + r.rowCount.toLocaleString("en-GB") + " rows.",
      );
    } catch (e) {
      if (runEpoch !== state?.datasetEpoch) return;
      rememberedError = (e as Error).message;
      if (alive.current) setError(rememberedError);
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    const element = host.current!,
      model =
        monaco.editor.getModel(uri) ??
        monaco.editor.createModel(
          panel("query.text", examples[0].Text),
          "sparql",
          uri,
        ),
      e = monaco.editor.create(element, {
        model,
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
    const savedText = panel("query.text", examples[0].Text);
    if (model.getValue() !== savedText) model.setValue(savedText);
    editor.current = e;
    const view = panel<monaco.editor.ICodeEditorViewState | null>(
      "query.view",
      null,
    );
    if (view) e.restoreViewState(view);
    const change = model.onDidChangeContent(() =>
      savePanel("query.text", model.getValue()),
    );
    const ro = new ResizeObserver(() => e.layout());
    ro.observe(element);
    const theme = new MutationObserver(() =>
      monaco.editor.setTheme(
        element.ownerDocument.documentElement.dataset.theme === "dark"
          ? "vs-dark"
          : "vs",
      ),
    );
    theme.observe(element.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const un = onCommand((id) => {
      if (id === "query.reset") {
        e.setValue(
          panel("query.text", "SELECT ?s ?p ?o WHERE { ?s ?p ?o . } LIMIT 100"),
        );
        setExample(panel("query.example", 0));
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
    if (takeQuery()) void run();
    return () => {
      alive.current = false;
      savePanel("query.view", e.saveViewState());
      savePanel("query.text", model.getValue());
      change.dispose();
      ro.disconnect();
      theme.disconnect();
      un();
      e.dispose();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    if (rememberedEpoch !== s.datasetEpoch) {
      rememberedEpoch = s.datasetEpoch;
      remembered = null;
      rememberedError = "";
      setSummary(null);
      setError("");
    }
  }, [s.datasetEpoch]);
  const columns = useMemo<ColDef<Term[]>[]>(
    () =>
      summary?.columns.map((c, i) => ({
        colId: String(i),
        headerName: c,
        minWidth: 180,
        flex: 1,
        valueGetter: (p) => p.data?.[i],
        cellRenderer: ({ value }: { value?: Term }) =>
          !value ? null : value.literal ? (
            <span>{value.value}</span>
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
      summary
        ? {
            getRows: (p) => {
              void request<{ rows: Term[][]; total: number }>("queryPage", {
                id: summary.id,
                start: p.startRow,
                end: p.endRow,
              })
                .then((r) => p.successCallback(r.rows, r.total))
                .catch(() => p.failCallback());
            },
          }
        : undefined,
    [summary],
  );
  return (
    <section
      className="panel query-panel"
      data-panel="query"
      aria-label="Query panel"
    >
      <div className="panel-toolbar">
        <select
          aria-label="Example query"
          disabled={!s.ontology.example}
          value={s.ontology.example ? example : -1}
          onChange={(e) => {
            const index = +e.target.value;
            setExample(index);
            savePanel("query.example", index);
            editor.current?.setValue(examples[index].Text);
          }}
        >
          {!s.ontology.example && (
            <option value={-1}>Custom ontology query</option>
          )}
          {examples.map((e, i) => (
            <option key={i} value={i}>
              {e.Title}
            </option>
          ))}
        </select>
        <button
          className="primary"
          onClick={() => void run()}
          disabled={running}
        >
          Run <kbd>{keyHint("query.run")}</kbd>
        </button>
        <button onClick={() => void act("cancelQuery")} disabled={!running}>
          Cancel
        </button>
        <button
          disabled={!summary?.rowCount || running}
          onClick={() => {
            void act("queryGraph").then(() => command("graph.fit"));
            command("view.graph");
          }}
        >
          Send results to graph
        </button>
      </div>
      <div
        ref={host}
        className="query-editor"
        style={{ height, flex: "0 1 " + height + "px" }}
      />
      <div
        role="separator"
        aria-label="Resize query editor"
        aria-orientation="horizontal"
        aria-valuenow={height}
        tabIndex={0}
        className="editor-splitter"
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const h = Math.max(
              100,
              Math.min(600, height + (e.key === "ArrowUp" ? -20 : 20)),
            );
            setHeight(h);
            savePanel("query.height", h);
          }
        }}
        onPointerDown={(e) => {
          const start = e.clientY,
            h = height,
            el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) =>
            setHeight(Math.max(100, Math.min(600, h + ev.clientY - start)));
          const up = (ev: PointerEvent) => {
            const next = Math.max(100, Math.min(600, h + ev.clientY - start));
            savePanel("query.height", next);
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
        }}
      />
      <div className="query-summary" role="status">
        {running
          ? "Running query..."
          : summary
            ? summary.rowCount.toLocaleString("en-GB") +
              " displayed / " +
              summary.total.toLocaleString("en-GB") +
              " matches · " +
              summary.milliseconds.toFixed(1) +
              " ms"
            : "Choose an example or write a SELECT query."}
        {summary?.capped && (
          <strong>
            {" "}
            Intermediate results reached the 200,000-row safety cap. Results may
            be incomplete.
          </strong>
        )}
        {summary && summary.storeVersion !== s.version && (
          <span className="stale">
            Data changed since this query. Run it again to refresh the results.
          </span>
        )}
      </div>
      {error && (
        <div className="query-error" role="alert">
          {error}
        </div>
      )}
      <div className="grid-host query-results">
        {summary && (
          <AgGridReact<Term[]>
            theme={gridTheme(document.documentElement.dataset.theme === "dark")}
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
        )}
      </div>
      <div className="panel-note">
        SELECT, DISTINCT, flat triple patterns, binary FILTER, one ORDER BY and
        LIMIT. Queries run over asserted data.
      </div>
    </section>
  );
}
