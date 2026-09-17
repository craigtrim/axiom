import { useAssistantProvider } from "./assistant-provider";
import { assistantActivities, useAssistantActivity } from "./AssistantActivity";
import { PaneDetails } from "./AdaptivePane";
import { useEffect, useRef, useState } from "react";
import { panel, savePanel, request, useSnapshot } from "./client";
import { flushQueryHistory } from "./query-history";
import {
  buildQueryPrompt,
  type QueryContext,
  type QueryAssistantStatus,
} from "../shared/query-assistant";
import type { AssistantId, AssistantInfo } from "../shared/research";
export function QueryComposer({
  text,
  queryId,
  close,
}: {
  text: string;
  queryId: string;
  close: () => void;
}) {
  const snapshot = useSnapshot()!;
  const [instructions, setInstructions] = useState(
    panel("query.instructions", ""),
  );
  const [provider, setProvider] = useAssistantProvider();
  const [includeQuery, setIncludeQuery] = useState(
    panel("query.includeCurrent", false),
  );
  const [assistants, setAssistants] = useState<AssistantInfo[]>([]);
  const [context, setContext] = useState<QueryContext>();
  const [status, setStatus] = useState<QueryAssistantStatus>({
    running: false,
  });
  const [error, setError] = useState("");
  const activity = useAssistantActivity("query");
  const live = useRef(true);
  const refresh = () =>
    window.axiom.queryAssistant
      .assistants()
      .then((items) => {
        if (!live.current) return;
        setAssistants(items);
        if (!items.find((a) => a.id === provider)?.available) {
          const found = items.find((a) => a.available);
          if (found) {
            setProvider(found.id);
            savePanel("query.provider", found.id, false);
          }
        }
      })
      .catch((e) => live.current && setError(e.message));
  useEffect(() => {
    live.current = true;
    void refresh();
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const s = await window.axiom.queryAssistant.status();
        if (live.current && !assistantActivities.get("query")) setStatus(s);
      } catch (e) {
        if (live.current) setError((e as Error).message);
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setContext(undefined);
    const timer = setTimeout(
      () =>
        void request<QueryContext>("queryContext", { instructions })
          .then((c) => active && setContext(c))
          .catch((e) => active && setError(e.message)),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [instructions, snapshot.version, snapshot.datasetEpoch]);
  const running = !!activity,
    available = assistants.find((a) => a.id === provider);
  const input = context && {
    provider,
    instructions,
    currentQuery: includeQuery ? text : "",
    queryId,
    datasetEpoch: context.datasetEpoch,
    version: context.version,
  };
  const generate = async () => {
    if (!input || assistantActivities.get("query")) return;
    setError("");
    setStatus({ running: true, startedAt: Date.now() });
    try {
      const response = await assistantActivities.run(
        "query",
        (provider === "claude" ? "Claude" : "Codex") + " · Generating query…",
        async (checkCancelled) => {
          await flushQueryHistory();
          checkCancelled();
          return window.axiom.queryAssistant.run(input);
        },
        () => window.axiom.queryAssistant.cancel(),
      );
      if (live.current) setStatus({ running: false, response });
    } catch (e) {
      if (live.current) {
        setError((e as Error).message);
        setStatus({ running: false });
      }
    }
  };
  return (
    <section className="query-composer" aria-label="Compose a SPARQL query">
      <div className="query-composer-heading">
        <strong>Describe your query</strong>
        <button onClick={close} aria-label="Close query composer">
          Close
        </button>
      </div>
      <div className="query-composer-actions">
        <button
          className="primary"
          disabled={
            running || !context || !instructions.trim() || !available?.available
          }
          onClick={() => void generate()}
        >
          {status.response ? "Generate again" : "Generate query"}
        </button>
      </div>
      <div className="query-composer-body">
        <textarea
          autoFocus
          aria-label="Describe your query"
          rows={4}
          maxLength={12000}
          disabled={running}
          placeholder="For example: Find classes whose names start with American."
          value={instructions}
          onChange={(e) => {
            setInstructions(e.target.value);
            savePanel("query.instructions", e.target.value, false);
          }}
        />
        <div className="query-composer-actions">
          <label>
            Agent{" "}
            <select
              aria-label="Query agent"
              value={provider}
              disabled={running}
              onChange={(e) => {
                setProvider(e.target.value as AssistantId);
                savePanel("query.provider", e.target.value, false);
              }}
            >
              {(["claude", "codex"] as const).map((id) => (
                <option key={id} value={id}>
                  {id === "codex" ? "Codex" : "Claude"}
                  {assistants.find((a) => a.id === id)?.available
                    ? ""
                    : " (not found)"}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => void refresh()}
            disabled={running}
            title="Refresh installed agents"
          >
            Refresh agents
          </button>
        </div>
        <label className="check-label query-refine">
          <input
            type="checkbox"
            checked={includeQuery}
            disabled={running}
            onChange={(e) => {
              setIncludeQuery(e.target.checked);
              savePanel("query.includeCurrent", e.target.checked, false);
            }}
          />
          Refine the current query
        </label>
        <PaneDetails title="About generation">
          <p className="muted">
            Generated SPARQL opens as a new query. Your current query is kept.
          </p>
        </PaneDetails>
        {(error || status.error) && (
          <p role="alert" className="query-error">
            {error || status.error}
          </p>
        )}
        {status.response?.result.status === "unsupported" && (
          <p role="status">{status.response.result.explanation}</p>
        )}
        <details className="query-context-details">
          <summary>
            Context sent to the agent
            {context ? " · " + context.terms.length + " terms" : ""}
          </summary>
          <p className="muted">
            {available?.available
              ? "Uses your CLI sign-in. Your description and ontology context are sent through the selected agent."
              : "Install Codex or Claude, sign in from a terminal, then refresh agents."}
          </p>
          <p>
            Ontology names, labels, identifiers and schema. Other literal values
            and query results are excluded.{" "}
            {context?.omitted
              ? context.omitted +
                " entities omitted; use specific names to focus the context."
              : ""}
          </p>
          {available?.path && <p className="muted">CLI: {available.path}</p>}
          <pre className="query-context">
            {input
              ? buildQueryPrompt(context!, input)
              : "Loading ontology context..."}
          </pre>
        </details>
      </div>
    </section>
  );
}
