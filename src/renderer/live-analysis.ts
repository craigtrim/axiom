import {
  MAX_ANALYSIS_TEXT,
  type TextAnalysisInput,
  type TextAnalysisResult,
} from "../shared/text-analysis";
export type LiveAnalysisState =
  | { status: "idle" }
  | { status: "pending"; result?: TextAnalysisResult }
  | { status: "ready"; result: TextAnalysisResult }
  | { status: "error"; message: string };
export function analysisResult(state: LiveAnalysisState) {
  return state.status === "ready" || state.status === "pending"
    ? state.result
    : undefined;
}
export function pendingAnalysis(
  state: LiveAnalysisState,
  input: TextAnalysisInput,
): LiveAnalysisState {
  if (!input.text.trim()) return { status: "idle" };
  if (input.text.length > MAX_ANALYSIS_TEXT)
    return {
      status: "error",
      message:
        "Text Analysis supports up to 100,000 characters. Shorten the text to resume automatic highlighting.",
    };
  const result = analysisResult(state);
  return {
    status: "pending",
    ...(result?.datasetEpoch === input.datasetEpoch &&
    result.version === input.version
      ? { result }
      : {}),
  };
}
/** Keep only the newest edit while the engine is busy. */
export class LiveAnalysis {
  private revision = 0;
  private latest?: { revision: number; input: TextAnalysisInput };
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private disposed = false;
  private state: LiveAnalysisState = { status: "idle" };
  constructor(
    private parse: (input: TextAnalysisInput) => Promise<TextAnalysisResult>,
    private onState: (state: LiveAnalysisState) => void,
    private delay = 60,
  ) {}
  private publish(state: LiveAnalysisState) {
    this.state = state;
    this.onState(state);
  }
  update(input: TextAnalysisInput) {
    if (this.disposed) return;
    const revision = ++this.revision;
    clearTimeout(this.timer);
    this.latest = undefined;
    this.publish(pendingAnalysis(this.state, input));
    if (this.state.status !== "pending") return;
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
