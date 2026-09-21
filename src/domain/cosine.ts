/** Local text features and normalized TF-IDF vectors, independent of Find or RDF. */
export function normalizeSearchText(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function features(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const word of normalizeSearchText(text).split(" ").filter(Boolean)) {
    add("w:" + word);
    const letters = ["^", ...word, "$"];
    for (let i = 0; i + 2 < letters.length; i++)
      add("c:" + letters.slice(i, i + 3).join(""));
  }
  return counts;
}
export class CosineTextIndex {
  private postings = new Map<string, [number, number][]>();
  private idf = new Map<string, number>();
  private unseen: number;
  constructor(texts: readonly string[]) {
    const vectors = texts.map(features);
    const frequency = new Map<string, number>();
    for (const vector of vectors)
      for (const key of vector.keys())
        frequency.set(key, (frequency.get(key) ?? 0) + 1);
    this.unseen = Math.log(1 + texts.length) + 1;
    for (const [key, count] of frequency)
      this.idf.set(key, Math.log((1 + texts.length) / (1 + count)) + 1);
    vectors.forEach((vector, id) => {
      for (const [key, value] of this.unit(vector)) {
        const posting = this.postings.get(key) ?? [];
        posting.push([id, value]);
        this.postings.set(key, posting);
      }
    });
  }
  private unit(counts: Map<string, number>) {
    let norm = 0;
    for (const [key, count] of counts) {
      const weight = (1 + Math.log(count)) * (this.idf.get(key) ?? this.unseen);
      counts.set(key, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm);
    if (norm)
      for (const [key, weight] of counts) counts.set(key, weight / norm);
    return counts;
  }
  /** Only shared-feature postings are visited; zero-overlap documents are omitted. */
  search(text: string): Map<number, number> {
    const scores = new Map<number, number>();
    for (const [key, weight] of this.unit(features(text))) {
      for (const [id, value] of this.postings.get(key) ?? [])
        scores.set(id, (scores.get(id) ?? 0) + weight * value);
    }
    for (const [id, score] of scores)
      scores.set(id, Math.min(1, Math.max(0, score)));
    return scores;
  }
}
