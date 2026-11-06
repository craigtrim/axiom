import { setImmediate as yieldImmediate } from "node:timers/promises";
import { textAnalysisConceptsAsync } from "./text-analysis-concepts";
import type { Store } from "./store";
import type { Triple } from "./model";
import { writeRdf } from "./rdf-io";
import { statementKey } from "./rdf-model";
import type { TextAnalysisContext } from "../shared/text-analysis";

// craigtrim/axiom#207: selections can run while a large ontology is captured.
export class StaleTextAnalysisContext extends Error {
  constructor() {
    super("The ontology changed during Text Analysis capture.");
  }
}

export async function textAnalysisContext(
  store: Store,
  datasetEpoch: number,
  isCurrent: () => boolean = () => true,
): Promise<TextAnalysisContext> {
  const version = store.version,
    name = store.ontology.name;
  const ensureCurrent = () => {
    if (store.version !== version || !isCurrent())
      throw new StaleTextAnalysisContext();
  };
  const yieldControl = async () => {
    ensureCurrent();
    await yieldImmediate();
    ensureCurrent();
  };
  // The built-in demo keeps display labels outside its RDF and generates its
  // order/customer tables on demand. Match its authored vocabulary, with the
  // same labels exposed by the entity editor. Imported RDF is included in full.
  function* source(): Generator<Triple> {
    if (store.ontology.example) {
      yield* store.tbox;
      yield* store.rbox;
      for (const iri of store.entities.keys())
        yield* store.entityStatements(iri);
    } else yield* store.scan();
  }
  ensureCurrent();
  const union = new Map<string, Triple>();
  let count = 0;
  for (const triple of source()) {
    const value = {
      ...triple,
      object: { ...triple.object },
      graph: undefined,
    };
    union.set(statementKey(value), value);
    if (++count % 2048 === 0) await yieldControl();
  }
  const triples = [...union.values()];
  const concepts = await textAnalysisConceptsAsync(
    store,
    triples,
    yieldControl,
  );
  const turtle = await writeRdf(triples, "turtle", { yieldControl });
  ensureCurrent();
  return {
    // craigtrim/axiom#137: snapshot the same union used by the full native load.
    statements: triples,
    concepts,
    turtle,
    name,
    datasetEpoch,
    version,
  };
}
