import { installQueryCompatibility } from "./query-compat";
import { QueryEngine } from "@comunica/query-sparql-rdfjs";
import { Store as RdfStore, DataFactory } from "n3";
import type * as RDF from "@rdfjs/types";
import { scopedGraphQuery } from "./query-graphs";
import { parseQuery, queryPrologue, QueryError } from "./query-parser";
import {
  iriTerm,
  literal,
  termDatatype,
  type Term,
  type Triple,
} from "./model";
import type { Store } from "./store";
export { parseQuery, QueryError } from "./query-parser";
export const QUERY_ROW_LIMIT = 200000;
export interface QueryResult {
  queryType: "SELECT" | "ASK" | "CONSTRUCT" | "DESCRIBE";
  columns: string[];
  rows: (Term | null)[][];
  total: number;
  capped: boolean;
  iris: string[];
  milliseconds: number;
  storeVersion: number;
}
const rdf = DataFactory;
const resource = (value: string) =>
  value.startsWith("_:") ? rdf.blankNode(value.slice(2)) : rdf.namedNode(value);
export function toQueryQuad(t: Triple): RDF.Quad {
  return rdf.quad(
    resource(t.subject),
    rdf.namedNode(t.predicate),
    t.object.literal
      ? rdf.literal(
          t.object.value,
          t.object.language || rdf.namedNode(termDatatype(t.object)),
        )
      : resource(t.object.value),
    t.graph ? resource(t.graph) : rdf.defaultGraph(),
  );
}
export function fromQueryTerm(t: RDF.Term): Term {
  if (t.termType === "Literal")
    return {
      value: t.value,
      literal: true,
      datatype: t.datatype.value,
      ...(t.language ? { language: t.language } : {}),
    };
  return iriTerm(t.termType === "BlankNode" ? "_:" + t.value : t.value);
}
export function queryStore(triples: Iterable<Triple>) {
  const store = new RdfStore();
  for (const t of triples) store.addQuad(toQueryQuad(t));
  return store;
}
let engine: QueryEngine | undefined;
export const queryEngine = () => {
  installQueryCompatibility();
  return (engine ??= new QueryEngine());
};
export const localQueryContext = (store: RdfStore, baseIRI?: string) => ({
  sources: [store],
  baseIRI,
  lenient: false,
  // FROM selects local named graphs. This flow never retrieves remote data.
  fetch: async () => {
    throw Error(
      "Remote SERVICE and document retrieval are unavailable in local queries.",
    );
  },
});
/** Stream completed solutions, preserving lexical values, unbound cells and RDF identity. */
export async function evaluateQuery(
  store: RdfStore,
  text: string,
  storeVersion = 0,
  options: { baseIRI?: string; cap?: number; signal?: AbortSignal } = {},
): Promise<QueryResult> {
  const started = performance.now(),
    signal = options.signal;
  if (signal?.aborted) throw Error("Query cancelled.");
  const parsed = parseQuery(text, options.baseIRI),
    cap = options.cap ?? QUERY_ROW_LIMIT;
  const queryType = parsed.subType.toUpperCase() as QueryResult["queryType"];
  let columns: string[],
    rows: (Term | null)[][] = [],
    capped = false;
  try {
    const query = await queryEngine().query(
      queryPrologue + scopedGraphQuery(parsed, store, text, options.baseIRI),
      localQueryContext(store, options.baseIRI),
    );
    if (signal?.aborted) throw Error("Query cancelled.");
    if (query.resultType === "boolean") {
      columns = ["?boolean"];
      rows = [[literal(await query.execute(), "boolean")]];
    } else if (query.resultType === "bindings") {
      const meta = await query.metadata();
      columns = meta.variables.map((v) => "?" + v.value);
      const stream = await query.execute();
      const abort = () => stream.destroy(Error("Query cancelled."));
      signal?.addEventListener("abort", abort, { once: true });
      try {
        for await (const binding of stream) {
          if (rows.length === cap) {
            capped = true;
            break;
          }
          rows.push(
            meta.variables.map((v) => {
              const term = binding.get(v);
              return term ? fromQueryTerm(term) : null;
            }),
          );
        }
      } finally {
        signal?.removeEventListener("abort", abort);
        stream.destroy();
      }
    } else if (query.resultType === "quads") {
      columns = ["?subject", "?predicate", "?object"];
      const stream = await query.execute(),
        seen = new RdfStore();
      const abort = () => stream.destroy(Error("Query cancelled."));
      signal?.addEventListener("abort", abort, { once: true });
      try {
        for await (const q of stream) {
          if (seen.has(q)) continue;
          if (rows.length === cap) {
            capped = true;
            break;
          }
          seen.addQuad(q);
          rows.push([
            fromQueryTerm(q.subject),
            fromQueryTerm(q.predicate),
            fromQueryTerm(q.object),
          ]);
        }
      } finally {
        signal?.removeEventListener("abort", abort);
        stream.destroy();
      }
    } else throw Error("The query panel does not modify the ontology.");
  } catch (error) {
    throw new QueryError((error as Error).message);
  }
  if (signal?.aborted) throw Error("Query cancelled.");
  return {
    queryType,
    columns,
    rows,
    total: rows.length,
    capped,
    iris: [
      ...new Set(
        rows.flatMap((row) =>
          row.flatMap((t) => (t && !t.literal ? [t.value] : [])),
        ),
      ),
    ],
    milliseconds: performance.now() - started,
    storeVersion,
  };
}
export async function executeQuery(
  store: Store,
  text: string,
  signal?: AbortSignal,
): Promise<QueryResult> {
  if (signal?.aborted) throw Error("Query cancelled.");
  const started = performance.now();
  const result = await evaluateQuery(
    queryStore(store.scan()),
    text,
    store.version,
    { signal },
  );
  result.milliseconds = performance.now() - started;
  return result;
}
