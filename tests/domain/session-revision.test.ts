// #123: exercise the actual worker protocol, including selection and settled motion.
// #217: only ontology versions trigger autosave, and checkpoints retain saved layouts.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { schoolBase, schoolOntology } from "../fixtures/large-ontology";
import type {
  DomainMethod,
  CheckpointSummary,
  SerializedCheckpoint,
} from "../../src/shared/protocol";
let directory: string,
  worker: Worker,
  nextId = 0;
let alpha = 0;
const pending = new Map<
  number,
  { resolve(value: any): void; reject(error: Error): void }
>();
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "axiom-session-worker-"));
  await build({
    entryPoints: ["src/main/domain-worker.ts"],
    outfile: path.join(directory, "domain-worker.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    logLevel: "silent",
  });
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
beforeEach(() => {
  alpha = 0;
  worker = new Worker(path.join(directory, "domain-worker.cjs"));
  worker.on("message", (packet) => {
    if (packet.event?.type === "positions") alpha = packet.event.data.alpha;
    const p = pending.get(packet.id);
    if (!p) return;
    pending.delete(packet.id);
    if (packet.error) p.reject(Error(packet.error));
    else p.resolve(packet.value);
  });
  worker.on("error", (error) => {
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  });
});
afterEach(async () => {
  await worker.terminate();
  pending.clear();
});
function request<T = any>(
  method: DomainMethod,
  args: Record<string, unknown> = {},
): Promise<T> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}
async function load() {
  await request("importRdf", {
    text: schoolOntology(4),
    fileName: "schools.ttl",
    baseIRI: schoolBase,
  });
  await request("layout", { mode: "grid" });
}
const checkpointWorkbench = { version: 1 as const, theme: "light" as const };
async function checkpointProfile() {
  const profile = await mkdtemp(path.join(directory, "profile-"));
  await request("configureDataService", {
    directory: profile,
    appPath: directory,
    resourcesPath: directory,
    packaged: false,
  });
  await load();
  await request("freeze");
  await request("seed", {
    iris: [schoolBase + "school1", schoolBase + "school2"],
    expand: false,
  });
  await request("select", { iri: schoolBase + "school1" });
  await request("drag", { iri: schoolBase + "school1", x: 120, y: 180 });
  return profile;
}
async function saveCheckpoint(profile: string, ontologyOnly = false) {
  const checkpoint = await request<CheckpointSummary>("checkpointPrepare", {
    ontologyOnly,
  });
  try {
    await request("checkpointSession", {
      id: checkpoint.id,
      workbench: checkpointWorkbench,
    });
    return JSON.parse(
      await readFile(path.join(profile, "last-session.json"), "utf8"),
    ).workspace;
  } finally {
    await request("checkpointRelease", { id: checkpoint.id });
  }
}
it("keeps the ontology version unchanged for views and advances it for edits, Undo and Redo", async () => {
  await load();
  await request("freeze");
  await request("seed", {
    iris: [schoolBase + "School", schoolBase + "school1"],
    expand: false,
  });
  const initial = await request("sessionState");
  for (const [method, args] of [
    ["select", { iri: schoolBase + "school1" }],
    ["drag", { iri: schoolBase + "school1", x: 310, y: 220 }],
    ["spacing", { value: 2 }],
  ] as [DomainMethod, Record<string, unknown>][]) {
    await request(method, args);
    const after = await request("sessionState");
    expect(after.storeVersion).toBe(initial.storeVersion);
    expect(after.datasetEpoch).toBe(initial.datasetEpoch);
  }
  let before = initial;
  for (const [method, args] of [
    ["rename", { iri: schoolBase + "School", name: "Renamed school" }],
    ["undo", {}],
    ["redo", {}],
  ] as [DomainMethod, Record<string, unknown>][]) {
    await request(method, args);
    const after = await request("sessionState");
    expect(after.storeVersion).toBeGreaterThan(before.storeVersion);
    expect(after.datasetEpoch).toBe(initial.datasetEpoch);
    before = after;
  }
});
it("autosaves newer ontology with the saved graph selection, positions and settings", async () => {
  const profile = await checkpointProfile();
  const baseline = await saveCheckpoint(profile);
  await request("select", { iri: schoolBase + "school2" });
  await request("drag", { iri: schoolBase + "school1", x: 567, y: 234 });
  await request("spacing", { value: 2.5 });
  await request("graphCreate", { iris: [schoolBase + "School"] });
  await request("rename", {
    iri: schoolBase + "school1",
    name: "Autosaved school",
  });
  const saved = await saveCheckpoint(profile, true);
  expect(
    saved.entities.find((entity: { iri: string }) =>
      entity.iri === schoolBase + "school1",
    ).label,
  ).toBe("Autosaved school");
  expect(saved.storeVersion).toBeGreaterThan(baseline.storeVersion);
  expect(saved.selected).toBe(baseline.selected);
  expect(saved.graph).toEqual(baseline.graph);
  expect(saved.graphs).toEqual(baseline.graphs);
  expect(saved.activeGraphId).toBe(baseline.activeGraphId);
  expect(saved.archivedGraphs).toEqual(baseline.archivedGraphs);
});
it("advances the saved layout after writing a checkpoint rather than preparing it", async () => {
  const profile = await checkpointProfile();
  const baseline = await saveCheckpoint(profile);
  await request("select", { iri: schoolBase + "school2" });
  await request("drag", { iri: schoolBase + "school1", x: 350, y: 260 });
  const next = await request("serialize");
  const pending = await request<CheckpointSummary>("checkpointPrepare");
  try {
    const beforeWrite = await saveCheckpoint(profile, true);
    expect(beforeWrite.selected).toBe(baseline.selected);
    expect(beforeWrite.graph).toEqual(baseline.graph);
    await request("checkpointSession", {
      id: pending.id,
      workbench: checkpointWorkbench,
    });
    await request("select", { iri: schoolBase + "School" });
    await request("drag", { iri: schoolBase + "school1", x: 700, y: 500 });
    const afterWrite = await saveCheckpoint(profile, true);
    expect(afterWrite.selected).toBe(next.selected);
    expect(afterWrite.graph).toEqual(next.graph);
    expect(afterWrite.graphs).toEqual(next.graphs);
  } finally {
    await request("checkpointRelease", { id: pending.id });
  }
});
it("retains the preceding layout when writing the next session fails", async () => {
  const profile = await checkpointProfile();
  const baseline = await saveCheckpoint(profile);
  await request("select", { iri: schoolBase + "school2" });
  await request("drag", { iri: schoolBase + "school1", x: 350, y: 260 });
  const pending = await request<CheckpointSummary>("checkpointPrepare");
  const blocked = path.join(profile, "last-session.json.tmp");
  await mkdir(blocked);
  try {
    await expect(
      request("checkpointSession", {
        id: pending.id,
        workbench: checkpointWorkbench,
      }),
    ).rejects.toThrow();
  } finally {
    await rm(blocked, { recursive: true, force: true });
    await request("checkpointRelease", { id: pending.id });
  }
  const saved = await saveCheckpoint(profile, true);
  expect(saved.selected).toBe(baseline.selected);
  expect(saved.graph).toEqual(baseline.graph);
  expect(saved.graphs).toEqual(baseline.graphs);
});
it("changes session revision for selection, graph state, Undo, Redo and workspace replacement", async () => {
  await load();
  const initial = await request("sessionState");
  expect(await request("sessionState")).toEqual(initial);
  await request("select", { iri: schoolBase + "school2" });
  const selected = await request("sessionState");
  expect(selected.sessionRevision).toBeGreaterThan(initial.sessionRevision);
  await request("select", { iri: schoolBase + "school2" });
  expect(await request("sessionState")).toEqual(selected);
  const encoded = await request<SerializedCheckpoint>("serializeJson");
  expect(JSON.parse(encoded.text)).toEqual(await request("serialize"));
  expect(JSON.parse(encoded.text).selected).toBe(schoolBase + "school2");
  await request("markSaved", {
    version: encoded.storeVersion,
    epoch: encoded.datasetEpoch,
    revision: encoded.workspaceRevision,
  });
  expect(await request("sessionState")).toEqual(selected);
  let before = selected;
  for (const [method, args] of [
    ["createClass", { name: "New school", parent: schoolBase + "School" }],
    ["undo", {}],
    ["redo", {}],
    ["spacing", { value: 2 }],
    ["graphCreate", { iris: [schoolBase + "School"] }],
    ["new", { blank: true }],
  ] as [DomainMethod, Record<string, unknown>][]) {
    await request(method, args);
    const after = await request("sessionState");
    expect(after.sessionRevision).toBeGreaterThan(before.sessionRevision);
    before = after;
  }
  expect(before.datasetEpoch).toBeGreaterThan(initial.datasetEpoch);
});
it("captures positions after force layout comes to rest without revising every tick", async () => {
  await load();
  await request("seed", {
    iris: [schoolBase + "School", schoolBase + "school1"],
    expand: false,
  });
  const { datasetEpoch } = await request("sessionState");
  await request("graphInteraction", {
    token: "settling-test",
    active: true,
    datasetEpoch,
  });
  await request("layout", { mode: "force" });
  await request("drag", {
    iri: schoolBase + "School",
    x: 310,
    y: 220,
    dragging: true,
  });
  await request("drag", {
    iri: schoolBase + "School",
    x: 310,
    y: 220,
    dragging: false,
  });
  const moving = await request("sessionState");
  expect(alpha).toBeGreaterThanOrEqual(0.004);
  await request("graphInteraction", {
    token: "settling-test",
    active: false,
    datasetEpoch,
  });
  await expect.poll(() => alpha, { timeout: 10000 }).toBeLessThan(0.004);
  const settled = await request("sessionState");
  expect(settled.sessionRevision).toBeGreaterThan(moving.sessionRevision);
  const first = await request<SerializedCheckpoint>("serializeJson");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(await request("sessionState")).toEqual(settled);
  expect(
    JSON.parse((await request<SerializedCheckpoint>("serializeJson")).text)
      .graph.positions,
  ).toEqual(JSON.parse(first.text).graph.positions);
});
