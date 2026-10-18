// craigtrim/axiom#92: the reference's candidates enter through the real Wikipedia parser.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export const touchpointsReference = fileURLToPath(
  new URL("./visual-reference.html", import.meta.url),
);
export const referenceHash =
  "3bec043bd22ba9aed769651e4fb33bab042d90ee1d6a3058dc42ca7c74280642";
export function touchpointsFixture() {
  if (
    createHash("sha256")
      .update(readFileSync(touchpointsReference))
      .digest("hex") !== referenceHash
  )
    throw Error("Touchpoints reference bytes changed");
  const response = (name: string) =>
    JSON.parse(
      readFileSync(
        new URL(`../wikipedia/touchpoints-${name}.json`, import.meta.url),
        "utf8",
      ),
    );
  return {
    classIri: "https://example.test/touchpoints#JournalArticle",
    individualIri: "https://example.test/touchpoints#MarieCurie",
    classResponse: response("class"),
    refreshResponse: response("class-refresh"),
    individualResponse: response("individual"),
    fetchedAt: new Date(2026, 2, 2, 14, 11).toISOString(),
    turtle: `@prefix ex: <https://example.test/touchpoints#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
ex:JournalArticle a owl:Class; rdfs:label "Journal Article"; rdfs:subClassOf owl:Thing;
 skos:altLabel "Academic journal", "Article (publishing)", "Scientific journal";
 skos:closeMatch <http://dbpedia.org/resource/Research> .
ex:Person a owl:Class; rdfs:label "Person"; rdfs:subClassOf owl:Thing .
ex:MarieCurie a owl:NamedIndividual, ex:Person; rdfs:label "Marie Curie";
 skos:closeMatch <http://dbpedia.org/resource/Radioactive_decay> .`,
  };
}
