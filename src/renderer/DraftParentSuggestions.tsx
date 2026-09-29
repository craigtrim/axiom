import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildParentPrompt,
  parentContext,
  type ParentDraft,
} from "../shared/parent-suggestions";
import type { SuggestionRun } from "../shared/suggestions";
import type { Snapshot } from "../shared/protocol";
import { useAssistantProvider } from "./assistant-provider";
import { ErrorNotice } from "./ErrorNotice";

export function DraftParentSuggestions({
  snapshot,
  draft,
  disabled,
  toggle,
}: {
  snapshot: Snapshot;
  draft: ParentDraft;
  disabled: boolean;
  toggle(iri: string): void;
}) {
  const [provider, setProvider] = useAssistantProvider();
  const [entry, setEntry] = useState<SuggestionRun>();
  const [history, setHistory] = useState<SuggestionRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const active = useRef<string | undefined>(undefined);
  const targetKey = JSON.stringify([
    draft.label,
    draft.comment,
    draft.datasetEpoch,
  ]);
  const parentsKey = JSON.stringify(draft.parents);
  const preview = useMemo(() => {
    if (!draft.label.trim()) return { prompt: "", error: "" };
    try {
      return {
        prompt: buildParentPrompt(parentContext(snapshot, draft)),
        error: "",
      };
    } catch (e) {
      return { prompt: "", error: (e as Error).message };
    }
  }, [targetKey, parentsKey, snapshot.version]);
  useEffect(() => {
    let live = true;
    setEntry(undefined);
    setHistory([]);
    setBusy(false);
    setError("");
    void window.axiom.suggestions
      .history()
      .then((runs) => {
        if (live)
          setHistory(
            runs.filter(
              (r) =>
                r.draft &&
                r.namespace === snapshot.ontology.namespace &&
                r.label === draft.label.trim(),
            ),
          );
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      const id = active.current;
      active.current = undefined;
      if (id) void window.axiom.suggestions.cancel(id).catch(() => {});
    };
  }, [targetKey]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      const id = active.current;
      void window.axiom.suggestions
        .history()
        .then((runs) => {
          if (id && active.current === id)
            setEntry(runs.find((r) => r.id === id));
        })
        .catch(() => {});
    }, 750);
    return () => clearInterval(timer);
  }, [busy]);
  const generate = async () => {
    if (active.current || disabled || !preview.prompt) return;
    const id = crypto.randomUUID();
    active.current = id;
    setBusy(true);
    setEntry(undefined);
    setError("");
    try {
      const result = await window.axiom.suggestions.run({
        id,
        iri: "",
        mode: "parents",
        provider,
        draft,
      });
      if (active.current === id) {
        setEntry(result);
        setHistory((runs) => [result, ...runs.filter((r) => r.id !== id)]);
      }
    } catch (e) {
      if (active.current === id) {
        setError((e as Error).message);
        const runs = await window.axiom.suggestions.history().catch(() => []);
        if (active.current === id) setEntry(runs.find((r) => r.id === id));
      }
    } finally {
      if (active.current === id) {
        active.current = undefined;
        setBusy(false);
      }
    }
  };
  const prompt = entry?.prompt || preview.prompt;
  const assistant =
    (entry?.provider ?? provider) === "codex" ? "Codex" : "Claude";
  const available = new Set(
    snapshot.entities
      .filter((e) => ["Class", "Defined"].includes(e.kind))
      .map((e) => e.iri),
  );
  return (
    <fieldset className="text-assistant-parents">
      <legend>Suggest parents with an assistant</legend>
      <div className="text-parent-assistant-actions">
        <label>
          Assistant{" "}
          <select
            aria-label="Parent suggestion assistant"
            value={provider}
            disabled={disabled || busy}
            onChange={(e) => setProvider(e.target.value as "claude" | "codex")}
          >
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || busy || !preview.prompt}
          onClick={() => void generate()}
        >
          Suggest parents
        </button>
        <button
          type="button"
          disabled={!prompt}
          aria-expanded={showPrompt}
          onClick={() => setShowPrompt(!showPrompt)}
        >
          Prompt
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              if (active.current)
                void window.axiom.suggestions
                  .cancel(active.current)
                  .catch((e) => setError(e.message));
            }}
          >
            Cancel suggestions
          </button>
        )}
        {!!history.length && (
          <label>
            Run{" "}
            <select
              aria-label="Parent suggestion history"
              disabled={busy || disabled}
              value={entry?.id ?? ""}
              onChange={(e) => {
                setEntry(history.find((r) => r.id === e.target.value));
                setError("");
              }}
            >
              <option value="">New run</option>
              {history.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.startedAt).toLocaleString()} ·{" "}
                  {r.provider === "codex" ? "Codex" : "Claude"} ·{" "}
                  {r.values.length} suggestions
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="muted">
        Uses your installed Claude or Codex and its existing sign-in. Select
        suggested parents below before adding the class.
      </p>
      {busy && <p role="status">Asking {assistant} for parents...</p>}
      {showPrompt && (
        <div className="text-parent-prompt">
          <p>
            {entry
              ? `Prompt recorded for this ${assistant} run.`
              : "Prompt for a new run with the current ontology."}
          </p>
          <textarea
            aria-label="Parent prompt"
            readOnly
            rows={12}
            value={prompt}
          />
          <button
            type="button"
            onClick={() =>
              void window.axiom.copy(prompt).catch((e) => setError(e.message))
            }
          >
            Copy prompt
          </button>
        </div>
      )}
      {(error || entry?.error || preview.error) && (
        <ErrorNotice
          error={error || entry?.error || preview.error}
          auditId={entry?.auditId}
        />
      )}
      {entry?.state === "completed" && !entry.values.length && (
        <p>No existing parent classes were suggested.</p>
      )}
      {entry?.state === "completed" && !!entry.values.length && (
        <ul className="text-parent-assistant-results">
          {entry.values.map((v) => (
            <li key={v.value}>
              <label>
                <input
                  type="checkbox"
                  aria-label={"Use parent " + v.label}
                  checked={draft.parents.includes(v.value)}
                  disabled={disabled || busy || !available.has(v.value)}
                  onChange={() => toggle(v.value)}
                />
                <strong title={v.value}>{v.label}</strong>
              </label>
              <p>{v.reason}</p>
              {!available.has(v.value) && (
                <p>This class is no longer in the ontology.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
