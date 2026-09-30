import { NS, SUBCLASS, TYPE } from "../domain/model";
import type { TextAnalysisDraft, TextAnalysisClassInput } from "./text-analysis";
export interface FindStatement { id: string; predicate: string; value: string }
export interface FindCreationInput {
  label: string;
  comment: string;
  parents: string[];
  iri?: string;
  statements: FindStatement[];
}
export interface FindCollision {
  iri: string; label: string; path: string;
  kind: "exact" | "normalized" | "iri";
}
export interface FindCreationDraft extends FindCreationInput {
  labelEdited: boolean;
  sourceOpen: boolean;
  parentText: string;
}
export const emptyFindDraft = (query = ""): FindCreationDraft => ({
  label: titleCaseQuery(query), comment: "", parents: [], statements: [],
  labelEdited: false, sourceOpen: false, parentText: "",
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
export const fixedFindPredicates = [TYPE, NS.rdfs + "label", SUBCLASS, NS.rdfs + "comment"];
export const resourcePredicates = new Set([
  TYPE, SUBCLASS, NS.rdfs + "subPropertyOf", NS.owl + "equivalentClass",
  NS.rdfs + "isDefinedBy", NS.rdfs + "domain", NS.rdfs + "range",
  NS.owl + "disjointWith", NS.owl + "inverseOf",
]);
export const titleCaseQuery = (text: string) => text.replace(/\s+/gu, " ").trim().replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase());
