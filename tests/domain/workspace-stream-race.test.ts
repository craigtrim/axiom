// craigtrim/axiom#208: hold a real file read while domain edits remain responsive.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DomainProcess } from "../../src/main/domain-process";
import { THING } from "../../src/domain/model";
import type { Workspace } from "../../src/domain/workspace";
import type { DomainMethod, Snapshot } from "../../src/shared/protocol";

let directory: string;
const processes: DomainProcess[] = [];
beforeAll(async () => {
  directory = await mkdtemp(
    path.join(tmpdir(), "axiom-workspace-stream-race-"),
  );
  const checkpointFile = path.resolve("src/main/checkpoint-store.ts");
  const jsonFile = JSON.stringify(path.resolve("src/main/json-io.ts"));
  await build({
    entryPoints: ["src/main/domain-worker.ts"],
    outfile: path.join(directory, "domain-worker.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    logLevel: "silent",
    plugins: [
      {
        name: "hold-workspace-file-read",
        setup(build) {
          build.onResolve({ filter: /^\.\/json-io$/ }, (args) => {
            if (path.resolve(args.importer) === checkpointFile)
              return {
                path: "held-checkpoint-json",
                namespace: "workspace-read-fixture",
              };
          });
          build.onLoad(
            {
              filter: /^held-checkpoint-json$/,
              namespace: "workspace-read-fixture",
            },
            () => ({
              loader: "js",
              resolveDir: path.dirname(checkpointFile),
              contents: `
            import path from "node:path";
            import { readJsonFile as readActualJsonFile } from ${jsonFile};
            export * from ${jsonFile};
            export async function readJsonFile(file, ...options) {
              if (path.basename(file) === "held.axiom") {
                await new Promise((resolve, reject) => {
                  const release = packet => {
                    if (packet?.args?.releaseHeldRead !== true) return;
                    process.off("message", release);
                    resolve();
                  };
                  process.on("message", release);
                  process.send({ event: { type: "held-file-read", data: {} } }, error => {
                    if (!error) return;
                    process.off("message", release);
                    reject(error);
                  });
                });
              }
              return readActualJsonFile(file, ...options);
            }
          `,
            }),
          );
        },
      },
    ],
  });
}, 30000);

afterEach(async () => {
  await Promise.all(
    processes.splice(0).map(async (child) => {
      // A failed assertion must not leave the fixture's file read waiting forever.
      child.postMessage(
        { id: -1, method: "runtimeInfo", args: { releaseHeldRead: true } },
        () => {},
      );
      await child.terminate();
    }),
  );
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

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
  const fail = (error: Error) => {
    for (const promise of pending.values()) promise.reject(error);
    pending.clear();
  };
  child.on("error", fail);
  child.on("exit", (code, signal) =>
    fail(Error("Data child stopped: " + (signal ?? code))),
  );
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

function heldRead(child: DomainProcess) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      child.off("message", message);
      child.off("error", failed);
      child.off("exit", exited);
    };
    const message = (packet: any) => {
      if (packet.event?.type !== "held-file-read") return;
      cleanup();
      resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    const exited = () =>
      failed(Error("Data child exited before the held read."));
    child.on("message", message);
    child.on("error", failed);
    child.on("exit", exited);
  });
}

async function fixture() {
  const child = new DomainProcess(path.join(directory, "domain-worker.cjs"), {
    execPath: process.execPath,
  });
  processes.push(child);
  const request = requests(child);
  const profile = await mkdtemp(path.join(directory, "profile-"));
  await request("configureDataService", {
    directory: profile,
    appPath: directory,
    resourcesPath: directory,
    packaged: false,
  });
  await request("new", { blank: true });
  const savedIri = await request<string>("createClass", {
    name: "Saved in file",
    parent: THING,
  });
  const saved = await request<Workspace>("serialize");
  const file = path.join(profile, "held.axiom");
  await writeFile(file, JSON.stringify(saved));
  await request("new", { blank: true });
  return { child, request, savedIri, file };
}

function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined as Error | undefined }),
    (error: Error) => ({ value: undefined, error }),
  );
}

it("rejects a streamed workspace that would discard an edit made during its read", async () => {
  const { child, request, savedIri, file } = await fixture();
  const held = heldRead(child);
  const loading = outcome(request("loadWorkspaceFile", { file }));
  await held;
  const created = await request<string>("createClass", {
    name: "Created during read",
    parent: THING,
  });
  await request("runtimeInfo", { releaseHeldRead: true });
  expect((await loading).error?.message).toContain("The workspace changed");
  const state = await request<Snapshot>("state");
  expect(state.entities.some((entity) => entity.iri === created)).toBe(true);
  expect(state.entities.some((entity) => entity.iri === savedIri)).toBe(false);
  expect(state.dirty).toBe(true);
}, 30000);

it("rejects a streamed workspace when only the current graph document changed", async () => {
  const { child, request, savedIri, file } = await fixture();
  const before = await request<Snapshot>("state");
  expect(before.graph.edgesVisible).toBe(true);
  const held = heldRead(child);
  const loading = outcome(request("loadWorkspaceFile", { file }));
  await held;
  await request("edgeVisibility", { visible: false });
  const edited = await request<Snapshot>("state");
  expect(edited.version).toBe(before.version);
  expect(edited.graph.edgesVisible).toBe(false);
  await request("runtimeInfo", { releaseHeldRead: true });
  expect((await loading).error?.message).toContain("The workspace changed");
  const state = await request<Snapshot>("state");
  expect(state.graph.edgesVisible).toBe(false);
  expect(state.entities.some((entity) => entity.iri === savedIri)).toBe(false);
}, 30000);

it("applies the same held workspace when its current document remains unchanged", async () => {
  const { child, request, savedIri, file } = await fixture();
  const before = await request<Snapshot>("state");
  const held = heldRead(child);
  const loading = outcome(request("loadWorkspaceFile", { file }));
  await held;
  await request("runtimeInfo", { releaseHeldRead: true });
  expect((await loading).error).toBeUndefined();
  const state = await request<Snapshot>("state");
  expect(state.datasetEpoch).toBe(before.datasetEpoch + 1);
  expect(state.entities.some((entity) => entity.iri === savedIri)).toBe(true);
  expect(state.dirty).toBe(false);
}, 30000);
