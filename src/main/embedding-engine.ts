import { embeddingDot } from "../shared/embeddings";

interface Corpus {
  texts: string[];
  order: number[];
  matrix: Float32Array;
  dimensions: number;
  offset: number;
  ready: boolean;
  failed: boolean;
  promise: Promise<boolean>;
  finish(ready: boolean): void;
}
interface Search {
  key: string;
  query: string;
  consumer: string;
  revision: number;
  finish(scores?: number[]): void;
}
interface Comparison {
  query: string;
  texts: string[];
  resolve(scores: number[]): void;
  reject(error: Error): void;
}

/** One inference session. Explicit comparisons run between corpus preparation batches. */
export class EmbeddingEngine {
  private corpora = new Map<string, Corpus>();
  private searches = new Map<string, Search>();
  private revisions = new Map<string, number>();
  private comparisons: Comparison[] = [];
  private pumping = false;
  constructor(
    private embed: (texts: string[]) => Promise<Float32Array[]>,
    private batchSize = 16,
  ) {}
  reset() {
    for (const corpus of this.corpora.values()) corpus.finish(false);
    this.corpora.clear();
    for (const consumer of this.revisions.keys()) this.cancel(consumer);
    this.revisions.clear();
  }
  prepare(key: string, texts: string[]): Promise<boolean> {
    const old = this.corpora.get(key);
    if (old) return old.promise;
    let finish!: (ready: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const corpus: Corpus = {
      texts,
      order: texts
        .map((_, i) => i)
        .sort((a, b) => texts[a].length - texts[b].length),
      matrix: new Float32Array(),
      dimensions: 0,
      offset: 0,
      ready: !texts.length,
      failed: false,
      finish,
      promise,
    };
    this.corpora.set(key, corpus);
    if (!texts.length) finish(true);
    this.pump();
    return promise;
  }
  cancel(consumer: string) {
    this.revisions.set(consumer, (this.revisions.get(consumer) ?? 0) + 1);
    this.searches.get(consumer)?.finish();
    this.searches.delete(consumer);
  }
  release(key: string) {
    this.corpora.get(key)?.finish(false);
    this.corpora.delete(key);
    for (const search of this.searches.values())
      if (search.key === key) this.cancel(search.consumer);
  }
  search(
    key: string,
    query: string,
    consumer: string,
  ): Promise<number[] | undefined> {
    this.cancel(consumer);
    if (!this.corpora.has(key)) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      this.searches.set(consumer, {
        key,
        query,
        consumer,
        revision: this.revisions.get(consumer)!,
        finish: resolve,
      });
      this.pump();
    });
  }
  compare(query: string, texts: string[]): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.comparisons.push({ query, texts, resolve, reject });
      this.pump();
    });
  }
  private pump() {
    if (this.pumping) return;
    this.pumping = true;
    void this.run().finally(() => {
      this.pumping = false;
      if (
        this.comparisons.length ||
        this.searches.size ||
        [...this.corpora.values()].some((c) => !c.ready && !c.failed)
      )
        this.pump();
    });
  }
  private async run() {
    while (true) {
      const comparison = this.comparisons.shift();
      if (comparison) {
        try {
          const [query, ...vectors] = await this.embed([
            comparison.query,
            ...comparison.texts,
          ]);
          comparison.resolve(vectors.map((v) => embeddingDot(query, v)));
        } catch (error) {
          comparison.reject(error as Error);
        }
        continue;
      }
      const search = [...this.searches.values()].find((s) => {
        const c = this.corpora.get(s.key);
        return !c || c.ready || c.failed;
      });
      if (search) {
        this.searches.delete(search.consumer);
        const corpus = this.corpora.get(search.key);
        if (!corpus || corpus.failed) {
          search.finish();
          continue;
        }
        try {
          const [query] = await this.embed([search.query]);
          if (
            this.revisions.get(search.consumer) !== search.revision ||
            this.corpora.get(search.key) !== corpus
          ) {
            search.finish();
            continue;
          }
          const scores: number[] = [];
          for (let i = 0; i < corpus.texts.length; i++)
            scores.push(
              embeddingDot(
                query,
                corpus.matrix.subarray(
                  i * corpus.dimensions,
                  (i + 1) * corpus.dimensions,
                ),
              ),
            );
          search.finish(scores);
        } catch {
          search.finish();
        }
        continue;
      }
      // Prepare a requested scope first, then finish speculative warmup.
      const requested = [...this.searches.values()].map((s) =>
        this.corpora.get(s.key),
      );
      const corpus = [...requested, ...this.corpora.values()].find(
        (c) => c && !c.ready && !c.failed,
      );
      if (!corpus) return;
      try {
        const vectors = await this.embed(
          corpus.order
            .slice(corpus.offset, corpus.offset + this.batchSize)
            .map((i) => corpus.texts[i]),
        );
        if (![...this.corpora.values()].includes(corpus)) continue;
        if (!corpus.dimensions) {
          corpus.dimensions = vectors[0].length;
          corpus.matrix = new Float32Array(
            corpus.texts.length * corpus.dimensions,
          );
        }
        for (const vector of vectors) {
          if (vector.length !== corpus.dimensions)
            throw Error("Embedding dimensions changed.");
          corpus.matrix.set(
            vector,
            corpus.order[corpus.offset++] * corpus.dimensions,
          );
        }
        if (corpus.offset === corpus.texts.length) {
          corpus.ready = true;
          corpus.finish(true);
        }
      } catch {
        corpus.failed = true;
        corpus.finish(false);
      }
      // Let incoming cancellation and comparison messages run before another batch.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}
