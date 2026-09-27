import {
  MAX_ANALYSIS_TEXT,
  type TextAnalysisInput,
  type TextAnalysisResult,
} from "../shared/text-analysis";
export type LiveAnalysisState =
  | { status: "idle" | "pending" }
  | { status: "ready"; result: TextAnalysisResult }
  | { status: "error"; message: string };
/** Keep only the newest edit while the engine is busy. */
export class LiveAnalysis {
  private revision = 0;
  private latest?: { revision: number; input: TextAnalysisInput };
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private disposed = false;
  constructor(
    private parse: (input: TextAnalysisInput) => Promise<TextAnalysisResult>,
    private publish: (state: LiveAnalysisState) => void,
    private delay = 60,
  ) {}
  update(input: TextAnalysisInput) {
    if (this.disposed) return;
    const revision = ++this.revision;
    clearTimeout(this.timer);
    this.latest = undefined;
    if (!input.text.trim()) {
      this.publish({ status: "idle" });
      return;
    }
    if (input.text.length > MAX_ANALYSIS_TEXT) {
      this.publish({
        status: "error",
        message:
          "Text Analysis supports up to 100,000 characters. Shorten the text to resume automatic highlighting.",
      });
      return;
    }
    this.publish({ status: "pending" });
    this.timer = setTimeout(() => {
      this.latest = { revision, input };
      void this.run();
    }, this.delay);
  }
  private async run() {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      while (this.latest && !this.disposed) {
        const { revision, input } = this.latest;
        this.latest = undefined;
        try {
          const result = await this.parse(input);
          if (
            !this.disposed &&
            revision === this.revision &&
            !result.superseded
          )
            this.publish({ status: "ready", result });
        } catch (error) {
          if (!this.disposed && revision === this.revision)
            this.publish({
              status: "error",
              message: error instanceof Error ? error.message : String(error),
            });
        }
      }
    } finally {
      this.running = false;
    }
  }
  dispose() {
    this.disposed = true;
    ++this.revision;
    this.latest = undefined;
    clearTimeout(this.timer);
  }
}
