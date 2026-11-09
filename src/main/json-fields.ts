// craigtrim/axiom#223: replace view fields while retaining immutable ontology bytes.
import { encodeJson, type JsonChunks } from "./json-io";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

interface Position {
  chunk: number;
  offset: number;
}

const CHUNK_SIZE = 64 * 1024;
const invalid = () => SyntaxError("Expected one JSON object.");

function freezeChunks(source: Iterable<string>): JsonChunks {
  const chunks: string[] = [];
  for (const text of source) {
    for (let start = 0; start < text.length;) {
      let end = Math.min(text.length, start + CHUNK_SIZE);
      if (
        end < text.length &&
        text.charCodeAt(end - 1) >= 0xd800 &&
        text.charCodeAt(end - 1) <= 0xdbff &&
        text.charCodeAt(end) >= 0xdc00 &&
        text.charCodeAt(end) <= 0xdfff
      )
        end--;
      let piece = text.slice(start, end);
      const previous = chunks.at(-1);
      if (
        previous &&
        previous.charCodeAt(previous.length - 1) >= 0xd800 &&
        previous.charCodeAt(previous.length - 1) <= 0xdbff &&
        piece.charCodeAt(0) >= 0xdc00 &&
        piece.charCodeAt(0) <= 0xdfff
      ) {
        chunks.pop();
        if (previous.length > 1) chunks.push(previous.slice(0, -1));
        chunks.push(previous.slice(-1) + piece[0]);
        piece = piece.slice(1);
      }
      if (piece) chunks.push(piece);
      start = end;
    }
  }
  return Object.freeze(chunks);
}

class Cursor {
  private chunk = 0;
  private offset = 0;
  private visited = 0;
  constructor(private readonly chunks: JsonChunks) {}
  peek(): string | undefined {
    while (
      this.chunk < this.chunks.length &&
      this.offset >= this.chunks[this.chunk].length
    ) {
      this.chunk++;
      this.offset = 0;
    }
    return this.chunks[this.chunk]?.[this.offset];
  }
  next() {
    const value = this.peek();
    if (value !== undefined) this.offset++;
    return value;
  }
  position(): Position {
    this.peek();
    return { chunk: this.chunk, offset: this.offset };
  }
  slice(start: Position, end: Position): JsonChunks {
    const parts: string[] = [];
    for (let chunk = start.chunk; chunk <= end.chunk; chunk++) {
      if (chunk >= this.chunks.length) break;
      const text = this.chunks[chunk];
      parts.push(
        text.slice(
          chunk === start.chunk ? start.offset : 0,
          chunk === end.chunk ? end.offset : text.length,
        ),
      );
    }
    return freezeChunks(parts);
  }
  *whitespace(): Generator<void> {
    const boundary = /[^ \t\n\r]/g;
    while (this.peek() !== undefined) {
      boundary.lastIndex = this.offset;
      const match = boundary.exec(this.chunks[this.chunk]);
      if (match) {
        this.offset = match.index;
        return;
      }
      this.chunk++;
      this.offset = 0;
      yield;
    }
  }
  expect(char: string) {
    if (this.next() !== char) throw invalid();
  }
  *string(): Generator<void> {
    this.expect('"');
    const boundary = /["\\\x00-\x1f]/g;
    let escapes = 0;
    for (;;) {
      if (this.peek() === undefined) throw invalid();
      boundary.lastIndex = this.offset;
      const text = this.chunks[this.chunk];
      const match = boundary.exec(text);
      if (!match) {
        this.chunk++;
        this.offset = 0;
        yield;
        continue;
      }
      this.offset = match.index + 1;
      const char = match[0];
      if (char.charCodeAt(0) < 0x20) throw invalid();
      if (char === '"') return;
      const escape = this.next();
      if (escape === "u") {
        for (let index = 0; index < 4; index++)
          if (!/^[0-9a-f]$/i.test(this.next() ?? "")) throw invalid();
      } else if (
        !['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escape ?? "")
      )
        throw invalid();
      if (++escapes % 256 === 0) yield;
    }
  }
  private *digits(): Generator<void> {
    let visited = 0;
    while (/^[0-9]$/.test(this.peek() ?? "")) {
      this.next();
      if (++visited % 256 === 0) yield;
    }
  }
  *value(): Generator<void> {
    if (++this.visited % 256 === 0) yield;
    yield* this.whitespace();
    const first = this.peek();
    if (first === '"') {
      yield* this.string();
    } else if (first === "{" || first === "[") {
      const object = this.next() === "{";
      const closing = object ? "}" : "]";
      yield* this.whitespace();
      if (this.peek() === closing) {
        this.next();
        return;
      }
      for (;;) {
        if (object) {
          yield* this.string();
          yield* this.whitespace();
          this.expect(":");
        }
        yield* this.value();
        yield* this.whitespace();
        if (this.peek() === closing) {
          this.next();
          return;
        }
        this.expect(",");
        yield* this.whitespace();
      }
    } else if (first === "t" || first === "f" || first === "n") {
      const literal = first === "t" ? "true" : first === "f" ? "false" : "null";
      for (const char of literal) this.expect(char);
    } else {
      if (this.peek() === "-") this.next();
      if (this.peek() === "0") this.next();
      else {
        if (!/^[1-9]$/.test(this.next() ?? "")) throw invalid();
        yield* this.digits();
      }
      if (this.peek() === ".") {
        this.next();
        if (!/^[0-9]$/.test(this.next() ?? "")) throw invalid();
        yield* this.digits();
      }
      if (this.peek() === "e" || this.peek() === "E") {
        this.next();
        if (this.peek() === "+" || this.peek() === "-") this.next();
        if (!/^[0-9]$/.test(this.next() ?? "")) throw invalid();
        yield* this.digits();
      }
    }
  }
}

export interface CapturedJsonObject {
  field(name: string): JsonChunks | undefined;
  replace(fields: Record<string, unknown>): JsonChunks;
}

function* readFields(
  source: JsonChunks,
): Generator<void, Map<string, JsonChunks>> {
  const cursor = new Cursor(freezeChunks(source));
  const fields = new Map<string, JsonChunks>();
  yield* cursor.whitespace();
  cursor.expect("{");
  yield* cursor.whitespace();
  if (cursor.peek() !== "}") {
    for (;;) {
      const keyStart = cursor.position();
      yield* cursor.string();
      const name = JSON.parse(
        cursor.slice(keyStart, cursor.position()).join(""),
      ) as string;
      yield* cursor.whitespace();
      cursor.expect(":");
      yield* cursor.whitespace();
      const start = cursor.position();
      yield* cursor.value();
      fields.set(name, cursor.slice(start, cursor.position()));
      yield* cursor.whitespace();
      if (cursor.peek() === "}") break;
      cursor.expect(",");
      yield* cursor.whitespace();
    }
  }
  cursor.expect("}");
  yield* cursor.whitespace();
  if (cursor.peek() !== undefined) throw invalid();
  return fields;
}

function capturedObject(fields: Map<string, JsonChunks>): CapturedJsonObject {
  return Object.freeze({
    field: (name: string) => fields.get(name),
    replace(replacements: Record<string, unknown>): JsonChunks {
      const next = new Map(fields);
      for (const [name, value] of Object.entries(replacements)) {
        if (value === undefined) next.delete(name);
        else next.set(name, encodeJson(value));
      }
      const chunks: string[] = ["{"];
      let first = true;
      for (const [name, value] of next) {
        if (!first) chunks.push(",");
        first = false;
        for (const chunk of encodeJson(name)) chunks.push(chunk);
        chunks.push(":");
        for (const chunk of value) chunks.push(chunk);
      }
      chunks.push("}");
      return freezeChunks(chunks);
    },
  });
}

/** Index a valid object once; subsequent metadata saves only encode replacements. */
export function captureJsonObject(source: JsonChunks): CapturedJsonObject {
  const scan = readFields(source);
  let step = scan.next();
  while (!step.done) step = scan.next();
  return capturedObject(step.value);
}

/** Large saved workspaces yield while their raw field boundaries are indexed. */
export async function captureJsonObjectAsync(
  source: JsonChunks,
): Promise<CapturedJsonObject> {
  const scan = readFields(source);
  let step = scan.next();
  while (!step.done) {
    await yieldToEventLoop();
    step = scan.next();
  }
  return capturedObject(step.value);
}

export function replaceJsonFields(
  chunks: JsonChunks,
  fields: Record<string, unknown>,
): JsonChunks {
  return captureJsonObject(chunks).replace(fields);
}

export function extractJsonField(chunks: JsonChunks, key: string) {
  return captureJsonObject(chunks).field(key);
}

export async function replaceJsonFieldsAsync(
  chunks: JsonChunks,
  fields: Record<string, unknown>,
): Promise<JsonChunks> {
  return (await captureJsonObjectAsync(chunks)).replace(fields);
}

export async function extractJsonFieldAsync(chunks: JsonChunks, key: string) {
  return (await captureJsonObjectAsync(chunks)).field(key);
}
