import { useEffect, useState } from "react";
import { NS, SUBCLASS, SUBPROPERTY, TYPE } from "../domain/model";
import { request, useSnapshot } from "./client";
import { Modal } from "./Dialogs";
import { compactIri, expandIri } from "../shared/terms";
const common = [
  TYPE,
  NS.rdfs + "label",
  NS.rdfs + "comment",
  SUBCLASS,
  SUBPROPERTY,
  NS.rdfs + "seeAlso",
  NS.rdfs + "isDefinedBy",
  NS.rdfs + "domain",
  NS.rdfs + "range",
  NS.owl + "equivalentClass",
  NS.owl + "disjointWith",
  NS.owl + "inverseOf",
  "http://www.w3.org/2004/02/skos/core#altLabel",
];
export function usePredicateOptions(current: string[]) {
  const s = useSnapshot()!;
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void request<string[]>("predicateOptions").then((values) => {
      if (active) setKnown(values);
    });
    return () => {
      active = false;
    };
  }, [s.version, s.datasetEpoch]);
  return [...new Set([...common, ...known, ...current].filter(Boolean))].sort();
}
export function PredicateSelect({
  value,
  options,
  namespace,
  label,
  disabled,
  change,
}: {
  value: string;
  options: string[];
  namespace: string;
  label: string;
  disabled?: boolean;
  change: (iri: string) => void;
}) {
  const [mode, setMode] = useState<"find" | "add" | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const choose = (iri: string) => {
    change(iri);
    setMode(null);
    setQuery("");
    setError("");
  };
  return (
    <>
      <select
        aria-label={label}
        title={value}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__find" || next === "__add") {
            setMode(next === "__find" ? "find" : "add");
            setQuery("");
            setError("");
          } else choose(next);
        }}
      >
        {!value && (
          <option value="" disabled>
            Choose predicate
          </option>
        )}
        {[...new Set([...options, ...(value ? [value] : [])])].map((iri) => (
          <option key={iri} value={iri}>
            {compactIri(iri, namespace)}
          </option>
        ))}
        <option value="__find">Find predicate…</option>
        <option value="__add">Add predicate…</option>
      </select>
      {mode && (
        <Modal
          title={mode === "find" ? "Find predicate" : "Add predicate"}
          close={() => setMode(null)}
        >
          <label>
            {mode === "find" ? "Search predicates" : "Predicate IRI"}
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {mode === "find" ? (
            <div className="predicate-results">
              {options
                .filter((iri) =>
                  (compactIri(iri, namespace) + " " + iri)
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase()),
                )
                .map((iri) => (
                  <button key={iri} onClick={() => choose(iri)} title={iri}>
                    {compactIri(iri, namespace)}
                  </button>
                ))}
            </div>
          ) : (
            <>
              {error && <p role="alert">{error}</p>}
              <footer>
                <button onClick={() => setMode(null)}>Cancel</button>
                <button
                  className="primary"
                  onClick={() => {
                    const iri = expandIri(query, namespace);
                    if (
                      !query.trim() ||
                      !/^[a-z][a-z0-9+.-]*:\S+$/i.test(iri) ||
                      iri.startsWith("_:")
                    ) {
                      setError(
                        "Enter a predicate name, prefixed name, or full IRI.",
                      );
                      return;
                    }
                    choose(iri);
                  }}
                >
                  Use predicate
                </button>
              </footer>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
