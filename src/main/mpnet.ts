import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import {
  embeddingModel,
  embeddingText,
  embeddingCosine,
} from "../shared/embeddings";
import {
  embeddingModelDirectory,
  embeddingCacheDirectory,
} from "./embedding-paths";

/** One local FP32 model shared by Find and synonym comparisons in a worker. */
export class MpnetEmbeddings {
  private model?: Promise<{
    extractor: FeatureExtractionPipeline;
    pool: typeof import("@huggingface/transformers").mean_pooling;
  }>;
  private memory = new Map<string, Float32Array>();
  private cache = path.join(
    embeddingCacheDirectory(),
    embeddingModel.revision + "-fp32-mean384-lower-tjs4.3-v1",
  );
  private async load() {
    const directory = embeddingModelDirectory();
    try {
      const manifest = JSON.parse(
        await readFile(path.join(directory, "axiom-model.json"), "utf8"),
      );
      if (
        JSON.stringify(manifest) !== JSON.stringify(embeddingModel) ||
        (await stat(path.join(directory, "onnx", "model.onnx"))).size !==
          embeddingModel.weightsBytes
      )
        throw Error("Unexpected model files.");
    } catch {
      throw Error(
        `The local full-precision MPNet model is missing or incomplete at ${directory}. Run npm run setup:embeddings on this machine to install it.`,
      );
    }
    const { env, pipeline, mean_pooling } =
      await import("@huggingface/transformers");
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useFSCache = false;
    await mkdir(this.cache, { recursive: true });
    const extractor = await pipeline("feature-extraction", directory, {
      dtype: "fp32",
      device: "cpu",
      local_files_only: true,
      session_options: {
        intraOpNumThreads: Math.max(1, Math.min(4, os.availableParallelism())),
        interOpNumThreads: 1,
      },
    });
    return { extractor, pool: mean_pooling };
  }
  private filename(text: string) {
    return path.join(
      this.cache,
      createHash("sha256").update(text).digest("hex") + ".bin",
    );
  }
  private remember(text: string, vector: Float32Array) {
    this.memory.delete(text);
    this.memory.set(text, vector);
    if (this.memory.size > 20000)
      this.memory.delete(this.memory.keys().next().value!);
  }
  async embed(texts: string[]) {
    // Loading also verifies that a model is available, even if cached vectors exist.
    this.model ??= this.load().catch((error) => {
      this.model = undefined;
      throw error;
    });
    const { extractor, pool } = await this.model;
    const keys = texts.map(embeddingText);
    const vectors = new Map<string, Float32Array>();
    const missing: string[] = [];
    const unique = [...new Set(keys)];
    for (let i = 0; i < unique.length; i += 32) {
      await Promise.all(
        unique.slice(i, i + 32).map(async (key) => {
          let vector = this.memory.get(key);
          if (!vector) {
            try {
              const bytes = await readFile(this.filename(key));
              if (bytes.length === embeddingModel.dimensions * 4) {
                const candidate = new Float32Array(
                  bytes.buffer.slice(
                    bytes.byteOffset,
                    bytes.byteOffset + bytes.byteLength,
                  ),
                );
                const norm = candidate.reduce((sum, n) => sum + n * n, 0);
                if (Number.isFinite(norm) && Math.abs(norm - 1) < 0.001)
                  vector = candidate;
              }
            } catch {
              /* Absent cached vectors are calculated below. */
            }
          }
          if (vector) {
            vectors.set(key, vector);
            this.remember(key, vector);
          } else missing.push(key);
        }),
      );
    }
    for (let i = 0; i < missing.length; i += 8) {
      const batch = missing.slice(i, i + 8);
      const inputs = extractor.tokenizer(batch, {
        padding: true,
        truncation: true,
        max_length: 384,
      });
      const output = await extractor.model(inputs);
      const tensor = pool(
        output.last_hidden_state,
        inputs.attention_mask,
      ).normalize(2, -1);
      if (tensor.dims[1] !== embeddingModel.dimensions)
        throw Error("Unexpected MPNet embedding dimensions.");
      await Promise.all(
        batch.map(async (key, index) => {
          const vector = Float32Array.from(
            tensor.data.slice(
              index * embeddingModel.dimensions,
              (index + 1) * embeddingModel.dimensions,
            ) as Float32Array,
          );
          this.remember(key, vector);
          vectors.set(key, vector);
          const filename = this.filename(key),
            temporary = filename + "." + process.pid + ".tmp";
          try {
            await writeFile(temporary, Buffer.from(vector.buffer));
            await rename(temporary, filename);
          } catch {
            /* A cache write failure must not prevent an in-memory comparison. */
          }
        }),
      );
    }
    return keys.map((key) => vectors.get(key)!);
  }
  async compare(query: string, texts: string[]) {
    if (!texts.length) return [];
    const [anchor, ...vectors] = await this.embed([query, ...texts]);
    return vectors.map((vector) => embeddingCosine(anchor, vector));
  }
}
