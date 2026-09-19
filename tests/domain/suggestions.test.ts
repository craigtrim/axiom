import { it, expect } from "vitest";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { SuggestionService } from "../../src/main/suggestion-service";
import {
  readSuggestionDefinition,
  parseSuggestionValues,
  type SuggestionDefinition,
  type SuggestionDocument,
} from "../../src/shared/suggestions";
import type { DomainMethod } from "../../src/shared/protocol";
const definition: SuggestionDefinition = {
  id: "friendly-labels",
  name: "Friendly labels",
  instructions: "Suggest alternative labels.",
  examples: "Provide short readable names.",
  predicate: "http://www.w3.org/2004/02/skos/core#altLabel",
  valueType: "text",
};
async function fixture(
  raw: unknown = {
    suggestions: [
      { value: "Introductory English", reason: "An alternative label." },
    ],
  },
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-suggestions-"));
  const script = path.join(root, "mock.cjs");
  await writeFile(
    script,
    'const fs=require("fs");process.stdin.resume();process.stdin.on("end",()=>fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],' +
      JSON.stringify(JSON.stringify(raw)) +
      "));",
  );
  let namespace = "https://example.org/#",
    epoch = 1;
  let document = {
    entity: {
      iri: namespace + "BasicEnglish",
      name: "Basic English",
      kind: "Class",
    },
    statements: [],
    version: 1,
    datasetEpoch: 1,
  } as unknown as SuggestionDocument;
  let discovered = 0;
  const request = async <T>(
    method: DomainMethod,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    if (method === "state")
      return { ontology: { namespace }, datasetEpoch: epoch } as T;
    if (method === "entityDocument") return structuredClone(document) as T;
    if (method === "subclassSuggestions")
      return {
        suggestions: [
          { iri: namespace + "English", label: "English", parents: [] },
        ],
      } as T;
    if (method === "updateEntity") {
      document.statements = args!
        .statements as SuggestionDocument["statements"];
      document.version++;
      return document.entity.iri as T;
    }
    if (method === "applySubclassSuggestions") {
      document.statements.push({
        subject: document.entity.iri,
        predicate: "http://www.w3.org/2000/01/rdf-schema#subClassOf",
        object: { literal: false, value: (args!.parents as string[])[0] },
      });
      document.version++;
      return true as T;
    }
    throw Error(method);
  };
  const discover = async () => {
    discovered++;
    return [{ id: "codex" as const, file: process.execPath, args: [script] }];
  };
  const service = new SuggestionService(root, request, discover);
  return {
    root,
    service,
    request,
    discover,
    document,
    get discovered() {
      return discovered;
    },
    switchDataset() {
      namespace = "https://other.org/#";
      epoch++;
      document.datasetEpoch = epoch;
    },
  };
}
it("validates definitions and resource responses while deduplicating values", () => {
  expect(readSuggestionDefinition(definition)).toEqual(definition);
  expect(() =>
    readSuggestionDefinition({ ...definition, instructions: "" }),
  ).toThrow();
  expect(() =>
    readSuggestionDefinition({ ...definition, predicate: "a bad predicate" }),
  ).toThrow();
  expect(
    parseSuggestionValues(
      {
        suggestions: [
          { value: "One", reason: "Fits" },
          { value: "One", reason: "Fits" },
        ],
      },
      definition,
    ),
  ).toHaveLength(1);
  expect(() =>
    parseSuggestionValues(
      { suggestions: [{ value: "not an IRI", reason: "Fits" }] },
      { ...definition, valueType: "resource" },
    ),
  ).toThrow(/IRI/);
});
it("persists definitions globally and snapshots instructions in each run", async () => {
  const f = await fixture();
  await f.service.saveDefinition(definition);
  const run = await f.service.run({
    iri: f.document.entity.iri,
    mode: "custom:" + definition.id,
    provider: "codex",
  });
  expect(run.prompt).toContain(definition.instructions);
  expect(run.values[0].value).toBe("Introductory English");
  expect(f.document.statements).toEqual([]);
  await f.service.saveDefinition({
    ...definition,
    instructions: "Updated instruction",
  });
  const restored = new SuggestionService(f.root, f.request, f.discover);
  expect((await restored.listDefinitions())[0].instructions).toBe(
    "Updated instruction",
  );
  expect((await restored.history())[0].definition?.instructions).toBe(
    definition.instructions,
  );
  expect(
    JSON.parse(
      await readFile(path.join(f.root, "axiom-properties.json"), "utf8"),
    ).suggestions,
  ).toHaveLength(1);
});
it("adds only reviewed custom values and rejects repeat application and changed contexts", async () => {
  const f = await fixture();
  await f.service.saveDefinition(definition);
  const run = await f.service.run({
    iri: f.document.entity.iri,
    mode: "custom:" + definition.id,
    provider: "codex",
  });
  await expect(f.service.apply(run.id, [0, 0])).rejects.toThrow(/available/);
  await f.service.apply(run.id, [0]);
  expect(f.document.statements[0].object).toEqual({
    literal: true,
    value: "Introductory English",
  });
  await expect(f.service.apply(run.id, [0])).rejects.toThrow(/available/);
  const next = await f.service.run({
    iri: f.document.entity.iri,
    mode: "parents",
  });
  f.switchDataset();
  await expect(f.service.apply(next.id, [0])).rejects.toThrow(/changed/);
});
it("keeps parent matching local, reviewable and available after restart", async () => {
  const f = await fixture();
  const run = await f.service.run({
    iri: f.document.entity.iri,
    mode: "parents",
  });
  expect(f.discovered).toBe(0);
  expect(f.document.statements).toHaveLength(0);
  const restored = new SuggestionService(f.root, f.request, f.discover);
  await restored.apply(run.id, [0]);
  expect(f.document.statements[0].object.literal).toBe(false);
  expect((await restored.history())[0].applied).toEqual([0]);
});
it("retains invalid assistant responses as failed runs for inspection", async () => {
  const f = await fixture({ oops: true });
  await f.service.saveDefinition(definition);
  await expect(
    f.service.run({
      iri: f.document.entity.iri,
      mode: "custom:" + definition.id,
      provider: "codex",
    }),
  ).rejects.toThrow(/list/);
  expect((await f.service.history())[0].state).toBe("failed");
  expect((await f.service.history())[0].prompt).toContain("Basic English");
});
