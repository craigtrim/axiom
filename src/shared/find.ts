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
  kinds: FindKind[];
  fields: string[];
  excludeIri: string;
  sort: "relevance" | "name" | "name-desc" | "iri" | "type";
  browse?: boolean;
  diagnostics?: boolean;
  revealIri?: string;
  offset: number;
  limit: number;
}
export const defaultFindOptions: FindOptions = {
  text: "",
  kind: "all",
  field: "all",
  kinds: [...findKinds],
  fields: ["name", "iri"],
  excludeIri: "",
  sort: "relevance",
  offset: 0,
  limit: 50,
};
export interface FindRow {
  synonym?: import("./find-synonyms").FindSynonymStatus;
  iri: string;
  name: string;
  kind: Kind;
  identifier: string;
  description: string;
  similarity?: number;
  matchedField?: string;
  matchedValue?: string;
  path?: string;
  aliases?: string[];
}
export interface FindRemedy {
  id: "fields" | "types" | "reset";
  count: number;
}
export interface FindResults {
  resultId?: string;
  rows: FindRow[];
  fields: FindFacet[];
  kinds: FindFacet[];
  total: number;
  offset: number;
  storeTotal?: number;
  remedies?: FindRemedy[];
  emptyCause?: "query" | "filters";
}
export function readFindOptions(input: unknown): FindOptions {
  const v =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const choice = <T extends string>(key: string, values: T[], fallback: T) =>
    values.includes(v[key] as T) ? (v[key] as T) : fallback;
  return {
    ...(v.browse === true ? { browse: true } : {}),
    ...(v.diagnostics === true ? { diagnostics: true } : {}),
    ...(typeof v.revealIri === "string" && v.revealIri
      ? { revealIri: v.revealIri.slice(0, 10000) }
      : {}),
    text: typeof v.text === "string" ? v.text.slice(0, 256) : "",
    kind: choice(
      "kind",
      ["all", "classes", "individuals", "properties"],
      "all",
    ),
    field: choice("field", ["all", "name", "iri"], "all"),
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
    excludeIri:
      typeof v.excludeIri === "string" ? v.excludeIri.slice(0, 10000) : "",
    sort: choice(
      "sort",
      ["relevance", "name", "name-desc", "iri", "type"],
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
