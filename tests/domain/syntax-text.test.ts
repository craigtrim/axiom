import { describe, it, expect } from "vitest";
import { promptSegments } from "../../src/shared/syntax-text";

// craigtrim/axiom#111: mixed prompts preserve text and isolate incomplete diagnostics.
describe("source inside prompts", () => {
  it("retains prose and nested JSON with escaped quotes, braces and markup", () => {
    const object = JSON.stringify({
      label: 'A "quoted" <script> with }',
      values: [true, 1, { key: "x" }],
    });
    const text = `Please inspect this.\nOntology: ${object}\nThe next paragraph stays prose.`;
    const parts = promptSegments(text);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.json).map((part) => part.text)).toEqual([
      object,
    ]);
  });
  it("highlights an embedded schema and catalog rows without changing newlines", () => {
    const text =
      'Return JSON: {"values":[]}.\r\nCatalog:\r\n["c1","Label",[]]\r\n["c2","Two",["c1"]]';
    const parts = promptSegments(text);
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(parts.filter((part) => part.json)).toHaveLength(3);
  });
  it("keeps incomplete trailing JSON local to the diagnostic", () => {
    expect(promptSegments('Context: {"name":"cut')).toEqual([
      { text: "Context: ", json: false },
      { text: '{"name":"cut', json: true },
    ]);
    expect(promptSegments("An ordinary paragraph.")).toEqual([
      { text: "An ordinary paragraph.", json: false },
    ]);
  });
  it("leaves bracketed prose alone and handles malformed nested input once", () => {
    const text = 'Authorization: [redacted]\nContext: {"name":"x"}';
    expect(
      promptSegments(text)
        .filter((p) => p.json)
        .map((p) => p.text),
    ).toEqual(['{"name":"x"}']);
    const malformed = "[".repeat(30000);
    expect(promptSegments(malformed)).toEqual([
      { text: malformed, json: false },
    ]);
  });
});
