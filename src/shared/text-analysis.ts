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
  // craigtrim/axiom#136: provenance is optional for older or synthetic results.
  matchedWords?: string[];
  covered?: string[];
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
  similar?: import("./find-create").FindCollision[];
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
  /** Find warns about normalized names, while exact labels and occupied IRIs still block. */
  allowSimilarName?: boolean;
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

// craigtrim/axiom#136: hover and annotation Details share one plain-text explanation.
export function textMatchExplanation(entity: TextEntity): string {
  if (entity.source === "model") return "Named entity";
  if (entity.method === "exact") return "Exact phrase";
  if (entity.method === "spans")
    return (
      "Words found near each other" +
      (entity.matchedWords?.length ? ": " + entity.matchedWords.join(", ") : "")
    );
  return "Ontology match";
}
export function textEntityLabels(
  result: TextAnalysisResult,
  entity: TextEntity,
): string[] {
  const concepts = textEntityConcepts(result, entity);
  return concepts.length
    ? concepts.map((concept) => concept.label)
    : [entity.label];
}
export function textCoveredLabels(
  result: TextAnalysisResult,
  entity: TextEntity,
): string[] {
  return [
    ...new Set(
      (entity.source === "ontology" ? (entity.covered ?? []) : [])
        .filter((label) => label !== entity.label)
        .flatMap((label) => textEntityLabels(result, { ...entity, label })),
    ),
  ];
}
export function textEntityHover(
  result: TextAnalysisResult,
  entity: TextEntity,
): string {
  const covered = textCoveredLabels(result, entity);
  return [
    ...textEntityLabels(result, entity),
    textMatchExplanation(entity),
    ...(covered.length ? ["Covers: " + covered.join(", ")] : []),
    "Ctrl+click for Details",
  ]
    .map((line) =>
      line
        .replace(/&/g, "&amp;")
        .replace(/\s+/g, " ")
        .replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, "\\$&"),
    )
    .join("  \n");
}
