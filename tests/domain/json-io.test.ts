// craigtrim/axiom#208: chunking preserves JSON bytes, snapshots and strict parsing.
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  encodeJson,
  readJsonFile,
  writeJsonFile,
} from "../../src/main/json-io";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function file() {
  const directory = await mkdtemp(path.join(tmpdir(), "axiom-json-"));
  directories.push(directory);
  return path.join(directory, "document.json");
}

it("matches JSON encoding across escaped characters and UTF-16 boundaries", async () => {
  const value = {
    text: 'a"\n\t\\\u0000\uD83D\uDE00\uD800\uDC00\uD800\uDC00\uD800x\uDC00'.repeat(
      100,
    ),
    omitted: undefined,
    array: [undefined, , NaN, Infinity, -0, true, null],
    date: new Date("2026-11-06T00:00:00Z"),
    nested: { constructor: "own value", toString: "own value" },
  };
  for (const size of [8, 9, 16, 31, 64]) {
    const chunks = encodeJson(value, size);
    expect(chunks.every((chunk) => chunk.length <= size)).toBe(true);
    expect(chunks.join("")).toBe(JSON.stringify(value));
    const destination = await file();
    await writeJsonFile(destination, chunks);
    expect(await readFile(destination, "utf8")).toBe(JSON.stringify(value));
    expect(await readJsonFile(destination)).toEqual(
      JSON.parse(JSON.stringify(value)),
    );
  }
});

it("captures an immutable checkpoint before later edits", async () => {
  const value = { rows: [{ name: "Original", children: ["one"] }] };
  const chunks = encodeJson(value, 8);
  value.rows[0].name = "Changed";
  value.rows[0].children.push("two");
  const destination = await file();
  await writeJsonFile(destination, chunks);
  expect(await readJsonFile(destination)).toEqual({
    rows: [{ name: "Original", children: ["one"] }],
  });
  expect(Object.isFrozen(chunks)).toBe(true);
});

it("rejects cycles and BigInt before returning a partial snapshot", () => {
  const cyclic: any = {};
  cyclic.self = cyclic;
  expect(() => encodeJson(cyclic)).toThrow(/Circular/);
  expect(() => encodeJson({ number: 1n })).toThrow(/BigInt/);
  expect(encodeJson({ a: { n: 1 }, b: { n: 1 } }).join("")).toBe(
    '{"a":{"n":1},"b":{"n":1}}',
  );
});

it.each([
  "",
  "{",
  '{"x":1,}',
  "[1,]",
  "{} {}",
  "true false",
  '{"x":"unfinished',
  "[1e]",
  '{"x":NaN}',
  '"a" junk',
])("rejects incomplete or malformed JSON: %s", async (text) => {
  const destination = await file();
  await writeFile(destination, text);
  await expect(readJsonFile(destination)).rejects.toThrow();
});

it("keeps duplicate-key and prototype-key behavior compatible with JSON.parse", async () => {
  const text =
    '{"x":1,"x":2,"__proto__":{"polluted":true},"nested":{"__proto__":null},"constructor":{"prototype":{"polluted":true}}}';
  const destination = await file();
  await writeFile(destination, text);
  const value = (await readJsonFile(destination)) as any;
  expect(value).toEqual(JSON.parse(text));
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(value.nested)).toBe(Object.prototype);
  expect(Object.hasOwn(value, "__proto__")).toBe(true);
  expect(value.polluted).toBeUndefined();
  expect(({} as any).polluted).toBeUndefined();
});

it("retains bounded raw read chunks for accepted-session backup recovery", async () => {
  const destination = await file();
  const text = JSON.stringify({ text: "中😀".repeat(100000) });
  await writeFile(destination, text);
  const chunks: string[] = [];
  const value = await readJsonFile(destination, {
    onChunk: (chunk) => chunks.push(chunk),
  });
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.join("")).toBe(text);
  expect(value).toEqual(JSON.parse(text));
});

it("propagates source and destination I/O failures", async () => {
  const destination = await file();
  await expect(readJsonFile(destination)).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(
    writeJsonFile(path.join(destination, "missing.json"), encodeJson({ x: 1 })),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
