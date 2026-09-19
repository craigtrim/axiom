import { type Entity } from "./model";
import {
  namedClass,
  taxonomyChildren,
  taxonomyParents,
} from "./class-expressions";

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
  // Each entity is shown once. Prefer its first asserted named parent when that
  // branch is visible, so a move has a stable location even with multiple parents.
  const shown = new Set(rows.map((r) => r.iri)),
    parent = new Map<string, string | null>(),
    stack: string[] = [];
  for (const row of rows) {
    parent.set(row.iri, row.depth ? stack[row.depth - 1] : null);
    stack[row.depth] = row.iri;
    stack.length = row.depth + 1;
  }
  let changed = false;
  for (const row of rows) {
    const e = map.get(row.iri)!;
    if (!namedClass(e)) continue;
    const preferred = e.parents.find(
      (p) => shown.has(p) && (open.has(p) || q) && namedClass(map.get(p)!),
    );
    if (!preferred || preferred === parent.get(row.iri)) continue;
    let ancestor: string | null | undefined = preferred;
    while (ancestor && ancestor !== row.iri) ancestor = parent.get(ancestor);
    if (ancestor === row.iri) continue;
    parent.set(row.iri, preferred);
    changed = true;
  }
  if (!changed) return rows;
  const children = new Map<string, string[]>();
  for (const { iri } of rows) {
    const p = parent.get(iri);
    if (p) {
      const ids = children.get(p) ?? [];
      ids.push(iri);
      children.set(p, ids);
    }
  }
  for (const ids of children.values())
    ids.sort((a, b) => map.get(a)!.name.localeCompare(map.get(b)!.name));
  const pending = rows
      .filter((r) => !parent.get(r.iri))
      .map((r) => ({ ...r, depth: 0 }))
      .reverse(),
    result: typeof rows = [];
  while (pending.length) {
    const row = pending.pop()!;
    result.push(row);
    for (const iri of [...(children.get(row.iri) ?? [])].reverse())
      pending.push({ iri, depth: row.depth + 1 });
  }
  return result;
}
