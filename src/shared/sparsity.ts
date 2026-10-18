export interface SparsityOptions {
  iri: string;
  namespace: string;
  descendantWeight: number;
  minimumScore: number;
  includeLeaves: boolean;
  text: string;
  report: boolean;
  open: string[];
  selected: string;
  page: number;
  request: number;
}
export const defaultSparsityOptions: SparsityOptions = {
  iri: "",
  namespace: "",
  descendantWeight: 20,
  minimumScore: 25,
  includeLeaves: true,
  text: "",
  report: false,
  open: [],
  selected: "",
  page: 0,
  request: 0,
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
    // craigtrim/axiom#90: saved intermediate values select the nearest influence chip.
    descendantWeight: Math.round(bounded(s.descendantWeight, 20, 40) / 10) * 10,
    minimumScore: bounded(s.minimumScore, 25, 100),
    includeLeaves: s.includeLeaves !== false,
    text: typeof s.text === "string" ? s.text.slice(0, 256) : "",
    report: s.report === true,
    open: Array.isArray(s.open)
      ? [
          ...new Set(
            s.open.filter(
              (iri): iri is string =>
                typeof iri === "string" && iri.length <= 10000,
            ),
          ),
        ].slice(0, 100000)
      : [],
    selected: typeof s.selected === "string" ? s.selected.slice(0, 20010) : "",
    page: bounded(s.page, 0, 1000000),
    request: bounded(s.request, 0, Number.MAX_SAFE_INTEGER),
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
  siblingOrder: number;
}
export interface SparsityReport {
  iri: string;
  name: string;
  version: number;
  classes: number;
  groups: number;
  unpaired: number;
  excluded: number;
  compared: number;
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
  return Math.round(
    100 * ((1 - w) * row.directDeficit + w * row.descendantDeficit),
  );
}

export function scoreSparsityRows(rows: SparsityRow[], weight: number) {
  return rows
    .map((row) => ({ ...row, score: sparsityScore(row, weight) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.name.localeCompare(b.name) ||
        a.parent.localeCompare(b.parent) ||
        a.iri.localeCompare(b.iri),
    );
}

export const sparsityRowKey = (row: Pick<SparsityRow, "parent" | "iri">) =>
  JSON.stringify([row.parent, row.iri]);
export interface SparsityGroup {
  parent: string;
  name: string;
  all: SparsityRow[];
  rows: SparsityRow[];
  mean: number;
  highest: number;
}
export function groupSparsityRows(
  rows: SparsityRow[],
  options: SparsityOptions,
): SparsityGroup[] {
  const groups = new Map<string, SparsityGroup>();
  const text = options.text.trim().toLocaleLowerCase();
  for (const row of rows) {
    let group = groups.get(row.parent);
    if (!group) {
      group = {
        parent: row.parent,
        name: row.parentName,
        all: [],
        rows: [],
        mean: 0,
        highest: 0,
      };
      groups.set(row.parent, group);
    }
    group.all.push(row);
    group.mean += row.children;
    group.highest = Math.max(group.highest, row.score);
    if (
      row.score > 0 &&
      row.score >= options.minimumScore &&
      (options.includeLeaves || row.children > 0) &&
      (!text ||
        row.name.toLocaleLowerCase().includes(text) ||
        row.parentName.toLocaleLowerCase().includes(text))
    )
      group.rows.push(row);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      mean: group.mean / group.all.length,
      all: group.all.sort(
        (a, b) => b.children - a.children || a.siblingOrder - b.siblingOrder,
      ),
      rows: group.rows.sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      ),
    }))
    .filter((group) => group.rows.length)
    .sort((a, b) => b.highest - a.highest || a.name.localeCompare(b.name));
}
export function pageSparsityGroups(
  groups: SparsityGroup[],
  open: string[],
  requested: number,
) {
  const expanded = new Set(open);
  const entries = groups.flatMap((group) => [
    { group, row: undefined as SparsityRow | undefined },
    ...(expanded.has(group.parent)
      ? group.rows.map((row) => ({ group, row }))
      : []),
  ]);
  const pages = Math.max(1, Math.ceil(entries.length / 40)),
    page = Math.max(0, Math.min(requested, pages - 1));
  const visible = entries.slice(page * 40, (page + 1) * 40);
  if (visible[0]?.row)
    visible.unshift({ group: visible[0].group, row: undefined });
  return { pages, page, entries: visible };
}
