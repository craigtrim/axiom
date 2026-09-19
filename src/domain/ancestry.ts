import { type Entity } from "./model";
import { displayName } from "./rdf-model";
import { namedClass, taxonomyParents } from "./class-expressions";

export type AncestryRelation =
  "subclass" | "instance" | "definition" | "subproperty";
export interface AncestryParent {
  iri: string;
  label: string;
  relation: AncestryRelation;
}
export interface AncestryStep {
  iri: string;
  label: string;
  parents: AncestryParent[];
  root: boolean;
  unresolved: boolean;
}

/** A compact ancestry summary, with each entity at its nearest stage only. */
export function ancestryTrail(
  entities: ReadonlyMap<string, Entity>,
  iri: string,
  limit = 2048,
) {
  const label = (id: string) => {
    const e = entities.get(id);
    return e ? displayName(e) : id;
  };
  const above = (id: string): AncestryParent[] => {
    const e = entities.get(id);
    const individual = e?.kind === "Individual";
    const ids = !e
      ? []
      : individual
        ? e.types.filter((t) => {
            const target = entities.get(t);
            return !target || namedClass(target);
          })
        : namedClass(e) || e.kind.endsWith("Property")
          ? taxonomyParents(e)
          : [];
    return [...new Set(ids)]
      .filter((p) => !p.startsWith("_:"))
      .map((p) => ({
        iri: p,
        label: label(p),
        relation: (individual
          ? "instance"
          : e!.kind.endsWith("Property")
            ? "subproperty"
            : e!.parents.includes(p)
              ? "subclass"
              : "definition") as AncestryRelation,
      }))
      .sort(
        (a, b) => a.label.localeCompare(b.label) || a.iri.localeCompare(b.iri),
      );
  };
  const levels: AncestryStep[][] = [];
  const roots: AncestryStep[] = [];
  const queue = [{ iri, distance: 0 }];
  const visited = new Set([iri]);
  let more = false;
  // Breadth-first traversal avoids repeated routes and terminates cycles without
  // changing the recorded relationships. Work is bounded by unique ancestors.
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const item = queue[cursor];
    const parents = above(item.iri);
    const e = entities.get(item.iri);
    const step: AncestryStep = {
      iri: item.iri,
      label: label(item.iri),
      parents,
      root: !!e && e.kind !== "Individual" && !parents.length,
      unresolved: !e,
    };
    if (item.distance && step.root) roots.push(step);
    else (levels[item.distance] ??= []).push(step);
    for (const parent of parents) {
      if (visited.has(parent.iri)) continue;
      if (visited.size >= Math.max(1, limit)) {
        more = true;
        continue;
      }
      visited.add(parent.iri);
      queue.push({ iri: parent.iri, distance: item.distance + 1 });
    }
  }
  // Shared roots form one destination even when branches have different depths.
  const stages = levels.filter((level) => level?.length);
  if (roots.length) stages.push(roots);
  for (const stage of stages)
    stage.sort(
      (a, b) => a.label.localeCompare(b.label) || a.iri.localeCompare(b.iri),
    );
  return { stages, more };
}
