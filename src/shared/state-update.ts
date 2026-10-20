// #125: main and renderer apply the same ordered entity patches.
import type { EntityChanges, Snapshot, StateUpdate } from "./protocol";

function patchEntities(previous: Snapshot["entities"], patch?: EntityChanges) {
  if (
    !patch ||
    (!patch.changed.length && !patch.removed.length && !patch.positions?.length)
  )
    return previous;
  const records = new Map(previous.map((entity) => [entity.iri, entity]));
  for (const iri of patch.removed) records.delete(iri);
  for (const entity of patch.changed) records.set(entity.iri, entity);
  if (!patch.positions?.length) return [...records.values()];
  const result: Snapshot["entities"] = new Array(records.size);
  const placed = new Set<string>();
  for (const { iri, index } of patch.positions) {
    result[index] = records.get(iri)!;
    placed.add(iri);
  }
  let index = 0;
  for (const entity of records.values()) {
    if (placed.has(entity.iri)) continue;
    while (result[index]) index++;
    result[index++] = entity;
  }
  return result;
}
export function mergeState(
  previous: Snapshot | null | undefined,
  update: StateUpdate,
): Snapshot | undefined {
  const { entityChanges, ...state } = update;
  if (!previous || previous.datasetEpoch !== update.datasetEpoch) {
    // A newly opened window waits for its full state request before using deltas.
    if (!update.entities || !update.types || !update.customers)
      return undefined;
    return state as Snapshot;
  }
  const unchanged = previous.version === update.version;
  return {
    ...state,
    entities: unchanged
      ? previous.entities
      : (update.entities ?? patchEntities(previous.entities, entityChanges)),
    types: unchanged ? previous.types : (update.types ?? previous.types),
    customers: unchanged
      ? previous.customers
      : (update.customers ?? previous.customers),
  };
}
