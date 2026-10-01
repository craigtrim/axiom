import { Store } from "./store";
import { NS, type Entity } from "./model";
import { displayName } from "./rdf-model";
import { entityRandom } from "./seeded-random";
import { createHash } from "node:crypto";
import {
  synonymDefinition,
  synonymKey,
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
  random = entityRandom(iri),
): SynonymContext {
  const selected = store.entities.get(iri);
  if (!named(selected))
    throw Error("Choose an existing named entity for synonyms.");
  const term = (e: Entity): SynonymTerm => ({
    iri: e.iri,
    label: displayName(e),
    kind: e.kind,
    description: e.comment,
    parents: [...parents(e)].sort().map((id) => store.label(id)),
    labels: [...store.scan(e.iri)]
      .filter((t) => labelPredicates.has(t.predicate) && t.object.literal)
      .map((t) => t.object.value)
      .sort(),
    seeAlso: [...store.scan(e.iri, seeAlso)]
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      .map((t) => ({
        value: t.object.value,
        literal: !!t.object.literal,
        ...(t.object.literal
          ? t.object.language
            ? { language: t.object.language }
            : {}
          : { label: store.label(t.object.value) }),
      })),
    conditions: [...e.restrictions, ...e.equivalents]
      .map((r) =>
        JSON.stringify({
          ...r,
          property: r.property ? store.label(r.property) : undefined,
          fillers: [...r.fillers].sort().map((id) => store.label(id)),
        }),
      )
      .sort(),
  });
  const walk = (next: (e: Entity) => string[]) => {
    const seen = new Set([iri]),
      queue = [selected];
    for (let i = 0; i < queue.length; i++)
      for (const id of [...next(queue[i])].sort()) {
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
  const order = (a: Entity, b: Entity) => a.iri.localeCompare(b.iri);
  const sampledChildren = sampleSynonymTerms(direct.sort(order), random),
    sampledDescendants = sampleSynonymTerms(descendants.sort(order), random),
    sampledSiblings = sampleSynonymTerms(siblings.sort(order), random);
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
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify([
          store.ontology.namespace,
          selected.iri,
          ...[selected, ...ancestors, ...descendants, ...siblings]
            .sort(order)
            .map(term),
        ]),
      )
      .digest("hex"),
    version: store.version,
    datasetEpoch,
    selected: term(selected),
    ancestors: ancestors.map(term),
    children: sampledChildren.map(term),
    descendants: sampledDescendants.map(term),
    siblings: sampledSiblings.map(term),
    additionalSeeAlso: sampleSynonymTerms(annotated.sort(order), random).map(
      term,
    ),
    totals: {
      children: direct.length,
      descendants: descendants.length,
      siblings: siblings.length,
      additionalSeeAlso: annotated.length,
    },
  };
}
/** Case-only variants, self matches and repeated candidates are omitted. */
export function validateSynonyms(
  store: Store,
  iri: string,
  values: SuggestionValue[],
): SynonymValidation {
  const entity = store.entities.get(iri);
  if (!named(entity))
    throw Error("Choose an existing named entity for synonyms.");
  const names = new Set([entity.name, displayName(entity)].map(synonymKey));
  const existing = new Set(
    [...store.scan(iri, seeAlso)]
      .filter((t) => t.object.literal)
      .map((t) => synonymKey(t.object.value)),
  );
  const seen = new Set<string>();
  const result: SynonymValidation = { values: [], excluded: [] };
  for (const suggestion of values) {
    const value = suggestion.value.trim();
    const key = synonymKey(value);
    // Equality under the distance normalization is exactly Levenshtein zero.
    if (names.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (existing.has(key))
      result.excluded.push({
        value,
        reason: "Already recorded for this entity.",
      });
    else {
      result.values.push({ ...suggestion, value, label: value });
    }
  }
  return result;
}
