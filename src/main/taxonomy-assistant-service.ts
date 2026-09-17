import { LocalAssistantRunner, discoverAssistants } from "./local-assistant";
import {
  buildTaxonomyPrompt,
  parseTaxonomyReply,
  taxonomyMode,
  type TaxonomyContext,
  type TaxonomyRequest,
  type TaxonomyResponse,
  type TaxonomyStatus,
  type TaxonomySuggestion,
} from "../shared/taxonomy-assistant";

export class TaxonomyAssistantService {
  private runner: LocalAssistantRunner;
  private current: TaxonomyStatus = { running: false };
  private cancelled = false;
  private applying = false;
  private applied = new Set<number>();
  constructor(
    root: string,
    private context: (input: TaxonomyRequest) => Promise<TaxonomyContext>,
    private validate: (
      context: TaxonomyContext,
      suggestions: TaxonomySuggestion[],
    ) => Promise<(string | null)[]>,
    private insert: (
      context: TaxonomyContext,
      suggestions: TaxonomySuggestion[],
    ) => Promise<string[]>,
    discover = discoverAssistants,
    timeoutMs = 300000,
  ) {
    this.runner = new LocalAssistantRunner(root, discover, timeoutMs);
  }
  status() {
    return {
      ...this.current,
      cancelling: this.current.running && this.cancelled,
    };
  }
  cancel(id?: string) {
    if (id !== undefined && id !== this.current.id) return;
    this.cancelled = true;
    this.runner.cancel();
  }
  async run(input: TaxonomyRequest): Promise<TaxonomyResponse> {
    if (this.current.running || this.applying)
      throw Error("Taxonomy suggestions are already running.");
    if (
      !input ||
      typeof input.id !== "string" ||
      !input.id ||
      input.id.length > 100 ||
      typeof input.iri !== "string" ||
      !input.iri ||
      input.iri.length > 10000 ||
      !Number.isInteger(input.datasetEpoch) ||
      !Number.isInteger(input.version)
    )
      throw Error("Choose a class to find suggestions.");
    taxonomyMode(input.mode);
    const provider = input.provider ?? "claude";
    if (!["claude", "codex"].includes(provider))
      throw Error("Choose Claude or Codex.");
    this.current = {
      running: true,
      provider,
      id: input.id,
      startedAt: Date.now(),
      mode: input.mode,
    };
    this.cancelled = false;
    this.applied.clear();
    try {
      const context = await this.context(input);
      this.current = { ...this.current, activeEntity: context.selected.label };
      if (
        context.datasetEpoch !== input.datasetEpoch ||
        context.version !== input.version
      )
        throw Error("The ontology changed. Find suggestions again.");
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      const raw = await this.runner.run(
        provider,
        buildTaxonomyPrompt(context),
        null,
      );
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      const result = parseTaxonomyReply(raw, context);
      const issues = await this.validate(context, result.suggestions);
      if (this.cancelled) throw Error("Taxonomy suggestions cancelled.");
      const response = {
        provider,
        id: input.id,
        context,
        result,
        issues,
        completedAt: new Date().toISOString(),
      };
      this.current = { running: false, id: input.id, response };
      return response;
    } catch (e) {
      this.current = {
        running: false,
        id: input.id,
        error: (e as Error).message,
      };
      throw e;
    }
  }
  async apply(id: string, indices: number[]) {
    const response = this.current.response;
    if (
      this.current.running ||
      this.applying ||
      !response ||
      response.id !== id
    )
      throw Error(
        "These suggestions are no longer available. Find suggestions again.",
      );
    if (
      !Array.isArray(indices) ||
      !indices.length ||
      indices.length > 12 ||
      new Set(indices).size !== indices.length ||
      indices.some(
        (i) =>
          !Number.isInteger(i) ||
          i < 0 ||
          i >= response.result.suggestions.length ||
          response.issues[i] ||
          this.applied.has(i),
      )
    )
      throw Error("Select available suggestions.");
    this.applying = true;
    try {
      const created = await this.insert(
        response.context,
        indices.map((i) => response.result.suggestions[i]),
      );
      for (const index of indices) this.applied.add(index);
      return created;
    } finally {
      this.applying = false;
    }
  }
}
