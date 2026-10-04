import { useEffect, useState } from "react";
import {
  batchModes,
  pendingBatchRun,
  type BatchMode,
  type SuggestionBatch,
} from "../shared/suggestion-batches";
import {
  command,
  onCommand,
  panel,
  savePanel,
  state,
  useSnapshot,
} from "./client";
import { openTaxonomy } from "./taxonomy-view";
import { ErrorNotice } from "./ErrorNotice";
import "./suggestion-runs.css";

export async function openSuggestionBatch(iris: string[], mode: BatchMode) {
  if (!state) return;
  const epoch = state.datasetEpoch;
  const batch = await window.axiom.suggestions.enqueue({
    iris,
    mode,
    datasetEpoch: epoch,
    provider: panel("assistant.provider", "claude"),
  });
  if (state.datasetEpoch !== epoch) return;
  savePanel("suggestionruns.batch", batch.id, false);
  command("suggestions.batchesChanged");
  command("view.suggestionruns");
}

export function SuggestionRunsPanel() {
  const s = useSnapshot()!;
  const [batches, setBatches] = useState<SuggestionBatch[]>([]);
  const [selected, setSelected] = useState(panel("suggestionruns.batch", ""));
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      revision = 0;
    const load = async () => {
      const request = ++revision;
      try {
        const result = await window.axiom.suggestions.batches();
        if (!live || request !== revision) return;
        setBatches(result);
        setSelected(panel("suggestionruns.batch", ""));
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    void load();
    const off = onCommand((id) => {
      if (id === "suggestions.batchesChanged") void load();
    });
    return () => {
      live = false;
      off();
    };
  }, [s.datasetEpoch]);
  const relevant = batches.filter((b) => b.namespace === s.ontology.namespace);
  const batch = relevant.find((b) => b.id === selected) ?? relevant[0];
  const cancel = async (runId?: string) => {
    if (!batch) return;
    try {
      await window.axiom.suggestions.cancelBatch(batch.id, runId);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section
      className="panel suggestion-runs"
      data-panel="suggestionruns"
      aria-label="Suggestion runs"
    >
      <header>
        <h2>Suggestion runs</h2>
        <p>
          One run per selected node. Children and descendants are not added to
          the selection.
        </p>
        <label>
          Batch
          <select
            aria-label="Suggestion batch"
            value={batch?.id ?? ""}
            onChange={(e) => {
              savePanel("suggestionruns.batch", e.target.value, false);
              setSelected(e.target.value);
            }}
          >
            {!relevant.length && <option value="">No batches yet</option>}
            {relevant.map((b) => (
              <option key={b.id} value={b.id}>
                {batchModes[b.mode]} · {b.runs.length} nodes ·{" "}
                {new Date(b.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && <ErrorNotice error={error} />}
      {batch ? (
        <>
          <div className="panel-toolbar suggestion-run-summary">
            <span role="status">
              {batch.runs.filter((r) => r.state === "completed").length} /{" "}
              {batch.runs.length} completed ·{" "}
              {batch.provider === "codex" ? "Codex" : "Claude"}
            </span>
            <button
              disabled={!batch.runs.some(pendingBatchRun)}
              onClick={() => void cancel()}
            >
              Cancel remaining runs
            </button>
          </div>
          <div className="suggestion-run-table">
            <table aria-label="Selected node runs">
              <thead>
                <tr>
                  <th scope="col">Node</th>
                  <th scope="col">Status</th>
                  <th scope="col">Results</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batch.runs.map((run) => (
                  <tr key={run.id} data-run-iri={run.iri}>
                    <th scope="row">
                      <span title={run.iri}>{run.label}</span>
                    </th>
                    <td>
                      <span className={"run-state " + run.state}>
                        {run.state[0].toUpperCase() + run.state.slice(1)}
                      </span>
                      {run.error && <p className="run-error">{run.error}</p>}
                    </td>
                    <td>{run.count ?? "—"}</td>
                    <td>
                      <div className="suggestion-run-actions">
                        <button
                          disabled={!run.reviewable}
                          aria-label={"Open run for " + run.label}
                          onClick={() =>
                            openTaxonomy(
                              run.iri,
                              batch.mode,
                              run.id,
                              "taxonomy",
                              false,
                            )
                          }
                        >
                          Open run
                        </button>
                        {pendingBatchRun(run) && (
                          <button
                            aria-label={"Cancel run for " + run.label}
                            onClick={() => void cancel(run.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer>
            Open a completed run to review its suggestions. Nothing is added
            automatically. Closing this view lets queued runs continue.
          </footer>
        </>
      ) : (
        <p className="empty">
          Select nodes in Hierarchy, then choose an action from Suggest or Find.
        </p>
      )}
    </section>
  );
}
