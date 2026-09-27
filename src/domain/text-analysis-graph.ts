import type { Store } from "./store";
import { ancestryGraphNodes } from "./ancestry-graph";
import { MAX_VISIBLE_NODES } from "../shared/graph-limits";

export function textAnalysisGraphNodes(
  store: Store,
  selection: unknown,
  limit = MAX_VISIBLE_NODES,
) {
  if (
    !Array.isArray(selection) ||
    selection.length > 100_000 ||
    selection.some(
      (iri) =>
        typeof iri !== "string" || iri.length > 10000 || iri.startsWith("_:"),
    )
  )
    throw Error("Invalid Text Analysis graph selection.");
  const matches = [...new Set(selection as string[])];
  if (!matches.length)
    throw Error("There are no matched ontology entries to graph.");
  if (matches.some((iri) => !store.exists(iri) || !store.graphVisible(iri)))
    throw Error(
      "A matched ontology entry is no longer available. Analyze the text again.",
    );
  return ancestryGraphNodes(
    store,
    matches,
    limit,
    "Analyze a smaller selection of text.",
  );
}
