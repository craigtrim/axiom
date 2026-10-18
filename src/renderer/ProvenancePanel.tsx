// craigtrim/axiom#94: options, progress and evidence retain their state above the scroller.
import { useEffect, useState, useRef } from "react";
import {
  defaultProvenanceOptions,
  type ProvenanceStatus,
} from "../shared/provenance";
import {
  NumberField,
  NumberValidation,
  useNumberValidation,
} from "./NumberField";
import {
  UtilityFrame,
  UtilityRow,
  UtilityTag,
  UtilityToolbar,
} from "./UtilityPane";
import { ErrorNotice } from "./ErrorNotice";
export function ProvenancePanel() {
  const numbers = useNumberValidation();
  const [s, setStatus] = useState<ProvenanceStatus>({
    status: "idle",
    entries: 0,
    files: 0,
    directories: 0,
    issues: 0,
    recent: [],
  });
  const [options, setOptions] = useState(defaultProvenanceOptions),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void window.axiom.provenance
      .status()
      .then((value) => {
        if (live) {
          setStatus(value);
          if (value.options) setOptions(value.options);
        }
      })
      .catch((e) => live && setError(e.message));
    const off = window.axiom.onEvent((e) => {
      if (e.type === "provenance") setStatus(e.data);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const running = s.status === "running",
    finished =
      ["complete", "cancelled", "error"].includes(s.status) && !!s.rdfPath;
  const choose = () => void run(() => window.axiom.provenance.choose());
  const reset = () => void run(() => window.axiom.provenance.reset());
  const label = running
    ? "Cancel collection"
    : finished
      ? s.status === "complete"
        ? "Open provenance ontology"
        : "Open partial provenance ontology"
      : "Collect metadata";
  const action = () =>
    void run(() =>
      running
        ? window.axiom.provenance.cancel()
        : finished
          ? window.axiom.provenance.open()
          : window.axiom.provenance.start(options),
    );
  const state = {
    idle: "Ready",
    running: "Collecting",
    complete: "Collection complete",
    cancelled: "Collection stopped",
    error: "Collection failed",
  }[s.status];
  const limit = (s.options ?? options).maxEntries;
  const progress = useRef(0);
  if (s.status === "idle") progress.current = 0;
  if ((running || s.status === "cancelled") && limit)
    progress.current = Math.min(100, (s.entries / limit) * 100);
  if (s.status === "complete") progress.current = 100;
  const observations = s.observations ?? s.entries;
  return (
    <NumberValidation.Provider value={numbers.report}>
      <UtilityFrame
        id="provenance"
        label="Filesystem provenance"
        toolbar={
          <UtilityToolbar
            label="Filesystem provenance actions"
            primary={
              <button
                className="btn primary"
                disabled={
                  busy ||
                  (!running && !finished && (!s.root || numbers.invalid))
                }
                onClick={action}
              >
                {label}
              </button>
            }
            state={state}
            stateKind={
              s.status === "complete"
                ? "okink"
                : s.status === "cancelled"
                  ? "warnink"
                  : s.status === "error"
                    ? "badink"
                    : ""
            }
            actions={[
              {
                id: "choose",
                label: "Choose folder",
                leading: true,
                priority: 1,
                disabled: running || busy,
                run: choose,
              },
              {
                id: "reset",
                label: "Start over",
                priority: 2,
                disabled: busy,
                run: reset,
              },
            ]}
            items={[
              {
                id: "choose",
                label: "Choose a different folder",
                disabled: running || busy,
                run: choose,
              },
            ]}
          />
        }
        head={
          <>
            {s.status === "cancelled" && (
              <div className="note2 wrn3">
                <b>Stopped before the end.</b> Everything collected so far is
                kept and the ontology is labelled partial, so the walk is not
                thrown away.
              </div>
            )}
            {(error || s.status === "error") && (
              <div className="note2 bad3">
                <ErrorNotice
                  error={error || s.message || "Collection failed"}
                />
              </div>
            )}
            <UtilityRow label="Selected folder">
              <span className="path" title={s.root} data-provenance-root>
                {s.root || "Choose a Windows folder"}
              </span>
            </UtilityRow>
            <UtilityRow label="Entry limit">
              <NumberField
                className="fld"
                size={7}
                aria-label="Collection entry limit"
                integer
                min={0}
                max={1000000}
                value={options.maxEntries}
                disabled={running || busy}
                change={(maxEntries) =>
                  setOptions((o) => ({ ...o, maxEntries }))
                }
              />
              <span className="pl">0 collects every entry</span>
            </UtilityRow>
            <UtilityRow label="Timeout per source">
              <NumberField
                className="fld"
                size={7}
                aria-label="Metadata timeout"
                integer
                min={10}
                max={600}
                value={options.timeoutSeconds}
                disabled={running || busy}
                change={(timeoutSeconds) =>
                  setOptions((o) => ({ ...o, timeoutSeconds }))
                }
              />
              <span className="pl">seconds, 10 to 600</span>
            </UtilityRow>
            <UtilityRow label="Offline content">
              <button
                className="sw"
                role="switch"
                aria-checked={options.readOffline}
                disabled={running || busy}
                onClick={() =>
                  setOptions((o) => ({ ...o, readOffline: !o.readOffline }))
                }
              >
                <span className="track">
                  <span className="knob" />
                </span>
                Read offline and cloud placeholder content, which may download
                files
              </button>
            </UtilityRow>
            <div className="sum">
              {[
                [observations, "observations"],
                [s.files, "files"],
                [s.directories, "folders"],
                [s.issues, "coverage notes"],
              ].map(([n, k]) => (
                <div className={"s1" + (n === 0 ? " zero" : "")} key={k}>
                  <span className="sv2">{n.toLocaleString()}</span>
                  <span className="sk">{k}</span>
                </div>
              ))}
            </div>
            <div className="prog" aria-hidden="true">
              <i
                className={
                  !limit && (running || s.status === "cancelled")
                    ? "indeterminate" + (running ? "" : " stopped")
                    : ""
                }
                style={
                  limit || (!running && s.status !== "cancelled")
                    ? { width: progress.current + "%" }
                    : undefined
                }
              />
            </div>
            {running && s.current && (
              <UtilityRow label="Reading">
                <span className="path" title={s.current}>
                  {s.current}
                </span>
              </UtilityRow>
            )}
          </>
        }
        footer={
          <>
            <span>
              <span className="num">{observations.toLocaleString()}</span>
              {" observations"}
            </span>
            <span>{s.root}</span>
            <span>
              {options.readOffline
                ? "offline content read"
                : "offline content skipped and noted"}
            </span>
            <span>subfolders included</span>
            {s.status === "complete" ? (
              <span>saved with its evidence</span>
            ) : s.status === "cancelled" ? (
              <span>partial, kept with its evidence</span>
            ) : null}
          </>
        }
      >
        {!s.recent.length ? (
          <div className="empty">
            <b>Nothing collected yet.</b> Collect builds an ontology from files,
            folders and their recorded metadata, including subfolders. It
            records the collection itself and its observations, so the evidence,
            the RDF and the summary are saved together and you can tell what was
            looked at from what was found.
          </div>
        ) : (
          [...s.recent].reverse().map((r, i) => (
            <UtilityRow key={i} label={r.kind ?? "file"}>
              <span className="path" title={r.path}>
                {relativePath(s.root, r.path)}
              </span>
              <UtilityTag kind={r.issues ? "wrn" : "good"}>
                {r.issues
                  ? r.coverage || "coverage note, content not read"
                  : (r.observations ?? 0).toLocaleString() + " observations"}
              </UtilityTag>
            </UtilityRow>
          ))
        )}
      </UtilityFrame>
    </NumberValidation.Provider>
  );
}
function relativePath(root: string | undefined, file: string) {
  const prefix = root?.replace(/[\\/]$/, "") + "\\";
  return file.toLowerCase().startsWith(prefix.toLowerCase())
    ? file.slice(prefix.length)
    : file === root
      ? "."
      : file;
}
