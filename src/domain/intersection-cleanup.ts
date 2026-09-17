import { NS, TYPE, type Triple } from "./model";
import { INTERSECTION } from "./class-expressions";
/** Remove only unreferenced, unannotated collection structure in the axiom's graph. */
export function discardUnusedIntersection(
  triples: Triple[],
  original: Triple,
): Set<string> {
  const graph = original.graph ?? "",
    same = (t: Triple) => (t.graph ?? "") === graph;
  const root =
    original.predicate === INTERSECTION
      ? null
      : original.subject.startsWith("_:")
        ? original.subject
        : original.object.value.startsWith("_:")
          ? original.object.value
          : null;
  const head =
    original.predicate === INTERSECTION
      ? original
      : triples.find(
          (t) => same(t) && t.subject === root && t.predicate === INTERSECTION,
        );
  if (!head || head.object.literal) return new Set();
  const candidates = new Set<string>(root ? [root] : []),
    cells = new Set<string>();
  let cell = head.object.value;
  while (cell !== NS.rdf + "nil") {
    if (!cell.startsWith("_:") || cells.has(cell) || cells.size >= 4096)
      return new Set();
    cells.add(cell);
    candidates.add(cell);
    const rows = triples.filter((t) => t.subject === cell && same(t)),
      rest = rows.filter((t) => t.predicate === NS.rdf + "rest");
    if (rest.length !== 1 || rest[0].object.literal) return new Set();
    cell = rest[0].object.value;
  }
  if (
    triples.some(
      (t) =>
        candidates.has(t.subject) &&
        t.predicate === TYPE &&
        ![NS.owl + "Class", NS.rdf + "List"].includes(t.object.value),
    )
  )
    return new Set();
  if (
    triples.some(
      (t) =>
        candidates.has(t.subject) &&
        (!same(t) ||
          ![TYPE, INTERSECTION, NS.rdf + "first", NS.rdf + "rest"].includes(
            t.predicate,
          )),
    )
  )
    return new Set();
  if (
    triples.some(
      (t) =>
        !t.object.literal &&
        candidates.has(t.object.value) &&
        !candidates.has(t.subject),
    )
  )
    return new Set();
  for (let i = triples.length - 1; i >= 0; i--)
    if (candidates.has(triples[i].subject)) triples.splice(i, 1);
  return candidates;
}
