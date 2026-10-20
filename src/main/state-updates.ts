// #125: project catalogs once per store revision and broadcast only changed records.
import type { Store } from "../domain/store";
import type { EntityChanges, Snapshot, StateUpdate } from "../shared/protocol";
type Catalog = Pick<
  Snapshot,
  | "entities"
  | "types"
  | "customers"
  | "classCount"
  | "propertyCount"
  | "individualCount"
  | "orderCount"
  | "customerCount"
  | "tripleCount"
>;
interface Projection {
  store: Store;
  epoch: number;
  version: number;
  catalog: Catalog;
  signatures: Map<string, string>;
  types: string;
  customers: string;
}
export class StateUpdates {
  private current?: Projection;
  private published?: Projection;
  catalog(store: Store, epoch: number): Catalog {
    if (
      this.current?.store === store &&
      this.current.epoch === epoch &&
      this.current.version === store.version
    )
      return this.current.catalog;
    const entities = [...store.entities.values()].map((entity) => ({
      ...entity,
      instances: store.instanceCount(entity.iri),
      assertions: store.assertionCounts.get(entity.iri) ?? 0,
      descendants: store.descendantCount(entity.iri),
    }));
    const catalog: Catalog = {
      entities,
      types: store.ontology.example
        ? [...store.byType.keys()]
        : entities
            .filter((e) => ["Class", "Defined"].includes(e.kind))
            .map((e) => e.iri),
      customers: store.customers,
      classCount: store.classCount,
      propertyCount: store.propertyCount,
      individualCount: store.individualCount,
      orderCount: store.individuals.length,
      customerCount: store.customers.length,
      tripleCount: store.tripleCount,
    };
    this.current = {
      store,
      epoch,
      version: store.version,
      catalog,
      // Retain values independently of any mutable arrays in the domain store.
      signatures: new Map(entities.map((e) => [e.iri, JSON.stringify(e)])),
      types: JSON.stringify(catalog.types),
      customers: JSON.stringify(catalog.customers),
    };
    return catalog;
  }
  event(snapshot: Snapshot): StateUpdate {
    const current = this.current!,
      previous = this.published;
    this.published = current;
    if (!previous || previous.epoch !== current.epoch) return snapshot;
    const { entities, types, customers, ...view } = snapshot;
    if (previous === current) return view;
    const changed = entities.filter(
      (e) => previous.signatures.get(e.iri) !== current.signatures.get(e.iri),
    );
    const removed = [...previous.signatures.keys()].filter(
      (iri) => !current.signatures.has(iri),
    );
    const retained = previous.catalog.entities
      .filter((e) => current.signatures.has(e.iri))
      .map((e) => e.iri);
    const nextRetained = entities.filter((e) => previous.signatures.has(e.iri));
    const reordered = nextRetained.some((e, i) => e.iri !== retained[i]);
    const positions = entities.flatMap((e, index) =>
      reordered || !previous.signatures.has(e.iri)
        ? [{ iri: e.iri, index }]
        : [],
    );
    const entityChanges: EntityChanges = {
      changed,
      removed,
      ...(positions.length ? { positions } : {}),
    };
    return {
      ...view,
      ...(changed.length || removed.length || positions.length
        ? { entityChanges }
        : {}),
      ...(current.types !== previous.types ? { types } : {}),
      ...(current.customers !== previous.customers ? { customers } : {}),
    };
  }
}
