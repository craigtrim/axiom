export interface SparsityOptions {
  iri: string;
  namespace: string;
  descendantWeight: number;
  minimumScore: number;
  includeLeaves: boolean;
  text: string;
}
export const defaultSparsityOptions: SparsityOptions = {
  iri: "",
  namespace: "",
  descendantWeight: 20,
  minimumScore: 25,
  includeLeaves: true,
  text: "",
};
export function readSparsityOptions(value: unknown): SparsityOptions {
  const s =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const bounded = (v: unknown, fallback: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.round(Math.max(0, Math.min(max, v)))
      : fallback;
  return {
    iri: typeof s.iri === "string" ? s.iri.slice(0, 10000) : "",
    namespace:
      typeof s.namespace === "string" ? s.namespace.slice(0, 10000) : "",
    descendantWeight: bounded(s.descendantWeight, 20, 40),
    minimumScore: bounded(s.minimumScore, 25, 100),
    includeLeaves: s.includeLeaves !== false,
    text: typeof s.text === "string" ? s.text.slice(0, 256) : "",
  };
}
export interface SparsityRow {
  iri: string;
  name: string;
  parent: string;
  parentName: string;
  children: number;
  nearby: number;
  discounted: number;
  peerChildren: number;
  peerDiscounted: number;
  peers: number;
  depth: number;
  directDeficit: number;
  descendantDeficit: number;
  score: number;
}
export interface SparsityReport {
  iri: string;
  name: string;
  version: number;
  classes: number;
  groups: number;
  unpaired: number;
  cycleClasses: number;
  excludedBranches: number;
  sharedClasses: number;
  elapsedMs: number;
  rows: SparsityRow[];
}
// These weights are an Axiom heuristic, not a published or calibrated estimator.
export function sparsityScore(
  row: Pick<
    SparsityRow,
    "directDeficit" | "descendantDeficit" | "peerDiscounted"
  >,
  weight: number,
) {
  const w = row.peerDiscounted > 0 ? weight / 100 : 0;
  return 100 * ((1 - w) * row.directDeficit + w * row.descendantDeficit);
}

export function scoreSparsityRows(rows: SparsityRow[], weight: number) {
  return rows
    .map((row) => ({ ...row, score: sparsityScore(row, weight) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.peerChildren - a.peerChildren ||
        a.name.localeCompare(b.name) ||
        a.parent.localeCompare(b.parent) ||
        a.iri.localeCompare(b.iri),
    );
}
