import type { TextEntity } from "../shared/text-analysis";
// craigtrim/axiom#40: Mutatoc 0.4.0 reports x/y as code point offsets into the
// unchanged input, so highlights come from the engine rather than a replay of
// its tokenizer.
export interface MutatocToken {
  text: string;
  x: number;
  y: number;
  ner?: string | null;
  swaps?: { canon: string; type: string; tokens: MutatocToken[] };
}
/** Convert each top-level match's code point x/y to UTF-16 offsets into the
 * editor text. A match whose range does not slice exactly its own text is
 * rejected rather than highlighted somewhere it was not found.
 */
export function textEntities(
  text: string,
  tokens: MutatocToken[],
): TextEntity[] {
  const offsets = [0];
  for (const ch of text) offsets.push(offsets.at(-1)! + ch.length);
  const entities: TextEntity[] = [];
  for (const token of tokens) {
    if (!token.swaps) continue;
    const start = offsets[token.x],
      end = offsets[token.y];
    if (
      !Number.isInteger(token.x) ||
      !Number.isInteger(token.y) ||
      start === undefined ||
      end === undefined ||
      start >= end ||
      text.slice(start, end) !== token.text
    )
      throw Error(
        "The parser changed text that could not be mapped to the original. Highlights have been cleared to avoid marking the wrong words.",
      );
    const label = token.swaps.canon;
    entities.push({
      start,
      end,
      key: "ontology:" + label,
      label,
      source: "ontology",
      method: token.swaps.type,
    });
  }
  return entities.sort((a, b) => a.start - b.start || b.end - a.end);
}
