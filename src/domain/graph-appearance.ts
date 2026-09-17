import { Store } from "./store";
import { Viewport, nodeRadius } from "./viewport";
import { kindLabel, NS, type Kind } from "./model";
import { taxonomyChildren, namedClass } from "./class-expressions";
import { styleRules, styledRadius, type NodeStyleMetrics } from "./graph-style";

export interface StyleCategory {
  id: string;
  label: string;
  count: number;
  kind?: Kind;
}
export interface GraphStyleCatalog {
  version: number;
  nodes: number;
  relationships: number;
  kinds: StyleCategory[];
  classes: StyleCategory[];
  predicates: StyleCategory[];
  maximums: { connections: number; instances: number; count: number };
}
interface Analysis {
  catalog: GraphStyleCatalog;
  metrics: Map<string, NodeStyleMetrics>;
}
const cache = new WeakMap<Store, Analysis>();
export function graphStyleAnalysis(store: Store): Analysis {
  const previous = cache.get(store);
  if (previous?.catalog.version === store.version) return previous;
  const iris = new Set([
    ...store.entities.keys(),
    ...store.individualIndex.keys(),
    ...store.customerIndex.keys(),
  ]);
  const kinds = new Map<Kind, number>(),
    predicates = new Map<string, number>();
  const metrics = new Map<string, NodeStyleMetrics>();
  let relationships = 0,
    maxConnections = 0,
    maxInstances = 0;
  for (const iri of iris) {
    if (!store.graphVisible(iri)) continue;
    const kind = store.kind(iri);
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    const connections = store.neighbours(iri, undefined, (edge) => {
      if (edge.outgoing && store.graphVisible(edge.iri)) {
        relationships++;
        predicates.set(
          edge.predicate,
          (predicates.get(edge.predicate) ?? 0) + 1,
        );
      }
    }).total;
    const instances = store.instanceCount(iri);
    maxConnections = Math.max(maxConnections, connections);
    maxInstances = Math.max(maxInstances, instances);
    metrics.set(iri, {
      connections,
      instances,
      count: 0,
      maxConnections: 0,
      maxInstances: 0,
      maxCount: 0,
    });
  }
  const maxCount = Math.max(0, ...kinds.values());
  for (const [iri, m] of metrics)
    Object.assign(m, {
      count: kinds.get(store.kind(iri)) ?? 0,
      maxConnections,
      maxInstances,
      maxCount,
    });
  const sort = (items: StyleCategory[]) =>
    items.sort(
      (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
    );
  const catalog: GraphStyleCatalog = {
    version: store.version,
    nodes: metrics.size,
    relationships,
    kinds: sort(
      [...kinds].map(([kind, count]) => ({
        id: kind,
        label: kindLabel(kind),
        count,
        kind,
      })),
    ),
    classes: sort(
      [...store.entities.values()].filter(namedClass).map((e) => ({
        id: e.iri,
        label: store.label(e.iri),
        count: store.instanceCount(e.iri),
        kind: e.kind,
      })),
    ),
    predicates: sort(
      [...predicates].map(([id, count]) => ({
        id,
        label: store.label(id),
        count,
      })),
    ),
    maximums: {
      connections: maxConnections,
      instances: maxInstances,
      count: maxCount,
    },
  };
  const result = { catalog, metrics };
  cache.set(store, result);
  return result;
}
const ancestryCache = new WeakMap<
  Store,
  { version: number; key: string; members: Map<string, string[]> }
>();
function styledAncestors(store: Store, roots: string[]) {
  const key = roots.join("\n"),
    prior = ancestryCache.get(store);
  if (prior?.version === store.version && prior.key === key)
    return prior.members;
  const members = new Map<string, string[]>();
  for (const root of roots) {
    const pending = [root],
      seen = new Set<string>();
    while (pending.length) {
      const iri = pending.pop()!;
      if (seen.has(iri)) continue;
      seen.add(iri);
      const matches = members.get(iri) ?? [];
      matches.push(root);
      members.set(iri, matches);
      pending.push(...taxonomyChildren(store.entities.get(iri)));
    }
  }
  ancestryCache.set(store, { version: store.version, key, members });
  return members;
}
export function applyGraphAppearance(view: Viewport, text: string) {
  const rules = styleRules(text);
  const ancestors = styledAncestors(view.store, [
    ...new Set(
      rules.filter((r) => r.attribute === "ancestor").map((r) => r.value!),
    ),
  ]);
  const needsMetrics = rules.some(
    (r) =>
      r.values["size-by"] && !["auto", "fixed"].includes(r.values["size-by"]),
  );
  const analysis = needsMetrics ? graphStyleAnalysis(view.store) : undefined;
  for (const n of view.nodes.values()) {
    n.taxonomyAncestors = ancestors.get(n.iri);
    n.baseRadius = nodeRadius(n.degree, n.kind);
    n.types = view.store.resolve(n.iri)?.types;
    if (view.store.individualIndex.has(n.iri))
      n.types = [...new Set([...(n.types ?? []), NS.demo + "Order"])];
    n.styleMetrics = analysis?.metrics.get(n.iri);
    n.radius = styledRadius(n, text);
  }
}

// Paul Tol's qualitative schemes, in the author's recommended order.
// https://sronpersonalpages.nl/~pault/ (accessed 2026-09-16)
export const graphPalettes = [
  {
    id: "bright",
    label: "Tol Bright",
    colors: [
      "#4477aa",
      "#ee6677",
      "#228833",
      "#ccbb44",
      "#66ccee",
      "#aa3377",
      "#bbbbbb",
    ],
  },
  {
    id: "muted",
    label: "Tol Muted",
    colors: [
      "#cc6677",
      "#332288",
      "#ddcc77",
      "#117733",
      "#88ccee",
      "#882255",
      "#44aa99",
      "#999933",
      "#aa4499",
    ],
  },
  {
    id: "contrast",
    label: "Tol High Contrast",
    colors: ["#004488", "#ddaa33", "#bb5566"],
  },
] as const;
