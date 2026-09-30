import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MpnetEmbeddings } from "../../src/main/mpnet";
import { EmbeddingEngine } from "../../src/main/embedding-engine";
import { embeddingDot } from "../../src/shared/embeddings";

// Each configuration gets a fresh optional disk cache. Model loading is measured separately.
const directory = path.resolve("artifacts/benchmarks");
await mkdir(directory, { recursive: true });
const records: unknown[] = [];
const subjects = [
  "Reading comprehension",
  "Theory of computation",
  "German literature",
  "English grammar",
  "Arts and crafts",
  "Blood collection",
  "Applied mathematics",
  "Software engineering",
];
const texts = Array.from(
  { length: 64 },
  (_, i) => subjects[i % subjects.length] + " course " + (i + 100),
);
for (const threads of [1, 2, 4])
  for (const batchSize of [8, 16, 32]) {
    process.env.AXIOM_EMBEDDING_CACHE_DIR = await mkdtemp(
      path.join(directory, "mpnet-cache-"),
    );
    const model = new MpnetEmbeddings({ threads, batchSize });
    let start = performance.now();
    await model.embed(["warm the local inference session"]);
    const loadMs = performance.now() - start;
    start = performance.now();
    const vectors = await model.embed(texts);
    const coldCorpusMs = performance.now() - start;
    let encodingMs = 0;
    const engine = new EmbeddingEngine(async (t) => {
      const start = performance.now();
      const vectors = await model.embed(t);
      encodingMs = performance.now() - start;
      return vectors;
    }, batchSize);
    start = performance.now();
    await engine.prepare("benchmark", texts);
    const cachedCorpusMs = performance.now() - start;
    const queryMs: number[] = [];
    const queryEncodingMs: number[] = [];
    for (const query of [
      "understanding what you read",
      "beginner language instruction",
      "programming and algorithms",
    ]) {
      start = performance.now();
      await engine.search("benchmark", query, "benchmark");
      queryMs.push(performance.now() - start);
      queryEncodingMs.push(encodingMs);
    }
    start = performance.now();
    await engine.search(
      "benchmark",
      "understanding what you read",
      "benchmark",
    );
    const cachedQueryMs = performance.now() - start;
    // Isolate the 6,000-vector dot-product scan from encoding and disk access.
    // Repeated measured vectors control matrix size without another 6,000 inferences.
    const [anchor] = await model.embed(["understanding what you read"]);
    const matrix = new Float32Array(6000 * anchor.length);
    for (let i = 0; i < 6000; i++)
      matrix.set(vectors[i % vectors.length], i * anchor.length);
    const scoringMs: number[] = [];
    let checksum = 0;
    for (let sample = 0; sample < 21; sample++) {
      start = performance.now();
      for (let i = 0; i < 6000; i++)
        checksum += embeddingDot(
          anchor,
          matrix.subarray(i * anchor.length, (i + 1) * anchor.length),
        );
      if (sample) scoringMs.push(performance.now() - start);
    }
    scoringMs.sort((a, b) => a - b);
    const record = {
      threads,
      batchSize,
      texts: texts.length,
      loadMs,
      coldCorpusMs,
      cachedCorpusMs,
      queryMs,
      queryEncodingMs,
      cachedQueryMs,
      residentScoring6000: {
        p50Ms: scoringMs[9],
        p95Ms: scoringMs[18],
        checksum,
      },
    };
    records.push(record);
    console.log(JSON.stringify(record));
    await model.dispose();
    await writeFile(
      path.join(directory, "search-mpnet.json"),
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          cpu: os.cpus()[0].model,
          records,
        },
        null,
        2,
      ),
    );
  }
