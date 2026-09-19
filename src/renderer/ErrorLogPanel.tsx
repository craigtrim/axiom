import { useEffect, useState } from "react";
import {
  auditReport,
  type AuditRecord,
  type AuditSummary,
} from "../shared/audit";
import { useAuditErrors, useAuditSelection, selectAudit } from "./audit-state";
export function ErrorLogPanel() {
  const updates = useAuditErrors(),
    selected = useAuditSelection();
  const [items, setItems] = useState<AuditSummary[]>([]);
  const [record, setRecord] = useState<AuditRecord>();
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    void window.axiom.audit
      .list()
      .then((entries) => {
        if (!live) return;
        setItems(entries);
        if (!selected && entries.length) selectAudit(entries[0].id);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [updates, selected]);
  useEffect(() => {
    let live = true;
    setRecord(undefined);
    setError("");
    setCopied(false);
    if (selected)
      void window.axiom.audit
        .read(selected)
        .then((e) => live && setRecord(e))
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [selected, updates]);
  const visible = items.filter((e) =>
    [e.operation, e.entity, e.provider, e.message]
      .join(" ")
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <section
      className="panel error-log-panel"
      data-panel="errorlog"
      aria-label="Error log"
    >
      <header className="error-log-heading">
        <div className="error-log-actions">
          <input
            aria-label="Filter error history"
            placeholder="Filter errors"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            disabled={!record}
            onClick={() =>
              record &&
              void window.axiom
                .copy(auditReport(record))
                .then(() => setCopied(true))
                .catch((e) => setError(e.message))
            }
          >
            {copied ? "Copied" : "Copy report"}
          </button>
          <button
            disabled={!record?.file}
            onClick={() =>
              record &&
              void window.axiom.audit
                .reveal(record.id)
                .catch((e) => setError(e.message))
            }
          >
            Show log file
          </button>
        </div>
        <label>
          Error history
          <select
            aria-label="Error history"
            value={selected}
            onChange={(e) => selectAudit(e.target.value)}
          >
            {!visible.some((e) => e.id === selected) && (
              <option value={selected}>
                {selected ? "Selected error" : "No recorded errors"}
              </option>
            )}
            {visible.map((e) => (
              <option key={e.id} value={e.id}>
                {new Date(e.startedAt).toLocaleString()} ·{" "}
                {e.entity ?? e.operation} · {e.message}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="error-log-content">
        {error && <p role="alert">{error}</p>}
        {!items.length && !error && (
          <p>
            No recorded errors. Errors from older versions may not have a saved
            log.
          </p>
        )}
        {record && (
          <>
            <h3>{record.message}</h3>
            {record.metadata.evidence && <p>{record.metadata.evidence}</p>}
            <dl className="error-log-facts">
              <dt>When</dt>
              <dd>{new Date(record.startedAt).toLocaleString()}</dd>
              <dt>Operation</dt>
              <dd>{record.operation}</dd>
              <dt>Failed at</dt>
              <dd>{record.stage}</dd>
              {record.metadata.provider && (
                <>
                  <dt>Assistant</dt>
                  <dd>{record.metadata.provider}</dd>
                </>
              )}
              {record.metadata.entity && (
                <>
                  <dt>Entity</dt>
                  <dd>{record.metadata.entity}</dd>
                </>
              )}
              <dt>Reference</dt>
              <dd>{record.id}</dd>
              {record.file && (
                <>
                  <dt>Log file</dt>
                  <dd>{record.file}</dd>
                </>
              )}
            </dl>
            {record.storageError && (
              <p role="alert">
                {record.storageError} Copy report is still available.
              </p>
            )}
            <details open>
              <summary>Timeline</summary>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Step</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {record.events.map((e, i) => (
                    <tr key={i}>
                      <td>{new Date(e.time).toLocaleTimeString()}</td>
                      <td>{e.stage}</td>
                      <td>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            {Object.entries(record.details).map(([name, value]) => (
              <details key={name}>
                <summary>{name}</summary>
                <pre>{value || "No output recorded."}</pre>
              </details>
            ))}
            <details>
              <summary>Application and request details</summary>
              <dl className="error-log-facts">
                {Object.entries(record.metadata).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <p className="muted">
              Saved locally. Copy report includes the prompt and assistant
              output shown here. Recognized credentials are redacted.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
