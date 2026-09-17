import type { AssistantId } from "./research";
export { buildTaxonomyPrompt } from "./taxonomy-language";
import { readTaxonomyReply } from "./taxonomy-language";
import type { Entity } from "../domain/model";
import { identifier, validLabel } from "../domain/rdf-model";

export type TaxonomyMode = "children" | "instances";
export interface TaxonomyTerm {
  iri: string;
  label: string;
  comment: string;
  parents: string[];
  restrictions: Entity["restrictions"];
  equivalents: Entity["equivalents"];
  disjoint: string[];
}
export interface TaxonomyLink {
  child: string;
  parent: string;
}
export interface TaxonomyContext {
  datasetEpoch: number;
  version: number;
  mode: TaxonomyMode;
  ontology: { name: string; namespace: string };
  names?: Record<string, string>;
  selected: TaxonomyTerm;
  ancestors: TaxonomyTerm[];
  ancestorLinks: TaxonomyLink[];
  roots: string[];
  directChildren: string[];
  descendants: (TaxonomyTerm & { depth: number })[];
  descendantLinks: TaxonomyLink[];
  existingInstances: { iri: string; label: string; types: string[] }[];
  existingInstanceCount: number;
}
export interface TaxonomySuggestion {
  kind: "class" | "individual";
  label: string;
  definition: string;
  reason: string;
  parentIri: string;
}
export interface TaxonomyResult {
  summary: string;
  suggestions: TaxonomySuggestion[];
}
export interface TaxonomyRequest {
  provider?: AssistantId;
  id: string;
  iri: string;
  mode: TaxonomyMode;
  datasetEpoch: number;
  version: number;
}
export interface TaxonomyResponse {
  provider?: AssistantId;
  id: string;
  context: TaxonomyContext;
  result: TaxonomyResult;
  issues: (string | null)[];
  completedAt: string;
}
export interface TaxonomyStatus {
  provider?: AssistantId;
  running: boolean;
  startedAt?: number;
  activeEntity?: string;
  mode?: TaxonomyMode;
  cancelling?: boolean;
  id?: string;
  response?: TaxonomyResponse;
  error?: string;
}
export function taxonomyMode(value: unknown): TaxonomyMode {
  if (value !== "children" && value !== "instances")
    throw Error("Choose direct children or instances.");
  return value;
}
export function parseTaxonomyResult(raw: unknown): TaxonomyResult {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw Error("The assistant did not return a valid taxonomy proposal.");
    }
  }
  const value = raw as TaxonomyResult;
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.summary !== "string" ||
    value.summary.length > 12000 ||
    !Array.isArray(value.suggestions) ||
    value.suggestions.length > 12
  )
    throw Error("The assistant returned an invalid taxonomy proposal.");
  const suggestions = value.suggestions.map((s) => {
    if (
      !s ||
      !["class", "individual"].includes(s.kind) ||
      typeof s.definition !== "string" ||
      !s.definition.trim() ||
      s.definition.length > 4000 ||
      typeof s.reason !== "string" ||
      !s.reason.trim() ||
      s.reason.length > 4000 ||
      typeof s.parentIri !== "string" ||
      !s.parentIri ||
      s.parentIri.length > 10000
    )
      throw Error("The assistant returned an incomplete taxonomy suggestion.");
    const label = validLabel(s.label);
    if (!/[\p{L}\p{N}]/u.test(label))
      throw Error("A suggested label needs letters or numbers.");
    return {
      kind: s.kind,
      label,
      definition: s.definition.trim(),
      reason: s.reason.trim(),
      parentIri: s.parentIri,
    };
  });
  return { summary: value.summary.trim(), suggestions };
}
/** Bind plain-language suggestions to the captured request entirely in Axiom. */
export function parseTaxonomyReply(
  raw: unknown,
  context: TaxonomyContext,
): TaxonomyResult {
  const reply = readTaxonomyReply(raw);
  return parseTaxonomyResult({
    summary: reply.summary,
    suggestions: reply.suggestions.map((s) => ({
      ...s,
      kind: context.mode === "children" ? "class" : "individual",
      parentIri: context.selected.iri,
    })),
  });
}
// The same normalization used when minting IRIs also detects spelling collisions.
export const taxonomyNameKey = (name: string) =>
  identifier(name).toLocaleLowerCase();
