// craigtrim/axiom#208: documents cross disk in bounded chunks, never one JSON string.
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parser } from "stream-json/parser.js";
import Assembler from "stream-json/assembler.js";

export type JsonChunks = readonly string[];

/** Capture before yielding so edits cannot change an in-flight checkpoint. */
export function encodeJson(value: unknown, chunkSize = 64 * 1024): JsonChunks {
  if (!Number.isInteger(chunkSize) || chunkSize < 8)
    throw Error("Invalid JSON chunk size.");
  const chunks: string[] = [];
  let pending = "";
  const ancestors = new Set<object>();
  const append = (text: string) => {
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + chunkSize - pending.length);
      // A file writer encodes each chunk separately. Keep UTF-16 pairs together.
      if (
        end < text.length &&
        text.charCodeAt(end - 1) >= 0xd800 &&
        text.charCodeAt(end - 1) <= 0xdbff &&
        text.charCodeAt(end) >= 0xdc00 &&
        text.charCodeAt(end) <= 0xdfff
      )
        end--;
      if (end === start) {
        chunks.push(pending);
        pending = "";
        continue;
      }
      pending += text.slice(start, end);
      start = end;
      if (pending.length === chunkSize) {
        chunks.push(pending);
        pending = "";
      }
    }
  };
  const quoted = (text: string) => {
    append('"');
    for (let start = 0; start < text.length;) {
      let end = Math.min(text.length, start + chunkSize);
      if (
        end < text.length &&
        text.charCodeAt(end - 1) >= 0xd800 &&
        text.charCodeAt(end - 1) <= 0xdbff &&
        text.charCodeAt(end) >= 0xdc00 &&
        text.charCodeAt(end) <= 0xdfff
      )
        end--;
      append(JSON.stringify(text.slice(start, end)).slice(1, -1));
      start = end;
    }
    append('"');
  };
  const prepare = (item: unknown, key: string): unknown => {
    if (item && typeof item === "object" && "toJSON" in item) {
      const toJSON = (item as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === "function") return toJSON.call(item, key);
    }
    return item;
  };
  const omitted = (item: unknown) =>
    item === undefined ||
    typeof item === "function" ||
    typeof item === "symbol";
  const visit = (item: unknown) => {
    if (item === null || omitted(item)) {
      append("null");
    } else if (typeof item === "string") {
      quoted(item);
    } else if (typeof item === "number" || typeof item === "boolean") {
      append(JSON.stringify(item));
    } else if (typeof item === "bigint") {
      throw TypeError("Cannot serialize a BigInt as JSON.");
    } else {
      const object = item as Record<string, unknown>;
      if (ancestors.has(object)) throw TypeError("Circular JSON document.");
      ancestors.add(object);
      if (Array.isArray(object)) {
        append("[");
        const length = object.length;
        for (let i = 0; i < length; i++) {
          if (i) append(",");
          visit(prepare(object[i], String(i)));
        }
        append("]");
      } else {
        append("{");
        let first = true;
        for (const key of Object.keys(object)) {
          const child = prepare(object[key], key);
          if (omitted(child)) continue;
          if (!first) append(",");
          first = false;
          quoted(key);
          append(":");
          visit(child);
        }
        append("}");
      }
      ancestors.delete(object);
    }
  };
  const document = prepare(value, "");
  if (omitted(document)) throw TypeError("A JSON document is required.");
  visit(document);
  if (pending) chunks.push(pending);
  return Object.freeze(chunks);
}

export async function readJsonFile(
  file: string,
  options: { onChunk?: (chunk: string) => void } = {},
): Promise<unknown> {
  const input = createReadStream(file, { encoding: "utf8" });
  if (options.onChunk) input.on("data", options.onChunk);
  return readJsonSource(input);
}

/** Large IPC packets use the same bounded JSON representation as disk files. */
export function readJsonChunks(
  chunks: Iterable<string> | AsyncIterable<string>,
): Promise<unknown> {
  return readJsonSource(
    Readable.from(chunks, { objectMode: false, encoding: "utf8" }),
  );
}

async function readJsonSource(input: Readable): Promise<unknown> {
  const assembler = new Assembler();
  let roots = 0;
  await pipeline(
    input,
    parser.asStream({
      ignoreBOM: true,
      streamKeys: false,
      streamStrings: false,
      streamNumbers: false,
    }),
    new Writable({
      objectMode: true,
      write(token, _encoding, callback) {
        try {
          assembler.consume(token);
          if (assembler.done) roots++;
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
    }),
  );
  if (roots !== 1 || !assembler.done)
    throw SyntaxError("Expected one complete JSON document.");
  return assembler.current;
}

export async function writeJsonFile(
  file: string,
  chunks: Iterable<string> | AsyncIterable<string>,
): Promise<void> {
  await writeFile(file, chunks, "utf8");
}
