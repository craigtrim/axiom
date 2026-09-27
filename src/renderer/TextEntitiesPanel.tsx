import { useId, useMemo } from "react";
import { command } from "./client";
import {
  useTextAnalysis,
  textAnalysisSession,
  selectTextEntity,
  focusAnalysisText,
} from "./text-analysis-state";
import { textEntityGroups } from "./text-analysis-session";
import { entityHue } from "../shared/text-analysis";
import { TextEntityCreate } from "./TextEntityCreate";
import { revealInTaxonomy } from "./taxonomy-navigation";

export function TextEntitiesPanel() {
  const { snapshot, input, result, mode, creation, created, analysis } =
    useTextAnalysis();
  const id = useId();
  const legend = useMemo(() => textEntityGroups(result), [result]);
  const currentMode =
    mode === "add" && creation?.datasetEpoch !== snapshot.datasetEpoch
      ? "summary"
      : mode;
  const summary = () => {
    textAnalysisSession.summary();
    focusAnalysisText();
  };
  return (
    <section
      className="panel text-entities-panel"
      data-panel="textentities"
      aria-label="Text Entities"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          currentMode !== "summary" &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          event.stopPropagation();
          summary();
        }
      }}
    >
      <style>
        {legend
          .map(({ entity }, i) => {
            const hue = entityHue(entity.key);
            return `.text-entities-panel .text-entity-${i}{background:hsl(${hue} 75% 90%);color:#202020}[data-theme=dark] .text-entities-panel .text-entity-${i}{background:hsl(${hue} 35% 27%);color:#fff}`;
          })
          .join("\n")}
      </style>
      <div className="text-entities-heading">
        <div
          role="tablist"
          aria-label="Text entity views"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            const tabs = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ];
            const at = tabs.indexOf(event.target as HTMLButtonElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                    tabs.length;
            event.preventDefault();
            tabs[next]?.click();
            tabs[next]?.focus();
          }}
        >
          {(["summary", "add"] as const).map((tab) => (
            <button
              key={tab}
              id={id + "-" + tab}
              role="tab"
              tabIndex={currentMode === tab ? 0 : -1}
              aria-controls={id + "-content"}
              aria-selected={currentMode === tab}
              disabled={
                tab === "add" &&
                (!creation || creation.datasetEpoch !== snapshot.datasetEpoch)
              }
              onClick={() => textAnalysisSession.setMode(tab)}
            >
              {tab === "summary" ? "Summary" : "Add entity"}
            </button>
          ))}
        </div>
        <button onClick={() => command("textanalysis.reveal")}>
          View Text
        </button>
      </div>
      <div
        role="tabpanel"
        id={id + "-content"}
        aria-labelledby={id + "-" + currentMode}
        className="text-entities-content"
      >
        {currentMode === "summary" && (
          <>
            {created &&
              snapshot.entities.some(
                (entity) => entity.iri === created.iri,
              ) && (
                <div className="text-analysis-created">
                  <span role="status">
                    Added {created.label} under{" "}
                    {created.parents
                      .map(
                        (parent) =>
                          snapshot.entities.find(
                            (entity) => entity.iri === parent,
                          )?.label ?? parent,
                      )
                      .join(", ")}
                    .
                  </span>
                  <button onClick={() => revealInTaxonomy(created.iri)}>
                    View in Taxonomy
                  </button>
                </div>
              )}
            <div className="text-analysis-legend" aria-label="Entity legend">
              {!legend.length && (
                <span>
                  {analysis.status === "error"
                    ? analysis.message
                    : input.text.trim() && result
                      ? "No entities found."
                      : input.text.trim()
                        ? "Analyzing text..."
                        : "Entity colors appear here as you type in Text Analysis."}
                </span>
              )}
              {legend.map(({ entity, count }, i) => (
                <button
                  key={entity.key}
                  className={"text-analysis-chip text-entity-" + i}
                  title={`${entity.source === "ontology" ? "Ontology" : "Named entity"}: ${entity.label}. Show details.`}
                  onClick={() => selectTextEntity(entity)}
                >
                  <span>{entity.label}</span>
                  <small>
                    {entity.source === "ontology" ? "Ontology" : "Named entity"}
                  </small>
                  <b>{count}</b>
                </button>
              ))}
            </div>
          </>
        )}
        {currentMode === "add" && creation && (
          <TextEntityCreate
            key={creation.datasetEpoch + ":" + creation.phrase}
            draft={creation.draft}
            changeDraft={textAnalysisSession.updateDraft}
            phrase={creation.phrase}
            datasetEpoch={creation.datasetEpoch}
            close={summary}
            added={(iri, label, parents) => {
              textAnalysisSession.added(iri, label, parents);
              focusAnalysisText();
            }}
          />
        )}
      </div>
    </section>
  );
}
