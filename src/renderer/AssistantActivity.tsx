import { useEffect, useState, useSyncExternalStore } from "react";
import { assistantActivities, type AssistantKind } from "./assistant-activity";
export { assistantActivities } from "./assistant-activity";
const paneAssistants: Partial<Record<string, AssistantKind>> = {
  research: "research",
  query: "query",
  hierarchy: "taxonomy",
};
export const paneAssistant = (id: string) => paneAssistants[id];
export function useAssistantActivity(kind?: AssistantKind) {
  return useSyncExternalStore(assistantActivities.subscribe, () =>
    kind ? assistantActivities.get(kind) : undefined,
  );
}
const cancelLabels = {
  research: "Cancel research",
  query: "Cancel generation",
  taxonomy: "Cancel suggestions",
};
export function cancelAssistant(kind: AssistantKind) {
  return assistantActivities.cancel(kind, async () => {
    if (kind === "research") await window.axiom.research.cancel();
    else if (kind === "query") await window.axiom.queryAssistant.cancel();
    else {
      const status = await window.axiom.taxonomyAssistant.status();
      if (status.id) await window.axiom.taxonomyAssistant.cancel(status.id);
    }
  });
}
/** Poll independently of view visibility, including a closed query composer. */
export function useAssistantActivityPolling() {
  useEffect(() => {
    let live = true,
      polling = false;
    const poll = async () => {
      if (!live || polling) return;
      polling = true;
      await Promise.allSettled([
        assistantActivities.reconcile("research", async () => {
          const s = await window.axiom.research.status();
          return s.running
            ? {
                label:
                  (s.provider === "claude" ? "Claude" : "Codex") +
                  " · Researching " +
                  (s.activeEntity ?? "the requested entity") +
                  "…",
                startedAt: s.startedAt ?? Date.now(),
                cancelling: s.cancelling,
              }
            : undefined;
        }),
        assistantActivities.reconcile("query", async () => {
          const s = await window.axiom.queryAssistant.status();
          return s.running
            ? {
                label:
                  (s.provider === "claude" ? "Claude" : "Codex") +
                  " · Generating query…",
                startedAt: s.startedAt ?? Date.now(),
                cancelling: s.cancelling,
              }
            : undefined;
        }),
        assistantActivities.reconcile("taxonomy", async () => {
          const s = await window.axiom.taxonomyAssistant.status();
          return s.running
            ? {
                label:
                  "Codex · " +
                  (s.mode === "instances"
                    ? "Finding instances"
                    : "Finding child classes") +
                  (s.activeEntity ? " for " + s.activeEntity : "") +
                  "…",
                startedAt: s.startedAt ?? Date.now(),
                cancelling: s.cancelling,
              }
            : undefined;
        }),
      ]);
      polling = false;
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
}
export function AssistantActivity({
  kind,
  controls = true,
}: {
  kind?: AssistantKind;
  controls?: boolean;
}) {
  const activity = useAssistantActivity(kind);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!activity) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity?.startedAt]);
  if (!activity || !kind) return null;
  return (
    <div className="assistant-activity" data-assistant={kind}>
      <span className="assistant-spinner" aria-hidden="true" />
      <span
        className="assistant-activity-label"
        role="status"
        title={activity.label}
      >
        {activity.cancelling ? "Cancelling · " : ""}
        {activity.label}
      </span>
      <span className="assistant-elapsed" aria-hidden="true">
        {Math.max(0, Math.floor((now - activity.startedAt) / 1000))}s
      </span>
      {controls && (
        <button
          disabled={activity.cancelling}
          onClick={() => void cancelAssistant(kind)}
        >
          {activity.cancelling ? "Cancelling…" : cancelLabels[kind]}
        </button>
      )}
      {activity.error && (
        <span role="alert" className="error">
          {activity.error}
        </span>
      )}
    </div>
  );
}
export function AssistantTabActivity({ paneId }: { paneId: string }) {
  const activity = useAssistantActivity(paneAssistant(paneId));
  return activity ? (
    <span
      className="assistant-tab-activity"
      role="img"
      aria-label={
        activity.cancelling ? "Assistant cancelling" : "Assistant running"
      }
      title={activity.label}
    >
      <span className="assistant-spinner" aria-hidden="true" />
    </span>
  ) : null;
}
