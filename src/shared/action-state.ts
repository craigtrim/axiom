/** Collection actions show their size and remain visible but disabled when empty. */
export const countLabel = (label: string, count: number) =>
  label + " (" + count.toLocaleString("en-GB") + ")";

// craigtrim/axiom#200: Color clusters stays visible and says why it is unavailable below two clusters.
export function clusterColorsAction(graph?: {
  nodes: unknown[];
  clusterCount?: number;
}) {
  const clusters = graph?.clusterCount ?? 0;
  return {
    enabled: clusters > 1,
    title:
      clusters > 1
        ? "Give each group of connected nodes its own color."
        : !graph?.nodes.length
          ? "Needs two or more clusters. The graph shows no nodes."
          : clusters === 1
            ? "Needs two or more clusters. The displayed nodes form one connected cluster; hide nodes to split it."
            : "Needs two or more clusters. No displayed nodes are connected to each other.",
  };
}

export function instanceAction(entity?: { kind: string; instances: number }) {
  const visible = !!entity && ["Class", "Defined"].includes(entity.kind);
  const count = visible ? entity.instances : 0;
  return {
    label: countLabel("Show instances", count),
    count,
    visible,
    enabled: count > 0,
    title: !visible
      ? "Select a class to show its instances."
      : count === 0
        ? "This class has no direct instances."
        : "Show " +
          count.toLocaleString("en-GB") +
          " direct " +
          (count === 1 ? "instance" : "instances") +
          ".",
  };
}
