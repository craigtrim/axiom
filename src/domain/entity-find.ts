import {
  readFindOptions,
  findKinds,
  type FindKind,
  type FindFacet,
  type FindRow,
  type FindResults,
} from "../shared/find";
import { CosineTextIndex, normalizeSearchText as normalize } from "./cosine";
import type { Store } from "./store";
import { NS, local, type Kind } from "./model";
import { displayName } from "./rdf-model";
import { compactIri } from "../shared/terms";
interface RecordRow extends FindRow {
  category: FindKind;
  values: Map<string, string[]>;
}
interface Value {
  row: number;
  field: string;
  text: string;
  normalized: string;
}
interface Prepared {
  values: Value[];
  byRow: Map<number, Value[]>;
  postings: Map<string, Set<number>>;
  vocabulary: string[];
  cosine?: CosineTextIndex;
}
const category = (kind: Kind): FindKind =>
  kind === "Class" || kind === "Defined"
    ? "classes"
    : kind === "Individual"
      ? "individuals"
      : kind.endsWith("Property")
        ? "properties"
        : "other";
const labels: Record<FindKind, string> = {
  classes: "Classes",
  individuals: "Instances",
  properties: "Properties",
  other: "Other entities",
};
/** Field catalog and search indexes are shared by every caller for this dataset revision. */
export class EntityFindIndex {
  private rows: RecordRow[] = [];
  private fields: FindFacet[];
  private prepared = new Map<string, Prepared>();
  private found?: {
    key: string;
    matches: Map<number, { score: number; value?: Value }>;
    ids: number[];
    kinds: FindFacet[];
  };
  constructor(store: Store) {
    const ids = new Map<string, number>();
    const members = new Map<string, Set<number>>();
    const add = (iri: string, name: string, kind: Kind, description = "") => {
      if (iri.startsWith("_:") || ids.has(iri)) return;
      const id = this.rows.length;
      ids.set(iri, id);
      this.rows.push({
        iri,
        name,
        kind,
        description,
        identifier: compactIri(iri, store.ontology.namespace),
        category: category(kind),
        values: new Map(),
      });
      value(id, "name", name);
      value(id, "iri", iri);
      value(id, "iri", compactIri(iri, store.ontology.namespace));
      value(id, "iri", local(iri));
      if (description) value(id, NS.rdfs + "comment", description);
    };
    const value = (id: number, field: string, text: string) => {
      if (!text.trim()) return;
      const list = this.rows[id].values.get(field) ?? [];
      if (!list.includes(text)) list.push(text);
      this.rows[id].values.set(field, list);
      const set = members.get(field) ?? new Set<number>();
      set.add(id);
      members.set(field, set);
    };
    for (const e of store.entities.values())
      add(e.iri, displayName(e), e.kind, e.comment);
    for (const e of store.individuals) add(e.iri, e.reference, "Individual");
    for (const e of store.customers)
      add(e.iri, store.label(e.iri), "Individual");
    for (const t of store.scan()) {
      const id = ids.get(t.subject);
      if (id === undefined) continue;
      if (t.object.literal) {
        value(id, t.predicate, t.object.value);
        if (
          [
            NS.rdfs + "label",
            NS.skos + "prefLabel",
            NS.skos + "altLabel",
            NS.rdfs + "seeAlso",
          ].includes(t.predicate)
        )
          value(id, "name", t.object.value);
      } else {
        value(id, t.predicate, store.label(t.object.value));
        value(
          id,
          t.predicate,
          compactIri(t.object.value, store.ontology.namespace),
        );
        value(id, t.predicate, t.object.value);
      }
    }
    this.fields = [...members]
      .map(([id, set]) => ({
        id,
        label:
          id === "name"
            ? "Names and aliases"
            : id === "iri"
              ? "IRI"
              : compactIri(id, store.ontology.namespace),
        count: set.size,
      }))
      .sort(
        (a, b) =>
          (a.id === "name" ? -2 : a.id === "iri" ? -1 : 0) -
            (b.id === "name" ? -2 : b.id === "iri" ? -1 : 0) ||
          a.label.localeCompare(b.label),
      );
  }
  private prepare(fields: string[]) {
    const key = JSON.stringify([...new Set(fields)].sort());
    const cached = this.prepared.get(key);
    if (cached) {
      this.prepared.delete(key);
      this.prepared.set(key, cached);
      return cached;
    }
    const result: Prepared = {
      values: [],
      byRow: new Map(),
      postings: new Map(),
      vocabulary: [],
    };
    const selected = new Set(
      fields.includes("*") ? this.fields.map((f) => f.id) : fields,
    );
    this.rows.forEach((row, id) => {
      const values: Value[] = [];
      for (const [field, texts] of row.values)
        if (selected.has(field))
          for (const text of texts) {
            const normalized = normalize(text);
            if (!normalized) continue;
            values.push({ row: id, field, text, normalized });
            for (const token of new Set(normalized.split(" "))) {
              const posting = result.postings.get(token) ?? new Set<number>();
              posting.add(id);
              result.postings.set(token, posting);
            }
          }
      if (values.length) result.byRow.set(id, values);
      result.values.push(...values);
    });
    result.vocabulary = [...result.postings.keys()].sort();
    this.prepared.set(key, result);
    if (this.prepared.size > 2)
      this.prepared.delete(this.prepared.keys().next().value!);
    return result;
  }
  private prefix(index: Prepared, token: string) {
    let low = 0,
      high = index.vocabulary.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (index.vocabulary[mid] < token) low = mid + 1;
      else high = mid;
    }
    const ids = new Set<number>();
    for (
      let i = low;
      i < index.vocabulary.length && index.vocabulary[i].startsWith(token);
      i++
    )
      for (const id of index.postings.get(index.vocabulary[i])!) ids.add(id);
    return ids;
  }
  matchingIris(input: unknown): string[] {
    this.find(input);
    return this.found!.ids.map((id) => this.rows[id].iri);
  }

  find(input: unknown): FindResults {
    const options = readFindOptions(input),
      text = normalize(options.text);
    const key = JSON.stringify({ ...options, text, offset: 0, limit: 0 });
    if (this.found?.key !== key) {
      const index = this.prepare(options.fields);
      const matches = new Map<number, { score: number; value?: Value }>();
      if (text && options.match === "cosine") {
        index.cosine ??= new CosineTextIndex(index.values.map((v) => v.text));
        for (const [id, score] of index.cosine.search(text)) {
          if (score + 1e-12 < options.minimumSimilarity || score <= 0) continue;
          const value = index.values[id];
          if (score > (matches.get(value.row)?.score ?? -1))
            matches.set(value.row, { score, value });
        }
      } else if (text) {
        const tokens = [...new Set(text.split(" "))];
        const candidates =
          options.match === "words"
            ? tokens
                .map((t) => this.prefix(index, t))
                .sort((a, b) => a.size - b.size)[0]
            : index.byRow.keys();
        for (const id of candidates) {
          const values = index.byRow.get(id)!;
          const accepted =
            options.match === "exact"
              ? values.some((v) => v.normalized === text)
              : options.match === "phrase"
                ? values.some((v) => v.normalized.includes(text))
                : tokens.every((t) =>
                    values.some((v) =>
                      v.normalized
                        .split(" ")
                        .some((word) => word.startsWith(t)),
                    ),
                  );
          if (!accepted) continue;
          const value =
            values.find((v) => v.normalized === text) ??
            values.find((v) => v.normalized.startsWith(text)) ??
            values.find((v) => tokens.some((t) => v.normalized.includes(t)));
          const score =
            value?.normalized === text
              ? 3
              : value?.normalized.startsWith(text)
                ? 2
                : 1;
          matches.set(id, { score, value });
        }
      }
      const counts = new Map<FindKind, number>();
      for (const id of matches.keys()) {
        if (this.rows[id].iri === options.excludeIri) {
          matches.delete(id);
          continue;
        }
        const kind = this.rows[id].category;
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
      const ids = [...matches.keys()]
        .filter((id) => options.kinds.includes(this.rows[id].category))
        .sort((a, b) => {
          const x = this.rows[a],
            y = this.rows[b];
          return (
            (options.sort === "relevance"
              ? matches.get(b)!.score - matches.get(a)!.score
              : 0) ||
            (options.sort === "iri"
              ? x.iri.localeCompare(y.iri)
              : x.name.localeCompare(y.name) *
                (options.sort === "name-desc" ? -1 : 1)) ||
            x.iri.localeCompare(y.iri)
          );
        });
      this.found = {
        key,
        matches,
        ids,
        kinds: findKinds.map((id) => ({
          id,
          label: labels[id],
          count: counts.get(id) ?? 0,
        })),
      };
    }
    const { ids, matches, kinds } = this.found;
    const offset = Math.min(
      options.offset,
      Math.max(0, Math.ceil(ids.length / options.limit) - 1) * options.limit,
    );
    return {
      total: ids.length,
      offset,
      fields: this.fields,
      kinds,
      rows: ids.slice(offset, offset + options.limit).map((id) => {
        const { values, category, ...row } = this.rows[id],
          match = matches.get(id)!;
        return {
          ...row,
          ...(options.match === "cosine" ? { similarity: match.score } : {}),
          matchedField: match.value?.field,
          matchedValue: match.value?.text,
        };
      }),
    };
  }
}
