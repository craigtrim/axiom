import { Store } from "./store";
import { NS, type Entity } from "./model";
import { displayName } from "./rdf-model";
import {
  synonymDefinition,
  sampleSynonymTerms,
  type SynonymContext,
  type SynonymTerm,
  type SynonymValidation,
} from "../shared/synonyms";
import type { SuggestionValue } from "../shared/suggestions";
const seeAlso = synonymDefinition.predicate;
const labelPredicates = new Set([
  NS.rdfs + "label",
  NS.skos + "prefLabel",
  NS.skos + "altLabel",
]);
const named = (e?: Entity): e is Entity => !!e && !e.iri.startsWith("_:");
const parents = (e: Entity) =>
  e.kind === "Individual" ? e.types : (e.taxonomyParents ?? e.parents);
const children = (e: Entity) =>
  e.kind === "Individual" ? [] : (e.taxonomyChildren ?? e.children);
export function synonymContext(
  store: Store,
  iri: string,
  datasetEpoch: number,
  random = Math.random,
): SynonymContext {
  const selected = store.entities.get(iri);
  if (!named(selected))
    throw Error("Choose an existing named entity for synonyms.");
  const term = (e: Entity): SynonymTerm => ({
    iri: e.iri,
    label: displayName(e),
    kind: e.kind,
    description: e.comment,
    parents: parents(e).map((id) => store.label(id)),
    labels: [...store.scan(e.iri)]
      .filter((t) => labelPredicates.has(t.predicate) && t.object.literal)
      .map((t) => t.object.value),
    seeAlso: [...store.scan(e.iri, seeAlso)].map((t) => ({
      value: t.object.value,
      literal: !!t.object.literal,
      ...(t.object.literal
        ? t.object.language
          ? { language: t.object.language }
          : {}
        : { label: store.label(t.object.value) }),
    })),
    conditions: [...e.restrictions, ...e.equivalents].map((r) =>
      JSON.stringify({
        ...r,
        property: r.property ? store.label(r.property) : undefined,
        fillers: r.fillers.map((id) => store.label(id)),
      }),
    ),
  });
  const walk = (next: (e: Entity) => string[]) => {
    const seen = new Set([iri]),
      queue = [selected];
    for (let i = 0; i < queue.length; i++)
      for (const id of next(queue[i])) {
        const entity = store.entities.get(id);
        if (!seen.has(id) && named(entity)) {
          seen.add(id);
          queue.push(entity);
        }
      }
    return queue.slice(1);
  };
  const ancestors = walk(parents),
    descendants = walk(children);
  const direct = [...new Set(children(selected))].flatMap((id) => {
    const e = store.entities.get(id);
    return id !== iri && named(e) ? [e] : [];
  });
  const relatives = new Set([
    iri,
    ...ancestors.map((e) => e.iri),
    ...descendants.map((e) => e.iri),
  ]);
  const siblingIds = new Set(
    parents(selected).flatMap((id) => {
      const parent = store.entities.get(id);
      return selected.kind === "Individual"
        ? store.instanceIris(id)
        : parent
          ? children(parent)
          : [];
    }),
  );
  const siblings = [...siblingIds].flatMap((id) => {
    const e = store.entities.get(id);
    return !relatives.has(id) && named(e) ? [e] : [];
  });
  const sampledChildren = sampleSynonymTerms(direct, random),
    sampledDescendants = sampleSynonymTerms(descendants, random),
    sampledSiblings = sampleSynonymTerms(siblings, random);
  const included = new Set(
    [
      selected,
      ...ancestors,
      ...sampledChildren,
      ...sampledDescendants,
      ...sampledSiblings,
    ].map((e) => e.iri),
  );
  const annotated = [
    ...new Map([...descendants, ...siblings].map((e) => [e.iri, e])).values(),
  ].filter(
    (e) => !included.has(e.iri) && !store.scan(e.iri, seeAlso).next().done,
  );
  return {
    version: store.version,
    datasetEpoch,
    selected: term(selected),
    ancestors: ancestors.map(term),
    children: sampledChildren.map(term),
    descendants: sampledDescendants.map(term),
    siblings: sampledSiblings.map(term),
    additionalSeeAlso: sampleSynonymTerms(annotated, random).map(term),
    totals: {
      children: direct.length,
      descendants: descendants.length,
      siblings: siblings.length,
      additionalSeeAlso: annotated.length,
    },
  };
}
const folded = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
const collisionKey = (value: string) =>
  folded(value).replace(/[^\p{L}\p{N}]/gu, "");
const duplicateKey = (value: string) =>
  folded(value).trim().replace(/\s+/g, " ");
const spelling = new Map([
  ["centre", "center"],
  ["theatre", "theater"],
  ["behaviour", "behavior"],
  ["behavioural", "behavioral"],
  ["behaviourism", "behaviorism"],
  ["organisation", "organization"],
  ["organisational", "organizational"],
  ["paediatric", "pediatric"],
  ["colour", "color"],
  ["counselling", "counseling"],
  ["counsellor", "counselor"],
  ["programme", "program"],
  ["analyse", "analyze"],
  ["organise", "organize"],

  ["specialisation", "specialization"],
  ["modelling", "modeling"],
  ["paediatrics", "pediatrics"],
]);
function word(value: string) {
  value = spelling.get(value) ?? value;
  const simple =
    value.endsWith("ies") && value.length > 4
      ? value.slice(0, -3) + "y"
      : value.endsWith("s") && value.length > 3 && !/(ss|us|is)$/.test(value)
        ? value.slice(0, -1)
        : value;
  return spelling.get(simple) ?? simple;
}
const stop = new Set(["a", "an", "the", "of", "and", "for", "in", "on", "to"]);
const words = (value: string) =>
  (folded(value).match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !stop.has(w));
/** A conservative lexical gate. Semantic fit still requires the assistant and user review. */
export function closeSynonymForm(candidate: string, label: string): boolean {
  const a = words(candidate),
    b = words(label);
  if (!a.length || !b.length) return false;
  if (a.join("") === b.join("")) return true;
  if (a.length === b.length) {
    // Bipartite matching keeps repeated/abbreviated words bounded, without permutation search.
    const owner = new Map<number, number>();
    const assign = (i: number, visited: Set<number>): boolean => {
      for (let j = 0; j < b.length; j++) {
        const same = word(a[i]) === word(b[j]);
        const abbreviation =
          a[i].length >= 2 &&
          a[i].length <= 4 &&
          b[j].length >= a[i].length + 2 &&
          b[j].startsWith(a[i]);
        if (visited.has(j) || !(same || abbreviation)) continue;
        visited.add(j);
        if (!owner.has(j) || assign(owner.get(j)!, visited)) {
          owner.set(j, i);
          return true;
        }
      }
      return false;
    };
    if (a.length <= 40 && a.every((_, i) => assign(i, new Set()))) return true;
  }
  // Conventional initialisms can retain a short prefix per word (CS, B.Sc.).
  const initials = folded(candidate).replace(/[^a-z0-9]/g, "");
  if (
    b.length > 1 &&
    (/^[A-Z\s]+$/.test(candidate) ||
      /^(?:[A-Z][a-z]{0,3}\.\s*)+$/.test(candidate)) &&
    initials.length <= 12
  ) {
    const memo = new Map<string, boolean>();
    const match = (i: number, offset: number): boolean => {
      if (i === b.length) return offset === initials.length;
      const key = i + ":" + offset;
      if (memo.has(key)) return memo.get(key)!;
      for (let n = 1; n <= Math.min(4, b[i].length); n++)
        if (
          initials.startsWith(b[i].slice(0, n), offset) &&
          match(i + 1, offset + n)
        ) {
          memo.set(key, true);
          return true;
        }
      memo.set(key, false);
      return false;
    };
    return match(0, 0);
  }
  return false;
}
// Reordered words and ordinary inflections must not disguise another entity's alias.
const ownershipKeys = (value: string) => [
  "exact:" + collisionKey(value),
  "words:" + words(value).map(word).sort().join(" "),
];
const indexes = new WeakMap<
  Store,
  { version: number; owners: Map<string, Set<string>> }
>();
function nameIndex(store: Store) {
  let index = indexes.get(store);
  if (index?.version === store.version) return index.owners;
  const owners = new Map<string, Set<string>>();
  const add = (value: string, iri: string) => {
    if (!collisionKey(value)) return;
    for (const key of ownershipKeys(value)) {
      const ids = owners.get(key) ?? new Set<string>();
      ids.add(iri);
      owners.set(key, ids);
    }
  };
  for (const entity of store.entities.values()) {
    add(entity.name, entity.iri);
    add(displayName(entity), entity.iri);
  }
  for (const t of store.tbox)
    if (
      t.object.literal &&
      (labelPredicates.has(t.predicate) || t.predicate === seeAlso)
    )
      add(t.object.value, t.subject);
  indexes.set(store, { version: store.version, owners });
  return owners;
}
export function validateSynonyms(
  store: Store,
  iri: string,
  values: SuggestionValue[],
): SynonymValidation {
  const entity = store.entities.get(iri);
  if (!named(entity))
    throw Error("Choose an existing named entity for synonyms.");
  const statements = [...store.scan(iri)];
  const labels = [
    ...new Set([
      entity.name,
      displayName(entity),
      ...statements
        .filter((t) => t.object.literal && labelPredicates.has(t.predicate))
        .map((t) => t.object.value),
    ]),
  ];
  const existing = new Set(
    [
      ...labels,
      ...statements
        .filter((t) => t.predicate === seeAlso && t.object.literal)
        .map((t) => t.object.value),
    ].map(duplicateKey),
  );
  const index = nameIndex(store),
    result: SynonymValidation = { values: [], excluded: [] };
  for (const suggestion of values) {
    const value = suggestion.value.trim(),
      key = duplicateKey(value);
    const other = ownershipKeys(value)
      .flatMap((key) => [...(index.get(key) ?? [])])
      .find((id) => id !== iri);
    const reason = existing.has(key)
      ? "Already recorded for this entity."
      : other
        ? 'Names or aliases another entity: "' + store.label(other) + '".'
        : value.length > 256 ||
            !labels.some((label) => closeSynonymForm(value, label))
          ? "Not a close spelling, abbreviation or word-order variation of the selected name."
          : "";
    if (reason) result.excluded.push({ value, reason });
    else {
      existing.add(key);
      result.values.push({ ...suggestion, value, label: value });
    }
  }
  return result;
}
