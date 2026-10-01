export const MAX_ANALYSIS_TEXT = 100_000;
export interface TextAnalysisInput {
  text: string;
  datasetEpoch: number;
  version: number;
}
export interface TextAnalysisConcept {
  iri: string;
  label: string;
  kind: import("../domain/model").Kind;
  comment: string;
  parents: { iri: string; label: string }[];
  taxonomy: boolean;
}
export interface TextAnalysisContext {
  concepts?: Record<string, TextAnalysisConcept[]>;
  turtle: string;
  name: string;
  datasetEpoch: number;
  version: number;
}
export interface TextEntity {
  start: number;
  end: number;
  key: string;
  label: string;
  source: "ontology" | "model";
  method: string;
}
export interface TextAnalysisResult {
  concepts?: Record<string, TextAnalysisConcept[]>;
  text: string;
  canonical: string;
  entities: TextEntity[];
  milliseconds: number;
  datasetEpoch: number;
  version: number;
  superseded?: boolean;
}
export function entityHue(key: string): number {
  let hash = 2166136261;
  for (const ch of key) hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619);
  return (hash >>> 0) % 360;
}

export interface TextAnalysisParent {
  iri: string;
  label: string;
  matchedText: string;
}
export interface TextAnalysisDraft {
  label: string;
  parents: TextAnalysisParent[];
  existing: { iri: string; label: string; openable?: boolean }[];
  defaultParent: string;
  datasetEpoch: number;
  version: number;
}

export interface TextAnalysisClassInput {
  label: string;
  comment: string;
  parents: ({ iri: string } | { create: TextAnalysisClassInput })[];
  iri?: string;
  statements?: { predicate: string; object: import("../domain/model").Term }[];
  checkAllEntities?: boolean;
}

/** Native names can identify several IRIs; model annotations have no ontology target. */
export function textEntityConcepts(
  result: TextAnalysisResult,
  entity: TextEntity,
): TextAnalysisConcept[] {
  return entity.source === "ontology" &&
    result.concepts &&
    Object.hasOwn(result.concepts, entity.label)
    ? result.concepts[entity.label]
    : [];
}
