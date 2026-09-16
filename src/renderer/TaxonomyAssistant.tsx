import { useEffect, useRef, useState } from "react";
import {
  AssistantActivity,
  assistantActivities,
  cancelAssistant,
  useAssistantActivity,
} from "./AssistantActivity";
import { Modal } from "./Dialogs";
import { request, report, useSnapshot, flushUiHistory } from "./client";
import {
  buildTaxonomyPrompt,
  type TaxonomyContext,
  type TaxonomyMode,
  type TaxonomyResponse,
} from "../shared/taxonomy-assistant";
import { identifier } from "../domain/rdf-model";

export function TaxonomyAssistant({
  iri,
  mode,
  doc,
  close,
  added,
}: {
  iri: string;
  mode: TaxonomyMode;
  doc: Document;
  close: () => void;
  added: () => void;
}) {
  const snapshot = useSnapshot()!;
  const activity = useAssistantActivity("taxonomy");
  const [context, setContext] = useState<TaxonomyContext>();
  const [response, setResponse] = useState<TaxonomyResponse>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(true),
    [applying, setApplying] = useState(false);
  const [error, setError] = useState(""),
    [cancelled, setCancelled] = useState(false);
  const generation = useRef(0),
    job = useRef("");
  const children = mode === "children";
  const name =
    context?.selected.label ??
    snapshot.entities.find((e) => e.iri === iri)?.name ??
    "class";
  const stale =
    !!context &&
    (context.datasetEpoch !== snapshot.datasetEpoch ||
      context.version !== snapshot.version);
  const available =
    response?.result.suggestions
      .map((_, i) => i)
      .filter((i) => !response.issues[i]) ?? [];

  async function generate() {
    if (assistantActivities.get("taxonomy")) {
      if (job.current) return;
      setBusy(false);
      setError(
        "Suggestions are already running. Wait for completion or cancel the task in Hierarchy.",
      );
      return;
    }
    const ticket = ++generation.current;
    setBusy(true);
    setCancelled(false);
    setError("");
    setResponse(undefined);
    setSelected(new Set());
    job.current = crypto.randomUUID();
    const id = job.current;
    try {
      const result = await assistantActivities.run(
        "taxonomy",
        "Codex · " +
          (children ? "Finding child classes" : "Finding instances") +
          " for " +
          name +
          "…",
        async (checkCancelled) => {
          const next = await request<TaxonomyContext>("taxonomyContext", {
            iri,
            mode,
          });
          checkCancelled();
          if (ticket !== generation.current)
            throw Error("Assistant cancelled.");
          setContext(next);
          return window.axiom.taxonomyAssistant.run({
            id,
            iri,
            mode,
            datasetEpoch: next.datasetEpoch,
            version: next.version,
          });
        },
        () => window.axiom.taxonomyAssistant.cancel(id),
      );
      if (ticket !== generation.current) return;
      setResponse(result);
    } catch (e) {
      if (ticket === generation.current) setError((e as Error).message);
    } finally {
      if (ticket === generation.current) {
        setBusy(false);
        job.current = "";
      }
    }
  }
  useEffect(() => {
    void generate();
    return () => {
      generation.current++;
      if (job.current) void cancelAssistant("taxonomy");
    };
  }, []);
  async function cancel() {
    setCancelled(true);
    await cancelAssistant("taxonomy");
  }
  async function apply() {
    if (!response || stale || applying) return;
    setApplying(true);
    setError("");
    try {
      await flushUiHistory();
      const created = await window.axiom.taxonomyAssistant.apply(response.id, [
        ...selected,
      ]);
      added();
      report(
        "Added " +
          created.length +
          (children ? " child classes." : " named instances.") +
          " Undo restores the previous ontology.",
      );
      close();
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
      ...(context?.descendants ?? []),
    ]
      .filter(Boolean)
      .map((t) => [t!.iri, t!.label]),
  );
  return (
    <Modal
      title={(children ? "Add children to " : "Find instances of ") + name}
      close={() => {
        if (!applying) close();
      }}
      document={doc}
    >
      <AssistantActivity kind="taxonomy" controls={false} />
      <div className="taxonomy-assistant" aria-busy={busy || applying}>
        <p className="muted">
          {children
            ? "Codex proposes immediate child classes for your review."
            : "Codex proposes real named individuals for your review."}{" "}
          Uses Codex on PATH with your CLI sign-in.
        </p>
        {context && (
          <details className="taxonomy-context">
            <summary>
              Context sent to Codex · {context.ancestors.length}{" "}
              {context.ancestors.length === 1 ? "ancestor" : "ancestors"} ·{" "}
              {context.directChildren.length}{" "}
              {context.directChildren.length === 1 ? "child" : "children"} ·{" "}
              {context.descendants.length}{" "}
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
            <h3>Existing children and descendants</h3>
            {context.descendants.length ? (
              <ul>
                {context.descendants.map((term) => (
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
                value={buildTaxonomyPrompt(context)}
                rows={12}
              />
              <button
                onClick={() =>
                  void window.axiom
                    .copy(buildTaxonomyPrompt(context))
                    .catch((e) => setError(e.message))
                }
              >
                Copy prompt
              </button>
            </details>
          </details>
        )}
        {!busy && cancelled && (
          <p role="status">Cancelled. No entities were added.</p>
        )}
        {error && !cancelled && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {stale && !busy && (
          <p role="alert">
            The ontology changed. Find suggestions again before adding them.
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
                    disabled={stale || applying || !available.length}
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
                          disabled={stale || applying || !!response.issues[i]}
                          checked={selected.has(i)}
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
                      {response.issues[i] && (
                        <p className="error">{response.issues[i]}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <footer>
          {busy ? (
            <button
              onClick={() => void cancel()}
              disabled={activity?.cancelling}
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={() => void generate()}
                disabled={applying || !!activity}
              >
                Find suggestions again
              </button>
              <button onClick={close} disabled={applying}>
                Close
              </button>
              {!!response?.result.suggestions.length && (
                <button
                  className="primary"
                  disabled={stale || applying || !selected.size}
                  onClick={() => void apply()}
                >
                  {applying
                    ? "Adding…"
                    : "Add selected " +
                      (children ? "children" : "instances") +
                      (selected.size ? " (" + selected.size + ")" : "")}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </Modal>
  );
}
