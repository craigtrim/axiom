import { it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { MpnetEmbeddings } from "../../src/main/mpnet";
import { embeddingModelDirectory } from "../../src/main/embedding-paths";

it.skipIf(
  !existsSync(path.join(embeddingModelDirectory(), "axiom-model.json")),
)(
  "full-precision MPNet recognizes meaning beyond spelling and keeps distances stable across batches",
  async () => {
    const model = new MpnetEmbeddings();
    const scores = await model.compare("car", [
      "automobile",
      "carpet",
      "banana",
      "CAR",
    ]);
    expect(scores[0]).toBeGreaterThan(0.8);
    expect(scores[0]).toBeGreaterThan(scores[1] + 0.3);
    expect(scores[0]).toBeGreaterThan(scores[2] + 0.3);
    expect(scores[3]).toBeCloseTo(1, 8);
    expect(await model.compare("CAR", ["automobile"])).toEqual([scores[0]]);
    const restart = new MpnetEmbeddings();
    expect((await restart.compare("car", ["automobile"]))[0]).toBeCloseTo(
      scores[0],
      8,
    );
  },
  30000,
);

it("reports a missing local model without falling back to text overlap or a remote download", async () => {
  vi.stubEnv(
    "AXIOM_EMBEDDING_MODEL_DIR",
    path.resolve("artifacts/nonexistent-model"),
  );
  try {
    await expect(
      new MpnetEmbeddings().compare("car", ["automobile"]),
    ).rejects.toThrow(/local full-precision MPNet model is missing/);
  } finally {
    vi.unstubAllEnvs();
  }
});
