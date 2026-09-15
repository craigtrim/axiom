import { beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { QueryHistoryService } from "../../src/main/query-history-service";
import { QueryResultCache } from "../../src/main/query-result-cache";
import type { QueryAssistantResponse } from "../../src/shared/query-assistant";
import type { QueryResult } from "../../src/domain/query";
let service: QueryHistoryService, file: string;
const initial = "SELECT ?s WHERE { ?s ?p ?o }";
const add = (text: string) =>
  service.apply({
    type: "add",
    text,
    origin: "Test ontology",
    namespace: "urn:test:",
  });
const response = (
  validation: string | null = null,
): QueryAssistantResponse => ({
  completedAt: "2026-09-14T22:00:00.000Z",
  validation,
  request: {
    provider: "codex",
    instructions: "List classes",
    currentQuery: "",
    datasetEpoch: 1,
    version: 2,
  },
  context: {
    datasetEpoch: 1,
    version: 2,
    ontology: "Test",
    namespace: "urn:test:",
    tripleCount: 5,
    entityCount: 3,
    omitted: 0,
    terms: [],
    predicates: [],
    types: [],
  },
  result: {
    status: "query",
    sparql: "SELECT ?c WHERE {?c a owl:Class}",
    explanation: "Lists classes.",
    assumptions: [],
  },
});
beforeEach(async () => {
  await mkdir("artifacts/testing", { recursive: true });
  const dir = await mkdtemp(
    path.resolve("artifacts/testing/query-history-unit-"),
  );
  file = path.join(dir, "queries.json");
  service = new QueryHistoryService(file, () => initial);
});
describe("persistent query documents", () => {
  it("imports the existing editor and retains drafts across restart", async () => {
    const first = await service.load();
    await service.apply({
      type: "edit",
      id: first.activeId,
      text: "ASK {}",
      viewState: { cursorState: [{ position: { lineNumber: 1, column: 3 } }] },
    });
    const reopened = await new QueryHistoryService(file, () => "wrong").load();
    expect(reopened.entries).toHaveLength(1);
    expect(reopened.current.text).toBe("ASK {}");
    expect(reopened.current.viewState).toEqual({
      cursorState: [{ position: { lineNumber: 1, column: 3 } }],
    });
    expect(reopened.session).not.toBe(first.session);
  });
  it("New query keeps drafts, and branching keeps the forward entries", async () => {
    const first = await service.load(),
      second = await add("ASK { VALUES ?x { 2 } }");
    await service.apply({ type: "select", id: first.activeId });
    await service.apply({
      type: "edit",
      id: first.activeId,
      text: "SELECT ?x WHERE { VALUES ?x { 1 } }",
    });
    const third = await add("");
    expect(third.entries.map((e) => e.id)).toEqual([
      first.activeId,
      second.activeId,
      third.activeId,
    ]);
    expect(
      (await service.apply({ type: "select", id: second.activeId })).current
        .text,
    ).toBe("ASK { VALUES ?x { 2 } }");
    expect(
      (await service.apply({ type: "select", id: first.activeId })).current
        .text,
    ).toContain("VALUES ?x { 1 }");
  });
  it("serializes overlapping saves without losing another document", async () => {
    const first = await service.load(),
      second = await add("second");
    await Promise.all([
      service.apply({
        type: "edit",
        id: first.activeId,
        text: "first changed",
      }),
      service.apply({
        type: "edit",
        id: second.activeId,
        text: "second changed",
      }),
    ]);
    const disk = JSON.parse(await readFile(file, "utf8"));
    expect(disk.entries.map((e: { text: string }) => e.text)).toEqual([
      "first changed",
      "second changed",
    ]);
  });
  it("searches the whole query rather than only its preview", async () => {
    const v = await add("# " + "x".repeat(400) + "\nSELECT ?rareTerm WHERE {}");
    expect((await service.search("rareTerm")).map((e) => e.id)).toEqual([
      v.activeId,
    ]);
  });
  it("keeps a corrupt history file intact", async () => {
    await writeFile(file, "{broken");
    await expect(service.load()).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("{broken");
  });
  it("rejects an oversized edit without preventing later valid saves", async () => {
    const v = await service.load();
    await expect(
      service.apply({ type: "edit", id: v.activeId, text: "x".repeat(100001) }),
    ).rejects.toThrow("100,000");
    expect(
      (await service.apply({ type: "edit", id: v.activeId, text: "ASK {}" }))
        .current.text,
    ).toBe("ASK {}");
  });
});
describe("agent delivery", () => {
  it("opens the generated query while retaining the source, and delivers it once", async () => {
    const first = await service.load(),
      baseline = await service.baseline(first.activeId);
    const delivered = await service.deliver(response(), baseline);
    expect(delivered.entries).toHaveLength(2);
    expect(delivered.current.text).toBe(response().result.sparql);
    expect(delivered.current.generation?.result.explanation).toBe(
      "Lists classes.",
    );
    expect((await service.deliver(response(), baseline)).entries).toHaveLength(
      2,
    );
    expect(
      (await service.apply({ type: "select", id: first.activeId })).current
        .text,
    ).toBe(initial);
  });
  it("preserves newer edits and offers the generated query as a new page", async () => {
    const first = await service.load(),
      baseline = await service.baseline(first.activeId);
    await service.apply({
      type: "edit",
      id: first.activeId,
      text: "ASK {VALUES ?x {42}}",
    });
    const delivered = await service.deliver(response(), baseline);
    expect(delivered.activeId).toBe(first.activeId);
    expect(delivered.current.text).toContain("42");
    expect(delivered.pendingId).toBe(delivered.entries[1].id);
    const opened = await service.apply({
      type: "select",
      id: delivered.pendingId!,
    });
    expect(opened.pendingId).toBeUndefined();
    expect(opened.current.text).toBe(response().result.sparql);
  });
  it("does not take over a different query while generation is running", async () => {
    const baseline = await service.baseline(),
      other = await add("ASK {}");
    const delivered = await service.deliver(response(), baseline);
    expect(delivered.activeId).toBe(other.activeId);
    expect(delivered.entries).toHaveLength(3);
    expect(delivered.pendingId).toBeTruthy();
  });
  it("keeps validation information with generated SPARQL for editing", async () => {
    const v = await service.deliver(
      response("Unknown property"),
      await service.baseline(),
    );
    expect(v.current.generation?.validation).toBe("Unknown property");
    expect(v.current.text).toBe(response().result.sparql);
  });
  it("does not create empty pages for unsupported requests", async () => {
    const r = response();
    r.result = {
      status: "unsupported",
      sparql: "",
      explanation: "Remote service unavailable.",
      assumptions: [],
    };
    const v = await service.deliver(r, await service.baseline());
    expect(v.entries).toHaveLength(1);
  });
});
const result = (count: number): QueryResult => ({
  queryType: "SELECT",
  columns: ["?n"],
  rows: Array.from({ length: count }, (_, i) => [
    { value: String(i), literal: true },
  ]),
  total: count,
  capped: false,
  iris: [],
  milliseconds: 1,
  storeVersion: 1,
});
describe("result ownership and retention", () => {
  it("retains separate rows and rejects the wrong query owner", () => {
    const cache = new QueryResultCache();
    cache.add(1, "a", "one", result(2));
    cache.add(2, "b", "two", result(3));
    expect(cache.get(1, "a")?.result.rows).toHaveLength(2);
    expect(cache.get(1, "b")).toBeUndefined();
    expect(cache.get(2, "b")?.text).toBe("two");
  });
  it("evicts least recently used results within its row budget", () => {
    const cache = new QueryResultCache(5, 3);
    cache.add(1, "a", "one", result(2));
    cache.add(2, "b", "two", result(2));
    cache.get(1);
    cache.add(3, "c", "three", result(2));
    expect(cache.get(2)).toBeUndefined();
    expect(cache.get(1)).toBeDefined();
    expect(cache.get(3)).toBeDefined();
    cache.clear();
    expect(cache.get(1)).toBeUndefined();
  });
});
