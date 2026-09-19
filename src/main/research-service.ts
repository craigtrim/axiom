import { auditStep, auditMetadata } from "./audit-log";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ResearchCache, researchPromptHash } from "./research-cache";
import { LocalAssistantRunner, discoverAssistants } from "./local-assistant";
import {
  buildResearchPrompt,
  parseResearchResult,
  researchSchema,
  type ResearchContext,
  type ResearchRequest,
  type ResearchResponse,
} from "../shared/research";
export { assistantArguments, discoverAssistants } from "./local-assistant";
export type { AssistantCommand } from "./local-assistant";
export class ResearchService {
  private runner: LocalAssistantRunner;
  private cache: ResearchCache;
  private active = false;
  private activeEntity?: string;
  private startedAt?: number;
  private provider?: ResearchRequest["provider"];
  private cancelled = false;
  private last?: ResearchResponse;
  private error?: string;
  constructor(
    root: string,
    private context: (iri: string) => Promise<ResearchContext>,
    discover = discoverAssistants,
    timeoutMs = 300000,
  ) {
    this.runner = new LocalAssistantRunner(root, discover, timeoutMs);
    this.cache = new ResearchCache(path.join(root, "cache"));
  }
  assistants() {
    return this.runner.assistants();
  }
  status() {
    return {
      running: this.active,
      startedAt: this.startedAt,
      provider: this.provider,
      cancelling: this.active && this.cancelled,
      response: this.last,
      error: this.error,
      activeEntity: this.activeEntity,
    };
  }
  cancel() {
    this.cancelled = true;
    this.runner.cancel();
  }
  async run(input: ResearchRequest): Promise<ResearchResponse> {
    if (this.active)
      throw Error(
        "Research is already running. Cancel it or wait for completion.",
      );
    if (
      !input ||
      !["codex", "claude"].includes(input.provider) ||
      typeof input.iri !== "string" ||
      input.iri.length > 10000 ||
      typeof input.instructions !== "string" ||
      !input.instructions.trim() ||
      input.instructions.length > 20000 ||
      typeof input.web !== "boolean"
    )
      throw Error("Choose an assistant, an entity and a research prompt.");
    this.active = true;
    this.startedAt = Date.now();
    this.provider = input.provider;
    this.cancelled = false;
    this.error = undefined;
    try {
      auditStep("Preparing ontology context");
      const context = await this.context(input.iri);
      auditMetadata({
        entity: context.entity.name,
        iri: context.entity.iri,
        provider: input.provider,
      });
      this.activeEntity = context.entity.name;
      if (
        context.datasetEpoch !== input.datasetEpoch ||
        context.version !== input.version
      )
        throw Error(
          "The ontology changed. Review the refreshed context and run research again.",
        );
      if (this.cancelled) throw Error("Research cancelled.");
      const prompt = buildResearchPrompt(
        context,
        input.instructions,
        input.web,
      );
      const md5 = researchPromptHash(prompt);
      const cached = await this.cache.get(prompt);
      if (this.cancelled) throw Error("Research cancelled.");
      if (cached) {
        this.last = {
          context,
          result: cached.result,
          provider: cached.provider,
          completedAt: cached.completedAt,
          responseId: randomUUID(),
          cache: { hit: true, md5 },
        };
        return this.last;
      }
      const raw = await this.runner.run(
        input.provider,
        prompt,
        researchSchema,
        input.web,
      );
      if (this.cancelled) throw Error("Research cancelled.");
      auditStep("Parsing research response");
      const response: ResearchResponse = {
        context,
        result: parseResearchResult(
          typeof raw === "string" ? JSON.parse(raw) : raw,
        ),
        provider: input.provider,
        completedAt: new Date().toISOString(),
        responseId: randomUUID(),
        cache: { hit: false, md5 },
      };
      try {
        await this.cache.put(
          prompt,
          response.result,
          response.provider,
          response.completedAt,
          () => this.cancelled,
        );
      } catch {
        response.cache!.warning =
          "This result could not be cached. Repeating the request may run the assistant again.";
      }
      if (this.cancelled) throw Error("Research cancelled.");
      this.last = response;
      return this.last;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.active = false;
      this.activeEntity = undefined;
    }
  }
}
