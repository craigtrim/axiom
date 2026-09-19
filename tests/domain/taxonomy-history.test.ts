import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildEmptyStore } from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import {
  taxonomyContext,
  validateTaxonomySuggestions,
  applyTaxonomySuggestions,
} from "../../src/domain/taxonomy-assistant";
import { TaxonomyAssistantService } from "../../src/main/taxonomy-assistant-service";
import { TaxonomyHistory } from "../../src/main/taxonomy-history";
import type { TaxonomyRequest } from "../../src/shared/taxonomy-assistant";
const fake = vi.hoisted(() => ({
  calls: 0,
  fail: false,
  release: undefined as (() => void) | undefined,
  block: false,
}));
vi.mock("../../src/main/local-assistant", () => ({
  discoverAssistants: async () => [],
  LocalAssistantRunner: class {
    async run() {
      fake.calls++;
      if (fake.block)
        await new Promise<void>((resolve) => {
          fake.release = resolve;
        });
      if (fake.fail) throw Error("Provider unavailable");
      return "Summary: Proposed categories.\nSuggestions:\n1. Water vehicle\nDescription: Travels on water.\nReason: A useful direct child.\n\n2. Air vehicle\nDescription: Travels through air.\nReason: A useful direct child.";
    }
    cancel() {
      fake.release?.();
    }
  },
}));
let root: string,
  store: ReturnType<typeof buildEmptyStore>,
  epoch: number,
  parent: string;
function service() {
  return new TaxonomyAssistantService(
    root,
    async (i) => taxonomyContext(store, i.iri, i.mode, epoch),
    async (c, s) =>
      validateTaxonomySuggestions(store, c.selected.iri, c.mode, s),
    async (c, s) => applyTaxonomySuggestions(store, c.selected.iri, c.mode, s),
  );
}
function input(id: string, iri = parent): TaxonomyRequest {
  return {
    id,
    iri,
    mode: "children",
    datasetEpoch: epoch,
    version: store.version,
  };
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "axiom-taxonomy-history-"));
  store = buildEmptyStore();
  epoch = 1;
  parent = store.createClass("Vehicle", THING);
  fake.calls = 0;
  fake.fail = false;
  fake.block = false;
  fake.release = undefined;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it("retains every run independently across nodes, retries and service restart", async () => {
  const current = service();
  await current.run(input("first"));
  await current.run(input("other", THING));
  await current.run(input("second"));
  const restarted = service();
  epoch = 9;
  expect((await restarted.history()).map((h) => h.id)).toEqual([
    "second",
    "other",
    "first",
  ]);
  const first = await restarted.read("first");
  expect(first.entry.context.selected.iri).toBe(parent);
  expect(first.entry.response?.result.suggestions).toHaveLength(2);
  expect(first.entry.prompt).toContain('"Vehicle"');
  expect(first.stale).toBe(false);
  expect(fake.calls).toBe(3);
});

it("applies a historical result after restart and records partial additions without replacing its original context", async () => {
  const current = service();
  await current.run(input("saved"));
  const restarted = service();
  epoch = 7;
  await restarted.apply("saved", [0]);
  const partial = await restarted.read("saved");
  expect(partial.entry.applied).toEqual([0]);
  expect(partial.entry.context.directChildren).toHaveLength(0);
  expect(partial.entry.reviewContext?.directChildren).toHaveLength(1);
  expect(partial.stale).toBe(false);
  await restarted.apply("saved", [1]);
  expect((await service().read("saved")).entry.applied).toEqual([0, 1]);
  await expect(restarted.apply("saved", [0])).rejects.toThrow(
    /available suggestions/,
  );
  expect(fake.calls).toBe(1);
});

it("keeps old history readable while blocking changed contexts and a different ontology", async () => {
  const current = service();
  await current.run(input("saved"));
  store.createClass("Land vehicle", parent);
  const restarted = service();
  expect((await restarted.read("saved")).stale).toBe(true);
  await expect(restarted.apply("saved", [0])).rejects.toThrow(
    /ontology changed/,
  );
  store.ontology.namespace = "https://other.example/";
  expect((await restarted.history())[0].namespace).not.toBe(
    store.ontology.namespace,
  );
  expect((await restarted.read("saved")).entry.context.selected.iri).toBe(
    parent,
  );
  await expect(restarted.apply("saved", [0])).rejects.toThrow(
    /ontology changed/,
  );
});

it("retains failed and cancelled attempts alongside successful retries", async () => {
  const current = service();
  fake.fail = true;
  await expect(current.run(input("failed"))).rejects.toThrow(
    "Provider unavailable",
  );
  fake.fail = false;
  fake.block = true;
  const run = current.run(input("cancelled"));
  const rejection = expect(run).rejects.toThrow(/cancelled/);
  await vi.waitFor(() => expect(fake.release).toBeDefined());
  current.cancel("cancelled");
  await rejection;
  fake.block = false;
  await current.run(input("success"));
  const restarted = service();
  expect((await restarted.history()).map((h) => h.state)).toEqual([
    "completed",
    "cancelled",
    "failed",
  ]);
  expect((await restarted.read("failed")).entry.error).toBe(
    "Provider unavailable",
  );
});

it("protects prior records from reused run IDs and handles interruption without losing other history", async () => {
  const current = service();
  await current.run(input("saved"));
  await expect(current.run(input("saved"))).rejects.toThrow(/already in use/);
  const original = (await current.read("saved")).entry;
  const history = new TaxonomyHistory(path.join(root, "history"));
  await history.put({
    ...original,
    id: "interrupted",
    state: "running",
    response: undefined,
  });
  await writeFile(
    path.join(root, "history", "a".repeat(64) + ".json"),
    "broken JSON",
  );
  await writeFile(
    path.join(root, "history", "b".repeat(64) + ".json"),
    JSON.stringify({
      format: 1,
      entry: { ...original, context: { selected: { iri: parent } } },
    }),
  );
  const restarted = service();
  expect((await restarted.read("interrupted")).entry.state).toBe("interrupted");
  expect((await restarted.read("saved")).entry.response).toEqual(
    original.response,
  );
  expect(fake.calls).toBe(1);
});

it("keeps a run's random sample stable across review, partial apply and restart while checking omitted context", async () => {
  for (let i = 0; i < 45; i++) store.createClass("Existing " + i, parent);
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  try {
    const current = service();
    const first = await current.run(input("sample-one"));
    expect(first.context.directChildren).toHaveLength(20);
    expect(first.context.descendants).toHaveLength(20);
    random.mockReturnValue(0.999);
    const second = await current.run(input("sample-two"));
    expect(second.context.directChildren).not.toEqual(
      first.context.directChildren,
    );
    expect((await current.read("sample-one")).stale).toBe(false);
    await current.apply("sample-one", [0]);
    const saved = (await current.read("sample-one")).entry;
    expect(saved.context).toEqual(first.context);
    expect((await current.read("sample-one")).stale).toBe(false);
    const restarted = service();
    epoch++;
    expect((await restarted.read("sample-one")).entry.prompt).toBe(
      saved.prompt,
    );
    expect((await restarted.read("sample-one")).stale).toBe(false);
    const omitted = saved.reviewContext!.descendants.find(
      (t) =>
        !saved.context.descendants.some((s) => s.iri === t.iri) &&
        !saved.context.directChildren.includes(t.iri),
    )!;
    store.entities.get(omitted.iri)!.comment =
      "Changed outside the transmitted sample";
    expect((await restarted.read("sample-one")).stale).toBe(true);
  } finally {
    random.mockRestore();
  }
});
