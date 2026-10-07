import type { Store } from "./store";
import { NS } from "./model";
import { displayName } from "./rdf-model";
import { synonymKey, synonymDefinition } from "../shared/synonyms";
import {
  findSynonymText,
  type FindSynonymStatus,
  type FindSynonymResult,
} from "../shared/find-synonyms";

export function findSynonymStatus(
  store: Store,
  iri: string,
  input: string,
): FindSynonymStatus | undefined {
  const text = findSynonymText(input),
    entity = store.entities.get(iri);
  if (!text || !entity || iri.startsWith("_:")) return;
  const key = synonymKey(text);
  if (
    [entity.name, displayName(entity)].some((name) => synonymKey(name) === key)
  )
    return "label";
  let exists = false;
  for (const t of store.scan(iri)) {
    if (!t.object.literal || synonymKey(t.object.value) !== key) continue;
    if ([NS.rdfs + "label", NS.skos + "prefLabel"].includes(t.predicate))
      return "label";
    if (t.predicate === synonymDefinition.predicate) exists = true;
  }
  return exists ? "exists" : "available";
}

export function addFindSynonym(
  store: Store,
  iri: string,
  input: string,
): FindSynonymResult {
  const value = findSynonymText(input);
  if (!value) throw Error("Enter plain text to add as a synonym.");
  const status = findSynonymStatus(store, iri, value);
  if (!status) throw Error("This entity is no longer available for editing.");
  // Names and aliases are allowed to overlap. Only an identical RDF literal
  // is already recorded; a repeated click must not create a spurious Undo.
  if (
    [...store.scan(iri)].some(
      (t) =>
        t.predicate === synonymDefinition.predicate &&
        t.object.literal &&
        t.object.value === value &&
        !t.object.language &&
        (!t.object.datatype || t.object.datatype === NS.xsd + "string"),
    )
  )
    return { added: false, value };
  const version = store.version;
  store.addSynonym(iri, value, synonymDefinition.predicate);
  return { added: store.version !== version, value };
}
