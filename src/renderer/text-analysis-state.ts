import { useEffect, useSyncExternalStore } from "react";
import {
  command,
  onCommand,
  preferences,
  request,
  report,
  savePanel,
  state,
  useSnapshot,
} from "./client";
import { textEntityConcepts } from "../shared/text-analysis";
import { TextAnalysisSession } from "./text-analysis-session";
import type { TextEntityClassDraft } from "./text-analysis-session";
import type { TextEntity, TextAnalysisResult } from "../shared/text-analysis";

export const textAnalysisSession = new TextAnalysisSession((input) =>
  window.axiom.textAnalysis.parse(input),
);
let initialized = false;
export function openClassDraft(draft: TextEntityClassDraft, parentLabel?: string) {
  if (!state) return;
  initialized = true;
  textAnalysisSession.update({ text: textAnalysisSession.getSnapshot().input.text, datasetEpoch: state.datasetEpoch, version: state.version });
  textAnalysisSession.openDraft(draft, parentLabel);
  command("view.textentities");
}
export function syncTextAnalysisContext() {
  if (state?.selected || state?.graph.selectedEdge)
    textAnalysisSession.clearDetails();
  if (initialized && state)
    textAnalysisSession.update({
      text: textAnalysisSession.getSnapshot().input.text,
      datasetEpoch: state.datasetEpoch,
      version: state.version,
    });
}
export function useTextAnalysis() {
  const snapshot = useSnapshot()!;
  const value = useSyncExternalStore(
    textAnalysisSession.subscribe,
    textAnalysisSession.getSnapshot,
  );
  useEffect(() => {
    if (!initialized) {
      initialized = true;
      if (state)
        textAnalysisSession.update({
          text: String(preferences.panelState?.["textanalysis.text"] ?? ""),
          datasetEpoch: state.datasetEpoch,
          version: state.version,
        });
    }
    syncTextAnalysisContext();
  }, [snapshot.datasetEpoch, snapshot.version]);
  const current =
    value.input.datasetEpoch === snapshot.datasetEpoch &&
    value.input.version === snapshot.version;
  const result =
    current && value.analysis.status === "ready"
      ? value.analysis.result
      : undefined;
  return { ...value, result, snapshot };
}
export function updateAnalysisText(text: string) {
  if (!state) return;
  textAnalysisSession.update({
    text,
    datasetEpoch: state.datasetEpoch,
    version: state.version,
  });
  savePanel("textanalysis.text", text, false);
}
interface TextEditorBridge {
  focus(): void;
  select(entity: TextEntity): void;
}
let editor: TextEditorBridge | undefined;
let reveal: { entity: TextEntity; result: TextAnalysisResult } | undefined;
export function attachTextEditor(bridge: TextEditorBridge) {
  editor = bridge;
  if (reveal && textAnalysisSession.getSnapshot().analysis.status === "ready") {
    const current = textAnalysisSession.getSnapshot().analysis;
    if (current.status === "ready" && current.result === reveal.result)
      bridge.select(reveal.entity);
    reveal = undefined;
  }
  return () => {
    if (editor === bridge) editor = undefined;
  };
}
function currentMatch(entity: TextEntity) {
  const analysis = textAnalysisSession.getSnapshot().analysis;
  return analysis.status === "ready" &&
    analysis.result.entities.includes(entity) &&
    analysis.result.datasetEpoch === state?.datasetEpoch &&
    analysis.result.version === state.version
    ? analysis.result
    : undefined;
}
let inspectionTicket = 0;
export async function inspectTextEntity(entity: TextEntity, iri?: string) {
  const result = currentMatch(entity);
  if (!result) return;
  const concepts = textEntityConcepts(result, entity);
  if (iri && !concepts.some((concept) => concept.iri === iri)) return;
  const target = iri ?? (concepts.length === 1 ? concepts[0].iri : null);
  const ticket = ++inspectionTicket;
  textAnalysisSession.clearDetails();
  try {
    await request("select", {
      iri: target,
      datasetEpoch: result.datasetEpoch,
      version: result.version,
    });
    if (
      ticket !== inspectionTicket ||
      currentMatch(entity) !== result ||
      state?.selected !== target ||
      state.graph.selectedEdge
    )
      return;
    if (target) command("view.details");
    else if (textAnalysisSession.showDetails(entity))
      command("textanalysis.inspect");
  } catch (error) {
    if (ticket === inspectionTicket)
      report(error instanceof Error ? error.message : String(error), true);
  }
}
export function selectTextEntity(entity: TextEntity) {
  const result = currentMatch(entity);
  if (!result) return;
  if (editor) {
    command("textanalysis.reveal");
    editor.select(entity);
  } else {
    reveal = { entity, result };
    command("textanalysis.reveal");
  }
  void inspectTextEntity(entity);
}
export function useTextInspection() {
  return useSyncExternalStore(
    textAnalysisSession.subscribe,
    () => textAnalysisSession.getSnapshot().details,
  );
}
export function focusAnalysisText() {
  editor?.focus();
}
onCommand((id) => {
  if (id === "entity.edit") {
    ++inspectionTicket;
    textAnalysisSession.clearDetails();
  }
  if (id === "selection.changed") textAnalysisSession.clearDetails();
  if (id !== "textanalysis.reset") return;
  ++inspectionTicket;
  reveal = undefined;
  if (initialized && state)
    textAnalysisSession.reset({
      text: String(preferences.panelState?.["textanalysis.text"] ?? ""),
      datasetEpoch: state.datasetEpoch,
      version: state.version,
    });
});
