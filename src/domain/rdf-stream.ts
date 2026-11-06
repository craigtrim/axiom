// craigtrim/axiom#208: input and XML entity handling keep only bounded text chunks.
import { StringDecoder } from "node:string_decoder";
import { SaxesParser } from "saxes";

export type RdfChunks =
  AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>;
const chunkSize = 65536;
const entityBudget = 128 * 1024 * 1024;

function* pieces(text: string) {
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + chunkSize, text.length);
    if (
      end < text.length &&
      text.charCodeAt(end - 1) >= 0xd800 &&
      text.charCodeAt(end - 1) <= 0xdbff
    )
      end--;
    yield text.slice(start, end);
    start = end;
  }
}

export async function* rdfTextChunks(input: RdfChunks) {
  let decoder = new StringDecoder("utf8");
  let surrogate = "";
  function* decoded(text: string, final = false) {
    text = surrogate + text;
    surrogate = "";
    if (!final && /[\ud800-\udbff]$/.test(text)) {
      surrogate = text.slice(-1);
      text = text.slice(0, -1);
    }
    yield* pieces(text);
  }
  for await (const chunk of input) {
    if (typeof chunk === "string") {
      yield* decoded(decoder.end() + chunk);
      decoder = new StringDecoder("utf8");
    } else {
      for (let start = 0; start < chunk.byteLength; start += chunkSize) {
        const part = chunk.subarray(start, start + chunkSize);
        const text = decoder.write(
          Buffer.from(part.buffer, part.byteOffset, part.byteLength),
        );
        if (text) yield* decoded(text);
      }
    }
  }
  yield* decoded(decoder.end(), true);
}

function doctypeEnd(text: string) {
  let quote = "",
    depth = 0;
  for (let index = 9; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      if (end < 0) return;
      index = end + 2;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "[") depth++;
    else if (character === "]") depth--;
    else if (character === ">" && depth === 0) return index + 1;
  }
}

function entityDefinitions(dtd: string) {
  if (/\b(?:SYSTEM|PUBLIC)\b|<!ENTITY\s+%/i.test(dtd))
    throw Error(
      "External XML entities are not loaded. Use a self-contained RDF/XML file.",
    );
  const definitions = new Map(
    [...dtd.matchAll(/<!ENTITY\s+([\w.-]+)\s+["']([^"'<>]*)["']\s*>/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
  if (definitions.size > 100 || dtd.length > chunkSize)
    throw Error("The XML entity declarations exceed supported limits.");
  const resolve = (key: string, seen = new Set<string>()): string => {
    if (seen.has(key) || seen.size > 10)
      throw Error("Circular or deeply nested XML entities are not supported.");
    const value = definitions.get(key);
    if (value === undefined) return "&" + key + ";";
    seen.add(key);
    let size = 0;
    const resolved = value.replace(/&([\w.-]+);/g, (_, child: string) => {
      const next = resolve(child, new Set(seen));
      size += next.length;
      if (size > chunkSize) throw Error("An XML entity is too large.");
      return next;
    });
    if (resolved.length > chunkSize) throw Error("An XML entity is too large.");
    return resolved;
  };
  const cache = new Map<string, string>();
  return (key: string) => {
    if (!definitions.has(key)) return;
    let value = cache.get(key);
    if (value === undefined) {
      value = resolve(key);
      cache.set(key, value);
    }
    return value;
  };
}

/** Remove guarded declarations, expand local entities and validate XML through EOF. */
export async function* rdfXmlChunks(input: AsyncIterable<string>) {
  let pending = "",
    inDoctype = false,
    sawDoctype = false,
    rootSeen = false,
    rootCarry = "",
    literalEnd = "",
    outputSurrogate = "",
    entityCarry = "",
    expandedBytes = 0;
  let entityValue: (key: string) => string | undefined = () => undefined;
  const xml = new SaxesParser({ xmlns: true });
  xml.on("error", (error) => {
    throw Error(`RDF/XML parse failed on line ${xml.line}: ${error.message}`);
  });
  const expand = (text: string, final = false) => {
    text = entityCarry + text;
    entityCarry = "";
    const ampersand = text.lastIndexOf("&");
    if (!final && ampersand >= 0 && /^&[\w.-]*$/.test(text.slice(ampersand))) {
      entityCarry = text.slice(ampersand);
      text = text.slice(0, ampersand);
      if (entityCarry.length > chunkSize)
        throw Error("An XML entity reference is too large.");
    }
    return text.replace(/&([\w.-]+);/g, (original, key: string) => {
      const value = entityValue(key);
      if (value === undefined) return original;
      // Ordinary document bytes do not consume the entity expansion allowance.
      expandedBytes += Buffer.byteLength(value);
      if (expandedBytes > entityBudget)
        throw Error("The XML entity expansion exceeds supported limits.");
      return value;
    });
  };
  const validated = (text: string, final = false) => {
    // Scanner carries can split a pair even when the decoded input did not.
    // Keep every yielded string safe for the parser stream's UTF-8 encoding.
    text = outputSurrogate + text;
    outputSurrogate = "";
    if (!final && /[\ud800-\udbff]$/.test(text)) {
      outputSurrogate = text.slice(-1);
      text = text.slice(0, -1);
    }
    if (text) xml.write(text);
    return text;
  };
  const ordinary = (text: string, final = false) => {
    if (/<[A-Za-z_:]/.test(rootCarry + text)) rootSeen = true;
    if (text) rootCarry = text.slice(-1);
    return validated(expand(text, final));
  };
  for await (const chunk of input) {
    pending += chunk;
    while (pending) {
      if (literalEnd) {
        const end = pending.indexOf(literalEnd);
        const count =
          end < 0
            ? Math.max(0, pending.length - literalEnd.length + 1)
            : end + literalEnd.length;
        const text = validated(pending.slice(0, count));
        if (text) yield text;
        pending = pending.slice(count);
        if (end < 0) break;
        literalEnd = "";
        continue;
      }
      if (!inDoctype) {
        const marker = /<!--|<!\[CDATA\[|<\?|<!DOCTYPE\s/i.exec(pending);
        if (!marker) {
          // Keep a possible declaration marker across the next chunk boundary.
          const end = Math.max(0, pending.length - 9);
          const text = ordinary(pending.slice(0, end));
          if (text) yield text;
          pending = pending.slice(end);
          break;
        }
        const before = ordinary(pending.slice(0, marker.index), true);
        if (before) yield before;
        pending = pending.slice(marker.index);
        if (!/^<!DOCTYPE\s/i.test(marker[0])) {
          // Entity-like text inside comments, CDATA and processing instructions
          // is literal XML and cannot introduce declarations or expansions.
          literalEnd =
            marker[0] === "<!--" ? "-->" : marker[0] === "<?" ? "?>" : "]]>";
          const opening = validated(marker[0]);
          if (opening) yield opening;
          pending = pending.slice(marker[0].length);
          continue;
        }
        if (rootSeen)
          throw Error(
            "RDF/XML parse failed: a document type must precede the root element.",
          );
        inDoctype = true;
      }
      const end = doctypeEnd(pending);
      if ((end ?? pending.length) > chunkSize)
        throw Error("The XML entity declarations exceed supported limits.");
      if (end === undefined) break;
      if (sawDoctype)
        throw Error("Multiple XML document types are not supported.");
      entityValue = entityDefinitions(pending.slice(0, end));
      sawDoctype = true;
      inDoctype = false;
      pending = pending.slice(end);
    }
  }
  if (inDoctype)
    throw Error("RDF/XML parse failed: unfinished XML document type.");
  const tail = validated(literalEnd ? pending : expand(pending, true), true);
  if (tail) yield tail;
  // rdfxml-streaming-parser does not close its SAX parser when its input ends.
  xml.close();
}
