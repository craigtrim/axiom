// craigtrim/axiom#223: view saves preserve the raw ontology instead of encoding it.
import { expect, it } from "vitest";
import {
  captureJsonObject,
  captureJsonObjectAsync,
  extractJsonField,
  extractJsonFieldAsync,
  replaceJsonFields,
  replaceJsonFieldsAsync,
} from "../../src/main/json-fields";
import { encodeJson } from "../../src/main/json-io";

it("preserves raw ontology values while replacing and removing view metadata", () => {
  const raw =
    ' [ { "iri": "urn:school:1", "label": "\\u0053chool", "score": 1.200e+03 } ]';
  const original = [
    ' { "entities":',
    raw,
    ',"selected":"old","workbench":{"theme":"dark"}}\n',
  ];
  const object = captureJsonObject(original);
  const updated = object.replace({ selected: "new", workbench: undefined });
  expect(updated.join("")).toContain(raw.trimStart());
  expect(JSON.parse(updated.join(""))).toEqual({
    entities: [{ iri: "urn:school:1", label: "School", score: 1200 }],
    selected: "new",
  });
  expect(object.field("entities")?.join("")).toBe(raw.trimStart());
  expect(
    JSON.parse(object.replace({ selected: "another" }).join("")).selected,
  ).toBe("another");
  expect(original[0]).toBe(' { "entities":');
  expect(Object.isFrozen(updated)).toBe(true);
  expect(Object.isFrozen(object.field("entities"))).toBe(true);
});

it("finds property boundaries with escaped strings, punctuation and nested containers", () => {
  const value = {
    entities: [
      {
        label: 'A \\"quoted\\" value { [ , : ] }',
        data: [null, true, false, -12.5e-3],
      },
    ],
    'escaped"key': { nested: [{ graph: "view" }] },
    selected: null,
  };
  const raw = JSON.stringify(value);
  const chunks = Array.from(raw);
  const updated = replaceJsonFields(chunks, {
    selected: "urn:school:2",
    drafts: [],
  });
  expect(JSON.parse(updated.join(""))).toEqual({
    ...value,
    selected: "urn:school:2",
    drafts: [],
  });
  expect(
    JSON.parse(extractJsonField(chunks, 'escaped"key')!.join("")),
  ).toEqual(value['escaped"key']);
  expect(extractJsonField(chunks, "absent")).toBeUndefined();
});

it("extracts an embedded workspace without copying surrounding session metadata", () => {
  const chunks = [
    '{"format":"axiom-session","workspace":',
    '{"format":"axiom-workspace","entities":[',
    '{"iri":"urn:school:1"}',
    ']},"workbench":{"theme":"light"}}',
  ];
  const workspace = extractJsonField(chunks, "workspace")!;
  expect(workspace).toContain(chunks[2]);
  expect(JSON.parse(workspace.join(""))).toEqual({
    format: "axiom-workspace",
    entities: [{ iri: "urn:school:1" }],
  });
});

it("retains duplicate-key semantics and writes each top-level field once", () => {
  const updated = replaceJsonFields(
    [
      '{"selected":"first","\\u0073elected":"last","__proto__":{"safe":true}}',
    ],
    { graph: { nodes: [] } },
  );
  expect(updated.join("").match(/"selected"/g)).toHaveLength(1);
  expect(JSON.parse(updated.join(""))).toEqual(
    JSON.parse(
      '{"selected":"last","__proto__":{"safe":true},"graph":{"nodes":[]}}',
    ),
  );
});

it("keeps large values chunked and protects surrogate pairs at source boundaries", () => {
  const payload = "school ".repeat(30000);
  const chunks = [
    '{"entities":["',
    payload,
    '\uD83D',
    '\uDE00',
    '"],"selected":null}',
  ];
  const updated = replaceJsonFields(chunks, { selected: "urn:school:1" });
  expect(JSON.parse(updated.join("")).entities).toEqual([payload + "😀"]);
  expect(updated.every((chunk) => chunk.length <= 64 * 1024)).toBe(true);
  for (let index = 0; index < updated.length - 1; index++) {
    const left = updated[index].charCodeAt(updated[index].length - 1);
    const right = updated[index + 1].charCodeAt(0);
    expect(
      left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff,
    ).toBe(false);
  }
});

it("reuses an immutable capture after callers replace their source array entries", () => {
  const source = [
    ...encodeJson({ entities: [{ name: "Original" }], graph: {} }, 16),
  ];
  const object = captureJsonObject(source);
  source.fill("corrupted");
  expect(
    JSON.parse(object.replace({ graph: { selected: true } }).join("")),
  ).toEqual({ entities: [{ name: "Original" }], graph: { selected: true } });
});

it("yields while indexing large strings and retains the captured source", async () => {
  const label = "school ".repeat(40000);
  const source = [...encodeJson({ entities: [{ label }], selected: null })];
  const pending = captureJsonObjectAsync(source);
  let observed = false;
  const turn = new Promise<void>((resolve) => {
    setImmediate(() => {
      observed = true;
      resolve();
    });
  });
  source.fill("corrupted");
  const object = await pending;
  expect(observed).toBe(true);
  await turn;
  expect(JSON.parse(object.replace({ selected: "next" }).join(""))).toEqual({
    entities: [{ label }],
    selected: "next",
  });
});

it("supports yielding extraction and replacement for nested workspace documents", async () => {
  const workspace = {
    entities: Array.from({ length: 1024 }, (_, index) => ({ index })),
    selected: "before",
  };
  const source = encodeJson({ workspace, workbench: {} });
  const extracted = await extractJsonFieldAsync(source, "workspace");
  expect(extracted).toBeDefined();
  const updated = await replaceJsonFieldsAsync(extracted!, { selected: "after" });
  expect(JSON.parse(updated.join(""))).toEqual({
    ...workspace,
    selected: "after",
  });
  await expect(captureJsonObjectAsync(['{"broken":[1,]}'])).rejects.toThrow(
    SyntaxError,
  );
});

it.each([
  "[]",
  "null",
  "",
  "{} trailing",
  '{"a":1,}',
  '{"a":[1,]}',
  '{"a":{,}}',
  '{"a":"unterminated}',
  '{"a":"\\q"}',
  '{"a":"\\u0x00"}',
  '{"a":01}',
  '{"a":1.}',
  '{"a":1e}',
  '{"a":true false}',
  '{"a":undefined}',
  '{"a":}',
  '{a:1}',
])("rejects malformed object input %s", (source) => {
  expect(() => captureJsonObject(Array.from(source))).toThrow(SyntaxError);
});
