import { it, expect, vi } from "vitest";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { QueryHistoryService } from "../../src/main/query-history-service";
import type { QueryAssistantResponse } from "../../src/shared/query-assistant";
vi.mock("../../src/renderer/client", () => ({
  onCommand: () => () => {},
  panel: (_key: string, value: unknown) => value,
  savePanel: () => {},
  state: null,
  report: () => {},
}));
it("retains a keystroke when generation arrives before the debounced disk save", async () => {
  await mkdir("artifacts/testing", { recursive: true });
  const dir = await mkdtemp(path.resolve("artifacts/testing/query-client-"));
  let receive = (_event: unknown) => {};
  const service = new QueryHistoryService(
    path.join(dir, "history.json"),
    () => "ASK {}",
    (view) => receive({ type: "query-history", data: view }),
  );
  vi.stubGlobal("window", {
    axiom: {
      onEvent: (fn: typeof receive) => {
        receive = fn;
        return () => {};
      },
      queryHistory: {
        load: () => service.load(),
        apply: service.apply.bind(service),
      },
    },
  });
  try {
    const client = await import("../../src/renderer/query-history");
    await client.connectQueryHistory();
    const original = (await service.load()).activeId;
    const baseline = await service.baseline();
    const response: QueryAssistantResponse = {
      completedAt: new Date().toISOString(),
      validation: null,
      request: {
        provider: "codex",
        instructions: "List classes",
        currentQuery: "",
        datasetEpoch: 1,
        version: 1,
      },
      context: {
        datasetEpoch: 1,
        version: 1,
        ontology: "Test",
        namespace: "urn:test:",
        tripleCount: 1,
        entityCount: 1,
        omitted: 0,
        terms: [],
        predicates: [],
        types: [],
      },
      result: {
        status: "query",
        sparql: "SELECT ?s WHERE {?s a owl:Class}",
        explanation: "Lists classes.",
        assumptions: [],
      },
    };
    // Deliver immediately; the renderer's 250 ms save timer has not fired.
    client.editQuery(original, "ASK { VALUES ?n { 42 } }");
    const delivered = await service.deliver(response, baseline);
    expect(client.historyState().view?.activeId).toBe(original);
    expect(client.historyState().view?.current.text).toContain("42");
    await client.flushQueryHistory();
    await vi.waitFor(async () => {
      const saved = await service.load();
      expect(saved.activeId).toBe(original);
      expect(saved.pendingId).toBe(delivered.entries[1].id);
      expect(saved.current.text).toContain("42");
    });
    await client.selectQuery(delivered.entries[1].id);
    expect(client.historyState().view?.current.text).toBe(
      response.result.sparql,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
