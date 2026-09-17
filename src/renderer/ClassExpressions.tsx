import { EntitySource } from "./EntitySource";
import { DetailsBack } from "./DetailsNavigation";
import { PaneToolbar } from "./AdaptivePane";
import { NS, SUBCLASS, type Entity } from "../domain/model";
import { displayName } from "../domain/rdf-model";
import { useSnapshot, act, command } from "./client";

/** Readable OWL expressions, shared by Inspector and Details. */
export function ClassExpressions({ entity }: { entity: Entity }) {
  const s = useSnapshot()!;
  const map = new Map(s.entities.map((e) => [e.iri, e]));
  const link = (iri: string) => {
    const e = map.get(iri),
      n = s.graph.nodes.find((n) => n.iri === iri);
    return (
      <button
        className="entity-link"
        onClick={() => void act("select", { iri })}
      >
        {n?.label ?? (e ? displayName(e) : iri)}
      </button>
    );
  };
  const members = (iri: string, path = new Set<string>()): React.ReactNode => {
    const expression = map.get(iri)?.intersection;
    if (!expression) return link(iri);
    if (path.has(iri) || path.size >= 32)
      return <span>Nested expression (see source)</span>;
    if (expression.issue)
      return <p role="alert">{expression.issue} Open Source to inspect it.</p>;
    if (!expression.members.length)
      return <p>All things (owl:Thing). This intersection has no members.</p>;
    const next = new Set(path).add(iri);
    return (
      <ul>
        {expression.members.map((member) => (
          <li key={member}>
            {map.get(member)?.kind === "Intersection" ? (
              <>
                <span>All of</span>
                {members(member, next)}
              </>
            ) : (
              link(member)
            )}
          </li>
        ))}
      </ul>
    );
  };
  if (!entity.intersection && !entity.classExpressions?.length) return null;
  return (
    <div className="class-expressions" aria-label="Intersection constraints">
      {entity.intersection && (
        <section>
          <h3>
            {entity.kind === "Intersection" ? "All of" : "Equivalent to all of"}
          </h3>
          {members(entity.iri)}
        </section>
      )}
      {entity.classExpressions?.map((r) => (
        <section key={r.predicate + r.iri}>
          <h3>
            {r.predicate === SUBCLASS
              ? "Subclass of all of"
              : "Equivalent to all of"}
          </h3>
          {members(r.iri)}
          <p className="muted">
            {r.predicate === SUBCLASS
              ? "Every instance of this class belongs to each class above. The reverse is not asserted."
              : "This class contains exactly the instances that belong to every class above."}
          </p>
        </section>
      ))}
    </div>
  );
}

export function IntersectionDetails({
  entity,
  panelId,
}: {
  entity: Entity;
  panelId: string;
}) {
  const s = useSnapshot()!;
  const owners = s.entities.filter((e) =>
    e.classExpressions?.some((r) => r.iri === entity.iri),
  );
  return (
    <section
      className="panel entity-editor"
      data-panel={panelId}
      aria-label={panelId === "inspector" ? "Entity inspector" : "Details"}
    >
      {panelId !== "inspector" && (
        <PaneToolbar label="Details navigation">
          <DetailsBack />
          <strong>Intersection</strong>
        </PaneToolbar>
      )}
      <div className="entity-editor-content">
        {panelId === "inspector" && <h2>Intersection</h2>}
        <p>An AND expression: an instance must belong to every member.</p>
        <ClassExpressions entity={entity} />
        {!!owners.length && (
          <section>
            <h3>Used by</h3>
            <ul>
              {owners.map((owner) => (
                <li key={owner.iri}>
                  <button
                    className="entity-link"
                    onClick={() => void act("select", { iri: owner.iri })}
                  >
                    {displayName(owner)}
                  </button>
                  {owner.classExpressions?.find((r) => r.iri === entity.iri)
                    ?.predicate ===
                  NS.rdfs + "subClassOf"
                    ? " is a subclass of this intersection"
                    : " is equivalent to this intersection"}
                </li>
              ))}
            </ul>
          </section>
        )}
        <EntitySource key={entity.iri} iri={entity.iri} initialOpen />
      </div>
    </section>
  );
}
