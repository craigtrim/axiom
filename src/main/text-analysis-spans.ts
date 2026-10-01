import type { TextEntity } from "../shared/text-analysis";
import substitutions from "./data/mutatoc-tokenizer.json";
export interface MutatocToken {
  text: string;
  ent?: string;
  ner?: string | null;
  swaps?: { canon: string; type: string; tokens: MutatocToken[] };
}
export interface TokenizerSubstitutions {
  contractions: Record<string, string[]>;
  abbreviations: Record<string, string>;
}
interface Glyph {
  ch: string;
  start: number;
  end: number;
}
const visible = (ch: string) => !/\s/u.test(ch);
const quote = (ch: string) => (ch === "'" ? '"' : ch);
/** Reconstruct only the source provenance of literal tokenizer substitutions.
 * The substitution data is pinned to the native tokenizer version. The engine
 * makes all tokenization and matching decisions; this only maps their history.
 * Offsets are UTF-16 offsets into the untouched editor text, never C x/y values.
 */
function sourceGlyphs(
  text: string,
  dictionaries: TokenizerSubstitutions,
): Glyph[] {
  const result: Glyph[] = [];
  const chunks = text.match(/[^ ]* |[^ ]+$/gu) ?? [];
  let offset = 0;
  for (const chunk of chunks) {
    const expansion = Object.hasOwn(dictionaries.contractions, chunk)
      ? dictionaries.contractions[chunk]
      : undefined;
    const words = expansion ?? [chunk];
    for (const word of words) {
      let glyphs: Glyph[] = [];
      let at = offset;
      for (const ch of word) {
        glyphs.push({
          ch,
          start: expansion ? offset : at,
          end: expansion ? offset + chunk.length : at + ch.length,
        });
        at += ch.length;
      }
      // Native tokenization preserves punctuation and only expands dictionary
      // abbreviations when the original word has fewer than two periods.
      const abbreviation =
        (word.match(/\./g) ?? []).length < 2 &&
        Object.hasOwn(dictionaries.abbreviations, word)
          ? dictionaries.abbreviations[word]
          : undefined;
      if (abbreviation !== undefined)
        glyphs = Array.from(abbreviation, (ch) => ({
          ch,
          start: offset,
          end: offset + chunk.length,
        }));
      for (const glyph of glyphs) if (visible(glyph.ch)) result.push(glyph);
    }
    offset += chunk.length;
  }
  return result;
}
export function textEntities(
  text: string,
  tokens: MutatocToken[],
  dictionaries: TokenizerSubstitutions = substitutions,
): TextEntity[] {
  const glyphs = sourceGlyphs(text, dictionaries);
  let position = 0;
  const spans = new Map<MutatocToken, { start: number; end: number }>();
  const visit = (token: MutatocToken, depth = 0): void => {
    if (depth > 100)
      throw Error("Text Analysis returned excessively nested matches.");
    if (token.swaps) {
      for (const child of token.swaps.tokens) visit(child, depth + 1);
      const children = token.swaps.tokens
        .map((t) => spans.get(t))
        .filter((s) => !!s);
      if (children.length)
        spans.set(token, {
          start: children[0]!.start,
          end: children.at(-1)!.end,
        });
      return;
    }
    let start: number | undefined,
      end = 0;
    for (const ch of token.text) {
      if (!visible(ch)) continue;
      const glyph = glyphs[position++];
      if (!glyph || quote(glyph.ch) !== quote(ch))
        throw Error(
          "The parser changed text that could not be mapped to the original. Highlights have been cleared to avoid marking the wrong words.",
        );
      start ??= glyph.start;
      end = glyph.end;
    }
    if (start !== undefined) spans.set(token, { start, end });
  };
  tokens.forEach((t) => visit(t));
  if (position !== glyphs.length)
    throw Error(
      "The parser did not preserve all source positions. Highlights have been cleared.",
    );
  const entities: TextEntity[] = [];
  for (const token of tokens) {
    const span = spans.get(token);
    if (!token.swaps || !span) continue;
    const label = token.swaps.canon;
    entities.push({
      ...span,
      key: "ontology:" + label,
      label,
      source: "ontology",
      method: token.swaps.type,
    });
  }
  return entities.sort((a, b) => a.start - b.start || b.end - a.end);
}
