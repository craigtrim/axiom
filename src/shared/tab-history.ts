export const tabTypes: Record<string, string> = {
  graph: "Graph",
  find: "Find",
  hierarchy: "Hierarchy",
  details: "Details",
  inspector: "Inspector",
  individuals: "Individuals",
  query: "Query",
  queryResults: "Query results",
  research: "Research",
  taxonomy: "Suggestions",
  sparsity: "Sparsity",
  source: "Source",
  provenance: "Filesystem provenance",
  errorlog: "Error log",
  tabhistory: "Tab History",
};
export type TabSavePolicy = "named" | "all";
export interface SavedTab {
  id: string;
  type: string;
  name: string;
  named: boolean;
  createdAt: string;
  updatedAt: string;
  config: Record<string, unknown>;
  panelState: Record<string, unknown>;
  selected?: string | null;
}
export interface TabHistory {
  version: 1;
  entries: SavedTab[];
  counters: Record<string, number>;
}
export const emptyTabHistory = (): TabHistory => ({
  version: 1,
  entries: [],
  counters: {},
});
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function readTabHistory(value: unknown): TabHistory {
  if (value === undefined) return emptyTabHistory();
  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length > 1000 ||
    !object(value.counters)
  )
    throw Error("Invalid saved tab history.");
  const entries = value.entries.map((v): SavedTab => {
    if (
      !object(v) ||
      typeof v.id !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9:_-]{0,149}$/.test(v.id) ||
      typeof v.type !== "string" ||
      !Object.hasOwn(tabTypes, v.type) ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.name.length > 120 ||
      typeof v.named !== "boolean" ||
      typeof v.createdAt !== "string" ||
      !Number.isFinite(Date.parse(v.createdAt)) ||
      typeof v.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(v.updatedAt)) ||
      !object(v.config) ||
      !object(v.panelState) ||
      JSON.stringify(v).length > 500000 ||
      (v.selected !== undefined &&
        v.selected !== null &&
        (typeof v.selected !== "string" || v.selected.length > 10000))
    )
      throw Error("Invalid saved tab.");
    return {
      id: v.id,
      type: v.type,
      name: v.name,
      named: v.named,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      config: v.config,
      panelState: v.panelState,
      selected: v.selected as string | null | undefined,
    };
  });
  if (new Set(entries.map((t) => t.id)).size !== entries.length)
    throw Error("Duplicate saved tab.");
  const counters: Record<string, number> = {};
  for (const [type, n] of Object.entries(value.counters))
    if (
      Object.hasOwn(tabTypes, type) &&
      typeof n === "number" &&
      Number.isSafeInteger(n) &&
      n >= 0
    )
      counters[type] = n;
  return { version: 1, entries, counters };
}
export function tabDate(iso: string) {
  const d = new Date(iso);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
export function defaultTabName(type: string, sequence: number) {
  const label = tabTypes[type] ?? type;
  return label + (sequence > 1 ? "_" + sequence : "");
}
