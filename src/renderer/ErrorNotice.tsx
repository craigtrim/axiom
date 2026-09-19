import { cleanErrorMessage } from "../shared/audit";
import { command } from "./client";
import { useAuditErrors } from "./audit-state";
export function ErrorDetailsButton({
  error,
  auditId,
}: {
  error: string;
  auditId?: string;
}) {
  const entries = useAuditErrors();
  const clean = cleanErrorMessage(error);
  const id =
    auditId ??
    entries.find((e) => clean === e.message || clean.endsWith(e.message))?.id;
  return (
    <button
      className="error-details-button"
      onClick={(event) => {
        if (id) command("audit.open:" + id);
        else {
          const pane =
            event.currentTarget.closest<HTMLElement>("[data-panel]")?.dataset
              .panel ?? "Interface";
          void window.axiom.audit
            .record({ message: clean, operation: pane })
            .then((reference) => command("audit.open:" + reference))
            .catch(() => command("view.errorlog"));
        }
      }}
    >
      Error details
    </button>
  );
}
export function ErrorNotice({
  error,
  auditId,
  className = "",
}: {
  error: string;
  auditId?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={"error pane-alert error-notice " + className}>
      <span>{cleanErrorMessage(error)}</span>{" "}
      <ErrorDetailsButton error={error} auditId={auditId} />
    </div>
  );
}
