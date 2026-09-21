import type { Kind } from "../domain/model";
export type FindKind = "classes" | "individuals" | "properties" | "other";
export const findKinds: FindKind[] = [
  "classes",
  "individuals",
  "properties",
  "other",
];
export interface FindFacet {
  id: string;
  label: string;
  count: number;
}
export interface FindOptions {
  text: string;
  kind: "all" | "classes" | "individuals" | "properties";
  field: "all" | "name" | "iri";
  match: "words" | "phrase" | "exact" | "cosine";
  kinds: FindKind[];
  fields: string[];
  minimumSimilarity: number;
  excludeIri: string;
  sort: "relevance" | "name" | "name-desc" | "iri";
  offset: number;
  limit: number;
}
export const defaultFindOptions: FindOptions = {
  text: "",
  kind: "all",
  field: "all",
  match: "words",
  kinds: [...findKinds],
  fields: ["name", "iri"],
  minimumSimilarity: 0,
  excludeIri: "",
  sort: "relevance",
  offset: 0,
  limit: 50,
};
export interface FindRow {
  iri: string;
  name: string;
  kind: Kind;
  identifier: string;
  description: string;
  similarity?: number;
  matchedField?: string;
  matchedValue?: string;
}
export interface FindResults {
  rows: FindRow[];
  fields: FindFacet[];
  kinds: FindFacet[];
  total: number;
  offset: number;
}
export function readFindOptions(input: unknown): FindOptions {
  const v =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const choice = <T extends string>(key: string, values: T[], fallback: T) =>
    values.includes(v[key] as T) ? (v[key] as T) : fallback;
  return {
    text: typeof v.text === "string" ? v.text.slice(0, 256) : "",
    kind: choice(
      "kind",
      ["all", "classes", "individuals", "properties"],
      "all",
    ),
    field: choice("field", ["all", "name", "iri"], "all"),
    match: choice("match", ["words", "phrase", "exact", "cosine"], "words"),
    kinds: Array.isArray(v.kinds)
      ? findKinds.filter((k) => (v.kinds as unknown[]).includes(k))
      : findKinds.filter(
          (k) =>
            !["classes", "individuals", "properties"].includes(
              String(v.kind),
            ) || k === v.kind,
        ),
    fields: Array.isArray(v.fields)
      ? [
          ...new Set(
            v.fields.filter(
              (f): f is string =>
                typeof f === "string" && f.length > 0 && f.length <= 10000,
            ),
          ),
        ].slice(0, 10000)
      : v.field === "name"
        ? ["name"]
        : v.field === "iri"
          ? ["iri"]
          : ["name", "iri"],
    minimumSimilarity:
      typeof v.minimumSimilarity === "number" &&
      Number.isFinite(v.minimumSimilarity)
        ? Math.min(1, Math.max(0, v.minimumSimilarity))
        : 0,
    excludeIri:
      typeof v.excludeIri === "string" ? v.excludeIri.slice(0, 10000) : "",
    sort: choice(
      "sort",
      ["relevance", "name", "name-desc", "iri"],
      "relevance",
    ),
    offset:
      typeof v.offset === "number" && Number.isFinite(v.offset)
        ? Math.max(0, Math.floor(v.offset))
        : 0,
    limit:
      typeof v.limit === "number" && Number.isFinite(v.limit)
        ? Math.max(1, Math.min(100, Math.floor(v.limit)))
        : 50,
  };
}
