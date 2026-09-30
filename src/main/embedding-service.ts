import { Worker } from "node:worker_threads";
import path from "node:path";
import { embeddingModel, type SemanticComparison } from "../shared/embeddings";
export class EmbeddingService {
  private worker?: Worker;
  private nextId = 0;
  private corpora = new Map<string, Promise<boolean>>();
  private pending = new Map<
    number,
    { resolve(value: any): void; reject(error: Error): void }
  >();
  private start() {
    if (this.worker) return this.worker;
    const worker = (this.worker = new Worker(
      path.join(__dirname, "embedding-worker.cjs"),
    ));
    const failed = (error: Error) => {
      if (this.worker !== worker) return;
      this.worker = undefined;
      this.corpora.clear();
      for (const p of this.pending.values()) p.reject(error);
      this.pending.clear();
    };
    worker.on("message", ({ id, value, error }) => {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (error) p.reject(Error(error));
      else p.resolve(value);
    });
    worker.on("error", failed);
    worker.on("exit", () =>
      failed(
        Error("The local embedding worker stopped. Retry the comparison."),
      ),
    );
    return worker;
  }
  private request<T>(message: Record<string, unknown>): Promise<T> {
    const worker = this.start(),
      id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...message });
    });
  }
  prepare(key: string, texts: string[]) {
    let pending = this.corpora.get(key);
    if (!pending) {
      pending = this.request<boolean>({ type: "prepare", key, texts }).catch(
        () => false,
      );
      this.corpora.set(key, pending);
      if (this.corpora.size > 4) {
        const oldest = this.corpora.keys().next().value!;
        this.corpora.delete(oldest);
        this.worker?.postMessage({ type: "release", key: oldest });
      }
    }
    return pending;
  }
  reset() {
    this.corpora.clear();
    this.worker?.postMessage({ type: "reset" });
  }
  cancel(consumer: string) {
    this.worker?.postMessage({ type: "cancel", consumer });
  }
  async search(key: string, query: string, texts: string[], consumer: string) {
    // Registration precedes search on the same port; preparation remains interruptible.
    void this.prepare(key, texts);
    const values = await this.request<number[] | undefined>({
      type: "search",
      key,
      query,
      consumer,
    }).catch(() => undefined);
    return values && new Map(texts.map((text, i) => [text, values[i]]));
  }
  async compare(query: string, texts: string[]): Promise<SemanticComparison> {
    const similarities = await this.request<number[]>({
      type: "compare",
      query,
      texts,
    });
    return { model: embeddingModel.id, precision: "fp32", similarities };
  }
}
