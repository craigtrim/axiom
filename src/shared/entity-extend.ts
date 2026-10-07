import { THING, type Kind } from "../domain/model";
import { findSynonymText, type FindSynonymStatus } from "./find-synonyms";
import type { FindCreationKind } from "./find-create";

export interface ExtendRelation {
  door: "subclass" | "sibling" | "instance" | "subproperty";
  label: string;
  predicate: string;
  kind: FindCreationKind;
}
export type ExtendAction = "synonym" | ExtendRelation["door"];
export type ExtendGroup = "classes" | "properties" | "individuals" | "other";
export type ExtendPreferences = Partial<Record<ExtendGroup, ExtendAction>>;
export const extendPreferencesKey = "find.extendActions";
export const defaultExtendPreferences: ExtendPreferences = {};
export function extendGroup(kind: Kind): ExtendGroup {
  return kind === "Class" || kind === "Defined"
    ? "classes"
    : kind.endsWith("Property")
      ? "properties"
      : kind === "Individual"
        ? "individuals"
        : "other";
}
export function readExtendPreferences(input: unknown): ExtendPreferences {
  const result: ExtendPreferences = {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    return result;
  const allowed: Record<ExtendGroup, ExtendAction[]> = {
    classes: ["synonym", "subclass", "sibling", "instance"],
    properties: ["synonym", "subproperty"],
    individuals: ["synonym"],
    other: ["synonym"],
  };
  for (const group of Object.keys(allowed) as ExtendGroup[]) {
    const value = (input as ExtendPreferences)[group];
    if (value && allowed[group].includes(value)) result[group] = value;
  }
  return result;
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
  preferred: ExtendAction = "synonym",
  iri?: string,
) {
  const synonym = !!findSynonymText(query) && status !== undefined;
  const relations = extendRelations(kind).filter(
    (relation) => relation.door !== "sibling" || iri !== THING,
  );
  const actions: ExtendAction[] = [
    ...(synonym ? ["synonym" as const] : []),
    ...relations.map((relation) => relation.door),
  ];
  const primary = actions.includes(preferred) ? preferred : actions[0];
  const form = !primary ? "empty" : actions.length > 1 ? "split" : "main";
  return { synonym, relations, primary, form } as const;
}
