import { synonymDefinition } from "../shared/synonyms";
import { useEffect, useRef, useState } from "react";
import { TaxonomyAssistant } from "./TaxonomyAssistant";
import { openTaxonomy, useTaxonomyTarget } from "./taxonomy-view";
import { onCommand, useSnapshot, flushUiHistory, command } from "./client";
import { useAssistantProvider } from "./assistant-provider";
import { ErrorNotice } from "./ErrorNotice";
import { PredicateSelect, usePredicateOptions } from "./PredicateSelect";
import type {
  SuggestionDefinition,
  SuggestionRun,
} from "../shared/suggestions";
import { compactIri } from "../shared/terms";

export function SuggestionsPanel({ paneId }: { paneId: string }) {
  const s = useSnapshot()!,
    target = useTaxonomyTarget(paneId);
  const [definitions, setDefinitions] = useState<SuggestionDefinition[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SuggestionDefinition>();
  useEffect(() => {
    let live = true;
    const load = () =>
      void window.axiom.suggestions
        .definitions()
        .then((d) => live && setDefinitions(d))
        .catch((e) => live && setError(e.message));
    load();
    const off = onCommand((id) => {
      if (id === "suggestions.changed") load();
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  const modes = [
    { id: "children", name: "Add Children" },
    { id: "parents", name: "Add Parents" },
    { id: "synonyms", name: "Find Synonyms" },
    ...definitions.map((d) => ({ id: "custom:" + d.id, name: d.name })),
    { id: "instances", name: "Find Instances" },
    { id: "define", name: "Define New" },
  ];
  const mode = target?.mode ?? "children",
    index = modes.findIndex((m) => m.id === mode);
  const iri = target?.iri ?? s.selected ?? "";
  const switchMode = (value: string) => {
    setEditing(undefined);
    openTaxonomy(iri, value, undefined, paneId);
  };
  const definition =
    mode === "synonyms"
      ? synonymDefinition
      : definitions.find((d) => mode === "custom:" + d.id);
  return (
    <section
      className="panel suggestions-view"
      data-panel={paneId}
      aria-label="Suggestions"
    >
      <header className="suggestion-switcher">
        <div
          className="suggestion-pages"
          role="group"
          aria-label="Suggestion type"
        >
          <button
            aria-label="Previous suggestion type"
            disabled={index <= 0}
            onClick={() => switchMode(modes[index - 1].id)}
          >
            ‹
          </button>
          <label>
            <span className="muted">Suggest</span>
            <select
              aria-label="Suggestion type"
              value={mode}
              onChange={(e) => switchMode(e.target.value)}
            >
              {modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label="Next suggestion type"
            disabled={index < 0 || index === modes.length - 1}
            onClick={() => switchMode(modes[index + 1].id)}
          >
            ›
          </button>
          <span className="muted">
            {index + 1} / {modes.length}
          </span>
        </div>
        <button
          onClick={() =>
            openTaxonomy(
              iri,
              mode,
              undefined,
              "taxonomy:" + crypto.randomUUID(),
            )
          }
        >
          Open another view
        </button>
        {definition && mode.startsWith("custom:") && (
          <button onClick={() => setEditing(definition)}>
            Edit definition
          </button>
        )}
      </header>
      {error && <ErrorNotice error={error} />}
      <div className="suggestion-body">
        {mode === "define" || editing ? (
          <SuggestionDefinitionEditor
            key={editing?.id ?? "new"}
            initial={editing}
            namespace={s.ontology.namespace}
            saved={(d) => {
              setDefinitions((items) => [
                ...items.filter((v) => v.id !== d.id),
                d,
              ]);
              setEditing(undefined);
              switchMode("custom:" + d.id);
            }}
          />
        ) : mode === "children" || mode === "instances" ? (
          <TaxonomyAssistant paneId={paneId} />
        ) : (
          <SavedSuggestionView
            key={
              target?.namespace +
              ":" +
              iri +
              ":" +
              mode +
              ":" +
              target?.revision
            }
            paneId={paneId}
            definition={definition}
          />
        )}
      </div>
    </section>
  );
}
function SuggestionDefinitionEditor({
  initial,
  namespace,
  saved,
}: {
  initial?: SuggestionDefinition;
  namespace: string;
  saved: (d: SuggestionDefinition) => void;
}) {
  const [draft, setDraft] = useState<SuggestionDefinition>(
    initial ?? {
      id: crypto.randomUUID(),
      name: "",
      instructions: "",
      examples: "",
      predicate: "",
      valueType: "text",
    },
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const options = usePredicateOptions([]);
  const field = (key: keyof SuggestionDefinition, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form
      className="suggestion-definition"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          saved(await window.axiom.suggestions.saveDefinition(draft));
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{initial ? "Edit suggestion" : "Define a suggestion"}</h2>
      <p className="muted">
        Saved in Axiom and available in every workspace. Each run proposes
        values for review before changing the selected entity.
      </p>
      <label>
        Name
        <input
          required
          maxLength={100}
          value={draft.name}
          onChange={(e) => field("name", e.target.value)}
          placeholder="What should this suggestion be called?"
        />
      </label>
      <label>
        Instructions
        <textarea
          required
          rows={5}
          maxLength={20000}
          value={draft.instructions}
          onChange={(e) => field("instructions", e.target.value)}
          placeholder="Describe what to suggest, what makes a good result and what to avoid."
        />
      </label>
      <label>
        Examples (optional)
        <textarea
          rows={4}
          maxLength={20000}
          value={draft.examples}
          onChange={(e) => field("examples", e.target.value)}
          placeholder="Give example inputs and the results you would want."
        />
      </label>
      <div className="suggestion-definition-fields">
        <label>
          Save proposed values under
          <PredicateSelect
            value={draft.predicate}
            options={options}
            namespace={namespace}
            label="Suggestion predicate"
            change={(v) => field("predicate", v)}
          />
        </label>
        <label>
          Value type
          <select
            aria-label="Suggestion value type"
            value={draft.valueType}
            onChange={(e) => field("valueType", e.target.value)}
          >
            <option value="text">Text</option>
            <option value="resource">Resource IRI</option>
          </select>
        </label>
      </div>
      {error && <ErrorNotice error={error} />}
      <footer>
        <button
          className="primary"
          disabled={
            busy ||
            !draft.name.trim() ||
            !draft.instructions.trim() ||
            !draft.predicate
          }
        >
          {busy ? "Saving…" : "Save suggestion"}
        </button>
      </footer>
    </form>
  );
}
function SavedSuggestionView({
  paneId,
  definition,
}: {
  paneId: string;
  definition?: SuggestionDefinition;
}) {
  const s = useSnapshot()!,
    target = useTaxonomyTarget(paneId)!;
  const [provider, setProvider] = useAssistantProvider();
  const [history, setHistory] = useState<SuggestionRun[]>([]),
    [id, setId] = useState(target?.runId ?? "");
  const [selected, setSelected] = useState<number[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [active, setActive] =
      useState<Pick<SuggestionRun, "id" | "iri" | "mode" | "startedAt">>();
  const [now, setNow] = useState(Date.now());
  const live = useRef(true),
    generating = useRef(false),
    loaded = useRef(false);
  const parents = target?.mode === "parents",
    synonyms = target?.mode === "synonyms";
  const entity = s.entities.find((e) => e.iri === target?.iri),
    name = entity?.name ?? "the selected entity";
  const exists = !!entity && target.namespace === s.ontology.namespace;
  const refresh = async () => {
    const [runs, running] = await Promise.all([
      window.axiom.suggestions.history(),
      window.axiom.suggestions.status(),
    ]);
    if (!live.current) return;
    setHistory(runs);
    setActive(running);
    setNow(Date.now());
    if (!loaded.current) {
      loaded.current = true;
      setId(
        target?.runId ??
          runs.find(
            (r) =>
              r.iri === target?.iri &&
              r.mode === target.mode &&
              r.namespace === target.namespace,
          )?.id ??
          "",
      );
    }
    if (
      generating.current &&
      running?.iri === target.iri &&
      running.mode === target.mode
    )
      setId(running.id);
  };
  useEffect(() => {
    live.current = true;
    void refresh().catch((e) => live.current && setError(e.message));
    let prior = "";
    const off = onCommand((id) => {
      if (id === "suggestions.historyChanged")
        void refresh().catch((e) => live.current && setError(e.message));
    });
    const timer = setInterval(
      () =>
        void window.axiom.suggestions
          .status()
          .then((r) => {
            if (!live.current) return;
            setNow(Date.now());
            setActive(r);
            if ((r?.id ?? "") !== prior) {
              prior = r?.id ?? "";
              void refresh().catch((e) => live.current && setError(e.message));
            }
          })
          .catch((e) => live.current && setError(e.message)),
      1000,
    );
    return () => {
      live.current = false;
      off();
      clearInterval(timer);
    };
  }, []);
  const runs = history.filter((r) => r.namespace === s.ontology.namespace),
    entry = runs.find((r) => r.id === id);
  const relevant = runs.filter(
    (r) => r.iri === target?.iri && r.mode === target.mode,
  );
  const stale =
    !!entry &&
    (entry.namespace !== s.ontology.namespace || entry.iri !== target?.iri);
  const generate = async () => {
    if (busy || active || !exists) return;
    setBusy(true);
    generating.current = true;
    setError("");
    setSelected([]);
    try {
      const run = await window.axiom.suggestions.run({
        iri: target.iri,
        mode: target.mode,
        provider,
      });
      if (live.current) setId(run.id);
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      generating.current = false;
      if (live.current) {
        setBusy(false);
        await refresh();
        const runs = await window.axiom.suggestions.history();
        if (live.current)
          setId(
            runs.find(
              (r) =>
                r.iri === target.iri &&
                r.mode === target.mode &&
                r.namespace === target.namespace,
            )?.id ?? "",
          );
      }
    }
  };
  return (
    <section className="panel taxonomy-panel">
      {active?.iri === target?.iri && active.mode === target.mode && (
        <div className="assistant-activity">
          <span className="assistant-spinner" aria-hidden="true" />
          <span role="status">
            {parents
              ? "Finding existing parents"
              : "Running " + (definition?.name ?? "suggestions")}{" "}
            for {name}…
          </span>
          <span>{Math.floor((now - active.startedAt) / 1000)}s</span>
          <button
            onClick={() => void window.axiom.suggestions.cancel(active.id)}
          >
            Cancel suggestions
          </button>
        </div>
      )}
      <header className="taxonomy-heading">
        <h2>
          {parents
            ? "Add parents to "
            : (definition?.name ?? "Suggestion") + " for "}
          {name}
        </h2>
        <div className="taxonomy-run-actions">
          {!parents && (
            <label>
              Assistant{" "}
              <select
                aria-label="Suggestion assistant"
                value={provider}
                disabled={!!active}
                onChange={(e) =>
                  setProvider(e.target.value as "claude" | "codex")
                }
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
            </label>
          )}
          <button
            className="primary"
            disabled={busy || !!active || !exists || (!parents && !definition)}
            onClick={() => void generate()}
          >
            {relevant.length
              ? "New run"
              : parents
                ? "Find parents"
                : synonyms
                  ? "Find synonyms"
                  : "Find suggestions"}
          </button>
        </div>
        <label className="taxonomy-history">
          Run history
          <select
            aria-label="Run history"
            value={id}
            onChange={(e) => {
              const r = runs.find((r) => r.id === e.target.value);
              setSelected([]);
              if (r && (r.iri !== target.iri || r.mode !== target.mode))
                openTaxonomy(r.iri, r.mode, r.id, paneId);
              else setId(e.target.value);
            }}
          >
            <option value="">New run</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} · {r.definition?.name ?? "Add Parents"} ·{" "}
                {new Date(r.startedAt).toLocaleString()} · {r.state}
                {r.applied.length ? " · " + r.applied.length + " added" : ""}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="taxonomy-content">
        <p className="muted">
          {parents
            ? "Find existing classes using shorter names formed by omitting words, in the same order. No assistant is used."
            : synonyms
              ? "Review close wording variations before adding them as rdfs:seeAlso text. Related concepts and names belonging to other entities are excluded."
              : "Review proposed values before adding them to " +
                compactIri(definition?.predicate ?? "", s.ontology.namespace) +
                "."}
        </p>
        {!exists && <p>Choose an entity in this workspace to start a run.</p>}
        {(error || entry?.error) && (
          <ErrorNotice
            error={error || entry?.error || ""}
            auditId={entry?.auditId}
          />
        )}
        {entry && (
          <p className="muted">
            {new Date(entry.startedAt).toLocaleString()} · {entry.state}
          </p>
        )}
        {entry?.prompt && (
          <details>
            <summary>Instructions and context for this run</summary>
            <pre className="suggestion-prompt">{entry.prompt}</pre>
          </details>
        )}
        {!!entry?.excluded?.length && (
          <details>
            <summary>Excluded suggestions ({entry.excluded.length})</summary>
            <ul>
              {entry.excluded.map((v, i) => (
                <li key={i}>
                  <strong>{v.value}</strong>: {v.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        {entry?.state === "completed" && !entry.values.length && (
          <p>
            No additional{" "}
            {parents
              ? "parent classes matched this class name"
              : synonyms
                ? "close wording variations passed the checks"
                : "values were suggested"}
            .
          </p>
        )}
        {!!entry?.values.length && (
          <ul className="taxonomy-suggestions">
            {entry.values.map((v, i) => (
              <li key={i}>
                <label className="taxonomy-choice">
                  <input
                    type="checkbox"
                    aria-label={"Add " + v.label}
                    checked={selected.includes(i) || entry.applied.includes(i)}
                    disabled={busy || stale || entry.applied.includes(i)}
                    onChange={(e) =>
                      setSelected((values) =>
                        e.target.checked
                          ? [...values, i]
                          : values.filter((n) => n !== i),
                      )
                    }
                  />
                  <strong>{v.label}</strong>
                  {entry.applied.includes(i) && (
                    <span className="muted">Added</span>
                  )}
                </label>
                <p>{v.reason}</p>
                {parents && <code>{v.value}</code>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!!entry?.values.length && (
        <footer className="panel-toolbar taxonomy-footer">
          <button
            className="primary"
            disabled={busy || stale || !selected.length}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await flushUiHistory();
                await window.axiom.suggestions.apply(entry.id, selected);
                setSelected([]);
                await refresh();
                command("taxonomy.added:" + target.iri);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add selected{" "}
            {parents ? "parents" : synonyms ? "synonyms" : "values"}
            {selected.length ? " (" + selected.length + ")" : ""}
          </button>
        </footer>
      )}
    </section>
  );
}
