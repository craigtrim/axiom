import {
  LiveAnalysis,
  analysisResult,
  pendingAnalysis,
  type LiveAnalysisState,
} from "./live-analysis";
import { selectionContext } from "./text-parent-options";
import type {
  TextAnalysisInput,
  TextAnalysisResult,
  TextEntity,
  TextAnalysisClassInput,
} from "../shared/text-analysis";
import type { FindCreationDraft } from "../shared/find-create";

export interface TextEntityClassDraft {
  label: string;
  comment: string;
  parents: ({ iri: string } | { create: TextEntityClassDraft })[];
  manualParents: boolean;
  iri?: string;
  statements?: TextAnalysisClassInput["statements"];
  checkAllEntities?: boolean;
  allowSimilarName?: boolean;
  findDraft?: FindCreationDraft;
}
export interface TextEntityDraft {
  frames: { value: TextEntityClassDraft; editIndex?: number }[];
}
export interface TextEntityCreated {
  iri: string;
  label: string;
  parents: string[];
}
export interface TextAnalysisSessionState {
  input: TextAnalysisInput;
  analysis: LiveAnalysisState;
  mode: "summary" | "add";
  view: "text" | "summary";
  details?: { entity: TextEntity; result: TextAnalysisResult };
  creation?: {
    phrase: string;
    datasetEpoch: number;
    draft?: TextEntityDraft;
    context?: { before: string; after: string };
  };
  created?: TextEntityCreated & { classes?: TextEntityCreated[] };
}
/** Both dockable views share one parser queue and the current interaction. */
export class TextAnalysisSession {
  private value: TextAnalysisSessionState = {
    input: { text: "", datasetEpoch: -1, version: -1 },
    analysis: { status: "idle" },
    mode: "summary",
    view: "text",
  };
  private listeners = new Set<() => void>();
  private live: LiveAnalysis;
  private disposed = false;
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
    if (this.disposed) return;
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
      analysis: pendingAnalysis(this.value.analysis, input),
      details: undefined,
      mode: replace ? "summary" : this.value.mode,
      ...(replace ? { creation: undefined, created: undefined } : {}),
    });
    this.live.update(input);
  }
  showDetails(entity: TextEntity) {
    const result = analysisResult(this.value.analysis);
    if (!result?.entities.includes(entity)) return false;
    this.publish({
      details: { entity, result },
    });
    return true;
  }
  clearDetails() {
    if (this.value.details) this.publish({ details: undefined });
  }
  create(phrase: string, start?: number) {
    if (!phrase.trim() || phrase.trim().length > 256) return;
    this.publish({
      mode: "add",
      creation: {
        phrase: phrase.trim(),
        datasetEpoch: this.value.input.datasetEpoch,
        context: selectionContext(this.value.input.text, phrase.trim(), start),
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
  openDraft(draft: TextEntityClassDraft, parentLabel?: string) {
    const frames = [{ value: draft }];
    if (parentLabel)
      frames.push({
        value: {
          label: parentLabel,
          comment: "",
          parents: [],
          manualParents: false,
          checkAllEntities: true,
        },
      });
    this.publish({
      mode: "add",
      details: undefined,
      created: undefined,
      creation: {
        phrase: draft.label,
        datasetEpoch: this.value.input.datasetEpoch,
        draft: { frames },
      },
    });
  }
  setMode(mode: TextAnalysisSessionState["mode"]) {
    if (mode === "add" && !this.value.creation) return;
    this.publish({ mode });
  }
  setView(view: TextAnalysisSessionState["view"]) {
    if (view !== this.value.view) this.publish({ view });
  }
  summary() {
    this.publish({ mode: "summary", creation: undefined });
  }
  added(
    iri: string,
    label: string,
    parents: string[],
    classes?: TextEntityCreated[],
  ) {
    this.publish({
      mode: "summary",
      details: undefined,
      creation: undefined,
      created: { iri, label, parents, classes },
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
  /** An action may use retained UI, but must consume analysis of this exact input. */
  whenReady(): Promise<TextAnalysisResult | undefined> {
    const input = this.value.input;
    return new Promise((resolve) => {
      let unsubscribe = () => {};
      const check = () => {
        if (
          !this.disposed &&
          this.value.input === input &&
          this.value.analysis.status === "pending"
        )
          return;
        unsubscribe();
        resolve(
          !this.disposed &&
            this.value.input === input &&
            this.value.analysis.status === "ready"
            ? this.value.analysis.result
            : undefined,
        );
      };
      unsubscribe = this.subscribe(check);
      check();
    });
  }
  dispose() {
    this.disposed = true;
    this.live.dispose();
    for (const listener of this.listeners) listener();
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
