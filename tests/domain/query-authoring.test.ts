import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatQuery } from "../../src/domain/query-format";
import { parseQuery } from "../../src/domain/query";
import { buildEmptyStore } from "../../src/domain/workspace";
import { buildStore } from "../../src/domain/fixture";
import { queryContext } from "../../src/domain/query-context";
import {
  extractQueryProposal,
  buildQueryPrompt,
  querySchema,
  type QueryAssistantRequest,
} from "../../src/shared/query-assistant";
import {
  QueryAssistantService,
  validateQueryProposal,
} from "../../src/main/query-assistant-service";
import { assistantArguments } from "../../src/main/local-assistant";
const query = "select ?s ?p ?o where { ?s ?p ?o . } limit 100";
const proposal = {
  status: "query",
  sparql: query,
  explanation: "Lists asserted triples.",
  assumptions: [],
};
it("formats uppercase clauses and indented triples without changing the parsed query", () => {
  expect(formatQuery(query)).toBe(
    "SELECT ?s ?p ?o\nWHERE {\n  ?s ?p ?o .\n}\nLIMIT 100",
  );
  expect(parseQuery(formatQuery(query))).toEqual(parseQuery(query));
});
it.each([
  'prefix ex: <http://example.org/where#> select ?select where { ?select ex:select "select WHERE # <> ! \\"quote\\"" . }',
  '# heading\nselect ?s where { ?s a <http://example.org/Thing> . # keep this\n?s <http://example.org/name> "where" . filter (?s != <http://example.org/Other>) } order by desc(?s) limit 12',
  "select ?s where { ?s ?p 1.25 . ?s ?p -3.5 filter (1.25 <= 2) }",
  'select ?s where { ?s ?p \"\"\"line\none\"\"\" . }',
])("formatting preserves lexical data and is idempotent: %s", (text) => {
  const formatted = formatQuery(text);
  expect(parseQuery(formatted)).toEqual(parseQuery(text));
  expect(formatQuery(formatted)).toBe(formatted);
  expect(formatted).not.toContain(" A ");
});
it("rejects invalid syntax and accepts standard OPTIONAL before changing text", () => {
  expect(() => formatQuery("select * where {")).toThrow();
  expect(() =>
    formatQuery("select ?s where { ?s ?p ?o OPTIONAL { ?s ?q ?x } }"),
  ).not.toThrow();
  expect(formatQuery("   ")).toBe("   ");
});
it("extracts structured JSON, one SPARQL fence or a plain query", () => {
  expect(extractQueryProposal(JSON.stringify(proposal))).toEqual(proposal);
  expect(extractQueryProposal(proposal)).toEqual(proposal);
  expect(
    extractQueryProposal(
      "Explanation.\n\x60\x60\x60sparql\n" + query + "\n\x60\x60\x60",
    ).sparql,
  ).toBe(query);
  expect(extractQueryProposal(query).sparql).toBe(query);
});
it.each([
  "No query possible.",
  "\x60\x60\x60sparql\n" +
    query +
    "\n\x60\x60\x60\n\x60\x60\x60sparql\n" +
    query +
    "\n\x60\x60\x60",
  "\x60\x60\x60js\nalert(1)\n\x60\x60\x60",
  { ...proposal, status: "unsupported" },
  { ...proposal, sparql: "" },
  { ...proposal, assumptions: [4] },
])("rejects malformed or ambiguous output", (raw) =>
  expect(() => extractQueryProposal(raw)).toThrow(),
);
it("grounds context in local terms and excludes comments and instance literal values", () => {
  const store = buildStore();
  const context = queryContext(store, "Margherita topping", 9);
  expect(context.terms.length).toBeLessThanOrEqual(160);
  expect(context.terms[0].iri).toMatch(/Margherita|Topping/);
  expect(context.datasetEpoch).toBe(9);
  const prompt = buildQueryPrompt(context, {
    provider: "codex",
    instructions: "show toppings",
    currentQuery: "",
    datasetEpoch: 9,
    version: store.version,
  });
  expect(prompt).toContain("SPARQL 1.1 Query");
  expect(prompt).toContain("no inference");
  expect(prompt.length).toBeLessThan(150000);
  expect(prompt).not.toContain('"comment":');
});
it("validates actual engine support and refuses unknown ontology identifiers", () => {
  const context = queryContext(buildEmptyStore(), "", 0);
  expect(validateQueryProposal(query, context)).toBe(null);
  expect(
    validateQueryProposal(
      "SELECT ?s WHERE { ?s <http://invented.org/property> ?o }",
      context,
    ),
  ).toMatch(/absent/);
  expect(
    validateQueryProposal(query + " SELECT ?x WHERE {?x ?p ?o}", context),
  ).not.toBe(null);
  expect(validateQueryProposal("DELETE WHERE {?s ?p ?o}", context)).toMatch(
    /SELECT, ASK/,
  );
  expect(
    validateQueryProposal("SELECT (COUNT(?s) AS ?n) WHERE {?s ?p ?o}", context),
  ).toBe(null);
});
it("passes the query schema and disables agent tools", () => {
  const args = assistantArguments("claude", "test", false, querySchema);
  expect(args[args.indexOf("--json-schema") + 1]).toBe(
    JSON.stringify(querySchema),
  );
  expect(args[args.indexOf("--tools") + 1]).toBe("");
  expect(args).not.toContain("--bare");
});
it.each(["codex", "claude"] as const)(
  "runs %s through the shared process adapter and returns a formatted proposal",
  async (provider) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "axiom-query-"));
    const script = path.join(root, "agent.cjs"),
      store = buildEmptyStore();
    const context = queryContext(store, "triples", 2);
    const input: QueryAssistantRequest = {
      provider,
      instructions: "triples",
      currentQuery: "",
      datasetEpoch: 2,
      version: store.version,
    };
    await writeFile(
      script,
      `const fs=require("fs"); let s=""; process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{if(!s.includes("ONTOLOGY CONTEXT")||!s.includes("SPARQL 1.1 Query"))process.exit(2);const r=${JSON.stringify(proposal)}; if(process.argv.includes("--output-last-message"))fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],JSON.stringify(r));else process.stdout.write(JSON.stringify({structured_output:r}));});`,
    );
    try {
      const service = new QueryAssistantService(
        path.join(root, "jobs"),
        async () => context,
        async () => [{ id: provider, file: process.execPath, args: [script] }],
      );
      const result = await service.run(input);
      expect(result.validation).toBe(null);
      expect(result.result.sparql).toBe(formatQuery(query));
      expect(service.status().running).toBe(false);
      await expect(service.run({ ...input, version: 999 })).rejects.toThrow(
        /ontology changed/,
      );
      expect(store.version).toBe(context.version);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it("times out a stalled agent and releases the run lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-query-timeout-"));
  const script = path.join(root, "agent.cjs"),
    store = buildEmptyStore();
  await writeFile(script, "setInterval(()=>{},1000)");
  try {
    const context = queryContext(store, "", 0);
    const service = new QueryAssistantService(
      path.join(root, "jobs"),
      async () => context,
      async () => [{ id: "codex", file: process.execPath, args: [script] }],
      150,
    );
    await expect(
      service.run({
        provider: "codex",
        instructions: "triples",
        currentQuery: "",
        datasetEpoch: 0,
        version: store.version,
      }),
    ).rejects.toThrow(/timed out/);
    expect(service.status().running).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
