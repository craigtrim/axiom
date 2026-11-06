// craigtrim/axiom#207: persistence returns metadata while backup recovery stays intact.
// craigtrim/axiom#208: captured chunks preserve tokens, validation and file compatibility.
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CheckpointStore } from "../../src/main/checkpoint-store";
import {
  buildEmptyStore,
  readWorkspace,
  type Workspace,
} from "../../src/domain/workspace";
import type { ChunkedCheckpoint } from "../../src/main/autosave-checkpoint";
import { encodeJson, readJsonFile } from "../../src/main/json-io";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "axiom-checkpoint-"));
  directories.push(directory);
  return { directory, store: new CheckpointStore(directory) };
}
function document(name: string): ChunkedCheckpoint {
  const store = buildEmptyStore();
  store.ontology.name = name;
  const workspace: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: store.ontology,
    entities: [...store.entities.values()],
    tbox: store.tbox,
    individuals: [],
    customers: [],
    selected: null,
    graph: { iris: [], focus: [], pins: [], budget: 1000, layout: "auto" },
  };
  return {
    chunks: encodeJson(workspace),
    storeVersion: store.version,
    workspaceRevision: 0,
    datasetEpoch: 1,
    sessionRevision: 1,
  };
}
const workbench = { version: 1 as const, theme: "dark" as const };

it("recovers the preceding valid session and keeps it as backup on the next save", async () => {
  const { directory, store } = await fixture();
  await store.saveSession(store.register(document("First")).id, workbench);
  await store.saveSession(store.register(document("Second")).id, workbench);
  const file = path.join(directory, "last-session.json");
  const invalid = JSON.parse(await readFile(file, "utf8"));
  invalid.workspace.entities = [];
  await writeFile(file, JSON.stringify(invalid));
  const reopened = new CheckpointStore(directory);
  const loaded: string[] = [];
  const result = await reopened.restore(async (saved) => {
    readWorkspace(saved);
    loaded.push(saved.ontology!.name);
  });
  expect(loaded).toEqual(["First"]);
  expect(result.recovered).toBe(true);
  expect(result.errors).toHaveLength(1);
  expect(result.session?.workbench.theme).toBe("dark");
  expect(result.session).not.toHaveProperty("workspace");
  const summary = reopened.register(document("Recovered"));
  expect(summary).not.toHaveProperty("text");
  expect(summary).not.toHaveProperty("chunks");
  await reopened.saveSession(summary.id, workbench);
  expect(
    JSON.parse(await readFile(file + ".bak", "utf8")).workspace.ontology.name,
  ).toBe("First");
});

it("does not revive a backup when the current session names a missing workspace", async () => {
  const { directory, store } = await fixture();
  await store.saveSession(store.register(document("Older")).id, workbench);
  const missing = path.join(directory, "removed.axiom");
  await store.saveSession(
    store.register(document("Missing")).id,
    workbench,
    missing,
  );
  const applied: string[] = [];
  const result = await new CheckpointStore(directory).restore(async (saved) => {
    applied.push(saved.ontology!.name);
  });
  expect(applied).toEqual([]);
  expect(result).toEqual({
    session: undefined,
    recovered: false,
    errors: [],
    missingWorkspacePath: missing,
  });
});

it("rejects invalid workbench settings before replacing the active domain workspace", async () => {
  const { directory, store } = await fixture();
  const file = path.join(directory, "invalid.axiom");
  await writeFile(
    file,
    JSON.stringify({
      ...JSON.parse(document("Invalid").chunks.join("")),
      workbench: { panelState: { "graph.stylesheet": "not valid graph CSS" } },
    }),
  );
  let applied = false;
  await expect(
    store.openWorkspace(file, async () => {
      applied = true;
    }),
  ).rejects.toThrow();
  expect(applied).toBe(false);
});

it("rejects invalid drafts before replacing the active domain workspace", async () => {
  const { directory, store } = await fixture();
  const file = path.join(directory, "invalid-drafts.axiom");
  await writeFile(
    file,
    JSON.stringify({
      ...JSON.parse(document("Invalid drafts").chunks.join("")),
      editorDrafts: { version: 99, entities: [] },
    }),
  );
  let applied = false;
  await expect(
    store.openWorkspace(file, async () => {
      applied = true;
    }),
  ).rejects.toThrow();
  expect(applied).toBe(false);
});

it("pins a registered snapshot and its revisions until its token is released", async () => {
  const { directory, store } = await fixture();
  const captured = document("Captured"),
    chunks = [...captured.chunks];
  const summary = store.register({ ...captured, chunks });
  chunks.splice(0, chunks.length, ...document("Changed later").chunks);
  captured.workspaceRevision++;
  const file = path.join(directory, "captured.axiom");
  await store.writeWorkspace(summary.id, file, workbench, {
    allowCreate: true,
  });
  await store.saveSession(summary.id, workbench);
  const saved = (await readJsonFile(file)) as Workspace;
  expect(saved.ontology?.name).toBe("Captured");
  expect(summary).toMatchObject({
    storeVersion: captured.storeVersion,
    workspaceRevision: 0,
    datasetEpoch: 1,
    sessionRevision: 1,
  });
  expect(summary).not.toHaveProperty("chunks");
  expect(summary).not.toHaveProperty("draftsChunks");
  store.release(summary.id);
  expect(() => store.saveSession(summary.id, workbench)).toThrow(
    /no longer available/,
  );
});

it("opens legacy JSON and validates complete syntax before applying a workspace", async () => {
  const { directory, store } = await fixture();
  const file = path.join(directory, "legacy.axiom");
  const legacy = {
    ...JSON.parse(document("Legacy").chunks.join("")),
    workbench,
  };
  const text = JSON.stringify(legacy, null, 2);
  await writeFile(file, text);
  const applied: string[] = [];
  const result = await store.openWorkspace(file, async (saved) => {
    readWorkspace(saved);
    applied.push(saved.ontology!.name);
  });
  expect(applied).toEqual(["Legacy"]);
  expect(result.workbench.theme).toBe("dark");
  await writeFile(file, text + ' {"trailing":true}');
  await expect(
    store.openWorkspace(file, async () => {
      applied.push("Invalid");
    }),
  ).rejects.toThrow();
  expect(applied).toEqual(["Legacy"]);
});
