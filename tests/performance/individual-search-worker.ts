// Integration probe for the built domain worker, with and without local MPNet.
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { embeddingModelDirectory } from "../../src/main/embedding-paths";

const base = "https://example.test/transport#";
const text = `@prefix : <${base}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:Auto a :Transport; rdfs:label "Automobile" .
:Cake a :Food; rdfs:label "Birthday cake" .
:Outside a :Food; rdfs:label "Motor vehicle" .`;
const directory = path.resolve("artifacts/issue-59-worker");
await mkdir(directory, { recursive: true });
const installedModel = embeddingModelDirectory();
const scenarios = [
  {
    name: "missing-model",
    model: path.join(directory, "missing-model"),
    semantic: false,
  },
  ...(existsSync(path.join(installedModel, "onnx/model.onnx"))
    ? [{ name: "local-mpnet", model: installedModel, semantic: true }]
    : []),
];
const records: unknown[] = [];
for (const scenario of scenarios) {
  const worker = new Worker(path.resolve("dist/main/domain-worker.cjs"), {
    env: {
      ...process.env,
      AXIOM_EMBEDDING_MODEL_DIR: scenario.model,
      AXIOM_EMBEDDING_CACHE_DIR: path.join(directory, "embeddings"),
      AXIOM_CACHE_HOME: path.join(directory, "cache"),
    },
  });
  let serial = 0;
  const pending = new Map<
    number,
    { resolve(value: any): void; reject(error: Error): void }
  >();
  worker.on("message", ({ id, value, error }) => {
    const task = pending.get(id);
    if (!task) return;
    pending.delete(id);
    if (error) task.reject(Error(error));
    else task.resolve(value);
  });
  worker.on("error", (error) => {
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  });
  const request = (method: string, args: Record<string, unknown> = {}) =>
    new Promise<any>((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, args });
    });
  const timeout = setTimeout(() => {
    for (const task of pending.values())
      task.reject(Error("Instance search integration timed out"));
    void worker.terminate();
  }, 120000);
  try {
    await request("importRdf", {
      text,
      fileName: "transport.ttl",
      baseIRI: base,
    });
    const state = await request("state");
    const common = {
      datasetEpoch: state.datasetEpoch,
      version: state.version,
      query: "car",
    };
    const gridArgs = {
      ...common,
      scope: base + "Transport",
      shown: ["subject"],
      consumer: "grid",
      searchId: "car",
    };
    const reportArgs = {
      ...common,
      iri: base + "Transport",
      start: 0,
      consumer: "report",
      searchId: "car",
    };
    const gridLexical = await request("individualGrid", gridArgs);
    const reportLexical = await request("instances", reportArgs);
    assert.equal(gridLexical.total, 0);
    assert.equal(reportLexical.filtered, 0);
    const gridSemantic = await request("individualGridSemantic", gridArgs);
    const reportSemantic = await request("instancesSemantic", reportArgs);
    if (scenario.semantic) {
      assert.deepEqual(
        gridSemantic.rows.map((r: any) => r.iri),
        [base + "Auto"],
      );
      assert.deepEqual(
        reportSemantic.rows.map((r: any) => r.iri),
        [base + "Auto"],
      );
    } else {
      assert.equal(gridSemantic, undefined);
      assert.equal(reportSemantic, undefined);
    }
    // Cancellation must discard inference that is already in flight.
    const old = {
      ...gridArgs,
      query: "road transportation",
      searchId: "canceled",
    };
    await request("individualGrid", old);
    const obsolete = request("individualGridSemantic", old);
    await request("cancelSearch", old);
    assert.equal(await obsolete, undefined);
    // A reused dataset or version cannot reuse the old search token.
    await request("new");
    assert.equal(await request("individualGridSemantic", gridArgs), undefined);
    records.push({
      scenario: scenario.name,
      gridLexical: gridLexical.total,
      reportLexical: reportLexical.filtered,
      gridSemantic: gridSemantic?.rows.map((r: any) => r.iri) ?? null,
      reportSemantic: reportSemantic?.rows.map((r: any) => r.iri) ?? null,
      canceled: true,
      invalidated: true,
    });
  } finally {
    clearTimeout(timeout);
    await worker.terminate();
  }
}
await writeFile(
  path.join(directory, "results.json"),
  JSON.stringify(records, null, 2) + "\n",
);
console.log(JSON.stringify(records, null, 2));
