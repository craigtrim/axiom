import { textAnalysisConcepts } from "./text-analysis-concepts";
import type { Store } from "./store";
import { writeRdf } from "./rdf-io";
import { statementKey } from "./rdf-model";
import type { TextAnalysisContext } from "../shared/text-analysis";

export async function textAnalysisContext(
  store: Store,
  datasetEpoch: number,
): Promise<TextAnalysisContext> {
  const version = store.version,
    name = store.ontology.name;
  // The built-in demo keeps display labels outside its RDF and generates its
  // order/customer tables on demand. Match its authored vocabulary, with the
  // same labels exposed by the entity editor. Imported RDF is included in full.
  const source = store.ontology.example
    ? [
        ...store.tbox,
        ...store.rbox,
        ...[...store.entities.keys()].flatMap((iri) =>
          store.entityStatements(iri),
        ),
      ]
    : [...store.scan()];
  const union = new Map(
    source.map((triple) => {
      const value = {
        ...triple,
        object: { ...triple.object },
        graph: undefined,
      };
      return [statementKey(value), value];
    }),
  );
  const triples = [...union.values()];
  return {
    // craigtrim/axiom#137: snapshot the same union used by the full native load.
    statements: triples,
    concepts: textAnalysisConcepts(store, triples),
    turtle: await writeRdf(triples, "turtle"),
    name,
    datasetEpoch,
    version,
  };
}
