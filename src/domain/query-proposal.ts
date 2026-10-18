import type { Query } from "@traqula/rules-sparql-1-1";

// craigtrim/axiom#88: inspect binding scope, not variable mentions in filters or subqueries.
type Node = {
  type?: string;
  subType?: string;
  value?: string;
  [key: string]: unknown;
};
function bindings(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const child of value) bindings(child, into);
    return into;
  }
  if (!value || typeof value !== "object") return into;
  const node = value as Node;
  if (node.type === "term") {
    if (node.subType === "variable" && node.value) into.add(node.value);
    return into;
  }
  if (node.type === "query") {
    const variables = node.variables as Node[] | undefined;
    if (
      variables?.some((v) => v.subType === "wildcard" || v.type === "wildcard")
    ) {
      bindings(node.where, into);
      bindings(node.values, into);
    } else {
      for (const variable of variables ?? [])
        bindings(
          variable.subType === "bind" ? variable.variable : variable,
          into,
        );
    }
    return into;
  }
  if (node.subType === "filter" || node.subType === "minus") return into;
  if (node.subType === "bind") {
    bindings(node.variable, into);
    return into;
  }
  if (node.type === "expression") return into;
  for (const [key, child] of Object.entries(node))
    if (key !== "loc" && key !== "context" && key !== "solutionModifiers")
      bindings(child, into);
  return into;
}

export function unboundProjection(query: Query): string | undefined {
  if (query.subType !== "select") return;
  const available = bindings(query.where);
  bindings(query.values, available);
  // GROUP BY expression aliases can also be projected.
  const group = query.solutionModifiers?.group;
  if (group)
    for (const item of group.groupings)
      if ("variable" in item) bindings(item.variable, available);
  for (const variable of query.variables)
    if (
      variable.type === "term" &&
      variable.subType === "variable" &&
      !available.has(variable.value)
    )
      return variable.value;
}

/** Keep the spelling from the parsed node, including scoped subquery prefixes. */
export function proposalIriSpellings(query: Query): Map<string, string> {
  const terms = new Map<string, string>();
  function walk(
    value: unknown,
    prefixes: Record<string, string>,
    base?: string,
  ) {
    if (!value || typeof value !== "object") return;
    const node = value as Node;
    if (node.type === "query") {
      prefixes = { ...prefixes };
      for (const c of (node.context as Query["context"]) ?? []) {
        if (c.subType === "base") base = c.value.value;
        else
          prefixes[c.key] = base
            ? new URL(c.value.value, base).href
            : c.value.value;
      }
    }
    if (node.type === "term" && node.subType === "namedNode") {
      const prefixed = typeof node.prefix === "string";
      const iri = prefixed
        ? prefixes[node.prefix as string] + node.value
        : String(node.value);
      terms.set(
        base ? new URL(iri, base).href : iri,
        prefixed ? `${node.prefix}:${node.value}` : `<${node.value}>`,
      );
      return;
    }
    if (node.type === "term" && node.subType === "literal") return;
    for (const [key, child] of Object.entries(node))
      if (key !== "loc" && key !== "context") walk(child, prefixes, base);
  }
  walk(query, {});
  return terms;
}
