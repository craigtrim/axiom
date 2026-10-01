import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TextAnalysisContext,
  TextAnalysisInput,
} from "../../src/shared/text-analysis";
const native = vi.hoisted(() => ({
  instances: [] as {
    request: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("../../src/main/mutatoc-client", async (original) => {
  const actual =
    await original<typeof import("../../src/main/mutatoc-client")>();
  return {
    ...actual,
    MutatocClient: class {
      request = vi.fn(
        async (input: Record<string, unknown>): Promise<unknown> => {
          if (input.op === "version") return "0.3.0";
          if (input.op === "parse")
            return {
              text: "dog",
              tokens: [
                {
                  text: input.text,
                  swaps: {
                    canon: "dog",
                    type: "exact",
                    tokens: [{ text: input.text }],
                  },
                },
              ],
            };
          if (input.op === "tokenize")
            return [{ text: input.text, ent: "GPE" }];
          return {};
        },
      );
      close = vi.fn();
      constructor() {
        native.instances.push(this);
      }
    },
  };
});
import { MutatocError } from "../../src/main/mutatoc-client";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
const input = (
  text = "Dog",
  version = 1,
  datasetEpoch = 1,
): TextAnalysisInput => ({ text, version, datasetEpoch });
const graph = (version = 1, datasetEpoch = 1): TextAnalysisContext => ({
  turtle: '<urn:dog> <urn:label> "Dog" .',
  name: "test",
  version,
  datasetEpoch,
});
let service: TextAnalysisService;
let context: ReturnType<typeof vi.fn<() => Promise<TextAnalysisContext>>>;
let executable: ReturnType<typeof vi.fn<() => string>>;
beforeEach(() => {
  native.instances.length = 0;
  context = vi.fn(async () => graph());
  executable = vi.fn(() => "mutatoc.exe");
  service = new TextAnalysisService(executable, context);
});
afterEach(() => service.close());
const current = () => native.instances.at(-1)!;

describe("analysis service scheduling and failures", () => {
  it.each(["0.2.3", "0.4.0"])(
    "rejects incompatible runtime %s before loading and can recover",
    async (version) => {
      const pending = service.parse(input());
      current().request.mockResolvedValueOnce(version);
      await expect(pending).rejects.toThrow(
        `requires Mutatoc 0.3.0; the configured runtime reports ${version}`,
      );
      expect(current().request.mock.calls.map(([call]) => call.op)).toEqual([
        "version",
      ]);
      expect(current().close).toHaveBeenCalledOnce();
      expect((await service.parse(input())).entities).toMatchObject([
        { label: "dog" },
      ]);
    },
  );
  it("verifies the native version once and reuses the loaded ontology", async () => {
    await service.parse(input());
    await service.parse(input("canine"));
    expect(context).toHaveBeenCalledOnce();
    expect(executable).toHaveBeenCalledOnce();
    expect(current().request.mock.calls.map(([call]) => call.op)).toEqual([
      "version",
      "load",
      "parse",
      "parse",
    ]);
    expect(current().request.mock.calls[1][0]).toEqual({
      op: "load",
      turtle: graph().turtle,
      name: "test",
      class_based: true,
      interface: "data",
    });
  });

  it.each(["version", "datasetEpoch"] as const)(
    "reloads on a changed %s even when text is unchanged",
    async (field) => {
      await service.parse(input());
      context.mockResolvedValue({ ...graph(), [field]: 2 });
      await service.parse({ ...input(), [field]: 2 });
      expect(context).toHaveBeenCalledTimes(2);
      expect(
        current().request.mock.calls.filter(([call]) => call.op === "load"),
      ).toHaveLength(2);
      expect(
        current().request.mock.calls.filter(([call]) => call.op === "version"),
      ).toHaveLength(1);
    },
  );

  it.each(["version", "datasetEpoch"] as const)(
    "supersedes an outdated %s before loading or parsing",
    async (field) => {
      context.mockResolvedValue({ ...graph(), [field]: 2 });
      expect(await service.parse(input())).toMatchObject({
        superseded: true,
        entities: [],
      });
      expect(current().request).not.toHaveBeenCalled();
      expect(await service.parse({ ...input(), [field]: 2 })).toMatchObject({
        canonical: "dog",
      });
    },
  );

  it("keeps only the newest queued edit while context capture is pending", async () => {
    let release!: (context: TextAnalysisContext) => void;
    context.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = service.parse(input("first"));
    const middle = service.parse(input("middle"));
    const newest = service.parse(input("newest"));
    expect(await middle).toMatchObject({ text: "middle", superseded: true });
    release(graph());
    expect((await first).text).toBe("first");
    expect((await newest).text).toBe("newest");
    expect(
      current()
        .request.mock.calls.filter(([call]) => call.op === "parse")
        .map(([call]) => call.text),
    ).toEqual(["first", "newest"]);
  });

  it("discards a failed engine and reloads the same ontology on the next edit", async () => {
    await service.parse(input());
    const broken = current();
    broken.request.mockRejectedValueOnce(Error("model failure"));
    await expect(service.parse(input())).rejects.toThrow("model failure");
    expect(broken.close).toHaveBeenCalledOnce();
    expect((await service.parse(input())).canonical).toBe("dog");
    expect(native.instances).toHaveLength(2);
    expect(context).toHaveBeenCalledTimes(2);
    expect(current().request.mock.calls.map(([call]) => call.op)).toEqual([
      "version",
      "load",
      "parse",
    ]);
  });

  it("recovers after ontology capture fails", async () => {
    context.mockRejectedValueOnce(Error("workspace changed"));
    await expect(service.parse(input())).rejects.toThrow("workspace changed");
    expect((await service.parse(input())).canonical).toBe("dog");
  });

  it("uses tokenization only for the explicit empty ontology error and restores full parsing after reload", async () => {
    await service.parse(input());
    current().request.mockRejectedValueOnce(
      new MutatocError("Empty ontology", 4),
    );
    const empty = await service.parse(input("London"));
    expect(empty.entities).toEqual([]);
    current().request.mockClear();
    await service.parse(input("Paris"));
    expect(current().request.mock.calls.map(([call]) => call.op)).toEqual([
      "tokenize",
    ]);
    context.mockResolvedValue(graph(2));
    await service.parse(input("Dog", 2));
    expect(current().request.mock.calls.map(([call]) => call.op)).toEqual([
      "tokenize",
      "load",
      "parse",
    ]);
  });

  it.each([
    new MutatocError("Empty ontology", 5),
    new MutatocError("Invalid ontology", 4),
    Error("Empty ontology"),
  ])("does not hide other parser errors: %s", async (error) => {
    await service.parse(input());
    current().request.mockRejectedValueOnce(error);
    await expect(service.parse(input())).rejects.toThrow(error.message);
    expect(
      current().request.mock.calls.some(([call]) => call.op === "tokenize"),
    ).toBe(false);
  });

  it.each([
    null,
    undefined,
    {},
    { ...input(), text: 17 },
    { ...input(), version: 1.5 },
    { ...input(), datasetEpoch: NaN },
    { ...input(), version: Infinity },
    { ...input(), text: "a".repeat(100001) },
  ])("rejects invalid input %# before touching the runtime", async (value) => {
    await expect(service.parse(value as TextAnalysisInput)).rejects.toThrow(
      "100,000",
    );
    expect(executable).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "\r\n\t"])(
    "returns an empty result without starting NLP for whitespace %#",
    async (text) => {
      expect(await service.parse(input(text))).toMatchObject({
        text,
        entities: [],
        canonical: "",
      });
      expect(executable).not.toHaveBeenCalled();
    },
  );

  it("supersedes queued and context-pending work on shutdown and refuses later edits", async () => {
    let release!: (context: TextAnalysisContext) => void;
    context.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = service.parse(input());
    const queued = service.parse(input("canine"));
    service.close();
    release(graph());
    expect((await pending).superseded).toBe(true);
    expect((await queued).superseded).toBe(true);
    expect(current().request).not.toHaveBeenCalled();
    await expect(service.parse(input())).rejects.toThrow("closed");
  });
});

it("returns only matched ontology metadata and refreshes it with the loaded graph", async () => {
  const dog = {
    iri: "urn:Dog",
    label: "Domestic dog",
    kind: "Class" as const,
    comment: "Original",
    parents: [],
    taxonomy: true,
  };
  context.mockResolvedValue({
    ...graph(),
    concepts: { dog: [dog], unused: [{ ...dog, iri: "urn:Unused" }] },
  });
  const first = await service.parse(input());
  expect(first.concepts).toEqual({ dog: [dog] });
  context.mockResolvedValue({
    ...graph(2),
    concepts: { dog: [{ ...dog, comment: "Revised" }] },
  });
  const next = await service.parse(input("canine", 2));
  expect(next.concepts!.dog[0].comment).toBe("Revised");
  expect(first.concepts!.dog[0].comment).toBe("Original");
});

it("does not associate a model category with an unrelated ontology entry", async () => {
  context.mockResolvedValue({
    ...graph(),
    concepts: {
      Place: [
        {
          iri: "urn:Place",
          label: "Place",
          kind: "Class",
          comment: "",
          parents: [],
          taxonomy: true,
        },
      ],
    },
  });
  await service.parse(input());
  current().request.mockRejectedValueOnce(
    new MutatocError("Empty ontology", 4),
  );
  expect((await service.parse(input("London"))).concepts).toEqual({});
});
