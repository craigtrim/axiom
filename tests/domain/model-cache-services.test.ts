import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ModelCache } from "../../src/main/model-cache";
import { SuggestionService } from "../../src/main/suggestion-service";
import { TaxonomyAssistantService } from "../../src/main/taxonomy-assistant-service";
import { buildEmptyStore } from "../../src/domain/workspace";
import {
  taxonomyContext,
  validateTaxonomySuggestions,
} from "../../src/domain/taxonomy-assistant";
import { synonymContext, validateSynonyms } from "../../src/domain/synonyms";
import { buildSynonymPrompt } from "../../src/shared/synonyms";
import { THING, NS } from "../../src/domain/model";
import type { DomainMethod } from "../../src/shared/protocol";
import type { AssistantRunResult } from "../../src/shared/assistant";
function fixture() {
  const store = buildEmptyStore(),
    iri = store.createClass("Vehicle", THING);
  let epoch = 1;
  for (let i = 0; i < 35; i++) store.createClass("Kind " + i, iri);
  const metadata = {
    cli: { version: "1.2", path: "fixture-cli" },
    model: "fixture-model",
    startedAt: "2020-01-01T00:00:00Z",
    completedAt: "2020-01-01T00:00:01Z",
    durationMs: 1000,
    providerReport: null,
  };
  const runner = {
    runWithMetadata: vi.fn(
      async (
        _provider: string,
        prompt: string,
      ): Promise<AssistantRunResult> => ({
        reply:
          prompt.includes("Suggest useful additional types") ||
          prompt.includes("Suggest real, named examples")
            ? "Summary: No new additions.\nSuggestions: None."
            : { suggestions: [] },
        metadata,
      }),
    ),
    cancel: vi.fn(),
  };
  const request = async <T>(
    method: DomainMethod,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    if (method === "state")
      return {
        ontology: store.ontology,
        entities: [...store.entities.values()],
        version: store.version,
        datasetEpoch: epoch,
      } as T;
    const target = (args?.iri as string) || iri;
    if (method === "entityDocument")
      return {
        entity: structuredClone(store.resolve(target)),
        statements: store.entityStatements(target),
        version: store.version,
        datasetEpoch: epoch,
      } as T;
    if (method === "synonymContext")
      return synonymContext(store, target, epoch) as T;
    if (method === "validateSynonyms")
      return validateSynonyms(store, target, args!.values as any) as T;
    throw Error(method);
  };
  const root = process.env.AXIOM_CACHE_HOME!,
    cache = new ModelCache();
  const suggestions = () =>
    new SuggestionService(
      path.join(root, "suggestions"),
      request,
      async () => [],
      cache,
      runner,
    );
  const taxonomy = () =>
    new TaxonomyAssistantService(
      path.join(root, "taxonomy"),
      async (i) => taxonomyContext(store, i.iri, i.mode, epoch),
      async (c, s) =>
        validateTaxonomySuggestions(store, c.selected.iri, c.mode, s),
      async () => [],
      async () => [],
      1000,
      cache,
      runner,
    );
  return {
    store,
    iri,
    runner,
    cache,
    suggestions,
    taxonomy,
    setEpoch: (e: number) => (epoch = e),
    epoch: () => epoch,
  };
}
it.each(["synonyms", "parents", "children", "instances"])(
  "reuses %s without CLI access, creates new history, and explicitly bypasses cache",
  async (mode) => {
    const f = fixture();
    const run = async (
      bypassCache = false,
      provider: "claude" | "codex" = "claude",
    ) =>
      mode === "synonyms" || mode === "parents"
        ? f.suggestions().run({ iri: f.iri, mode, provider, bypassCache })
        : f.taxonomy().run({
            id: randomUUID(),
            iri: f.iri,
            mode: mode as "children" | "instances",
            provider,
            datasetEpoch: f.epoch(),
            version: f.store.version,
            bypassCache,
          });
    const first = await run();
    expect(first.cache).toMatchObject({ hit: false, model: "fixture-model" });
    f.setEpoch(20);
    const second = await run();
    expect(second.id).not.toBe(first.id);
    expect(second.cache).toMatchObject({
      hit: true,
      completedAt: "2020-01-01T00:00:01Z",
    });
    expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(1);
    await run(true);
    expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(2);
    await run(false, "codex");
    expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(3);
    await run(false, "claude");
    expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(4);
    const history =
      mode === "synonyms" || mode === "parents"
        ? await f.suggestions().history()
        : await f.taxonomy().history();
    expect(history).toHaveLength(5);
  },
);
it("caches parent suggestions for an unchanged draft without including random history IDs in its prompt", async () => {
  const f = fixture(),
    service = f.suggestions(),
    draft = {
      label: "Road Vehicle",
      comment: "Travels on roads",
      parents: [THING],
      version: f.store.version,
      datasetEpoch: 1,
    };
  const first = await service.run({ iri: "", mode: "parents", draft }),
    second = await service.run({ iri: "", mode: "parents", draft });
  expect(first.iri).not.toBe(second.iri);
  expect(first.prompt).toBe(second.prompt);
  expect(second.cache?.hit).toBe(true);
  expect(first.prompt).not.toContain(first.id);
  await service.run({
    iri: "",
    mode: "parents",
    draft: { ...draft, comment: "Travels on water" },
  });
  expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(2);
});
it("does not cache custom Define New runs", async () => {
  const f = fixture(),
    service = f.suggestions();
  await service.saveDefinition({
    id: "custom",
    name: "Labels",
    instructions: "Suggest labels",
    examples: "",
    predicate: NS.skos + "altLabel",
    valueType: "text",
  });
  const a = await service.run({ iri: f.iri, mode: "custom:custom" }),
    b = await service.run({ iri: f.iri, mode: "custom:custom" });
  expect(a.cache).toBeUndefined();
  expect(b.cache).toBeUndefined();
  expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(2);
});
it("deterministically samples more than twenty neighbors and detects a change outside the sample", async () => {
  const f = fixture(),
    first = synonymContext(f.store, f.iri, 1),
    again = synonymContext(f.store, f.iri, 999);
  expect(first.children.length).toBeLessThanOrEqual(20);
  expect(buildSynonymPrompt(first)).toBe(buildSynonymPrompt(again));
  const used = new Set(
      [...first.children, ...first.descendants].map((t) => t.iri),
    ),
    unsampled = [...f.store.entities.values()].find(
      (e) => e.parents.includes(f.iri) && !used.has(e.iri),
    )!;
  expect(unsampled).toBeDefined();
  await f.suggestions().run({ iri: f.iri, mode: "synonyms" });
  f.store.updateEntity(unsampled.iri, [
    ...f.store.entityStatements(unsampled.iri),
    {
      subject: unsampled.iri,
      predicate: NS.rdfs + "comment",
      object: { literal: true, value: "Changed meaning" },
    },
  ]);
  expect(synonymContext(f.store, f.iri, 1).fingerprint).not.toBe(
    first.fingerprint,
  );
  await f.suggestions().run({ iri: f.iri, mode: "synonyms" });
  expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(2);
});
it("canonicalizes unordered context before selecting taxonomy samples", async () => {
  const f = fixture(),
    service = f.taxonomy();
  const input = {
    id: "one",
    iri: f.iri,
    mode: "children" as const,
    datasetEpoch: 1,
    version: f.store.version,
  };
  await service.run(input);
  // Reversing insertion order leaves the ontology and prompt unchanged.
  const entries = [...f.store.entities];
  f.store.entities.clear();
  for (const [iri, e] of entries.reverse()) f.store.entities.set(iri, e);
  expect((await service.run({ ...input, id: "two" })).cache?.hit).toBe(true);
  expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(1);
});
it.each(["synonyms", "parents", "children", "instances"])(
  "never caches malformed or failed %s replies",
  async (mode) => {
    const f = fixture();
    const run = () =>
      mode === "synonyms" || mode === "parents"
        ? f.suggestions().run({ iri: f.iri, mode })
        : f.taxonomy().run({
            id: randomUUID(),
            iri: f.iri,
            mode: mode as "children" | "instances",
            datasetEpoch: 1,
            version: f.store.version,
          });
    f.runner.runWithMetadata.mockRejectedValueOnce(Error("provider failed"));
    await expect(run()).rejects.toThrow("provider failed");
    f.runner.runWithMetadata.mockResolvedValueOnce({
      reply: "this is not a valid reply",
      metadata: {
        cli: { path: "fake", version: null },
        model: null,
        startedAt: "2020-01-01",
        completedAt: "2020-01-01",
        durationMs: 0,
        providerReport: null,
      },
    });
    await expect(run()).rejects.toThrow();
    expect((await run()).cache?.hit).toBe(false);
    expect(f.runner.runWithMetadata).toHaveBeenCalledTimes(3);
  },
);
