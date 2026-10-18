import { NS, shorten } from "../domain/model";

// craigtrim/axiom#88: deterministic Fields authoring remains independent of an agent.
export interface QueryFields {
  datasetEpoch: number;
  version: number;
  namespace: string;
  classes: { iri: string; label: string }[];
  predicates: { iri: string; count: number }[];
}
export function writeQueryFields(
  fields: QueryFields,
  input: {
    subject: string;
    predicate: string;
    value: string;
    limit: string;
  },
) {
  if (!fields.predicates.some((p) => p.iri === input.predicate))
    throw Error("Choose a predicate from the open ontology.");
  if (input.subject && !fields.classes.some((c) => c.iri === input.subject))
    throw Error("Choose a class from the open ontology.");
  const term = (iri: string) => {
    const local =
      fields.namespace && iri.startsWith(fields.namespace)
        ? iri.slice(fields.namespace.length)
        : "";
    return local &&
      /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(local) &&
      !local.endsWith(".")
      ? ":" + local
      : shorten(iri);
  };
  const lines = [`PREFIX rdfs: <${NS.rdfs}>`, `PREFIX : <${fields.namespace}>`];
  const used = [input.subject, input.predicate].filter(Boolean).map(term);
  for (const [prefix, iri] of Object.entries(NS))
    if (
      prefix !== "rdfs" &&
      used.some((value) => value.startsWith(prefix + ":"))
    )
      lines.push(`PREFIX ${prefix}: <${iri}>`);
  lines.push("", "SELECT ?s ?value WHERE {");
  if (input.subject)
    lines.push(`  ?s rdfs:subClassOf ${term(input.subject)} .`);
  lines.push(`  ?s ${term(input.predicate)} ?value .`);
  if (input.value.trim())
    lines.push(
      `  FILTER(CONTAINS(?value, ${JSON.stringify(input.value.trim().replaceAll('"', ""))}))`,
    );
  lines.push("}");
  if (
    /^\d+$/.test(input.limit.trim()) &&
    Number.isSafeInteger(Number(input.limit)) &&
    Number(input.limit) > 0
  )
    lines.push(`LIMIT ${Number(input.limit)}`);
  return lines.join("\n");
}
