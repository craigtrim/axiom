import { auditStep, auditMetadata } from "./audit-log";
import { LocalAssistantRunner, discoverAssistants } from "./local-assistant";
import {
  buildQueryPrompt,
  extractQueryProposal,
  querySchema,
  type QueryContext,
  type QueryAssistantRequest,
  type QueryAssistantResponse,
  type QueryAssistantStatus,
} from "../shared/query-assistant";
import { formatQuery } from "../domain/query-format";
import { parseQuery, queryIris } from "../domain/query-parser";
import { NS } from "../domain/model";
export function validateQueryProposal(
  text: string,
  context: QueryContext,
): string | null {
  try {
    const parsed = parseQuery(text);
    const known = new Set([
      ...context.terms.flatMap((t) => [
        t.iri,
        ...t.parents,
        t.domain,
        t.range,
        t.inverse,
      ]),
      ...context.types,
      ...context.predicates.map((p) => p.iri),
    ]);
    for (const iri of queryIris(parsed)) {
      if (
        !known.has(iri) &&
        ![NS.rdf, NS.rdfs, NS.owl, NS.xsd].some((ns) => iri.startsWith(ns))
      )
        throw Error(
          "The query uses an IRI absent from the supplied context: " + iri,
        );
    }
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
export class QueryAssistantService {
  private runner: LocalAssistantRunner;
  private current: QueryAssistantStatus = { running: false };
  private cancelled = false;
  constructor(
    root: string,
    private context: (instructions: string) => Promise<QueryContext>,
    discover = discoverAssistants,
    timeoutMs = 300000,
  ) {
    this.runner = new LocalAssistantRunner(root, discover, timeoutMs);
  }
  assistants() {
    return this.runner.assistants();
  }
  status() {
    return {
      ...this.current,
      cancelling: this.current.running && this.cancelled,
    };
  }
  cancel() {
    this.cancelled = true;
    this.runner.cancel();
  }
  async run(input: QueryAssistantRequest): Promise<QueryAssistantResponse> {
    if (this.current.running)
      throw Error("Query generation is already running.");
    if (
      !input ||
      (input.queryId !== undefined &&
        (typeof input.queryId !== "string" || input.queryId.length > 100)) ||
      !["codex", "claude"].includes(input.provider) ||
      typeof input.instructions !== "string" ||
      !input.instructions.trim() ||
      input.instructions.length > 12000 ||
      typeof input.currentQuery !== "string" ||
      input.currentQuery.length > 100000 ||
      !Number.isInteger(input.datasetEpoch) ||
      !Number.isInteger(input.version)
    )
      throw Error(
        "Choose an assistant and describe the query (12,000 characters maximum).",
      );
    this.current = {
      running: true,
      startedAt: Date.now(),
      provider: input.provider,
    };
    this.cancelled = false;
    try {
      auditStep("Preparing ontology context");
      const context = await this.context(input.instructions);
      if (
        context.version !== input.version ||
        context.datasetEpoch !== input.datasetEpoch
      )
        throw Error(
          "The ontology changed. Review the context and generate again.",
        );
      if (this.cancelled) throw Error("Query generation cancelled.");
      const raw = await this.runner.run(
        input.provider,
        buildQueryPrompt(context, input),
        querySchema,
      );
      if (this.cancelled) throw Error("Query generation cancelled.");
      auditStep("Parsing query proposal");
      const result = extractQueryProposal(raw);
      auditStep("Validating generated query");
      const validation =
        result.status === "query"
          ? validateQueryProposal(result.sparql, context)
          : null;
      if (result.status === "query" && !validation)
        result.sparql = formatQuery(result.sparql);
      const response = {
        context,
        request: input,
        result,
        validation,
        completedAt: new Date().toISOString(),
      };
      this.current = { running: false, response };
      return response;
    } catch (e) {
      this.current = { running: false, error: (e as Error).message };
      throw e;
    }
  }
}
