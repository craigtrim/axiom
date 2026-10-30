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
    const r = root(n.iri),
      group = groups.get(r);
    if (group) group.push(n);
    else groups.set(r, [n]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * Numbers clusters into palette positions and stores each on node.cluster,
 * with the light and dark sequence indexes on node.clusterColor.
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
  const previous = new Map(
    nodes.map((n) => [n.iri, [n.cluster, n.clusterColor] as const]),
  );
  for (const n of nodes) {
    delete n.cluster;
    delete n.clusterColor;
  }
  if (!enabled) return clusters.length;
  const shares: { cluster: number; position: number; count: number }[] = [];
  clusters.forEach((members, cluster) => {
    const counts = new Map<number, number>();
    for (const n of members) {
      const p = previous.get(n.iri)![0];
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
  const placed = clusters
    .map((members, cluster) => {
      const position = positions.get(cluster)!;
      // A cluster that kept its position keeps the colors chosen for it.
      const kept = members
        .map((n) => previous.get(n.iri)!)
        .find(([p, color]) => p === position && color)?.[1];
      return { members, position, color: kept ? [...kept] : [] };
    })
    .sort((a, b) => a.position - b.position);
  (["light", "dark"] as const).forEach((theme, t) =>
    repeatColors(placed, t, clusterPalette[theme].length),
  );
  for (const c of placed)
    for (const n of c.members) {
      n.cluster = c.position;
      n.clusterColor = [c.color[0], c.color[1]];
    }
  return clusters.length;
}
const firstIri = (members: GraphNode[]) =>
  members.reduce((a, n) => (n.iri < a ? n.iri : a), members[0].iri);

/**
 * Gives each cluster its sequence index for one theme. Positions inside the
 * sequence use their own index; a new position past its end reuses the color
 * whose nearest cluster is farthest away on screen. A grid scanned outward
 * from the new cluster stops once no unscanned cluster could be nearer, or
 * after a bounded number of clusters, so uneven layouts stay fast.
 */
function repeatColors(
  placed: { members: GraphNode[]; position: number; color: number[] }[],
  t: number,
  length: number,
) {
  for (const c of placed) if (c.position < length) c.color[t] = c.position;
  const pending = placed.filter((c) => c.color[t] === undefined);
  if (!pending.length) return;
  const centre = (members: GraphNode[]) => ({
    x: members.reduce((s, n) => s + n.x, 0) / members.length,
    y: members.reduce((s, n) => s + n.y, 0) / members.length,
  });
  const centres = new Map(placed.map((c) => [c, centre(c.members)]));
  // The grid covers the middle 90% of centres; outliers clamp to edge cells,
  // which can only make them look nearer, so the stopping rule stays sound.
  const middle = (values: number[]) => {
    values.sort((a, b) => a - b);
    return [
      values[Math.floor(values.length * 0.05)],
      values[Math.ceil(values.length * 0.95) - 1],
    ];
  };
  const [left, right] = middle([...centres.values()].map((p) => p.x)),
    [top, bottom] = middle([...centres.values()].map((p) => p.y)),
    columns = Math.ceil(Math.sqrt(placed.length)),
    size = Math.max(right - left, bottom - top, 1) / columns;
  const index = (v: number, start: number) =>
    Math.min(columns - 1, Math.max(0, Math.floor((v - start) / size)));
  const grid: { x: number; y: number; color: number }[][] = [],
    users = new Array<number>(length).fill(0),
    limit = 8 * length;
  const add = (p: { x: number; y: number }, color: number) => {
    (grid[index(p.y, top) * columns + index(p.x, left)] ??= []).push({
      ...p,
      color,
    });
    users[color]++;
  };
  for (const c of placed)
    if (c.color[t] !== undefined) add(centres.get(c)!, c.color[t]);
  for (const c of pending) {
    const here = centres.get(c)!;
    let color = users.indexOf(0);
    if (color < 0) {
      const nearest = new Array<number>(length).fill(Infinity),
        cx = index(here.x, left),
        cy = index(here.y, top);
      let unseen = length,
        examined = 0;
      const scan = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= columns || y >= columns) return;
        for (const u of grid[y * columns + x] ?? []) {
          if (examined++ >= limit) return;
          const d = Math.hypot(u.x - here.x, u.y - here.y);
          if (nearest[u.color] === Infinity) unseen--;
          if (d < nearest[u.color]) nearest[u.color] = d;
        }
      };
      // Walk only each ring's border; cells beyond ring r are at least r cells away.
      for (let ring = 0; ring < columns && examined < limit; ring++) {
        for (let i = -ring; i <= ring; i++) {
          scan(cx + i, cy - ring);
          if (ring) scan(cx + i, cy + ring);
        }
        for (let j = 1 - ring; j < ring; j++) {
          scan(cx - ring, cy + j);
          scan(cx + ring, cy + j);
        }
        if (!unseen && ring * size >= Math.max(...nearest)) break;
      }
      // A color not met within the limit is farther than every color met;
      // among those, the least used one spreads repeats evenly.
      color = unseen
        ? nearest.reduce(
            (best, d, i) =>
              d === Infinity && (best < 0 || users[i] < users[best]) ? i : best,
            -1,
          )
        : nearest.indexOf(Math.max(...nearest));
    }
    c.color[t] = color;
    add(here, color);
  }
}

const fillCache = new WeakMap<
  GraphNode[],
  { dark: boolean; fills: Map<string, string> }
>();
/**
 * Fill colors for clustered nodes, or undefined while cluster colors are off
 * or fewer than two clusters are displayed.
 */
export function clusterFills(
  g: { nodes: GraphNode[]; clusterColors?: boolean; clusterCount?: number },
  dark: boolean,
) {
  if (!g.clusterColors || (g.clusterCount ?? 0) < 2) return undefined;
  const cached = fillCache.get(g.nodes);
  if (cached?.dark === dark) return cached.fills;
  const sequence = clusterPalette[dark ? "dark" : "light"],
    fills = new Map<string, string>();
  for (const n of g.nodes)
    if (n.clusterColor)
      fills.set(n.iri, sequence[n.clusterColor[dark ? 1 : 0]]);
  fillCache.set(g.nodes, { dark, fills });
  return fills;
}
