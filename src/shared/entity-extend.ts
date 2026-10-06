import type { Kind } from "../domain/model";
import { findSynonymText, type FindSynonymStatus } from "./find-synonyms";
import type { FindCreationKind } from "./find-create";

export interface ExtendRelation {
  door: "subclass" | "sibling" | "instance" | "subproperty";
  label: string;
  predicate: string;
  kind: FindCreationKind;
}
export function extendRelations(kind: Kind): ExtendRelation[] {
  if (kind === "Class" || kind === "Defined")
    return [
      {
        door: "subclass",
        label: "Subclass",
        predicate: "rdfs:subClassOf",
        kind: "Class",
      },
      {
        door: "sibling",
        label: "Sibling",
        predicate: "rdfs:subClassOf",
        kind: "Class",
      },
      {
        door: "instance",
        label: "Instance",
        predicate: "rdf:type",
        kind: "Individual",
      },
    ];
  if (
    kind === "ObjectProperty" ||
    kind === "DataProperty" ||
    kind === "AnnotationProperty"
  )
    return [
      {
        door: "subproperty",
        label: "Subproperty",
        predicate: "rdfs:subPropertyOf",
        kind,
      },
    ];
  return [];
}
export function extendControl(
  kind: Kind,
  query: string,
  status: FindSynonymStatus | undefined,
  narrow: boolean,
  added = false,
) {
  const synonym = !!findSynonymText(query) && status === "available" && !added;
  const relations = extendRelations(kind);
  const form =
    !synonym && !relations.length
      ? "empty"
      : narrow || !synonym
        ? "folded"
        : relations.length
          ? "split"
          : "main";
  return { synonym, relations, form } as const;
}
