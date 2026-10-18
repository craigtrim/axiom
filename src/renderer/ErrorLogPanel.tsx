// craigtrim/axiom#94: open one record in place, with bounded diagnostic lengths and native copy.
import { useEffect, useState } from "react";
import {
  auditReport,
  type AuditRecord,
  type AuditSummary,
} from "../shared/audit";
import { useAuditErrors, useAuditSelection, selectAudit } from "./audit-state";
import {
  UtilityFrame,
  UtilityRow,
  UtilityTag,
  UtilityToolbar,
  useUtilityToast,
} from "./UtilityPane";
const time = (value: string) =>
  new Date(value).toLocaleTimeString("en-GB", { hour12: false });
const date = (value: string) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${time(value)}`;
};
export function ErrorLogPanel() {
  const updates = useAuditErrors(),
    selected = useAuditSelection();
  const [items, setItems] = useState<AuditSummary[]>([]),
    [record, setRecord] = useState<AuditRecord>(),
    [error, setError] = useState("");
  const { toast, notify } = useUtilityToast();
  useEffect(() => {
    let live = true;
    void window.axiom.audit
      .list()
      .then((entries) => live && setItems(entries))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [updates]);
  useEffect(() => {
    let live = true;
    setRecord(undefined);
    setError("");
    if (selected)
      void window.axiom.audit
        .read(selected)
        .then((r) => live && setRecord(r))
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [selected, updates]);
  const copy = () => {
    if (record)
      void window.axiom
        .copy(auditReport(record))
        .then(() =>
          notify(
            "Report copied.",
            "Credentials were already redacted, and the copy is exactly what is displayed.",
          ),
        )
        .catch((e) => setError(e.message));
  };
  const reveal = () => {
    if (record)
      void window.axiom.audit
        .reveal(record.id)
        .catch((e) => setError(e.message));
  };
  const clear = () => selectAudit("");
  return (
    <UtilityFrame
      id="errorlog"
      label="Error log"
      toast={toast}
      toolbar={
        <UtilityToolbar
          label="Error log actions"
          state={`${items.length} entries, ${items.filter((e) => e.outcome === "cancelled").length} cancelled`}
          actions={[
            {
              id: "copy",
              label: "Copy report",
              priority: 1,
              disabled: !record,
              run: copy,
            },
            {
              id: "reveal",
              label: "Show log file",
              priority: 2,
              disabled: !record?.file || !!record?.storageError,
              run: reveal,
            },
          ]}
          items={[
            {
              id: "collapse",
              label: "Collapse the open entry",
              disabled: !selected,
              run: clear,
            },
          ]}
        />
      }
      head={
        <>
          <div className="note2">
            <b>
              Recognized credentials are redacted before a record is written,
              shown or copied.
            </b>
            {
              " Environment variables are never recorded. A report does include the prompt and the ontology context that were sent, so copying one copies that content."
            }
          </div>
          {error && (
            <div className="note2 bad3" role="alert">
              {error}
            </div>
          )}
        </>
      }
      footer={
        <>
          <span>
            <span className="num">{items.length}</span> entries
          </span>
          <span>error-logs in the local user data directory</span>
          <span>a retry never overwrites an earlier error</span>
          <span>successful operations create no record</span>
        </>
      }
    >
      {!items.length && !error && (
        <div className="empty">
          <b>No recorded errors.</b> Errors from older versions may not have a
          saved log.
        </div>
      )}
      {items.map((e) => (
        <div
          className="ent"
          data-audit-id={e.id}
          data-open={selected === e.id}
          key={e.id}
        >
          <button
            className="eh"
            aria-expanded={selected === e.id}
            onClick={() => selectAudit(selected === e.id ? "" : e.id)}
          >
            <span className="et">{e.operation}</span>
            <UtilityTag kind={e.outcome === "cancelled" ? "wrn" : "err"}>
              {e.outcome}
            </UtilityTag>
            <span className="ew">{e.stage}</span>
            <span className="ew">{date(e.completedAt)}</span>
          </button>
          {selected === e.id && record?.id === e.id && (
            <RecordBody key={e.id} record={record} />
          )}
        </div>
      ))}
    </UtilityFrame>
  );
}
function RecordBody({ record: r }: { record: AuditRecord }) {
  const process =
    Object.hasOwn(r.metadata, "exitCode") || !!r.metadata.executable;
  const titles: Record<string, string> = {
    Prompt: "Prompt and ontology context",
    "Process stderr (last 8,000 characters)": "Process stderr",
  };
  return (
    <div className="ebody">
      <div className="tl">
        {r.events.map((e, i) => (
          <div className="ts" key={i}>
            <b>{time(e.time)}</b>
            {" " + e.stage + (e.detail ? ", " + e.detail : "")}
          </div>
        ))}
        <div className="ts">
          <b>{time(r.completedAt)}</b>
          {" " + r.message}
        </div>
      </div>
      {r.storageError && (
        <div className="note2 bad3">
          <b>This record could not be saved.</b>
          {
            " It is still here in memory and can be copied, and it did not replace the original operation error."
          }
        </div>
      )}
      {Object.entries(r.details)
        .filter(([name]) => name !== "Arguments")
        .map(([name, text]) => {
          const title = titles[name] ?? name,
            length = r.detailLengths?.[name],
            original = length?.original ?? text.length,
            retained = length?.retained ?? text.length;
          const tail = length?.tail || name.startsWith("Process stderr");
          const head =
            (length?.truncated ?? original > retained)
              ? `${title}, ${tail ? "last " : "retained "}${retained.toLocaleString()} of ${original.toLocaleString()} characters${tail ? "" : ", truncated"}`
              : `${title}, ${retained.toLocaleString()} characters`;
          return (
            <details className="dsec" key={name}>
              <summary>{head}</summary>
              <pre className="dc">
                {text.slice(0, 1400)}
                {text.length > 1400
                  ? `\n... ${(text.length - 1400).toLocaleString()} more characters retained`
                  : ""}
              </pre>
            </details>
          );
        })}
      {process && (
        <>
          <UtilityRow label="Exit information">
            <span className="path">
              {r.metadata.exitCode == null
                ? "no exit code, the process did not run to completion"
                : "exit code " + r.metadata.exitCode}
            </span>
          </UtilityRow>
          {r.metadata.executable && (
            <UtilityRow label="Executable">
              <span className="path" title={String(r.metadata.executable)}>
                {r.metadata.executable}
              </span>
            </UtilityRow>
          )}
          {r.details.Arguments !== undefined && (
            <UtilityRow label="Arguments">
              <span className="path" title={r.details.Arguments}>
                {r.details.Arguments}
              </span>
            </UtilityRow>
          )}
        </>
      )}
    </div>
  );
}
