import { edgeKey, type GraphEdge, type GraphNode } from "./viewport";
/** Shared branch point, with no synthetic node, label, or selection handle. */
export function updateIntersectionRoutes(
  nodes: GraphNode[],
  edges: GraphEdge[],
) {
  const byId = new Map(nodes.map((n) => [n.iri, n])),
    groups = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (!edge.intersection) continue;
    const key = JSON.stringify([edge.source, edge.intersection.axiom]);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const source = byId.get(group[0].source),
      targets = group
        .map((e) => byId.get(e.target))
        .filter((n): n is GraphNode => !!n);
    if (!source || targets.length < 2) {
      for (const e of group) delete e.junction;
      continue;
    }
    const x = targets.reduce((s, n) => s + n.x, 0) / targets.length,
      y = targets.reduce((s, n) => s + n.y, 0) / targets.length;
    const junction = {
      x: source.x + (x - source.x) * 0.48,
      y: source.y + (y - source.y) * 0.48,
    };
    for (const edge of group) edge.junction = junction;
  }
}
