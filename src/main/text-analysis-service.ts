import { performance } from "node:perf_hooks";
import { MutatocClient, MutatocError } from "./mutatoc-client";
import {
  textEntities,
  type MutatocToken,
  type TokenDictionaries,
} from "./text-analysis-spans";
import {
  MAX_ANALYSIS_TEXT,
  type TextAnalysisContext,
  type TextAnalysisInput,
  type TextAnalysisResult,
} from "../shared/text-analysis";
interface Job {
  input: TextAnalysisInput;
  resolve(value: TextAnalysisResult): void;
  reject(error: Error): void;
}
export class TextAnalysisService {
  private client?: MutatocClient;
  private loaded = "";
  private emptyOntology = false;
  private concepts: NonNullable<TextAnalysisContext["concepts"]> = {};
  private dictionaries?: TokenDictionaries;
  private queued?: Job;
  private running = false;
  private closed = false;
  constructor(
    private executable: () => string,
    private context: () => Promise<TextAnalysisContext>,
  ) {}
  parse(input: TextAnalysisInput): Promise<TextAnalysisResult> {
    if (
      !input ||
      typeof input.text !== "string" ||
      input.text.length > MAX_ANALYSIS_TEXT ||
      !Number.isSafeInteger(input.datasetEpoch) ||
      !Number.isSafeInteger(input.version)
    )
      return Promise.reject(
        Error("Enter plain text of up to 100,000 characters."),
      );
    if (this.closed) return Promise.reject(Error("Text Analysis is closed."));
    return new Promise((resolve, reject) => {
      if (this.queued) this.queued.resolve(this.superseded(this.queued.input));
      this.queued = { input, resolve, reject };
      void this.drain();
    });
  }
  private superseded(input: TextAnalysisInput): TextAnalysisResult {
    return {
      ...input,
      canonical: "",
      entities: [],
      milliseconds: 0,
      superseded: true,
    };
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queued && !this.closed) {
        const job = this.queued;
        this.queued = undefined;
        try {
          job.resolve(await this.analyze(job.input));
        } catch (error) {
          this.client?.close();
          this.client = undefined;
          this.loaded = "";
          this.concepts = {};
          this.dictionaries = undefined;
          job.reject(error instanceof Error ? error : Error(String(error)));
        }
      }
    } finally {
      this.running = false;
    }
  }
  private async analyze(input: TextAnalysisInput): Promise<TextAnalysisResult> {
    const start = performance.now();
    if (!input.text.trim())
      return { ...input, canonical: "", entities: [], milliseconds: 0 };
    const key = `${input.datasetEpoch}:${input.version}`;
    this.client ??= new MutatocClient(this.executable());
    if (this.loaded !== key) {
      const context = await this.context();
      if (this.closed) return this.superseded(input);
      if (
        context.datasetEpoch !== input.datasetEpoch ||
        context.version !== input.version
      )
        return this.superseded(input);
      await this.client.request({
        op: "load",
        turtle: context.turtle,
        name: context.name,
        class_based: true,
        interface: "data",
      });
      this.concepts = context.concepts ?? {};
      this.loaded = key;
      this.emptyOntology = false;
    }
    if (!this.dictionaries) {
      const contractions = await this.client.request<
        TokenDictionaries["contractions"]
      >({ op: "lingpatlab", method: "dictionary", name: "d_enclictics" });
      const abbreviations = await this.client.request<
        TokenDictionaries["abbreviations"]
      >({ op: "lingpatlab", method: "dictionary", name: "d_abbreviations" });
      this.dictionaries = { contractions, abbreviations };
    }
    let parsed: { text: string; tokens: MutatocToken[] } | undefined;
    if (!this.emptyOntology) {
      try {
        parsed = await this.client.request({ op: "parse", text: input.text });
      } catch (error) {
        if (
          !(error instanceof MutatocError) ||
          error.code !== 4 ||
          error.message !== "Empty ontology"
        )
          throw error;
        this.emptyOntology = true;
      }
    }
    // A blank ontology has no ontology matches, but the native preprocessing
    // and trained model still provide their ordinary entity annotations.
    parsed ??= {
      text: input.text,
      tokens: await this.client.request<MutatocToken[]>({
        op: "tokenize",
        text: input.text,
      }),
    };
    const entities = textEntities(input.text, parsed.tokens, this.dictionaries);
    const concepts = Object.fromEntries(
      [
        ...new Set(
          entities
            .filter((entity) => entity.source === "ontology")
            .map((entity) => entity.label),
        ),
      ]
        .filter((label) => Object.hasOwn(this.concepts, label))
        .map((label) => [label, this.concepts[label]]),
    );
    return {
      ...input,
      canonical: parsed.text,
      entities,
      concepts,
      milliseconds: Math.round(performance.now() - start),
    };
  }
  close() {
    this.closed = true;
    if (this.queued) this.queued.resolve(this.superseded(this.queued.input));
    this.queued = undefined;
    this.client?.close();
  }
}
