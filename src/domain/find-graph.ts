import type { Store } from "./store";
import { findEntityIris } from "./resource-search";
import { MAX_VISIBLE_NODES } from "../shared/graph-limits";
import { ancestryGraphNodes } from "./ancestry-graph";

/** All filtered matches, independent of pagination, and their unique ancestors. */
export function findGraphNodes(
  store: Store,
  options: unknown,
  limit = MAX_VISIBLE_NODES,
  scores?: import("../shared/embeddings").SemanticScores,
) {
  const matches = findEntityIris(store, options, scores);
  if (!matches.length) throw Error("There are no search results to open.");
  return ancestryGraphNodes(store, matches, limit, "Narrow the search.");
}
