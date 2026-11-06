import { NS, type Triple } from "./model";
import { taxonomyParents } from "./class-expressions";
import type { Store } from "./store";
import type { TextAnalysisConcept } from "../shared/text-analysis";

/** mutatoc local() uses the fragment after #, or the entire IRI without #.
 * ontology_build() trims and lowercases that identifier; labels are synonyms.
 * Keep every matching IRI when namespaces share a canonical identifier.
 */
export function textAnalysisCanonical(iri: string) {
  return (
    iri
      .slice(iri.lastIndexOf("#") + 1)
      // Match Python/C whitespace; U+FEFF is not trim space there.
      .replace(
        /^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu,
        "",
      )
      .toLowerCase()
  );
}
export function textAnalysisConcepts(store: Store, triples: Triple[]) {
  const subjects = new Set<string>();
  for (const triple of triples)
    if (namesConcept(triple)) subjects.add(triple.subject);
  const index = new Map<string, TextAnalysisConcept[]>();
  for (const iri of subjects) addConcept(store, index, iri);
  return Object.fromEntries(index);
}

// craigtrim/axiom#207: large context indexes yield without changing synchronous callers.
export async function textAnalysisConceptsAsync(
  store: Store,
  triples: Triple[],
  yieldControl: () => Promise<void>,
) {
  const subjects = new Set<string>();
  let count = 0;
  for (const triple of triples) {
    if (namesConcept(triple)) subjects.add(triple.subject);
    if (++count % 2048 === 0) await yieldControl();
  }
  const index = new Map<string, TextAnalysisConcept[]>();
  count = 0;
  for (const iri of subjects) {
    addConcept(store, index, iri);
    if (++count % 1024 === 0) await yieldControl();
  }
  return Object.fromEntries(index);
}

const namePredicates = new Set([
  NS.rdfs + "label",
  NS.rdfs + "seeAlso",
  NS.skos + "altLabel",
]);
const namesConcept = (triple: Triple) =>
  namePredicates.has(triple.predicate) ||
  triple.predicate.slice(triple.predicate.lastIndexOf("#") + 1) ===
    "inflection";

function addConcept(
  store: Store,
  index: Map<string, TextAnalysisConcept[]>,
  iri: string,
) {
  if (iri.startsWith("_:")) return;
  const entity = store.resolve(iri);
  if (!entity) return;
  const canonical = textAnalysisCanonical(iri);
  const targets = index.get(canonical) ?? [];
  targets.push({
    iri,
    label: store.label(iri),
    kind: entity.kind,
    comment: entity.comment,
    parents: [
      ...new Set(
        entity.kind === "Individual" ? entity.types : taxonomyParents(entity),
      ),
    ]
      .filter((parent) => !parent.startsWith("_:"))
      .map((parent) => ({ iri: parent, label: store.label(parent) })),
    taxonomy: [
      "Class",
      "Defined",
      "ObjectProperty",
      "DataProperty",
      "AnnotationProperty",
    ].includes(entity.kind),
  });
  index.set(canonical, targets);
}
