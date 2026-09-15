import { beforeEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { QueryHistoryService } from "../../src/main/query-history-service";
import {
  queryResultId,
  type QueryRunRecord,
} from "../../src/shared/query-history";
let service: QueryHistoryService, file: string, queryId: string;
const text = 'SELECT ?x WHERE { VALUES ?x { "original" } }';
beforeEach(async () => {
  await mkdir("artifacts/testing", { recursive: true });
  file = path.join(
    await mkdtemp(path.resolve("artifacts/testing/query-results-unit-")),
    "queries.json",
  );
  service = new QueryHistoryService(file, () => text);
  queryId = (await service.load()).activeId;
});
const record = (id = 1, query = text): QueryRunRecord => ({
  text: query,
  session: service.session,
  datasetEpoch: 2,
  title: "Original query",
  origin: "Executed ontology",
  namespace: "urn:executed:",
  summary: {
    id,
    queryType: "SELECT",
    columns: ["?x"],
    rowCount: 1,
    total: 1,
    capped: false,
    milliseconds: 3,
    storeVersion: 4,
  },
});
async function run(r = record()) {
  await service.apply({ type: "run", id: queryId, run: r });
  return (await service.result(queryResultId(r)))!;
}
it("keeps each execution and its ontology after editing and rerunning the same query", async () => {
  const first = await run();
  const newer = 'SELECT ?x WHERE { VALUES ?x { "newer" } }';
  await service.apply({ type: "edit", id: queryId, text: newer });
  const second = await run(record(2, newer));
  expect(await service.result(first.id)).toEqual(first);
  expect(second.run.text).toBe(newer);
  expect(first.queryId).toBe(queryId);
  expect(first.origin).toBe("Executed ontology");
  expect(first.namespace).toBe("urn:executed:");
  expect(first.completedAt).toMatch(/^\d{4}-/);
});
it("reopens the source without creating a duplicate when only formatting changed", async () => {
  const result = await run();
  await service.apply({
    type: "edit",
    id: queryId,
    text: '# comment\nselect ?x where {\nvalues ?x { "original" }\n}',
  });
  const opened = await service.apply({ type: "open-run", resultId: result.id });
  expect(opened.activeId).toBe(queryId);
  expect(opened.entries).toHaveLength(1);
  expect((await service.result(result.id))!.run.text).toBe(text);
});
it("recovers the executed query as a new document without overwriting a newer draft", async () => {
  const result = await run();
  await service.apply({
    type: "edit",
    id: queryId,
    text: "SELECT ?unfinished WHERE {",
  });
  const opened = await service.apply({ type: "open-run", resultId: result.id });
  expect(opened.activeId).not.toBe(queryId);
  expect(opened.current.text).toBe(text);
  expect(opened.current.lastRun?.queryKey).toBe(queryId);
  expect(
    (await service.apply({ type: "select", id: queryId })).current.text,
  ).toBe("SELECT ?unfinished WHERE {");
  const again = await service.apply({ type: "open-run", resultId: result.id });
  expect(again.activeId).toBe(opened.activeId);
  expect(again.entries).toHaveLength(2);
});
it("does not overwrite edits to a previously recovered execution", async () => {
  const result = await run();
  await service.apply({ type: "edit", id: queryId, text: "ASK {}" });
  const restored = await service.apply({
    type: "open-run",
    resultId: result.id,
  });
  await service.apply({
    type: "edit",
    id: restored.activeId,
    text: "ASK {VALUES ?x {2}}",
  });
  const recovered = await service.apply({
    type: "open-run",
    resultId: result.id,
  });
  expect(recovered.entries).toHaveLength(3);
  expect(recovered.current.text).toBe(text);
  expect(
    (await service.apply({ type: "select", id: restored.activeId })).current
      .text,
  ).toContain("{2}");
});
it("retains execution details across app restart without pretending rows belong to the new session", async () => {
  const result = await run();
  service = new QueryHistoryService(file, () => "wrong");
  expect(await service.result(result.id)).toEqual(result);
  expect((await service.load()).session).not.toBe(result.run.session);
  expect(
    (await service.apply({ type: "open-run", resultId: result.id })).current
      .text,
  ).toBe(text);
});
it("rejects replacing an existing run and preserves the recorded execution", async () => {
  const result = await run();
  await expect(run(record(1, "ASK {}"))).rejects.toThrow("already recorded");
  expect(await service.result(result.id)).toEqual(result);
});
it("keeps a long executed query in history instead of the pane layout", async () => {
  const long = text + "\n#" + "x".repeat(90000);
  const result = await run(record(1, long));
  service = new QueryHistoryService(file, () => "wrong");
  expect((await service.result(result.id))!.run.text).toBe(long);
  expect(JSON.parse(await readFile(file, "utf8")).results).toHaveLength(1);
});
it("rejects an unknown execution without changing the active query", async () => {
  await expect(
    service.apply({ type: "open-run", resultId: "missing" }),
  ).rejects.toThrow("could not be found");
  expect((await service.load()).activeId).toBe(queryId);
});

it("numbers runs across sessions even when the worker execution counter restarts", async () => {
  const first = await run();
  service = new QueryHistoryService(file, () => "wrong");
  const second = await run(record(1, "ASK {}"));
  expect(second.sequence).toBe(first.sequence + 1);
  expect(second.id).not.toBe(first.id);
  expect(await service.result(first.id)).toEqual(first);
});
it("migrates legacy last-run references without inventing a completion time", async () => {
  const result = await run();
  const stored = JSON.parse(await readFile(file, "utf8"));
  delete stored.results;
  await writeFile(file, JSON.stringify(stored));
  service = new QueryHistoryService(file, () => "wrong");
  const recovered = await service.result(result.id);
  expect(recovered?.run.text).toBe(text);
  expect(recovered?.queryId).toBe(queryId);
  expect(recovered?.completedAt).toBe("");
});
