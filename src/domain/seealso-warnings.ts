import type { Store } from "./store";
import { NS, type Term } from "./model";
import {
  seeAlsoValueKey,
  type SeeAlsoMatches,
} from "../shared/seealso-warnings";

// Index only seeAlso statements, once per revision. Typing and repeated fields
// perform lookups without repeatedly scanning the ontology.
const indices = new WeakMap<
  Store,
  { version: number; values: Map<string, Set<string>> }
>();
export function seeAlsoMatches(
  store: Store,
  subject: string,
  term: Pick<Term, "literal" | "value">,
): SeeAlsoMatches {
  if (!term.value.trim()) return { total: 0, entities: [] };
  let index = indices.get(store);
  if (!index || index.version !== store.version) {
    const values = new Map<string, Set<string>>();
    for (const triple of store.byPredicate.get(NS.rdfs + "seeAlso") ?? []) {
      const key = seeAlsoValueKey(triple.object);
      let subjects = values.get(key);
      if (!subjects) values.set(key, (subjects = new Set()));
      subjects.add(triple.subject);
    }
    index = { version: store.version, values };
    indices.set(store, index);
  }
  const subjects = index.values.get(seeAlsoValueKey(term));
  const total = (subjects?.size ?? 0) - (subjects?.has(subject) ? 1 : 0);
  const entities: SeeAlsoMatches["entities"] = [];
  for (const iri of subjects ?? []) {
    if (iri !== subject) entities.push({ iri, label: store.label(iri) });
    if (entities.length === 20) break;
  }
  return { total, entities };
}
