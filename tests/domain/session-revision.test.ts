// #123: exercise the actual worker protocol, including selection and settled motion.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { schoolBase, schoolOntology } from "../fixtures/large-ontology";
import type {
  DomainMethod,
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
