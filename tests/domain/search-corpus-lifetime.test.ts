// #124: observe actual domain/service/engine messages with deterministic local vectors.
import { expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { schoolBase, schoolOntology } from "../fixtures/large-ontology";

it("prepares no corpus on import, serves lexical results first, and retains requested vectors across edits and Undo", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "axiom-corpus-worker-"));
  let worker: Worker | undefined;
  try {
    await build({
      entryPoints: ["src/main/domain-worker.ts"],
      outfile: path.join(directory, "domain-worker.cjs"),
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["electron"],
      logLevel: "silent",
      banner: {
        js: `
        const probeThreads = require("node:worker_threads");
        const probePost = probeThreads.Worker.prototype.postMessage;
        probeThreads.Worker.prototype.postMessage = function(message, ...rest) {
          if (message.type) probeThreads.parentPort.postMessage({ probe: { type: message.type, key: message.key } });
          return probePost.call(this, message, ...rest);
        };
        const probeEmit = probeThreads.Worker.prototype.emit;
        probeThreads.Worker.prototype.emit = function(event, message, ...rest) {
          if (event === "message" && message?.probe) probeThreads.parentPort.postMessage(message);
          return probeEmit.call(this, event, message, ...rest);
        };`,
      },
    });
    await build({
      stdin: {
        contents: `
        import { parentPort } from "node:worker_threads";
        import { EmbeddingEngine } from "./src/main/embedding-engine";
        const engine = new EmbeddingEngine(async texts => {
          parentPort.postMessage({ probe: { type: "embed", texts } });
          return texts.map(() => new Float32Array([1, 0]));
        }, 512);
        parentPort.on("message", async ({id, type, key, texts, query, consumer}) => {
          if (type === "reset") return engine.reset();
          if (type === "cancel") return engine.cancel(consumer);
          if (type === "release") return engine.release(key);
          const value = type === "prepare" ? await engine.prepare(key, texts)
            : await engine.search(key, query, consumer);
          parentPort.postMessage({ id, value });
        });`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      outfile: path.join(directory, "embedding-worker.cjs"),
      bundle: true,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
    });
    worker = new Worker(path.join(directory, "domain-worker.cjs"));
    const probes: { type: string; key?: string; texts?: string[] }[] = [];
    let nextId = 0;
    const pending = new Map<
      number,
      { resolve(value: any): void; reject(error: Error): void }
    >();
    worker.on("message", (packet) => {
      if (packet.probe) probes.push(packet.probe);
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
    const request = (method: string, args: Record<string, unknown> = {}) =>
      new Promise<any>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        worker!.postMessage({ id, method, args });
      });
    await request("importRdf", {
      text: schoolOntology(),
      fileName: "schools.ttl",
      baseIRI: schoolBase,
    });
    // Covers the former 180 ms warm-up timer without making a search request.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(probes.filter((p) => p.type === "prepare")).toHaveLength(0);
    let searchId = 0;
    const search = async () => {
      const args = {
        text: "school",
        fields: ["name"],
        consumer: "find",
        searchId: String(++searchId),
      };
      const lexical = await request("find", args);
      expect(lexical.total).toBeGreaterThan(21000);
      return { lexical, semantic: await request("findSemantic", args) };
    };
    const lexical = await request("find", {
      text: "School 00042",
      fields: ["name"],
      consumer: "find",
      searchId: "first",
    });
    expect(lexical.rows[0].iri).toBe(schoolBase + "school42");
    expect(probes.filter((p) => p.type === "prepare")).toHaveLength(0);
    const initial = await search();
    expect(initial.semantic).toBeDefined();
    const corpusKey = probes.find((p) => p.type === "prepare")!.key;
    probes.length = 0;
    await request("rename", {
      iri: schoolBase + "School",
      name: "Renamed school",
    });
    expect(
      probes.filter((p) => p.type === "reset" || p.type === "prepare"),
    ).toHaveLength(0);
    await search();
    expect(
      probes.filter((p) => p.type === "prepare").map((p) => p.key),
    ).toEqual([corpusKey]);
    expect(
      probes.filter((p) => p.type === "embed").flatMap((p) => p.texts!),
    ).toEqual(["Renamed school", "school"]);
    probes.length = 0;
    await request("undo");
    const undone = await search();
    expect(undone.semantic.rows).toEqual(initial.semantic.rows);
    expect(
      probes.filter((p) => p.type === "embed").flatMap((p) => p.texts!),
    ).toEqual(["school"]);
    expect(probes.filter((p) => p.type === "reset")).toHaveLength(0);
    probes.length = 0;
    await request("new", { blank: true });
    expect(probes.filter((p) => p.type === "reset")).toHaveLength(1);
    expect(probes.filter((p) => p.type === "prepare")).toHaveLength(0);
  } finally {
    await worker?.terminate();
    await rm(directory, { recursive: true, force: true });
  }
}, 90000);
