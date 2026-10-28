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
import {
  TextAnalysisSession,
  hasUnanalyzedText,
} from "./text-analysis-session";
import { analysisResult } from "./live-analysis";
import type { TextEntityClassDraft } from "./text-analysis-session";
import type { TextEntity, TextAnalysisResult } from "../shared/text-analysis";
import {
  readSavedAddEntity,
  type SavedAddEntity,
  type AddEntityNode,
} from "../shared/add-entity";
import { selectedEntityName } from "../shared/selected-entity-name";

export const textAnalysisSession = new TextAnalysisSession((input) =>
  window.axiom.textAnalysis.parse(input),
);
let initialized = false;
let textSaveTimer: ReturnType<typeof setTimeout> | undefined;
// craigtrim/axiom#73: read manual text after a pause or before a workspace capture.
export function flushAnalysisText() {
  clearTimeout(textSaveTimer);
  if (!initialized) return;
  const text = textAnalysisSession.flushText();
  if (preferences.panelState?.["textanalysis.text"] !== text)
    savePanel("textanalysis.text", text, false);
}
export function editAnalysisText(readText: () => string) {
  textAnalysisSession.edit(readText);
  clearTimeout(textSaveTimer);
  textSaveTimer = setTimeout(flushAnalysisText, 250);
}
export function analyzeTextNow() {
  void waitForCurrentTextAnalysis();
}
function initialize() {
  if (initialized || !state) return;
  initialized = true;
  textAnalysisSession.setLiveAnalysis(
    preferences.panelState?.["textanalysis.live"] !== false,
  );
  textAnalysisSession.setView(
    preferences.panelState?.["textanalysis.view"] === "summary"
      ? "summary"
      : "text",
  );
  textAnalysisSession.update({
    text: String(preferences.panelState?.["textanalysis.text"] ?? ""),
    datasetEpoch: state.datasetEpoch,
    version: state.version,
  });
}
export function ensureEntityDraft() {
  if (!state) return;
  initialize();
  textAnalysisSession.update({
    text: textAnalysisSession.getSnapshot().input.text,
    datasetEpoch: state.datasetEpoch,
    version: state.version,
  });
  if (!textAnalysisSession.getSnapshot().creation)
    textAnalysisSession.openDraft({
      label: "",
      comment: "",
      parents: [],
      manualParents: false,
    });
}
export function setTextAnalysisView(view: "text" | "summary") {
  flushAnalysisText();
  textAnalysisSession.setView(view);
  savePanel("textanalysis.view", view, false);
}
// craigtrim/axiom#73: preserve the typing mode beside the text and presentation.
export function setLiveTextAnalysis(enabled: boolean) {
  flushAnalysisText();
  textAnalysisSession.setLiveAnalysis(enabled);
  savePanel("textanalysis.live", enabled, false);
}
export function openClassDraft(
  draft: TextEntityClassDraft,
  parentLabel?: string,
) {
  if (!state) return;
  initialize();
  textAnalysisSession.update({
    text: textAnalysisSession.getSnapshot().input.text,
    datasetEpoch: state.datasetEpoch,
    version: state.version,
  });
  textAnalysisSession.openDraft(draft, parentLabel);
  command("view.textentities");
}
// craigtrim/axiom#93: Find and saved workspaces open the same persistent form.
export function openAddEntityFromFind(
  phrase: string,
  kind: "class" | "individual" = "class",
  parents: string[] = [],
) {
  ensureEntityDraft();
  textAnalysisSession.restoreCreation(phrase, {
    kind,
    origin: "find",
    phrase,
    frames: [
      {
        value: {
          label: selectedEntityName(phrase),
          comment: "",
          parents: parents.map((iri) => ({ iri })),
          manualParents: !!parents.length,
        },
      },
    ],
  });
  command("view.textentities");
}
export function captureAddEntityDraft(): SavedAddEntity | undefined {
  const creation = textAnalysisSession.getSnapshot().creation;
  if (!creation || creation.datasetEpoch !== state?.datasetEpoch) return;
  const draft = creation.draft;
  return readSavedAddEntity({
    phrase: draft?.phrase ?? creation.phrase,
    origin: draft?.origin ?? (creation.phrase ? "selection" : "blank"),
    kind: draft?.kind ?? "class",
    root: draft?.frames[0].value ?? {
      label: selectedEntityName(creation.phrase),
      comment: "",
      parents: [],
      manualParents: false,
    },
    created: draft?.created,
    // #177: keep the rename/create choice through workspace saves and remounts.
    createdRootIris: draft?.createdRootIris,
    error: draft?.error,
  });
}
export function restoreAddEntityDraft(value: SavedAddEntity) {
  initialize();
  const saved = readSavedAddEntity(value);
  const node = (n: AddEntityNode): TextEntityClassDraft => ({
    ...n,
    manualParents: n.manualParents ?? true,
    parents: n.parents.map((p) =>
      "iri" in p ? p : { create: node(p.create) },
    ),
  });
  textAnalysisSession.restoreCreation(saved.phrase, {
    kind: saved.kind,
    origin: saved.origin,
    phrase: saved.phrase,
    created: saved.created,
    createdRootIris: saved.createdRootIris,
    error: saved.error,
    frames: [{ value: node(saved.root) }],
  });
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
    initialize();
    syncTextAnalysisContext();
  }, [snapshot.datasetEpoch, snapshot.version]);
  const retained = analysisResult(value.analysis);
  // The snapshot can render before the effect updates the session. Only a new
  // dataset withdraws the display; navigation still requires the current version.
  const result =
    retained?.datasetEpoch === snapshot.datasetEpoch ? retained : undefined;
  return { ...value, result, snapshot };
}
let waitingActions = 0;
// craigtrim/axiom#79: explicit actions refresh stale text even with Auto off.
export async function waitForCurrentTextAnalysis(tail?: string) {
  if (!state) return undefined;
  flushAnalysisText();
  textAnalysisSession.update({
    text: textAnalysisSession.getSnapshot().input.text,
    datasetEpoch: state.datasetEpoch,
    version: state.version,
  });
  const stale = hasUnanalyzedText(textAnalysisSession.getSnapshot());
  if (!stale) return textAnalysisSession.whenReady();
  ++waitingActions;
  textAnalysisSession.setWaiting(true, tail);
  textAnalysisSession.analyzeNow();
  try {
    return await textAnalysisSession.whenReady();
  } finally {
    textAnalysisSession.setWaiting(--waitingActions > 0);
  }
}
interface TextEditorBridge {
  focus(): void;
  select(entity: TextEntity): boolean;
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
  const result = analysisResult(textAnalysisSession.getSnapshot().analysis);
  return result?.entities.includes(entity) &&
    !hasUnanalyzedText(textAnalysisSession.getSnapshot()) &&
    result.datasetEpoch === state?.datasetEpoch &&
    result.version === state.version
    ? result
    : undefined;
}
let inspectionTicket = 0;
export function inspectTextEntity(entity: TextEntity, iri?: string) {
  return activateTextEntity(entity, false, iri);
}
export function selectTextEntity(entity: TextEntity) {
  return activateTextEntity(entity, true);
}
async function activateTextEntity(
  entity: TextEntity,
  selectText: boolean,
  iri?: string,
) {
  let result = analysisResult(textAnalysisSession.getSnapshot().analysis);
  if (
    !result?.entities.includes(entity) ||
    result.datasetEpoch !== state?.datasetEpoch
  )
    return;
  const ticket = ++inspectionTicket;
  if (
    result.version !== state.version ||
    hasUnanalyzedText(textAnalysisSession.getSnapshot())
  ) {
    // Synchronize before waiting, including a click before the view's effect ran.
    const fresh = await waitForCurrentTextAnalysis(
      `Details opens only if ${entity.label} still matches.`,
    );
    if (!fresh || ticket !== inspectionTicket) return;
    const match = fresh.entities.find((item) => item.key === entity.key);
    if (!match || currentMatch(match) !== fresh) return;
    entity = match;
    result = fresh;
  }
  const concepts = textEntityConcepts(result, entity);
  if (iri && !concepts.some((concept) => concept.iri === iri)) return;
  const target = iri ?? (concepts.length === 1 ? concepts[0].iri : null);
  if (selectText) {
    if (editor) {
      command("textanalysis.reveal");
      if (!editor.select(entity)) return;
    } else {
      reveal = { entity, result };
      command("textanalysis.reveal");
    }
  }
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
  if (id === "workspace.capture" || id === "tabs.capture") flushAnalysisText();
  if (id === "textanalysis.reveal") setTextAnalysisView("text");
  if (id === "entity.edit") {
    ++inspectionTicket;
    textAnalysisSession.clearDetails();
  }
  if (id === "selection.changed") textAnalysisSession.clearDetails();
  if (id !== "textanalysis.reset") return;
  clearTimeout(textSaveTimer);
  ++inspectionTicket;
  reveal = undefined;
  textAnalysisSession.setView(
    preferences.panelState?.["textanalysis.view"] === "summary"
      ? "summary"
      : "text",
  );
  if (initialized && state)
    textAnalysisSession.reset(
      {
        text: String(preferences.panelState?.["textanalysis.text"] ?? ""),
        datasetEpoch: state.datasetEpoch,
        version: state.version,
      },
      preferences.panelState?.["textanalysis.live"] !== false,
    );
});
