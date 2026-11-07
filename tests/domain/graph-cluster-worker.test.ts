// craigtrim/axiom#205: exercise real worker history, view persistence and settle events.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { buildEmptyStore, type Workspace } from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import { graphClusters } from "../../src/domain/graph-clusters";
import { mergeState } from "../../src/shared/state-update";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";

let directory: string,
  layoutControl: string,
  worker: Worker,
  serial = 0;
let workerTermination: Promise<number> | undefined;
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
  // Release a real external-layout worker explicitly, independently of how
  // quickly CI delivers the slider requests or schedules layout work.
  await writeFile(
    path.join(directory, "layout-worker.cjs"),
    String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");
const control = process.env.AXIOM_CLUSTER_LAYOUT_CONTROL;
let released = false;
const release = () => {
  if (released || !fs.existsSync(path.join(control, "release"))) return;
  released = true;
  watcher.close();
  parentPort.postMessage({ positions: workerData.nodes.map((node, i) => ({
    iri: node.iri, x: 600 + i * 23, y: -200 + i * 11,
  })) });
};
const watcher = fs.watch(control, release);
fs.writeFileSync(path.join(control, "started"), workerData.mode);
release();
`,
  );
}, 30000);
beforeEach(async () => {
  workerTermination = undefined;
  current = undefined;
  states.length = 0;
  layoutControl = await mkdtemp(path.join(directory, "layout-control-"));
  worker = new Worker(path.join(directory, "domain-worker.cjs"), {
    env: { ...process.env, AXIOM_CLUSTER_LAYOUT_CONTROL: layoutControl },
  });
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
  await stopWorker();
  for (const response of pending.values())
    response.reject(Error("Fixture stopped."));
  pending.clear();
  listeners.clear();
});
function stopWorker() {
  return (workerTermination ??= worker.terminate());
}
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

const positions = (state: Snapshot) =>
  Object.fromEntries(state.graph.nodes.map((n) => [n.iri, [n.x, n.y]]));
const serialized = () =>
  request<Workspace & { workspaceRevision: number }>("serialize");
async function startControlledLayout() {
  const sample = fixture();
  await request("load", { document: sample.document });
  const initial = await request<Snapshot>("state"),
    before = await serialized();
  await request("layout", { mode: "elk-stress" });
  await expect
    .poll(
      () =>
        readFile(path.join(layoutControl, "started"), "utf8").catch(() => ""),
      { timeout: 10000 },
    )
    .toBe("elk-stress");
  const pending = await request<Snapshot>("state");
  expect(pending.graph.layoutPending).toBe(true);
  expect(pending.graph.choice).toBe("elk-stress");
  const layout = await serialized(),
    expected = Object.fromEntries(
      sample.ids.map((iri, i) => [iri, [600 + i * 23, -200 + i * 11]]),
    );
  return { sample, initial, before, layout, expected };
}
async function releaseControlledLayout(expected: Record<string, number[]>) {
  await writeFile(path.join(layoutControl, "release"), "release");
  const settled = await waitForState(
    (state) =>
      !state.graph.layoutPending &&
      state.graph.choice === "elk-stress" &&
      state.graph.nodes.every(
        (n) => n.x === expected[n.iri][0] && n.y === expected[n.iri][1],
      ),
  );
  expect(positions(settled)).toEqual(expected);
  return settled;
}
async function withControlledLayout(
  run: (
    layout: Awaited<ReturnType<typeof startControlledLayout>>,
  ) => Promise<void>,
) {
  try {
    await run(await startControlledLayout());
  } finally {
    // Even a failed setup/assertion releases its own watcher, then the one
    // owned parent worker terminates all nested workers before the next test.
    await writeFile(path.join(layoutControl, "release"), "release").catch(
      () => {},
    );
    await stopWorker();
  }
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
  expect(
    await request("clusterLooseness", {
      value: 0,
      preview: false,
      graphId: "graph:two",
      datasetEpoch: epoch,
    }),
  ).toBe(false);
  await request("graphRestore", { id: "graph:two", datasetEpoch: epoch });
  expect((await request<Snapshot>("state")).graph.clusterLooseness).toBe(0.3);
  await request("load", { document: saved });
  const reopened = await request<Snapshot>("state");
  expect(reopened.graphs!["graph:one"].clusterLooseness).toBe(1);
  expect(reopened.graphs!["graph:two"].clusterLooseness).toBe(0.3);
}, 30000);

it("undoes only Clusters after force progresses and another edit occurs during its gesture", async () => {
  const sample = fixture();
  await request("load", { document: sample.document });
  const initial = await request<Snapshot>("state"),
    interaction = {
      token: "cluster-history-force",
      datasetEpoch: initial.datasetEpoch,
    };
  await request("graphInteraction", { ...interaction, active: true });
  await request("freeze");
  await request("layout", { mode: "force" });
  const paused = await request<Snapshot>("state");
  expect(paused.graph.clustersPending).toBe(true);
  await request("clusterLooseness", {
    value: 0.4,
    preview: true,
    datasetEpoch: initial.datasetEpoch,
    graphId: "graph:one",
  });
  await request("select", { iri: sample.ids[5] });
  // An independent tracked edit advances the document after the first preview.
  await request("countVisibility", { visible: false });
  await request("graphInteraction", { ...interaction, active: false });
  const settled = await waitForState(
    (state) =>
      !state.graph.clustersPending &&
      !state.graph.frozen &&
      state.selected === sample.ids[5],
  );
  expect(positions(settled)).not.toEqual(positions(paused));
  const beforeCommit = await serialized();
  await request("clusterLooseness", {
    value: 0.4,
    preview: false,
    datasetEpoch: initial.datasetEpoch,
    graphId: "graph:one",
  });
  const committed = await request<Snapshot>("state"),
    afterCommit = await serialized();
  expect(committed.undoLabel).toBe("Change clusters");
  expect(afterCommit.workspaceRevision).toBeGreaterThan(
    beforeCommit.workspaceRevision,
  );
  const expectPreserved = (state: Snapshot) => {
    expect(positions(state)).toEqual(positions(settled));
    expect(state.selected).toBe(sample.ids[5]);
    expect(state.graph.selected).toBe(sample.ids[5]);
    expect(state.graph.frozen).toBe(false);
    expect(state.graph.choice).toBe("force");
    expect(state.graph.countsVisible).toBe(false);
    expect(state.graphs!["graph:two"].clusterLooseness).toBe(0.65);
    expect(state.version).toBe(initial.version);
  };
  expectPreserved(committed);
  await request("undo");
  const undone = await request<Snapshot>("state");
  expect(undone.graph.clusterLooseness).toBe(1);
  expectPreserved(undone);
  expect((await serialized()).workspaceRevision).toBe(
    beforeCommit.workspaceRevision,
  );
  await request("redo");
  const redone = await request<Snapshot>("state");
  expect(redone.graph.clusterLooseness).toBe(0.4);
  expectPreserved(redone);
  expect((await serialized()).workspaceRevision).toBe(
    afterCommit.workspaceRevision,
  );
}, 30000);

it("keeps an owned external layout running when Clusters is committed and undone before completion", async () => {
  await withControlledLayout(async ({ sample, initial, layout, expected }) => {
    await request("clusterLooseness", {
      value: 0.4,
      preview: true,
      datasetEpoch: initial.datasetEpoch,
      graphId: "graph:one",
    });
    await request("clusterLooseness", {
      value: 0.4,
      preview: false,
      datasetEpoch: initial.datasetEpoch,
      graphId: "graph:one",
    });
    await request("select", { iri: sample.ids[5] });
    await request("undo");
    const undoneWhilePending = await request<Snapshot>("state");
    expect(undoneWhilePending.graph.layoutPending).toBe(true);
    expect(undoneWhilePending.graph.clusterLooseness).toBe(1);
    expect(undoneWhilePending.selected).toBe(sample.ids[5]);
    expect(positions(undoneWhilePending)).toEqual(positions(initial));
    expect((await serialized()).workspaceRevision).toBe(
      layout.workspaceRevision,
    );
    await releaseControlledLayout(expected);
    await request("redo");
    let state = await request<Snapshot>("state");
    expect(state.graph.clusterLooseness).toBe(0.4);
    expect(state.selected).toBe(sample.ids[5]);
    expect(positions(state)).toEqual(expected);
    await request("undo");
    state = await request<Snapshot>("state");
    expect(state.graph.clusterLooseness).toBe(1);
    expect(positions(state)).toEqual(expected);
    await request("undo");
    expect(positions(await request<Snapshot>("state"))).toEqual(
      positions(initial),
    );
    await request("redo");
    state = await request<Snapshot>("state");
    expect(state.graph.choice).toBe("elk-stress");
    expect(state.graph.clusterLooseness).toBe(1);
    expect(state.graphs!["graph:two"].clusterLooseness).toBe(0.65);
    expect(positions(state)).toEqual(expected);
    expect((await serialized()).workspaceRevision).toBe(
      layout.workspaceRevision,
    );
  });
}, 30000);

it("keeps an external layout's own setting and revision when its completion follows a Clusters commit", async () => {
  await withControlledLayout(async ({ initial, before, layout, expected }) => {
    await request("clusterLooseness", {
      value: 0.4,
      preview: true,
      datasetEpoch: initial.datasetEpoch,
      graphId: "graph:one",
    });
    await request("clusterLooseness", {
      value: 0.4,
      preview: false,
      datasetEpoch: initial.datasetEpoch,
      graphId: "graph:one",
    });
    const committed = await serialized(),
      finished = await releaseControlledLayout(expected);
    expect(finished.graph.clusterLooseness).toBe(0.4);
    expect(committed.workspaceRevision).toBeGreaterThan(
      layout.workspaceRevision,
    );
    await request("undo");
    let state = await request<Snapshot>("state");
    expect(state.graph.clusterLooseness).toBe(1);
    expect(positions(state)).toEqual(expected);
    expect((await serialized()).workspaceRevision).toBe(
      layout.workspaceRevision,
    );
    await request("undo");
    state = await request<Snapshot>("state");
    expect(state.graph.choice).toBe("force");
    expect(state.graph.clusterLooseness).toBe(1);
    expect(positions(state)).toEqual(positions(initial));
    expect((await serialized()).workspaceRevision).toBe(
      before.workspaceRevision,
    );
    await request("redo");
    state = await request<Snapshot>("state");
    expect(state.graph.choice).toBe("elk-stress");
    expect(state.graph.clusterLooseness).toBe(1);
    expect(positions(state)).toEqual(expected);
    expect((await serialized()).workspaceRevision).toBe(
      layout.workspaceRevision,
    );
    await request("redo");
    state = await request<Snapshot>("state");
    expect(state.graph.clusterLooseness).toBe(0.4);
    expect(state.graphs!["graph:two"].clusterLooseness).toBe(0.65);
    expect(positions(state)).toEqual(expected);
    expect((await serialized()).workspaceRevision).toBe(
      committed.workspaceRevision,
    );
  });
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
