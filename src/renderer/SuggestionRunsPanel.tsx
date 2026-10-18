// craigtrim/axiom#94: one frozen queue with direct review and its own persisted error references.
import { useEffect, useState } from "react";
import {
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
import { ErrorNotice, ErrorDetailsButton } from "./ErrorNotice";
import {
  UtilityFrame,
  UtilityTag,
  UtilityToolbar,
  useUtilityToast,
} from "./UtilityPane";
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
  const s = useSnapshot()!,
    [batches, setBatches] = useState<SuggestionBatch[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { toast, notify } = useUtilityToast();
  const [cleared, setCleared] = useState(
    panel<Record<string, number>>("suggestionruns.clearedByNamespace", {}),
  );
  useEffect(() => {
    let live = true,
      revision = 0;
    const load = async () => {
      const request = ++revision;
      try {
        const result = await window.axiom.suggestions.batches();
        if (live && request === revision) {
          setBatches(result);
          setCleared(panel("suggestionruns.clearedByNamespace", {}));
        }
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
  const batch = batches.find(
    (b) =>
      b.namespace === s.ontology.namespace &&
      b.createdAt > (cleared[b.namespace] ?? 0),
  );
  const running = !!batch?.runs.some(pendingBatchRun);
  async function act(fn: () => Promise<unknown>) {
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
  const cancel = () =>
    void act(async () => {
      if (!batch) return;
      await window.axiom.suggestions.cancelBatch(batch.id);
      notify(
        "No further targets will start.",
        "The run already in flight is allowed to finish first.",
      );
    });
  const again = () =>
    void act(async () => {
      if (!batch) return;
      const next = await window.axiom.suggestions.enqueue({
        iris: batch.runs.map((r) => r.iri),
        mode: batch.mode,
        provider: batch.provider,
        datasetEpoch: s.datasetEpoch,
      });
      if (state?.datasetEpoch !== s.datasetEpoch) return;
      savePanel("suggestionruns.batch", next.id, false);
      command("suggestions.batchesChanged");
    });
  const clear = () =>
    void act(async () => {
      if (!batch) return;
      await window.axiom.suggestions.clearBatch(batch.id);
      if (state?.datasetEpoch !== s.datasetEpoch) return;
      const next = {
        ...panel<Record<string, number>>(
          "suggestionruns.clearedByNamespace",
          {},
        ),
        [batch.namespace]: batch.createdAt,
      };
      savePanel("suggestionruns.clearedByNamespace", next, false);
      setCleared(next);
      setBatches((old) => old.filter((b) => b.id !== batch.id));
    });
  const complete =
      batch?.runs.filter((r) => r.state === "completed").length ?? 0,
    failed = batch?.runs.filter((r) => r.state === "failed").length ?? 0;
  return (
    <UtilityFrame
      id="suggestionruns"
      label="Suggestion runs"
      toast={toast}
      toolbar={
        <UtilityToolbar
          label="Suggestion runs actions"
          primary={
            <button
              className="btn primary"
              disabled={busy || !batch}
              onClick={running ? cancel : again}
            >
              {running ? "Cancel the batch" : "Run the batch"}
            </button>
          }
          state={
            batch
              ? `assistant ${batch.provider === "codex" ? "Codex" : "Claude"}, ${batch.runs.length} targets`
              : "No batch"
          }
          actions={[
            {
              id: "clear",
              label: "Clear results",
              priority: 1,
              disabled: busy || !batch,
              run: clear,
            },
          ]}
          items={[
            {
              id: "clear",
              label: "Clear results",
              disabled: busy || !batch,
              run: clear,
            },
          ]}
        />
      }
      head={
        <>
          <div className="note2">
            <b>The target list was frozen when the batch was invoked.</b>
            {
              " Changing the hierarchy selection does not retarget it, runs execute one at a time, and a failed run does not stop the ones behind it."
            }
          </div>
          {error && (
            <div className="note2 bad3">
              <ErrorNotice error={error} />
            </div>
          )}
        </>
      }
      footer={
        <>
          <span>
            <span className="num">{complete}</span> complete
          </span>
          <span>
            <span className="num">{failed}</span> failed
          </span>
          <span>sequential, one target at a time</span>
          <span>a failure keeps its own log reference across a restart</span>
        </>
      }
    >
      {!batch ? (
        <div className="empty">
          Select nodes in Hierarchy, then choose an action from Suggest or Find.
        </div>
      ) : (
        <table className="grid" aria-label="Selected node runs">
          <colgroup>
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Target</th>
              <th>Status</th>
              <th className="num">Results</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.runs.map((run) => {
              const review = () => {
                if (run.reviewable)
                  openTaxonomy(run.iri, batch.mode, run.id, "taxonomy", false);
              };
              const label =
                run.state === "completed"
                  ? "complete"
                  : ["cancelled", "interrupted"].includes(run.state)
                    ? "not run"
                    : run.state;
              const kind =
                label === "complete"
                  ? "good"
                  : label === "failed"
                    ? "err"
                    : label === "not run"
                      ? "wrn"
                      : "inf";
              return (
                <tr
                  key={run.id}
                  data-run-iri={run.iri}
                  tabIndex={run.reviewable ? 0 : undefined}
                  aria-label={
                    run.reviewable ? "Open run for " + run.label : undefined
                  }
                  onClick={review}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && e.key === "Enter") {
                      e.preventDefault();
                      review();
                    }
                  }}
                >
                  <td title={run.iri}>{run.label}</td>
                  <td>
                    <UtilityTag kind={kind} title={run.error}>
                      {label}
                    </UtilityTag>
                  </td>
                  <td className="num">
                    {run.state === "completed" ? run.count : ""}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {run.state === "failed" && (
                      <ErrorDetailsButton
                        error={run.error ?? "Suggestion run failed"}
                        auditId={run.auditId}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </UtilityFrame>
  );
}
