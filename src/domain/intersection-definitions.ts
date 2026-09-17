import { NS, SUBCLASS, type Triple } from "./model";
import { discardUnusedIntersection } from "./intersection-cleanup";
import { statementKey } from "./rdf-model";

/** A subclass of an anonymous conjunction is a subclass of each member. */
export function simplifySubclassIntersections(triples: Triple[]) {
  const key = (id: string, graph?: string) => JSON.stringify([id, graph ?? ""]);
  const bySubject = new Map<string, Triple[]>();
  const annotated = new Set<string>();
  for (const t of triples) {
    const id = key(t.subject, t.graph),
      rows = bySubject.get(id) ?? [];
    rows.push(t);
    bySubject.set(id, rows);
    if (t.predicate === NS.owl + "annotatedTarget" && !t.object.literal)
      annotated.add(key(t.object.value, t.graph));
  }
  const members = (
    id: string,
    graph: string | undefined,
    seen = new Set<string>(),
  ): string[] | undefined => {
    if (
      !id.startsWith("_:") ||
      seen.has(id) ||
      seen.size >= 64 ||
      annotated.has(key(id, graph))
    )
      return;
    const rows = bySubject.get(key(id, graph)) ?? [];
    if (
      rows.some(
        (t) =>
          ![NS.rdf + "type", NS.owl + "intersectionOf"].includes(t.predicate),
      )
    )
      return;
    const heads = rows.filter(
      (t) => t.predicate === NS.owl + "intersectionOf" && !t.object.literal,
    );
    if (heads.length !== 1) return;
    const result: string[] = [],
      cells = new Set<string>();
    let cell = heads[0].object.value;
    while (cell !== NS.rdf + "nil") {
      if (cells.has(cell) || cells.size >= 4096) return;
      cells.add(cell);
      const rows = bySubject.get(key(cell, graph)) ?? [];
      const first = rows.filter(
        (t) => t.predicate === NS.rdf + "first" && !t.object.literal,
      );
      const rest = rows.filter(
        (t) => t.predicate === NS.rdf + "rest" && !t.object.literal,
      );
      if (first.length !== 1 || rest.length !== 1) return;
      const value = first[0].object.value;
      result.push(...(members(value, graph, new Set(seen).add(id)) ?? [value]));
      cell = rest[0].object.value;
    }
    return result.length ? [...new Set(result)] : undefined;
  };
  const changed = new Set<string>(),
    removed: Triple[] = [];
  const next = triples.flatMap((t) => {
    if (t.predicate !== SUBCLASS || t.object.literal) return [t];
    const values = members(t.object.value, t.graph);
    if (!values) return [t];
    changed.add(t.subject);
    removed.push(t);
    return values.map((value) => ({ ...t, object: { ...t.object, value } }));
  });
  if (changed.size) {
    const unique = new Map(next.map((t) => [statementKey(t), t]));
    triples.length = 0;
    for (const t of unique.values()) triples.push(t);
    for (const t of removed) discardUnusedIntersection(triples, t);
  }
  return changed;
}
