import { useEffect } from "react";
import {
  useTextAnalysis,
  textAnalysisSession,
  ensureEntityDraft,
} from "./text-analysis-state";
import { TextEntityCreate } from "./TextEntityCreate";
import { SharedPane } from "./SharedPane";
import { registerPaneRecovery } from "./AdaptivePane";
import "./add-entity-reference.css";

// craigtrim/axiom#93: keep the persisted component identity with shared chrome.
registerPaneRecovery("textentities", {
  Body: ({ maximize }) => (
    <div className="add-entity-recovery">
      <div className="id">Add entity</div>
      <div className="why">
        Too little room to author. The name, parents, description and statements
        are retained.
      </div>
      <div>{maximize}</div>
    </div>
  ),
});
export function TextEntitiesPanel() {
  const { snapshot, creation } = useTextAnalysis();
  const current =
    creation?.datasetEpoch === snapshot.datasetEpoch ? creation : undefined;
  useEffect(() => {
    if (!current) ensureEntityDraft();
  }, [current, snapshot.datasetEpoch]);
  return (
    <section
      className="panel shared-layer text-entities-panel"
      data-panel="textentities"
      aria-label="Add entity view"
    >
      <SharedPane className="footed add-entity-surface">
        {current && (
          <TextEntityCreate
            key={current.id}
            phrase={current.phrase}
            datasetEpoch={current.datasetEpoch}
            draft={current.draft}
            changeDraft={textAnalysisSession.updateDraft}
          />
        )}
      </SharedPane>
    </section>
  );
}
