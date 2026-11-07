// craigtrim/axiom#208: documents cross disk in bounded chunks, never one JSON string.
// craigtrim/axiom#218: checkpoints yield between bounded encoding steps so reads can run.
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { parser } from "stream-json/parser.js";
import Assembler from "stream-json/assembler.js";

export type JsonChunks = readonly string[];

/** Capture synchronously before later edits can change the document. */
export function encodeJson(value: unknown, chunkSize = 64 * 1024): JsonChunks {
  const chunks: string[] = [];
  for (const chunk of encodeJsonChunks(value, chunkSize))
    if (chunk !== undefined) chunks.push(chunk);
  return Object.freeze(chunks);
}

/** The caller must keep the source stable until the returned snapshot completes. */
export async function encodeJsonAsync(
  value: unknown,
  chunkSize = 64 * 1024,
): Promise<JsonChunks> {
  const chunks: string[] = [];
  for (const chunk of encodeJsonChunks(value, chunkSize)) {
    if (chunk !== undefined) chunks.push(chunk);
    await yieldToEventLoop();
  }
  return Object.freeze(chunks);
}

function* encodeJsonChunks(
  value: unknown,
  chunkSize: number,
): Generator<string | undefined> {
  if (!Number.isInteger(chunkSize) || chunkSize < 8)
    throw Error("Invalid JSON chunk size.");
  let pending = "";
  let visited = 0;
  const ancestors = new Set<object>();
  function* append(text: string): Generator<string> {
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
        yield pending;
        pending = "";
        continue;
      }
      pending += text.slice(start, end);
      start = end;
      if (pending.length === chunkSize) {
        yield pending;
        pending = "";
      }
    }
  }
  function* quoted(text: string): Generator<string> {
    yield* append('"');
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
      yield* append(JSON.stringify(text.slice(start, end)).slice(1, -1));
      start = end;
    }
    yield* append('"');
  }
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
  function* visit(item: unknown): Generator<string | undefined> {
    // Omitted properties and tiny values must not hide unbounded work from the
    // asynchronous driver simply because they have not filled a chunk yet.
    if (++visited % 256 === 0) yield undefined;
    if (item === null || omitted(item)) {
      yield* append("null");
    } else if (typeof item === "string") {
      yield* quoted(item);
    } else if (typeof item === "number" || typeof item === "boolean") {
      yield* append(JSON.stringify(item));
    } else if (typeof item === "bigint") {
      throw TypeError("Cannot serialize a BigInt as JSON.");
    } else {
      const object = item as Record<string, unknown>;
      if (ancestors.has(object)) throw TypeError("Circular JSON document.");
      ancestors.add(object);
      if (Array.isArray(object)) {
        yield* append("[");
        const length = object.length;
        for (let i = 0; i < length; i++) {
          if (i) yield* append(",");
          yield* visit(prepare(object[i], String(i)));
        }
        yield* append("]");
      } else {
        yield* append("{");
        let first = true;
        for (const key of Object.keys(object)) {
          if (++visited % 256 === 0) yield undefined;
          const child = prepare(object[key], key);
          if (omitted(child)) continue;
          if (!first) yield* append(",");
          first = false;
          yield* quoted(key);
          yield* append(":");
          yield* visit(child);
        }
        yield* append("}");
      }
      ancestors.delete(object);
    }
  }
  const document = prepare(value, "");
  if (omitted(document)) throw TypeError("A JSON document is required.");
  yield* visit(document);
  if (pending) yield pending;
}

export async function readJsonFile(
  file: string,
  options: { onChunk?: (chunk: string) => void } = {},
): Promise<unknown> {
  const input = createReadStream(file, { encoding: "utf8" });
  if (options.onChunk)
    input.on("data", (chunk: string | Buffer) =>
      options.onChunk!(
        typeof chunk === "string" ? chunk : chunk.toString("utf8"),
      ),
    );
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
  input.once("data", (chunk: string | Buffer) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    // JSON.parse rejected BOM-prefixed workspace/session documents as well.
    if (text.charCodeAt(0) === 0xfeff)
      input.destroy(SyntaxError("Unexpected byte-order mark in JSON."));
  });
  await pipeline(
    input,
    parser.asStream({
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
