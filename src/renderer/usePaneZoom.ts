import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { panel, savePanel } from "./client";

/** Zoom one view without changing Electron's workbench-wide zoom. */
export function usePaneZoom(
  root: RefObject<HTMLDivElement | null>,
  paneId: string,
  enabled: boolean,
) {
  const key = "pane.zoom." + paneId;
  const [zoom, setZoom] = useState(() => (enabled ? panel(key, 1) : 1));
  const current = useRef(zoom);
  useLayoutEffect(() => {
    const host = root.current;
    if (!enabled || !host) return;
    current.current = panel(key, 1);
    setZoom(current.current);
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      // Capture before grids/editors consume the gesture. React's wheel listener
      // is passive, so a native listener is needed to cancel browser zoom.
      event.preventDefault();
      event.stopPropagation();
      if (!event.deltaY) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? host.clientHeight
            : 1;
      const next =
        Math.round(
          Math.max(
            0.5,
            Math.min(
              3,
              current.current * Math.exp(-event.deltaY * unit * 0.0015),
            ),
          ) * 10000,
        ) / 10000;
      if (next === current.current) return;
      current.current = next;
      setZoom(next);
      savePanel(key, next, false);
    };
    host.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => host.removeEventListener("wheel", wheel, { capture: true });
  }, [root, key, enabled]);
  return enabled ? zoom : 1;
}
