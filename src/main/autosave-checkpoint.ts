// craigtrim/axiom#208: checkpoints retain bounded JSON chunks without a size quota.
import type { Preferences, SerializedCheckpoint } from "../shared/protocol";
import { encodeJson, type JsonChunks } from "./json-io";

export class AutosaveCheckpoint {
  private saved?: string;
  needsSave(key: string) {
    return key !== this.saved;
  }
  complete(key: string) {
    this.saved = key;
  }
}

export interface ChunkedCheckpoint extends Omit<
  SerializedCheckpoint,
  "text" | "draftsText"
> {
  chunks: JsonChunks;
  draftsChunks?: JsonChunks;
}

function objectPrefix(chunks: JsonChunks): string[] {
  const prefix = [...chunks];
  while (prefix.length && !prefix[prefix.length - 1]) prefix.pop();
  const last = prefix.length - 1;
  if (last < 0 || !prefix[last].endsWith("}"))
    throw Error("Invalid workspace checkpoint JSON.");
  prefix[last] = prefix[last].slice(0, -1);
  return prefix;
}

export function sessionJson(
  document: ChunkedCheckpoint,
  workbench: Preferences,
  workspacePath?: string,
  recoveryPath?: string,
): JsonChunks {
  const metadata = encodeJson({
    format: "axiom-session",
    version: 1,
    workspacePath,
    recoveryPath,
    workbench,
  });
  return Object.freeze([
    ...objectPrefix(metadata),
    ',"workspace":',
    ...document.chunks,
    ...(document.draftsChunks
      ? [',"editorDrafts":', ...document.draftsChunks]
      : []),
    "}",
  ]);
}
export function workspaceJson(
  document: ChunkedCheckpoint,
  preferences: Preferences,
): JsonChunks {
  const workbench = {
    ...preferences,
    keyboard: undefined,
    panelState: {
      ...preferences.panelState,
      "warnings.seeAlso": undefined,
      "find.extendActions": undefined,
    },
  };
  return Object.freeze([
    ...objectPrefix(document.chunks),
    ',"workbench":',
    ...encodeJson(workbench),
    ...(document.draftsChunks
      ? [',"editorDrafts":', ...document.draftsChunks]
      : []),
    "}",
  ]);
}
