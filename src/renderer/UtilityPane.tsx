// craigtrim/axiom#94: five utility views share measured chrome and retained recovery bodies.
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { registerPaneRecovery } from "./AdaptivePane";
import { SharedMenu, type SharedMenuItem } from "./SharedPane";
import { useActionOverflow } from "./useActionOverflow";
import { useSourceDraft } from "./source-draft";
import "./utility-reference.css";

export interface UtilityAction {
  id: string;
  label: string;
  run(): void;
  disabled?: boolean;
  priority: number;
  leading?: boolean;
  content?: ReactNode;
  pinned?: boolean;
  naturalWidth?: number;
}
export function UtilityToolbar({
  label,
  primary,
  primaryWidth,
  state,
  stateKind = "",
  actions = [],
  items = [],
  afterState,
}: {
  label: string;
  primary?: ReactNode;
  primaryWidth?: number;
  state: ReactNode;
  stateKind?: string;
  actions?: UtilityAction[];
  items?: SharedMenuItem[];
  afterState?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    more = useRef<HTMLButtonElement>(null);
  const hidden = useActionOverflow(root, more, actions, "shared");
  const overflow = actions
    .filter((a) => hidden.has(a.id) && !a.pinned)
    .sort((a, b) => b.priority - a.priority);
  const own = items.filter(
    (i) => "separator" in i || !overflow.some((a) => a.id === i.id),
  );
  const slot = (a: UtilityAction) => (
    <div
      key={a.id}
      className="shared-command"
      data-shared-command={a.pinned ? undefined : a.id}
      data-fixed-action={a.pinned || undefined}
      data-natural-action-width={a.pinned ? a.naturalWidth : undefined}
      data-pinned={a.pinned || undefined}
      data-overflowed={hidden.has(a.id) && !a.pinned}
      inert={hidden.has(a.id) && !a.pinned}
      aria-hidden={(hidden.has(a.id) && !a.pinned) || undefined}
    >
      {a.content ?? (
        <button className="btn quiet" disabled={a.disabled} onClick={a.run}>
          {a.label}
        </button>
      )}
    </div>
  );
  return (
    <div ref={root} className="bar" role="group" aria-label={label}>
      {actions.filter((a) => a.leading).map(slot)}
      {primary && (
        <div
          className="utility-primary"
          data-fixed-action
          data-natural-action-width={primaryWidth}
        >
          {primary}
        </div>
      )}
      <span
        className={"state " + stateKind}
        data-fixed-action
        title={typeof state === "string" ? state : undefined}
      >
        <span data-natural-width>{state}</span>
      </span>
      <span className="od-fill" />
      {afterState && <div data-fixed-action>{afterState}</div>}
      {actions.filter((a) => !a.leading).map(slot)}
      <SharedMenu
        trigger={more}
        items={[
          ...overflow.map((a) => ({
            id: a.id,
            label: a.label,
            run: a.run,
            disabled: a.disabled,
            commandId: a.id,
          })),
          ...(overflow.length && own.length
            ? [{ id: "separator", separator: true as const }]
            : []),
          ...own,
        ]}
      />
    </div>
  );
}
export function useUtilityToast() {
  const [toast, setToast] = useState<{ title: string; detail: string }>();
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(undefined), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  return {
    toast,
    notify: (title: string, detail: string) => setToast({ title, detail }),
  };
}
export function UtilityFrame({
  id,
  label,
  toolbar,
  head,
  children,
  footer,
  toast,
  rowsRef,
}: {
  id: string;
  label: string;
  toolbar: ReactNode;
  head?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  toast?: { title: string; detail: string };
  // craigtrim/axiom#148: consumers measure the existing shared scrolling region.
  rowsRef?: Ref<HTMLDivElement>;
}) {
  return (
    <section
      className="pane footed utility-surface"
      data-panel={id}
      aria-label={label}
    >
      {toolbar}
      <div className="body">
        <div className="stack">
          <div>{head}</div>
          <div className="rows" ref={rowsRef}>
            {children}
          </div>
        </div>
      </div>
      <div className="foot">{footer}</div>
      <div className="toast" role="status" hidden={!toast}>
        {toast && (
          <>
            <b>{toast.title}</b> <span className="sub">{toast.detail}</span>
          </>
        )}
      </div>
    </section>
  );
}
export const UtilityTag = ({
  kind,
  children,
  title,
}: {
  kind: "inf" | "good" | "wrn" | "err";
  children: ReactNode;
  title?: string;
}) => (
  <span className={"tag " + kind} title={title}>
    <span className="gl" />
    {children}
  </span>
);
export const UtilityRow = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="prow">
    <span className="pl">{label}</span>
    <div className="pv">{children}</div>
  </div>
);
const reasons: Record<string, [string, string]> = {
  provenance: [
    "Filesystem provenance",
    "Too little room for the collection. The root, the coverage limits, the errors and the status are retained.",
  ],
  suggestionruns: [
    "Suggestion runs",
    "Too little room for the queue. The assistant, the frozen target list and every run result are retained.",
  ],
  errorlog: [
    "Error log",
    "Too little room for the record. Every entry, its timeline and its diagnostics are retained.",
  ],
  tabhistory: [
    "Tab history",
    "Too little room for the tree. The filter, the retention setting and the selection are retained.",
  ],
};
for (const [id, [name, reason]] of Object.entries(reasons))
  registerPaneRecovery(id, {
    Body: ({ maximize }) => (
      <>
        <div className="id">{name}</div>
        <div className="why">{reason}</div>
        <div>{maximize}</div>
      </>
    ),
  });
registerPaneRecovery("source", {
  Body: function SourceRecovery({ maximize }) {
    const draft = useSourceDraft();
    return (
      <>
        <div className="id">Source</div>
        <div className="why">
          {"Too little room to edit. " +
            (draft
              ? "The pending draft, the cursor and the validation are retained."
              : "The exact source and the cursor are retained.")}
        </div>
        <div>{maximize}</div>
      </>
    );
  },
});
