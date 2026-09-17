import { NS, TYPE, SUBCLASS, type Triple } from "./model";
import type { Store } from "./store";
import { namedClass, INTERSECTION } from "./class-expressions";
/** Only plain, unannotated intersections can be presented as ordinary parent rows. */
export function simpleParentExpressions(store: Store, statements: Triple[]) {
  const result: Record<string, string[]> = {};
  for (const t of statements) {
    if (
      t.predicate !== SUBCLASS ||
      t.object.literal ||
      !t.object.value.startsWith("_:")
    )
      continue;
    const expr = store.entities.get(t.object.value)?.intersection;
    if (
      !expr ||
      expr.issue ||
      !expr.members.length ||
      !expr.members.every((id) => {
        const e = store.entities.get(id);
        return e && namedClass(e);
      })
    )
      continue;
    if (
      store.tbox.some(
        (row) =>
          row.predicate === NS.owl + "annotatedTarget" &&
          !row.object.literal &&
          row.object.value === t.object.value,
      )
    )
      continue;
    const pending = [t.object.value],
      seen = new Set<string>();
    let safe = true;
    while (pending.length && safe) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const row of store.bySubject.get(id) ?? []) {
        if (
          (row.graph ?? "") !== (t.graph ?? "") ||
          ![TYPE, INTERSECTION, NS.rdf + "first", NS.rdf + "rest"].includes(
            row.predicate,
          ) ||
          (row.predicate === TYPE &&
            ![NS.owl + "Class", NS.rdf + "List"].includes(row.object.value))
        ) {
          safe = false;
          break;
        }
        if (!row.object.literal && row.object.value.startsWith("_:"))
          pending.push(row.object.value);
      }
    }
    if (safe) result[t.object.value] = expr.members;
  }
  return result;
}
