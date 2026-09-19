import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ancestryTrail, type AncestryStep } from "../domain/ancestry";
import { usePaneLayout } from "./AdaptivePane";
import { useSnapshot } from "./client";
import {
  navigateAncestry,
  revealAncestrySelection,
} from "./taxonomy-navigation";

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
  const pane = usePaneLayout();
  const current = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = current.current;
    if (!anchor) return;
    const win = anchor.ownerDocument.defaultView!;
    let frame = win.requestAnimationFrame(() => {
      frame = win.requestAnimationFrame(() =>
        revealAncestrySelection(iri, anchor),
      );
    });
    return () => win.cancelAnimationFrame(frame);
  }, [iri, pane.width, pane.height]);
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
  const vertical = pane.width < pane.height;
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
      className="ancestry"
      aria-label="Ancestry"
      data-orientation={vertical ? "vertical" : "horizontal"}
    >
      <div className="ancestry-heading">
        <span className="ancestry-title">
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M5 5v10h10V5M5 10h10" />
            <circle cx="5" cy="4" r="2" fill="currentColor" />
            <circle cx="15" cy="4" r="2" fill="currentColor" />
            <circle cx="10" cy="15" r="2.5" fill="currentColor" />
          </svg>{" "}
          Ancestry
        </span>
        {result.stages.length === 1 && !result.stages[0][0].parents.length && (
          <span className="ancestry-summary">
            {entity.kind === "Individual"
              ? "No named class assigned"
              : "Root class"}
          </span>
        )}
      </div>
      <div className="ancestry-track">
        <ol className="ancestry-trail" aria-label="Selected entity to roots">
          {stages.map((stage) => {
            if (typeof stage === "number")
              return (
                <li className="ancestry-gap" key="gap">
                  <button
                    title="Show every ancestry stage"
                    onClick={() => setExpanded(true)}
                  >
                    <span className="ancestry-dots" aria-hidden="true">
                      ···
                    </span>
                    <span>{stage} more</span>
                    <span className="sr-only"> ancestry stages</span>
                  </button>
                </li>
              );
            const key = stage.map((step) => step.iri).join(" ");
            const grouped = stage.length > 1;
            const visible = groups.has(key) ? stage : stage.slice(0, 4);
            const rootGroup = stage.every((step) => step.root);
            return (
              <li className="ancestry-stage" key={key} data-grouped={grouped}>
                <div
                  className={grouped ? "ancestry-group" : undefined}
                  data-root={rootGroup}
                >
                  {grouped && (
                    <small className="ancestry-group-label">
                      {rootGroup
                        ? "Roots"
                        : entity.kind === "Individual" &&
                            stage === result.stages[1]
                          ? "Classes"
                          : "Ancestors"}
                    </small>
                  )}
                  {visible.map((step) => {
                    const selected = step.iri === iri;
                    const content = (
                      <>
                        <span className="ancestry-node-mark" aria-hidden="true">
                          {selected
                            ? entity.kind === "Individual"
                              ? "◆"
                              : "▣"
                            : step.root
                              ? "◉"
                              : "○"}
                        </span>
                        <span className="ancestry-crumb-text">
                          {!grouped && (
                            <small>
                              {selected
                                ? entity.kind === "Individual"
                                  ? "Selected instance"
                                  : "Selected class"
                                : step.root
                                  ? "Root"
                                  : step.unresolved
                                    ? "Referenced class"
                                    : "Ancestor"}
                            </small>
                          )}
                          <strong>{step.label}</strong>
                        </span>
                      </>
                    );
                    return selected ? (
                      <div
                        key={step.iri}
                        ref={current}
                        className="ancestry-crumb ancestry-current"
                        aria-current="page"
                        title={description(step)}
                      >
                        {content}
                      </div>
                    ) : (
                      <button
                        key={step.iri}
                        className="ancestry-crumb"
                        data-root={step.root}
                        aria-label={"View " + step.label + " details"}
                        title={description(step)}
                        onClick={(event) =>
                          navigateAncestry(
                            step.iri,
                            event.currentTarget.ownerDocument,
                          )
                        }
                      >
                        {content}
                      </button>
                    );
                  })}
                  {visible.length < stage.length && (
                    <button
                      className="ancestry-group-more"
                      onClick={() => setGroups((old) => new Set(old).add(key))}
                    >
                      Show {stage.length - visible.length} more
                      <span className="sr-only"> ancestors</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {result.more && (
        <div className="ancestry-actions">
          <button onClick={() => setLimit((n) => n + 2048)}>
            Load more ancestors
          </button>
        </div>
      )}
    </nav>
  );
}
