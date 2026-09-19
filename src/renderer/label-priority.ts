import type { GraphNode } from "../domain/viewport";
import type { GraphSnapshot } from "../shared/protocol";
import { nodeRelevance } from "../domain/graph-relevance";

type RankedLabels = {
  revision: number;
  base: GraphNode[];
  focus?: string[];
  selected?: string | null;
  hover?: string | null;
  ordered?: GraphNode[];
};
const cache = new WeakMap<GraphNode[], RankedLabels>();

/** Reuse ranking during zoom, pan and layout motion; snapshots replace metadata. */
export function labelOrder(
  g: GraphSnapshot,
  selected: string | null,
  hover: string | null,
): readonly GraphNode[] {
  let ranked = cache.get(g.nodes);
  if (!ranked || ranked.revision !== g.revision) {
    let maxConnections = 0,
      maxInstances = 0;
    for (const n of g.nodes) {
      maxConnections = Math.max(maxConnections, n.degree);
      maxInstances = Math.max(maxInstances, n.styleMetrics?.instances ?? 0);
    }
    const scored = g.nodes.map((n) => ({
      n,
      score:
        n.relevance ??
        nodeRelevance(
          n.styleMetrics ?? {
            connections: n.degree,
            instances: 0,
            maxConnections,
            maxInstances,
          },
        ),
    }));
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.n.shownDegree - a.n.shownDegree ||
        (a.n.iri < b.n.iri ? -1 : a.n.iri > b.n.iri ? 1 : 0),
    );
    ranked = { revision: g.revision, base: scored.map(({ n }) => n) };
    cache.set(g.nodes, ranked);
  }
  if (
    ranked.ordered &&
    ranked.focus === g.focus &&
    ranked.selected === selected &&
    ranked.hover === hover
  )
    return ranked.ordered;
  const focus = new Set(g.focus),
    buckets: GraphNode[][] = [[], [], [], [], []];
  for (const n of ranked.base) {
    const tier = focus.has(n.iri)
      ? 0
      : n.iri === selected
        ? 1
        : n.iri === hover
          ? 2
          : n.pinned
            ? 3
            : 4;
    buckets[tier].push(n);
  }
  ranked.focus = g.focus;
  ranked.selected = selected;
  ranked.hover = hover;
  ranked.ordered = buckets.flat();
  return ranked.ordered;
}
