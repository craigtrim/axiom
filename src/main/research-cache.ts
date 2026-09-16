import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  parseResearchResult,
  type AssistantId,
  type ResearchResult,
} from "../shared/research";

export const researchPromptHash = (prompt: string) =>
  createHash("md5").update(prompt, "utf8").digest("hex");
interface CachedResearch {
  format: 1;
  prompt: string;
  provider: AssistantId;
  completedAt: string;
  result: ResearchResult;
}
/** MD5 indexes exact UTF-8 prompts. The stored prompt also has to match. */
export class ResearchCache {
  constructor(private root: string) {}
  private file(prompt: string) {
    return path.join(this.root, researchPromptHash(prompt) + ".json");
  }
  async get(prompt: string): Promise<CachedResearch | undefined> {
    try {
      const file = this.file(prompt);
      if ((await stat(file)).size > 4_000_000) return;
      const entry = JSON.parse(await readFile(file, "utf8"));
      if (
        entry?.format !== 1 ||
        entry.prompt !== prompt ||
        !["codex", "claude"].includes(entry.provider) ||
        typeof entry.completedAt !== "string" ||
        !Number.isFinite(Date.parse(entry.completedAt))
      )
        return;
      return { ...entry, result: parseResearchResult(entry.result) };
    } catch {
      // Missing, unreadable or malformed entries are misses, never assistant results.
      return;
    }
  }
  async put(
    prompt: string,
    result: ResearchResult,
    provider: AssistantId,
    completedAt: string,
    cancelled: () => boolean,
  ) {
    const file = this.file(prompt),
      temp = file + "." + randomUUID() + ".tmp";
    const entry: CachedResearch = {
      format: 1,
      prompt,
      result,
      provider,
      completedAt,
    };
    await mkdir(this.root, { recursive: true });
    try {
      await writeFile(temp, JSON.stringify(entry), {
        encoding: "utf8",
        flag: "wx",
      });
      if (cancelled()) return;
      await rename(temp, file);
      if (cancelled()) await unlink(file);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
}
