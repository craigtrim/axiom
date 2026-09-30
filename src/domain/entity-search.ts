import MiniSearch from "minisearch";
import {
  readFindOptions,
  findKinds,
  type FindKind,
  type FindFacet,
  type FindRow,
  type FindResults,
} from "../shared/find";
import { normalizeSearchText as normalize } from "./cosine";
import {
  embeddingText,
  type SemanticScores,
  type SemanticScorer,
} from "../shared/embeddings";
import type { Store } from "./store";
import { NS, local, type Kind } from "./model";
import { displayName } from "./rdf-model";
import { namedClass } from "./class-expressions";
import { findSynonymStatus } from "./find-synonyms";
import { compactIri } from "../shared/terms";

const stopWords = new Set("and of the for in to a an on with".split(" "));
const labelField = "$label",
  aliasField = "$alias",
  iriField = "$iri";
export const semanticMinimum = 0.5;
export const semanticFillLimit = 10;
const category = (kind: Kind): FindKind =>
  kind === "Class" || kind === "Defined"
    ? "classes"
    : kind === "Individual"
      ? "individuals"
      : kind.endsWith("Property")
        ? "properties"
        : "other";
const labels = {
  classes: "Classes",
  individuals: "Instances",
  properties: "Properties",
  other: "Other entities",
};
interface RecordRow extends FindRow {
  normalizedName: string;
  contentName: string;
  id: number;
  entity: boolean;
  isClass: boolean;
  category: FindKind;
  values: Map<string, string[]>;
}
interface Hit {
  id: number;
  tier: number;
  coverage: number;
  score: number;
  similarity?: number;
  field?: string;
  value?: string;
}
export interface ResourceMatch {
  iri: string;
  label: string;
  identifier: string;
  isClass: boolean;
}

/** One lexical index and one field catalog for Find, graphs, and resource inputs. */
export class EntitySearchIndex {
  private rows: RecordRow[] = [];
  private fields: FindFacet[];
  private engine: MiniSearch<RecordRow>;
  private indexedFields = new Set<string>();
  private corpora = new Map<string, string[]>();
  private ranked?: { key: string; scores?: SemanticScores; hits: Hit[] };
  constructor(private store: Store) {
    const ids = new Map<string, number>();
    const add = (
      iri: string,
      name = local(iri),
      kind: Kind = "Resource",
      description = "",
      entity = false,
      isClass = false,
    ) => {
      if (iri.startsWith("_:") || ids.has(iri)) return;
      const id = this.rows.length;
      ids.set(iri, id);
      const identifier = compactIri(iri, store.ontology.namespace);
      const values = new Map<string, string[]>([
        [labelField, [name]],
        [iriField, [...new Set([local(iri), identifier, iri])]],
      ]);
      if (description) values.set(NS.rdfs + "comment", [description]);
      const normalizedName = normalize(name);
      const contentName =
        normalizedName
          .split(" ")
          .filter((w) => !stopWords.has(w))
          .join(" ") || normalizedName;
      this.rows.push({
        id,
        iri,
        name,
        normalizedName,
        contentName,
        kind,
        identifier,
        description,
        category: category(kind),
        entity,
        isClass,
        values,
      });
    };
    for (const e of store.entities.values())
      add(e.iri, displayName(e), e.kind, e.comment, true, namedClass(e));
    for (const e of store.individuals)
      add(e.iri, e.reference, "Individual", "", true);
    for (const e of store.customers)
      add(e.iri, store.label(e.iri), "Individual", "", true);
    const value = (row: RecordRow, field: string, text: string) => {
      if (!text.trim()) return;
      const values = row.values.get(field) ?? [];
      if (!values.includes(text)) values.push(text);
      row.values.set(field, values);
    };
    for (const t of store.scan()) {
      add(t.subject);
      add(t.predicate);
      if (!t.object.literal) add(t.object.value);
      const id = ids.get(t.subject);
      if (id === undefined) continue;
      const row = this.rows[id];
      if (t.object.literal) {
        value(row, t.predicate, t.object.value);
        if (
          [
            NS.rdfs + "label",
            NS.skos + "prefLabel",
            NS.skos + "altLabel",
            NS.rdfs + "seeAlso",
          ].includes(t.predicate) &&
          t.object.value !== row.name
        )
          value(row, aliasField, t.object.value);
      } else {
        value(row, t.predicate, store.label(t.object.value));
        value(
          row,
          t.predicate,
          compactIri(t.object.value, store.ontology.namespace),
        );
        value(row, t.predicate, t.object.value);
      }
    }
    const allFields = new Set<string>();
    const members = new Map<string, number>();
    for (const row of this.rows) {
      const publicFields = new Set<string>();
      for (const field of row.values.keys()) {
        allFields.add(field);
        publicFields.add(
          field === labelField || field === aliasField
            ? "name"
            : field === iriField
              ? "iri"
              : field,
        );
      }
      if (row.entity)
        for (const field of publicFields)
          members.set(field, (members.get(field) ?? 0) + 1);
    }
    this.fields = [...members]
      .map(([id, count]) => ({
        id,
        count,
        label:
          id === "name"
            ? "Names and aliases"
            : id === "iri"
              ? "IRI"
              : compactIri(id, store.ontology.namespace),
      }))
      .sort(
        (a, b) =>
          (a.id === "name" ? -2 : a.id === "iri" ? -1 : 0) -
            (b.id === "name" ? -2 : b.id === "iri" ? -1 : 0) ||
          a.label.localeCompare(b.label),
      );
    this.indexedFields = allFields;
    this.engine = new MiniSearch({
      fields: [...allFields],
      extractField: (row, field) =>
        field === "id" ? row.id : (row.values.get(field)?.join("\n") ?? ""),
      tokenize: (text) => normalize(text).split(" ").filter(Boolean),
      searchOptions: {
        combineWith: "OR",
        prefix: true,
        boost: { [labelField]: 8, [aliasField]: 5, [iriField]: 3 },
        weights: { prefix: 0.9, fuzzy: 0.35 },
      },
    });
    this.engine.addAll(this.rows);
  }
  private selectedFields(fields: string[]) {
    const selected = fields.includes("*")
      ? this.fields.map((f) => f.id)
      : fields;
    return [
      ...new Set(
        selected.flatMap((f) =>
          f === "name"
            ? [labelField, aliasField]
            : f === "iri"
              ? [iriField]
              : [f],
        ),
      ),
    ].filter((f) => this.indexedFields.has(f));
  }
  semanticTexts(fields: string[]): string[] {
    const selected = this.selectedFields(fields).sort(),
      key = JSON.stringify(selected);
    const cached = this.corpora.get(key);
    if (cached) return cached;
    const texts = [
      ...new Set(
        this.rows.flatMap((row) =>
          selected.flatMap((f) => row.values.get(f) ?? []),
        ),
      ),
    ];
    this.corpora.set(key, texts);
    if (this.corpora.size > 4)
      this.corpora.delete(this.corpora.keys().next().value!);
    return texts;
  }
  async semanticScores(
    input: unknown,
    score: SemanticScorer,
  ): Promise<SemanticScores | undefined> {
    const options = readFindOptions(input);
    if (!normalize(options.text)) return;
    return score(
      embeddingText(options.text),
      this.semanticTexts(options.fields),
    );
  }
  private rank(
    input: unknown,
    scores?: SemanticScores,
    resources = false,
    classesOnly = false,
    exclude: string[] = [],
  ): Hit[] {
    const options = readFindOptions(input);
    const key = JSON.stringify([
      options.text,
      options.fields,
      options.kinds,
      options.excludeIri,
      resources,
      classesOnly,
      exclude,
    ]);
    const eligible = (row: RecordRow) =>
      resources
        ? (!classesOnly || row.isClass) && !exclude.includes(row.iri)
        : row.entity && row.iri !== options.excludeIri;
    if (this.ranked?.key === key && this.ranked.scores === scores)
      return this.ranked.hits;
    const text = normalize(options.text),
      fields = this.selectedFields(options.fields);
    if (!text || !fields.length) return [];
    const words = [...new Set(text.split(" "))];
    const content = words.filter((w) => !stopWords.has(w));
    const tokens = content.length ? content : words;
    const query = tokens.join(" ");
    const results = this.engine.search(query, {
      fields,
      fuzzy: (t) => (t.length < 4 ? false : t.length <= 7 ? 1 : 2),
    });
    const hits = new Map<number, Hit>();
    for (const result of results) {
      const row = this.rows[result.id];
      if (!eligible(row)) continue;
      const label = row.normalizedName;
      const plainLabel = row.contentName;
      const nameSelected =
        fields.includes(labelField) ||
        fields.includes(NS.rdfs + "label") ||
        fields.includes(NS.skos + "prefLabel");
      const tier =
        nameSelected && label === text
          ? 4
          : nameSelected &&
              (label.startsWith(text) || plainLabel.startsWith(query))
            ? 3
            : // MiniSearch supplies the matched terms. Classify precise/prefix
              // hits from that evidence without running a second index query.
              result.terms.some((term) =>
                  tokens.some((token) => term.startsWith(token)),
                )
              ? 2
              : 1;
      hits.set(row.id, {
        id: row.id,
        tier,
        coverage: result.queryTerms.length,
        score: result.score,
      });
    }
    const ordered = [...hits.values()].sort(
      (a, b) =>
        b.tier - a.tier ||
        b.coverage - a.coverage ||
        b.score - a.score ||
        this.rows[a.id].name.localeCompare(this.rows[b.id].name) ||
        this.rows[a.id].iri.localeCompare(this.rows[b.id].iri),
    );
    ordered.forEach((h, i) => {
      h.score = 1 / (60 + i + 1);
    });
    if (!scores) {
      this.ranked = { key, hits: ordered };
      return ordered;
    }
    if (scores) {
      const semantic: Hit[] = [];
      for (const row of this.rows) {
        if (
          !eligible(row) ||
          (!resources && !options.kinds.includes(row.category))
        )
          continue;
        let best: Hit | undefined;
        for (const field of fields)
          for (const value of row.values.get(field) ?? []) {
            const similarity = scores.get(value);
            if (
              similarity !== undefined &&
              Number.isFinite(similarity) &&
              similarity >= semanticMinimum &&
              (!best || similarity > best.similarity!)
            )
              best = {
                id: row.id,
                tier: 0,
                coverage: 0,
                score: 0,
                similarity,
                field:
                  field === labelField || field === aliasField
                    ? "name"
                    : field === iriField
                      ? "iri"
                      : field,
                value,
              };
          }
        if (best) semantic.push(best);
      }
      semantic.sort(
        (a, b) =>
          b.similarity! - a.similarity! ||
          this.rows[a.id].iri.localeCompare(this.rows[b.id].iri),
      );
      let added = 0;
      const lexicalCount = ordered.filter(
        (h) => resources || options.kinds.includes(this.rows[h.id].category),
      ).length;
      semantic.forEach((s, i) => {
        const existing = hits.get(s.id);
        if (existing) {
          existing.score += 1 / (60 + i + 1);
          existing.similarity = s.similarity;
          existing.field = s.field;
          existing.value = s.value;
        } else if (
          lexicalCount < semanticFillLimit &&
          added < semanticFillLimit - lexicalCount &&
          s.similarity! >= semantic[0].similarity! - 0.15
        ) {
          hits.set(s.id, { ...s, score: 1 / (60 + i + 1) });
          added++;
        }
      });
    }
    const ranked = [...hits.values()].sort((a, b) => {
      // Protected label matches and precise lexical hits retain precedence.
      return (
        b.tier - a.tier ||
        b.coverage - a.coverage ||
        b.score - a.score ||
        (b.similarity ?? 0) - (a.similarity ?? 0) ||
        this.rows[a.id].name.localeCompare(this.rows[b.id].name) ||
        this.rows[a.id].iri.localeCompare(this.rows[b.id].iri)
      );
    });
    this.ranked = { key, scores, hits: ranked };
    return ranked;
  }
  private filtered(input: unknown, scores?: SemanticScores) {
    const options = readFindOptions(input);
    const hits = this.rank(options, scores).filter(
      (h) =>
        this.rows[h.id].entity && this.rows[h.id].iri !== options.excludeIri,
    );
    const kinds = findKinds.map((id) => ({
      id,
      label: labels[id],
      count: hits.filter((h) => this.rows[h.id].category === id).length,
    }));
    const selected = hits.filter((h) =>
      options.kinds.includes(this.rows[h.id].category),
    );
    if (options.sort !== "relevance")
      selected.sort((a, b) => {
        const x = this.rows[a.id],
          y = this.rows[b.id];
        return (
          (options.sort === "iri"
            ? x.iri.localeCompare(y.iri)
            : x.name.localeCompare(y.name) *
              (options.sort === "name-desc" ? -1 : 1)) ||
          x.iri.localeCompare(y.iri)
        );
      });
    return { options, hits: selected, kinds };
  }
  matchingIris(input: unknown, scores?: SemanticScores) {
    return this.filtered(input, scores).hits.map((h) => this.rows[h.id].iri);
  }
  find(input: unknown, scores?: SemanticScores): FindResults {
    const { options, hits, kinds } = this.filtered(input, scores);
    const offset = Math.min(
      options.offset,
      Math.max(0, Math.ceil(hits.length / options.limit) - 1) * options.limit,
    );
    return {
      total: hits.length,
      offset,
      kinds,
      fields: this.fields,
      rows: hits.slice(offset, offset + options.limit).map((h) => {
        const {
          id,
          entity,
          isClass,
          values,
          category,
          normalizedName,
          contentName,
          ...row
        } = this.rows[h.id];
        return {
          ...row,
          synonym: findSynonymStatus(this.store, row.iri, options.text),
          similarity: h.similarity,
          matchedField: h.field,
          matchedValue: h.value,
        };
      }),
    };
  }
  search(
    query: string,
    classesOnly = false,
    exclude: string[] = [],
    limit = 24,
    scores?: SemanticScores,
  ): ResourceMatch[] {
    const omitted = new Set(exclude);
    const hits = query.trim()
      ? this.rank(
          { text: query, fields: ["name", "iri"] },
          scores,
          true,
          classesOnly,
          exclude,
        )
      : this.rows.map((row) => ({ id: row.id }));
    return hits
      .map((h) => this.rows[h.id])
      .filter((row) => !omitted.has(row.iri) && (!classesOnly || row.isClass))
      .slice(0, Math.min(50, limit))
      .map((row) => ({
        iri: row.iri,
        label: row.name,
        identifier: row.identifier,
        isClass: row.isClass,
      }));
  }
}
