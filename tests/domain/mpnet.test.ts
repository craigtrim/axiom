import { it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { MpnetEmbeddings } from "../../src/main/mpnet";
import { embeddingModelDirectory } from "../../src/main/embedding-paths";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { Store } from "../../src/domain/store";
import { entity } from "../../src/domain/model";

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
    await model.flush();
    expect((await restart.compare("car", ["automobile"]))[0]).toBeCloseTo(
      scores[0],
      8,
    );
    const store = new Store();
    for (const name of [
      "Reading Comprehension",
      "German Reading",
      "Theory of Computation",
      "Banana",
    ]) {
      const iri = "https://test.example/" + name.replaceAll(" ", "_");
      store.entities.set(iri, { ...entity(iri, "Class"), label: name });
    }
    const index = new EntitySearchIndex(store);
    const query = "understanding what you read";
    const texts = index.semanticTexts(["name"]);
    const similarities = await model.compare(query, texts);
    const result = index.find(
      { text: query, fields: ["name"] },
      new Map(texts.map((text, i) => [text, similarities[i]])),
    );
    expect(result.rows.map((r) => r.name)).toContain("Reading Comprehension");
    expect(
      result.rows.find((r) => r.name === "Reading Comprehension")?.similarity,
    ).toBeGreaterThanOrEqual(0.5);
    expect(result.rows.map((r) => r.name)).not.toContain("Banana");
    const nonsense = await model.compare("zzqx", texts);
    expect(
      index.find(
        { text: "zzqx", fields: ["name"] },
        new Map(texts.map((text, i) => [text, nonsense[i]])),
      ).total,
    ).toBe(0);
    await model.dispose();
    await restart.dispose();
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
