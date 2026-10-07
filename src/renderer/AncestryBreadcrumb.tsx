import { useMemo, useState } from "react";
import { ancestryTrail, type AncestryStep } from "../domain/ancestry";
import { useSnapshot } from "./client";
import { editEntity } from "./authoring";

function description(step: AncestryStep) {
  const relations = step.parents.map((parent) => {
    const relation =
      parent.relation === "instance"
        ? "is an instance of"
        : parent.relation === "definition"
          ? "has a parent from its intersection definition:"
          : parent.relation === "subproperty"
            ? "is a subproperty of"
            : "is a subclass of";
    return step.label + " " + relation + " " + parent.label;
  });
  if (step.unresolved)
    relations.push("Referenced but not defined in this ontology.");
  return [...relations, step.iri].join("\n");
}

export function AncestryBreadcrumb({ iri }: { iri: string }) {
  const s = useSnapshot()!;
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(2048);
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const index = useMemo(
    () => new Map(s.entities.map((e) => [e.iri, e])),
    [s.datasetEpoch, s.version],
  );
  const result = useMemo(
    () => ancestryTrail(index, iri, limit),
    [index, iri, limit],
  );
  const entity = index.get(iri);
  if (!entity || !["Class", "Defined", "Individual"].includes(entity.kind))
    return null;
  const folded = result.stages.length > 5 && !expanded;
  const stages: (AncestryStep[] | number)[] = folded
    ? [
        ...result.stages.slice(0, 3),
        result.stages.length - 4,
        result.stages.at(-1)!,
      ]
    : result.stages;
  return (
    <nav
      className="anc ancestry"
      aria-label="Ancestry"
      data-orientation="vertical"
    >
      <ol className="ancestry-trail" aria-label="Selected entity to roots">
        {stages.map((stage, index) => {
          if (typeof stage === "number")
            return (
              <li className="ancestry-gap" key="gap">
                <div className="join" />
                <button
                  className="lnk"
                  title="Show every ancestry stage"
                  onClick={() => setExpanded(true)}
                >
                  {stage} more<span className="sr-only"> ancestry stages</span>
                </button>
              </li>
            );
          const key = stage.map((step) => step.iri).join(" ");
          const grouped = stage.length > 1;
          const visible = groups.has(key) ? stage : stage.slice(0, 4);
          const cards = visible.map((step) =>
            step.iri === iri ? (
              <div
                key={step.iri}
                className="card sel ancestry-current"
                aria-current="page"
                title={description(step)}
              >
                <span className="cap">
                  {entity.kind === "Individual"
                    ? "Selected instance"
                    : "Selected class"}
                </span>
                <strong className="nm">{step.label}</strong>
              </div>
            ) : (
              <button
                key={step.iri}
                className="card ancestry-crumb"
                data-root={step.root}
                aria-label={"View " + step.label + " details"}
                title={description(step)}
                onClick={() => editEntity(step.iri)}
              >
                <span
                  className={"glyph" + (step.root ? " root" : "")}
                  aria-hidden="true"
                />
                <strong>{step.label}</strong>
              </button>
            ),
          );
          return (
            <li className="ancestry-stage" key={key} data-grouped={grouped}>
              {index > 0 && <div className="join" />}
              {grouped ? (
                <div className="fan ancestry-peers">
                  {cards}
                  {visible.length < stage.length && (
                    <button
                      className="lnk ancestry-group-more"
                      onClick={() => setGroups((old) => new Set(old).add(key))}
                    >
                      Show {stage.length - visible.length} more
                      <span className="sr-only"> ancestors</span>
                    </button>
                  )}
                </div>
              ) : (
                cards
              )}
            </li>
          );
        })}
      </ol>
      {result.more && (
        <div className="ancestry-actions">
          <button className="lnk" onClick={() => setLimit((n) => n + 2048)}>
            Load more ancestors
          </button>
        </div>
      )}
    </nav>
  );
}
