import { Store } from "./store";
import { parseResearchResult } from "../shared/research";
import type { ResearchContext, Suggestion } from "../shared/research";
export function researchContext(
  store: Store,
  iri: string,
  datasetEpoch: number,
): ResearchContext {
  const entity = store.resolve(iri);
  if (!entity) throw Error("Select an existing entity.");
  const named = (values: string[], limit: number) =>
    values.slice(0, limit).map((iri) => ({ iri, name: store.label(iri) }));
  const triples = [...store.scan(iri)];
  const instanceIris = store.instanceIris(iri);
  return {
    datasetEpoch,
    version: store.version,
    ontology: { ...store.ontology },
    entity: {
      ...structuredClone(entity),
      parents: entity.parents.slice(0, 24),
      children: entity.children.slice(0, 24),
      types: entity.types.slice(0, 12),
      disjoint: entity.disjoint.slice(0, 24),
      restrictions: entity.restrictions
        .slice(0, 24)
        .map((r) => ({ ...r, fillers: r.fillers.slice(0, 24) })),
      equivalents: entity.equivalents
        .slice(0, 24)
        .map((r) => ({ ...r, fillers: r.fillers.slice(0, 24) })),
      comment: entity.comment.slice(0, 4000),
    },
    parents: named(entity.parents, 24),
    children: named(entity.children, 24),
    types: named(entity.types, 12),
    examples: named(instanceIris, 12),
    relationships: triples.slice(0, 40).map((t) => ({
      predicate: t.predicate,
      value: t.object.value.slice(0, 2000),
      literal: t.object.literal,
    })),
    counts: {
      children: entity.children.length,
      instances: instanceIris.length,
      relationships: triples.length,
    },
  };
}
export function applySuggestions(
  store: Store,
  iri: string,
  suggestions: Suggestion[],
) {
  const entity = store.resolve(iri);
  if (!entity) throw Error("The research entity no longer exists.");
  suggestions = parseResearchResult({
    summary: "",
    sources: [],
    suggestions,
  }).suggestions;
  const names = new Set<string>();
  for (const s of suggestions) {
    if (s.kind !== "synonym") {
      if (!["Class", "Defined"].includes(entity.kind))
        throw Error("Select a class to add subclasses or instances.");
      const error = store.validateName(s.name);
      if (error) throw Error(error);
      if (store.exists(store.ontology.namespace + s.name) || names.has(s.name))
        throw Error("A suggested entity already exists: " + s.name);
      names.add(s.name);
    }
  }
  const created: string[] = [];
  for (const s of suggestions) {
    if (s.kind === "synonym") {
      store.addSynonym(iri, s.name);
      created.push(iri);
    }
    if (s.kind === "subclass")
      created.push(store.createClass(s.name, iri, s.description));
    if (s.kind === "individual")
      created.push(store.createNamedIndividual(s.name, iri, s.description));
  }
  return [...new Set(created)];
}
