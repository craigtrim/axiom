import { NS, termDatatype, type Term } from "./model";
import { parseQuery } from "./query-parser";
import type { QueryResult } from "./query";
import {
  queryCellText,
  type QueryGridColumn,
  type QueryGridSort,
} from "../shared/query-grid";

// craigtrim/axiom#88: compute statistics and stable ordering over all retained rows in the worker.
const views = new WeakMap<QueryResult, QueryGridView>();
const numeric =
  /^(?:decimal|double|float|integer|nonPositiveInteger|negativeInteger|long|int|short|byte|nonNegativeInteger|unsignedLong|unsignedInt|unsignedShort|unsignedByte|positiveInteger)$/;
const numericValue = (term: Term) =>
  term.literal &&
  termDatatype(term).startsWith(NS.xsd) &&
  numeric.test(termDatatype(term).slice(NS.xsd.length)) &&
  term.value.trim() !== ""
    ? Number(term.value)
    : NaN;

export class QueryGridView {
  readonly columns: QueryGridColumn[];
  readonly prefixes: Record<string, string> = {};
  private orderKey = "";
  private sorted: number[] = [];
  constructor(
    readonly result: QueryResult,
    text: string,
  ) {
    let base: string | undefined;
    for (const item of parseQuery(text).context) {
      if (item.subType === "base") base = item.value.value;
      else
        this.prefixes[item.key] = base
          ? new URL(item.value.value, base).href
          : item.value.value;
    }
    this.columns = result.columns.map((name, index) => {
      let fill = 0;
      const distinct = new Set<string>();
      for (const row of result.rows) {
        const term = row[index];
        if (!term) continue;
        fill++;
        distinct.add(
          JSON.stringify([
            term.literal,
            term.value,
            term.literal ? termDatatype(term) : "",
            term.language?.toLowerCase() ?? "",
          ]),
        );
      }
      return { index, name, fill, distinct: distinct.size };
    });
  }
  order(sort?: QueryGridSort) {
    if (
      !sort ||
      !Number.isInteger(sort.column) ||
      !this.columns[sort.column] ||
      !["asc", "desc"].includes(sort.direction)
    )
      return undefined;
    const key = `${sort.column}:${sort.direction}`;
    if (key !== this.orderKey) {
      const direction = sort.direction === "desc" ? -1 : 1;
      this.sorted = this.result.rows
        .map((_, i) => i)
        .sort((a, b) => {
          const x = this.result.rows[a][sort.column],
            y = this.result.rows[b][sort.column];
          if (!x || !y) return (!x && !y ? 0 : !x ? 1 : -1) || a - b;
          const xn = numericValue(x),
            yn = numericValue(y);
          const left = queryCellText(x, this.prefixes),
            right = queryCellText(y, this.prefixes);
          const compared =
            !Number.isNaN(xn) && !Number.isNaN(yn)
              ? xn < yn
                ? -1
                : xn > yn
                  ? 1
                  : 0
              : left < right
                ? -1
                : left > right
                  ? 1
                  : 0;
          return compared * direction || a - b;
        });
      this.orderKey = key;
    }
    return this.sorted;
  }
  page(start: number, end: number, sort?: QueryGridSort) {
    const order = this.order(sort);
    return order
      ? order.slice(start, end).map((i) => this.result.rows[i])
      : this.result.rows.slice(start, end);
  }
  csv(shown: number[], sort?: QueryGridSort) {
    if (
      !Array.isArray(shown) ||
      !shown.length ||
      new Set(shown).size !== shown.length ||
      shown.some((i) => !Number.isInteger(i) || !this.columns[i])
    )
      throw Error("Choose at least one result column.");
    const quote = (value: string) =>
      /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    return (
      [
        shown.map((i) => quote(this.columns[i].name)).join(","),
        ...this.page(0, this.result.rows.length, sort).map((row) =>
          shown
            .map((i) => quote(queryCellText(row[i], this.prefixes)))
            .join(","),
        ),
      ].join("\r\n") + "\r\n"
    );
  }
}
export function queryGridView(result: QueryResult, text: string) {
  let view = views.get(result);
  if (!view) {
    view = new QueryGridView(result, text);
    views.set(result, view);
  }
  return view;
}
