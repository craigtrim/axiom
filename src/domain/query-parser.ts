import { Parser } from "@traqula/parser-sparql-1-1";
import type { Query } from "@traqula/rules-sparql-1-1";
import { NS } from "./model";
export class QueryError extends Error {
  constructor(
    message: string,
    public hint = "Check the SPARQL syntax and declared prefixes.",
  ) {
    super(message);
    this.name = "QueryError";
  }
}
let parser: Parser | undefined;
export function parseSparql(text: string, baseIRI?: string) {
  try {
    return (parser ??= new Parser()).parse(text, {
      prefixes: { ...NS },
      baseIRI,
    });
  } catch (error) {
    throw new QueryError((error as Error).message);
  }
}
export function parseQuery(text: string, baseIRI?: string): Query {
  const parsed = parseSparql(text, baseIRI);
  if (parsed.type !== "query")
    throw new QueryError(
      "Use SELECT, ASK, CONSTRUCT or DESCRIBE. The query panel does not modify the ontology.",
    );
  return parsed;
}
export function queryIris(query: Query): string[] {
  const result = new Set<string>();
  function visit(
    value: unknown,
    prefixes: Record<string, string>,
    base?: string,
  ) {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "query") {
      prefixes = { ...prefixes };
      for (const c of node.context as Query["context"]) {
        if (c.subType === "base") base = c.value.value;
        else
          prefixes[c.key] = base
            ? new URL(c.value.value, base).href
            : c.value.value;
      }
    }
    if (node.type === "term" && node.subType === "namedNode") {
      const iri =
        typeof node.prefix === "string"
          ? prefixes[node.prefix] + node.value
          : String(node.value);
      result.add(base ? new URL(iri, base).href : iri);
      return;
    }
    if (node.type === "term" && node.subType === "literal") return;
    for (const [key, child] of Object.entries(node))
      if (key !== "context" && key !== "loc") visit(child, prefixes, base);
  }
  visit(query, { ...NS });
  return [...result];
}
export const queryPrologue =
  Object.entries(NS)
    .map(([key, value]) => "PREFIX " + key + ": <" + value + ">")
    .join("\n") + "\n";
