import { lex } from "@traqula/rules-sparql-1-1";
import { parseQuery } from "./query-parser";
const lexer = lex.sparql11LexerBuilder.build();
const clauses = new Set([
  "BASE",
  "PREFIX",
  "SELECT",
  "ASK",
  "CONSTRUCT",
  "DESCRIBE",
  "FROM",
  "WHERE",
  "FILTER",
  "BIND",
  "OPTIONAL",
  "MINUS",
  "GRAPH",
  "SERVICE",
  "VALUES",
  "GROUP",
  "HAVING",
  "ORDER",
  "LIMIT",
  "OFFSET",
]);
function tokenize(text: string) {
  // SPARQL expands UCHAR escapes before lexing. Map token offsets back to the
  // original source so formatting preserves the user's escape spelling.
  let decoded = "";
  const offsets: number[] = [];
  const escapes = /\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}/y;
  for (let i = 0; i < text.length;) {
    escapes.lastIndex = i;
    const match = escapes.exec(text);
    const value = match
      ? String.fromCodePoint(Number.parseInt(match[0].slice(2), 16))
      : text[i];
    for (let j = 0; j < value.length; j++) offsets.push(i);
    decoded += value;
    i += match ? match[0].length : 1;
  }
  offsets.push(text.length);
  const result = lexer.tokenize(decoded);
  if (result.errors.length) throw Error(result.errors[0].message);
  const tokens: { text: string; kind: string }[] = [];
  let end = 0;
  const comments = (gap: string) => {
    for (const match of gap.matchAll(/#[^\r\n]*/g))
      tokens.push({ text: match[0], kind: "comment" });
  };
  for (const t of result.tokens) {
    const start = offsets[t.startOffset],
      stop = offsets[t.startOffset + t.image.length];
    comments(text.slice(end, start));
    tokens.push({ text: text.slice(start, stop), kind: t.tokenType.name });
    end = stop;
  }
  comments(text.slice(end));
  return tokens;
}
function spelling(text: string) {
  return /^[a-z_]+$/i.test(text) &&
    !["a", "true", "false"].includes(text.toLowerCase())
    ? text.toUpperCase()
    : text;
}
function tokenSignature(text: string, includeComments: boolean) {
  return tokenize(text)
    .filter((token) => includeComments || token.kind !== "comment")
    .map((token) => [
      token.kind,
      spelling(token.kind === "comment" ? token.text.trimEnd() : token.text),
    ]);
}
/**
 * Recognize presentation-only edits without rewriting the executed query.
 * Token spelling stays significant for variables, IRIs and literal data.
 * A changed query that cannot be parsed is conservatively considered different.
 */
export function sameQueryContent(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length > 100000 || right.length > 100000) return false;
  try {
    parseQuery(left);
    parseQuery(right);
    return (
      JSON.stringify(tokenSignature(left, false)) ===
      JSON.stringify(tokenSignature(right, false))
    );
  } catch {
    return false;
  }
}
/** Change whitespace and keyword case only, using the complete SPARQL lexer. */
export function formatQuery(text: string, baseIRI?: string): string {
  if (!text.trim()) return text;
  if (text.length > 100000)
    throw Error(
      "The query is too large to format (100,000 characters maximum).",
    );
  parseQuery(text, baseIRI);
  const tokens = tokenize(text),
    lines: string[] = [];
  let line = "",
    indent = 0,
    prefix = false,
    previous = "";
  const flush = () => {
    if (line.trim()) lines.push("  ".repeat(Math.max(0, indent)) + line.trim());
    line = "";
  };
  for (const token of tokens) {
    const word = spelling(token.text);
    if (token.kind === "comment") {
      if (line) line += " ";
      line += word;
      flush();
      continue;
    }
    if (clauses.has(word)) flush();
    if (word === "PREFIX" || word === "BASE") prefix = true;
    if (word === "}") {
      flush();
      indent--;
    }
    const tight =
      word === ")" ||
      word === "]" ||
      word === "," ||
      token.kind === "LangTag" ||
      word === "^^" ||
      previous === "^^" ||
      previous === "(" ||
      previous === "[" ||
      (word === "(" &&
        /^(?:STR|LANG|DATATYPE|BOUND|IRI|URI|BNODE|RAND|ABS|CEIL|FLOOR|ROUND|CONCAT|STRLEN|UCASE|LCASE|ENCODE_FOR_URI|CONTAINS|STRSTARTS|STRENDS|STRBEFORE|STRAFTER|SUBSTR|REGEX|REPLACE|YEAR|MONTH|DAY|HOURS|MINUTES|SECONDS|TIMEZONE|TZ|NOW|UUID|STRUUID|MD5|SHA1|SHA256|SHA384|SHA512|COALESCE|IF|STRLANG|STRDT|SAMETERM|ISIRI|ISURI|ISBLANK|ISLITERAL|ISNUMERIC|COUNT|SUM|MIN|MAX|AVG|SAMPLE|GROUP_CONCAT|ASC|DESC)$/.test(
          previous,
        ));
    line += (line && !tight ? " " : "") + word;
    if (word === "{") {
      flush();
      indent++;
    } else if (word === "." || word === ";") flush();
    else if (prefix && token.kind === "IriRef") {
      flush();
      prefix = false;
    }
    previous = word;
  }
  flush();
  const formatted = lines.join("\n");
  parseQuery(formatted, baseIRI);
  if (
    JSON.stringify(tokenSignature(formatted, true)) !==
    JSON.stringify(tokenSignature(text, true))
  )
    throw Error(
      "Formatting would change the query. The original text was kept.",
    );
  return formatted;
}
