// #123: failed size checks retry only after a content revision changes.
export class AutosaveCheckpoint {
  private saved?: string;
  private oversized?: string;
  needsSave(key: string) {
    return key !== this.saved && key !== this.oversized;
  }
  complete(key: string) {
    this.saved = key;
    this.oversized = undefined;
  }
  rejectSize(key: string) {
    this.oversized = key;
  }
}

import type { Preferences, SerializedCheckpoint } from "../shared/protocol";
export function sessionJson(
  document: SerializedCheckpoint,
  workbench: Preferences,
  workspacePath?: string,
  recoveryPath?: string,
) {
  const metadata = JSON.stringify({
    format: "axiom-session",
    version: 1,
    workspacePath,
    recoveryPath,
    workbench,
  });
  return (
    metadata.slice(0, -1) +
    ',"workspace":' +
    document.text +
    (document.draftsText ? ',"editorDrafts":' + document.draftsText : "") +
    "}"
  );
}
export function workspaceJson(
  document: SerializedCheckpoint,
  preferences: Preferences,
) {
  const workbench = {
    ...preferences,
    keyboard: undefined,
    panelState: {
      ...preferences.panelState,
      "warnings.seeAlso": undefined,
      "find.extendActions": undefined,
    },
  };
  return (
    document.text.slice(0, -1) +
    ',"workbench":' +
    JSON.stringify(workbench) +
    (document.draftsText ? ',"editorDrafts":' + document.draftsText : "") +
    "}"
  );
}
