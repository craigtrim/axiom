import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetainedPreview } from "../../src/renderer/retained-preview";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("retained validation feedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("debounces edits and only requests the last draft", async () => {
    const preview = new RetainedPreview<string>(),
      first = vi.fn(async () => "old"),
      last = vi.fn(async () => "new");
    preview.update("a", "ontology", first, 120);
    await vi.advanceTimersByTimeAsync(100);
    preview.update("ab", "ontology", last, 120);
    await vi.advanceTimersByTimeAsync(120);
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
    expect(preview.getSnapshot().value).toBe("new");
  });
  it("keeps feedback and waits for the current request when clicked", async () => {
    const preview = new RetainedPreview<string>(),
      next = deferred<string>();
    preview.update("a", "ontology", async () => "old feedback", 120);
    await preview.validate();
    const before = preview.getSnapshot();
    preview.update("ab", "ontology", () => next.promise, 120);
    expect(preview.getSnapshot()).toBe(before);
    let finished = false;
    const action = preview.validate().then((value) => {
      finished = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toBe(false);
    next.resolve("current validation");
    expect(await action).toBe("current validation");
  });
  it("shares a request for repeated validation calls", async () => {
    const preview = new RetainedPreview<number>(),
      load = vi.fn(async () => 17);
    preview.update("draft", "ontology", load, 120);
    expect(await Promise.all([preview.validate(), preview.validate()])).toEqual(
      [17, 17],
    );
    preview.update("draft", "ontology", load, 120);
    expect(await preview.validate()).toBe(17);
    expect(load).toHaveBeenCalledTimes(1);
  });
  for (const late of ["success", "failure"] as const) {
    it(`ignores a late ${late} and cancels the old action after a newer edit`, async () => {
      const preview = new RetainedPreview<string>(),
        old = deferred<string>();
      preview.update("a", "ontology", () => old.promise, 0);
      const action = preview.validate();
      await vi.advanceTimersByTimeAsync(0);
      preview.update("ab", "ontology", async () => "new", 0);
      expect(await action).toBeUndefined();
      await preview.validate();
      if (late === "success") old.resolve("old");
      else old.reject(Error("old failure"));
      await vi.advanceTimersByTimeAsync(0);
      expect(preview.getSnapshot()).toMatchObject({
        value: "new",
        error: "",
        settledKey: "ab",
      });
    });
  }
  it("preserves a service error through edits until a successful check", async () => {
    const preview = new RetainedPreview<string>(),
      next = deferred<string>();
    preview.update("good", "ontology", async () => "source", 0);
    await preview.validate();
    preview.update(
      "bad",
      "ontology",
      async () => {
        throw Error("Unavailable");
      },
      0,
    );
    expect(await preview.validate()).toBeUndefined();
    preview.update("retry", "ontology", () => next.promise, 120);
    expect(preview.getSnapshot()).toMatchObject({
      value: "source",
      error: "Unavailable",
    });
    const action = preview.validate();
    next.resolve("new source");
    await action;
    expect(preview.getSnapshot()).toMatchObject({
      value: "new source",
      error: "",
    });
  });
  it("clears feedback immediately on ontology changes and cannot commit the old result", async () => {
    const preview = new RetainedPreview<string>(),
      old = deferred<string>();
    preview.update("draft", "one", async () => "source", 0);
    await preview.validate();
    preview.update("next", "one", () => old.promise, 0);
    const action = preview.validate();
    preview.update("draft", "two", async () => "second ontology", 120);
    expect(preview.getSnapshot()).toEqual({ scope: "two", error: "" });
    expect(await action).toBeUndefined();
    old.resolve("obsolete");
    expect(await preview.validate()).toBe("second ontology");
  });
  it("cancels pending actions when disposed without waiting for the service", async () => {
    const preview = new RetainedPreview<string>(),
      pending = deferred<string>();
    preview.update("draft", "one", () => pending.promise, 0);
    const action = preview.validate();
    preview.cancel();
    expect(await action).toBeUndefined();
    pending.resolve("too late");
    await vi.advanceTimersByTimeAsync(0);
    expect(preview.getSnapshot().value).toBeUndefined();
  });
  it("disabling a check cancels its action while retaining completed feedback", async () => {
    const preview = new RetainedPreview<string>();
    preview.update("draft", "one", async () => "kept", 0);
    await preview.validate();
    preview.update(null, "one", async () => "unused", 0);
    expect(await preview.validate()).toBeUndefined();
    expect(preview.getSnapshot().value).toBe("kept");
  });
});
