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
// craigtrim/axiom#88: an explicit open saves pending text without automatic delivery.
it("retains the last keystroke before explicitly opening a completed proposal", async () => {
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
    window.axiom.queryAssistant = {
      open: async (completedAt) => {
        expect(completedAt).toBe(response.completedAt);
        expect((await service.load()).current.text).toContain("42");
        return service.openProposal(response);
      },
    } as typeof window.axiom.queryAssistant;
    // The completed response alone changes neither history nor the editor.
    client.editQuery(original, "ASK { VALUES ?n { 42 } }");
    expect(client.historyState().view?.activeId).toBe(original);
    expect(client.historyState().view?.current.text).toContain("42");
    expect((await service.load()).entries).toHaveLength(1);
    await client.openQueryProposal(response.completedAt);
    expect(client.historyState().view?.current.text).toBe(
      response.result.sparql,
    );
    await client.selectQuery(original);
    expect(client.historyState().view?.current.text).toContain("42");
  } finally {
    vi.unstubAllGlobals();
  }
});
