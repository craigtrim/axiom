import type { Kind } from "../domain/model";
export interface FindOptions {
  text: string;
  kind: "all" | "classes" | "individuals" | "properties";
  field: "all" | "name" | "iri";
  match: "words" | "phrase" | "exact";
  sort: "relevance" | "name" | "name-desc" | "iri";
  offset: number;
  limit: number;
}
export const defaultFindOptions: FindOptions = {
  text: "",
  kind: "all",
  field: "all",
  match: "words",
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
}
export interface FindResults {
  rows: FindRow[];
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
    match: choice("match", ["words", "phrase", "exact"], "words"),
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
