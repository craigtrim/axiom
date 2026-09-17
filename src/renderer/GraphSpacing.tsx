import { useEffect, useRef, useState } from "react";
import { MIN_GRAPH_SPACING, MAX_GRAPH_SPACING } from "../shared/graph-spacing";
import { useGraphScope } from "./GraphScope";
import { report } from "./client";

/** Preview at most every 80ms; one pointer/keyboard gesture is one undo step. */
export function GraphSpacing({
  value,
  epoch,
}: {
  value: number;
  epoch: number;
}) {
  const { request } = useGraphScope();
  const [percent, setPercent] = useState(Math.round(value * 100));
  const pending = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const send = (next: number, preview: boolean) => {
    void request("spacing", {
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
  }, [value]);
  useEffect(() => () => commit(), [request, epoch]);
  return (
    <label
      className="graph-spacing"
      title="Distance between nodes, including within clusters. Pinned nodes stay fixed."
    >
      Node spacing
      <input
        type="range"
        aria-label="Node spacing"
        aria-valuetext={percent + "%"}
        min={MIN_GRAPH_SPACING * 100}
        max={MAX_GRAPH_SPACING * 100}
        step={5}
        value={percent}
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
      <output>{percent}%</output>
    </label>
  );
}
