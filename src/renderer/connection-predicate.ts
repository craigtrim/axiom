import type { Entity } from "../domain/model";
import { SUBCLASS, SUBPROPERTY, TYPE } from "../domain/model";

// A gesture determines its endpoints; only unambiguous ontology relationships have a default.
export function connectionPredicate(
  source?: Pick<Entity, "kind">,
  target?: Pick<Entity, "kind">,
) {
  const isClass = (e?: Pick<Entity, "kind">) =>
    !!e && ["Class", "Defined"].includes(e.kind);
  if (isClass(source) && isClass(target)) return SUBCLASS;
  if (source?.kind === "Individual" && isClass(target)) return TYPE;
  if (source?.kind.endsWith("Property") && source.kind === target?.kind)
    return SUBPROPERTY;
  return undefined;
}
