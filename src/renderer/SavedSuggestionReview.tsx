import type { Entity } from "../domain/model";
import { useEffect, useState } from "react";
import { request } from "./client";
import type { SemanticComparison } from "../shared/embeddings";
import type { SuggestionRun } from "../shared/suggestions";
import {
  SuggestionWorkbench,
  type SuggestionWorkbenchProps,
} from "./SuggestionWorkbench";
import {
  savedSuggestions,
  type SavedSuggestionItem,
} from "./saved-suggestion-model";

type Props = Omit<
  SuggestionWorkbenchProps<SavedSuggestionItem>,
  | "mode"
  | "items"
  | "summary"
  | "analysisContent"
  | "context"
  | "renderDetails"
  | "history"
  | "entry"
> & {
  mode: "parents" | "synonyms";
  entry?: SuggestionRun;
  history: SuggestionRun[];
  entities: Entity[];
  previewPrompt?: string;
  copyPrompt(prompt?: string): void;
};

export function SavedSuggestionReview(p: Props) {
  const entry = p.entry?.id === p.runId ? p.entry : undefined;
  const parents = p.mode === "parents";
  const legacy = parents && !!entry && !entry.provider;
  const prompt = entry ? entry.prompt : (p.previewPrompt ?? "");
  const promptView = prompt ? (
    <>
      <p>
        {entry
          ? `Prompt recorded for this ${entry.provider === "codex" ? "Codex" : "Claude"} run.`
          : "Prompt for a new run with the current ontology."}
      </p>
      <textarea
        aria-label={parents ? "Parent prompt" : "Synonym prompt"}
        readOnly
        value={prompt}
        rows={12}
      />
      <button onClick={() => p.copyPrompt(prompt)}>Copy prompt</button>
    </>
  ) : legacy ? (
    <p>
      This saved run used local name matching. It did not call an assistant and
      has no prompt. Start a new run to use Claude or Codex.
    </p>
  ) : undefined;
  const rows = savedSuggestions(entry, p.entities);
  const query =
    p.entities.find((entity) => entity.iri === p.targetIri)?.name ?? p.name;
  const semanticKey =
    parents || !rows.length
      ? ""
      : JSON.stringify([query, rows.map((row) => row.value)]);
  const [semantic, setSemantic] = useState<{
    key: string;
    scores?: number[];
    error?: string;
  }>();
  useEffect(() => {
    if (!semanticKey) return;
    let active = true;
    const [query, texts] = JSON.parse(semanticKey);
    void request<SemanticComparison>("semanticSimilarity", { query, texts })
      .then((result) => {
        if (active)
          setSemantic({ key: semanticKey, scores: result.similarities });
      })
      .catch((error) => {
        if (active) setSemantic({ key: semanticKey, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [semanticKey]);
  const comparison = semantic?.key === semanticKey ? semantic : undefined;
  const summary =
    entry?.state === "completed"
      ? parents
        ? legacy
          ? "This saved run used local name matching. Start a new run to ask Claude or Codex for parents."
          : "The assistant reviewed the ontology's class catalog and hierarchy. Choose the parents you want to add; each suggestion includes its explanation."
        : "Choose the synonyms you want to add. Levenshtein measures spelling edits; cosine distance measures meaning using local full-precision MPNet. Lower means closer. Neither score restricts selection."
      : "";
  return (
    <SuggestionWorkbench
      {...p}
      entry={entry}
      items={rows.map((row, index) => ({
        ...row,
        semanticDistance: comparison?.scores
          ? 1 - comparison.scores[index]
          : undefined,
      }))}
      progress={
        <>
          {p.progress}
          {semanticKey && comparison?.error && (
            <p className="ac-notice" role="alert">
              Meaning comparison unavailable. {comparison.error}
            </p>
          )}
        </>
      }
      history={p.history
        .filter((r) => r.mode === p.mode)
        .map((r) => {
          const items = savedSuggestions(r, p.entities);
          return {
            ...r,
            count: items.length,
            applied: items.filter((item) => item.status === "added").length,
          };
        })}
      summary={summary}
      prompt={promptView}
      context={
        entry && (
          <>
            <p>
              <strong>{entry.label}</strong>
              {entry.document.entity.comment &&
                ": " + entry.document.entity.comment}
            </p>
            {parents && legacy ? (
              <>
                <p>
                  Find existing classes using shorter names formed by omitting
                  words, in the same order. No assistant is used.
                </p>
                <dl className="ac-identifiers">
                  <div>
                    <dt>Selected class</dt>
                    <dd>
                      <code>{entry.iri}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Direct parents</dt>
                    <dd>
                      {entry.document.entity.parents
                        .map(
                          (iri) =>
                            p.entities.find((e) => e.iri === iri)?.name ?? iri,
                        )
                        .join(", ") || "No asserted parent."}
                    </dd>
                  </div>
                  <div>
                    <dt>Matched classes</dt>
                    <dd>
                      {entry.values.map((v) => v.label).join(", ") ||
                        "No matches."}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                {entry.parentContext && (
                  <p>
                    {entry.parentContext.classes.length} class names and their
                    parent links were sent with the selected class and its
                    description.
                  </p>
                )}
                {entry.synonymContext && (
                  <dl className="ac-context-counts">
                    {(
                      [
                        [
                          "Ancestors",
                          entry.synonymContext.ancestors,
                          entry.synonymContext.ancestors.length,
                        ],
                        [
                          "Children",
                          entry.synonymContext.children,
                          entry.synonymContext.totals.children,
                        ],
                        [
                          "Descendants",
                          entry.synonymContext.descendants,
                          entry.synonymContext.totals.descendants,
                        ],
                        [
                          "Siblings",
                          entry.synonymContext.siblings,
                          entry.synonymContext.totals.siblings,
                        ],
                        [
                          "Additional naming examples",
                          entry.synonymContext.additionalSeeAlso,
                          entry.synonymContext.totals.additionalSeeAlso,
                        ],
                      ] as const
                    ).map(([label, terms, total]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          <b>{total}</b>
                          <span>
                            {terms.length} sent ·{" "}
                            {terms.map((t) => t.label).join(", ") || "None."}
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <details>
                  <summary>Exact prompt</summary>
                  {promptView}
                </details>
              </>
            )}
          </>
        )
      }
      renderDetails={(item) => (
        <div>
          <h3>
            {parents ? "Identifier and relationship" : "Value and relationship"}
          </h3>
          <dl className="ac-identifiers">
            <div>
              <dt>{parents ? "Parent class" : "Text value"}</dt>
              <dd>{item.label}</dd>
            </div>
            {parents && (
              <div>
                <dt>Identifier</dt>
                <dd>
                  <code>{item.value}</code>
                </dd>
              </div>
            )}
            <div>
              <dt>{parents ? "Parent relation" : "Annotation"}</dt>
              <dd>
                {p.name} {parents ? "rdfs:subClassOf" : "rdfs:seeAlso"}{" "}
                {parents ? item.label : `"${item.value}"`}
                <br />
                <code>{p.targetIri}</code>
              </dd>
            </div>
          </dl>
        </div>
      )}
    />
  );
}
