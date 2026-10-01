export interface PreviewState<T> {
  scope: string;
  settledKey?: string;
  value?: T;
  error: string;
}

/** Retain completed feedback, while giving actions only the current request's result. */
export class RetainedPreview<T> {
  private state: PreviewState<T> = { scope: "", error: "" };
  private listeners = new Set<() => void>();
  private job?: {
    key: string;
    promise: Promise<T | undefined>;
    resolve(value: T | undefined): void;
    start(): void;
    timer?: ReturnType<typeof setTimeout>;
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private publish(state: PreviewState<T>) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  cancel = () => {
    if (this.job) {
      clearTimeout(this.job.timer);
      this.job.resolve(undefined);
      this.job = undefined;
    }
  };
  update(
    key: string | null,
    scope: string,
    load: () => Promise<T>,
    delay: number,
  ) {
    if (scope !== this.state.scope) {
      this.cancel();
      this.publish({ scope, error: "" });
    }
    if (key !== null && this.job?.key === key) return;
    this.cancel();
    if (key === null) return;
    let resolve!: (value: T | undefined) => void;
    const promise = new Promise<T | undefined>((done) => {
      resolve = done;
    });
    let started = false;
    const job = {
      key,
      promise,
      resolve,
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
      start: () => {
        if (started) return;
        started = true;
        clearTimeout(job.timer);
        void Promise.resolve()
          .then(load)
          .then(
            (value) => {
              if (this.job !== job) return;
              this.publish({ scope, settledKey: key, value, error: "" });
              resolve(value);
            },
            (reason) => {
              if (this.job !== job) return;
              this.publish({
                ...this.state,
                settledKey: key,
                error:
                  reason instanceof Error ? reason.message : String(reason),
              });
              resolve(undefined);
            },
          );
      },
    };
    this.job = job;
    job.timer = setTimeout(job.start, delay);
  }
  validate = () => {
    this.job?.start();
    return this.job?.promise ?? Promise.resolve(undefined);
  };
}
