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
  private active = false;
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
  }
  assistants() {
    return this.runner.assistants();
  }
  status() {
    return { running: this.active, response: this.last, error: this.error };
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
    this.cancelled = false;
    this.error = undefined;
    try {
      const context = await this.context(input.iri);
      if (
        context.datasetEpoch !== input.datasetEpoch ||
        context.version !== input.version
      )
        throw Error(
          "The ontology changed. Review the refreshed context and run research again.",
        );
      if (this.cancelled) throw Error("Research cancelled.");
      const raw = await this.runner.run(
        input.provider,
        buildResearchPrompt(context, input.instructions, input.web),
        researchSchema,
        input.web,
      );
      this.last = {
        context,
        result: parseResearchResult(
          typeof raw === "string" ? JSON.parse(raw) : raw,
        ),
        provider: input.provider,
        completedAt: new Date().toISOString(),
      };
      return this.last;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.active = false;
    }
  }
}
