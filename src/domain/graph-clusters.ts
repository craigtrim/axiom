// craigtrim/axiom#185: color each connected cluster of the displayed graph.
import type { GraphEdge, GraphNode } from "./viewport";

// Ordered per-theme sequences derived in #185 from Petroff's ten-color
// sequence, kept 3:1 against each canvas, then extended by Glasbey maximin.
// The research behind the rules is in #184.
export const clusterPalette = {
  light: [
    "#3F90DA",
    "#C68101",
    "#BD1F01",
    "#832DB6",
    "#998877",
    "#227744",
    "#778899",
    "#556688",
    "#1144FF",
    "#FF4488",
    "#993355",
    "#775511",
    "#779900",
    "#EE11FF",
    "#997799",
    "#009999",
    "#226666",
    "#DD6655",
    "#556600",
    "#778866",
    "#885544",
    "#CC0099",
    "#EE6600",
    "#DD0044",
    "#117799",
    "#AA5500",
    "#998844",
    "#9966CC",
    "#119933",
    "#AA7777",
    "#775588",
    "#449977",
    "#556655",
    "#6677FF",
    "#2299BB",
    "#CC66BB",
    "#8888BB",
    "#FF0000",
    "#668888",
    "#AA7755",
    "#BB5577",
    "#0066DD",
    "#776677",
    "#993333",
    "#AA22FF",
    "#6655BB",
    "#776655",
    "#665555",
    "#227700",
    "#991188",
    "#887777",
  ],
  dark: [
    "#3F90DA",
    "#FFA90E",
    "#C22505",
    "#8F39C1",
    "#A96B59",
    "#E76300",
    "#B9AC70",
    "#666677",
    "#AACCFF",
    "#778888",
    "#00EEAA",
    "#9988AA",
    "#007700",
    "#776600",
    "#FFAAAA",
    "#CC0066",
    "#FF66FF",
    "#00DDEE",
    "#99DD00",
    "#007766",
    "#55AA55",
    "#8877FF",
    "#33AA99",
    "#EE6699",
    "#DDBBFF",
    "#995500",
    "#FF0044",
    "#0055EE",
    "#AACCAA",
    "#666655",
    "#885577",
    "#DDCC00",
    "#CC9977",
    "#007799",
    "#889900",
    "#DD22BB",
    "#22AACC",
    "#AA8800",
    "#668866",
    "#FF7766",
    "#CCAABB",
    "#7766AA",
    "#998877",
    "#8899BB",
    "#88BBBB",
    "#BB7722",
    "#22EE55",
    "#FF99DD",
    "#BB44FF",
    "#AA4444",
    "#BB8888",
    "#BB88DD",
    "#667733",
    "#FF1100",
    "#55BBFF",
    "#77DDCC",
    "#CCCCBB",
    "#AACC77",
    "#AA66AA",
    "#448888",
    "#AA6677",
    "#FF9955",
    "#886644",
    "#888866",
    "#5577AA",
    "#008855",
    "#DDBBAA",
    "#AA3388",
    "#99AA99",
    "#887777",
    "#BBBBDD",
    "#AACCDD",
    "#EEBB77",
    "#33BB88",
    "#7755EE",
    "#66BB11",
    "#AABB11",
    "#CCAA33",
    "#AAAAFF",
  ],
};

/** Connected components of two or more nodes, ignoring edge direction. */
export function graphClusters(nodes: GraphNode[], edges: GraphEdge[]) {
  const parent = new Map(nodes.map((n) => [n.iri, n.iri]));
  const root = (iri: string): string => {
    let r = iri;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(iri) !== r) {
      const next = parent.get(iri)!;
      parent.set(iri, r);
      iri = next;
    }
    return r;
  };
  for (const e of edges)
    if (parent.has(e.source) && parent.has(e.target))
      parent.set(root(e.source), root(e.target));
  const groups = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const r = root(n.iri);
    groups.set(r, [...(groups.get(r) ?? []), n]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * Numbers clusters into palette positions and stores each on node.cluster.
 * A cluster keeps the position most of its nodes held before; a split leaves
 * the position with the larger part. Unmatched clusters take the lowest free
 * positions, largest first. Returns the number of clusters.
 */
export function assignClusters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  enabled: boolean,
) {
  const clusters = graphClusters(nodes, edges);
  const previous = new Map(nodes.map((n) => [n.iri, n.cluster]));
  for (const n of nodes) delete n.cluster;
  if (!enabled) return clusters.length;
  const shares: { cluster: number; position: number; count: number }[] = [];
  clusters.forEach((members, cluster) => {
    const counts = new Map<number, number>();
    for (const n of members) {
      const p = previous.get(n.iri);
      if (p !== undefined) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    for (const [position, count] of counts)
      shares.push({ cluster, position, count });
  });
  shares.sort(
    (a, b) =>
      b.count - a.count ||
      clusters[b.cluster].length - clusters[a.cluster].length ||
      a.position - b.position,
  );
  const positions = new Map<number, number>(),
    used = new Set<number>();
  for (const s of shares)
    if (!positions.has(s.cluster) && !used.has(s.position)) {
      positions.set(s.cluster, s.position);
      used.add(s.position);
    }
  const order = clusters
    .map((members, cluster) => ({ members, cluster }))
    .filter((c) => !positions.has(c.cluster))
    .sort(
      (a, b) =>
        b.members.length - a.members.length ||
        firstIri(a.members).localeCompare(firstIri(b.members)),
    );
  let free = 0;
  for (const { cluster } of order) {
    while (used.has(free)) free++;
    positions.set(cluster, free);
    used.add(free);
  }
  clusters.forEach((members, cluster) => {
    for (const n of members) n.cluster = positions.get(cluster);
  });
  return clusters.length;
}
const firstIri = (members: GraphNode[]) =>
  members.reduce((a, n) => (n.iri < a ? n.iri : a), members[0].iri);

const fillCache = new WeakMap<
  GraphNode[],
  { dark: boolean; fills: Map<string, string> }
>();
/**
 * Fill colors for clustered nodes, or undefined while cluster colors are off
 * or fewer than two clusters are displayed. Positions past the end of the
 * sequence reuse the color whose clusters are farthest away on screen.
 */
export function clusterFills(
  g: { nodes: GraphNode[]; clusterColors?: boolean; clusterCount?: number },
  dark: boolean,
) {
  if (!g.clusterColors || (g.clusterCount ?? 0) < 2) return undefined;
  const cached = fillCache.get(g.nodes);
  if (cached?.dark === dark) return cached.fills;
  const sequence = clusterPalette[dark ? "dark" : "light"];
  const centres = new Map<number, { x: number; y: number; n: number }>();
  for (const node of g.nodes)
    if (node.cluster !== undefined) {
      const c = centres.get(node.cluster) ?? { x: 0, y: 0, n: 0 };
      c.x += node.x;
      c.y += node.y;
      c.n++;
      centres.set(node.cluster, c);
    }
  const colors = new Map<number, number>(),
    users = sequence.map(() => [] as { x: number; y: number }[]);
  const centre = (p: number) => {
    const c = centres.get(p)!;
    return { x: c.x / c.n, y: c.y / c.n };
  };
  const positions = [...centres.keys()].sort((a, b) => a - b);
  for (const p of positions)
    if (p < sequence.length) {
      colors.set(p, p);
      users[p].push(centre(p));
    }
  for (const p of positions)
    if (p >= sequence.length) {
      const here = centre(p);
      let best = 0,
        bestDistance = -1;
      users.forEach((list, color) => {
        const distance = Math.min(
          Infinity,
          ...list.map((u) => Math.hypot(u.x - here.x, u.y - here.y)),
        );
        if (distance > bestDistance) {
          best = color;
          bestDistance = distance;
        }
      });
      colors.set(p, best);
      users[best].push(here);
    }
  const fills = new Map<string, string>();
  for (const node of g.nodes)
    if (node.cluster !== undefined)
      fills.set(node.iri, sequence[colors.get(node.cluster)!]);
  fillCache.set(g.nodes, { dark, fills });
  return fills;
}
