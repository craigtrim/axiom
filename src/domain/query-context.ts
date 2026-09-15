import { TYPE, NS } from "./model";
import type { Store } from "./store";
import type { QueryContext } from "../shared/query-assistant";
export function queryContext(
  store: Store,
  instructions: string,
  datasetEpoch: number,
): QueryContext {
  const words = instructions.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const entities = [...store.entities.values()];
  const score = (iri: string, label: string, kind: string) =>
    (kind === "Individual" ? 0 : 1) +
    words.reduce(
      (n, w) =>
        n +
        (label.toLowerCase().includes(w)
          ? 5
          : iri.toLowerCase().includes(w)
            ? 2
            : 0),
      0,
    );
  const ranked = entities
    .map((e) => ({ e, score: score(e.iri, store.label(e.iri), e.kind) }))
    .sort((a, b) => b.score - a.score || a.e.iri.localeCompare(b.e.iri));
  const terms: QueryContext["terms"] = [];
  let remaining = 70000;
  for (const { e } of ranked.slice(0, 160)) {
    const term = {
      iri: e.iri,
      label: store.label(e.iri),
      assertedTypes: store.tbox
        .filter(
          (t) =>
            t.subject === e.iri && t.predicate === TYPE && !t.object.literal,
        )
        .map((t) => t.object.value),
      assertedLabels: store.tbox
        .filter(
          (t) =>
            t.subject === e.iri &&
            t.predicate === NS.rdfs + "label" &&
            t.object.literal,
        )
        .map((t) => ({ value: t.object.value, language: t.object.language })),
      kind: e.kind,
      parents: e.parents,
      domain: e.domain,
      range: e.range,
      inverse: e.inverse,
    };
    const size = JSON.stringify(term).length;
    if (size > remaining) continue;
    remaining -= size;
    terms.push(term);
  }
  const counts = new Map<string, number>();
  const types = new Set<string>();
  for (const t of store.scan()) {
    counts.set(t.predicate, (counts.get(t.predicate) ?? 0) + 1);
    if (t.predicate === TYPE && !t.object.literal) types.add(t.object.value);
  }
  const predicates = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120)
    .map(([iri, count]) => ({ iri, count }));
  return {
    datasetEpoch,
    version: store.version,
    ontology: store.ontology.name,
    namespace: store.ontology.namespace,
    tripleCount: store.tripleCount,
    entityCount: entities.length,
    omitted: entities.length - terms.length,
    terms,
    predicates,
    types: [...types].sort().slice(0, 160),
  };
}
