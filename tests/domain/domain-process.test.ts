// craigtrim/axiom#207: exercise the actual Node child, its wire format and lifetime.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, totalmem } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { DomainProcess, heapCeilingMiB } from "../../src/main/domain-process";
import type {
  CheckpointSummary,
  DataRuntimeInfo,
  DomainMethod,
  Snapshot,
} from "../../src/shared/protocol";

let directory: string;
const processes: DomainProcess[] = [];
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "axiom-domain-process-"));
  await build({
    entryPoints: ["src/main/domain-worker.ts"],
    outfile: path.join(directory, "domain-worker.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    logLevel: "silent",
  });
  await writeFile(
    path.join(directory, "transport.cjs"),
    `const { getHeapStatistics } = require('node:v8');
    process.on('message', packet => {
      if (packet.control === 'shutdown') return process.exit(0);
      if (packet.fatal) {
        return process.stderr.write('x'.repeat(80000) + '\\nlast failure detail\\n', () => process.exit(7));
      }
      process.send({ id: packet.id, value: {
        received: packet.data, pid: process.pid, args: process.execArgv,
        pointerCompression: Number(process.config.variables.v8_enable_pointer_compression),
        heapSizeLimit: getHeapStatistics().heap_size_limit
      }});
    });`,
  );
});
afterEach(async () => {
  await Promise.all(processes.splice(0).map((child) => child.terminate()));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function start(file = "domain-worker.cjs", execPath = process.execPath) {
  const child = new DomainProcess(path.join(directory, file), { execPath });
  processes.push(child);
  return child;
}

function requests(child: DomainProcess) {
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve(value: any): void; reject(error: Error): void }
  >();
  child.on("message", (packet) => {
    const promise = pending.get(packet.id);
    if (!promise) return;
    pending.delete(packet.id);
    if (packet.error)
      promise.reject(Object.assign(Error(packet.error), packet));
    else promise.resolve(packet.value);
  });
  child.on("error", (error) => {
    for (const promise of pending.values()) promise.reject(error);
    pending.clear();
  });
  child.on("exit", (code, signal) => {
    for (const promise of pending.values())
      promise.reject(Error("Data child stopped: " + (signal ?? code)));
    pending.clear();
  });
  return <T = any>(method: DomainMethod, args: Record<string, unknown> = {}) =>
    new Promise<T>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      child.postMessage({ id, method, args }, (error) => {
        pending.delete(id);
        reject(error);
      });
    });
}

it("sets the heap ceiling from installed memory without a fixed GiB cap", () => {
  expect(heapCeilingMiB(8 * 1024 ** 3)).toBe(8192);
  expect(heapCeilingMiB(128 * 1024 ** 3)).toBe(131072);
  expect(heapCeilingMiB(1024 ** 3 + 1024 ** 2 - 1)).toBe(1024);
  expect(() => heapCeilingMiB(Number.NaN)).toThrow(RangeError);
});

it("exchanges application JSON values across the actual child IPC", async () => {
  const child = start("transport.cjs");
  child.on("error", () => {});
  const reply = once(child, "message");
  child.postMessage({
    id: 1,
    data: {
      method: "select",
      args: { iri: "https://example.org/entity", origin: "hierarchy" },
      rows: [{ label: 'A quoted "label"', value: 0.75 }],
      enabled: true,
      selected: null,
    },
  });
  const [packet] = await reply;
  expect(packet.value.received).toEqual({
    method: "select",
    args: { iri: "https://example.org/entity", origin: "hierarchy" },
    rows: [{ label: 'A quoted "label"', value: 0.75 }],
    enabled: true,
    selected: null,
  });
  expect(packet.value.pid).not.toBe(process.pid);
  expect(packet.value.pointerCompression).toBe(0);
  expect(packet.value.args).toEqual([
    "--max-old-space-size=" + heapCeilingMiB(totalmem()),
  ]);
  expect(packet.value.heapSizeLimit).toBeGreaterThanOrEqual(
    heapCeilingMiB(totalmem()) * 1024 ** 2,
  );
});

it("serves domain requests and force-layout frames from the separate Node process", async () => {
  const child = start();
  const request = requests(child);
  const frames: Float64Array[] = [];
  child.on("message", (packet) => {
    if (packet.event?.type === "positions")
      frames.push(packet.event.data.positions);
  });
  const runtime = await request<DataRuntimeInfo>("runtimeInfo");
  expect(runtime.pid).toBe(child.pid);
  expect(runtime.pid).not.toBe(process.pid);
  expect(runtime.pointerCompression).toBe(false);
  expect(runtime.totalMemory).toBe(totalmem());
  await request("importRdf", {
    text: "@prefix : <https://example.org/data#> . @prefix owl: <http://www.w3.org/2002/07/owl#> . :Parent a owl:Class . :Child a owl:Class .",
    fileName: "process.ttl",
    baseIRI: "https://example.org/data#",
  });
  await request("seed", {
    iris: ["https://example.org/data#Parent", "https://example.org/data#Child"],
    expand: false,
  });
  await request("layout", { mode: "force" });
  await expect.poll(() => frames.length).toBeGreaterThan(0);
  expect(frames.at(-1)).toBeInstanceOf(Float64Array);
  expect(frames.at(-1)?.length).toBe(4);
  await expect(request("checkpointPrepare")).rejects.toThrow(
    "The data service has not been configured.",
  );
});

it("retains bounded fatal diagnostics and rejects sends after exit", async () => {
  const child = start("transport.cjs");
  child.on("error", () => {});
  const stopped = once(child, "exit");
  child.postMessage({ fatal: true });
  const [code] = await stopped;
  expect(code).toBe(7);
  expect(child.diagnostics.length).toBeLessThanOrEqual(65536);
  expect(child.diagnostics).toContain("last failure detail");
  const error = await new Promise<Error>((resolve) =>
    child.postMessage({ id: 2 }, resolve),
  );
  expect(error.message).toContain("no longer connected");
});

it("saves and restores checkpoints through metadata without sending the workspace to main", async () => {
  const child = start();
  const request = requests(child);
  const profile = path.join(directory, "profile");
  await request("configureDataService", {
    directory: profile,
    appPath: directory,
    resourcesPath: directory,
    packaged: false,
  });
  await request("importRdf", {
    text: "@prefix : <https://example.org/saved#> . @prefix owl: <http://www.w3.org/2002/07/owl#> . :Saved a owl:Class .",
    fileName: "saved.ttl",
    baseIRI: "https://example.org/saved#",
  });
  const checkpoint = await request<CheckpointSummary>("checkpointPrepare");
  expect(checkpoint.id).toBeTypeOf("string");
  expect(checkpoint).not.toHaveProperty("text");
  expect(checkpoint).not.toHaveProperty("workspace");
  const workbench = { version: 1, theme: "light" };
  await request("checkpointSession", { id: checkpoint.id, workbench });
  const saved = JSON.parse(
    await readFile(path.join(profile, "last-session.json"), "utf8"),
  );
  expect(
    saved.workspace.entities.some(
      (entity: { iri: string }) =>
        entity.iri === "https://example.org/saved#Saved",
    ),
  ).toBe(true);
  const file = path.join(directory, "missing.axiom");
  await expect(
    request("checkpointWorkspace", { id: checkpoint.id, file, workbench }),
  ).rejects.toMatchObject({ code: "AXIOM_WORKSPACE_MISSING", file });
  await request("checkpointWorkspace", {
    id: checkpoint.id,
    file,
    workbench,
    options: { allowCreate: true },
  });
  await request("checkpointRelease", { id: checkpoint.id });
  await expect(
    request("checkpointSession", { id: checkpoint.id, workbench }),
  ).rejects.toThrow("no longer available");
  await request("new", { blank: true });
  const restored = await request("restoreSession");
  expect(restored.session).not.toHaveProperty("workspace");
  expect(
    (await request<Snapshot>("state")).entities.some(
      (entity) => entity.iri === "https://example.org/saved#Saved",
    ),
  ).toBe(true);
  await request("new", { blank: true });
  const reopened = await request("loadWorkspaceFile", { file });
  expect(reopened).not.toHaveProperty("workspace");
  expect(reopened).not.toHaveProperty("entities");
  expect(
    (await request<Snapshot>("state")).entities.some(
      (entity) => entity.iri === "https://example.org/saved#Saved",
    ),
  ).toBe(true);
});

it("reports a spawn failure and stops the child lifecycle", async () => {
  const child = start("transport.cjs", path.join(directory, "absent-node.exe"));
  const failed = once(child, "error");
  const stopped = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  const [error] = await failed;
  expect(error.code).toBe("ENOENT");
  await stopped;
  await expect(child.terminate()).resolves.toBeTypeOf("number");
});

it("ends the domain process when its parent IPC channel disconnects", async () => {
  const child = start();
  const request = requests(child);
  await request("runtimeInfo");
  const stopped = once(child, "exit");
  child.child.disconnect();
  const [code] = await stopped;
  expect(code).toBe(0);
});
