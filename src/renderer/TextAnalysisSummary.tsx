import { useMemo } from "react";
import { useTextAnalysis, selectTextEntity } from "./text-analysis-state";
import { textEntityGroups } from "./text-analysis-session";

export function TextAnalysisSummary() {
  const { input, result, analysis } = useTextAnalysis();
  const legend = useMemo(() => textEntityGroups(result), [result]);
  return (
    <div
      className="text-analysis-summary"
      role="region"
      aria-label="Text Analysis summary"
    >
      <div className="text-analysis-legend" aria-label="Entity legend">
        {!legend.length && (
          <span>
            {analysis.status === "error"
              ? analysis.message
              : input.text.trim() && result
                ? "No entities found."
                : input.text.trim()
                  ? ""
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
    </div>
  );
}
