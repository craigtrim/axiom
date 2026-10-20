// #125: actual worker broadcasts reconstruct the same entities as full state requests.
import { expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { schoolBase, schoolOntology } from "../fixtures/large-ontology";
import { mergeState } from "../../src/shared/state-update";
import { NS, THING } from "../../src/domain/model";
import type { Snapshot, StateUpdate } from "../../src/shared/protocol";

it("publishes label and ancestor deltas, reconstructs Undo/Redo and replacements, and bounds large view events", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "axiom-state-worker-"));
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
    });
    worker = new Worker(path.join(directory, "domain-worker.cjs"));
    let serial = 0,
      merged: Snapshot | undefined;
    const updates: StateUpdate[] = [];
    const pending = new Map<
      number,
      { resolve(value: any): void; reject(error: Error): void }
    >();
    worker.on("message", (packet) => {
      if (packet.event?.type === "state") {
        updates.push(packet.event.data);
        merged = mergeState(merged, packet.event.data);
      }
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
        const id = ++serial;
        pending.set(id, { resolve, reject });
        worker!.postMessage({ id, method, args });
      });
    const equalFull = async () => {
      const full: Snapshot = await request("state");
      expect(merged!.entities).toEqual(full.entities);
      expect(merged!.types).toEqual(full.types);
      expect(merged!.customers).toEqual(full.customers);
      return full;
    };
    const load = async (count: number) => {
      updates.length = 0;
      await request("importRdf", {
        text:
          schoolOntology(count) +
          "\n:School rdfs:subClassOf :Parent . :Parent a owl:Class; rdfs:subClassOf owl:Thing .",
        fileName: "schools.ttl",
        baseIRI: schoolBase,
      });
      expect(updates[0].entities).toBeDefined();
      await request("clear");
      await request("layout", { mode: "grid" });
      return equalFull();
    };
    await load(4);
    let reference = merged!.entities;
    for (const [method, args] of [
      ["spacing", { value: 1.2 }],
      ["selectEdge", { key: null }],
    ] as const) {
      updates.length = 0;
      await request(method, args);
      expect(updates.length).toBeGreaterThan(0);
      for (const event of updates) {
        expect(event.entities).toBeUndefined();
        expect(event.entityChanges).toBeUndefined();
      }
      expect(merged!.entities).toBe(reference);
    }
    const smallBytes = Buffer.byteLength(JSON.stringify(updates.at(-1)));
    const iri = schoolBase + "school2";
    const document = await request("entityDocument", { iri });
    document.statements.find(
      (t: any) => t.predicate === NS.rdfs + "label",
    ).object.value = "Updated school";
    updates.length = 0;
    await request("updateEntity", {
      iri,
      nextIri: iri,
      version: document.version,
      datasetEpoch: document.datasetEpoch,
      statements: document.statements,
    });
    expect(
      updates.flatMap((e) => e.entityChanges?.changed ?? []).map((e) => e.iri),
    ).toEqual([iri]);
    await equalFull();
    for (const method of ["undo", "redo"]) {
      await request(method);
      await equalFull();
    }
    const before = await equalFull();
    updates.length = 0;
    const child = await request("createClass", {
      name: "Child school",
      parent: schoolBase + "School",
    });
    const ancestor = (s: Snapshot, id: string) =>
      s.entities.find((e) => e.iri === id)!;
    const after = await equalFull();
    for (const id of [schoolBase + "School", schoolBase + "Parent", THING]) {
      expect(ancestor(after, id).descendants).toBe(
        ancestor(before, id).descendants + 1,
      );
      expect(
        updates
          .flatMap((e) => e.entityChanges?.changed ?? [])
          .some((e) => e.iri === id),
      ).toBe(true);
    }
    updates.length = 0;
    await request("undo");
    expect(updates.flatMap((e) => e.entityChanges?.removed ?? [])).toContain(
      child,
    );
    await equalFull();
    await request("redo");
    await equalFull();
    await load(21461);
    reference = merged!.entities;
    updates.length = 0;
    await request("selectEdge", { key: null });
    expect(merged!.entities).toBe(reference);
    expect(
      updates.every(
        (e) => !e.entities && !e.entityChanges && !e.types && !e.customers,
      ),
    ).toBe(true);
    const largeBytes = Buffer.byteLength(JSON.stringify(updates.at(-1)));
    expect(Math.abs(largeBytes - smallBytes)).toBeLessThan(100);
    expect(largeBytes).toBeLessThan(5000);
    await equalFull();
    updates.length = 0;
    await request("new", { blank: true });
    expect(updates[0].entities).toBeDefined();
    await equalFull();
  } finally {
    await worker?.terminate();
    await rm(directory, { recursive: true, force: true });
  }
}, 90000);
