// craigtrim/axiom#205: motion keeps durable membership; metadata requests reuse it.
import { expect, it, vi } from "vitest";
import * as clustering from "../../src/domain/graph-clusters";
import { Viewport, type GraphNode } from "../../src/domain/viewport";
import { buildEmptyStore } from "../../src/domain/workspace";
import { GraphClusterState } from "../../src/main/graph-cluster-state";

function fixture() {
  const view = new Viewport(buildEmptyStore());
  for (let i = 0; i < 8; i++) {
    const node = {
      iri: "urn:node:" + i,
      x: (i < 4 ? 0 : 100) + (i % 2),
      y: Math.floor((i % 4) / 2),
    } as GraphNode;
    view.nodes.set(node.iri, node);
  }
  view.clusterColors = true;
  return { view, cache: new GraphClusterState() };
}

it("keeps old memberships during motion and leaves new nodes grey until settling", () => {
  const { view, cache } = fixture();
  expect(cache.update(view, false)).toEqual({ count: 2, pending: false });
  const previous = [...view.nodes.values()].map((node) => node.cluster);
  for (const node of [...view.nodes.values()].slice(4)) node.x -= 98;
  const added = { iri: "urn:new", x: 4, y: 0 } as GraphNode;
  view.nodes.set(added.iri, added);
  view.revision++;
  expect(cache.update(view, true)).toEqual({ count: 2, pending: true });
  expect(
    [...view.nodes.values()].slice(0, 8).map((node) => node.cluster),
  ).toEqual(previous);
  expect(added.cluster).toBeUndefined();
  expect(cache.update(view, false)).toEqual({ count: 1, pending: false });
  expect(added.cluster).toEqual(expect.any(Number));
});

it("reuses geometry for repeated metadata requests and color toggles", () => {
  const { view, cache } = fixture();
  const computation = vi.spyOn(clustering, "graphClusters");
  try {
    cache.update(view, false);
    for (let i = 0; i < 20; i++) {
      view.selected = "urn:node:" + (i % 8);
      cache.update(view, false);
    }
    view.clusterColors = false;
    expect(cache.update(view, false).count).toBe(2);
    expect(
      [...view.nodes.values()].every((node) => node.cluster === undefined),
    ).toBe(true);
    view.clusterColors = true;
    expect(cache.update(view, false).count).toBe(2);
    expect(computation).toHaveBeenCalledTimes(1);
    cache.invalidate();
    cache.update(view, false);
    expect(computation).toHaveBeenCalledTimes(2);
  } finally {
    computation.mockRestore();
  }
});

it("recomputes changed settings and projects surviving membership while moving", () => {
  const { view, cache } = fixture();
  cache.update(view, false);
  view.nodes.delete("urn:node:0");
  view.revision++;
  expect(cache.update(view, true)).toEqual({ count: 2, pending: true });
  view.clusterLooseness = 0;
  expect(cache.update(view, false)).toEqual({ count: 0, pending: false });
  expect(
    [...view.nodes.values()].every((node) => node.cluster === undefined),
  ).toBe(true);
  view.nodes.clear();
  view.revision++;
  expect(cache.update(view, true)).toEqual({ count: 0, pending: false });
});
