import type { Entity } from "../domain/model";
import { displayName, identifier, identifierParts } from "../domain/rdf-model";
import {
  buildTaxonomyPrompt,
  taxonomyNameKey,
  type TaxonomyContext,
  type TaxonomyHistoryEntry,
  type TaxonomyHistorySummary,
} from "../shared/taxonomy-assistant";
import { AssistantActivity } from "./AssistantActivity";
import {
  SuggestionWorkbench,
  type SuggestionNavigation,
} from "./SuggestionWorkbench";
import {
  childSuggestions,
  normalizedSuggestionName,
} from "./add-children-model";

export type ChildSuggestionNavigation = SuggestionNavigation;
type Props = {
  navigation?: ChildSuggestionNavigation;
  name: string;
  targetIri: string;
  context?: TaxonomyContext;
  entry?: TaxonomyHistoryEntry;
  history: TaxonomyHistorySummary[];
  runId: string;
  provider: "claude" | "codex";
  setProvider(value: "claude" | "codex"): void;
  loading: boolean;
  applying: boolean;
  activity: boolean;
  waiting: boolean;
  targetExists: boolean;
  blocked: string;
  drift: string;
  error: string;
  entities: Entity[];
  generate(bypassCache?: boolean): Promise<void>;
  apply(indices: number[]): Promise<number | undefined>;
  selectRun(id: string): void;
  selectTarget(iri: string, id?: string): void;
  copyPrompt(): void;
};
export function AddChildrenSuggestions(p: Props) {
  const entry = p.entry?.id === p.runId ? p.entry : undefined;
  return (
    <SuggestionWorkbench
      {...p}
      mode="children"
      entry={entry && { ...entry, cache: entry.response?.cache }}
      items={childSuggestions(entry)}
      summary={entry?.response?.result.summary ?? ""}
      progress={
        entry?.state === "running" && <AssistantActivity kind="taxonomy" />
      }
      context={
        p.context && (
          <ContextContents
            context={p.context}
            entry={entry}
            copy={p.copyPrompt}
          />
        )
      }
      renderDetails={(item) => {
        const proposedIri =
          (p.context?.ontology.namespace ?? "") + identifier(item.label);
        const existing =
          item.status === "exists"
            ? p.entities.find(
                (e) =>
                  e.iri === proposedIri ||
                  taxonomyNameKey(displayName(e)) ===
                    taxonomyNameKey(item.label) ||
                  taxonomyNameKey(identifierParts(e.iri).name) ===
                    taxonomyNameKey(item.label),
              )
            : undefined;
        return (
          <div>
            <h3>Identifier and relationship</h3>
            <dl className="ac-identifiers">
              <div>
                <dt>Label</dt>
                <dd>{item.label}</dd>
              </div>
              <div>
                <dt>Normalized name</dt>
                <dd>
                  <code>
                    {normalizedSuggestionName(item.label) || item.label}
                  </code>
                </dd>
              </div>
              <div>
                <dt>Identifier</dt>
                <dd>
                  <code>{proposedIri}</code>
                </dd>
              </div>
              <div>
                <dt>Parent relation</dt>
                <dd>
                  rdfs:subClassOf {p.name}
                  <br />
                  <code>{item.parentIri}</code>
                </dd>
              </div>
              {item.status === "exists" && (
                <div>
                  <dt>Existing entity</dt>
                  <dd>
                    {existing ? (
                      <>
                        {displayName(existing)}
                        <br />
                        <code>{existing.iri}</code>
                      </>
                    ) : (
                      "An existing ontology entity matches this label or normalized name."
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        );
      }}
    />
  );
}

function ContextContents({
  context,
  entry,
  copy,
}: {
  context: TaxonomyContext;
  entry?: TaxonomyHistoryEntry;
  copy(): void;
}) {
  const terms = [
    ...context.ancestors,
    ...(context.childTerms ?? []),
    ...context.descendants,
    context.selected,
  ];
  const labels = new Map(terms.map((term) => [term.iri, term.label]));
  const children = context.childTerms ?? [];
  return (
    <>
      <p>
        <strong>{context.selected.label}</strong>
        {context.selected.comment && ": " + context.selected.comment}
      </p>
      <dl className="ac-context-counts">
        <div>
          <dt>Ancestors</dt>
          <dd>
            <b>{context.ancestors.length}</b>
            <span>
              {context.ancestors.map((t) => t.label).join(", ") ||
                "No asserted parent."}
            </span>
          </dd>
        </div>
        <div>
          <dt>Children</dt>
          <dd>
            <b>{context.sample?.children ?? context.directChildren.length}</b>
            <span>
              {context.directChildren.length} sent ·{" "}
              {children.map((t) => t.label).join(", ") ||
                "No existing children."}
            </span>
          </dd>
        </div>
        <div>
          <dt>Descendants</dt>
          <dd>
            <b>{context.sample?.descendants ?? context.descendants.length}</b>
            <span>
              {context.descendants.length} sent ·{" "}
              {context.descendants
                .map((t) => t.label + " (depth " + t.depth + ")")
                .join(", ") || "No descendants."}
            </span>
          </dd>
        </div>
      </dl>
      {context.sample &&
        (context.sample.children > context.directChildren.length ||
          context.sample.descendants > context.descendants.length) && (
          <p className="muted">
            {context.directChildren.length} of {context.sample.children}{" "}
            children · {context.descendants.length} of{" "}
            {context.sample.descendants} descendants.{" "}
            {entry
              ? "Random sample, retained with this run."
              : "A new random sample is selected for each run."}
          </p>
        )}
      <details>
        <summary>Ancestor links to the roots</summary>
        <ul>
          {context.ancestorLinks.map((link, i) => (
            <li key={i}>
              {labels.get(link.child) ?? link.child} →{" "}
              {labels.get(link.parent) ?? link.parent}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Existing children and descendants</summary>
        <ul>
          {[
            ...new Map(
              [
                ...children.map((t) => ({ ...t, depth: 1 })),
                ...context.descendants,
              ].map((t) => [t.iri, t]),
            ).values(),
          ].map((t) => (
            <li key={t.iri}>
              <strong>{t.label}</strong> ·{" "}
              {t.depth === 1 ? "direct child" : "depth " + t.depth}
              {t.comment && <p>{t.comment}</p>}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Exact prompt</summary>
        <textarea
          aria-label="Taxonomy prompt"
          readOnly
          value={entry?.prompt ?? buildTaxonomyPrompt(context)}
          rows={12}
        />
        <button onClick={copy}>Copy prompt</button>
      </details>
    </>
  );
}
