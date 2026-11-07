// craigtrim/axiom#205: each graph moves from connected islands to visual groups.
export const MIN_CLUSTER_LOOSENESS = 0;
export const MAX_CLUSTER_LOOSENESS = 1;
export const DEFAULT_CLUSTER_LOOSENESS = 1;
export function validClusterLooseness(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_CLUSTER_LOOSENESS &&
    value <= MAX_CLUSTER_LOOSENESS
  );
}
