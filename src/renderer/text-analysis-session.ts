import { LiveAnalysis, type LiveAnalysisState } from "./live-analysis";
import type {
  TextAnalysisInput,
  TextAnalysisResult,
  TextEntity,
} from "../shared/text-analysis";

export interface TextEntityClassDraft {
  label: string;
  comment: string;
  parents: ({ iri: string } | { create: TextEntityClassDraft })[];
  manualParents: boolean;
}
export interface TextEntityDraft {
  frames: { value: TextEntityClassDraft; editIndex?: number }[];
}
export interface TextAnalysisSessionState {
  input: TextAnalysisInput;
  analysis: LiveAnalysisState;
  mode: "summary" | "add";
  details?: { entity: TextEntity; result: TextAnalysisResult };
  creation?: { phrase: string; datasetEpoch: number; draft?: TextEntityDraft };
  created?: { iri: string; label: string; parents: string[] };
}
/** Both dockable views share one parser queue and the current interaction. */
export class TextAnalysisSession {
  private value: TextAnalysisSessionState = {
    input: { text: "", datasetEpoch: -1, version: -1 },
    analysis: { status: "idle" },
    mode: "summary",
  };
  private listeners = new Set<() => void>();
  private live: LiveAnalysis;
  constructor(
    parse: (input: TextAnalysisInput) => Promise<TextAnalysisResult>,
    delay = 60,
  ) {
    this.live = new LiveAnalysis(
      parse,
      (analysis) => this.publish({ analysis }),
      delay,
    );
  }
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<TextAnalysisSessionState>) {
    this.value = { ...this.value, ...change };
    for (const listener of this.listeners) listener();
  }
  update(input: TextAnalysisInput) {
    const old = this.value.input;
    if (
      old.text === input.text &&
      old.datasetEpoch === input.datasetEpoch &&
      old.version === input.version
    )
      return;
    const replace =
      old.text !== input.text || old.datasetEpoch !== input.datasetEpoch;
    this.publish({
      input,
      analysis: { status: input.text.trim() ? "pending" : "idle" },
      details: undefined,
      mode: replace ? "summary" : this.value.mode,
      ...(replace ? { creation: undefined, created: undefined } : {}),
    });
    this.live.update(input);
  }
  showDetails(entity: TextEntity) {
    const analysis = this.value.analysis;
    if (
      analysis.status !== "ready" ||
      !analysis.result.entities.includes(entity)
    )
      return false;
    this.publish({
      details: { entity, result: analysis.result },
    });
    return true;
  }
  clearDetails() {
    if (this.value.details) this.publish({ details: undefined });
  }
  create(phrase: string) {
    if (!phrase.trim() || phrase.trim().length > 256) return;
    this.publish({
      mode: "add",
      creation: {
        phrase: phrase.trim(),
        datasetEpoch: this.value.input.datasetEpoch,
      },
      details: undefined,
      created: undefined,
    });
  }
  updateDraft = (draft: TextEntityDraft) => {
    const creation = this.value.creation;
    if (!creation) return;
    const previous = creation.draft;
    if (previous === draft) return;
    this.publish({ creation: { ...creation, draft } });
  };
  setMode(mode: TextAnalysisSessionState["mode"]) {
    if (mode === "add" && !this.value.creation) return;
    this.publish({ mode });
  }
  summary() {
    this.publish({ mode: "summary", creation: undefined });
  }
  added(iri: string, label: string, parents: string[]) {
    this.publish({
      mode: "summary",
      details: undefined,
      creation: undefined,
      created: { iri, label, parents },
    });
  }
  reset(input: TextAnalysisInput) {
    this.publish({
      mode: "summary",
      details: undefined,
      creation: undefined,
      created: undefined,
    });
    this.update(input);
  }
  dispose() {
    this.live.dispose();
    this.listeners.clear();
  }
}
export function textEntityGroups(result?: TextAnalysisResult) {
  const groups = new Map<string, { entity: TextEntity; count: number }>();
  for (const entity of result?.entities ?? []) {
    const previous = groups.get(entity.key);
    if (previous) previous.count++;
    else groups.set(entity.key, { entity, count: 1 });
  }
  return [...groups.values()];
}
