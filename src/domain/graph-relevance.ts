import type { NodeStyleMetrics } from "./graph-style";

/** Equal influence for connectivity and direct instances, despite different scales. */
export function nodeRelevance(
  m: Pick<
    NodeStyleMetrics,
    "connections" | "instances" | "maxConnections" | "maxInstances"
  >,
): number {
  const normal = (count: number, maximum: number) =>
    maximum > 0
      ? Math.min(1, Math.log1p(Math.max(0, count)) / Math.log1p(maximum))
      : 0;
  return (
    (normal(m.connections, m.maxConnections) +
      normal(m.instances, m.maxInstances)) /
    2
  );
}
