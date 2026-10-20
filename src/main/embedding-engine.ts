import { embeddingDot } from "../shared/embeddings";

interface Corpus {
  texts: string[];
  // #124: stable row slots keep unchanged vectors in their original allocation.
  rows: Map<string, number>;
  blocks: Float32Array[];
  free: number[];
  nextRow: number;
  stored: Set<string>;
  retired: Map<string, Float32Array>;
  pending: string[];
  generation: number;
  dimensions: number;
  offset: number;
  ready: boolean;
  failed: boolean;
  promise: Promise<boolean>;
  finish(ready: boolean): void;
}
const rowsPerBlock = 1024;
const undoVectors = 4096;

function vectorRow(corpus: Corpus, row: number) {
  const block = Math.floor(row / rowsPerBlock);
  corpus.blocks[block] ??= new Float32Array(rowsPerBlock * corpus.dimensions);
  const offset = (row % rowsPerBlock) * corpus.dimensions;
  return corpus.blocks[block].subarray(offset, offset + corpus.dimensions);
}
function retire(corpus: Corpus, text: string, vector: Float32Array) {
  corpus.retired.delete(text);
  corpus.retired.set(text, vector.slice());
  if (corpus.retired.size > undoVectors)
    corpus.retired.delete(corpus.retired.keys().next().value!);
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
    if (
      old &&
      (old.texts === texts ||
        (old.texts.length === texts.length &&
          texts.every((text, i) => old.texts[i] === text)))
    )
      return old.promise;
    old?.finish(false);
    for (const search of this.searches.values())
      if (search.key === key) this.cancel(search.consumer);
    let finish!: (ready: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const corpus: Corpus = old ?? {
      texts: [],
      rows: new Map(),
      blocks: [],
      free: [],
      nextRow: 0,
      stored: new Set(),
      retired: new Map(),
      pending: [],
      generation: 0,
      dimensions: 0,
      offset: 0,
      ready: false,
      failed: false,
      finish,
      promise,
    };
    corpus.generation++;
    const wanted = new Set(texts);
    for (const [text, row] of corpus.rows) {
      if (wanted.has(text)) continue;
      if (corpus.stored.delete(text))
        retire(corpus, text, vectorRow(corpus, row));
      corpus.rows.delete(text);
      corpus.free.push(row);
    }
    for (const text of wanted) {
      if (corpus.rows.has(text)) continue;
      const row = corpus.free.pop() ?? corpus.nextRow++;
      corpus.rows.set(text, row);
      const cached = corpus.retired.get(text);
      if (cached) {
        vectorRow(corpus, row).set(cached);
        corpus.stored.add(text);
        corpus.retired.delete(text);
      }
    }
    corpus.texts = texts;
    corpus.pending = [...wanted]
      .filter((text) => !corpus.stored.has(text))
      .sort((a, b) => a.length - b.length);
    corpus.offset = 0;
    corpus.ready = !corpus.pending.length;
    corpus.failed = false;
    corpus.finish = finish;
    corpus.promise = promise;
    this.corpora.set(key, corpus);
    if (corpus.ready) finish(true);
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
        const generation = corpus.generation;
        try {
          const [query] = await this.embed([search.query]);
          if (
            this.revisions.get(search.consumer) !== search.revision ||
            this.corpora.get(search.key) !== corpus ||
            corpus.generation !== generation
          ) {
            search.finish();
            continue;
          }
          const scores: number[] = [];
          for (let i = 0; i < corpus.texts.length; i++)
            scores.push(
              embeddingDot(
                query,
                vectorRow(corpus, corpus.rows.get(corpus.texts[i])!),
              ),
            );
          search.finish(scores);
        } catch {
          search.finish();
        }
        continue;
      }
      // Prioritize a waiting search, then finish previously requested scopes.
      const requested = [...this.searches.values()].map((s) =>
        this.corpora.get(s.key),
      );
      const corpus = [...requested, ...this.corpora.values()].find(
        (c) => c && !c.ready && !c.failed,
      );
      if (!corpus) return;
      while (corpus.stored.has(corpus.pending[corpus.offset])) corpus.offset++;
      const generation = corpus.generation;
      const end = Math.min(
        corpus.offset + this.batchSize,
        corpus.pending.length,
      );
      const batch = corpus.pending
        .slice(corpus.offset, end)
        .filter((text) => !corpus.stored.has(text));
      try {
        const vectors = await this.embed(batch);
        if (![...this.corpora.values()].includes(corpus)) continue;
        if (vectors.length !== batch.length)
          throw Error("Incomplete embeddings.");
        for (let i = 0; i < vectors.length; i++) {
          const vector = vectors[i],
            text = batch[i];
          corpus.dimensions ||= vector.length;
          if (!vector.length || vector.length !== corpus.dimensions)
            throw Error("Embedding dimensions changed.");
          const row = corpus.rows.get(text);
          if (row === undefined) retire(corpus, text, vector);
          else if (!corpus.stored.has(text)) {
            vectorRow(corpus, row).set(vector);
            corpus.stored.add(text);
          }
        }
        // An edit can replace the pending list while this batch is in flight.
        if (corpus.generation === generation) corpus.offset = end;
        if (corpus.stored.size === corpus.rows.size) {
          corpus.ready = true;
          corpus.finish(true);
        }
      } catch {
        if (corpus.generation === generation) {
          corpus.failed = true;
          corpus.finish(false);
        }
      }
      // Let incoming cancellation and comparison messages run before another batch.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}
