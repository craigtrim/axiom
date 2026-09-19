import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  buildTaxonomyPrompt,
  parseTaxonomyResult,
  type TaxonomyHistoryEntry,
} from "../shared/taxonomy-assistant";

/** Each run is retained independently, including its original context and outcome. */
export class TaxonomyHistory {
  private entries = new Map<string, TaxonomyHistoryEntry>();
  private ready?: Promise<void>;
  constructor(private root: string) {}
  private load() {
    return (this.ready ??= (async () => {
      await mkdir(this.root, { recursive: true });
      for (const file of await readdir(this.root)) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
        try {
          const saved = JSON.parse(
            await readFile(path.join(this.root, file), "utf8"),
          );
          const e = saved.entry as TaxonomyHistoryEntry;
          if (
            saved.format !== 1 ||
            !e ||
            typeof e.id !== "string" ||
            typeof e.session !== "string" ||
            typeof e.prompt !== "string" ||
            !Number.isFinite(e.startedAt) ||
            typeof e.context?.ontology?.namespace !== "string" ||
            ![
              "running",
              "completed",
              "failed",
              "cancelled",
              "interrupted",
            ].includes(e.state) ||
            !e.context?.selected?.iri ||
            !Array.isArray(e.applied) ||
            !["children", "instances"].includes(e.context.mode) ||
            !["claude", "codex"].includes(e.provider)
          )
            continue;
          buildTaxonomyPrompt(e.context);
          if (e.reviewContext) buildTaxonomyPrompt(e.reviewContext);
          if (e.response) {
            e.response.result = parseTaxonomyResult(e.response.result);
            if (
              e.response.id !== e.id ||
              !Array.isArray(e.response.issues) ||
              e.response.issues.length !==
                e.response.result.suggestions.length ||
              e.response.issues.some(
                (issue) => issue !== null && typeof issue !== "string",
              )
            )
              continue;
          }
          if (e.state === "completed" && !e.response) continue;
          if (
            e.applied.some(
              (i) =>
                !Number.isInteger(i) ||
                i < 0 ||
                i >= (e.response?.result.suggestions.length ?? 0),
            )
          )
            continue;
          if (e.state === "running") {
            e.state = "interrupted";
            e.error =
              "This run was interrupted when Axiom closed. Start a new run to try again.";
          }
          this.entries.set(e.id, e);
        } catch {
          /* A damaged run must not hide the remaining history. */
        }
      }
    })());
  }
  async list() {
    await this.load();
    return [...this.entries.values()].sort((a, b) => b.startedAt - a.startedAt);
  }
  async get(id: string) {
    await this.load();
    return this.entries.get(id);
  }
  async put(entry: TaxonomyHistoryEntry) {
    await this.load();
    const file = path.join(
      this.root,
      createHash("sha256").update(entry.id).digest("hex") + ".json",
    );
    const temporary = file + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify({ format: 1, entry }), "utf8");
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    this.entries.set(entry.id, entry);
  }
}
