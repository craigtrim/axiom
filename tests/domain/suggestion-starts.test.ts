import { describe, expect, it } from "vitest";
import {
  SuggestionStarts,
  type SuggestionStartTarget,
} from "../../src/renderer/suggestion-starts";
const target = (mode = "children", iri = "urn:one"): SuggestionStartTarget => ({
  iri,
  mode,
});
describe("explicit suggestion starts", () => {
  it.each(["children", "instances", "parents", "synonyms", "custom:saved"])(
    "starts a ready %s action exactly once",
    (mode) => {
      const starts = new SuggestionStarts();
      const request = target(mode);
      starts.request("pane", request, 1);
      expect(starts.get("pane")).toEqual({ target: request, epoch: 1 });
      const release = starts.reserve(request, 1);
      expect(release).toBeTypeOf("function");
      expect(starts.get("pane")).toBeUndefined();
      expect(starts.reserve(request, 1)).toBeUndefined();
      release!();
      expect(starts.get("pane")).toBeUndefined();
    },
  );
  it("does not start a definition form, history entry, restored pane or cloned view", () => {
    const starts = new SuggestionStarts();
    starts.request("define", target("define"), 1);
    starts.request("history", { ...target(), runId: "earlier" }, 1);
    starts.request("clone", target(), 1, false);
    for (const pane of ["define", "history", "clone", "restored"])
      expect(starts.get(pane)).toBeUndefined();
  });
  it("reuses a running request across panes and notifies a waiting different target", () => {
    const starts = new SuggestionStarts();
    const first = target(),
      second = target("instances", "urn:two");
    starts.request("one", first, 1);
    starts.request("duplicate", { ...first }, 1);
    const release = starts.reserve(first, 1)!;
    expect(starts.get("duplicate")).toBeUndefined();
    starts.request("again", { ...first }, 1);
    expect(starts.get("again")).toBeUndefined();
    starts.request("two", second, 1);
    expect(starts.reserve(second, 1)).toBeUndefined();
    const revision = starts.snapshot();
    release();
    expect(starts.snapshot()).toBeGreaterThan(revision);
    expect(starts.get("two")?.target).toBe(second);
    expect(starts.reserve(second, 1)).toBeTypeOf("function");
    // A second release from an old job cannot release the new job.
    release();
    expect(starts.reserve(second, 1)).toBeUndefined();
  });
  it("allows the independent engines but serializes values and parents", () => {
    const starts = new SuggestionStarts();
    expect(starts.reserve(target(), 1)).toBeTypeOf("function");
    const release = starts.reserve(target("synonyms"), 1)!;
    expect(release).toBeTypeOf("function");
    expect(starts.reserve(target("parents"), 1)).toBeUndefined();
    release();
    expect(starts.reserve(target("parents"), 1)).toBeTypeOf("function");
  });
  it("replaces a pending selection and cancels it when browsing history", () => {
    const starts = new SuggestionStarts();
    const first = target(),
      second = target("synonyms");
    starts.request("pane", first, 1);
    starts.request("pane", second, 1);
    expect(starts.consume("pane", first, 1)).toBe(false);
    expect(starts.get("pane")?.target).toBe(second);
    expect(starts.consume("pane", second, 1)).toBe(true);
    expect(starts.get("pane")).toBeUndefined();
  });
  it("drops pending requests from a replaced workspace", () => {
    const starts = new SuggestionStarts();
    starts.request("old", target(), 1);
    starts.request("current", target(), 2);
    starts.clearOtherEpochs(2);
    expect(starts.get("old")).toBeUndefined();
    expect(starts.get("current")?.epoch).toBe(2);
  });
});
