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
  if (status !== "available") return { added: false, value };
  store.addSynonym(iri, value, synonymDefinition.predicate);
  return { added: true, value };
}
