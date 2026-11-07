// craigtrim/axiom#221: close signals release captures without requiring hidden-window frames.
import { expect, it, vi } from "vitest";
import { WorkspaceCaptureFrames } from "../../src/renderer/workspace-capture-frames";

function fixture() {
  let next = 0;
  const pending = new Map<number, () => void>();
  const request = vi.fn((callback: () => void) => {
    const frame = ++next;
    pending.set(frame, callback);
    return frame;
  });
  const cancel = vi.fn((frame: number) => {
    pending.delete(frame);
  });
  return {
    capture: new WorkspaceCaptureFrames({ request, cancel }),
    request,
    cancel,
    pending,
    paint() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
  };
}

it("retains two distinct frame waits for visible layout capture", async () => {
  const f = fixture();
  const finished = vi.fn();
  const capture = f.capture.waitForLayout().then(finished);
  expect(f.request).toHaveBeenCalledTimes(1);
  f.paint();
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  expect(f.request).toHaveBeenCalledTimes(2);
  expect(f.pending.size).toBe(1);
  f.paint();
  await capture;
  expect(finished).toHaveBeenCalledTimes(1);
  expect(f.pending.size).toBe(0);
});

it.each([0, 1])(
  "closing releases a capture after %s visible frames without another paint",
  async (painted) => {
    const f = fixture();
    const finished = vi.fn();
    const capture = f.capture.waitForLayout().then(finished);
    for (let frame = 0; frame < painted; frame++) f.paint();
    const scheduled = [...f.pending.values()];
    const requests = f.request.mock.calls.length;
    f.capture.beginClosing();
    await capture;
    expect(finished).toHaveBeenCalledTimes(1);
    expect(f.pending.size).toBe(0);
    expect(f.cancel).toHaveBeenCalledWith(requests);
    // A frame already delivered to a callback cannot restart the wait after close.
    for (const callback of scheduled) callback();
    expect(f.request).toHaveBeenCalledTimes(requests);
    await f.capture.waitForLayout();
    expect(f.request).toHaveBeenCalledTimes(requests);
  },
);

it("skips frames when closing starts before the preceding capture flush completes", async () => {
  const f = fixture();
  let finishFlush!: () => void;
  const flushed = new Promise<void>((resolve) => {
    finishFlush = resolve;
  });
  const capture = flushed.then(() => f.capture.waitForLayout());
  f.capture.beginClosing();
  finishFlush();
  await capture;
  expect(f.request).not.toHaveBeenCalled();
});

it("releases every pending capture when closing is signalled repeatedly", async () => {
  const f = fixture();
  const first = f.capture.waitForLayout();
  const second = f.capture.waitForLayout();
  expect(f.pending.size).toBe(2);
  f.capture.beginClosing();
  f.capture.beginClosing();
  await Promise.all([first, second, f.capture.waitForLayout()]);
  expect(f.pending.size).toBe(0);
  expect(f.request).toHaveBeenCalledTimes(2);
  expect(f.cancel).toHaveBeenCalledTimes(2);
});
