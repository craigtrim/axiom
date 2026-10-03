// Statement evidence and label previews as compact Turtle (craigtrim/axiom#44).
import { NS, TYPE, type Triple } from "../domain/model";

const prefixes = Object.entries(NS).filter(
  ([p]) => !["pizza", "demo"].includes(p),
);
const localName = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
/** `base` is written as the empty prefix, as the reference writes the ontology namespace. */
export function turtleTerm(iri: string, base: string) {
  for (const [prefix, ns] of prefixes)
    if (iri.startsWith(ns) && localName.test(iri.slice(ns.length)))
      return prefix + ":" + iri.slice(ns.length);
  if (base && iri.startsWith(base) && localName.test(iri.slice(base.length)))
    return ":" + iri.slice(base.length);
  return iri.startsWith("_:") ? iri : "<" + iri + ">";
}
export function turtleObject(t: Triple, base: string) {
  const o = t.object;
  if (!o.literal) return turtleTerm(o.value, base);
  const text =
    '"' + o.value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\n") + '"';
  if (o.language) return text + "@" + o.language;
  if (
    o.datatype &&
    o.datatype !== NS.xsd + "string" &&
    o.datatype !== NS.rdf + "langString"
  )
    return text + "^^" + turtleTerm(o.datatype, base);
  return text;
}
const byGraph = (triples: Triple[]) => {
  const graphs = new Map<string, Triple[]>();
  for (const t of triples)
    graphs.set(t.graph ?? "", [...(graphs.get(t.graph ?? "") ?? []), t]);
  return [...graphs].sort(([a], [b]) => (a ? 1 : 0) - (b ? 1 : 0));
};
const inGraph = (graph: string, base: string, lines: string[]) =>
  graph
    ? [turtleTerm(graph, base) + " {", ...lines.map((l) => "  " + l), "}"]
    : lines;
/** Groups by graph and subject; rdf:type comes first as `a`. */
export function turtleEvidence(triples: Triple[], base: string) {
  const out: string[] = [];
  for (const [graph, ts] of byGraph(triples)) {
    const lines: string[] = [];
    const subjects = new Map<string, Triple[]>();
    for (const t of ts)
      subjects.set(t.subject, [...(subjects.get(t.subject) ?? []), t]);
    for (const [subject, statements] of subjects) {
      const predicates = new Map<string, string[]>();
      for (const t of [...statements].sort(
        (a, b) => +(b.predicate === TYPE) - +(a.predicate === TYPE),
      ))
        predicates.set(t.predicate, [
          ...(predicates.get(t.predicate) ?? []),
          turtleObject(t, base),
        ]);
      const parts = [...predicates].map(
        ([p, objects]) =>
          (p === TYPE ? "a" : turtleTerm(p, base)) + " " + objects.join(", "),
      );
      parts.forEach((part, i) =>
        lines.push(
          (i ? "    " : turtleTerm(subject, base) + " ") +
            part +
            (i === parts.length - 1 ? " ." : " ;"),
        ),
      );
    }
    out.push(...inGraph(graph, base, lines));
  }
  return out.join("\n");
}
/** One statement per line with subjects padded into a column. */
export function turtleLines(triples: Triple[], base: string) {
  const out: string[] = [];
  for (const [graph, ts] of byGraph(triples)) {
    const subjects = ts.map((t) => turtleTerm(t.subject, base));
    const width = Math.max(...subjects.map((s) => s.length));
    out.push(
      ...inGraph(
        graph,
        base,
        ts.map(
          (t, i) =>
            subjects[i].padEnd(width) +
            " " +
            turtleTerm(t.predicate, base) +
            " " +
            turtleObject(t, base) +
            " .",
        ),
      ),
    );
  }
  return out.join("\n");
}
