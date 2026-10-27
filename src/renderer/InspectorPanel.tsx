import { useEffect, useState } from "react";
import { shorten } from "../domain/model";
import { displayName } from "../domain/rdf-model";
import type { InspectorData } from "../shared/protocol";
import { act, command, report, request, useSnapshot } from "./client";
import { EdgeInspector } from "./EdgeInspector";
import { registerPaneRecovery } from "./AdaptivePane";
import { SharedPane } from "./SharedPane";
import { InspectorStatements } from "./InspectorStatements";
// #165: generated example records are readable but do not have editable RDF drafts.
import { GeneratedInspector } from "./GeneratedInspector";
import "./inspector-reference.css";

// craigtrim/axiom#89: retain subject drafts beneath the shared chrome and recovery.
registerPaneRecovery("inspector", {
  Body: ({ maximize }) => (
    <div className="inspector-recovery">
      <div className="id">Inspector</div>
      <div className="why">
        Too little room to edit. The draft and its validation are retained.
      </div>
      <div>{maximize}</div>
    </div>
  ),
});

export function EntityLink({ iri }: { iri: string }) {
  const s = useSnapshot();
  const e = s?.entities.find((e) => e.iri === iri);
  return (
    <button
      className="entity-link"
      title={iri}
      onClick={() => void act("select", { iri })}
      onDoubleClick={() => {
        void act("seed", { iris: [iri] }).then(() => command("graph.fit"));
        command("view.graph");
      }}
    >
      {e ? displayName(e) : shorten(iri)}
    </button>
  );
}

export function InspectorPanel() {
  const s = useSnapshot()!;
  const [data, setData] = useState<InspectorData | null>(null);
  useEffect(() => {
    let active = true;
    if (!s.selected) {
      setData(null);
      return;
    }
    void request<InspectorData | null>("inspector", { iri: s.selected })
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) report(error.message, true);
      });
    return () => {
      active = false;
    };
  }, [s.selected, s.version, s.datasetEpoch]);
  if (s.graph.selectedEdge)
    return (
      <EdgeInspector
        key={s.datasetEpoch + s.graph.selectedEdge}
        edgeId={s.graph.selectedEdge}
      />
    );
  return (
    <section
      className="panel shared-layer inspector-surface"
      data-panel="inspector"
      aria-label="Entity inspector"
    >
      <SharedPane className="inspector-pane">
        {data && data.entity.iri === s.selected ? (
          data.order || data.customer ? (
            <GeneratedInspector data={data} />
          ) : (
            <InspectorStatements
              key={s.datasetEpoch + data.entity.iri}
              data={data}
            />
          )
        ) : (
          <>
            <div className="bar" role="group" aria-label="Inspector actions" />
            <div className="inspector-empty">
              Select an entity to inspect it.
            </div>
          </>
        )}
      </SharedPane>
    </section>
  );
}
