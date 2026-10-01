import { createHash } from "node:crypto";
import path from "node:path";
import { unlink } from "node:fs/promises";
import {
  atomicCacheFile,
  axiomCacheRoot,
  clearCacheDirectory,
  readCacheFile,
} from "./cache-files";
import type {
  AssistantId,
  AssistantRunResult,
  AssistantCallMetadata,
} from "../shared/assistant";

export type ModelPurpose =
  "find-synonyms" | "add-parents" | "add-children" | "find-instances";
export const modelHash = (text: string) =>
  createHash("md5").update(text, "utf8").digest("hex");
export interface ModelCacheKey {
  purpose: ModelPurpose;
  entity: { label: string; iri: string };
  ontology: { iri?: string | null; namespace: string };
  provider: AssistantId;
  prompt: string;
}
interface ModelMetadata extends AssistantCallMetadata {
  format: 1;
  purpose: ModelPurpose;
  entity: { label: string; iri: string; labelMd5: string };
  ontology: ModelCacheKey["ontology"];
  provider: AssistantId;
  promptMd5: string;
  result: { file: string; bytes: number; md5: string; type: "string" | "json" };
  axiomVersion: string;
}
const purposes: ModelPurpose[] = [
  "find-synonyms",
  "add-parents",
  "add-children",
  "find-instances",
];
const writes = new Map<string, Promise<unknown>>();
export class ModelCache {
  private generation = 0;
  constructor(
    private root = axiomCacheRoot(),
    private version = "1.0.0",
  ) {
    this.root = path.resolve(root);
  }
  directory(key: Pick<ModelCacheKey, "purpose" | "entity">) {
    if (!purposes.includes(key.purpose))
      throw Error("Invalid model cache purpose.");
    return path.join(
      this.root,
      "model",
      key.purpose,
      modelHash(key.entity.label.trim()),
    );
  }
  async get(key: ModelCacheKey): Promise<AssistantRunResult | undefined> {
    try {
      const directory = this.directory(key);
      const raw = await readCacheFile(
        path.join(directory, "meta.json"),
        100000,
      );
      if (!raw) return;
      const meta: ModelMetadata = JSON.parse(raw);
      const expectedFile = ["find-synonyms", "add-parents"].includes(
        key.purpose,
      )
        ? "result.json"
        : "result.txt";
      if (
        meta.format !== 1 ||
        meta.purpose !== key.purpose ||
        meta.provider !== key.provider ||
        meta.entity?.labelMd5 !== modelHash(key.entity.label.trim()) ||
        typeof meta.entity.label !== "string" ||
        meta.entity.label.trim() !== key.entity.label.trim() ||
        meta.entity.iri !== key.entity.iri ||
        meta.ontology?.namespace !== key.ontology.namespace ||
        (meta.ontology.iri ?? null) !== (key.ontology.iri ?? null) ||
        meta.promptMd5 !== modelHash(key.prompt) ||
        meta.result?.file !== expectedFile ||
        !["string", "json"].includes(meta.result.type) ||
        typeof meta.startedAt !== "string" ||
        !Number.isFinite(Date.parse(meta.startedAt)) ||
        typeof meta.completedAt !== "string" ||
        !Number.isFinite(Date.parse(meta.completedAt)) ||
        !Number.isFinite(meta.durationMs) ||
        meta.durationMs < 0 ||
        typeof meta.cli?.path !== "string" ||
        !(meta.cli.version === null || typeof meta.cli.version === "string") ||
        typeof meta.axiomVersion !== "string" ||
        !(
          meta.providerReport === null ||
          (typeof meta.providerReport === "object" &&
            !Array.isArray(meta.providerReport))
        ) ||
        !(meta.model === null || typeof meta.model === "string")
      )
        return;
      const prompt = await readCacheFile(path.join(directory, "prompt.txt"));
      const result = await readCacheFile(path.join(directory, expectedFile));
      if (
        prompt !== key.prompt ||
        result === undefined ||
        Buffer.byteLength(result) !== meta.result.bytes ||
        modelHash(result) !== meta.result.md5
      )
        return;
      return {
        reply: meta.result.type === "string" ? result : JSON.parse(result),
        metadata: meta,
      };
    } catch {
      return;
    }
  }
  async put(
    key: ModelCacheKey,
    run: AssistantRunResult,
    cancelled = () => false,
  ) {
    const directory = this.directory(key),
      generation = this.generation;
    const pending = (writes.get(directory) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (cancelled() || generation !== this.generation) return;
        const file = ["find-synonyms", "add-parents"].includes(key.purpose)
          ? "result.json"
          : "result.txt";
        const result =
          typeof run.reply === "string" ? run.reply : JSON.stringify(run.reply);
        if (
          result === undefined ||
          Buffer.byteLength(result) > 2_000_000 ||
          Buffer.byteLength(key.prompt) > 2_000_000
        )
          return;
        const meta: ModelMetadata = {
          ...run.metadata,
          format: 1,
          purpose: key.purpose,
          entity: {
            ...key.entity,
            labelMd5: modelHash(key.entity.label.trim()),
          },
          ontology: key.ontology,
          provider: key.provider,
          promptMd5: modelHash(key.prompt),
          result: {
            file,
            bytes: Buffer.byteLength(result),
            md5: modelHash(result),
            type: typeof run.reply === "string" ? "string" : "json",
          },
          axiomVersion: this.version,
        };
        const metadataFile = path.join(directory, "meta.json");
        await unlink(metadataFile).catch(() => {});
        await atomicCacheFile(path.join(directory, "prompt.txt"), key.prompt);
        await atomicCacheFile(path.join(directory, file), result);
        await unlink(
          path.join(
            directory,
            file === "result.json" ? "result.txt" : "result.json",
          ),
        ).catch(() => {});
        if (cancelled() || generation !== this.generation) return;
        await atomicCacheFile(metadataFile, JSON.stringify(meta, null, 2));
        if (cancelled() || generation !== this.generation)
          await unlink(metadataFile).catch(() => {});
      });
    writes.set(directory, pending);
    try {
      await pending;
    } catch {
      /* A cache write must not discard a valid assistant result. */
    } finally {
      if (writes.get(directory) === pending) writes.delete(directory);
    }
  }
  async clear() {
    ++this.generation;
    await Promise.allSettled(
      [...writes.entries()]
        .filter(([dir]) =>
          dir.startsWith(path.join(this.root, "model") + path.sep),
        )
        .map(([, write]) => write),
    );
    await clearCacheDirectory(this.root, "model");
  }
}
