// #125: catalog patches retain order and references without scanning entities on view changes.
import { expect, it, vi } from "vitest";
import { Store } from "../../src/domain/store";
import { entity } from "../../src/domain/model";
import { StateUpdates } from "../../src/main/state-updates";
import { mergeState } from "../../src/shared/state-update";
import type { Snapshot } from "../../src/shared/protocol";
function store(count: number) {
  const value = new Store();
  value.ontology.example = false;
  value.entities = new Map(
    Array.from({ length: count }, (_, i) => {
      const e = entity("urn:class:" + i, "Class");
      return [e.iri, e];
    }),
  );
  return value;
}
function snapshot(updates: StateUpdates, source: Store, epoch = 1): Snapshot {
  return {
    ...updates.catalog(source, epoch),
    ontology: source.ontology,
    datasetEpoch: epoch,
    version: source.version,
    canUndo: false,
    canRedo: false,
    selected: null,
    message: "Ready",
    dirty: false,
    graph: { budget: 1000, nodes: [], edges: [], selectedEdge: null } as any,
  };
}
it("makes view-only events independent of entity and type-list size and preserves renderer references", async () => {
  vi.stubGlobal("document", {});
  try {
    const client = await import("../../src/renderer/client");
    const sizes: number[] = [];
    for (const count of [10, 21461]) {
      const source = store(count),
        updates = new StateUpdates();
      const initial = structuredClone(
        updates.event(snapshot(updates, source, count)),
      );
      client.setState(initial);
      const entities = client.state!.entities;
      const counts = vi.spyOn(source, "descendantCount");
      const view = updates.event(snapshot(updates, source, count));
      expect(counts).not.toHaveBeenCalled();
      expect(view).not.toHaveProperty("entities");
      expect(view).not.toHaveProperty("entityChanges");
      expect(view).not.toHaveProperty("types");
      expect(view).not.toHaveProperty("customers");
      client.setState(view);
      expect(client.state!.entities).toBe(entities);
      // Explicit full refreshes of the same revision retain memoized catalogs too.
      client.setState(structuredClone(snapshot(updates, source, count)));
      expect(client.state!.entities).toBe(entities);
      sizes.push(Buffer.byteLength(JSON.stringify(view)));
    }
    expect(sizes[1] - sizes[0]).toBeLessThan(30);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("patches reordered, inserted and removed records in full-snapshot order while keeping unchanged objects", () => {
  const source = store(4),
    updates = new StateUpdates();
  let before = mergeState(
    undefined,
    structuredClone(updates.event(snapshot(updates, source))),
  )!;
  const unchanged = before.entities[2];
  const next = entity("urn:new", "Individual");
  source.entities = new Map([
    [
      source.entities.get("urn:class:2")!.iri,
      source.entities.get("urn:class:2")!,
    ],
    [next.iri, next],
    [
      source.entities.get("urn:class:0")!.iri,
      source.entities.get("urn:class:0")!,
    ],
  ]);
  source.version++;
  let full = snapshot(updates, source);
  let change = structuredClone(updates.event(full));
  expect(change.entityChanges!.changed.map((e) => e.iri)).toEqual([next.iri]);
  expect(change.entityChanges!.removed).toEqual(["urn:class:1", "urn:class:3"]);
  const after = mergeState(before, change)!;
  expect(after.entities).toEqual(full.entities);
  expect(after.entities[0]).toBe(unchanged);
  before = after;
  // Capture signature values, even if a domain mutation changes a nested array in place.
  source.entities.get("urn:class:0")!.children.push("urn:class:2");
  source.version++;
  full = snapshot(updates, source);
  change = structuredClone(updates.event(full));
  expect(change.entityChanges!.changed.map((e) => e.iri)).toEqual([
    "urn:class:0",
  ]);
  expect(mergeState(before, change)!.entities).toEqual(full.entities);
});
it("starts a new dataset with full catalogs and waits for a complete initial snapshot", () => {
  const updates = new StateUpdates(),
    source = store(2);
  const initial = updates.event(snapshot(updates, source));
  const prior = mergeState(undefined, structuredClone(initial))!;
  const view = updates.event(snapshot(updates, source));
  expect(mergeState(undefined, view)).toBeUndefined();
  const replacement = updates.event(snapshot(updates, store(0), 2));
  expect(replacement.entities).toEqual([]);
  expect(mergeState(prior, replacement)!.entities).toEqual([]);
});
