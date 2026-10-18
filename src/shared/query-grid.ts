import { shorten, type Term } from "../domain/model";

// craigtrim/axiom#88: one result presentation contract for paging, columns and CSV.
export interface QueryGridColumn {
  index: number;
  name: string;
  fill: number;
  distinct: number;
}
export interface QueryGridInfo {
  retained: boolean;
  columns: QueryGridColumn[];
  prefixes: Record<string, string>;
}
export interface QueryGridSort {
  column: number;
  direction: "asc" | "desc";
}
export function queryColumnReason(column: QueryGridColumn, rows: number) {
  return !column.fill
    ? "empty"
    : column.distinct === 1
      ? "one value"
      : column.distinct === rows && rows > 1
        ? "unique per row"
        : `${column.fill.toLocaleString("en-US")} filled, ${column.distinct.toLocaleString("en-US")} distinct`;
}
export function queryCellText(
  term: Term | null | undefined,
  prefixes: Record<string, string> = {},
) {
  if (!term) return "";
  if (term.literal) return term.value;
  for (const [prefix, iri] of Object.entries(prefixes))
    if (term.value.startsWith(iri))
      return `${prefix}:${term.value.slice(iri.length)}`;
  return shorten(term.value);
}
