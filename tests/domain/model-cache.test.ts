import { it, expect } from "vitest";
import { readFile, writeFile, unlink, readdir } from "node:fs/promises";
import path from "node:path";
import {
  ModelCache,
  modelHash,
  type ModelCacheKey,
  type ModelPurpose,
} from "../../src/main/model-cache";
import type { AssistantRunResult } from "../../src/shared/assistant";
const purposes: ModelPurpose[] = [
  "find-synonyms",
  "add-parents",
  "add-children",
  "find-instances",
];
const key = (purpose: ModelPurpose = "find-synonyms"): ModelCacheKey => ({
  purpose,
  entity: {
    label: " Business Ethics ",
    iri: "https://example.org/BusinessEthics",
  },
  ontology: { iri: "https://example.org", namespace: "https://example.org/" },
  provider: "claude",
  prompt: "Exact prompt\n  preserved bytes\n",
});
const completion = (
  reply: unknown = { suggestions: [] },
): AssistantRunResult => ({
  reply,
  metadata: {
    cli: { path: "C:/tools/claude.exe", version: "2.1.0" },
    model: "reported-model",
    startedAt: "2001-01-01T00:00:00.000Z",
    completedAt: "2001-01-01T00:00:01.000Z",
    durationMs: 1000,
    providerReport: {
      usage: { input_tokens: 123, output_tokens: 45 },
      totalCostUsd: 0.01,
    },
  },
});
it.each(purposes)(
  "stores %s with exact prompt, result and complete metadata, without age expiry",
  async (purpose) => {
    const cache = new ModelCache(undefined, "9.8.7"),
      k = key(purpose),
      run = completion(
        purpose.startsWith("find-synonyms") || purpose === "add-parents"
          ? { suggestions: [] }
          : "Summary: None.\nSuggestions: None.",
      );
    await cache.put(k, run);
    const dir = cache.directory(k),
      meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8"));
    expect(path.basename(dir)).toBe(modelHash("Business Ethics"));
    expect(path.dirname(dir)).toBe(
      path.join(process.env.AXIOM_CACHE_HOME!, "model", purpose),
    );
    expect(await readFile(path.join(dir, "prompt.txt"), "utf8")).toBe(k.prompt);
    expect(meta).toMatchObject({
      ...run.metadata,
      format: 1,
      purpose,
      entity: { ...k.entity, labelMd5: modelHash("Business Ethics") },
      ontology: k.ontology,
      provider: "claude",
      promptMd5: modelHash(k.prompt),
      axiomVersion: "9.8.7",
    });
    const saved = await new ModelCache().get(k);
    expect(saved?.reply).toEqual(run.reply);
    expect(saved?.metadata.completedAt).toBe("2001-01-01T00:00:01.000Z");
    expect(await readdir(dir)).toEqual(
      expect.arrayContaining([
        "meta.json",
        "prompt.txt",
        purpose === "find-synonyms" || purpose === "add-parents"
          ? "result.json"
          : "result.txt",
      ]),
    );
  },
);
it.each(["provider", "prompt", "entity", "namespace", "purpose"])(
  "misses when %s changes",
  async (field) => {
    const cache = new ModelCache(),
      k = key();
    await cache.put(k, completion());
    const changed = structuredClone(k);
    if (field === "provider") changed.provider = "codex";
    if (field === "prompt") changed.prompt += " ";
    if (field === "entity") changed.entity.iri += "Other";
    if (field === "namespace") changed.ontology.namespace += "other";
    if (field === "purpose") changed.purpose = "add-parents";
    expect(await cache.get(changed)).toBeUndefined();
  },
);
it("replaces the same label directory on provider switch and never shares equal labels across entity IRIs", async () => {
  const cache = new ModelCache(),
    k = key();
  await cache.put(k, completion("first"));
  const other = {
    ...k,
    provider: "codex" as const,
    entity: { ...k.entity, iri: k.entity.iri + "2" },
  };
  expect(cache.directory(other)).toBe(cache.directory(k));
  await cache.put(other, completion("second"));
  expect(await cache.get(k)).toBeUndefined();
  expect((await cache.get(other))?.reply).toBe("second");
});
it.each(["prompt.txt", "result.json", "meta.json"])(
  "treats a missing %s as an incomplete entry",
  async (file) => {
    const cache = new ModelCache(),
      k = key();
    await cache.put(k, completion());
    await unlink(path.join(cache.directory(k), file));
    expect(await cache.get(k)).toBeUndefined();
  },
);
it.each(["format", "bytes", "hash", "date", "model", "result path", "CLI"])(
  "rejects invalid %s metadata",
  async (field) => {
    const cache = new ModelCache(),
      k = key();
    await cache.put(k, completion());
    const file = path.join(cache.directory(k), "meta.json"),
      m = JSON.parse(await readFile(file, "utf8"));
    if (field === "format") m.format = 99;
    if (field === "bytes") m.result.bytes++;
    if (field === "hash") m.result.md5 = "bad";
    if (field === "date") m.completedAt = "bad";
    if (field === "model") delete m.model;
    if (field === "result path") m.result.file = "../result.json";
    if (field === "CLI") delete m.cli;
    await writeFile(file, JSON.stringify(m));
    expect(await cache.get(k)).toBeUndefined();
  },
);
it("rejects a hybrid write even when the new result has the same byte length", async () => {
  const cache = new ModelCache(),
    k = key();
  await cache.put(k, completion("first"));
  await writeFile(path.join(cache.directory(k), "result.json"), "other");
  expect(await cache.get(k)).toBeUndefined();
});
it("serializes simultaneous replacements without mixing metadata and replies", async () => {
  const cache = new ModelCache(),
    k = key();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      cache.put({ ...k, prompt: String(i) }, completion(String(i))),
    ),
  );
  expect((await cache.get({ ...k, prompt: "19" }))?.reply).toBe("19");
  expect(await readdir(cache.directory(k))).toHaveLength(3);
});
it("does not write a cancelled result or erase an earlier valid result", async () => {
  const cache = new ModelCache(),
    k = key();
  await cache.put(k, completion("old"));
  await cache.put(k, completion("cancelled"), () => true);
  expect((await cache.get(k))?.reply).toBe("old");
});
it("keeps an unknown reported model null and clears model entries", async () => {
  const cache = new ModelCache(),
    k = key(),
    run = completion();
  run.metadata.model = null;
  run.metadata.providerReport = null;
  await cache.put(k, run);
  expect((await cache.get(k))?.metadata.model).toBeNull();
  await cache.clear();
  expect(await cache.get(k)).toBeUndefined();
});
it("hashes UTF-8 preferred labels with case preserved and trims only at the edges", () => {
  expect(modelHash("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
  const cache = new ModelCache();
  expect(cache.directory(key())).toBe(
    cache.directory({
      ...key(),
      entity: { ...key().entity, label: "Business Ethics" },
    }),
  );
  expect(cache.directory(key())).not.toBe(
    cache.directory({
      ...key(),
      entity: { ...key().entity, label: "business ethics" },
    }),
  );
});
