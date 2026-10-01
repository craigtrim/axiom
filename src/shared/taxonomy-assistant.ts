import type { AssistantId } from "./assistant";
export { buildTaxonomyPrompt } from "./taxonomy-language";
import { buildTaxonomyPrompt, readTaxonomyReply } from "./taxonomy-language";
import type { Entity } from "../domain/model";
import { identifier, validLabel } from "../domain/rdf-model";
import { entityNameKey } from "./entity-names";

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
  ontology: { name: string; namespace: string; iri?: string };
  names?: Record<string, string>;
  selected: TaxonomyTerm;
  ancestors: TaxonomyTerm[];
  ancestorLinks: TaxonomyLink[];
  roots: string[];
  directChildren: string[];
  childTerms?: TaxonomyTerm[];
  sample?: { children: number; descendants: number };
  descendants: (TaxonomyTerm & { depth: number })[];
  descendantLinks: TaxonomyLink[];
  existingInstances: { iri: string; label: string; types: string[] }[];
  existingInstanceCount: number;
}
/** Choose once per run, without replacement. Saved contexts are never resampled. */
export function sampleTaxonomyContext(
  context: TaxonomyContext,
  random = Math.random,
): TaxonomyContext {
  if (context.sample) return context;
  const sample = <T>(items: T[]): T[] => {
    if (items.length <= 20) return [...items];
    const indices = items.map((_, index) => index);
    for (let i = 0; i < 20; i++) {
      const pick = i + Math.floor(random() * (indices.length - i));
      [indices[i], indices[pick]] = [indices[pick], indices[i]];
    }
    return indices
      .slice(0, 20)
      .sort((a, b) => a - b)
      .map((i) => items[i]);
  };
  const directChildren = sample(context.directChildren);
  const descendants = sample(context.descendants);
  const terms = new Map(context.descendants.map((term) => [term.iri, term]));
  const included = new Set([
    context.selected.iri,
    ...context.ancestors.map((term) => term.iri),
    ...directChildren,
    ...descendants.map((term) => term.iri),
  ]);
  const result: TaxonomyContext = {
    ...context,
    directChildren,
    childTerms: directChildren.flatMap((iri) =>
      terms.has(iri) ? [terms.get(iri)!] : [],
    ),
    descendants,
    descendantLinks: context.descendantLinks.filter(
      (link) => included.has(link.child) && included.has(link.parent),
    ),
    sample: {
      children: context.directChildren.length,
      descendants: context.descendants.length,
    },
  };
  if (buildTaxonomyPrompt(result).length > 140000)
    throw Error("The sampled context is too large. Select a narrower class.");
  return result;
}

const ordered = (values: string[]) => JSON.stringify([...values].sort());
const axioms = (term: TaxonomyTerm) =>
  JSON.stringify({
    disjoint: [...term.disjoint].sort(),
    restrictions: term.restrictions,
    equivalents: term.equivalents,
  });
const ancestry = (context: TaxonomyContext) =>
  JSON.stringify({
    ancestors: context.ancestors.map((t) => t.iri + " " + t.label).sort(),
    links: context.ancestorLinks.map((l) => l.child + " " + l.parent).sort(),
    roots: [...context.roots].sort(),
  });
/**
 * Report only the edits that change what the assistant was asked about: the
 * selected class itself and the branch above it. Unrelated statements, new
 * siblings and edits elsewhere in the ontology leave a run usable, and new
 * children are caught by the duplicate checks when suggestions are added.
 */
export function taxonomyDrift(
  original: TaxonomyContext,
  current: TaxonomyContext,
): string {
  const before = original.selected,
    after = current.selected,
    name = before.label;
  if (after.label !== before.label)
    return (
      'This class is now named "' +
      after.label +
      '". These suggestions were made for "' +
      name +
      '".'
    );
  if (after.comment !== before.comment)
    return "The description of " + name + " changed after this run.";
  if (ordered(before.parents) !== ordered(after.parents))
    return "The parents of " + name + " changed after this run.";
  if (axioms(before) !== axioms(after))
    return "The axioms on " + name + " changed after this run.";
  if (ancestry(original) !== ancestry(current))
    return "The classes above " + name + " changed after this run.";
  return "";
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
  bypassCache?: boolean;
  provider?: AssistantId;
  id: string;
  iri: string;
  mode: TaxonomyMode;
  datasetEpoch: number;
  version: number;
}
export interface TaxonomyResponse {
  cache?: import("./assistant").AssistantCacheInfo;
  provider?: AssistantId;
  id: string;
  context: TaxonomyContext;
  result: TaxonomyResult;
  issues: (string | null)[];
  completedAt: string;
}
export interface TaxonomyHistoryEntry {
  id: string;
  auditId?: string;
  session: string;
  provider: AssistantId;
  startedAt: number;
  completedAt?: string;
  state: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  context: TaxonomyContext;
  prompt: string;
  response?: TaxonomyResponse;
  error?: string;
  applied: number[];
  // Full local context verifies sampled runs and permits applying remaining suggestions.
  reviewContext?: TaxonomyContext;
}
export interface TaxonomyHistorySummary {
  id: string;
  iri: string;
  label: string;
  namespace: string;
  mode: TaxonomyMode;
  provider: AssistantId;
  startedAt: number;
  state: TaxonomyHistoryEntry["state"];
  applied: number;
  count: number;
}
export interface TaxonomyHistoryReview {
  entry: TaxonomyHistoryEntry;
  /** Why these suggestions can no longer be added at all; empty when they can. */
  blocked: string;
  /** Why the class no longer matches what was asked. Advisory: adding still works. */
  drift: string;
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
export const taxonomyNameKey = entityNameKey;
