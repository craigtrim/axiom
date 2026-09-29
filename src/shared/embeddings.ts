export const embeddingModel = {
  id: "sentence-transformers/all-mpnet-base-v2",
  source: "Xenova/all-mpnet-base-v2",
  revision: "e086c5e0b3a57b0ce46dd6d9c0662948860b35f3",
  precision: "fp32",
  dimensions: 768,
  weightsBytes: 435826547,
  weightsSha256:
    "a488b290590d86da3b81c502b242343ca8312e83cfc618b2cd1ae50c09d8f669",
} as const;

// Preserve punctuation and word order. Case does not distinguish synonyms.
export const embeddingText = (text: string) =>
  text.normalize("NFC").trim().toLowerCase();
export type SemanticScores = ReadonlyMap<string, number>;
export type SemanticScorer = (
  query: string,
  texts: string[],
) => Promise<SemanticScores>;
export interface SemanticComparison {
  model: string;
  precision: "fp32";
  similarities: number[];
}
/** Cosine similarity of normalized dense embeddings. */
export function embeddingCosine(a: Float32Array, b: Float32Array) {
  if (a.length !== b.length || !a.length)
    throw Error("Embedding dimensions differ.");
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (!aa || !bb) throw Error("Empty embedding vector.");
  return Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb)));
}
