import type { Store } from "./store";
import { entityNameKey } from "../shared/entity-names";
import { displayName } from "./rdf-model";
import { NS } from "./model";
import { entityPath } from "./entity-path";
import type { FindCollision } from "../shared/find-create";
const cache = new WeakMap<
  Store,
  {
    version: number;
    names: Map<string, Set<string>>;
    labels: Map<string, Set<string>>;
    total: number;
    entities: Set<string>;
  }
>();
const exactLabel = (label: string) =>
  label.normalize("NFKC").replace(/\s+/gu, " ").trim();
function namesFor(store: Store) {
  let entry = cache.get(store);
  if (entry?.version === store.version) return entry;
  const names = new Map<string, Set<string>>(),
    labels = new Map<string, Set<string>>(),
    entities = new Set<string>();
  const add = (iri: string, label: string) => {
    if (iri.startsWith("_:")) return;
    entities.add(iri);
    const key = entityNameKey(label);
    if (!key) return;
    const ids = names.get(key) ?? new Set<string>();
    ids.add(iri);
    names.set(key, ids);
    const exact = exactLabel(label),
      matches = labels.get(exact) ?? new Set<string>();
    matches.add(iri);
    labels.set(exact, matches);
  };
  for (const entity of store.entities.values())
    add(entity.iri, displayName(entity));
  for (const entity of store.individuals) add(entity.iri, entity.reference);
  for (const entity of store.customers) add(entity.iri, entity.name);
  for (const triple of store.scan())
    if (
      triple.predicate === NS.rdfs + "label" &&
      triple.object.literal &&
      entities.has(triple.subject)
    )
      add(triple.subject, triple.object.value);
  entry = {
    version: store.version,
    names,
    labels,
    total: entities.size,
    entities,
  };
  cache.set(store, entry);
  return entry;
}
export function entityNameCollisions(
  store: Store,
  label: string,
  subject = "",
  exactLabels = false,
) {
  const index = namesFor(store),
    ids = new Set(index.names.get(entityNameKey(label)) ?? []);
  if (
    subject &&
    (store.exists(subject) ||
      store.bySubject.has(subject) ||
      store.byPredicate.has(subject) ||
      store.reverse.has(subject))
  )
    ids.add(subject);
  const collisions: FindCollision[] = [...ids].sort().map((iri) => {
    const existing = store.label(iri);
    return {
      iri,
      label: existing,
      path: entityPath(store, iri),
      openable: index.entities.has(iri),
      kind: exactLabels
        ? iri === subject
          ? "iri"
          : index.labels.get(exactLabel(label))?.has(iri)
            ? "exact"
            : "normalized"
        : existing.normalize("NFKC").trim().toLowerCase() ===
            label.normalize("NFKC").trim().toLowerCase()
          ? "exact"
          : index.names.get(entityNameKey(label))?.has(iri)
            ? "normalized"
            : "iri",
    };
  });
  return { collisions, total: index.total };
}
