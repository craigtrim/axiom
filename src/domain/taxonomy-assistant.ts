import { Store } from "./store";
import { displayName, identifier, identifierParts } from "./rdf-model";
import { type Entity } from "./model";
import {
  taxonomyMode,
  taxonomyNameKey,
  parseTaxonomyResult,
  buildTaxonomyPrompt,
  type TaxonomyContext,
  type TaxonomyTerm,
  type TaxonomyMode,
  type TaxonomySuggestion,
  type TaxonomyLink,
} from "../shared/taxonomy-assistant";

const isClass = (e?: Entity) => !!e && ["Class", "Defined"].includes(e.kind);
const tooLarge = () =>
  Error(
    "The selected class and ancestor context are too large. Select a narrower class.",
  );
export function taxonomyContext(
  store: Store,
  iri: string,
  mode: TaxonomyMode,
  datasetEpoch: number,
): TaxonomyContext {
  taxonomyMode(mode);
  const selected = store.resolve(iri);
  if (!isClass(selected))
    throw Error("Choose an existing class in the taxonomy.");
  const term = (e: Entity): TaxonomyTerm => ({
    iri: e.iri,
    label: displayName(e),
    comment: e.comment,
    parents: [...e.parents],
    restrictions: structuredClone(e.restrictions),
    equivalents: structuredClone(e.equivalents),
    disjoint: [...e.disjoint],
  });
  const walk = (direction: "parents" | "children") => {
    const seen = new Map<string, number>([[iri, 0]]);
    const queue = [iri],
      links: TaxonomyLink[] = [];
    for (let i = 0; i < queue.length; i++) {
      const current = store.resolve(queue[i])!;
      for (const next of new Set(current[direction])) {
        if (!isClass(store.resolve(next))) continue;
        links.push(
          direction === "parents"
            ? { child: current.iri, parent: next }
            : { child: next, parent: current.iri },
        );
        if (!seen.has(next)) {
          seen.set(next, seen.get(current.iri)! + 1);
          queue.push(next);
        }
        if (
          direction === "parents" &&
          (seen.size > 1500 || links.length > 6000)
        )
          throw tooLarge();
      }
    }
    return { seen, links };
  };
  const up = walk("parents"),
    down = walk("children");
  const named = (seen: Map<string, number>) =>
    [...seen.keys()]
      .filter((id) => id !== iri)
      .map((id) => term(store.resolve(id)!));
  const existing = new Set<string>();
  if (mode === "instances") {
    for (const id of down.seen.keys()) {
      for (const instance of store.instanceIris(id)) {
        existing.add(instance);
      }
    }
  }
  const context: TaxonomyContext = {
    datasetEpoch,
    version: store.version,
    mode,
    ontology: {
      name: store.ontology.name,
      namespace: store.ontology.namespace,
    },
    selected: term(selected!),
    ancestors: named(up.seen),
    ancestorLinks: up.links,
    roots: [...up.seen.keys()].filter(
      (id) => !store.resolve(id)!.parents.length,
    ),
    directChildren: [...new Set(selected!.children)].filter(
      (id) => id !== iri && isClass(store.resolve(id)),
    ),
    descendants: named(down.seen).map((t) => ({
      ...t,
      depth: down.seen.get(t.iri)!,
    })),
    descendantLinks: down.links,
    existingInstanceCount: existing.size,
    existingInstances: [...existing].slice(0, 50).map((id) => ({
      iri: id,
      label: store.label(id),
      types: store.resolve(id)?.types ?? [],
    })),
  };
  const terms = [
    context.selected,
    ...context.ancestors,
    ...context.descendants,
  ];
  const refs = new Set(
    terms.flatMap((t) => [
      ...t.parents,
      ...t.disjoint,
      ...[...t.restrictions, ...t.equivalents].flatMap((r) => [
        ...(r.property ? [r.property] : []),
        ...r.fillers,
      ]),
    ]),
  );
  for (const example of context.existingInstances)
    for (const type of example.types) refs.add(type);
  context.names = Object.fromEntries(
    [...refs].map((id) => [id, store.label(id)]),
  );
  // Descendants are sampled before sending; retain the full branch locally for review.
  if (
    buildTaxonomyPrompt({
      ...context,
      directChildren: [],
      descendants: [],
      descendantLinks: [],
    }).length > 140000
  )
    throw tooLarge();
  return context;
}
export function validateTaxonomySuggestions(
  store: Store,
  iri: string,
  mode: TaxonomyMode,
  raw: unknown,
): (string | null)[] {
  taxonomyMode(mode);
  if (!isClass(store.resolve(iri)))
    throw Error("The selected class no longer exists.");
  const suggestions = parseTaxonomyResult({
    summary: "",
    suggestions: raw,
  }).suggestions;
  const existing = new Set<string>();
  const add = (id: string, name: string) => {
    existing.add(taxonomyNameKey(name));
    existing.add(taxonomyNameKey(identifierParts(id).name));
  };
  for (const e of store.entities.values()) add(e.iri, displayName(e));
  for (const e of store.individuals) add(e.iri, store.label(e.iri));
  for (const e of store.customers) add(e.iri, e.name);
  const seen = new Set<string>();
  return suggestions.map((s) => {
    if (s.kind !== (mode === "children" ? "class" : "individual"))
      return mode === "children"
        ? "Only child classes belong in this action."
        : "Only individuals belong in this action.";
    if (s.parentIri !== iri) return "The proposal targets a different parent.";
    const key = taxonomyNameKey(s.label);
    if (
      existing.has(key) ||
      store.exists(store.ontology.namespace + identifier(s.label))
    )
      return "An entity with this label or normalized name already exists. It will not be duplicated or moved.";
    if (seen.has(key)) return "This duplicates another suggestion.";
    seen.add(key);
    return null;
  });
}
export function applyTaxonomySuggestions(
  store: Store,
  iri: string,
  mode: TaxonomyMode,
  suggestions: TaxonomySuggestion[],
) {
  const issues = validateTaxonomySuggestions(store, iri, mode, suggestions);
  const issue = issues.find(Boolean);
  if (issue) throw Error(issue);
  if (!suggestions.length) throw Error("Select at least one suggestion.");
  return suggestions.map((s) =>
    mode === "children"
      ? store.createClass(s.label, iri, s.definition)
      : store.createNamedIndividual(s.label, iri, s.definition),
  );
}
