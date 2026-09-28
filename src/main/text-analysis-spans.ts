import type { TextEntity } from "../shared/text-analysis";
export interface MutatocToken {
  text: string;
  ent?: string;
  ner?: string | null;
  swaps?: { canon: string; type: string; tokens: MutatocToken[] };
}
export interface TokenDictionaries {
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
 * The dictionaries and all linguistic decisions come from the native engine.
 * Offsets are UTF-16 offsets into the untouched editor text, never C x/y values.
 */
function sourceGlyphs(text: string, dictionaries: TokenDictionaries): Glyph[] {
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
          ? dictionaries.abbreviations[word].replace(/~~/g, ".")
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
const entityNames: Record<string, string> = {
  PERSON: "Person",
  ORG: "Organization",
  GPE: "Place",
  LOC: "Location",
  NORP: "Group",
  FAC: "Facility",
  PRODUCT: "Product",
  EVENT: "Event",
  WORK_OF_ART: "Work of art",
  LAW: "Law",
  LANGUAGE: "Language",
  DATE: "Date",
  TIME: "Time",
  PERCENT: "Percentage",
  MONEY: "Money",
  QUANTITY: "Quantity",
  ORDINAL: "Ordinal",
  CARDINAL: "Number",
};
export function textEntities(
  text: string,
  tokens: MutatocToken[],
  dictionaries: TokenDictionaries,
): TextEntity[] {
  const glyphs = sourceGlyphs(text, dictionaries);
  let position = 0;
  const spans = new Map<MutatocToken, { start: number; end: number }>();
  const leaves: MutatocToken[] = [];
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
    leaves.push(token);
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
  const ontology = [...entities];
  let ontologyIndex = 0;
  let group: TextEntity | undefined;
  for (const token of leaves) {
    const span = spans.get(token);
    if (!span) continue;
    while (
      ontologyIndex < ontology.length &&
      ontology[ontologyIndex].end <= span.start
    )
      ontologyIndex++;
    if (
      !token.ent ||
      (ontology[ontologyIndex] &&
        span.start < ontology[ontologyIndex].end &&
        span.end > ontology[ontologyIndex].start)
    ) {
      group = undefined;
      continue;
    }
    const key = "model:" + token.ent;
    if (group?.key === key && /^\s*$/u.test(text.slice(group.end, span.start)))
      group.end = span.end;
    else {
      group = {
        ...span,
        key,
        label: entityNames[token.ent] ?? token.ent,
        source: "model",
        method: "named entity",
      };
      entities.push(group);
    }
  }
  return entities.sort((a, b) => a.start - b.start || b.end - a.end);
}
