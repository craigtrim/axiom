import { Generator } from "@traqula/generator-sparql-1-1";
import type {
  Query,
  Pattern,
  PatternGroup,
  PatternGraph,
  PatternValues,
  TermIri,
} from "@traqula/rules-sparql-1-1";
import type { Store } from "n3";
import { NS } from "./model";
const loc = { sourceLocationType: "autoGenerate" as const };
const group = (patterns: Pattern[]): PatternGroup => ({
  type: "pattern",
  subType: "group",
  patterns,
  loc,
});
const empty = (): PatternValues => ({
  type: "pattern",
  subType: "values",
  variables: [],
  values: [],
  loc,
});
/**
 * Evaluate GRAPH's inner pattern once per named graph, then join its name.
 * This preserves GRAPH scope across OPTIONAL, VALUES and aggregate subqueries.
 * Pushing the graph variable into every triple pattern changes that scope.
 */
export function scopedGraphQuery(
  parsed: Query,
  source: Store,
  original: string,
  baseIRI?: string,
): string {
  let changed = false;
  const available = source
    .getGraphs(null, null, null)
    .filter((g) => g.termType === "NamedNode")
    .map((g) => g.value);
  function visit(
    value: unknown,
    prefixes: Record<string, string>,
    base: string | undefined,
    graphs: string[],
  ): unknown {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value))
      return value.map((v) => visit(v, prefixes, base, graphs));
    const node = value as Record<string, unknown>;
    if (node.type === "query") {
      // DISTINCT is a permitted REDUCED result and preserves complete RDF term identity.
      if (node.reduced) {
        node.reduced = undefined;
        node.distinct = true;
        changed = true;
      }
      prefixes = { ...prefixes };
      for (const c of node.context as Query["context"]) {
        if (c.subType === "base")
          base = base ? new URL(c.value.value, base).href : c.value.value;
        else
          prefixes[c.key] = base
            ? new URL(c.value.value, base).href
            : c.value.value;
      }
      const datasets = (node.datasets as Query["datasets"]).clauses;
      if (datasets.length)
        graphs = datasets
          .filter((d) => d.clauseType === "named")
          .map((d) => resolve(d.value, prefixes, base))
          .filter((g) => available.includes(g));
    }
    if (node.type === "pattern" && node.subType === "graph") {
      changed = true;
      const g = node as unknown as PatternGraph;
      const patterns = visit(g.patterns, prefixes, base, graphs) as Pattern[];
      if (g.name.subType !== "variable") {
        const iri = resolve(g.name, prefixes, base);
        return graphs.includes(iri) ? { ...g, patterns } : group([g, empty()]);
      }
      const branches = graphs.map((iri) => {
        const name: TermIri = {
          type: "term",
          subType: "namedNode",
          value: iri,
          loc,
        };
        const values: PatternValues = {
          type: "pattern",
          subType: "values",
          variables: [g.name as PatternValues["variables"][number]],
          values: [{ [g.name.value]: name }],
          loc,
        };
        return group([{ ...g, name, patterns }, values]);
      });
      return branches.length
        ? branches.length === 1
          ? branches[0]
          : { type: "pattern", subType: "union", patterns: branches, loc }
        : group([g, empty()]);
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        key === "loc" || key === "context"
          ? child
          : visit(child, prefixes, base, graphs),
      ]),
    );
  }
  const rewritten = visit(parsed, { ...NS }, baseIRI, available) as Query;
  return changed ? new Generator().generate(rewritten) : original;
}
function resolve(
  term: TermIri,
  prefixes: Record<string, string>,
  base?: string,
) {
  const iri =
    "prefix" in term ? prefixes[term.prefix] + term.value : term.value;
  return base ? new URL(iri, base).href : iri;
}
