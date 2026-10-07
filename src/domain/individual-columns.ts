import { local, NS, TYPE } from "./model";
import { displayName, LABEL } from "./rdf-model";
import { compactIri, entityNamespace } from "../shared/terms";
import type { Store } from "./store";
import { indexFor } from "./resource-search";
import {
  defaultIndividualColumns,
  type IndividualColumn,
  type IndividualRow,
  type IndividualGridPage,
} from "../shared/individual-columns";

// This ordering is a presentation convention. Eligibility is always computed
// from the current scope, including predicates not present in this convention.
const conventions: [string, number, IndividualColumn["kind"]][] = [
  ["rdf:type", 110, "text"],
  [":hasType", 118, "text"],
  ["rdfs:label", 240, "text"],
  ["rdfs:comment", 280, "text"],
  ["rdfs:seeAlso", 200, "text"],
  [":establishedYear", 122, "num"],
  [":hasCountry", 114, "text"],
  [":locatedIn", 114, "text"],
  [":hasCoordinates", 176, "mono"],
  [":hasWebsite", 260, "text"],
  [":hasLanguage", 120, "text"],
  [":hasQID", 118, "mono"],
  ["owl:sameAs", 260, "text"],
];
const cache = new WeakMap<
  Store,
  {
    version: number;
    scopes: Map<string, { rows: IndividualRow[]; columns: IndividualColumn[] }>;
  }
>();
export function individualCensus(store: Store, scope = "") {
  let entry = cache.get(store);
  if (!entry || entry.version !== store.version) {
    entry = { version: store.version, scopes: new Map() };
    cache.set(store, entry);
  }
  const saved = entry.scopes.get(scope);
  if (saved) return saved;
  const entities = [...store.entities.values()].filter(
    (e) => e.kind === "Individual" && (!scope || e.types.includes(scope)),
  );
  const namespace = entityNamespace(
    scope || entities[0]?.iri || "",
    store.ontology.namespace,
  );
  const rows: IndividualRow[] = entities.map((e) => ({
    iri: e.iri,
    local: local(e.iri),
    labelled: !!e.label,
    values: { subject: [e.label || local(e.iri)], iri: [e.iri] },
  }));
  const byIri = new Map(rows.map((r) => [r.iri, r]));
  const predicates = new Set<string>([LABEL]);
  for (const t of store.scan()) {
    const row = byIri.get(t.subject);
    if (!row) continue;
    predicates.add(t.predicate);
    const value = t.object.literal
      ? t.object.value
      : store.entities.has(t.object.value)
        ? displayName(store.entities.get(t.object.value)!)
        : compactIri(t.object.value, namespace);
    const values = (row.values[t.predicate] ??= []);
    if (!values.includes(value)) values.push(value);
  }
  const column = (
    key: string,
    label: string,
    width: number,
    kind: IndividualColumn["kind"],
    derived?: string,
  ): IndividualColumn => {
    let fill = 0,
      maxValues = 0,
      q = 0,
      values = 0;
    const distinct = new Set<string>();
    for (const row of rows) {
      const vs = row.values[key] ?? [];
      if (vs.length) fill++;
      maxValues = Math.max(maxValues, vs.length);
      for (const v of vs) {
        distinct.add(v);
        values++;
        if (/^Q[0-9]+$/.test(v)) q++;
      }
    }
    return {
      key,
      label,
      width,
      kind,
      fill,
      distinct: distinct.size,
      maxValues,
      identifiers: values > 0 && q / values > 0.9 && fill < rows.length,
      ...(derived ? { derived } : {}),
    };
  };
  const ranked = [...predicates]
    .map((key) => {
      const label =
          (key.startsWith(namespace) ? ":" : "") + compactIri(key, namespace),
        convention = conventions.find((c) => c[0] === label);
      return column(
        key,
        label,
        convention?.[1] ?? 200,
        convention?.[2] ?? "text",
        key === LABEL ? "shown as Individual" : undefined,
      );
    })
    .sort((a, b) => {
      const rank = (c: IndividualColumn) => {
        const i = conventions.findIndex((x) => x[0] === c.label);
        return i < 0 ? conventions.length : i;
      };
      return rank(a) - rank(b) || a.label.localeCompare(b.label);
    });
  const qid = ranked.find((c) => c.label === ":hasQID");
  const derived =
    qid && rows.every((r) => r.values[qid.key]?.[0] === r.local)
      ? "prefix plus :hasQID"
      : "namespace plus local name";
  const result = {
    rows,
    columns: [
      column("subject", "Individual", 260, "subject"),
      ...ranked,
      column("iri", "IRI", 300, "mono", derived),
    ],
  };
  // Subject identities discriminate even when two subjects share a label.
  result.columns[0].distinct = rows.length;
  entry.scopes.set(scope, result);
  if (entry.scopes.size > 8)
    entry.scopes.delete(entry.scopes.keys().next().value!);
  return result;
}
export function individualGridPage(
  store: Store,
  input: {
    scope?: string;
    query?: string;
    shown?: string[];
    sort?: string;
    direction?: number;
    page?: number;
  },
): IndividualGridPage {
  const { rows, columns } = individualCensus(store, input.scope);
  const shown =
    input.shown ?? defaultIndividualColumns(columns, rows.length).visible;
  const matches = input.query?.trim()
    ? indexFor(store).individualMatches(input.query, shown)
    : null;
  const sort = columns.find((c) => c.key === input.sort) ?? columns[0],
    direction = input.direction === -1 ? -1 : 1;
  const result = rows
    .filter((r) => !matches || matches.has(r.iri))
    .sort((a, b) => {
      const x = a.values[sort.key]?.[0] ?? "",
        y = b.values[sort.key]?.[0] ?? "";
      if (!x || !y)
        return (!x && !y ? 0 : !x ? 1 : -1) || a.local.localeCompare(b.local);
      return (
        (sort.kind === "num"
          ? Number(x) - Number(y)
          : x.toLowerCase().localeCompare(y.toLowerCase())) * direction ||
        a.local.localeCompare(b.local)
      );
    });
  const page = Math.max(
    1,
    Math.min(
      Math.max(1, Math.ceil(result.length / 100)),
      Math.floor(input.page ?? 1) || 1,
    ),
  );
  return {
    columns,
    scopeTotal: rows.length,
    total: result.length,
    page,
    rows: result.slice((page - 1) * 100, page * 100),
  };
}
