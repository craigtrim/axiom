import {
  NS,
  TYPE,
  SUBCLASS,
  entity,
  type Kind,
  type Triple,
} from "../../../src/domain/model";
import { Store } from "../../../src/domain/store";
import { storeFromRdf } from "../../../src/domain/rdf-io";
import { concepts } from "./catalog";
export const base = "https://search.test/ontology#";
export const iri = (local: string) => base + local;
export const literal = (
  subject: string,
  predicate: string,
  value: string,
  language?: string,
  graph?: string,
): Triple => ({
  subject,
  predicate,
  object: { literal: true, value, ...(language ? { language } : {}) },
  ...(graph ? { graph } : {}),
});
export const reference = (
  subject: string,
  predicate: string,
  value: string,
  graph?: string,
): Triple => ({
  subject,
  predicate,
  object: { literal: false, value },
  ...(graph ? { graph } : {}),
});
export const declaration = (
  subject: string,
  label: string,
  type = NS.owl + "Class",
): Triple[] => [
  reference(subject, TYPE, type),
  literal(subject, NS.rdfs + "label", label, "en"),
];
export function fromTriples(triples: Triple[]) {
  const store = storeFromRdf(triples, "Functional search fixture");
  store.ontology.namespace = base;
  return store;
}
export const aliasPredicates = [
  NS.skos + "altLabel",
  NS.skos + "prefLabel",
  NS.rdfs + "seeAlso",
  NS.rdfs + "label",
];
export function catalogStore() {
  const triples = declaration(iri("Root"), "Curriculum Root");
  for (const [i, concept] of concepts.entries()) {
    const subject = iri(concept.localName);
    triples.push(
      ...declaration(subject, concept.label),
      reference(subject, SUBCLASS, iri("Root")),
      literal(
        subject,
        aliasPredicates[i % aliasPredicates.length],
        concept.alias,
        "fr",
      ),
      literal(
        subject,
        NS.rdfs + "comment",
        `Reference material about ${concept.label.toLowerCase()}.`,
      ),
      literal(
        subject,
        iri("catalogCode"),
        `ZX-${String(i + 100).padStart(4, "0")}`,
      ),
      ...declaration(
        iri("Extended_" + concept.localName),
        "Extended " + concept.label,
      ),
      reference(iri("Extended_" + concept.localName), SUBCLASS, iri("Root")),
    );
  }
  return fromTriples(triples);
}
/** Small isolated fixtures can represent all entity categories without parser inference. */
export function labelledStore(
  rows: { id: string; label: string; kind?: Kind }[],
) {
  const store = new Store();
  store.ontology.namespace = base;
  store.entities.clear();
  for (const row of rows)
    store.entities.set(iri(row.id), {
      ...entity(iri(row.id), row.kind ?? "Class"),
      label: row.label,
    });
  return store;
}
