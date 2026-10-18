import { THING, type Entity } from "./model";
import { namedClass, taxonomyParents } from "./class-expressions";
import { displayName } from "./rdf-model";

// craigtrim/axiom#91: validate the whole drag before changing any branch.
export interface ClassMove {
  iri: string;
  fromParent: string | null;
}
export function branchRoots(entities: Map<string, Entity>, ids: string[]) {
  const chosen = new Set(ids);
  return [...chosen].filter((iri) => {
    const pending = [...taxonomyParents(entities.get(iri))],
      seen = new Set([iri]);
    while (pending.length) {
      const parent = pending.pop()!;
      if (seen.has(parent)) continue;
      if (chosen.has(parent)) return false;
      seen.add(parent);
      pending.push(...taxonomyParents(entities.get(parent)));
    }
    return true;
  });
}
export function classMovesIssue(
  entities: Map<string, Entity>,
  moves: ClassMove[],
  parent: string,
) {
  if (moves.some((m) => m.iri === parent))
    return "A class cannot be its own parent";
  for (const move of moves) {
    const issue = classMoveIssue(entities, move.iri, parent);
    if (issue)
      return issue.includes("descendants")
        ? "That target is inside the branch being moved, which would make a cycle"
        : issue.replace(/\.$/, "");
  }
  if (moves.length && moves.every((m) => m.fromParent === parent))
    return displayName(entities.get(parent)!) + " is already the parent";
}
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
