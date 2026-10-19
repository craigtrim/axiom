// #123: unchanged or oversized revisions do not serialize or write again.
import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AutosaveCheckpoint,
  sessionJson,
  workspaceJson,
} from "../../src/main/autosave-checkpoint";
import { SessionStore, SessionSizeError } from "../../src/main/session-store";
import type {
  Preferences,
  SerializedCheckpoint,
} from "../../src/shared/protocol";

it("reports one oversized failure per revision and leaves other revisions retryable", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "axiom-revisions-"));
  try {
    const store = new SessionStore(directory, 30),
      checkpoint = new AutosaveCheckpoint();
    let serializations = 0,
      failures = 0;
    const tick = async (key: string, text: string) => {
      if (!checkpoint.needsSave(key)) return;
      serializations++;
      try {
        await store.saveJson(text);
        checkpoint.complete(key);
      } catch (error) {
        if (error instanceof SessionSizeError) checkpoint.rejectSize(key);
        failures++;
      }
    };
    for (let n = 0; n < 4; n++) await tick("a", "x".repeat(31));
    expect([serializations, failures]).toEqual([1, 1]);
    for (let n = 0; n < 4; n++) await tick("b", "x".repeat(31));
    expect([serializations, failures]).toEqual([2, 2]);
    await tick("c", "{}");
    for (let n = 0; n < 4; n++) await tick("c", "{}");
    expect([serializations, failures]).toEqual([3, 2]);
    expect(await readFile(store.file, "utf8")).toBe("{}");
    expect(checkpoint.needsSave("new")).toBe(true);
    expect(checkpoint.needsSave("new")).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("reuses the encoded ontology in both formats while retaining drafts and personal preference boundaries", () => {
  const raw = {
    format: "axiom-workspace",
    version: 1,
    selected: "urn:school:42",
    tbox: [{ value: 'quoted " \n \uD83D\uDE00' }],
  };
  const draft = {
    version: 1,
    storeVersion: 4,
    entities: [],
    entitySources: [],
  };
  const encoded: SerializedCheckpoint = {
    text: JSON.stringify(raw),
    draftsText: JSON.stringify(draft),
    storeVersion: 4,
    workspaceRevision: 2,
    datasetEpoch: 1,
    sessionRevision: 3,
  };
  const prefs: Preferences = {
    version: 1,
    theme: "light",
    keyboard: { version: 1 } as any,
    panelState: {
      "warnings.seeAlso": false,
      "find.extendActions": { classes: "synonym" },
      "textanalysis.text": "saved text",
    },
  };
  const session = JSON.parse(sessionJson(encoded, prefs, "C:\\saved.axiom"));
  const workspace = JSON.parse(workspaceJson(encoded, prefs));
  expect(session.workspace).toEqual(raw);
  expect(session.editorDrafts).toEqual(draft);
  expect(session.workbench).toEqual(prefs);
  expect(workspace).toMatchObject({ ...raw, editorDrafts: draft });
  expect(workspace.workbench.keyboard).toBeUndefined();
  expect(workspace.workbench.panelState).toEqual({
    "textanalysis.text": "saved text",
  });
});
