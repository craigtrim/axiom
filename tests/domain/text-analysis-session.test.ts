import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TextAnalysisSession,
  textEntityGroups,
} from "../../src/renderer/text-analysis-session";
import { textEntityConcepts } from "../../src/shared/text-analysis";
import { readPreferences } from "../../src/shared/preferences";
import { readTabHistory } from "../../src/shared/tab-history";
import type {
  TextAnalysisInput,
  TextAnalysisResult,
} from "../../src/shared/text-analysis";
const input = (
  text = "Dog",
  version = 1,
  datasetEpoch = 1,
): TextAnalysisInput => ({ text, version, datasetEpoch });
const result = (args: TextAnalysisInput): TextAnalysisResult => ({
  ...args,
  canonical: args.text.toLowerCase(),
  milliseconds: 1,
  entities: [
    {
      start: 0,
      end: args.text.length,
      key: "ontology:dog",
      label: "dog",
      source: "ontology",
      method: "label",
    },
  ],
});
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  const parse = vi.fn(async (args: TextAnalysisInput) => result(args));
  return { parse, session: new TextAnalysisSession(parse) };
}
async function ready(session: TextAnalysisSession, args = input()) {
  session.update(args);
  await vi.advanceTimersByTimeAsync(60);
  const analysis = session.getSnapshot().analysis;
  if (analysis.status !== "ready") throw Error("Expected an analysis result");
  return analysis.result;
}
describe("shared Text Analysis session", () => {
  it("switches text and Summary without reparsing or discarding nested creation drafts", async () => {
    const { session, parse } = setup();
    const result = await ready(session);
    session.create("New Dog");
    const draft = {
      frames: [
        {
          value: {
            label: "New Dog",
            comment: "Retain description",
            parents: [],
            manualParents: true,
          },
        },
        {
          value: {
            label: "New parent",
            comment: "Retain nested draft",
            parents: [],
            manualParents: false,
          },
        },
      ],
    };
    session.updateDraft(draft);
    const before = session.getSnapshot();
    session.setView("summary");
    expect(session.getSnapshot()).toEqual({ ...before, view: "summary" });
    session.setView("text");
    expect(session.getSnapshot()).toEqual(before);
    expect(session.getSnapshot().creation?.draft).toBe(draft);
    expect(await session.whenReady()).toBe(result);
    expect(parse).toHaveBeenCalledTimes(1);
    session.dispose();
  });
  it.each(["text", "summary"])(
    "persists the %s presentation preference",
    (view) => {
      expect(
        readPreferences({
          version: 1,
          panelState: { "textanalysis.view": view },
        }).panelState?.["textanalysis.view"],
      ).toBe(view);
    },
  );
  it("rejects invalid presentation preferences", () => {
    expect(
      readPreferences({
        version: 1,
        panelState: { "textanalysis.view": "add" },
      }).panelState?.["textanalysis.view"],
    ).toBeUndefined();
  });
  it.each([
    ["Text Entities", false, "Add entity"],
    ["Text Entities_8", false, "Add entity_8"],
    ["Text Entities_8", true, "Text Entities_8"],
    ["My drafts", true, "My drafts"],
  ])(
    "migrates automatic pane names while retaining custom names: %s",
    (name, named, expected) => {
      const entry = {
        id: "textentities",
        type: "textentities",
        name,
        named,
        createdAt: "2026-09-27T12:00:00Z",
        updatedAt: "2026-09-27T12:00:00Z",
        config: { axiomTab: { defaultName: "Text Entities_8", named } },
        panelState: {},
      };
      const history = readTabHistory({
        version: 1,
        entries: [entry],
        counters: { textentities: 8 },
      });
      expect(history.entries[0].name).toBe(expected);
      expect(history.entries[0].config.axiomTab).toEqual({
        defaultName: "Add entity_8",
        named,
      });
      expect(entry.config.axiomTab.defaultName).toBe("Text Entities_8");
      expect(history.counters.textentities).toBe(8);
    },
  );
  it("retains the exact result throughout typing and releases actions only with fresh analysis", async () => {
    const { session } = setup();
    const settled = await ready(session);
    const publications: unknown[] = [];
    session.subscribe(() => publications.push(session.getSnapshot().analysis));
    session.update(input("Dog and Cat"));
    expect(publications).toEqual([
      { status: "pending", result: settled },
      { status: "pending", result: settled },
    ]);
    const action = vi.fn();
    const waiting = session.whenReady().then(action);
    await vi.advanceTimersByTimeAsync(59);
    expect(action).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(action).toHaveBeenCalledExactlyOnceWith(
      result(input("Dog and Cat")),
    );
    session.dispose();
  });
  it.each([
    ["another edit", input("Cat")],
    ["empty text", input("")],
    ["oversized text", input("x".repeat(100001))],
    ["ontology switch", input("Dog", 1, 2)],
    ["ontology mutation", input("Dog", 2)],
  ])("cancels a queued graph action after %s", async (_, next) => {
    const { session } = setup();
    await ready(session);
    session.update(input("Dog again"));
    const action = session.whenReady();
    session.update(next);
    expect(await action).toBeUndefined();
    session.dispose();
  });
  it.each([
    input("Dog", 2),
    input("Dog", 1, 2),
    input(""),
    input("x".repeat(100001)),
  ])(
    "does not retain results across invalid input or ontology changes %#",
    async (next) => {
      const { session } = setup();
      await ready(session);
      session.update(next);
      expect(session.getSnapshot().analysis).not.toHaveProperty("result");
      session.dispose();
    },
  );
  it("resolves waiting actions on disposal without publishing late results", async () => {
    const { session } = setup();
    await ready(session);
    session.update(input("Dog again"));
    const action = session.whenReady();
    session.dispose();
    expect(await action).toBeUndefined();
    await vi.advanceTimersByTimeAsync(60);
    expect(session.getSnapshot().analysis.status).toBe("pending");
  });
  it("releases waiting actions without data on parser failure and recovers on correction", async () => {
    const { session, parse } = setup();
    await ready(session);
    parse.mockRejectedValueOnce(Error("native worker failed"));
    session.update(input("Dog again"));
    const action = session.whenReady();
    await vi.advanceTimersByTimeAsync(60);
    expect(await action).toBeUndefined();
    expect(session.getSnapshot().analysis).toEqual({
      status: "error",
      message: "native worker failed",
    });
    expect(await ready(session, input("Cat"))).toMatchObject({ text: "Cat" });
    session.dispose();
  });
  it("runs one analysis for both views and retains it when subscribers close and reopen", async () => {
    const { parse, session } = setup();
    const editor = vi.fn(),
      entities = vi.fn();
    const closeEditor = session.subscribe(editor),
      closeEntities = session.subscribe(entities);
    const value = await ready(session);
    session.update(input());
    expect(parse).toHaveBeenCalledTimes(1);
    expect(editor).toHaveBeenCalled();
    expect(entities).toHaveBeenCalled();
    closeEditor();
    closeEntities();
    const reopened = session.subscribe(vi.fn());
    session.update(input());
    await vi.advanceTimersByTimeAsync(60);
    expect(session.getSnapshot().analysis).toEqual({
      status: "ready",
      result: value,
    });
    expect(parse).toHaveBeenCalledTimes(1);
    reopened();
    session.dispose();
  });
  it("shares details and rejects entity selections from an obsolete result", async () => {
    const { session } = setup();
    const old = await ready(session);
    session.showDetails(old.entities[0]);
    expect(session.getSnapshot().details?.entity).toBe(old.entities[0]);
    session.update(input("Cat"));
    expect(session.getSnapshot()).toMatchObject({
      mode: "summary",
      details: undefined,
    });
    await vi.advanceTimersByTimeAsync(60);
    session.showDetails(old.entities[0]);
    expect(session.getSnapshot().mode).toBe("summary");
    session.dispose();
  });
  it("inspection in the shared Details view does not replace or discard a class draft", async () => {
    const { session } = setup();
    const parsed = await ready(session);
    session.create("New Systems");
    session.showDetails(parsed.entities[0]);
    expect(session.getSnapshot()).toMatchObject({
      mode: "add",
      creation: { phrase: "New Systems" },
      details: { entity: parsed.entities[0] },
    });
    session.clearDetails();
    expect(session.getSnapshot()).toMatchObject({
      mode: "add",
      creation: { phrase: "New Systems" },
      details: undefined,
    });
    session.showDetails(parsed.entities[0]);
    session.summary();
    expect(session.getSnapshot().details?.entity).toBe(parsed.entities[0]);
    session.dispose();
  });
  it("keeps ambiguous ontology targets separate and gives model annotations no inferred target", () => {
    const parsed = result(input());
    const concept = {
      label: "Dog",
      kind: "Class" as const,
      comment: "",
      parents: [],
      taxonomy: true,
    };
    parsed.concepts = {
      dog: [
        { ...concept, iri: "urn:first:Dog" },
        { ...concept, iri: "urn:second:Dog" },
      ],
    };
    expect(
      textEntityConcepts(parsed, parsed.entities[0]).map((item) => item.iri),
    ).toEqual(["urn:first:Dog", "urn:second:Dog"]);
    expect(
      textEntityConcepts(parsed, { ...parsed.entities[0], source: "model" }),
    ).toEqual([]);
    expect(
      textEntityConcepts(parsed, { ...parsed.entities[0], label: "__proto__" }),
    ).toEqual([]);
  });
  it("retains a creation draft through ontology edits but clears it on a new dataset or text edit", async () => {
    const { session } = setup();
    await ready(session);
    session.create("New Systems");
    session.update(input("Dog", 2));
    expect(session.getSnapshot()).toMatchObject({
      mode: "add",
      creation: { phrase: "New Systems", datasetEpoch: 1 },
    });
    session.update(input("Dog", 2, 2));
    expect(session.getSnapshot()).toMatchObject({
      mode: "summary",
      creation: undefined,
    });
    session.create("More Systems");
    session.update(input("Cat", 2, 2));
    expect(session.getSnapshot().creation).toBeUndefined();
    session.dispose();
  });
  it("retains an unfinished class draft across subscriber changes and clears it with its selection", async () => {
    const { session } = setup();
    await ready(session);
    session.create("New Systems");
    const draft = {
      frames: [
        {
          value: {
            label: "New Systems",
            comment: "Preserve me",
            parents: [
              { iri: "urn:systems" },
              {
                create: {
                  label: "New parent",
                  comment: "Also preserve",
                  parents: [{ iri: "urn:root" }],
                  manualParents: true,
                },
              },
            ],
            manualParents: true,
          },
        },
        {
          value: {
            label: "Another parent",
            comment: "Still editing",
            parents: [],
            manualParents: false,
          },
        },
      ],
    };
    session.updateDraft(draft);
    session.subscribe(vi.fn())();
    expect(session.getSnapshot().creation?.draft).toEqual(draft);
    session.setMode("summary");
    session.setMode("add");
    expect(session.getSnapshot().creation?.draft).toEqual(draft);
    session.summary();
    session.updateDraft(draft);
    expect(session.getSnapshot().creation).toBeUndefined();
    session.dispose();
  });
  it("clears pending drafts and success notices when restoring a workspace with the same text", async () => {
    const { session } = setup();
    await ready(session);
    session.added("urn:new", "New", ["urn:parent"]);
    expect(session.getSnapshot().created?.iri).toBe("urn:new");
    session.reset(input());
    expect(session.getSnapshot()).toMatchObject({
      mode: "summary",
      created: undefined,
      creation: undefined,
    });
    session.create("New");
    session.reset(input());
    expect(session.getSnapshot().creation).toBeUndefined();
    session.dispose();
  });
  it("does not publish an earlier ontology result after both views switch datasets", async () => {
    vi.useFakeTimers();
    const pending: {
      input: TextAnalysisInput;
      resolve: (value: TextAnalysisResult) => void;
    }[] = [];
    const session = new TextAnalysisSession(
      (args) =>
        new Promise((resolve) => pending.push({ input: args, resolve })),
    );
    session.update(input());
    await vi.advanceTimersByTimeAsync(60);
    session.update(input("Cat", 1, 2));
    await vi.advanceTimersByTimeAsync(60);
    pending[0].resolve(result(pending[0].input));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().analysis.status).toBe("pending");
    pending[1].resolve(result(pending[1].input));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().analysis).toMatchObject({
      status: "ready",
      result: { text: "Cat", datasetEpoch: 2 },
    });
    session.dispose();
  });
  it("cannot open absent tabs or invalid selections", async () => {
    const { session } = setup();
    await ready(session);
    session.setMode("add");
    session.create(" ");
    session.create("a".repeat(257));
    expect(session.getSnapshot()).toMatchObject({
      mode: "summary",
      details: undefined,
      creation: undefined,
    });
    session.dispose();
  });
  it("counts occurrences consistently for both view color mappings", () => {
    const parsed = result(input());
    parsed.entities.push({ ...parsed.entities[0], start: 4, end: 7 });
    expect(textEntityGroups(parsed)).toEqual([
      { entity: parsed.entities[0], count: 2 },
    ]);
    expect(textEntityGroups()).toEqual([]);
  });
  it("restores the dockable view through normal tab history and retains its layout migration marker", () => {
    const entry = {
      id: "textentities",
      type: "textentities",
      name: "Text Entities",
      named: false,
      createdAt: "2026-09-27T12:00:00Z",
      updatedAt: "2026-09-27T12:00:00Z",
      config: {},
      panelState: {},
    };
    expect(
      readTabHistory({
        version: 1,
        entries: [entry],
        counters: { textentities: 1 },
      }).entries,
    ).toEqual([{ ...entry, name: "Add entity" }]);
    expect(
      readPreferences({
        version: 1,
        panelState: { "textanalysis.entitiesView": true },
      }).panelState?.["textanalysis.entitiesView"],
    ).toBe(true);
  });
});
