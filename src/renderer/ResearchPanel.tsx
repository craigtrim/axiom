import { useEffect, useState } from "react";
import {
  request,
  useSnapshot,
  panel,
  savePanel,
  report,
  onCommand,
  takeResearchCommand,
} from "./client";
import {
  researchTemplates,
  buildResearchPrompt,
  researchUrl,
  type AssistantInfo,
  type AssistantId,
  type ResearchContext,
  type ResearchResponse,
} from "../shared/research";
export function ResearchPanel() {
  const snapshot = useSnapshot(),
    [context, setContext] = useState<ResearchContext | null>(null),
    [assistants, setAssistants] = useState<AssistantInfo[]>([]),
    [provider, setProvider] = useState<AssistantId>(
      panel("research.provider", "codex"),
    ),
    [template, setTemplate] = useState("research"),
    [prompts, setPrompts] = useState<Record<string, string>>(
      panel("research.templates", {}),
    ),
    [web, setWeb] = useState(panel("research.web", true)),
    [running, setRunning] = useState(false),
    [pendingAction, setPendingAction] = useState(""),
    [commandVersion, setCommandVersion] = useState(0),
    [response, setResponse] = useState<ResearchResponse>(),
    [selected, setSelected] = useState<number[]>([]),
    [error, setError] = useState(""),
    [applied, setApplied] = useState(false);
  const instructions =
    prompts[template] ??
    researchTemplates.find((t) => t.id === template)!.instructions;
  const refresh = () =>
    window.axiom.research
      .assistants()
      .then((items) => {
        setAssistants(items);
        if (!items.find((a) => a.id === provider)?.available) {
          const found = items.find((a) => a.available);
          if (found) {
            setProvider(found.id);
            savePanel("research.provider", found.id, false);
          }
        }
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
    let live = true;
    const poll = () =>
      window.axiom.research
        .status()
        .then((s) => {
          if (!live) return;
          setRunning(s.running);
          if (s.response)
            setResponse((old) =>
              old?.completedAt === s.response!.completedAt ? old : s.response,
            );
          if (s.error) setError(s.error);
        })
        .catch((e) => live && setError(e.message));
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    const un = onCommand((id) => {
      if (id === "ui.restore:research.templates")
        setPrompts(panel("research.templates", {}));
    });
    return () => {
      live = false;
      clearInterval(timer);
      un();
    };
  }, []);
  useEffect(() => {
    let live = true;
    setContext(null);
    if (snapshot?.selected)
      void request<ResearchContext>("researchContext", {
        iri: snapshot.selected,
      })
        .then((c) => {
          if (live) setContext(c);
        })
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [snapshot?.selected, snapshot?.version, snapshot?.datasetEpoch]);
  useEffect(() => {
    setSelected([]);
    setApplied(false);
  }, [response?.completedAt]);
  const edit = (value: string) => {
    const next = { ...prompts, [template]: value };
    savePanel("research.templates", prompts, false);
    setPrompts(next);
    savePanel("research.templates", next);
  };
  const stale =
    !!response &&
    (response.context.datasetEpoch !== snapshot?.datasetEpoch ||
      response.context.version !== snapshot?.version);
  const run = async () => {
    if (!context || running) return;
    if (
      !assistants.find((a) => a.id === provider)?.available ||
      !instructions.trim()
    ) {
      setError(
        "Choose an available assistant and enter research instructions.",
      );
      return;
    }
    setRunning(true);
    setError("");
    setSelected([]);
    try {
      setResponse(
        await window.axiom.research.run({
          provider,
          iri: context.entity.iri,
          datasetEpoch: context.datasetEpoch,
          version: context.version,
          instructions,
          web,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };
  const open = (url: string) =>
    void window.axiom.research.open(url).catch((e) => setError(e.message));
  const search = context
    ? [
        context.entity.name,
        context.ontology.name,
        context.parents[0]?.name ?? context.types[0]?.name ?? "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  useEffect(
    () =>
      onCommand((id) => {
        if (id === "research.pending") setCommandVersion((v) => v + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!pendingAction) setPendingAction(takeResearchCommand() ?? "");
  }, [pendingAction, commandVersion]);
  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === "refresh") {
      setPendingAction("");
      void refresh();
      report("Refreshing research assistants.");
      return;
    }
    if (pendingAction === "cancel") {
      setPendingAction("");
      void window.axiom.research.cancel();
      report("Research cancellation requested.");
      return;
    }
    if (!context) return;
    if (pendingAction === "run" && !assistants.length) return;
    setPendingAction("");
    if (pendingAction === "run") void run();
    else if (pendingAction.startsWith("source."))
      open(researchUrl(pendingAction.slice(7) as "web", search));
  }, [pendingAction, context, assistants]);
  return (
    <section
      className="panel research-panel"
      data-panel="research"
      aria-label="Ontology research"
    >
      <h2>Research {context?.entity.name ?? "an entity"}</h2>
      <p>
        Select a class, property or individual. Its parents, children,
        relationships and sample instances accompany your prompt.
      </p>
      <div className="research-controls">
        <label>
          Assistant
          <select
            aria-label="Research assistant"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as AssistantId);
              savePanel("research.provider", e.target.value, false);
            }}
          >
            {assistants.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.available}>
                {a.name}
                {a.available ? "" : " (not found)"}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void refresh()}>Refresh assistants</button>
      </div>
      <p className="muted">
        {assistants.find((a) => a.id === provider)?.message}
      </p>
      <label>
        Prompt template
        <select
          aria-label="Research prompt template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          {researchTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Instructions
        <textarea
          aria-label="Research instructions"
          rows={7}
          maxLength={20000}
          value={instructions}
          onChange={(e) => edit(e.target.value)}
        />
      </label>
      <button
        onClick={() =>
          edit(researchTemplates.find((t) => t.id === template)!.instructions)
        }
      >
        Restore default prompt
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={web}
          onChange={(e) => {
            setWeb(e.target.checked);
            savePanel("research.web", e.target.checked, false);
          }}
        />
        Allow web research
      </label>
      {context && (
        <details>
          <summary>Preview prompt and ontology context</summary>
          <pre className="research-context">
            {buildResearchPrompt(context, instructions, web)}
          </pre>
          <p>
            Showing up to 24 children, 12 instances and 40 relationships from{" "}
            {context.counts.children} children, {context.counts.instances}{" "}
            instances and {context.counts.relationships} relationships.
          </p>
        </details>
      )}
      <p>
        Run sends the previewed context to the selected assistant using your
        existing CLI sign-in. Suggestions are applied only when you select and
        accept them.
      </p>
      <div className="research-controls">
        <button
          className="primary"
          disabled={
            !context ||
            running ||
            !assistants.find((a) => a.id === provider)?.available ||
            !instructions.trim()
          }
          onClick={() => void run()}
        >
          {running ? "Researching..." : "Run research"}
        </button>
        {running && (
          <button onClick={() => void window.axiom.research.cancel()}>
            Cancel research
          </button>
        )}
      </div>
      <div className="research-controls" aria-label="Research sources">
        {(["wikipedia", "dbpedia", "ontologies", "web"] as const).map(
          (source) => (
            <button
              key={source}
              disabled={!context}
              onClick={() => open(researchUrl(source, search))}
            >
              {
                {
                  wikipedia: "Wikipedia",
                  dbpedia: "DBpedia",
                  ontologies: "Other ontologies",
                  web: "Web search",
                }[source]
              }
            </button>
          ),
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {response && (
        <div className="research-result">
          <h3>Results for {response.context.entity.name}</h3>
          <p className="research-summary">{response.result.summary}</p>
          {!!response.result.sources.length && (
            <ul>
              {response.result.sources.map((s, i) => (
                <li key={i}>
                  <button className="link" onClick={() => open(s.url)}>
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!!response.result.suggestions.length && (
            <>
              <h3>Review suggestions</h3>
              {response.result.suggestions.map((s, i) => (
                <div className="research-suggestion" key={i}>
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={"Accept " + s.name}
                      checked={selected.includes(i)}
                      disabled={stale || applied}
                      onChange={(e) =>
                        setSelected((values) =>
                          e.target.checked
                            ? [...values, i]
                            : values.filter((n) => n !== i),
                        )
                      }
                    />
                    <strong>{s.name}</strong> <span>{s.kind}</span>
                  </label>
                  <p>{s.description}</p>
                  {s.sourceUrl && (
                    <button className="link" onClick={() => open(s.sourceUrl)}>
                      Source
                    </button>
                  )}
                </div>
              ))}
              {stale && !applied && (
                <p>
                  The ontology has changed since this research. Run it again
                  before applying suggestions.
                </p>
              )}
              <button
                disabled={stale || applied || !selected.length}
                onClick={async () => {
                  try {
                    await request("applySuggestions", {
                      iri: response.context.entity.iri,
                      datasetEpoch: response.context.datasetEpoch,
                      version: response.context.version,
                      suggestions: selected.map(
                        (i) => response.result.suggestions[i],
                      ),
                    });
                    setApplied(true);
                    report(
                      "Research suggestions applied. Use Undo to revert the batch.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {applied
                  ? "Suggestions applied"
                  : "Apply selected suggestions (" + selected.length + ")"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
