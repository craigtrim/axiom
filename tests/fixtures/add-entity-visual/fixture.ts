// craigtrim/axiom#93: pin the reference bytes and load its entities as real RDF.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { entityIdentifier } from "../../../src/shared/entity-names";
import { NS } from "../../../src/domain/model";
export const addEntityReference = path.resolve(
  "tests/fixtures/add-entity-visual/visual-reference.html",
);
export function addEntityFixture() {
  const bytes = readFileSync(addEntityReference);
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    "ce08b87e5c0fa31a9621984d9fabc77ca61046561deaf5c464ee7dd14a341651"
  )
    throw Error("The #93 visual reference changed.");
  const names = JSON.parse(
    bytes.toString("utf8").match(/var STORE = (\[[\s\S]*?\]);/)![1],
  ) as string[];
  const base = "http://example.org/axiom#";
  return {
    base,
    names,
    turtle:
      `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .\n: a owl:Ontology .\n` +
      names
        .map(
          (name) =>
            `:${entityIdentifier(name)} a owl:Class; rdfs:label ${JSON.stringify(name)}; rdfs:subClassOf owl:Thing .`,
        )
        .join("\n") +
      "\n:Seminar a owl:ObjectProperty . :GIS a owl:NamedIndividual .",
  };
}
