import { useMemo } from "react";
import { useTextAnalysis, selectTextEntity } from "./text-analysis-state";
import { textEntityGroups } from "./text-analysis-session";
import { entityHue } from "../shared/text-analysis";

// craigtrim/axiom#79: first-occurrence rows share the editor's six fixed tints.
export function TextAnalysisSummary() {
  const { result, snapshot } = useTextAnalysis();
  const legend = useMemo(() => textEntityGroups(result), [result]);
  const count = result?.entities.length ?? 0;
  return (
    <div
      className="text-analysis-summary summary"
      role="region"
      aria-label="Text Analysis summary"
    >
      <div className="sumhead">
        <b>
          {`${legend.length} ${legend.length === 1 ? "entity" : "entities"}`}
        </b>
        <span>
          {`${count} ${count === 1 ? "match" : "matches"} in ${snapshot.ontology.name}`}
        </span>
      </div>
      <div className="text-analysis-legend sumlist" aria-label="Entity legend">
        {!legend.length && (
          <div className="sumempty">
            Nothing in this text matches the open ontology.
          </div>
        )}
        {legend.map(({ entity, count }, i) => (
          <button
            key={entity.key}
            className={`text-analysis-chip sumrow h${1 + (entityHue(entity.key) % 6)} text-entity-${i}`}
            title={`${entity.source === "ontology" ? "Ontology" : "Named entity"}: ${entity.label}. Show details.`}
            onClick={() => void selectTextEntity(entity)}
          >
            <span className="sw2" aria-hidden="true" />
            <span className="lab">{entity.label}</span>
            <span className="n">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
