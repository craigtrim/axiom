import type { Store } from "./store";
import { namedClass, taxonomyParents } from "./class-expressions";
/** A deterministic recorded route. Multiple parents remain available in Details. */
export function entityPath(store: Store, iri: string): string {
  const seen = new Set([iri]), path: string[] = [];
  for (let depth = 0; depth < 12; depth++) {
    const entity = store.resolve(iri);
    const parents = !entity ? [] : entity.kind === "Individual"
      ? entity.types.filter(id => { const type = store.resolve(id); return !type || namedClass(type); })
      : namedClass(entity) || entity.kind.endsWith("Property") ? taxonomyParents(entity) : [];
    const parent = [...parents].filter(id => !id.startsWith("_:")).sort((a,b) => store.label(a).localeCompare(store.label(b)) || a.localeCompare(b))[0];
    if (!parent) break;
    if (seen.has(parent)) { path.push("cycle recorded"); break; }
    seen.add(parent);
    path.push(store.label(parent));
    iri = parent;
    if (depth === 11) path.push("…");
  }
  return path.reverse().join(" › ") || "no parent recorded";
}
