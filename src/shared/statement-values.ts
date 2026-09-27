import {
  NS,
  TYPE,
  SUBCLASS,
  SUBPROPERTY,
  type Kind,
  type Triple,
} from "../domain/model";
import { statementKey } from "../domain/rdf-model";
const resources = new Set([
  TYPE,
  SUBCLASS,
  SUBPROPERTY,
  NS.rdfs + "domain",
  NS.rdfs + "range",
  ...[
    "equivalentClass",
    "disjointWith",
    "inverseOf",
    "equivalentProperty",
    "sameAs",
    "differentFrom",
  ].map((n) => NS.owl + n),
]);
export const resourcePredicate = (predicate: string, kind?: Kind) =>
  resources.has(predicate) || kind === "ObjectProperty";
export function completeEditorStatement(
  t: Triple,
  original: Triple[],
  kind?: Kind,
) {
  if (!t.predicate || (!t.object.literal && !t.object.value)) return false;
  // Keep imported malformed assertions editable, but never save a new parent
  // as text while its resource picker is still awaiting a selection.
  if (t.object.literal && resourcePredicate(t.predicate, kind))
    return original.some((before) => statementKey(before) === statementKey(t));
  return true;
}
