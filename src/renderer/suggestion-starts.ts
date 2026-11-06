export interface SuggestionStartTarget {
  iri: string;
  mode: string;
  runId?: string;
}
/** Click intents live only in memory. Restoring a pane never replays a run. */
export class SuggestionStarts<T extends SuggestionStartTarget> {
  private pending = new Map<string, { target: T; epoch: number }>();
  private active = new Map<
    string,
    { target: T; epoch: number; runId?: string }
  >();
  private listeners = new Set<() => void>();
  private revision = 0;
  private engine(mode: string) {
    return mode === "children" || mode === "instances" ? "taxonomy" : "values";
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.revision;
  private notify() {
    this.revision++;
    for (const fn of this.listeners) fn();
  }
  get(pane: string) {
    return this.pending.get(pane);
  }
  // craigtrim/axiom#207: preparation belongs to its target before history is written.
  running(target: T | null | undefined, epoch: number) {
    if (!target) return undefined;
    const job = this.active.get(this.engine(target.mode));
    return job?.epoch === epoch &&
      job.target.iri === target.iri &&
      job.target.mode === target.mode &&
      (!target.runId || target.runId === job.runId)
      ? job
      : undefined;
  }
  request(pane: string, target: T, epoch: number, start = true) {
    this.pending.delete(pane);
    const running = this.active.get(this.engine(target.mode));
    if (
      start &&
      target.mode !== "define" &&
      !target.runId &&
      !(
        running?.epoch === epoch &&
        running.target.iri === target.iri &&
        running.target.mode === target.mode
      )
    )
      this.pending.set(pane, { target, epoch });
    this.notify();
  }
  clearOtherEpochs(epoch: number) {
    let changed = false;
    for (const [pane, intent] of this.pending)
      if (intent.epoch !== epoch) {
        this.pending.delete(pane);
        changed = true;
      }
    if (changed) this.notify();
  }
  consume(pane: string, target: T, epoch: number) {
    const intent = this.pending.get(pane);
    if (intent?.target !== target || intent.epoch !== epoch) return false;
    this.pending.delete(pane);
    this.notify();
    return true;
  }
  reserve(target: T, epoch: number, runId?: string) {
    const engine = this.engine(target.mode);
    if (this.active.has(engine)) return undefined;
    const job = { target, epoch, runId };
    this.active.set(engine, job);
    // Different views of this same request reuse the running result.
    for (const [pane, intent] of this.pending)
      if (
        intent.epoch === epoch &&
        intent.target.iri === target.iri &&
        intent.target.mode === target.mode
      )
        this.pending.delete(pane);
    this.notify();
    return () => {
      if (this.active.get(engine) === job) {
        this.active.delete(engine);
        this.notify();
      }
    };
  }
}
