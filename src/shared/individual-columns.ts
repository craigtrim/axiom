export interface IndividualColumn {
  key: string;
  label: string;
  width: number;
  kind: "subject" | "text" | "mono" | "num";
  fill: number;
  distinct: number;
  maxValues: number;
  identifiers: boolean;
  derived?: string;
}
export interface IndividualRow {
  iri: string;
  local: string;
  labelled: boolean;
  values: Record<string, string[]>;
}
export interface IndividualColumnLayout {
  order: string[];
  visible: string[];
  widths: Record<string, number>;
}
export interface IndividualGridPage {
  columns: IndividualColumn[];
  rows: IndividualRow[];
  scopeTotal: number;
  total: number;
  page: number;
}
export const columnWidth = (n: number) =>
  Math.max(56, Math.min(720, Math.round(n)));
export function readIndividualLayouts(
  value: unknown,
): Record<string, IndividualColumnLayout> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const keys = (v: unknown) =>
    Array.isArray(v)
      ? [
          ...new Set(
            v.filter(
              (key): key is string =>
                typeof key === "string" && key.length < 10000,
            ),
          ),
        ].slice(0, 256)
      : [];
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 1000)
      .flatMap(([scope, layout]) => {
        if (
          scope.length >= 10000 ||
          !layout ||
          typeof layout !== "object" ||
          !Array.isArray(layout.order) ||
          !Array.isArray(layout.visible)
        )
          return [];
        const widths =
          layout.widths && typeof layout.widths === "object"
            ? Object.entries(layout.widths)
                .slice(0, 256)
                .filter(
                  ([key, n]) =>
                    key.length < 10000 &&
                    typeof n === "number" &&
                    Number.isFinite(n),
                )
                .map(([key, n]) => [key, columnWidth(n as number)])
            : [];
        return [
          [
            scope,
            {
              order: keys(layout.order),
              visible: keys(layout.visible),
              widths: Object.fromEntries(widths),
            },
          ],
        ];
      }),
  );
}
export function columnReasons(c: IndividualColumn, total: number) {
  const reasons: { text: string; warn?: boolean }[] = [];
  if (c.key === "subject") reasons.push({ text: "always shown" });
  if (c.derived) reasons.push({ text: c.derived });
  if (!c.fill) reasons.push({ text: "no values", warn: true });
  else if (c.distinct === 1) reasons.push({ text: "one value", warn: true });
  else if (c.fill === total && c.distinct === total)
    reasons.push({ text: "unique per row", warn: true });
  if (c.fill > 0 && c.fill / total < 0.05)
    reasons.push({ text: "sparse", warn: true });
  if (c.identifiers) reasons.push({ text: "identifiers" });
  if (c.maxValues > 1) reasons.push({ text: `${c.maxValues} values deep` });
  return reasons;
}
export function defaultIndividualColumns(
  columns: IndividualColumn[],
  total: number,
): IndividualColumnLayout {
  const eligible = columns.filter(
    (c) =>
      c.key !== "subject" &&
      !c.derived &&
      c.fill > 0 &&
      c.fill / total >= 0.05 &&
      c.distinct > 1 &&
      !(c.fill === total && c.distinct === total),
  );
  eligible.sort(
    (a, b) => Number(a.identifiers) - Number(b.identifiers) || b.fill - a.fill,
  );
  return {
    order: columns.map((c) => c.key),
    visible: ["subject", ...eligible.slice(0, 4).map((c) => c.key)],
    widths: Object.fromEntries(columns.map((c) => [c.key, c.width])),
  };
}
export function restoreIndividualColumns(
  columns: IndividualColumn[],
  total: number,
  saved?: IndividualColumnLayout,
): IndividualColumnLayout {
  const defaults = defaultIndividualColumns(columns, total);
  if (!saved || !Array.isArray(saved.order) || !Array.isArray(saved.visible))
    return defaults;
  const keys = new Set(defaults.order);
  const order = [
    ...new Set(["subject", ...saved.order, ...defaults.order]),
  ].filter((k) => keys.has(k));
  return {
    order,
    visible: [...new Set(["subject", ...saved.visible])].filter((k) =>
      keys.has(k),
    ),
    widths: Object.fromEntries(
      columns.map((c) => [
        c.key,
        typeof saved.widths?.[c.key] === "number" &&
        Number.isFinite(saved.widths[c.key])
          ? columnWidth(saved.widths[c.key])
          : c.width,
      ]),
    ),
  };
}
