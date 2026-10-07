import type { ReactNode } from "react";
export const ReasonTag = ({
  children,
  warn = false,
}: {
  children: ReactNode;
  warn?: boolean;
}) => <span className={"why" + (warn ? " warnish" : "")}>{children}</span>;
export const IdentifierTag = () => <span className="tagid">id</span>;
export const InferredTag = () => <span className="inf">inferred</span>;
export const LinkedPill = () => <span className="pill ok2">Linked</span>;
export function SaveState({
  draft = false,
  children,
}: {
  draft?: boolean;
  children?: ReactNode;
}) {
  return (
    <span className={"state" + (draft ? " pending" : "")}>
      <span className="word">{draft ? "Draft" : "Saved"}</span>
      {children}
    </span>
  );
}

/** Shared production components also form the visual token audit. */
export function IndividualsLegend() {
  return (
    <div className="legend">
      {[
        "always shown",
        "shown as Individual",
        "prefix plus :hasQID",
        "no values",
        "one value",
        "unique per row",
        "sparse",
        "identifiers",
        "29 values deep",
      ].map((t, i) => (
        <ReasonTag key={t} warn={i >= 3 && i <= 6}>
          {t}
        </ReasonTag>
      ))}
      <IdentifierTag />
      <button className="plus">+28</button>
      <span className="pred" style={{ display: "inline-flex" }}>
        rdf:type
        <InferredTag />
      </span>
      <LinkedPill />
      <SaveState />
      <SaveState draft />
      <button className="btn">Discard</button>
      <button className="btn primary">Apply changes</button>
    </div>
  );
}
