// craigtrim/axiom#205: preview Strict-to-Loose changes as one undoable gesture.
import { useEffect, useRef, useState } from "react";
import {
  MIN_CLUSTER_LOOSENESS,
  MAX_CLUSTER_LOOSENESS,
} from "../shared/graph-clusters";
import { useGraphScope } from "./GraphScope";
import { report } from "./client";

export function GraphClusters({
  value,
  epoch,
  disabled,
}: {
  value: number;
  epoch: number;
  disabled: boolean;
}) {
  const { request } = useGraphScope();
  const [percent, setPercent] = useState(Math.round(value * 100));
  const pending = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const send = (next: number, preview: boolean) => {
    void request("clusterLooseness", {
      value: next / 100,
      preview,
      datasetEpoch: epoch,
    }).catch((error) => report((error as Error).message, true));
  };
  const commit = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current === undefined) return;
    const next = pending.current;
    pending.current = undefined;
    send(next, false);
  };
  useEffect(() => {
    if (pending.current === undefined) setPercent(Math.round(value * 100));
  }, [value, epoch, request]);
  useEffect(() => () => commit(), [request, epoch]);
  return (
    <label
      className="graph-clusters"
      title="How strictly a cluster is defined. Strict: only groups with no relationship to the rest of the graph. Loose: groups of nodes that sit together on the canvas, whatever their relationships."
    >
      <span>Clusters</span>
      <output>{percent}%</output>
      <input
        type="range"
        aria-label="Clusters"
        aria-valuetext={percent + "%"}
        min={MIN_CLUSTER_LOOSENESS * 100}
        max={MAX_CLUSTER_LOOSENESS * 100}
        step={5}
        value={percent}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          setPercent(next);
          pending.current = next;
          if (timer.current === undefined)
            timer.current = setTimeout(() => {
              timer.current = undefined;
              if (pending.current !== undefined) send(pending.current, true);
            }, 80);
        }}
        onPointerDown={(event) =>
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        onPointerUp={commit}
        onPointerCancel={commit}
        onBlur={commit}
        onKeyUp={commit}
      />
      <span className="graph-clusters-ends" aria-hidden="true">
        <span>Strict</span>
        <span>Loose</span>
      </span>
    </label>
  );
}
