import { type Entity } from "./model";
import { taxonomyChildren, taxonomyParents } from "./class-expressions";

/** Shared ordering and ancestry filtering for the workbench and style picker. */
export function taxonomyRows(
  entities: Entity[],
  open: Set<string>,
  filter = "",
) {
  const map = new Map(entities.map((e) => [e.iri, e]));
  const q = filter.trim().toLowerCase(),
    visible = new Set<string>();
  if (q) {
    const pending = entities
      .filter((e) =>
        (e.name + " " + (e.label ?? "") + " " + e.iri)
          .toLowerCase()
          .includes(q),
      )
      .map((e) => e.iri);
    while (pending.length) {
      const id = pending.pop()!;
      if (visible.has(id)) continue;
      visible.add(id);
      pending.push(...taxonomyParents(map.get(id)));
    }
  }
  const rows: { iri: string; depth: number }[] = [],
    visited = new Set<string>();
  const walk = (root: string) => {
    const pending = [{ iri: root, depth: 0 }];
    while (pending.length) {
      const row = pending.pop()!,
        e = map.get(row.iri);
      if (!e || visited.has(row.iri) || (q && !visible.has(row.iri))) continue;
      visited.add(row.iri);
      rows.push(row);
      if (open.has(row.iri) || q)
        for (const iri of [...taxonomyChildren(e)].reverse())
          pending.push({ iri, depth: row.depth + 1 });
    }
  };
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name));
  for (const e of sorted.filter(
    (e) => !taxonomyParents(e).some((p) => map.has(p)),
  ))
    walk(e.iri);
  // Cyclic components have no root; retain a browseable entry for them.
  if (!rows.length && entities.length) for (const e of sorted) walk(e.iri);
  return rows;
}
