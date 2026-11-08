// craigtrim/axiom#221: closing captures must finish even when hidden windows stop painting.
interface CaptureFrameScheduler {
  request(callback: () => void): number;
  cancel(frame: number): void;
}

export class WorkspaceCaptureFrames {
  private closing = false;
  private pending = new Set<() => void>();

  constructor(private readonly frames: CaptureFrameScheduler) {}

  beginClosing() {
    this.closing = true;
    for (const finish of [...this.pending]) finish();
  }

  waitForLayout(): Promise<void> {
    if (this.closing) return Promise.resolve();
    return new Promise((resolve) => {
      let scheduled: number | undefined;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (scheduled !== undefined) this.frames.cancel(scheduled);
        this.pending.delete(finish);
        resolve();
      };
      this.pending.add(finish);
      scheduled = this.frames.request(() => {
        if (finished) return;
        scheduled = this.frames.request(finish);
      });
    });
  }
}
