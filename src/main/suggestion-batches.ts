import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "../shared/protocol";
import { displayName } from "../domain/rdf-model";
import {
  batchModes,
  supportsBatchMode,
  pendingBatchRun,
  SuggestionBusyError,
  type BatchRequest,
  type BatchRun,
  type SuggestionBatch,
} from "../shared/suggestion-batches";

export interface BatchRunner {
  busy(): boolean;
  run(
    batch: SuggestionBatch,
    run: BatchRun,
    snapshot: Snapshot,
  ): Promise<number>;
  cancel(batch: SuggestionBatch, run: BatchRun): void;
  hasRun(batch: SuggestionBatch, run: BatchRun): Promise<boolean>;
}

/** Owns the queue outside any pane. A target list is captured once, never expanded. */
export class SuggestionBatches {
  private batches: SuggestionBatch[] = [];
  private ready?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private pumping = false;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private active?: { batch: SuggestionBatch; run: BatchRun };
  constructor(
    private root: string,
    private snapshot: () => Promise<Snapshot>,
    private runner: BatchRunner,
    private changed: () => void,
    private reportError: (error: unknown) => void = console.error,
  ) {}
  private load() {
    return (this.ready ??= (async () => {
      await mkdir(this.root, { recursive: true });
      for (const file of await readdir(this.root)) {
        if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
        try {
          const batch: SuggestionBatch = JSON.parse(
            await readFile(path.join(this.root, file), "utf8"),
          );
          if (
            batch.id + ".json" !== file ||
            !Object.hasOwn(batchModes, batch.mode) ||
            typeof batch.namespace !== "string" ||
            !Array.isArray(batch.runs) ||
            !batch.runs.every(
              (r) =>
                /^[a-f0-9-]{36}$/.test(r.id) &&
                typeof r.iri === "string" &&
                typeof r.label === "string" &&
                [
                  "queued",
                  "running",
                  "completed",
                  "failed",
                  "cancelled",
                  "interrupted",
                ].includes(r.state),
            )
          )
            continue;
          // Restarting Axiom never silently sends queued requests to an assistant.
          for (const run of batch.runs)
            if (pendingBatchRun(run)) {
              run.state = "interrupted";
              run.error =
                "Axiom closed before this run finished. Select the node to start a new run.";
            }
          this.batches.push(batch);
        } catch {
          /* One damaged history must not hide the others. */
        }
      }
      this.batches.sort((a, b) => a.createdAt - b.createdAt);
    })());
  }
  private save(batch: SuggestionBatch) {
    const json = JSON.stringify(batch, null, 2);
    const write = this.writes
      .catch(() => {})
      .then(async () => {
        const target = path.join(this.root, batch.id + ".json");
        const temp = target + ".tmp";
        await writeFile(temp, json, "utf8");
        await rename(temp, target);
        this.changed();
      });
    this.writes = write;
    return write;
  }
  async history() {
    await this.load();
    return structuredClone([...this.batches].reverse());
  }
  async enqueue(input: BatchRequest) {
    await this.load();
    if (this.stopped) throw Error("Axiom is closing.");
    if (
      !input ||
      !Object.hasOwn(batchModes, input.mode) ||
      !["claude", "codex"].includes(input.provider) ||
      !Number.isInteger(input.datasetEpoch) ||
      !Array.isArray(input.iris) ||
      !input.iris.length ||
      input.iris.some(
        (iri) => typeof iri !== "string" || !iri || iri.length > 10000,
      )
    )
      throw Error("Choose entities and a supported suggestion action.");
    const s = await this.snapshot();
    if (s.datasetEpoch !== input.datasetEpoch)
      throw Error("The workspace changed. Select the nodes again.");
    const entities = new Map(s.entities.map((e) => [e.iri, e]));
    const iris = [...new Set(input.iris)];
    for (const iri of iris)
      if (!supportsBatchMode(entities.get(iri), input.mode))
        throw Error("This action is not available for every selected node.");
    const batch: SuggestionBatch = {
      id: randomUUID(),
      namespace: s.ontology.namespace,
      datasetEpoch: s.datasetEpoch,
      mode: input.mode,
      provider: input.provider,
      createdAt: Date.now(),
      runs: iris.map((iri) => ({
        id: randomUUID(),
        iri,
        label: displayName(entities.get(iri)!),
        state: "queued",
      })),
    };
    // Publish only after the exact selection has been saved successfully.
    await this.save(batch);
    this.batches.push(batch);
    this.changed();
    this.schedule();
    return structuredClone(batch);
  }
  async cancel(batchId: string, runId?: string) {
    await this.load();
    const batch = this.batches.find((b) => b.id === batchId);
    if (!batch) throw Error("This suggestion batch is no longer available.");
    for (const run of batch.runs)
      if ((!runId || run.id === runId) && pendingBatchRun(run)) {
        run.state = "cancelled";
        run.finishedAt = Date.now();
        if (this.active?.run === run) this.runner.cancel(batch, run);
      }
    await this.save(batch);
  }
  workspaceChanged(epoch: number, namespace?: string) {
    for (const batch of this.batches) {
      if (
        (batch.datasetEpoch === epoch &&
          (namespace === undefined || batch.namespace === namespace)) ||
        !batch.runs.some(pendingBatchRun)
      )
        continue;
      for (const run of batch.runs)
        if (pendingBatchRun(run)) {
          run.state = "cancelled";
          run.error = "The workspace changed before this run finished.";
          run.finishedAt = Date.now();
          if (this.active?.run === run) this.runner.cancel(batch, run);
        }
      void this.save(batch).catch(this.reportError);
    }
  }
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.active) this.runner.cancel(this.active.batch, this.active.run);
  }
  private schedule() {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.pump().catch(this.reportError);
    }, 150);
    this.timer.unref?.();
  }
  private async pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      const batch = this.batches.find((b) =>
        b.runs.some((r) => r.state === "queued"),
      );
      if (!batch || this.runner.busy()) return;
      const run = batch.runs.find((r) => r.state === "queued")!;
      const s = await this.snapshot();
      if (this.stopped || run.state !== "queued") return;
      if (
        s.datasetEpoch !== batch.datasetEpoch ||
        s.ontology.namespace !== batch.namespace
      ) {
        this.workspaceChanged(s.datasetEpoch, s.ontology.namespace);
        return;
      }
      if (this.runner.busy()) return;
      run.state = "running";
      run.startedAt = Date.now();
      this.active = { batch, run };
      try {
        await this.save(batch);
        if (this.stopped || run.state !== "running") return;
        if (
          !supportsBatchMode(
            s.entities.find((e) => e.iri === run.iri),
            batch.mode,
          )
        )
          throw Error(
            "This node was removed or no longer supports this action.",
          );
        run.count = await this.runner.run(batch, run, s);
        if (run.state === "running") run.state = "completed";
      } catch (e) {
        if (run.state === "running") {
          run.state =
            e instanceof SuggestionBusyError
              ? "queued"
              : /cancelled|canceled/i.test((e as Error).message)
                ? "cancelled"
                : "failed";
          if (run.state !== "queued") run.error = (e as Error).message;
          else delete run.startedAt;
        }
      } finally {
        if (run.state !== "queued") run.finishedAt = Date.now();
        run.reviewable = await this.runner
          .hasRun(batch, run)
          .catch(() => false);
        this.active = undefined;
        await this.save(batch);
      }
    } finally {
      this.pumping = false;
      if (this.batches.some((b) => b.runs.some((r) => r.state === "queued")))
        this.schedule();
    }
  }
}
