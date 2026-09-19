import { ErrorNotice } from "./ErrorNotice";
import { useAssistantProvider } from "./assistant-provider";
import { useEffect, useState } from "react";
import { PaneToolbar, PaneDetails, usePaneLayout } from "./AdaptivePane";
import {
  assistantActivities,
  cancelAssistant,
  useAssistantActivity,
} from "./AssistantActivity";
import { Modal } from "./Dialogs";
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
    [provider, setProvider] = useAssistantProvider(),
    [template, setTemplate] = useState(() => {
      const saved = panel("research.template", "research");
      return researchTemplates.some((t) => t.id === saved) ? saved : "research";
    }),
    [prompts, setPrompts] = useState<Record<string, string>>(
      panel("research.templates", {}),
    ),
    [web, setWeb] = useState(panel("research.web", true)),
    [pendingAction, setPendingAction] = useState(""),
    [commandVersion, setCommandVersion] = useState(0),
    [response, setResponse] = useState<ResearchResponse>(),
    [selected, setSelected] = useState<number[]>([]),
    [error, setError] = useState(""),
    [applied, setApplied] = useState(false);
  const activity = useAssistantActivity("research");
  const running = !!activity;
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
          if (assistantActivities.get("research")) return;
          if (s.response)
            setResponse((old) =>
              old?.completedAt === s.response!.completedAt &&
              old?.responseId === s.response!.responseId
                ? old
                : s.response,
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
  }, [response?.completedAt, response?.responseId]);
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
    if (!context || assistantActivities.get("research")) return;
    if (!instructions.trim()) {
      setError("Enter research instructions.");
      return;
    }
    setError("");
    setSelected([]);
    try {
      setResponse(
        await assistantActivities.run(
          "research",
          (provider === "claude" ? "Claude" : "Codex") +
            " · Researching " +
            context.entity.name +
            "…",
          async (checkCancelled) => {
            checkCancelled();
            return window.axiom.research.run({
              provider,
              iri: context.entity.iri,
              datasetEpoch: context.datasetEpoch,
              version: context.version,
              instructions,
              web,
            });
          },
          () => window.axiom.research.cancel(),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
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
      void cancelAssistant("research");
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
  const { compact } = usePaneLayout();
  const [preview, setPreview] = useState<Document>();
  const assistant = assistants.find((a) => a.id === provider);
  const activeTemplate = researchTemplates.find((t) => t.id === template)!;
  const canRun = !!context && !!instructions.trim() && !running;
  const apply = async () => {
    if (!response || stale || applied || !selected.length) return;
    try {
      await request("applySuggestions", {
        iri: response.context.entity.iri,
        datasetEpoch: response.context.datasetEpoch,
        version: response.context.version,
        suggestions: selected.map((i) => response.result.suggestions[i]),
      });
      setApplied(true);
      report("Research suggestions applied. Use Undo to revert the batch.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section
      className="panel research-panel"
      data-panel="research"
      aria-label="Ontology research"
    >
      <div className="research-heading">
        <h2 title={context?.entity.iri}>
          Research {context?.entity.name ?? "an entity"}
        </h2>
        <PaneToolbar
          label="Research actions"
          collapseAt={1400}
          secondary={
            <>
              <button disabled={running} onClick={() => void refresh()}>
                Refresh assistants
              </button>
              <button
                disabled={!context}
                onClick={(event) =>
                  setPreview(event.currentTarget.ownerDocument)
                }
              >
                Preview prompt and ontology context
              </button>
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
            </>
          }
        >
          <button
            className="primary"
            disabled={!canRun}
            onClick={() => void run()}
          >
            Run research
          </button>
        </PaneToolbar>
      </div>
      <div className="pane-context research-status" role="status">
        <span>
          {assistant?.name ?? "No assistant"} · {activeTemplate.title} ·{" "}
          {web ? "Web allowed" : "Web off"}
          {instructions !== activeTemplate.instructions
            ? " · Custom prompt"
            : ""}
        </span>
        {!running && !context && <span>Select an entity to begin.</span>}
        {!running && context && !assistant?.available && (
          <span>
            Cached results can be reused. Choose an available assistant below
            for new research.
          </span>
        )}
        {!running && context && !instructions.trim() && (
          <span>Enter research instructions below.</span>
        )}
        {!running && response?.cache?.hit && (
          <span className="research-cache-status">
            Using cached research ·{" "}
            {response.provider === "claude" ? "Claude" : "Codex"} ·{" "}
            {new Date(response.completedAt).toLocaleString()}
          </span>
        )}
        {!running && response?.cache?.warning && (
          <span role="alert">{response.cache.warning}</span>
        )}
        {stale && !applied && (
          <span className="stale">
            The ontology changed. Run research again before applying
            suggestions.
          </span>
        )}
      </div>
      {error && <ErrorNotice error={error} />}
      <div className="research-workspace" data-has-results={!!response}>
        <div id="research-options" className="research-options">
          <PaneDetails title="About research" className="research-help">
            <p>
              Select a class, property or individual. Its parents, children,
              relationships and sample instances accompany your prompt.
            </p>
            <p>
              Run sends the previewed context to the selected assistant using
              your existing CLI sign-in. Suggestions are applied only when you
              select and accept them.
            </p>
          </PaneDetails>
          <div className="research-fields">
            <label>
              Assistant
              <select
                aria-label="Research assistant"
                disabled={running}
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value as AssistantId);
                  savePanel("research.provider", event.target.value, false);
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
            <label>
              Prompt template
              <select
                aria-label="Research prompt template"
                disabled={running}
                value={template}
                onChange={(event) => {
                  setTemplate(event.target.value);
                  savePanel("research.template", event.target.value, false);
                }}
              >
                {researchTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="research-instructions">
              Instructions
              <textarea
                aria-label="Research instructions"
                disabled={running}
                rows={7}
                maxLength={20000}
                value={instructions}
                onChange={(event) => edit(event.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={web}
                disabled={running}
                onChange={(event) => {
                  setWeb(event.target.checked);
                  savePanel("research.web", event.target.checked, false);
                }}
              />
              Allow web research
            </label>
          </div>
          <p className="muted research-assistant-status">
            {assistant?.message}
          </p>
          <button
            disabled={running}
            onClick={() => edit(activeTemplate.instructions)}
          >
            Restore default prompt
          </button>
          {context && (
            <details>
              <summary>Preview prompt and ontology context</summary>
              <pre className="research-context" tabIndex={0}>
                {buildResearchPrompt(context, instructions, web)}
              </pre>
              <p>
                Showing up to 24 children, 12 instances and 40 relationships
                from {context.counts.children} children,{" "}
                {context.counts.instances} instances and{" "}
                {context.counts.relationships} relationships.
              </p>
            </details>
          )}
        </div>
        <div
          className="research-results"
          aria-busy={running}
          hidden={!response}
        >
          {response && (
            <div className="research-result">
              <h3 className="research-result-title">
                Results for {response.context.entity.name}
              </h3>
              <div className="research-findings">
                {compact && (
                  <p className="research-summary-excerpt">
                    {response.result.summary.slice(0, 180)}
                    {response.result.summary.length > 180 ? "…" : ""}
                  </p>
                )}
                <PaneDetails
                  title="Findings"
                  className="research-findings-text"
                >
                  <p className="research-summary">{response.result.summary}</p>
                </PaneDetails>
                {!!response.result.sources.length && (
                  <PaneDetails
                    title={"Sources (" + response.result.sources.length + ")"}
                    className="research-sources"
                  >
                    <ul>
                      {response.result.sources.map((source, i) => (
                        <li key={i}>
                          <button
                            className="link"
                            onClick={() => open(source.url)}
                          >
                            {source.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </PaneDetails>
                )}
              </div>
              {!!response.result.suggestions.length && (
                <div className="research-review">
                  <h3>Review suggestions</h3>
                  {response.result.suggestions.map((suggestion, i) => (
                    <div
                      className="research-suggestion"
                      key={response.completedAt + ":" + i}
                    >
                      <label className="check">
                        <input
                          type="checkbox"
                          aria-label={"Accept " + suggestion.name}
                          checked={selected.includes(i)}
                          disabled={stale || applied}
                          onChange={(event) =>
                            setSelected((values) =>
                              event.target.checked
                                ? [...values, i]
                                : values.filter((n) => n !== i),
                            )
                          }
                        />
                        <strong>{suggestion.name}</strong>
                        <span>{suggestion.kind}</span>
                      </label>
                      <PaneDetails title="Description and source">
                        <p>{suggestion.description}</p>
                        {suggestion.sourceUrl && (
                          <button
                            className="link"
                            onClick={() => open(suggestion.sourceUrl)}
                          >
                            Source
                          </button>
                        )}
                      </PaneDetails>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {!!response?.result.suggestions.length && (
        <div className="pane-footer research-apply">
          <button
            disabled={stale || applied || !selected.length}
            onClick={() => void apply()}
          >
            {applied
              ? "Suggestions applied"
              : "Apply selected suggestions (" + selected.length + ")"}
          </button>
        </div>
      )}
      {preview && context && (
        <Modal
          title="Research prompt preview"
          document={preview}
          close={() => setPreview(undefined)}
        >
          <pre className="research-context" tabIndex={0}>
            {buildResearchPrompt(context, instructions, web)}
          </pre>
        </Modal>
      )}
    </section>
  );
}
