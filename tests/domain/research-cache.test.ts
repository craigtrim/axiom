import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildEmptyStore } from "../../src/domain/workspace";
import { researchContext } from "../../src/domain/research";
import { THING } from "../../src/domain/model";
import {
  buildResearchPrompt,
  type ResearchContext,
  type ResearchRequest,
} from "../../src/shared/research";
import { ResearchService } from "../../src/main/research-service";
import {
  ResearchCache,
  researchPromptHash,
} from "../../src/main/research-cache";
let root: string,
  jobs: string,
  context: ResearchContext,
  input: ResearchRequest;
const result = {
  summary: "A cached finding.",
  sources: [],
  suggestions: [
    {
      kind: "synonym" as const,
      name: "Universal class",
      description: "A proposed label.",
      sourceUrl: "",
    },
  ],
};
const discover = vi.fn();
const service = () =>
  new ResearchService(jobs, async () => structuredClone(context), discover);
const count = async () => {
  try {
    return (await readFile(path.join(root, "launches"), "utf8"))
      .trim()
      .split("\n").length;
  } catch {
    return 0;
  }
};
const prompt = () =>
  buildResearchPrompt(context, input.instructions, input.web);
const file = () =>
  path.join(jobs, "cache", researchPromptHash(prompt()) + ".json");
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "axiom-research-cache-"));
  jobs = path.join(root, "jobs");
  context = researchContext(buildEmptyStore(), THING, 4);
  input = {
    provider: "codex",
    iri: THING,
    datasetEpoch: context.datasetEpoch,
    version: context.version,
    instructions: "Find useful synonyms",
    web: false,
  };
  await writeFile(path.join(root, "behavior.json"), "{}");
  const script = path.join(root, "assistant.cjs");
  await writeFile(
    script,
    'const fs=require("node:fs");let prompt="";process.stdin.on("data",d=>prompt+=d);process.stdin.on("end",()=>{' +
      "fs.writeFileSync(" +
      JSON.stringify(path.join(root, "prompt.txt")) +
      ",prompt);fs.appendFileSync(" +
      JSON.stringify(path.join(root, "launches")) +
      ',"run\\n");' +
      "const b=JSON.parse(fs.readFileSync(" +
      JSON.stringify(path.join(root, "behavior.json")) +
      ',"utf8"));setTimeout(()=>{if(b.fail)process.exit(2);fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],b.invalid?"invalid":' +
      JSON.stringify(JSON.stringify(result)) +
      ");},b.delay??0);});",
  );
  discover
    .mockReset()
    .mockResolvedValue([
      { id: "codex", file: process.execPath, args: [script] },
    ]);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
it("uses MD5 of the exact UTF-8 prompt and reuses a completed result without another CLI launch", async () => {
  expect(researchPromptHash("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
  const s = service(),
    first = await s.run(input),
    second = await s.run(input);
  expect(await count()).toBe(1);
  expect(discover).toHaveBeenCalledTimes(1);
  expect(first.cache).toEqual({
    hit: false,
    md5: researchPromptHash(
      await readFile(path.join(root, "prompt.txt"), "utf8"),
    ),
  });
  expect(second.cache).toEqual({ ...first.cache, hit: true });
  expect(second.result).toEqual(result);
  expect(second.completedAt).toBe(first.completedAt);
  expect(second.responseId).not.toBe(first.responseId);
  const saved = JSON.parse(await readFile(file(), "utf8"));
  expect(saved.prompt).toBe(prompt());
  expect(saved.result).toEqual(result);
});
it("survives service restart and session/version changes, preserving original attribution without a CLI", async () => {
  const first = await service().run(input),
    prior = prompt();
  context.datasetEpoch++;
  context.version++;
  expect(prompt()).toBe(prior);
  discover.mockRejectedValue(
    Error("Assistant discovery must not run on a cache hit"),
  );
  const second = await service().run({
    ...input,
    provider: "claude",
    datasetEpoch: context.datasetEpoch,
    version: context.version,
  });
  expect(second.cache?.hit).toBe(true);
  expect(second.context).toEqual(context);
  expect(second.provider).toBe("codex");
  expect(second.completedAt).toBe(first.completedAt);
  expect(await count()).toBe(1);
});
it.each(["whitespace", "instructions", "web", "entity", "relationships"])(
  "changes the key when %s changes",
  async (change) => {
    const s = service(),
      first = await s.run(input);
    if (change === "whitespace") input.instructions += " ";
    if (change === "instructions") input.instructions = "Another question";
    if (change === "web") input.web = true;
    if (change === "entity") context.entity.comment = "A changed definition";
    if (change === "relationships")
      context.relationships.push({
        predicate: "http://example.org/p",
        value: "different",
        literal: true,
      });
    const second = await s.run(input);
    expect(second.cache?.hit).toBe(false);
    expect(second.cache?.md5).not.toBe(first.cache?.md5);
    expect(await count()).toBe(2);
  },
);
it("checks request freshness before serving cached suggestions", async () => {
  const s = service();
  await s.run(input);
  context.version++;
  await expect(s.run(input)).rejects.toThrow(/ontology changed/);
  expect(await count()).toBe(1);
});
it.each(["invalid JSON", "wrong prompt", "invalid result", "old format"])(
  "treats %s in the cache as a miss and replaces it",
  async (issue) => {
    const s = service();
    await s.run(input);
    const saved = JSON.parse(await readFile(file(), "utf8"));
    if (issue === "wrong prompt") saved.prompt += "modified";
    if (issue === "invalid result") saved.result = { summary: 3 };
    if (issue === "old format") saved.format = 0;
    await writeFile(
      file(),
      issue === "invalid JSON" ? "{unfinished" : JSON.stringify(saved),
    );
    expect((await s.run(input)).cache?.hit).toBe(false);
    expect(await count()).toBe(2);
    expect((await s.run(input)).cache?.hit).toBe(true);
    expect(await count()).toBe(2);
  },
);
it.each(["invalid", "fail"])(
  "does not cache an assistant %s response",
  async (kind) => {
    const s = service();
    await writeFile(
      path.join(root, "behavior.json"),
      JSON.stringify({ [kind]: true }),
    );
    await expect(s.run(input)).rejects.toThrow();
    await expect(readFile(file())).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(path.join(root, "behavior.json"), "{}");
    expect((await s.run(input)).cache?.hit).toBe(false);
    expect(await count()).toBe(2);
  },
);
it("does not cache a cancelled subprocess and allows the same prompt to run again", async () => {
  const s = service();
  await writeFile(path.join(root, "behavior.json"), '{"delay":20000}');
  const pending = s.run(input),
    rejected = expect(pending).rejects.toThrow(/cancelled/);
  await vi.waitFor(async () => expect(await count()).toBe(1));
  s.cancel();
  await rejected;
  await expect(readFile(file())).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(path.join(root, "behavior.json"), "{}");
  expect((await s.run(input)).cache?.hit).toBe(false);
  expect(await count()).toBe(2);
});
it("keeps a successful response usable when disk caching fails", async () => {
  await mkdir(jobs, { recursive: true });
  await writeFile(path.join(jobs, "cache"), "not a directory");
  const response = await service().run(input);
  expect(response.result).toEqual(result);
  expect(response.cache?.warning).toMatch(/could not be cached/);
});
it("cancels a pending cache lookup without serving its result or launching a CLI", async () => {
  const s = service();
  await s.run(input);
  const real = ResearchCache.prototype.get;
  let release!: () => void, arrived!: () => void;
  const entered = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(ResearchCache.prototype, "get").mockImplementationOnce(
    async function (this: ResearchCache, p) {
      arrived();
      await wait;
      return real.call(this, p);
    },
  );
  const pending = s.run(input),
    rejected = expect(pending).rejects.toThrow(/cancelled/);
  await entered;
  s.cancel();
  release();
  await rejected;
  expect(await count()).toBe(1);
});
it("removes temporary and committed cache files when cancelled during a save", async () => {
  const cache = new ResearchCache(path.join(jobs, "cache"));
  let checks = 0;
  await cache.put(
    prompt(),
    result,
    "codex",
    new Date().toISOString(),
    () => ++checks === 2,
  );
  expect(checks).toBe(2);
  expect(await readdir(path.join(jobs, "cache"))).toEqual([]);
});
