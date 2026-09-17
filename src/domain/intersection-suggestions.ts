import { namedClass, taxonomyParents } from "./class-expressions";
import { displayName } from "./rdf-model";
import type { Store } from "./store";
export interface IntersectionSuggestion {
  members: string[];
  labels: string[];
  coverage: number;
  missing: string[];
  reason: string;
}
const tokens = (label: string) => [
  ...new Set(
    label
      .normalize("NFKC")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLocaleLowerCase("en-US")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t && !["and", "of", "the", "a", "an"].includes(t)),
  ),
];
const cache = new WeakMap<
  Store,
  {
    version: number;
    words: Map<string, string[]>;
    index: Map<string, Set<string>>;
  }
>();
export function intersectionSuggestions(
  store: Store,
  iri: string,
): IntersectionSuggestion[] {
  const entity = store.entities.get(iri);
  if (!entity || !namedClass(entity)) throw Error("Choose a named class.");
  let data = cache.get(store);
  if (!data || data.version !== store.version) {
    const words = new Map<string, string[]>(),
      index = new Map<string, Set<string>>();
    for (const e of store.entities.values())
      if (namedClass(e)) {
        const ts = tokens(displayName(e));
        words.set(e.iri, ts);
        for (const t of ts) {
          const ids = index.get(t) ?? new Set<string>();
          ids.add(e.iri);
          index.set(t, ids);
        }
      }
    data = { version: store.version, words, index };
    cache.set(store, data);
  }
  const words = data.words.get(iri)!,
    target = new Set(words);
  if (
    words.length < 3 ||
    words.some((t) => ["not", "non", "without", "no"].includes(t))
  )
    return [];
  const pool = new Set(words.flatMap((t) => [...(data!.index.get(t) ?? [])]));
  const descendant = (candidate: string) => {
    const pending = [candidate],
      seen = new Set<string>();
    while (pending.length) {
      const i = pending.pop()!;
      if (i === iri) return true;
      if (seen.has(i)) continue;
      seen.add(i);
      pending.push(...taxonomyParents(store.entities.get(i)));
    }
    return false;
  };
  const candidates = [...pool]
    .filter((i) => i !== iri)
    .map((i) => ({ iri: i, tokens: data!.words.get(i)! }))
    .filter(
      (c) =>
        c.tokens.length >= 2 &&
        c.tokens.length < words.length &&
        c.tokens.every((t) => target.has(t)),
    )
    .sort(
      (a, b) => b.tokens.length - a.tokens.length || a.iri.localeCompare(b.iri),
    )
    .slice(0, 160)
    .filter((c) => !descendant(c.iri));
  const existing = new Set(
    (entity.classExpressions ?? []).map((r) =>
      JSON.stringify(
        [...(store.entities.get(r.iri)?.intersection?.members ?? [])].sort(),
      ),
    ),
  );
  const result: IntersectionSuggestion[] = [];
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i],
        b = candidates[j],
        union = new Set([...a.tokens, ...b.tokens]);
      if (
        a.tokens.every((t) => b.tokens.includes(t)) ||
        b.tokens.every((t) => a.tokens.includes(t)) ||
        !a.tokens.some((t) => b.tokens.includes(t))
      )
        continue;
      const missing = words.filter((t) => !union.has(t)),
        coverage = (words.length - missing.length) / words.length,
        members = [a.iri, b.iri];
      if (coverage < 0.75 || existing.has(JSON.stringify([...members].sort())))
        continue;
      result.push({
        members,
        labels: members.map((i) => displayName(store.entities.get(i)!)),
        coverage,
        missing,
        reason: missing.length
          ? "Label match; unmatched words: " + missing.join(", ")
          : "Together these existing labels cover every meaningful word.",
      });
    }
  return result
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        b.members.reduce((s, i) => s + data!.words.get(i)!.length, 0) -
          a.members.reduce((s, i) => s + data!.words.get(i)!.length, 0) ||
        a.labels.join().localeCompare(b.labels.join()),
    )
    .slice(0, 12);
}
