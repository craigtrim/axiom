import dictionary from "./title-case-acronyms.json";

const acronyms = new Map(
  dictionary.acronyms.map((entry) => [entry.toUpperCase(), entry]),
);
const functionWords = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
]);

/** Seed a selected phrase once; user edits and Find drafts keep their spelling. */
export function selectedEntityName(phrase: string): string {
  const text = phrase.replace(/\s+/gu, " ").trim();
  // Keep internal ampersands/apostrophes together; surrounding punctuation and
  // hyphens separate words without being rewritten or counted as title words.
  const wordPattern = /[\p{L}\p{N}\p{M}]+(?:[&'’][\p{L}\p{N}\p{M}]+)*/gu;
  const words = [...text.matchAll(wordPattern)];
  let index = 0;
  return text.replace(wordPattern, (word) => {
    const position = index++;
    const upper = word.toUpperCase();
    const canonical = acronyms.get(upper);
    if (canonical) return canonical;
    const lower = word.toLowerCase();
    if (word !== upper && word !== lower) return word;
    if (position > 0 && position < words.length - 1 && functionWords.has(lower))
      return lower;
    return lower.replace(/\p{L}/u, (letter) => letter.toUpperCase());
  });
}
