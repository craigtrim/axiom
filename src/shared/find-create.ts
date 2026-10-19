import { NS, SUBCLASS, TYPE, SUBPROPERTY, type Kind } from "../domain/model";
import type {
  TextAnalysisDraft,
  TextAnalysisClassInput,
} from "./text-analysis";
export interface FindStatement {
  id: string;
  predicate: string;
  value: string;
}
export interface FindCreationInput {
  kind?: FindCreationKind;
  label: string;
  comment: string;
  parents: string[];
  iri?: string;
  statements: FindStatement[];
}
export const findCreationKinds = [
  "Class",
  "Individual",
  "ObjectProperty",
  "DataProperty",
  "AnnotationProperty",
] as const;
export type FindCreationKind = (typeof findCreationKinds)[number];
export const creationType = (kind: FindCreationKind) =>
  NS.owl +
  {
    Class: "Class",
    Individual: "NamedIndividual",
    ObjectProperty: "ObjectProperty",
    DataProperty: "DatatypeProperty",
    AnnotationProperty: "AnnotationProperty",
  }[kind];
export const creationNoun = (kind: FindCreationKind) =>
  kind === "Class"
    ? "class"
    : kind === "Individual"
      ? "individual"
      : "property";
export const creationRelation = (kind: FindCreationKind) =>
  kind === "Class" ? SUBCLASS : kind === "Individual" ? TYPE : SUBPROPERTY;
export const creationTargetMatches = (
  kind: FindCreationKind,
  target: { iri: string; kind: Kind },
) =>
  !target.iri.startsWith("_:") &&
  (kind === "Class" || kind === "Individual"
    ? ["Class", "Defined"].includes(target.kind)
    : target.kind === kind);
export interface FindCollision {
  iri: string;
  label: string;
  path: string;
  kind: "exact" | "normalized" | "iri";
  openable?: boolean;
}
// #127: new-class offers keep their own constraints; synonyms accept literal queries.
function findCreationText(input: string): string | undefined {
  const text = input.trim();
  if (!text || text.length > 256) return;
  if (
    /(?:^|\s)[\p{L}_][\p{L}\p{N}_-]*(?::[\p{L}_][\p{L}\p{N}_-]*)?:/u.test(
      text,
    ) ||
    /^<[^>]+>$|^\/.*\/[a-z]*$/iu.test(text) ||
    /[\\^$*|]|\[[^\]]*\]|\(\?|\.\+|\{\d+(?:,\d*)?\}/u.test(text)
  )
    return;
  return text;
}

/** Result count never decides whether a query can name a new class. */
export function findCreationOffer(query: string, collisions: FindCollision[]) {
  const text = findCreationText(query);
  const label = text ? titleCaseQuery(text) : "";
  const collision = collisions.find((item) => item.kind !== "normalized");
  return {
    label,
    visible: !!text,
    enabled: !!text && !collision,
    title: collision
      ? `${collision.label} already exists`
      : `Add "${label}" as a new class`,
  };
}
export interface FindCreationDraft extends FindCreationInput {
  origin?: {
    door: "header" | "subclass" | "sibling" | "instance" | "subproperty";
    target?: string;
  };
  labelEdited: boolean;
  sourceOpen: boolean;
  parentText: string;
}
export const emptyFindDraft = (query = ""): FindCreationDraft => ({
  label: titleCaseQuery(query),
  comment: "",
  parents: [],
  statements: [],
  labelEdited: false,
  sourceOpen: false,
  parentText: "",
});
export interface FindCreationPreview extends TextAnalysisDraft {
  creation: TextAnalysisClassInput;
  statementCount: number;
  iri: string;
  source: string;
  storeTotal: number;
  collisions: FindCollision[];
  errors: { field: string; message: string }[];
}
export const fixedFindPredicates = [
  TYPE,
  NS.rdfs + "label",
  SUBCLASS,
  NS.rdfs + "comment",
  SUBPROPERTY,
];
export const resourcePredicates = new Set([
  TYPE,
  SUBCLASS,
  NS.rdfs + "subPropertyOf",
  NS.owl + "equivalentClass",
  NS.rdfs + "isDefinedBy",
  NS.rdfs + "domain",
  NS.rdfs + "range",
  NS.owl + "disjointWith",
  NS.owl + "inverseOf",
]);
export const titleCaseQuery = (text: string) =>
  text
    .replace(/\s+/gu, " ")
    .trim()
    .replace(
      /(^|\s)(\p{L})/gu,
      (_, space, letter) => space + letter.toUpperCase(),
    );
