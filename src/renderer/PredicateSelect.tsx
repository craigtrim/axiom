import { useEffect, useState, useSyncExternalStore } from "react";
import { TYPE } from "../domain/model";
import { orderPredicates, type PredicateUsage } from "../shared/predicates";
import { request, useSnapshot } from "./client";
import { compactIri } from "../shared/terms";

let prior: { iri: string; datasetEpoch: number } | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getPrior = () => prior;

export function rememberPredicate(iri: string, datasetEpoch: number) {
  if (!iri || iri === TYPE) return;
  prior = { iri, datasetEpoch };
  for (const listener of listeners) listener();
}

export function usePredicateOptions(current: string[]) {
  const s = useSnapshot()!;
  const previous = useSyncExternalStore(subscribe, getPrior);
  const [known, setKnown] = useState<{
    datasetEpoch: number;
    values: PredicateUsage[];
  }>();
  useEffect(() => {
    let active = true;
    void request<PredicateUsage[]>("predicateOptions").then((values) => {
      if (active) setKnown({ datasetEpoch: s.datasetEpoch, values });
    });
    return () => {
      active = false;
    };
  }, [s.version, s.datasetEpoch]);
  return orderPredicates(
    current,
    known?.datasetEpoch === s.datasetEpoch ? known.values : [],
    previous?.datasetEpoch === s.datasetEpoch ? previous.iri : undefined,
  );
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
  return (
    <select
      aria-label={label}
      title={value}
      value={value}
      disabled={disabled}
      onChange={(event) => change(event.target.value)}
    >
      {!value && (
        <option value="" disabled>
          Choose predicate
        </option>
      )}
      {[...new Set([...options, ...(value ? [value] : [])])]
        .filter((iri) => !!iri && iri !== TYPE)
        .map((iri) => (
          <option key={iri} value={iri}>
            {compactIri(iri, namespace)}
          </option>
        ))}
    </select>
  );
}
