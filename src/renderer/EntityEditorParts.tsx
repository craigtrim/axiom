import { useId, type ReactNode } from "react";
import { THING, type Entity } from "../domain/model";
import type { Snapshot } from "../shared/protocol";
import { ancestryTrail } from "../domain/ancestry";

export function SectionPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={`entity-section ${className}`} aria-labelledby={id}>
      <h3 id={id} className="entity-section-heading">
        {title}
      </h3>
      {children}
    </section>
  );
}
export function StatementTable({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  return (
    <div className="entity-statements-wrap">
      <p className="entity-statement-count">
        {count} {count === 1 ? "statement" : "statements"}
      </p>
      <table className="entity-statements" aria-label="Class statements">
        <thead>
          <tr>
            <th scope="col">Predicate</th>
            <th scope="col">Value</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function AddStatementAction({
  disabled,
  add,
}: {
  disabled?: boolean;
  add(): void;
}) {
  return (
    <button
      type="button"
      className="entity-add-row"
      disabled={disabled}
      onClick={add}
    >
      + Add row
    </button>
  );
}
export function SourceDisclosure({
  open,
  change,
  source,
  disabled = false,
}: {
  open: boolean;
  change(open: boolean): void;
  source: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="entity-source">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => change(!open)}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Source
      </button>
      {open && (
        <pre id={id} aria-label="RDF/XML source" tabIndex={0}>
          {source || "Complete the valid statements to preview RDF/XML."}
        </pre>
      )}
    </div>
  );
}
export function AncestryChain({
  snapshot,
  label,
  parents,
}: {
  snapshot: Snapshot;
  label: string;
  parents: string[];
}) {
  const iri = "urn:axiom:find-draft";
  const entities = new Map<string, Entity>(
    snapshot.entities.map((e) => [e.iri, e]),
  );
  entities.set(iri, {
    iri,
    name: label || "Untitled",
    label: label || "Untitled",
    kind: "Class",
    parents: parents.length ? parents : [THING],
    types: [],
    children: [],
    restrictions: [],
  } as unknown as Entity);
  const trail = ancestryTrail(entities, iri, 512, 11);
  return (
    <SectionPanel title="Ancestry">
      <ol className="entity-ancestry-chain" aria-label="Draft ancestry">
        {trail.stages.slice(0, 12).map((stage, index) => (
          <li key={index}>
            {stage.map((step) => (
              <div
                className="entity-ancestry-card"
                data-subject={index === 0}
                key={step.iri}
              >
                <span>
                  {index === 0
                    ? "New class"
                    : step.root || step.iri === THING
                      ? "Root level"
                      : "Parent"}
                </span>
                <strong title={step.iri}>
                  {step.iri === THING ? "owl:Thing" : step.label}
                </strong>
              </div>
            ))}
          </li>
        ))}
      </ol>
      {(trail.more || trail.stages.length > 12) && (
        <p className="muted">
          More ancestors exist. The preview shows up to 12 levels.
        </p>
      )}
      {!parents.length && (
        <p className="entity-root-caution">
          This will sit under owl:Thing. Set rdfs:subClassOf below to place it
          under an existing parent.
        </p>
      )}
    </SectionPanel>
  );
}
