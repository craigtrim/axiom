// craigtrim/axiom#189: a dropped node stays where it lands while the force layout settles.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { schoolBase, schoolOntology } from "../fixtures/large-ontology";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";
let directory: string,
  worker: Worker,
  nextId = 0;
let alpha = 0;
const pending = new Map<
  number,
  { resolve(value: any): void; reject(error: Error): void }
>();
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "axiom-drop-hold-"));
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
const school = schoolBase + "school0";
async function forceGraph() {
  await request("importRdf", {
    text: schoolOntology(4),
    fileName: "schools.ttl",
    baseIRI: schoolBase,
  });
  await request("seed", {
    iris: [
      schoolBase + "School",
      ...[0, 1, 2, 3].map((i) => schoolBase + "school" + i),
    ],
    expand: false,
  });
  await request("layout", { mode: "force" });
  await settle();
}
const settle = () =>
  expect.poll(() => alpha, { timeout: 10000 }).toBeLessThan(0.004);
async function position(iri: string) {
  const n = (await request<Snapshot>("state")).graph.nodes.find(
    (n) => n.iri === iri,
  )!;
  return { x: n.x, y: n.y };
}
async function drop(iri: string, x: number, y: number) {
  await request("drag", { iri, x, y, dragging: true });
  await request("drag", { iri, x, y, dragging: false });
  expect(alpha).toBeGreaterThanOrEqual(0.004);
}

it("keeps a dropped node where it lands until a new layout releases it", async () => {
  await forceGraph();
  expect((await request<Snapshot>("state")).graph.edges.length).toBe(4);
  await drop(school, 900, -700);
  await settle();
  expect(await position(school)).toEqual({ x: 900, y: -700 });
  expect(
    (await request<Snapshot>("state")).graph.nodes.find((n) => n.iri === school)
      ?.pinned,
  ).toBe(false);
  await request("layout", { mode: "force" });
  await settle();
  expect(await position(school)).not.toEqual({ x: 900, y: -700 });
});

it("keeps earlier drops held when another node is dropped", async () => {
  await forceGraph();
  await drop(school, 900, -700);
  await drop(schoolBase + "school1", -900, 700);
  await settle();
  expect(await position(school)).toEqual({ x: 900, y: -700 });
  expect(await position(schoolBase + "school1")).toEqual({ x: -900, y: 700 });
});

it("puts a dropped node back with one Undo", async () => {
  await forceGraph();
  const before = await position(school);
  await drop(school, 900, -700);
  await settle();
  await request("undo");
  expect(await position(school)).toEqual(before);
});
