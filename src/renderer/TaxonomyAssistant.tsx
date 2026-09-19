import { ErrorNotice } from "./ErrorNotice";
import { useAssistantProvider } from "./assistant-provider";
import { useEffect, useRef, useState } from "react";
import {
  AssistantActivity,
  assistantActivities,
  useAssistantActivity,
} from "./AssistantActivity";
import {
  request,
  report,
  useSnapshot,
  flushUiHistory,
  command,
} from "./client";
import { openTaxonomy, useTaxonomyTarget } from "./taxonomy-view";
import {
  buildTaxonomyPrompt,
  sampleTaxonomyContext,
  type TaxonomyContext,
  type TaxonomyHistoryEntry,
  type TaxonomyHistorySummary,
} from "../shared/taxonomy-assistant";
import { identifier } from "../domain/rdf-model";

export function TaxonomyAssistant({
  paneId = "taxonomy",
}: {
  paneId?: string;
}) {
  const snapshot = useSnapshot()!;
  const target = useTaxonomyTarget(paneId);
  const [provider, setProvider] = useAssistantProvider();
  const providerName = provider === "claude" ? "Claude" : "Codex";
  const activity = useAssistantActivity("taxonomy");
  const [history, setHistory] = useState<TaxonomyHistorySummary[]>([]);
  const [runId, setRunId] = useState("");
  const [entry, setEntry] = useState<TaxonomyHistoryEntry>();
  const [preview, setPreview] = useState<TaxonomyContext>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const currentTarget = useRef(target);
  currentTarget.current = target;
  const context = entry?.context ?? preview;
  const response = entry?.response;
  const children = target?.mode !== "instances";
  const busy = entry?.state === "running";
  const name =
    context?.selected.label ??
    snapshot.entities.find((e) => e.iri === target?.iri)?.name ??
    "a class";
  const available =
    response?.result.suggestions
      .map((_, i) => i)
      .filter((i) => !response.issues[i] && !entry?.applied.includes(i)) ?? [];
  const relevantHistory = history.filter(
    (h) => h.namespace === snapshot.ontology.namespace,
  );
  const nodeHistory = relevantHistory.filter(
    (h) => h.iri === target?.iri && h.mode === target.mode,
  );
  const otherHistory = relevantHistory.filter(
    (h) => h.iri !== target?.iri || h.mode !== target.mode,
  );
  const targetExists =
    target?.namespace === snapshot.ontology.namespace &&
    snapshot.entities.some(
      (e) => e.iri === target.iri && ["Class", "Defined"].includes(e.kind),
    );

  // Opening a node always returns to its latest run, without launching an assistant.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setEntry(undefined);
    setPreview(undefined);
    setRunId("");
    setError("");
    setSelected(new Set());
    void window.axiom.taxonomyAssistant
      .history()
      .then((items) => {
        if (!live) return;
        setHistory(items);
        const latest = items.find(
          (h) =>
            h.namespace === snapshot.ontology.namespace &&
            h.iri === target?.iri &&
            h.mode === target.mode,
        );
        setRunId(
          items.some((h) => h.id === target?.runId)
            ? target!.runId!
            : (latest?.id ?? ""),
        );
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [target, snapshot.datasetEpoch]);

  // Runs belong to the service, so leaving or closing this view never cancels them.
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const items = await window.axiom.taxonomyAssistant.history();
        if (live) setHistory(items);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    void poll();
    const timer = activity ? setInterval(() => void poll(), 1000) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [activity?.startedAt]);
  const summary = history.find((h) => h.id === runId);
  useEffect(() => {
    let live = true;
    if (!runId) {
      setEntry(undefined);
      setStale(false);
      if (targetExists)
        void request<TaxonomyContext>("taxonomyContext", {
          iri: target!.iri,
          mode: target!.mode,
        })
          .then((c) => live && setPreview(sampleTaxonomyContext(c)))
          .catch((e) => live && setError(e.message));
    } else if (summary) {
      void window.axiom.taxonomyAssistant
        .read(runId)
        .then((review) => {
          if (!live) return;
          setEntry(review.entry);
          setStale(review.stale);
          setError(review.entry.error ?? "");
        })
        .catch((e) => live && setError(e.message));
    }
    return () => {
      live = false;
    };
  }, [
    runId,
    summary?.state,
    summary?.applied,
    snapshot.version,
    snapshot.datasetEpoch,
    targetExists,
    target,
    revision,
  ]);
  useEffect(() => {
    setSelected(new Set());
  }, [runId]);

  async function generate() {
    if (
      !target ||
      !targetExists ||
      assistantActivities.get("taxonomy") ||
      applying
    )
      return;
    const origin = target;
    const id = crypto.randomUUID();
    setRunId(id);
    setEntry(undefined);
    setSelected(new Set());
    setError("");
    try {
      await assistantActivities.run(
        "taxonomy",
        providerName +
          " · " +
          (children ? "Finding child classes" : "Finding instances") +
          " for " +
          name +
          "…",
        async (checkCancelled) => {
          const next = await request<TaxonomyContext>("taxonomyContext", {
            iri: origin.iri,
            mode: origin.mode as "children" | "instances",
          });
          checkCancelled();
          if (currentTarget.current === origin)
            setPreview(sampleTaxonomyContext(next));
          return window.axiom.taxonomyAssistant.run({
            id,
            provider,
            iri: origin.iri,
            mode: origin.mode as "children" | "instances",
            datasetEpoch: next.datasetEpoch,
            version: next.version,
          });
        },
        () => window.axiom.taxonomyAssistant.cancel(id),
      );
    } catch (e) {
      if (currentTarget.current === origin) setError((e as Error).message);
    } finally {
      const items = await window.axiom.taxonomyAssistant.history();
      setHistory(items);
      if (currentTarget.current === origin) setRevision((r) => r + 1);
    }
  }
  async function apply() {
    if (!response || stale || applying || activity) return;
    setApplying(true);
    setError("");
    try {
      await flushUiHistory();
      const created = await window.axiom.taxonomyAssistant.apply(response.id, [
        ...selected,
      ]);
      setSelected(new Set());
      setHistory(await window.axiom.taxonomyAssistant.history());
      setRevision((r) => r + 1);
      command("taxonomy.added:" + context!.selected.iri);
      report(
        "Added " +
          created.length +
          (children ? " child classes." : " named instances.") +
          " Undo restores the previous ontology.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }
  const labels = new Map(
    [
      context?.selected,
      ...(context?.ancestors ?? []),
      ...(context?.childTerms ?? []),
      ...(context?.descendants ?? []),
    ]
      .filter(Boolean)
      .map((t) => [t!.iri, t!.label]),
  );
  const historyLabel = (h: TaxonomyHistorySummary) =>
    new Date(h.startedAt).toLocaleString() +
    " · " +
    (h.provider === "claude" ? "Claude" : "Codex") +
    " · " +
    (h.state === "completed"
      ? h.count +
        " suggestions" +
        (h.applied ? ", " + h.applied + " added" : "")
      : h.state);
  return (
    <section
      className="panel taxonomy-panel"
      data-panel="taxonomy"
      aria-label="Taxonomy suggestions"
    >
      {entry?.state === "running" && <AssistantActivity kind="taxonomy" />}
      <header className="taxonomy-heading">
        <h2 title={target?.iri}>
          {children ? "Add children to " : "Find instances of "}
          {name}
        </h2>
        <div className="taxonomy-run-actions">
          <label>
            Assistant{" "}
            <select
              aria-label="Taxonomy assistant"
              value={provider}
              disabled={!!activity || applying}
              onChange={(e) =>
                setProvider(e.target.value as "claude" | "codex")
              }
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={loading || !!activity || applying || !targetExists}
            onClick={() => void generate()}
          >
            {nodeHistory.length
              ? "New run"
              : children
                ? "Find children"
                : "Find instances"}
          </button>
        </div>
        <label className="taxonomy-history">
          Run history
          <select
            aria-label="Run history"
            value={summary ? runId : ""}
            disabled={applying || loading}
            onChange={(e) => {
              const item = history.find((h) => h.id === e.target.value);
              if (!item) {
                setRunId("");
                setEntry(undefined);
                return;
              }
              if (item.iri !== target?.iri || item.mode !== target.mode) {
                openTaxonomy(item.iri, item.mode, item.id, paneId);
              } else {
                setRunId(item.id);
                setEntry(undefined);
                setError("");
              }
            }}
          >
            <option value="">{loading ? "Loading history…" : "New run"}</option>
            {!!nodeHistory.length && (
              <optgroup label={name}>
                {nodeHistory.map((h) => (
                  <option key={h.id} value={h.id}>
                    {historyLabel(h)}
                  </option>
                ))}
              </optgroup>
            )}
            {!!otherHistory.length && (
              <optgroup label="Other nodes">
                {otherHistory.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label} ·{" "}
                    {h.mode === "children" ? "Children" : "Instances"} ·{" "}
                    {historyLabel(h)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      </header>
      <div
        className="taxonomy-assistant taxonomy-content"
        aria-busy={loading || busy || applying}
      >
        {!targetExists && (
          <p>
            Right-click a class and choose Suggest &gt; Add Children to begin.
            Earlier runs remain available in Run history.
          </p>
        )}
        {!entry && !loading && targetExists && !activity && (
          <p className="muted">
            {providerName} proposes{" "}
            {children ? "immediate child classes" : "named instances"} for your
            review. Start a run when ready.
          </p>
        )}
        {entry && (
          <p className="muted">
            {new Date(entry.startedAt).toLocaleString()} ·{" "}
            {entry.provider === "claude" ? "Claude" : "Codex"} · {entry.state}
            {entry.applied.length
              ? " · " + entry.applied.length + " added"
              : ""}
          </p>
        )}
        {context && (
          <details className="taxonomy-context">
            <summary>
              {entry ? "Context sent to" : "Context preview for"}{" "}
              {entry?.provider === "codex"
                ? "Codex"
                : response?.provider === "claude"
                  ? "Claude"
                  : providerName}{" "}
              · {context.ancestors.length}{" "}
              {context.ancestors.length === 1 ? "ancestor" : "ancestors"} ·{" "}
              {context.directChildren.length}
              {context.sample &&
              context.sample.children > context.directChildren.length
                ? " of " + context.sample.children
                : ""}{" "}
              {context.directChildren.length === 1 ? "child" : "children"} ·{" "}
              {context.descendants.length}
              {context.sample &&
              context.sample.descendants > context.descendants.length
                ? " of " + context.sample.descendants
                : ""}{" "}
              {context.descendants.length === 1 ? "descendant" : "descendants"}
            </summary>
            <p>
              <strong>{context.selected.label}</strong>
              {context.selected.comment && ": " + context.selected.comment}
            </p>
            <h3>Ancestor links to the roots</h3>
            {context.ancestorLinks.length ? (
              <ul>
                {context.ancestorLinks.map((link, i) => (
                  <li key={i}>
                    {labels.get(link.child) ?? link.child} →{" "}
                    {labels.get(link.parent) ?? link.parent}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No asserted parent.</p>
            )}
            {context.sample &&
              (context.sample.children > context.directChildren.length ||
                context.sample.descendants > context.descendants.length) && (
                <p className="muted">
                  {entry
                    ? "Random sample, retained with this run."
                    : "A new random sample is selected for each run."}
                </p>
              )}
            <h3>Existing children and descendants</h3>
            {context.directChildren.length || context.descendants.length ? (
              <ul>
                {[
                  ...new Map(
                    [
                      ...(context.childTerms ?? []).map((term) => ({
                        ...term,
                        depth: 1,
                      })),
                      ...context.descendants,
                    ].map((term) => [term.iri, term]),
                  ).values(),
                ].map((term) => (
                  <li key={term.iri}>
                    {term.label} ·{" "}
                    {term.depth === 1 ? "direct child" : "depth " + term.depth}
                    {term.comment && <p className="muted">{term.comment}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No existing children.</p>
            )}
            {!children && (
              <p>
                {context.existingInstances.length} of{" "}
                {context.existingInstanceCount} existing individuals are
                included. All existing names are checked locally to prevent
                duplicates.
              </p>
            )}
            <details>
              <summary>Exact prompt</summary>
              <textarea
                aria-label="Taxonomy prompt"
                readOnly
                value={entry?.prompt ?? buildTaxonomyPrompt(context)}
                rows={12}
              />
              <button
                onClick={() =>
                  void window.axiom
                    .copy(entry?.prompt ?? buildTaxonomyPrompt(context))
                    .catch((e) => setError(e.message))
                }
              >
                Copy prompt
              </button>
            </details>
          </details>
        )}

        {error && (
          <ErrorNotice
            error={error}
            auditId={error === entry?.error ? entry?.auditId : undefined}
          />
        )}
        {stale && !busy && (
          <p role="alert">
            The ontology changed. This run is kept for reference. Start a new
            run before adding suggestions.
          </p>
        )}
        {response && (
          <>
            <p>{response.result.summary}</p>
            {!response.result.suggestions.length ? (
              <p role="status">
                <strong>
                  {children
                    ? "No new direct children suggested."
                    : "No new instances suggested."}
                </strong>{" "}
                No entities were added.
              </p>
            ) : (
              <>
                <p className="muted">
                  {children
                    ? "Each selected class will be added directly under " +
                      name +
                      "."
                    : "Each selected individual will have type " +
                      name +
                      ". These proposals use model knowledge and have not been verified against external sources."}
                </p>
                <label className="taxonomy-choice">
                  <input
                    type="checkbox"
                    aria-label="Select all available suggestions"
                    disabled={
                      stale || !!activity || applying || !available.length
                    }
                    checked={
                      !!available.length && selected.size === available.length
                    }
                    onChange={(event) =>
                      setSelected(
                        new Set(event.target.checked ? available : []),
                      )
                    }
                  />
                  Select all available suggestions
                </label>
                <ul className="taxonomy-suggestions">
                  {response.result.suggestions.map((suggestion, i) => (
                    <li key={i}>
                      <label className="taxonomy-choice">
                        <input
                          type="checkbox"
                          aria-label={"Add " + suggestion.label}
                          disabled={
                            stale ||
                            !!activity ||
                            applying ||
                            !!(
                              response.issues[i] ||
                              (entry?.applied.includes(i) ? "Added" : null)
                            )
                          }
                          checked={
                            selected.has(i) || !!entry?.applied.includes(i)
                          }
                          onChange={(event) =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(i);
                              else next.delete(i);
                              return next;
                            })
                          }
                        />
                        <strong>{suggestion.label}</strong>
                        <span className="muted">
                          {children ? "Class" : "Individual"}
                        </span>
                      </label>
                      <p>{suggestion.definition}</p>
                      <p className="muted">{suggestion.reason}</p>
                      <details>
                        <summary>Identifier and relationship</summary>
                        <code>
                          {context!.ontology.namespace +
                            identifier(suggestion.label)}
                        </code>
                        <p>
                          {children ? "rdfs:subClassOf" : "rdf:type"} {name}
                        </p>
                      </details>
                      {entry?.applied.includes(i) ? (
                        <p className="muted">Added</p>
                      ) : (
                        response.issues[i] && (
                          <p className="error">{response.issues[i]}</p>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      {!!response?.result.suggestions.length && (
        <footer className="panel-toolbar taxonomy-footer">
          <button
            className="primary"
            disabled={stale || applying || !!activity || !selected.size}
            onClick={() => void apply()}
          >
            {applying
              ? "Adding…"
              : "Add selected " +
                (children ? "children" : "instances") +
                (selected.size ? " (" + selected.size + ")" : "")}
          </button>
        </footer>
      )}
    </section>
  );
}
