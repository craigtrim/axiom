// craigtrim/axiom#208: failed I/O remains retryable; accepted revisions stay idle.
import { expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AutosaveCheckpoint,
  sessionJson,
  workspaceJson,
  type ChunkedCheckpoint,
} from "../../src/main/autosave-checkpoint";
import { SessionStore } from "../../src/main/session-store";
import { encodeJson } from "../../src/main/json-io";
import type { Preferences } from "../../src/shared/protocol";

it("retries a failed write of the same revision and skips it only after success", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "axiom-revisions-"));
  try {
    const store = new SessionStore(directory),
      checkpoint = new AutosaveCheckpoint();
    let serializations = 0,
      failures = 0;
    const tick = async (key: string) => {
      if (!checkpoint.needsSave(key)) return;
      serializations++;
      try {
        await store.saveChunks(encodeJson({ revision: key }));
        checkpoint.complete(key);
      } catch {
        failures++;
      }
    };
    await mkdir(store.file + ".tmp");
    await tick("a");
    expect([serializations, failures]).toEqual([1, 1]);
    expect(checkpoint.needsSave("a")).toBe(true);
    await rm(store.file + ".tmp", { recursive: true });
    for (let n = 0; n < 4; n++) await tick("a");
    expect([serializations, failures]).toEqual([2, 1]);
    for (let n = 0; n < 4; n++) await tick("b");
    expect([serializations, failures]).toEqual([3, 1]);
    expect(JSON.parse(await readFile(store.file, "utf8"))).toEqual({
      revision: "b",
    });
    expect(JSON.parse(await readFile(store.file + ".bak", "utf8"))).toEqual({
      revision: "a",
    });
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
  const encoded: ChunkedCheckpoint = {
    chunks: encodeJson(raw),
    draftsChunks: encodeJson(draft),
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
  const session = JSON.parse(
    sessionJson(encoded, prefs, "C:\\saved.axiom").join(""),
  );
  const workspace = JSON.parse(workspaceJson(encoded, prefs).join(""));
  expect(session.workspace).toEqual(raw);
  expect(session.editorDrafts).toEqual(draft);
  expect(session.workbench).toEqual(prefs);
  expect(workspace).toMatchObject({ ...raw, editorDrafts: draft });
  expect(workspace.workbench.keyboard).toBeUndefined();
  expect(workspace.workbench.panelState).toEqual({
    "textanalysis.text": "saved text",
  });
});

it("composes existing chunk boundaries without changing the workspace payload", () => {
  const encoded: ChunkedCheckpoint = {
    chunks: ['{"format":"axiom-', 'workspace","version":1,', '"tbox":[]}'],
    draftsChunks: ['{"version":1,', '"entities":[]}'],
    storeVersion: 4,
    workspaceRevision: 2,
    datasetEpoch: 1,
    sessionRevision: 3,
  };
  const preferences: Preferences = { version: 1, theme: "light" };
  const chunks = sessionJson(encoded, preferences);
  expect(chunks).toContain(encoded.chunks[0]);
  expect(chunks).toContain(encoded.chunks[1]);
  expect(JSON.parse(chunks.join("")).workspace).toEqual({
    format: "axiom-workspace",
    version: 1,
    tbox: [],
  });
  expect(
    JSON.parse(workspaceJson(encoded, preferences).join("")),
  ).toMatchObject({
    format: "axiom-workspace",
    version: 1,
    tbox: [],
    editorDrafts: { version: 1, entities: [] },
  });
});
