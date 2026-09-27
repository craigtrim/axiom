import { PaneToolbar } from "./AdaptivePane";
import { DetailsBack } from "./DetailsNavigation";
import { command } from "./client";
import { inspectTextEntity, textAnalysisSession } from "./text-analysis-state";
import {
  textEntityConcepts,
  type TextEntity,
  type TextAnalysisResult,
} from "../shared/text-analysis";

/** Read-only annotations and disambiguation share the normal Details pane. */
export function TextSpanDetails({
  entity,
  result,
  panelId,
}: {
  entity: TextEntity;
  result: TextAnalysisResult;
  panelId: string;
}) {
  const concepts = textEntityConcepts(result, entity);
  return (
    <section
      className="panel entity-editor"
      data-panel={panelId}
      aria-label="Details"
    >
      <PaneToolbar label="Details navigation">
        <DetailsBack />
        <strong>Text match</strong>
        <button onClick={() => command("view.textanalysis")}>View Text</button>
      </PaneToolbar>
      <div
        className="entity-editor-content text-span-details"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            textAnalysisSession.clearDetails();
            command("view.textanalysis");
          }
        }}
      >
        <blockquote aria-label="Matched text">
          {result.text.slice(entity.start, entity.end)}
        </blockquote>
        <dl>
          <dt>
            {entity.source === "ontology" ? "Canonical name" : "Entity type"}
          </dt>
          <dd>{entity.label}</dd>
          <dt>Source</dt>
          <dd>
            {entity.source === "ontology" ? "Ontology" : "Language model"}
          </dd>
          <dt>Match</dt>
          <dd>{entity.method}</dd>
        </dl>
        {concepts.length > 1 && (
          <p>
            This canonical name is shared by {concepts.length} ontology entries.
            Choose the entry to inspect.
          </p>
        )}
        {concepts.map((concept) => (
          <div className="text-span-choice" key={concept.iri}>
            <button onClick={() => void inspectTextEntity(entity, concept.iri)}>
              Open {concept.label}
            </button>
            <code>{concept.iri}</code>
          </div>
        ))}
        {!concepts.length && (
          <p>
            {entity.source === "model"
              ? "This language-model annotation has no linked ontology entry."
              : "No ontology entry is available for this canonical name."}
          </p>
        )}
      </div>
    </section>
  );
}
