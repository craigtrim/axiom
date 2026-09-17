import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildEmptyStore } from "../../src/domain/workspace";
import { buildStore } from "../../src/domain/fixture";
import { THING, NS } from "../../src/domain/model";
import { researchContext, applySuggestions } from "../../src/domain/research";
import {
  buildResearchPrompt,
  parseResearchResult,
  researchUrl,
  type Suggestion,
} from "../../src/shared/research";
import {
  ResearchService,
  assistantArguments,
  discoverAssistants,
} from "../../src/main/research-service";
const suggestion = (kind: Suggestion["kind"], name: string): Suggestion => ({
  kind,
  name,
  description: "Proposed for review.",
  sourceUrl: "",
});
it("includes ontology parents, restrictions, children and bounded sample instances", () => {
  const s = buildStore(),
    c = researchContext(s, NS.pizza + "Margherita", 7);
  expect(c.ontology.example).toBe(true);
  expect(c.parents.length).toBeGreaterThan(0);
  expect(c.examples.length).toBe(12);
  expect(c.counts.instances).toBeGreaterThan(12);
  expect(
    c.entity.restrictions.length + c.entity.equivalents.length,
  ).toBeGreaterThan(0);
  const prompt = buildResearchPrompt(c, "Find synonyms", false);
  expect(prompt).toContain("ONTOLOGY CONTEXT");
  expect(prompt).toContain("external sources have not been verified");
  expect(prompt).toContain(c.parents[0].iri);
});
it("adds reviewed synonyms, subclasses and individuals without changing the original identity", () => {
  const s = buildEmptyStore(),
    person = s.createClass("Person", THING);
  applySuggestions(s, person, [
    suggestion("synonym", "Human being"),
    suggestion("subclass", "Employee"),
    suggestion("individual", "Alice"),
  ]);
  expect(s.instanceIris(person)).toEqual([s.ontology.namespace + "Alice"]);
  expect(s.entities.get(person)?.name).toBe("Person");
  expect(
    [...s.scan(person)].some(
      (t) =>
        t.predicate.endsWith("altLabel") && t.object.value === "Human being",
    ),
  ).toBe(true);
  expect(s.entities.get(s.ontology.namespace + "Employee")?.parents).toEqual([
    person,
  ]);
  expect(s.entities.get(s.ontology.namespace + "Alice")?.comment).toBe(
    "Proposed for review.",
  );
  s.undo();
  s.undo();
  s.undo();
  expect(s.instanceCount(person)).toBe(0);
  expect(
    [...s.scan(person)].some((t) => t.predicate.endsWith("altLabel")),
  ).toBe(false);
});
it("validates the entire suggestion batch before making any change", () => {
  const s = buildEmptyStore(),
    p = s.createClass("Person", THING),
    version = s.version;
  expect(() =>
    applySuggestions(s, p, [
      suggestion("synonym", "Human"),
      suggestion("subclass", "Person"),
    ]),
  ).toThrow();
  expect(s.version).toBe(version);
  expect([...s.scan(p)].some((t) => t.predicate.endsWith("altLabel"))).toBe(
    false,
  );
  expect(() =>
    applySuggestions(s, p, [
      suggestion("subclass", "Employee"),
      suggestion("individual", "Employee"),
    ]),
  ).toThrow(/already exists/);
  expect(s.version).toBe(version);
});
it("counts named suggestions in the Pizza example alongside generated instances", () => {
  const s = buildStore(),
    p = NS.pizza + "Margherita",
    before = s.instanceCount(p);
  const iri = s.createNamedIndividual("SampleMargherita", p);
  expect(s.instanceCount(p)).toBe(before + 1);
  expect(s.instanceIris(p)).toContain(iri);
});
it.each([
  "javascript:alert(1)",
  "http://example.org",
  "https://user:password@example.org",
])("rejects unsafe source URL %s", (url) => {
  expect(() =>
    parseResearchResult({
      summary: "",
      sources: [{ title: "x", url }],
      suggestions: [],
    }),
  ).toThrow();
});
it("encodes context searches and rejects malformed results", () => {
  expect(
    new URL(researchUrl("dbpedia", "Person & Organisation")).searchParams.get(
      "q",
    ),
  ).toBe("Person & Organisation site:dbpedia.org");
  expect(() =>
    parseResearchResult({
      summary: "",
      sources: [],
      suggestions: [suggestion("subclass", "Invalid name")],
    }),
  ).toThrow();
});
it("discovers native executables and the Codex npm entry on PATH", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-detect-"));
  try {
    await mkdir(path.join(root, "node_modules/@openai/codex/bin"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "node_modules/@openai/codex/bin/codex.js"),
      "",
    );
    await writeFile(
      path.join(root, process.platform === "win32" ? "claude.exe" : "claude"),
      "",
    );
    const found = await discoverAssistants({ PATH: root });
    expect(found.map((c) => c.id)).toEqual(["claude", "codex"]);
    expect(found.find((c) => c.id === "codex")!.args[0]).toContain("codex.js");
    expect(await discoverAssistants({ PATH: "" })).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("constructs constrained noninteractive CLI arguments with explicit web controls", () => {
  const codex = assistantArguments("codex", "job", false);
  expect(codex).toContain("read-only");
  expect(codex).toContain('web_search="disabled"');
  expect(codex).toContain("features.shell_tool=false");
  expect(codex).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  const claude = assistantArguments("claude", "job", false);
  expect(claude[claude.indexOf("--tools") + 1]).toBe("");
  expect(claude).toContain("--strict-mcp-config");
  expect(assistantArguments("claude", "job", true)).toContain(
    "WebSearch,WebFetch",
  );
});
it.each(["codex", "claude"] as const)(
  "runs %s through stdin and parses a real subprocess response",
  async (id) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "axiom-provider-")),
      script = path.join(root, "fake.cjs"),
      s = buildEmptyStore(),
      context = researchContext(s, THING, 0);
    const result = {
      summary: "Context received.",
      sources: [],
      suggestions: [suggestion("subclass", "Person")],
    };
    await writeFile(
      script,
      `const fs=require("fs");let input="";process.stdin.on("data",d=>input+=d);process.stdin.on("end",()=>{if(!input.includes("ONTOLOGY CONTEXT")||!input.includes("Thing"))process.exit(2);const result=${JSON.stringify(result)};if(${JSON.stringify(id)}==="codex"){fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],JSON.stringify(result))}else process.stdout.write(JSON.stringify({structured_output:result}));});`,
    );
    try {
      const service = new ResearchService(
        path.join(root, "jobs"),
        async () => context,
        async () => [{ id, file: process.execPath, args: [script] }],
      );
      expect(
        (await service.assistants()).find((a) => a.id === id)?.available,
      ).toBe(true);
      const response = await service.run({
        provider: id,
        iri: THING,
        datasetEpoch: 0,
        version: s.version,
        instructions: "Suggest subclasses",
        web: false,
      });
      expect(response.result).toEqual(result);
      expect(service.status().running).toBe(false);
      await expect(
        service.run({
          provider: id,
          iri: THING,
          datasetEpoch: 99,
          version: s.version,
          instructions: "x",
          web: false,
        }),
      ).rejects.toThrow(/ontology changed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it("cancels a running subprocess and allows another run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-cancel-")),
    script = path.join(root, "wait.cjs"),
    s = buildEmptyStore();
  await writeFile(script, "setInterval(()=>{},1000)");
  try {
    const service = new ResearchService(
      path.join(root, "jobs"),
      async () => researchContext(s, THING, 0),
      async () => [{ id: "claude", file: process.execPath, args: [script] }],
    );
    const running = service.run({
      provider: "claude",
      iri: THING,
      datasetEpoch: 0,
      version: s.version,
      instructions: "x",
      web: false,
    });
    const check = expect(running).rejects.toThrow(/cancelled/);
    await new Promise((r) => setTimeout(r, 250));
    service.cancel();
    await check;
    expect(service.status().running).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
