import { DetailsBack, DetailsNavigation } from "./DetailsNavigation";
import { StatementGrid } from "./StatementGrid";
import { EdgeInspector } from "./EdgeInspector";
import { IntersectionDetails } from "./ClassExpressions";
import { PaneToolbar } from "./AdaptivePane";
import { EntitySource } from "./EntitySource";
import { useSnapshot } from "./client";
import { displayName } from "../domain/rdf-model";
import { SUBCLASS } from "../domain/model";
import { namedClass } from "../domain/class-expressions";
import { useEntityEditor } from "./useEntityEditor";
export function DetailsPanel({ panelId }: { panelId: string }) {
  return (
    <DetailsNavigation>
      <DetailsContent panelId={panelId} />
    </DetailsNavigation>
  );
}
function DetailsContent({ panelId }: { panelId: string }) {
  const s = useSnapshot()!;
  if (s.graph.selectedEdge)
    return (
      <EdgeInspector
        key={s.datasetEpoch + ":" + s.graph.selectedEdge}
        edgeId={s.graph.selectedEdge}
        panelId={panelId}
      />
    );
  const selected = s.entities.find((e) => e.iri === s.selected);
  if (selected?.kind === "Intersection")
    return <IntersectionDetails entity={selected} panelId={panelId} />;
  if (s.selected && selected)
    return (
      <EntityEditor
        key={s.datasetEpoch + ":" + s.selected}
        iri={s.selected}
        panelId={panelId}
      />
    );
  return (
    <section
      className="panel entity-editor"
      data-panel={panelId}
      aria-label="Details"
    >
      <PaneToolbar label="Details navigation">
        <DetailsBack />
      </PaneToolbar>
      <div className="entity-editor-content">
        <p>
          {s.selected
            ? "This generated sample is read-only. Its properties are available in Inspector."
            : "Select a node or edge to see its details."}
        </p>
      </div>
    </section>
  );
}
export function EntityEditor({
  iri,
  panelId,
}: {
  iri: string;
  panelId: string;
}) {
  const s = useSnapshot()!;
  const { loaded, triples, setTriples, changed, error, saving, save, reload } =
    useEntityEditor(iri, true);

  return (
    <section
      className="panel entity-editor"
      data-panel={panelId}
      data-entity-iri={iri}
      aria-label="Details"
    >
      <PaneToolbar
        label="Entity actions"
        secondary={
          <button onClick={() => void reload(true)} disabled={saving}>
            Reload
          </button>
        }
      >
        <DetailsBack />
        <strong>{loaded ? displayName(loaded.entity) : "Details"}</strong>
        <span className="entity-save-status" role="status">
          {saving ? "Saving…" : changed ? "Editing" : "Saved"}
        </span>
      </PaneToolbar>
      <div className="entity-editor-content">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {loaded && (
          <>
            <div className="statement-grid-toolbar">
              <span>
                {triples
                  .reduce(
                    (n, t) =>
                      n +
                      (t.predicate === SUBCLASS
                        ? (loaded.parentExpressions?.[t.object.value]?.length ??
                          1)
                        : 1),
                    0,
                  )
                  .toLocaleString()}{" "}
                statements
              </span>
              {namedClass(loaded.entity) && (
                <button
                  onClick={() =>
                    setTriples((ts) => [
                      ...ts,
                      {
                        subject: iri,
                        predicate: SUBCLASS,
                        object: { literal: false, value: "" },
                      },
                    ])
                  }
                >
                  Add parent
                </button>
              )}
              <button
                onClick={() =>
                  setTriples((ts) => [
                    ...ts,
                    {
                      subject: iri,
                      predicate: "",
                      object: { literal: true, value: "" },
                    },
                  ])
                }
              >
                Add statement
              </button>
            </div>
            <StatementGrid
              triples={triples}
              ontology={s.ontology}
              replace={setTriples}
              classEntity={namedClass(loaded.entity)}
              parentExpressions={loaded.parentExpressions}
              commit={() => void save()}
            />
            <EntitySource iri={iri} />
          </>
        )}
      </div>
    </section>
  );
}
