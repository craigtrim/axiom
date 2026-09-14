import { parentPort, workerData } from "node:worker_threads";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
const elk = new ELK();
const { nodes, edges, mode } = workerData as {
  nodes: {
    iri: string;
    radius: number;
    pinned: boolean;
    x: number;
    y: number;
  }[];
  edges: { source: string; target: string; predicate: string }[];
  mode: string;
};
const ids = new Map(nodes.map((n, i) => [n.iri, "n" + i]));
const algorithm = {
  "elk-layered": "layered",
  "elk-stress": "stress",
  "elk-tree": "mrtree",
}[mode]!;
const graph: ElkNode = {
  id: "root",
  layoutOptions: {
    "elk.algorithm": algorithm,
    "elk.direction": "DOWN",
    "elk.spacing.nodeNode": "36",
    "elk.layered.spacing.nodeNodeBetweenLayers": "76",
    "elk.randomSeed": "42",
    "elk.stress.iterationLimit": "150",
    "elk.separateConnectedComponents": "true",
  },
  children: nodes.map((n) => ({
    id: ids.get(n.iri)!,
    width: n.radius * 2 + 24,
    height: n.radius * 2 + 28,
  })),
  edges: edges.map((e, i) => ({
    id: "e" + i,
    sources: [
      ids.get(
        e.predicate.endsWith("subClassOf") || e.predicate.endsWith("#type")
          ? e.target
          : e.source,
      )!,
    ],
    targets: [
      ids.get(
        e.predicate.endsWith("subClassOf") || e.predicate.endsWith("#type")
          ? e.source
          : e.target,
      )!,
    ],
  })),
};
elk
  .layout(graph)
  .then((result) =>
    parentPort!.postMessage({
      positions: (result.children ?? []).map((n, i) => ({
        iri: nodes[Number(n.id.slice(1))].iri,
        x: (n.x ?? 0) + (n.width ?? 0) / 2 - (result.width ?? 0) / 2,
        y: (n.y ?? 0) + (n.height ?? 0) / 2 - (result.height ?? 0) / 2,
      })),
    }),
  )
  .catch((e) => parentPort!.postMessage({ error: String(e) }));
