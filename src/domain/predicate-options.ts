import { TYPE } from "./model";
import type { Store } from "./store";
import type { PredicateUsage } from "../shared/predicates";

const cache = new WeakMap<
  Store,
  { version: number; values: PredicateUsage[] }
>();

export function predicateOptions(store: Store): PredicateUsage[] {
  const cached = cache.get(store);
  if (cached?.version === store.version) return cached.values;
  const counts = new Map<string, number>();
  // Include named graphs and generated individuals, which are not all in byPredicate.
  for (const { predicate } of store.scan())
    if (predicate !== TYPE)
      counts.set(predicate, (counts.get(predicate) ?? 0) + 1);
  for (const entity of store.entities.values())
    if (entity.kind.endsWith("Property") && entity.iri !== TYPE)
      counts.set(entity.iri, counts.get(entity.iri) ?? 0);
  const values = [...counts].map(([iri, count]) => ({ iri, count }));
  cache.set(store, { version: store.version, values });
  return values;
}
