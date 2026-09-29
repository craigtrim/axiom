import { Worker } from "node:worker_threads";
import path from "node:path";
import { embeddingModel, type SemanticComparison } from "../shared/embeddings";

export class EmbeddingService {
  private worker?: Worker;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve(scores: number[]): void; reject(error: Error): void }
  >();
  async compare(query: string, texts: string[]): Promise<SemanticComparison> {
    if (!this.worker) {
      const worker = (this.worker = new Worker(
        path.join(__dirname, "embedding-worker.cjs"),
      ));
      const failed = (error: Error) => {
        if (this.worker !== worker) return;
        this.worker = undefined;
        for (const p of this.pending.values()) p.reject(error);
        this.pending.clear();
      };
      worker.on("message", ({ id, scores, error }) => {
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (error) p.reject(Error(error));
        else p.resolve(scores);
      });
      worker.on("error", failed);
      worker.on("exit", () =>
        failed(
          Error("The local embedding worker stopped. Retry the comparison."),
        ),
      );
    }
    const id = ++this.nextId;
    const similarities = await new Promise<number[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, query, texts });
    });
    return { model: embeddingModel.id, precision: "fp32", similarities };
  }
  async search(query: string, texts: string[]) {
    const result = await this.compare(query, texts);
    return new Map(texts.map((text, i) => [text, result.similarities[i]]));
  }
}
