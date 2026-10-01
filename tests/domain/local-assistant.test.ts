import { it, expect } from "vitest";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  LocalAssistantRunner,
  assistantArguments,
  assistantOutputMetadata,
  discoverAssistants,
} from "../../src/main/local-assistant";
it("discovers native executables and the Codex npm entry on PATH", async () => {
  const root = process.env.AXIOM_CACHE_HOME!;
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
  expect(found[1].args[0]).toContain("codex.js");
  expect(await discoverAssistants({ PATH: "" })).toEqual([]);
});
it("constrains noninteractive calls and uses JSON events only for provider metadata", () => {
  const codex = assistantArguments("codex", "job", false);
  expect(codex).toEqual(
    expect.arrayContaining([
      "--json",
      "read-only",
      'web_search="disabled"',
      "features.shell_tool=false",
    ]),
  );
  expect(codex).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  const claude = assistantArguments("claude", "job", false);
  expect(claude[claude.indexOf("--tools") + 1]).toBe("");
  expect(claude).toContain("--strict-mcp-config");
  expect(assistantArguments("claude", "job", true)).toContain(
    "WebSearch,WebFetch",
  );
});
it("records Claude model usage, cost, turns and both reported durations", () => {
  expect(
    assistantOutputMetadata(
      "claude",
      JSON.stringify({
        modelUsage: { "claude-fixture": { inputTokens: 12 } },
        usage: { input_tokens: 12 },
        total_cost_usd: 0.2,
        num_turns: 3,
        duration_ms: 123,
        duration_api_ms: 100,
      }),
    ),
  ).toEqual({
    model: "claude-fixture",
    providerReport: {
      modelUsage: { "claude-fixture": { inputTokens: 12 } },
      usage: { input_tokens: 12 },
      totalCostUsd: 0.2,
      numTurns: 3,
      durationMs: 123,
      durationApiMs: 100,
    },
  });
});
it("leaves Codex model unknown unless explicitly reported and preserves completion usage", () => {
  const usage = { input_tokens: 23, cached_input_tokens: 10, output_tokens: 4 };
  expect(
    assistantOutputMetadata(
      "codex",
      JSON.stringify({ type: "turn.completed", usage }),
    ),
  ).toEqual({ model: null, providerReport: { usage } });
  expect(
    assistantOutputMetadata(
      "codex",
      'noise\n{"type":"thread.started","model":"fixture-model"}\n',
    ),
  ).toEqual({ model: "fixture-model", providerReport: null });
});
it.each(["claude", "codex"] as const)(
  "captures %s reply and execution metadata from a real fixture subprocess",
  async (id) => {
    const root = process.env.AXIOM_CACHE_HOME!,
      script = path.join(root, "fixture.cjs"),
      versions = path.join(root, "versions.txt");
    await mkdir(root, { recursive: true });
    await writeFile(
      script,
      `const fs=require('node:fs');if(process.argv.includes('--version')){fs.appendFileSync(${JSON.stringify(versions)},'v');console.log('fixture 1.2');process.exit(0);}let text='';process.stdin.on('data',d=>text+=d);process.stdin.on('end',()=>{if(text!=='exact prompt')process.exit(2);const reply={suggestions:[]};if(process.argv.includes('--output-last-message')){fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],JSON.stringify(reply));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:12,output_tokens:2}}));}else console.log(JSON.stringify({structured_output:reply,model:'fixture-model',duration_ms:10}));});`,
    );
    const runner = new LocalAssistantRunner(
      path.join(root, "jobs"),
      async () => [{ id, file: process.execPath, args: [script] }],
    );
    for (let i = 0; i < 2; i++) {
      const run = await runner.runWithMetadata(id, "exact prompt", {
        type: "object",
      });
      expect(
        typeof run.reply === "string" ? JSON.parse(run.reply) : run.reply,
      ).toEqual({ suggestions: [] });
      expect(run.metadata.cli).toEqual({
        version: "fixture 1.2",
        path: script,
      });
      expect(run.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(Date.parse(run.metadata.completedAt)).toBeGreaterThanOrEqual(
        Date.parse(run.metadata.startedAt),
      );
      expect(run.metadata.model).toBe(id === "claude" ? "fixture-model" : null);
    }
    expect(await readFile(versions, "utf8")).toBe("v");
  },
);
it("cancels a running subprocess and permits a subsequent call", async () => {
  const root = process.env.AXIOM_CACHE_HOME!,
    script = path.join(root, "wait.cjs");
  await mkdir(root, { recursive: true });
  await writeFile(
    script,
    "if(process.argv.includes('--version')){console.log('1');process.exit(0);}setInterval(()=>{},1000);",
  );
  const runner = new LocalAssistantRunner(path.join(root, "jobs"), async () => [
    { id: "claude", file: process.execPath, args: [script] },
  ]);
  const pending = runner.run("claude", "prompt", null),
    assertion = expect(pending).rejects.toThrow(/cancelled/);
  await new Promise((r) => setTimeout(r, 150));
  runner.cancel();
  await assertion;
  await writeFile(
    script,
    "process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({result:'done'})));",
  );
  expect(await runner.run("claude", "prompt", null)).toBe("done");
});
