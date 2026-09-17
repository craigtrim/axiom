import {
  namedClass,
  taxonomyParents,
  taxonomyChildren,
} from "./class-expressions";
import { displayName } from "./rdf-model";
import type { Store } from "./store";

export interface SubclassSuggestion {
  iri: string;
  label: string;
  parents: string[];
}
const tokens = (label: string) =>
  label
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !["and", "of", "the", "a", "an"].includes(t));
// A parent name can omit words, including words in the middle, but retains order.
const subsequence = (candidate: string[], selected: string[]) => {
  let at = 0;
  for (const word of selected) if (word === candidate[at]) at++;
  return at === candidate.length;
};
const negated = (words: string[]) =>
  words.some((w) => ["non", "not", "no", "without"].includes(w));
const cache = new WeakMap<
  Store,
  {
    version: number;
    words: Map<string, string[]>;
    postings: Map<string, Set<string>>;
  }
>();

/** Label matches are review candidates, never inferred subclass assertions. */
export function subclassSuggestions(
  store: Store,
  child: string,
): SubclassSuggestion[] {
  const entity = store.entities.get(child);
  if (!entity || !namedClass(entity)) throw Error("Choose a named class.");
  let data = cache.get(store);
  if (!data || data.version !== store.version) {
    const words = new Map<string, string[]>(),
      postings = new Map<string, Set<string>>();
    for (const e of store.entities.values()) {
      if (!namedClass(e)) continue;
      const ts = tokens(displayName(e));
      words.set(e.iri, ts);
      for (const t of ts) {
        const ids = postings.get(t) ?? new Set<string>();
        ids.add(e.iri);
        postings.set(t, ids);
      }
    }
    data = { version: store.version, words, postings };
    cache.set(store, data);
  }
  const words = data.words.get(child)!;
  if (words.length < 2 || negated(words)) return [];
  const related = new Set<string>([child]);
  // Walk each direction separately; siblings remain eligible.
  for (const links of [taxonomyParents, taxonomyChildren]) {
    const seen = new Set<string>(),
      pending = [child];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      related.add(id);
      pending.push(...links(store.entities.get(id)));
    }
  }
  const pool = new Set(
    words.flatMap((word) => [...(data!.postings.get(word) ?? [])]),
  );
  return [...pool]
    .filter((id) => {
      if (related.has(id)) return false;
      const ts = data!.words.get(id)!;
      return (
        ts.length > 0 &&
        ts.length < words.length &&
        !negated(ts) &&
        subsequence(ts, words)
      );
    })
    .sort(
      (a, b) =>
        data!.words.get(b)!.length - data!.words.get(a)!.length ||
        displayName(store.entities.get(a)!).localeCompare(
          displayName(store.entities.get(b)!),
        ) ||
        a.localeCompare(b),
    )
    .slice(0, 100)
    .map((id) => {
      const e = store.entities.get(id)!;
      return {
        iri: id,
        label: displayName(e),
        parents: taxonomyParents(e).map((p) => {
          const pe = store.entities.get(p);
          return pe ? displayName(pe) : p;
        }),
      };
    });
}
