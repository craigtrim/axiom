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
  const subjects = new Set(
    triples
      .filter(
        (t) =>
          [
            NS.rdfs + "label",
            NS.rdfs + "seeAlso",
            NS.skos + "altLabel",
          ].includes(t.predicate) ||
          t.predicate.slice(t.predicate.lastIndexOf("#") + 1) === "inflection",
      )
      .map((t) => t.subject),
  );
  const index = new Map<string, TextAnalysisConcept[]>();
  for (const iri of subjects) {
    if (iri.startsWith("_:")) continue;
    const entity = store.resolve(iri);
    if (!entity) continue;
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
  return Object.fromEntries(index);
}
