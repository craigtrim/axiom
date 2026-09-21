import type { Store } from "./store";
import { namedClass, taxonomyParents } from "./class-expressions";
import { findEntityIris } from "./resource-search";
import { MAX_VISIBLE_NODES } from "../shared/graph-limits";

/** All filtered matches, independent of pagination, and their unique ancestors. */
export function findGraphNodes(
  store: Store,
  options: unknown,
  limit = MAX_VISIBLE_NODES,
) {
  const matches = findEntityIris(store, options);
  if (!matches.length) throw Error("There are no search results to open.");
  const visited = new Set<string>();
  const iris: string[] = [];
  const roots: string[] = [];
  const add = (iri: string) => {
    if (visited.has(iri) || iri.startsWith("_:") || !store.graphVisible(iri))
      return;
    if (visited.size >= limit)
      throw Error(
        "These results and their ancestry exceed the " +
          limit.toLocaleString("en-US") +
          "-node graph limit. Narrow the search.",
      );
    visited.add(iri);
    iris.push(iri);
  };
  matches.forEach(add);
  // Traverse once across the entire result set, including multiple parent paths.
  // A visited set also terminates cycles without inventing a root or relationship.
  for (let cursor = 0; cursor < iris.length; cursor++) {
    const e = store.resolve(iris[cursor]);
    if (!e) continue;
    const parents =
      e.kind === "Individual"
        ? e.types.filter((iri) => {
            const type = store.entities.get(iri);
            return !type || namedClass(type);
          })
        : namedClass(e) || e.kind.endsWith("Property")
          ? taxonomyParents(e)
          : [];
    if (
      !parents.some((iri) => !iri.startsWith("_:") && store.graphVisible(iri))
    )
      roots.push(e.iri);
    parents.forEach(add);
  }
  return { matches, iris, roots };
}
