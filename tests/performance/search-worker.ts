import { Worker } from "node:worker_threads";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const worker = new Worker(path.resolve("dist/main/domain-worker.cjs"), {
  // Keep inference out of the lexical benchmark; exercise the optional-model failure path.
  env: {
    ...process.env,
    AXIOM_EMBEDDING_MODEL_DIR: path.resolve(
      "artifacts/benchmark-missing-model",
    ),
  },
});
let serial = 0;
const pending = new Map<
  number,
  { resolve(value: any): void; reject(error: Error): void }
>();
worker.on("message", ({ id, value, error }) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (error) p.reject(Error(error));
  else p.resolve(value);
});
const request = (method: string, args: Record<string, unknown>) =>
  new Promise<any>((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
try {
  const base = "https://example.test/courses#";
  const text =
    `@prefix : <${base}>. @prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. ` +
    Array.from(
      { length: 6000 },
      (_, i) =>
        `:Course${i} a owl:Class; rdfs:label "Laser Polymer Course ${i}"; rdfs:comment "Training in polymer materials ${i}".`,
    ).join("\n");
  await request("importRdf", { text, fileName: "courses.ttl", baseIRI: base });
  let start = performance.now();
  await request("find", { text: "polymer 5999" });
  const firstQueryIncludingIndexMs = performance.now() - start;
  const warmP95BudgetMs = 30;
  const records: Record<
    string,
    { p50Ms: number; p95Ms: number; maxMs: number }
  > = {};
  for (const scenario of ["find", "findWithScope", "resourceSuggestions"]) {
    const method = scenario === "findWithScope" ? "find" : scenario;
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      start = performance.now();
      await request(
        method,
        method === "find"
          ? {
              text: "polymer " + (5900 + i),
              ...(scenario === "findWithScope"
                ? { browse: true, diagnostics: true, limit: 10 }
                : {}),
            }
          : { query: "polymer " + (5900 + i), classesOnly: true },
      );
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    records[scenario] = {
      p50Ms: times[49],
      p95Ms: times[94],
      maxMs: times[99],
    };
  }
  const passed = Object.values(records).every(
    (record) => record.p95Ms < warmP95BudgetMs,
  );
  const result = {
    measuredAt: new Date().toISOString(),
    cpu: os.cpus()[0].model,
    entities: 6000,
    includesWorkerRoundTrip: true,
    firstQueryIncludingIndexMs,
    warmP95BudgetMs,
    passed,
    records,
  };
  await mkdir("artifacts/benchmarks", { recursive: true });
  await writeFile(
    "artifacts/benchmarks/search-worker.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await worker.terminate();
}
