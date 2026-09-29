export type SuggestionStatus = "available" | "added" | "exists" | "unavailable";
export type SuggestionFilter = "all" | "available" | "added" | "exists";
export type SuggestionSort = {
  column: "label" | "status" | "distance" | "semanticDistance";
  direction: "ascending" | "descending";
} | null;
export interface SuggestionItem {
  id: string;
  index: number;
  label: string;
  definition: string;
  reason: string;
  reasonTitle?: string;
  distance?: number;
  semanticDistance?: number;
  status: SuggestionStatus;
  issue: string | null;
}
export function visibleSuggestions<T extends SuggestionItem>(
  items: T[],
  filter: SuggestionFilter,
  query: string,
  sort: SuggestionSort,
) {
  const needle = query.trim().toLocaleLowerCase();
  const rows = items.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      (!needle ||
        (item.label + " " + item.definition)
          .toLocaleLowerCase()
          .includes(needle)),
  );
  if (sort) {
    const rank = { available: 0, added: 1, exists: 2, unavailable: 3 };
    rows.sort((a, b) => {
      if (sort.column === "semanticDistance") {
        if (
          a.semanticDistance === undefined &&
          b.semanticDistance !== undefined
        )
          return 1;
        if (
          b.semanticDistance === undefined &&
          a.semanticDistance !== undefined
        )
          return -1;
      }
      const av =
        sort.column === "status"
          ? rank[a.status]
          : sort.column === "distance"
            ? (a.distance ?? 0)
            : sort.column === "semanticDistance"
              ? (a.semanticDistance ?? 0)
              : a.label.toLowerCase();
      const bv =
        sort.column === "status"
          ? rank[b.status]
          : sort.column === "distance"
            ? (b.distance ?? 0)
            : sort.column === "semanticDistance"
              ? (b.semanticDistance ?? 0)
              : b.label.toLowerCase();
      const direction = sort.direction === "ascending" ? 1 : -1;
      return av < bv
        ? -direction
        : av > bv
          ? direction
          : a.label.localeCompare(b.label);
    });
  }
  return rows;
}
export function selectVisibleSuggestions(
  selected: ReadonlySet<string>,
  visible: SuggestionItem[],
  checked: boolean,
) {
  const next = new Set(selected);
  for (const item of visible)
    if (item.status === "available") {
      if (checked) next.add(item.id);
      else next.delete(item.id);
    }
  return next;
}
