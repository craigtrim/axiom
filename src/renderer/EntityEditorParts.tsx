import { useId, type ReactNode } from "react";
import { THING, type Entity } from "../domain/model";
import type { Snapshot } from "../shared/protocol";
import { ancestryTrail } from "../domain/ancestry";
import { FindGlyph } from "./FindGlyph";

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
      <table className="entity-statements st" aria-label="Class statements">
        <colgroup>
          <col style={{ width: 140 }} />
          <col />
          <col style={{ width: 30 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Predicate</th>
            <th scope="col" colSpan={2}>
              <span className="th-row">
                <span>Value</span>
                <span className="n entity-statement-count">
                  {count} {count === 1 ? "statement" : "statements"}
                </span>
              </span>
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
      className="entity-add-row addrow"
      disabled={disabled}
      onClick={add}
    >
      <FindGlyph name="plus" />
      Add row
    </button>
  );
}
export function SourceDisclosure({
  open,
  change,
  source,
  disabled = false,
  plain = false,
}: {
  open: boolean;
  change(open: boolean): void;
  source: string;
  disabled?: boolean;
  plain?: boolean;
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
        {!plain && <span aria-hidden="true">{open ? "▾" : "▸"}</span>} Source
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
  if (!parents.length || (parents.length === 1 && parents[0] === THING))
    return (
      <div className="anc-line" aria-label="Draft ancestry">
        <b>{label || "Untitled"}</b> under <b>owl:Thing</b>{" "}
        <span className="hint">Set a parent to change that.</span>
      </div>
    );
  return (
    <section className="sect" aria-label="Draft ancestry">
      <ol className="entity-ancestry-chain chain">
        {trail.stages.slice(0, 12).map((stage, index) => (
          <li key={index}>
            {index > 0 && <div className="conn" aria-hidden="true" />}
            {stage.map((step) => (
              <div
                className={`entity-ancestry-card ccard${index === 0 ? " sel" : ""}`}
                data-subject={index === 0}
                key={step.iri}
              >
                <span className="glyph" aria-hidden="true">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    {index === 0 ? (
                      <>
                        <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
                        <rect
                          x="6"
                          y="6"
                          width="4"
                          height="4"
                          fill="currentColor"
                          stroke="none"
                        />
                      </>
                    ) : (
                      <>
                        <circle cx="8" cy="8" r="4.5" />
                        {(step.root || step.iri === THING) && (
                          <circle
                            cx="8"
                            cy="8"
                            r="2"
                            fill="currentColor"
                            stroke="none"
                          />
                        )}
                      </>
                    )}
                  </svg>
                </span>
                <span>
                  {index === 0 && <span className="cc">New class</span>}
                  <strong className="nn" title={step.iri}>
                    {step.iri === THING ? "owl:Thing" : step.label}
                  </strong>
                </span>
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
    </section>
  );
}
