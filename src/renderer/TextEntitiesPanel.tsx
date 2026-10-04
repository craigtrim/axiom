import { command } from "./client";
import {
  useTextAnalysis,
  textAnalysisSession,
  focusAnalysisText,
  ensureEntityDraft,
} from "./text-analysis-state";
import { TextEntityCreate } from "./TextEntityCreate";
import { revealInTaxonomy } from "./taxonomy-navigation";

// Keep the persisted component ID so existing layouts, detached windows and
// saved tab history reopen the independent Add entity view in the same place.
export function TextEntitiesPanel() {
  const { snapshot, creation, created } = useTextAnalysis();
  const current =
    creation?.datasetEpoch === snapshot.datasetEpoch ? creation : undefined;
  const confirmed =
    created && snapshot.entities.some((entity) => entity.iri === created.iri);
  const viewText = () => {
    command("textanalysis.reveal");
    focusAnalysisText();
  };
  const cancel = () => {
    textAnalysisSession.summary();
    viewText();
  };
  return (
    <section
      className="panel text-entities-panel"
      data-panel="textentities"
      aria-label="Add entity view"
    >
      <div className="text-entities-heading">
        <strong>Add entity</strong>
        <button onClick={viewText}>View Text</button>
      </div>
      <div
        className="text-entities-content"
        data-mode={current ? "add" : "empty"}
      >
        {current ? (
          <TextEntityCreate
            key={current.datasetEpoch + ":" + current.phrase}
            draft={current.draft}
            changeDraft={textAnalysisSession.updateDraft}
            phrase={current.phrase}
            context={current.context}
            datasetEpoch={current.datasetEpoch}
            close={cancel}
            added={(iri, label, parents, classes) => {
              textAnalysisSession.added(iri, label, parents, classes);
              focusAnalysisText();
            }}
          />
        ) : (
          <div
            className={
              confirmed ? "text-analysis-created" : "text-entity-empty"
            }
          >
            {confirmed && created && (
              <>
                <div role="status">
                  {(created.classes ?? [created])
                    .filter((item) =>
                      snapshot.entities.some(
                        (entity) => entity.iri === item.iri,
                      ),
                    )
                    .map((item) => (
                      <p key={item.iri}>
                        Added {item.label} under{" "}
                        {item.parents
                          .map(
                            (parent) =>
                              snapshot.entities.find(
                                (entity) => entity.iri === parent,
                              )?.label || parent,
                          )
                          .join(", ")}
                        .
                      </p>
                    ))}
                </div>
                <button onClick={() => revealInTaxonomy(created.iri)}>
                  View in Taxonomy
                </button>
              </>
            )}
            <p>
              Select a phrase in Text Analysis and choose Add entity, or start
              an empty form here.
            </p>
            <button onClick={ensureEntityDraft}>Add entity</button>
          </div>
        )}
      </div>
    </section>
  );
}
