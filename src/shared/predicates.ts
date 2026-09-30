import { NS, SUBCLASS, SUBPROPERTY, TYPE } from "../domain/model";

export interface PredicateUsage {
  iri: string;
  count: number;
}

const common = [
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
  NS.skos + "altLabel",
];

export function orderPredicates(
  current: string[],
  known: PredicateUsage[],
  prior?: string,
): string[] {
  const frequent = known
    .filter(({ count }) => count > 0)
    .sort(
      (a, b) =>
        b.count - a.count || (a.iri < b.iri ? -1 : a.iri > b.iri ? 1 : 0),
    )
    .map(({ iri }) => iri);
  return [
    ...new Set([
      ...(prior ? [prior] : []),
      ...current,
      ...frequent,
      ...[...common, ...known.map(({ iri }) => iri)].sort(),
    ]),
  ].filter((iri) => !!iri && iri !== TYPE);
}
