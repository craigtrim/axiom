export type AssistantKind = "research" | "query" | "taxonomy";
export interface AssistantActivity {
  label: string;
  startedAt: number;
  cancelling?: boolean;
  error?: string;
}
interface Job {
  cancelled: boolean;
  cancel: () => Promise<void>;
}
/** One synchronous reservation per workflow, retained across pane unmounts. */
export class AssistantActivityStore {
  private activities = new Map<AssistantKind, AssistantActivity>();
  private jobs = new Map<AssistantKind, Job>();
  private revisions = new Map<AssistantKind, number>();
  private listeners = new Set<() => void>();
  get = (kind: AssistantKind) => this.activities.get(kind);
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(kind: AssistantKind, activity?: AssistantActivity) {
    if (activity) this.activities.set(kind, activity);
    else this.activities.delete(kind);
    this.revisions.set(kind, (this.revisions.get(kind) ?? 0) + 1);
    this.listeners.forEach((listener) => listener());
  }
  async run<T>(
    kind: AssistantKind,
    label: string,
    execute: (checkCancelled: () => void) => Promise<T>,
    cancel: () => Promise<void>,
  ): Promise<T> {
    if (this.get(kind)) throw Error("This assistant task is already running.");
    const job = { cancelled: false, cancel };
    this.jobs.set(kind, job);
    this.set(kind, { label, startedAt: Date.now() });
    try {
      return await execute(() => {
        if (job.cancelled) throw Error("Assistant cancelled.");
      });
    } finally {
      this.jobs.delete(kind);
      this.set(kind);
    }
  }
  async cancel(kind: AssistantKind, fallback?: () => Promise<void>) {
    const activity = this.get(kind);
    if (!activity || activity.cancelling) return;
    const job = this.jobs.get(kind);
    if (job) job.cancelled = true;
    this.set(kind, { ...activity, cancelling: true, error: undefined });
    try {
      await (job?.cancel ?? fallback)?.();
    } catch (error) {
      // Keep the reservation on cancellation failure and allow a retry.
      if (this.get(kind)?.startedAt === activity.startedAt) {
        if (job) job.cancelled = false;
        this.set(kind, { ...activity, error: (error as Error).message });
      }
    }
  }
  async reconcile(
    kind: AssistantKind,
    read: () => Promise<AssistantActivity | undefined>,
  ) {
    if (this.jobs.has(kind)) return;
    const revision = this.revisions.get(kind);
    const activity = await read();
    // A status reply requested before launch/completion must not overwrite it.
    if (this.jobs.has(kind) || revision !== this.revisions.get(kind)) return;
    const previous = this.get(kind);
    if (!activity && !previous) return;
    this.set(
      kind,
      activity && {
        ...activity,
        startedAt: previous?.startedAt ?? activity.startedAt,
        cancelling: previous?.cancelling || activity.cancelling,
        error: previous?.error,
      },
    );
  }
}
export const assistantActivities = new AssistantActivityStore();
