import { useEffect, useMemo, useState } from "react";
import "./quality.css";
import { humanise, kindLabel } from "../domain/model";
import { identifierParts } from "../domain/rdf-model";
import {
  defaultQualityOptions,
  qualityGroups,
  qualityKinds,
  qualityRules,
  qualitySuppression,
  readQualityOptions,
  readQualityExceptions,
  type QualityOptions,
  type QualityException,
  type QualityPreview,
  type QualityRepair,
} from "../shared/ontology-quality";
import { request, useSnapshot, panel, savePanel } from "./client";
import { editEntity } from "./authoring";
import { startQuality, cancelQuality, useQualityStatus } from "./quality-view";

const toggle = <T,>(values: T[], value: T) =>
  values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
export function QualityPanel() {
  const snapshot = useSnapshot()!,
    job = useQualityStatus(),
    report = job?.report;
  const [options, setOptions] = useState(() =>
    readQualityOptions(panel("quality.options", defaultQualityOptions())),
  );
  const [exceptions, setExceptions] = useState(() =>
    readQualityExceptions(panel("quality.exceptions", [])),
  );
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [starting, setStarting] = useState(false);
  const [text, setText] = useState(""),
    [severity, setSeverity] = useState(""),
    [group, setGroup] = useState(""),
    [rule, setRule] = useState(""),
    [kind, setKind] = useState(""),
    [namespace, setNamespace] = useState("");
  const [grouping, setGrouping] = useState("rule"),
    [showSuppressed, setShowSuppressed] = useState(false),
    [page, setPage] = useState(0),
    [chosen, setChosen] = useState("");
  const [reason, setReason] = useState(""),
    [repairs, setRepairs] =
      useState<(QualityRepair & { selected: boolean })[]>(),
    [repairPage, setRepairPage] = useState(0),
    [preview, setPreview] = useState<QualityPreview>();
  const busy = starting || job?.state === "running";
  const stale =
    !!report &&
    (report.datasetEpoch !== snapshot.datasetEpoch ||
      report.version !== snapshot.version);
  const changedSettings =
    !!report &&
    JSON.stringify(report.options) !==
      JSON.stringify(readQualityOptions(options));
  const change = (values: Partial<QualityOptions>) => {
    const next = { ...options, ...values };
    setOptions(next);
    savePanel("quality.options", next, false);
  };
  const saveExceptions = (next: QualityException[]) => {
    setExceptions(next);
    savePanel("quality.exceptions", next, false);
  };
  const action = async (work: () => Promise<unknown>) => {
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    setPreview(undefined);
    setRepairs(undefined);
    setChosen("");
  }, [job?.id, snapshot.datasetEpoch]);
  useEffect(() => {
    setPage(0);
  }, [
    job?.id,
    text,
    severity,
    group,
    rule,
    kind,
    namespace,
    grouping,
    showSuppressed,
  ]);
  const rows = useMemo(
    () =>
      (report?.findings ?? [])
        .filter(
          (f) =>
            (!severity || f.severity === severity) &&
            (!group || f.group === group) &&
            (!rule || f.rule === rule) &&
            (!kind || f.kind === kind) &&
            (!namespace || f.namespace === namespace) &&
            (showSuppressed || !qualitySuppression(report!, f, exceptions)) &&
            (!text ||
              [f.label, f.iri, f.message, f.rule, ...f.related]
                .join(" ")
                .toLowerCase()
                .includes(text.toLowerCase())),
        )
        .sort((a, b) =>
          grouping === "entity"
            ? a.iri.localeCompare(b.iri) || a.rule.localeCompare(b.rule)
            : a.rule.localeCompare(b.rule) || a.iri.localeCompare(b.iri),
        ),
    [
      report,
      exceptions,
      text,
      severity,
      group,
      rule,
      kind,
      namespace,
      grouping,
      showSuppressed,
    ],
  );
  const active = rows.find((f) => f.id === chosen) ?? rows[0];
  const pages = Math.max(1, Math.ceil(rows.length / 40)),
    currentPage = Math.min(page, pages - 1);
  const suppressed =
    report?.findings.filter((f) => qualitySuppression(report, f, exceptions))
      .length ?? 0;
  const entityIds = useMemo(
    () => new Set(snapshot.entities.map((e) => e.iri)),
    [snapshot.entities],
  );
  const missing =
    report?.findings.filter(
      (f) =>
        f.rule === "label.missing" &&
        !qualitySuppression(report, f, exceptions) &&
        entityIds.has(f.iri),
    ) ?? [];
  const navigate = (iri: string) =>
    action(async () => {
      if (!report || stale)
        throw Error(
          "Run the scan again before navigating in a changed ontology.",
        );
      await request("select", {
        iri,
        datasetEpoch: report.datasetEpoch,
        version: report.version,
      });
      editEntity(iri);
    });
  const repairPages = Math.max(1, Math.ceil((repairs?.length ?? 0) / 30));
  return (
    <section
      className="panel quality-panel"
      data-panel="quality"
      aria-label="Ontology Quality"
    >
      <div className="panel-toolbar quality-toolbar">
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              setStarting(true);
              setMessage("");
              try {
                await startQuality(options);
              } finally {
                setStarting(false);
              }
            })
          }
        >
          Run scan
        </button>
        <button
          disabled={!busy || starting}
          onClick={() => void action(cancelQuality)}
        >
          Cancel scan
        </button>
        <button
          disabled={!report || busy}
          onClick={() =>
            void action(async () => {
              const file = await window.axiom.qualityExport({
                id: job!.id,
                format: "json",
                exceptions,
              });
              if (file) setMessage("Exported " + file);
            })
          }
        >
          Export JSON
        </button>
        <button
          disabled={!report || busy}
          onClick={() =>
            void action(async () => {
              const file = await window.axiom.qualityExport({
                id: job!.id,
                format: "csv",
                exceptions,
              });
              if (file) setMessage("Exported " + file);
            })
          }
        >
          Export CSV
        </button>
      </div>
      <div className="quality-scroll">
        <h2>Ontology Quality</h2>
        <p>
          Review completeness, naming, structure, and feature compatibility.
          Scanning leaves ontology statements unchanged.
        </p>
        <details open={!report && !busy} className="quality-settings">
          <summary>Scan settings and rules</summary>
          <fieldset disabled={busy}>
            <legend>Scan scope</legend>
            <div className="quality-fields">
              <label>
                Profile
                <select
                  value={options.profile}
                  onChange={(e) =>
                    change({
                      ...defaultQualityOptions(
                        e.target.value as QualityOptions["profile"],
                      ),
                      scope: options.scope,
                      namespace: options.namespace,
                      root: options.root,
                    })
                  }
                >
                  {["Axiom", "SKOS", "OBO-inspired"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Scope
                <select
                  value={options.scope}
                  onChange={(e) =>
                    change({ scope: e.target.value as QualityOptions["scope"] })
                  }
                >
                  <option value="ontology">Whole loaded ontology</option>
                  <option value="namespace">Namespace</option>
                  <option value="branch">
                    Taxonomy branch and descendants
                  </option>
                </select>
              </label>
              {options.scope === "namespace" && (
                <label>
                  Namespace
                  <input
                    value={options.namespace}
                    placeholder="https://example.org/#"
                    onChange={(e) => change({ namespace: e.target.value })}
                  />
                </label>
              )}
              {options.scope === "branch" && (
                <label>
                  Branch root
                  <select
                    value={options.root}
                    onChange={(e) => change({ root: e.target.value })}
                  >
                    <option value="">Choose a named class</option>
                    {snapshot.entities
                      .filter(
                        (e) =>
                          ["Class", "Defined"].includes(e.kind) &&
                          !e.iri.startsWith("_:"),
                      )
                      .map((e) => (
                        <option key={e.iri} value={e.iri}>
                          {e.label ?? humanise(e.name)} — {e.iri}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <p>
              Only loaded definitions are checked. Remote imports are not
              fetched.
            </p>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Entity kinds</legend>
            <div className="quality-checks">
              {qualityKinds.map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={options.kinds.includes(k)}
                    onChange={() => change({ kinds: toggle(options.kinds, k) })}
                  />
                  {kindLabel(k)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Check groups</legend>
            <div className="quality-checks">
              {qualityGroups.map((g) => (
                <label key={g}>
                  <input
                    type="checkbox"
                    checked={options.groups.includes(g)}
                    onChange={() =>
                      change({ groups: toggle(options.groups, g) })
                    }
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>
          <details>
            <summary>Predicates, languages, and rule severity</summary>
            <div className="quality-fields">
              <label>
                Preferred languages
                <input
                  value={options.languages.join(", ")}
                  onChange={(e) =>
                    change({
                      languages: e.target.value
                        .split(",")
                        .map((s) => s.trim().toLowerCase()),
                    })
                  }
                  placeholder="en, es (optional)"
                />
              </label>
              {(
                [
                  ["labelPredicates", "Primary-label predicates"],
                  ["descriptionPredicates", "Description predicates"],
                  ["definitionPredicates", "Definition predicates"],
                  ["replacementPredicates", "Replacement predicates"],
                ] as const
              ).map(([key, title]) => (
                <label key={key}>
                  {title}
                  <textarea
                    rows={3}
                    value={options[key].join("\n")}
                    onChange={(e) =>
                      change({ [key]: e.target.value.split("\n") })
                    }
                  />
                </label>
              ))}
            </div>
            <p>
              One absolute predicate IRI per line. A violation from a configured
              project rule is not a claim that RDF itself is invalid.
              OBO-inspired is a limited curation profile, not certification.
            </p>
            <div className="quality-rule-list">
              {qualityRules.map((r) => (
                <label key={r.id}>
                  <span>
                    {r.title}
                    <small>
                      {r.id} · {r.basis}
                    </small>
                  </span>
                  <select
                    aria-label={r.title + " severity"}
                    value={options.rules[r.id]}
                    onChange={(e) =>
                      change({
                        rules: {
                          ...options.rules,
                          [r.id]: e.target
                            .value as QualityOptions["rules"][string],
                        },
                      })
                    }
                  >
                    {["Off", "Violation", "Warning", "Information"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </details>
        </details>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {busy && (
          <div role="status">
            <progress
              aria-label="Quality scan progress"
              max={Math.max(1, job?.total ?? 1)}
              value={job?.scanned ?? 0}
            />{" "}
            {job?.phase ?? "Starting"} · {job?.scanned ?? 0} / {job?.total ?? 0}{" "}
            entities
          </div>
        )}
        {job?.state === "failed" && (
          <p role="alert" className="error">
            Scan failed: {job.error}. No complete report is available.
          </p>
        )}
        {job?.state === "canceled" && (
          <p role="status">
            Scan canceled after {job.scanned} entities. Results are incomplete;
            run the scan again.
          </p>
        )}
        {report && (
          <>
            <div className="quality-summary">
              <strong>{stale ? "Stale report" : "Scan complete"}</strong> ·{" "}
              {report.scanned} entities scanned · {report.findings.length}{" "}
              findings · {suppressed} suppressed
              <p>
                {report.name} · Dataset {report.datasetEpoch}, revision{" "}
                {report.version} · {report.options.profile} ·{" "}
                {report.options.scope}
                {report.options.scope === "namespace"
                  ? ": " + report.options.namespace
                  : report.options.scope === "branch"
                    ? ": " + report.options.root
                    : ""}
              </p>
              {stale && (
                <p role="status">
                  The ontology changed. Run the scan again to refresh findings
                  and label suggestions.
                </p>
              )}
              {changedSettings && (
                <p>
                  Settings changed. These results retain the configuration used
                  for the completed scan.
                </p>
              )}
            </div>
            <details>
              <summary>Coverage and scan limitations</summary>
              <ul>
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              {!!report.imports.length && (
                <p>Declared imports: {report.imports.join(", ")}</p>
              )}
              <table className="quality-table">
                <caption>
                  Coverage per rule (distinct entities; ontology metadata uses
                  ontology records)
                </caption>
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Applicable</th>
                    <th>With findings</th>
                    <th>Not applicable</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.coverage.map((c) => (
                    <tr key={c.rule}>
                      <td>{c.rule}</td>
                      <td>{c.applicable}</td>
                      <td>{c.checked ? c.affected : "—"}</td>
                      <td>{c.notApplicable}</td>
                      <td>{c.checked ? "Checked" : "Not checked"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <div className="quality-filters">
              <label>
                Search findings
                <input
                  type="search"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label>
                Severity
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">All severities</option>
                  {["Violation", "Warning", "Information"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Check group
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  <option value="">All groups</option>
                  {qualityGroups.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label>
                Rule
                <select value={rule} onChange={(e) => setRule(e.target.value)}>
                  <option value="">All rules</option>
                  {qualityRules.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Entity kind
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">All kinds</option>
                  {[...qualityKinds, "Ontology"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Finding namespace
                <select
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                >
                  <option value="">All namespaces</option>
                  {[...new Set(report.findings.map((f) => f.namespace))]
                    .sort()
                    .map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                </select>
              </label>
              <label>
                Group by
                <select
                  value={grouping}
                  onChange={(e) => setGrouping(e.target.value)}
                >
                  <option value="rule">Rule</option>
                  <option value="entity">Entity</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showSuppressed}
                  onChange={(e) => setShowSuppressed(e.target.checked)}
                />
                Show suppressed
              </label>
            </div>
            {!rows.length && (
              <p role="status">
                {report.findings.length
                  ? "No findings match these filters."
                  : "No findings under the selected checks. This does not establish ontology completeness."}
              </p>
            )}
            {active && (
              <section
                className="quality-finding"
                aria-label="Selected quality finding"
              >
                <h3>{active.label}</h3>
                <p className="quality-iri">{active.iri}</p>
                <p>
                  <strong>
                    {active.severity} · {active.rule}
                  </strong>{" "}
                  · {active.basis}
                </p>
                <p>{active.message}</p>
                <p>{active.suggestion}</p>
                <button
                  disabled={stale || active.kind === "Ontology"}
                  onClick={() => void navigate(active.iri)}
                >
                  Open entity in Details
                </button>
                <details>
                  <summary>Statement evidence and related entities</summary>
                  {active.evidence.length ? (
                    <pre>{JSON.stringify(active.evidence, null, 2)}</pre>
                  ) : (
                    <p>No qualifying statement was found.</p>
                  )}
                  {active.related.map((iri) => (
                    <p className="quality-iri" key={iri}>
                      {iri}
                    </p>
                  ))}
                </details>
                {qualitySuppression(report, active, exceptions) ? (
                  <p>
                    Exception:{" "}
                    {qualitySuppression(report, active, exceptions)!.reason}{" "}
                    <button
                      onClick={() =>
                        saveExceptions(
                          exceptions.filter(
                            (e) =>
                              e !==
                              qualitySuppression(report, active, exceptions),
                          ),
                        )
                      }
                    >
                      Remove exception
                    </button>
                  </p>
                ) : (
                  <div className="quality-exception">
                    <label>
                      Exception reason
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={!reason.trim() || stale}
                      onClick={() => {
                        saveExceptions([
                          ...exceptions,
                          {
                            ontology: report.ontology,
                            iri: active.iri,
                            rule: active.rule,
                            signature: active.signature,
                            reason: reason.trim(),
                          },
                        ]);
                        setReason("");
                      }}
                    >
                      Record intentional exception
                    </button>
                  </div>
                )}
              </section>
            )}
            {!!rows.length && (
              <>
                <div className="quality-table-scroll">
                  <table className="quality-table">
                    <caption>
                      {rows.length} matching findings; all results are retained
                    </caption>
                    <thead>
                      <tr>
                        <th>{grouping === "rule" ? "Rule" : "Entity"}</th>
                        <th>{grouping === "rule" ? "Entity" : "Rule"}</th>
                        <th>Severity</th>
                        <th>Finding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .slice(currentPage * 40, currentPage * 40 + 40)
                        .map((f) => (
                          <tr key={f.id} data-active={f.id === active?.id}>
                            <td>{grouping === "rule" ? f.rule : f.label}</td>
                            <td>
                              <button
                                aria-pressed={f.id === active?.id}
                                title={f.iri}
                                onClick={() => {
                                  setChosen(f.id);
                                  setReason("");
                                }}
                              >
                                {grouping === "rule" ? f.label : f.rule}
                              </button>
                            </td>
                            <td>
                              {f.severity}
                              {qualitySuppression(report, f, exceptions) &&
                                " (suppressed)"}
                            </td>
                            <td>{f.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <nav
                  aria-label="Quality findings pages"
                  className="quality-toolbar"
                >
                  <button
                    disabled={!currentPage}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage + 1} of {pages}
                  </span>
                  <button
                    disabled={currentPage + 1 >= pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </nav>
              </>
            )}
            <details>
              <summary>
                Recorded exceptions (
                {
                  exceptions.filter((e) => e.ontology === report.ontology)
                    .length
                }
                )
              </summary>
              {exceptions
                .filter((e) => e.ontology === report.ontology)
                .map((e, i) => (
                  <p key={i} className="quality-iri">
                    {e.iri} · {e.rule} · {e.reason}{" "}
                    <button
                      onClick={() =>
                        saveExceptions(exceptions.filter((x) => x !== e))
                      }
                    >
                      Remove exception
                    </button>
                  </p>
                ))}
              <p>
                Exceptions apply only to this ontology identity, exact entity,
                rule, and finding evidence. Changed findings are reviewed again.
              </p>
            </details>
            <div className="quality-toolbar">
              <button
                disabled={stale || busy || !missing.length}
                onClick={() => {
                  setRepairs(
                    missing.map((f) => ({
                      iri: f.iri,
                      label: humanise(identifierParts(f.iri).name),
                      predicate: report.options.labelPredicates[0],
                      language: "",
                      selected: false,
                    })),
                  );
                  setRepairPage(0);
                  setPreview(undefined);
                }}
              >
                Review missing labels ({missing.length})
              </button>
            </div>
            {repairs && (
              <section
                aria-label="Review proposed labels"
                className="quality-repairs"
              >
                <h3>Review proposed labels</h3>
                <p>
                  These candidates come from identifiers. Select and edit the
                  labels you want to add. Existing identifiers and annotations
                  are preserved.
                </p>
                <button
                  disabled={stale}
                  onClick={() => {
                    setRepairs(repairs.map((r) => ({ ...r, selected: true })));
                    setPreview(undefined);
                  }}
                >
                  Select all proposed labels
                </button>{" "}
                <button
                  onClick={() => {
                    setRepairs(repairs.map((r) => ({ ...r, selected: false })));
                    setPreview(undefined);
                  }}
                >
                  Clear selection
                </button>
                <div className="quality-table-scroll">
                  <table className="quality-table">
                    <thead>
                      <tr>
                        <th>Add</th>
                        <th>Entity IRI</th>
                        <th>Label</th>
                        <th>Predicate</th>
                        <th>Language</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repairs
                        .slice(repairPage * 30, repairPage * 30 + 30)
                        .map((r) => {
                          const update = (
                            change: Partial<
                              QualityRepair & { selected: boolean }
                            >,
                          ) => {
                            setRepairs(
                              repairs.map((x) =>
                                x.iri === r.iri ? { ...x, ...change } : x,
                              ),
                            );
                            setPreview(undefined);
                          };
                          return (
                            <tr key={r.iri}>
                              <td>
                                <input
                                  aria-label={"Add label for " + r.iri}
                                  type="checkbox"
                                  checked={r.selected}
                                  onChange={(e) =>
                                    update({ selected: e.target.checked })
                                  }
                                />
                              </td>
                              <td className="quality-iri">{r.iri}</td>
                              <td>
                                <input
                                  aria-label={"Proposed label for " + r.iri}
                                  value={r.label}
                                  onChange={(e) =>
                                    update({ label: e.target.value })
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  aria-label={"Label predicate for " + r.iri}
                                  value={r.predicate}
                                  onChange={(e) =>
                                    update({ predicate: e.target.value })
                                  }
                                >
                                  {report.options.labelPredicates.map((p) => (
                                    <option key={p}>{p}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  aria-label={"Label language for " + r.iri}
                                  value={r.language}
                                  onChange={(e) =>
                                    update({ language: e.target.value })
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="quality-toolbar">
                  <button
                    disabled={!repairPage}
                    onClick={() => setRepairPage((p) => p - 1)}
                  >
                    Previous labels
                  </button>
                  <span>
                    Page {repairPage + 1} of {repairPages} ·{" "}
                    {repairs.filter((r) => r.selected).length} selected
                  </span>
                  <button
                    disabled={repairPage + 1 >= repairPages}
                    onClick={() => setRepairPage((p) => p + 1)}
                  >
                    Next labels
                  </button>
                  <button
                    disabled={stale || !repairs.some((r) => r.selected)}
                    onClick={() =>
                      void action(async () =>
                        setPreview(
                          await request<QualityPreview>("qualityPreview", {
                            id: job!.id,
                            rows: repairs.filter((r) => r.selected),
                          }),
                        ),
                      )
                    }
                  >
                    Preview selected additions
                  </button>
                </div>
                {preview && (
                  <div>
                    <h4>Exact statements to add</h4>
                    <pre>{JSON.stringify(preview.statements, null, 2)}</pre>
                    <button
                      disabled={stale}
                      onClick={() =>
                        void action(async () => {
                          const n = await request<number>("qualityApply", {
                            datasetEpoch: preview.datasetEpoch,
                            version: preview.version,
                            token: preview.token,
                          });
                          setPreview(undefined);
                          setRepairs(undefined);
                          setMessage(
                            "Added " +
                              n +
                              " labels. Use Edit > Undo to reverse this batch.",
                          );
                        })
                      }
                    >
                      Apply {preview.statements.length} label additions
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
