import { randomUUID } from "node:crypto";
import { NS, type Triple } from "../domain/model";
import {
  touchpointObject,
  touchpointPredicates,
  type TouchpointContext,
  type TouchpointProvider,
  type TouchpointResponse,
  type TouchpointSelection,
  type TouchpointSearchResult,
} from "../shared/touchpoints";

export class TouchpointService {
  private responses = new Map<string, TouchpointResponse>();
  constructor(
    private provider: TouchpointProvider,
    private context: (iri: string) => Promise<TouchpointContext>,
    private insert: (
      context: TouchpointContext,
      statements: Triple[],
    ) => Promise<{ count: number; context: TouchpointContext }>,
    private compare?: (query: string, texts: string[]) => Promise<number[]>,
  ) {}
  async search(input: {
    iri: string;
    query: string;
    refresh?: boolean;
  }): Promise<TouchpointResponse> {
    if (
      !input ||
      typeof input.iri !== "string" ||
      typeof input.query !== "string"
    )
      throw Error("Choose an entity and enter a query.");
    const context = await this.context(input.iri);
    const result = await this.provider.search({
      entityIri: input.iri,
      query: input.query,
      refresh: input.refresh === true,
    });
    return this.remember(context, input.query, result);
  }
  // craigtrim/axiom#92: opening a pane never falls through to a network request.
  async saved(input: { iri: string; query: string }) {
    if (
      !input ||
      typeof input.iri !== "string" ||
      typeof input.query !== "string"
    )
      throw Error("Choose an entity and enter a query.");
    const context = await this.context(input.iri);
    const result = await this.provider.readSaved?.({
      entityIri: input.iri,
      query: input.query,
    });
    return result ? this.remember(context, input.query, result) : undefined;
  }
  private async remember(
    context: TouchpointContext,
    query: string,
    result: TouchpointSearchResult,
  ) {
    let candidates = result.candidates;
    let ranking: "model" | "wikipedia" = "wikipedia";
    if (this.compare && candidates.length) {
      try {
        const scores = await this.compare(
          [context.label, ...context.parents, context.comment]
            .filter(Boolean)
            .join(". "),
          candidates.map((c) =>
            [c.label, c.description].filter(Boolean).join(". "),
          ),
        );
        if (
          scores.length === candidates.length &&
          scores.every(Number.isFinite)
        ) {
          ranking = "model";
          candidates = candidates
            .map((c, i) => ({ c, score: Math.max(-1, Math.min(1, scores[i])) }))
            .sort((a, b) => b.score - a.score || a.c.rank - b.c.rank)
            .map((r) => ({ ...r.c, similarity: r.score }));
        }
      } catch {
        /* Missing or unavailable local inference preserves provider order. */
      }
    }
    const response: TouchpointResponse = {
      ...result,
      ranking,
      candidates,
      context,
      query,
      token: randomUUID(),
    };
    this.responses.set(response.token, response);
    while (this.responses.size > 32)
      this.responses.delete(this.responses.keys().next().value!);
    return structuredClone(response);
  }
  async apply(token: string, selections: TouchpointSelection[]) {
    const response = this.responses.get(token);
    if (!response) throw Error("Search again before applying touchpoints.");
    if (
      !Array.isArray(selections) ||
      !selections.length ||
      selections.length > 20 ||
      new Set(selections.map((s) => s?.id)).size !== selections.length
    )
      throw Error("Select available touchpoints once each.");
    const current = await this.context(response.context.iri);
    if (
      current.datasetEpoch !== response.context.datasetEpoch ||
      current.version !== response.context.version
    )
      throw Error(
        "The ontology changed since this search. Search again before applying touchpoints.",
      );
    const predicates = [
      ...touchpointPredicates,
      NS.rdfs + "seeAlso",
      ...(current.kind === "Individual" ? [NS.owl + "sameAs"] : []),
    ];
    const statements: Triple[] = selections.map((selection) => {
      const candidate = response.candidates.find((c) => c.id === selection.id);
      if (
        !candidate ||
        candidate.disambiguation ||
        !predicates.includes(selection.predicate) ||
        !["dbpedia", "wikipedia", "wikidata"].includes(selection.object)
      )
        throw Error("Select an available concept and relationship.");
      const object = touchpointObject(candidate, selection.object);
      if (!object) throw Error("This page has no Wikidata item.");
      if (
        current.links.some(
          (link) =>
            !link.literal &&
            link.predicate === selection.predicate &&
            link.iri === object,
        )
      )
        throw Error(`${candidate.label} already has that statement.`);
      return {
        subject: current.iri,
        predicate: selection.predicate,
        object: { literal: false, value: object },
      };
    });
    const applied = await this.insert(response.context, statements);
    // The worker captures this context in the mutation, before another queued edit.
    response.context = applied.context;
    return applied.count;
  }
}
