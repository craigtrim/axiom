// craigtrim/axiom#205: exercise real worker history, view persistence and settle events.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { buildEmptyStore, type Workspace } from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import { graphClusters } from "../../src/domain/graph-clusters";
import { mergeState } from "../../src/shared/state-update";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";

let directory: string,
  worker: Worker,
  serial = 0;
let current: Snapshot | undefined;
const states: Snapshot[] = [];
const listeners = new Set<() => void>();
const pending = new Map<
  number,
  { resolve(value: any): void; reject(error: Error): void }
>();
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "axiom-cluster-worker-"));
  await build({
    entryPoints: ["src/main/domain-worker.ts"],
    outfile: path.join(directory, "domain-worker.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    logLevel: "silent",
  });
}, 30000);
beforeEach(() => {
  current = undefined;
  states.length = 0;
  worker = new Worker(path.join(directory, "domain-worker.cjs"));
  worker.on("message", (packet) => {
    if (packet.event?.type === "state") {
      current = mergeState(current, packet.event.data);
      if (!current) return;
      states.push(current);
      for (const listener of listeners) listener();
    }
    const response = pending.get(packet.id);
    if (!response) return;
    pending.delete(packet.id);
    if (packet.error) response.reject(Error(packet.error));
    else response.resolve(packet.value);
  });
  worker.on("error", (error) => {
    for (const response of pending.values()) response.reject(error);
    pending.clear();
  });
});
afterEach(async () => {
  await worker.terminate();
  for (const response of pending.values())
    response.reject(Error("Fixture stopped."));
  pending.clear();
  listeners.clear();
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
function request<T = any>(
  method: DomainMethod,
  args: Record<string, unknown> = {},
) {
  return new Promise<T>((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}
function waitForState(predicate: (state: Snapshot) => boolean) {
  return new Promise<Snapshot>((resolve, reject) => {
    const check = () => {
      if (!current || !predicate(current)) return;
      clearTimeout(timer);
      listeners.delete(check);
      resolve(current);
    };
    const timer = setTimeout(() => {
      listeners.delete(check);
      reject(Error("The worker did not publish settled clusters."));
    }, 10000);
    listeners.add(check);
    check();
  });
}
function fixture() {
  const store = buildEmptyStore(),
    ids: string[] = [];
  for (let i = 0; i < 8; i++)
    ids.push(
      store.createClass(
        "Node " + i,
        i === 0 ? THING : i <= 4 ? ids[0] : ids[4],
      ),
    );
  const hidden = store.createClass("Hidden node", ids[0]);
  const graph: Workspace["graph"] = {
    iris: ids,
    focus: [],
    pins: [],
    budget: 1000,
    layout: "force",
    frozen: true,
    clusterColors: true,
    positions: ids.map((iri, i) => ({
      iri,
      x: (i < 4 ? 0 : 100) + (i % 2),
      y: Math.floor((i % 4) / 2),
    })),
  };
  const document: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: store.ontology,
    entities: [...store.entities.values()],
    tbox: store.tbox,
    individuals: [],
    customers: [],
    selected: null,
    graph,
    activeGraphId: "graph:one",
    graphs: {
      "graph:one": graph,
      "graph:two": { ...graph, clusterLooseness: 0.65 },
    },
  };
  return { document, hidden, ids };
}

it("groups previews into one Undo, preserves no-op history and ignores stale controls before activation", async () => {
  await request("load", { document: fixture().document });
  const initial = await request<Snapshot>("state"),
    epoch = initial.datasetEpoch;
  expect(initial.graph.clusterLooseness).toBe(1);
  expect(initial.graph.clusterCount).toBe(2);
  expect(initial.canUndo).toBe(false);
  const revision = await request("sessionState");
  await request("clusterLooseness", {
    value: 0.4,
    preview: true,
    datasetEpoch: epoch,
    graphId: "graph:one",
  });
  await request("clusterLooseness", {
    value: 0,
    preview: true,
    datasetEpoch: epoch,
    graphId: "graph:one",
  });
  expect((await request<Snapshot>("state")).canUndo).toBe(false);
  expect((await request("sessionState")).sessionRevision).toBeGreaterThan(
    revision.sessionRevision,
  );
  await request("clusterLooseness", {
    value: 0,
    preview: false,
    datasetEpoch: epoch,
    graphId: "graph:one",
  });
  const committed = await request<Snapshot>("state");
  expect(committed.undoLabel).toBe("Change clusters");
  expect(committed.graph.clusterCount).toBe(1);
  expect(committed.version).toBe(initial.version);
  expect(committed.dirty).toBe(true);
  await request("undo");
  expect((await request<Snapshot>("state")).graph.clusterLooseness).toBe(1);
  expect((await request<Snapshot>("state")).canUndo).toBe(false);
  await request("redo");
  expect((await request<Snapshot>("state")).graph.clusterLooseness).toBe(0);
  await request("undo");
  await request("clusterLooseness", {
    value: 0.5,
    preview: true,
    datasetEpoch: epoch,
  });
  await request("clusterLooseness", {
    value: 1,
    preview: false,
    datasetEpoch: epoch,
  });
  expect((await request<Snapshot>("state")).canUndo).toBe(false);
  await request("new");
  expect(
    await request("clusterLooseness", {
      value: 0,
      datasetEpoch: epoch,
      graphId: "removed-view",
    }),
  ).toBe(false);
  expect((await request<Snapshot>("state")).graph.clusterLooseness).toBe(1);
}, 30000);

it("serializes each view and archive, restores values, and rejects an invalid secondary view transactionally", async () => {
  await request("load", { document: fixture().document });
  const epoch = (await request<Snapshot>("state")).datasetEpoch;
  await request("clusterLooseness", {
    value: 0.3,
    graphId: "graph:two",
    datasetEpoch: epoch,
  });
  const saved = await request<Workspace>("serialize");
  expect(saved.graph.clusterLooseness).toBe(0.3);
  expect(saved.graphs!["graph:one"].clusterLooseness).toBe(1);
  expect(saved.graphs!["graph:two"].clusterLooseness).toBe(0.3);
  const invalid = structuredClone(saved);
  invalid.graphs!["graph:one"].clusterLooseness = 2;
  await expect(request("load", { document: invalid })).rejects.toThrow(
    "Invalid graph settings",
  );
  expect((await request<Snapshot>("state")).datasetEpoch).toBe(epoch);
  await request("graphArchive", {
    id: "graph:two",
    retain: true,
    datasetEpoch: epoch,
  });
  await request("graphRestore", { id: "graph:two", datasetEpoch: epoch });
  expect((await request<Snapshot>("state")).graph.clusterLooseness).toBe(0.3);
  await request("load", { document: saved });
  const reopened = await request<Snapshot>("state");
  expect(reopened.graphs!["graph:one"].clusterLooseness).toBe(1);
  expect(reopened.graphs!["graph:two"].clusterLooseness).toBe(0.3);
}, 30000);

it("keeps new nodes grey while force moves, then publishes settled membership and flushes on freeze", async () => {
  const sample = fixture();
  await request("load", { document: sample.document });
  const before = await request<Snapshot>("state");
  const colors = new Map(
    before.graph.nodes.map((node) => [node.iri, node.cluster]),
  );
  await request("freeze");
  states.length = 0;
  await request("expand", { iri: sample.ids[0] });
  const moving = states.find(
    (state) =>
      state.graph.clustersPending &&
      state.graph.nodes.some((node) => node.iri === sample.hidden),
  );
  expect(moving).toBeDefined();
  expect(moving!.message).toBe("Clusters update when the layout settles.");
  expect(
    moving!.graph.nodes.find((node) => node.iri === sample.hidden)!.cluster,
  ).toBeUndefined();
  for (const node of moving!.graph.nodes)
    if (colors.has(node.iri)) expect(node.cluster).toBe(colors.get(node.iri));
  const settled = await waitForState(
    (state) =>
      !state.graph.clustersPending &&
      state.graph.nodes.some((node) => node.iri === sample.hidden),
  );
  expect(settled.graph.clusterCount).toBe(
    graphClusters(settled.graph.nodes, settled.graph.edges, 1).length,
  );
  expect(settled.message).not.toBe("Clusters update when the layout settles.");
  const interaction = {
    token: "cluster-freeze",
    datasetEpoch: before.datasetEpoch,
  };
  await request("graphInteraction", { ...interaction, active: true });
  try {
    await request("layout", { mode: "force" });
    expect((await request<Snapshot>("state")).graph.clustersPending).toBe(true);
    await request("freeze");
    const frozen = await request<Snapshot>("state");
    expect(frozen.graph.frozen).toBe(true);
    expect(frozen.graph.clustersPending).toBe(false);
  } finally {
    await request("graphInteraction", { ...interaction, active: false });
  }
}, 30000);
