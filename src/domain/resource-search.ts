import { EntitySearchIndex } from "./entity-search";
import type { Store } from "./store";
import type { SemanticScores, SemanticScorer } from "../shared/embeddings";
export { EntitySearchIndex as ResourceSearchIndex } from "./entity-search";
export type { ResourceMatch } from "./entity-search";
const cache = new WeakMap<
  Store,
  { version: number; index: EntitySearchIndex }
>();
export function indexFor(store: Store) {
  let saved = cache.get(store);
  if (!saved || saved.version !== store.version) {
    saved = { version: store.version, index: new EntitySearchIndex(store) };
    cache.set(store, saved);
  }
  return saved.index;
}
export const prepareSemanticFind = (
  store: Store,
  options: unknown,
  score: SemanticScorer,
) => indexFor(store).semanticScores(options, score);
export const findEntities = (
  store: Store,
  options: unknown,
  scores?: SemanticScores,
) => indexFor(store).find(options, scores);
export const findEntityIris = (
  store: Store,
  options: unknown,
  scores?: SemanticScores,
) => indexFor(store).matchingIris(options, scores);
export const resourceSuggestions = (
  store: Store,
  query: string,
  classesOnly = false,
  exclude: string[] = [],
  scores?: SemanticScores,
) => indexFor(store).search(query, classesOnly, exclude, 24, scores);
