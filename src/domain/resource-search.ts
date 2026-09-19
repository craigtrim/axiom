import { readFindOptions, type FindResults } from "../shared/find";
import type { Store } from "./store";
import { type Kind, NS, local } from "./model";
import { namedClass } from "./class-expressions";
import { displayName } from "./rdf-model";
import { compactIri } from "../shared/terms";
export interface ResourceMatch {
  iri: string;
  label: string;
  identifier: string;
  isClass: boolean;
}
const normalize = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
interface Entry extends ResourceMatch {
  tokens: string[];
  names: string[];
  labelNames: string[];
  iriNames: string[];
  kind: Kind;
  description: string;
  entity: boolean;
}
/** One reusable inverted index per dataset revision. Queries only visit token postings. */
export class ResourceSearchIndex {
  private entries: Entry[] = [];
  private postings = new Map<string, number[]>();
  private vocabulary: string[];
  private found?: { key: string; ids: number[] };
  private exact = new Map<string, number[]>();
  constructor(store: Store) {
    const resources = new Map<
      string,
      {
        label: string;
        isClass: boolean;
        aliases: string[];
        kind: Kind;
        description: string;
        entity: boolean;
      }
    >();
    const add = (
      iri: string,
      label = local(iri),
      isClass = false,
      kind: Kind = "Resource",
      description = "",
      entity = false,
    ) => {
      if (!iri.startsWith("_:") && !resources.has(iri))
        resources.set(iri, {
          label,
          isClass,
          aliases: [],
          kind,
          description,
          entity,
        });
    };
    for (const e of store.entities.values())
      add(e.iri, displayName(e), namedClass(e), e.kind, e.comment, true);
    for (const e of store.individuals)
      add(e.iri, e.reference, false, "Individual", "", true);
    for (const e of store.customers)
      add(e.iri, store.label(e.iri), false, "Individual", "", true);
    for (const t of [...store.tbox, ...store.rbox]) {
      add(t.subject);
      add(t.predicate);
      if (!t.object.literal) add(t.object.value);
      if (
        t.object.literal &&
        [
          NS.rdfs + "label",
          NS.skos + "prefLabel",
          NS.skos + "altLabel",
        ].includes(t.predicate)
      )
        resources.get(t.subject)?.aliases.push(t.object.value);
    }
    for (const [iri, e] of resources) {
      const identifier = compactIri(iri, store.ontology.namespace);
      const names = [
        ...new Set(
          [e.label, identifier, local(iri), iri, ...e.aliases].map(normalize),
        ),
      ];
      const tokens = [
        ...new Set(names.flatMap((n) => n.split(" ")).filter(Boolean)),
      ];
      const id = this.entries.length;
      this.entries.push({
        iri,
        label: e.label,
        identifier,
        isClass: e.isClass,
        tokens,
        names,
        labelNames: [e.label, ...e.aliases].map(normalize),
        iriNames: [identifier, iri].map(normalize),
        kind: e.kind,
        description: e.description,
        entity: e.entity,
      });
      for (const token of tokens) {
        const list = this.postings.get(token) ?? [];
        list.push(id);
        this.postings.set(token, list);
      }
      for (const name of names) {
        const list = this.exact.get(name) ?? [];
        list.push(id);
        this.exact.set(name, list);
      }
    }
    this.vocabulary = [...this.postings.keys()].sort();
  }
  private prefix(token: string) {
    let lo = 0,
      hi = this.vocabulary.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.vocabulary[mid] < token) lo = mid + 1;
      else hi = mid;
    }
    const lists: number[][] = [];
    let size = 0;
    for (
      let i = lo;
      i < this.vocabulary.length && this.vocabulary[i].startsWith(token);
      i++
    ) {
      const list = this.postings.get(this.vocabulary[i])!;
      lists.push(list);
      size += list.length;
    }
    return { lists, size };
  }
  /** Exhaustive, paged results share the type-ahead index without its suggestion cap. */
  find(input: unknown): FindResults {
    const options = readFindOptions(input);
    const { text: query, kind, field, match, sort, limit } = options;
    const text = normalize(query);
    if (!text) return { rows: [], total: 0, offset: 0 };
    const key = JSON.stringify([text, kind, field, match, sort]);
    if (this.found?.key !== key) {
      const tokens = [...new Set(text.split(" "))];
      const candidates = new Set<number>();
      if (match === "words") {
        const smallest = tokens
          .map((t) => this.prefix(t))
          .sort((a, b) => a.size - b.size)[0];
        for (const list of smallest.lists)
          for (const id of list) candidates.add(id);
      } else {
        for (let id = 0; id < this.entries.length; id++) candidates.add(id);
      }
      const scores = new Map<number, number>();
      for (const id of candidates) {
        const e = this.entries[id];
        if (
          !e.entity ||
          (kind === "classes" && !e.isClass) ||
          (kind === "individuals" && e.kind !== "Individual") ||
          (kind === "properties" && !e.kind.endsWith("Property"))
        )
          continue;
        const names =
          field === "name"
            ? e.labelNames
            : field === "iri"
              ? e.iriNames
              : e.names;
        const accepted =
          match === "exact"
            ? names.includes(text)
            : match === "phrase"
              ? names.some((n) => n.includes(text))
              : tokens.every((t) =>
                  names.some((n) =>
                    n.split(" ").some((word) => word.startsWith(t)),
                  ),
                );
        if (accepted)
          scores.set(
            id,
            names.includes(text)
              ? 0
              : names.some((n) => n.startsWith(text))
                ? 1
                : 2,
          );
      }
      const ids = [...scores.keys()].sort((a, b) => {
        const x = this.entries[a],
          y = this.entries[b];
        return (
          (sort === "relevance" ? scores.get(a)! - scores.get(b)! : 0) ||
          (sort === "iri"
            ? x.iri.localeCompare(y.iri)
            : x.label.localeCompare(y.label) *
              (sort === "name-desc" ? -1 : 1)) ||
          x.iri.localeCompare(y.iri)
        );
      });
      this.found = { key, ids };
    }
    const ids = this.found.ids;
    const offset = Math.min(
      options.offset,
      Math.max(0, Math.ceil(ids.length / limit) - 1) * limit,
    );
    return {
      total: ids.length,
      offset,
      rows: ids.slice(offset, offset + limit).map((id) => {
        const e = this.entries[id];
        return {
          iri: e.iri,
          name: e.label,
          kind: e.kind,
          identifier: e.identifier,
          description: e.description,
        };
      }),
    };
  }
  search(
    query: string,
    classesOnly = false,
    exclude: string[] = [],
    limit = 24,
  ): ResourceMatch[] {
    const text = normalize(query.slice(0, 512));
    const tokens = [...new Set(text.split(" ").filter(Boolean))].slice(0, 12);
    const omitted = new Set(exclude);
    const matches = new Map<number, number>();
    const consider = (id: number) => {
      const e = this.entries[id];
      if (
        matches.has(id) ||
        omitted.has(e.iri) ||
        (classesOnly && !e.isClass) ||
        !tokens.every((t) => e.tokens.some((n) => n.startsWith(t)))
      )
        return;
      matches.set(
        id,
        e.names.includes(text)
          ? 0
          : e.names.some((n) => n.startsWith(text))
            ? 1
            : 2,
      );
    };
    for (const id of this.exact.get(text) ?? []) consider(id);
    if (!tokens.length) {
      for (let id = 0; id < this.entries.length && matches.size < limit; id++)
        consider(id);
    } else {
      const smallest = tokens
        .map((t) => this.prefix(t))
        .sort((a, b) => a.size - b.size)[0];
      let visited = 0;
      outer: for (const list of smallest.lists)
        for (const id of list) {
          consider(id);
          // Bound broad queries; adding another word uses its smaller postings list.
          if (++visited >= 12000) break outer;
        }
    }
    return [...matches]
      .sort(
        ([a, sa], [b, sb]) =>
          sa - sb ||
          this.entries[a].label.localeCompare(this.entries[b].label) ||
          this.entries[a].iri.localeCompare(this.entries[b].iri),
      )
      .slice(0, Math.min(50, limit))
      .map(([id]) => {
        const { iri, label, identifier, isClass } = this.entries[id];
        return { iri, label, identifier, isClass };
      });
  }
}
const cache = new WeakMap<
  Store,
  { version: number; index: ResourceSearchIndex }
>();
function indexFor(store: Store) {
  let saved = cache.get(store);
  if (!saved || saved.version !== store.version) {
    saved = { version: store.version, index: new ResourceSearchIndex(store) };
    cache.set(store, saved);
  }
  return saved.index;
}
export function findEntities(store: Store, options: unknown) {
  return indexFor(store).find(options);
}
export function resourceSuggestions(
  store: Store,
  query: string,
  classesOnly = false,
  exclude: string[] = [],
) {
  return indexFor(store).search(query, classesOnly, exclude);
}
