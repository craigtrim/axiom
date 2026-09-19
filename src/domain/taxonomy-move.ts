import { THING, type Entity } from "./model";
import { namedClass, taxonomyParents } from "./class-expressions";
export function classMoveIssue(
  entities: Map<string, Entity>,
  iri: string,
  parent: string,
): string | undefined {
  const source = entities.get(iri),
    target = entities.get(parent);
  if (!source || !target || !namedClass(source) || !namedClass(target))
    return "Choose existing ontology classes.";
  if (iri === THING)
    return "owl:Thing is the ontology root and cannot be moved.";
  if (iri === parent) return "A class cannot be its own parent.";
  const pending = [parent],
    seen = new Set<string>();
  while (pending.length) {
    const next = pending.pop()!;
    if (next === iri)
      return "A class cannot be moved beneath one of its descendants.";
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...taxonomyParents(entities.get(next)));
  }
  return undefined;
}
