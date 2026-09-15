import { PaneToolbar, PaneDetails, usePaneLayout } from "./AdaptivePane";
import { useEffect, useState, useRef, useLayoutEffect } from "react";
import {
  defaultProvenanceOptions,
  type ProvenanceStatus,
} from "../shared/provenance";
import { report } from "./client";
export function ProvenancePanel() {
  const { compact } = usePaneLayout();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const focusedOptions = !!optionsRef.current?.contains(
    optionsRef.current.ownerDocument.activeElement,
  );
  useLayoutEffect(() => {
    if (compact && focusedOptions) setOptionsOpen(true);
  }, [compact, focusedOptions]);
  const [s, setStatus] = useState<ProvenanceStatus>({
      status: "idle",
      entries: 0,
      files: 0,
      directories: 0,
      issues: 0,
      recent: [],
    }),
    [options, setOptions] = useState(defaultProvenanceOptions),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.axiom.provenance.status().then(setStatus);
    return window.axiom.onEvent((e) => {
      if (e.type === "provenance") setStatus(e.data);
    });
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const running = s.status === "running",
    finished =
      ["complete", "cancelled", "error"].includes(s.status) && s.entries > 0;
  return (
    <section
      className="panel provenance-panel"
      data-panel="provenance"
      aria-label="Filesystem provenance"
    >
      <PaneToolbar
        label="Provenance actions"
        secondary={
          s.root ? (
            <>
              {s.root && (
                <button
                  disabled={running || busy}
                  onClick={() =>
                    void run(() => window.axiom.provenance.choose())
                  }
                >
                  Choose folder
                </button>
              )}
              {finished && (
                <>
                  <button
                    className="primary"
                    disabled={!s.root || running || busy}
                    onClick={() =>
                      void run(() => window.axiom.provenance.start(options))
                    }
                  >
                    Collect metadata
                  </button>
                  <button
                    onClick={() =>
                      void run(() => window.axiom.provenance.reveal())
                    }
                  >
                    Show evidence files
                  </button>
                </>
              )}
            </>
          ) : undefined
        }
      >
        {!s.root ? (
          <button
            disabled={running || busy}
            onClick={() => void run(() => window.axiom.provenance.choose())}
          >
            Choose folder
          </button>
        ) : running ? (
          <button
            className="primary"
            onClick={() => void run(() => window.axiom.provenance.cancel())}
          >
            Cancel collection
          </button>
        ) : finished ? (
          <button
            className="primary"
            aria-label={
              s.status === "complete"
                ? "Open provenance ontology"
                : "Open partial provenance ontology"
            }
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (await window.axiom.provenance.open())
                  report("Opened provenance ontology.");
              })
            }
          >
            {compact
              ? "Open ontology"
              : s.status === "complete"
                ? "Open provenance ontology"
                : "Open partial provenance ontology"}
          </button>
        ) : (
          <button
            className="primary"
            disabled={!s.root || running || busy}
            onClick={() =>
              void run(() => window.axiom.provenance.start(options))
            }
          >
            Collect metadata
          </button>
        )}
        <button
          aria-expanded={!compact || optionsOpen}
          onClick={() => {
            if (!compact) {
              optionsRef.current?.querySelector("input")?.focus();
              return;
            }
            setOptionsOpen(!optionsOpen);
          }}
        >
          {compact && optionsOpen ? "Progress" : "Options"}
        </button>
      </PaneToolbar>
      <div className="pane-context" title={s.root}>
        {s.root || "Choose a folder to begin."}
      </div>
      <div className="provenance-status">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="provenance-summary" role="status">
          <strong>
            {s.status === "running"
              ? "Collecting"
              : s.status === "idle"
                ? "Ready"
                : s.status === "complete"
                  ? "Collection complete"
                  : s.status === "cancelled"
                    ? "Collection stopped"
                    : "Collection failed"}
          </strong>
          <span>{s.entries.toLocaleString()} observations</span>
          <span>{s.files.toLocaleString()} files</span>
          <span>{s.directories.toLocaleString()} folders</span>
          <span>{s.issues.toLocaleString()} coverage notes</span>
        </div>
        {running && <progress aria-label="Metadata collection in progress" />}
        {s.current && <p className="file-path">{s.current}</p>}
        {s.message && <p>{s.message}</p>}
      </div>
      <div className="provenance-content">
        <div
          ref={optionsRef}
          className="provenance-options"
          hidden={compact && !optionsOpen && !focusedOptions}
        >
          <p>
            Create an ontology from files, folders and their recorded metadata.
            Subfolders are included.
          </p>
          <label>
            Selected folder
            <input
              aria-label="Provenance folder"
              readOnly
              value={s.root ?? ""}
              placeholder="Choose a Windows folder"
            />
          </label>
          <PaneDetails title="Collection options">
            <div className="entity-fields">
              <label>
                Entry limit (0 = all)
                <input
                  aria-label="Collection entry limit"
                  type="number"
                  min={0}
                  max={1000000}
                  value={options.maxEntries}
                  disabled={running}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, maxEntries: +e.target.value }))
                  }
                />
              </label>
              <label>
                Timeout per metadata source (seconds)
                <input
                  aria-label="Metadata timeout"
                  type="number"
                  min={10}
                  max={600}
                  value={options.timeoutSeconds}
                  disabled={running}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      timeoutSeconds: +e.target.value,
                    }))
                  }
                />
              </label>
              <label className="check wide-field">
                <input
                  type="checkbox"
                  checked={options.readOffline}
                  disabled={running}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, readOffline: e.target.checked }))
                  }
                />
                Read offline and cloud placeholder content (may download files)
              </label>
            </div>
          </PaneDetails>
          <PaneDetails title="Evidence and coverage">
            <p>
              Sources include native file records, Windows properties,
              permissions, alternate streams, embedded document and media tags,
              signatures, hashes, hard links, allocation records and existing
              change-journal records where accessible. Reparse targets are not
              followed.
            </p>
            <p>
              Owner, author and timestamp fields remain recorded claims. The
              ontology records the collection and its observations without
              inventing historical authorship or derivation.
            </p>
          </PaneDetails>
        </div>
        {finished && (
          <PaneDetails title="Evidence files">
            <p>
              Raw evidence, RDF and the collection summary are saved together.
              Coverage notes record unsupported or unread content.
            </p>
            <code className="file-path">{s.evidencePath}</code>
          </PaneDetails>
        )}
        {!!s.recent.length && (
          <table className="provenance-table">
            <thead>
              <tr>
                <th>Recent entry</th>
                <th>Coverage</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.map((r, i) => (
                <tr key={i}>
                  <td title={r.path}>{r.path}</td>
                  <td>{r.status}</td>
                  <td>{r.issues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
