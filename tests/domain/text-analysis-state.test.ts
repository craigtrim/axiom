import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  TextAnalysisInput,
  TextAnalysisResult,
  TextEntity,
} from "../../src/shared/text-analysis";

const client = vi.hoisted(() => ({
  state: {
    datasetEpoch: 1,
    version: 1,
    selected: null as string | null,
    graph: { selectedEdge: null },
  },
  preferences: { panelState: {} },
  command: vi.fn(),
  onCommand: vi.fn(),
  request: vi.fn(),
  report: vi.fn(),
  savePanel: vi.fn(),
  useSnapshot: vi.fn(),
}));
vi.mock("../../src/renderer/client", () => client);

const parsed = (input: TextAnalysisInput): TextAnalysisResult => ({
  ...input,
  canonical: input.text,
  milliseconds: 1,
  entities: ["dog", "cat"].map((label, i) => ({
    key: "ontology:" + label,
    label,
    source: "ontology",
    method: "label",
    start: i * 4,
    end: i * 4 + 3,
  })),
  concepts: Object.fromEntries(
    ["dog", "cat"].map((label) => [
      label,
      [
        {
          iri: "urn:" + label,
          label,
          kind: "Class",
          comment: "",
          parents: [],
          taxonomy: true,
        },
      ],
    ]),
  ),
});
let api: typeof import("../../src/renderer/text-analysis-state");
let parse: ReturnType<
  typeof vi.fn<(input: TextAnalysisInput) => Promise<TextAnalysisResult>>
>;
let settled: TextAnalysisResult;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(client.state, { datasetEpoch: 1, version: 1, selected: null });
  client.request.mockImplementation(async (_method, args) => {
    client.state.selected = args.iri;
  });
  parse = vi.fn(async (input: TextAnalysisInput) => parsed(input));
  vi.stubGlobal("window", { axiom: { textAnalysis: { parse } } });
  api = await import("../../src/renderer/text-analysis-state");
  api.updateAnalysisText("Dog Cat");
  await vi.advanceTimersByTimeAsync(60);
  settled = (await api.textAnalysisSession.whenReady()) as TextAnalysisResult;
});
afterEach(() => {
  api.textAnalysisSession.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(["inspect", "summary"] as const)(
  "%s waits even before the session sees an ontology edit",
  async (action) => {
    const select = vi.fn((_entity: TextEntity) => true);
    api.attachTextEditor({ focus: vi.fn(), select });
    client.state.version = 2;
    const waiting =
      action === "inspect"
        ? api.inspectTextEntity(settled.entities[0])
        : api.selectTextEntity(settled.entities[0]);
    expect(api.textAnalysisSession.getSnapshot().analysis).toEqual({
      status: "pending",
      result: settled,
    });
    await vi.advanceTimersByTimeAsync(59);
    expect(client.request).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(client.request).toHaveBeenCalledExactlyOnceWith("select", {
      iri: "urn:dog",
      datasetEpoch: 1,
      version: 2,
    });
    expect(client.command).toHaveBeenCalledWith("view.details");
    if (action === "summary") {
      expect(select).toHaveBeenCalledExactlyOnceWith(
        (await api.textAnalysisSession.whenReady())!.entities[0],
      );
      expect(select.mock.calls[0][0]).not.toBe(settled.entities[0]);
    }
  },
);

it.each([
  "removed match",
  "changed target",
  "parser error",
  "dataset switch",
  "another edit",
])("cancels retained inspection on %s", async (change) => {
  client.state.version = 2;
  if (change === "parser error")
    parse.mockRejectedValueOnce(Error("Parse failed"));
  else if (change === "removed match")
    parse.mockImplementationOnce(async (input) => ({
      ...parsed(input),
      entities: [],
    }));
  else if (change === "changed target")
    parse.mockImplementationOnce(async (input) => ({
      ...parsed(input),
      concepts: {},
    }));
  const waiting = api.inspectTextEntity(settled.entities[0], "urn:dog");
  if (change === "dataset switch") {
    client.state.datasetEpoch = 2;
    api.updateAnalysisText("Dog Cat");
  } else if (change === "another edit") api.updateAnalysisText("Dog Cat again");
  await vi.advanceTimersByTimeAsync(60);
  await waiting;
  expect(client.request).not.toHaveBeenCalled();
  expect(client.command).not.toHaveBeenCalledWith("view.details");
});

it("the last retained-match click wins when two inspections are waiting", async () => {
  client.state.version = 2;
  const dog = api.inspectTextEntity(settled.entities[0]);
  const cat = api.inspectTextEntity(settled.entities[1]);
  await vi.advanceTimersByTimeAsync(60);
  await Promise.all([dog, cat]);
  expect(client.request).toHaveBeenCalledExactlyOnceWith("select", {
    iri: "urn:cat",
    datasetEpoch: 1,
    version: 2,
  });
});

it("graph waiting synchronizes a new version before consuming results", async () => {
  client.state.version = 2;
  const consume = vi.fn();
  const waiting = api.waitForCurrentTextAnalysis().then(consume);
  await vi.advanceTimersByTimeAsync(59);
  expect(consume).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await waiting;
  expect(consume).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ datasetEpoch: 1, version: 2 }),
  );
});
