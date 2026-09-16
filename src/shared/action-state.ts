/** Collection actions show their size and remain visible but disabled when empty. */
export const countLabel = (label: string, count: number) =>
  label + " (" + count.toLocaleString("en-GB") + ")";

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
