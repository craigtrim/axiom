import { useEffect, useMemo, useState } from "react";
import { THING } from "../domain/model";
import { namedClass } from "../domain/class-expressions";
import {
  scoreSparsityRows,
  type SparsityReport,
  type SparsityRow,
} from "../shared/sparsity";
import { request, useSnapshot } from "./client";
import {
  openSparsity,
  updateSparsity,
  useSparsityOptions,
} from "./sparsity-view";
import { editEntity } from "./authoring";
import { revealInTaxonomy } from "./taxonomy-navigation";
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const rowKey = (row: SparsityRow) => JSON.stringify([row.parent, row.iri]);
export function SparsityPanel() {
  const snapshot = useSnapshot()!,
    options = useSparsityOptions();
  const [result, setResult] = useState<{
    key: string;
    data?: SparsityReport;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0),
    [chosen, setChosen] = useState("");
  const [page, setPage] = useState(0),
    [actionError, setActionError] = useState("");
  const scopeEntity = snapshot.entities.find((e) => e.iri === options.iri);
  const validScope =
    options.namespace === snapshot.ontology.namespace &&
    !!scopeEntity &&
    namedClass(scopeEntity);
  const key = JSON.stringify([
    validScope,
    options.iri,
    snapshot.datasetEpoch,
    snapshot.version,
    revision,
  ]);
  useEffect(() => {
    if (!validScope) return;
    let active = true;
    const timer = setTimeout(() => {
      void request<SparsityReport>("analyzeSparsity", {
        iri: options.iri,
      })
        .then((data) => {
          if (active) setResult({ key, data });
        })
        .catch((error) => {
          if (active) setResult({ key, error: error.message });
        });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);
  const rawData = validScope && result?.key === key ? result.data : undefined;
  const data = useMemo(
    () =>
      rawData
        ? {
            ...rawData,
            rows: scoreSparsityRows(rawData.rows, options.descendantWeight),
          }
        : undefined,
    [rawData, options.descendantWeight],
  );
  const error = validScope && result?.key === key ? result.error : undefined;
  const busy = validScope && result?.key !== key;
  const rows = useMemo(() => {
    const text = options.text.trim().toLocaleLowerCase();
    return (data?.rows ?? []).filter(
      (row) =>
        row.score > 0 &&
        row.score >= options.minimumScore &&
        (options.includeLeaves || row.children > 0) &&
        (!text ||
          [row.name, row.parentName, row.iri].some((v) =>
            v.toLocaleLowerCase().includes(text),
          )),
    );
  }, [data, options.minimumScore, options.includeLeaves, options.text]);
  useEffect(() => {
    setPage(0);
  }, [
    key,
    options.descendantWeight,
    options.minimumScore,
    options.includeLeaves,
    options.text,
  ]);
  const active = rows.find((row) => rowKey(row) === chosen) ?? rows[0];
  const selected = snapshot.entities.find((e) => e.iri === snapshot.selected);
  const canAnalyze = !!selected && namedClass(selected);
  const pages = Math.max(1, Math.ceil(rows.length / 40)),
    currentPage = Math.min(page, pages - 1);
  const navigate = (iri: string, details = false) => {
    setActionError("");
    void request("select", { iri })
      .then(() => {
        if (details) editEntity(iri);
        else revealInTaxonomy(iri);
      })
      .catch((e) => setActionError(e.message));
  };
  const peers = useMemo(() => {
    if (!active) return [];
    const group = data!.rows.filter((row) => row.parent === active.parent);
    group.sort(
      (a, b) => b.children - a.children || a.name.localeCompare(b.name),
    );
    const shown = group.slice(0, 10);
    if (!shown.some((row) => row.iri === active.iri)) shown.push(active);
    return shown;
  }, [active, data]);
  const maxChildren = Math.max(1, ...peers.map((row) => row.children));
  return (
    <section
      className="panel sparsity-panel"
      data-panel="sparsity"
      aria-label="Sparsity analysis"
    >
      <div className="panel-toolbar sparsity-toolbar">
        <button
          disabled={!canAnalyze}
          onClick={() => openSparsity(selected!.iri)}
        >
          Analyze selected
        </button>
        <button
          disabled={!snapshot.classCount}
          onClick={() => openSparsity(THING)}
        >
          Whole taxonomy
        </button>
        <button
          disabled={!validScope || busy}
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh
        </button>
      </div>
      <div className="sparsity-scroll">
        {!validScope && (
          <p className="empty-state">
            Right-click a class in Hierarchy and choose Analyze sparsity, or
            select a class and analyze it here.
          </p>
        )}
        {busy && <p role="status">Analyzing hierarchy…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {actionError && (
          <p role="alert" className="error">
            {actionError}
          </p>
        )}
        {data && (
          <>
            <header className="sparsity-summary">
              <div>
                <span className="sparsity-eyebrow">BRANCH SPARSITY</span>
                <h2>{data.name}</h2>
                <p>Branches with less development than their siblings.</p>
              </div>
              <dl>
                <div>
                  <dt>Classes in scope</dt>
                  <dd>{number(data.classes)}</dd>
                </div>
                <div>
                  <dt>Sibling groups</dt>
                  <dd>{number(data.groups)}</dd>
                </div>
                <div>
                  <dt>Findings shown</dt>
                  <dd>{number(rows.length)}</dd>
                </div>
              </dl>
            </header>
            <div className="sparsity-controls">
              <label>
                Minimum score{" "}
                <input
                  aria-label="Minimum sparsity score"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={options.minimumScore}
                  onChange={(e) =>
                    updateSparsity({ minimumScore: Number(e.target.value) })
                  }
                />
                <output>{options.minimumScore}</output>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.includeLeaves}
                  onChange={(e) =>
                    updateSparsity({ includeLeaves: e.target.checked })
                  }
                />
                Include leaf classes
              </label>
              <input
                aria-label="Filter sparsity findings"
                type="search"
                placeholder="Filter class or parent"
                value={options.text}
                onChange={(e) => updateSparsity({ text: e.target.value })}
              />
            </div>
            {data.cycleClasses > 0 && (
              <p className="sparsity-note">
                {number(data.cycleClasses)} classes belong to cycles.{" "}
                {number(data.excludedBranches)} branches containing those cycles
                are excluded from comparison; their unaffected sub-branches can
                still be reviewed.
              </p>
            )}
            {!rows.length && (
              <p role="status" className="sparsity-note">
                {!data.groups
                  ? "There are no comparable sibling groups in this branch."
                  : "No branches meet these filters. This does not establish that the taxonomy is complete."}
              </p>
            )}
            {active && (
              <section
                className="sparsity-explanation"
                aria-label="Selected finding"
              >
                <div className="sparsity-explanation-heading">
                  <div>
                    <h3>{active.name}</h3>
                    <p>
                      Under{" "}
                      <button
                        className="sparsity-link"
                        onClick={() => navigate(active.parent)}
                      >
                        {active.parentName}
                      </button>
                    </p>
                  </div>
                  <div className="sparsity-score">
                    <strong>{Math.round(active.score)}</strong>
                    <span>/ 100 sparsity</span>
                  </div>
                </div>
                <p>
                  <strong>
                    {number(active.children)} direct{" "}
                    {active.children === 1 ? "child" : "children"}
                  </strong>{" "}
                  versus a sibling average of{" "}
                  <strong>{number(active.peerChildren)}</strong> across{" "}
                  {number(active.peers)} {active.peers === 1 ? "peer" : "peers"}
                  .{" "}
                  {active.children === 0
                    ? "A leaf may be intentional; review its meaning before adding children."
                    : "Review whether this branch needs more detail."}
                </p>
                <div
                  className="sparsity-bars"
                  aria-label="Direct children comparison"
                >
                  {peers.map((row) => (
                    <div
                      className="sparsity-bar-row"
                      key={row.iri}
                      data-active={row.iri === active.iri}
                    >
                      <span title={row.name}>{row.name}</span>
                      <div className="sparsity-bar-track">
                        <div
                          style={{
                            width:
                              Math.max(0, (row.children / maxChildren) * 100) +
                              "%",
                          }}
                        />
                      </div>
                      <strong>{number(row.children)}</strong>
                    </div>
                  ))}
                </div>
                {active.peers + 1 > peers.length && (
                  <p className="sparsity-note">
                    Showing the 10 largest siblings and this finding. All{" "}
                    {number(active.peers)} peers contribute to the comparison.
                  </p>
                )}
                <p className="sparsity-note">
                  {number(active.nearby)} unique descendants at levels 2 to 4.
                  Weighted count {number(active.discounted)}; sibling average{" "}
                  {number(active.peerDiscounted)}.{" "}
                  {active.peerDiscounted === 0
                    ? "There is no deeper peer context, so direct children determine this score."
                    : "Direct children contribute " +
                      (100 - options.descendantWeight) +
                      "% of the score; nearby descendants contribute " +
                      options.descendantWeight +
                      "%."}
                </p>
                <div className="sparsity-actions">
                  <button onClick={() => navigate(active.iri)}>
                    Find in taxonomy
                  </button>
                  <button onClick={() => navigate(active.iri, true)}>
                    Details
                  </button>
                  <button onClick={() => openSparsity(active.iri)}>
                    Analyze this branch
                  </button>
                </div>
              </section>
            )}
            {rows.length > 0 && (
              <>
                <div className="sparsity-table-scroll">
                  <table className="sparsity-table">
                    <caption>Ranked findings, highest sparsity first</caption>
                    <thead>
                      <tr>
                        <th scope="col">Class</th>
                        <th scope="col">Parent</th>
                        <th scope="col">Children</th>
                        <th scope="col">Peer average</th>
                        <th scope="col">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .slice(currentPage * 40, currentPage * 40 + 40)
                        .map((row) => (
                          <tr
                            key={rowKey(row)}
                            data-active={
                              active && rowKey(row) === rowKey(active)
                            }
                          >
                            <td>
                              <button
                                className="sparsity-link"
                                aria-pressed={
                                  !!active && rowKey(row) === rowKey(active)
                                }
                                onClick={() => setChosen(rowKey(row))}
                              >
                                {row.name}
                              </button>
                            </td>
                            <td>{row.parentName}</td>
                            <td>{number(row.children)}</td>
                            <td>{number(row.peerChildren)}</td>
                            <td>
                              <div className="sparsity-score-cell">
                                <meter
                                  aria-label={row.name + " sparsity score"}
                                  min="0"
                                  max="100"
                                  value={row.score}
                                />
                                <strong>{Math.round(row.score)}</strong>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <nav
                  aria-label="Sparsity results pages"
                  className="sparsity-pagination"
                >
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {currentPage + 1} / {pages} · {number(rows.length)} findings
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
            <details className="sparsity-method">
              <summary>How the scores work and research</summary>
              <p>
                Each class is compared with the other children of the same
                parent. The direct deficit is the fraction by which its child
                count falls below the peer mean, capped between 0 and 1. Levels
                2, 3 and 4 contribute weights of 1, ½ and ¼ to the descendant
                count. A second deficit compares that count with the peer mean.
              </p>
              <label>
                Descendant influence{" "}
                <input
                  aria-label="Descendant influence"
                  type="range"
                  min="0"
                  max="40"
                  step="5"
                  value={options.descendantWeight}
                  onChange={(e) =>
                    updateSparsity({ descendantWeight: Number(e.target.value) })
                  }
                />
                <output>{options.descendantWeight}%</output>
              </label>
              <p>
                The score combines the two deficits on a 0 to 100 scale. A group
                with no deeper peer context uses the direct deficit alone.
                Shared descendants count once per branch, at their shortest
                distance. Separate parents produce separate comparisons. Only
                classes participate; instance counts and non-hierarchy links do
                not affect the score.
              </p>
              <p>
                {number(data.unpaired)} single-child groups have no sibling
                baseline and receive no score. {number(data.sharedClasses)}{" "}
                classes in scope have multiple parents. Analysis follows the
                same named-class hierarchy as Hierarchy, including parents
                derived from class definitions. Analyzing owl:Thing includes all
                top-level branches.
              </p>
              <p>
                This is an Axiom review heuristic, inspired by local comparisons
                in tree-balance research and distance discounting in the Local
                Branching Index. The weights and threshold are product choices,
                not a published test of ontology completeness. A high score is a
                structural difference, not evidence of an error or missing
                concepts.
              </p>
              <ul>
                <li>
                  <a
                    href="https://doi.org/10.1093/sysbio/syac027"
                    onClick={(e) => {
                      e.preventDefault();
                      void window.axiom.research
                        .open("https://doi.org/10.1093/sysbio/syac027")
                        .catch((error) => setActionError(error.message));
                    }}
                  >
                    Lemant et al. (2022), Robust, Universal Tree Balance Indices
                  </a>
                </li>
                <li>
                  <a
                    href="https://elifesciences.org/articles/03568"
                    onClick={(e) => {
                      e.preventDefault();
                      void window.axiom.research
                        .open("https://elifesciences.org/articles/03568")
                        .catch((error) => setActionError(error.message));
                    }}
                  >
                    Neher et al. (2014), Predicting evolution from the shape of
                    genealogical trees
                  </a>
                </li>
              </ul>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
