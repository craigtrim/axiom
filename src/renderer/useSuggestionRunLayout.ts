// craigtrim/axiom#148: measure the shared scroller and preserve focus across slices.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { suggestionRunLayout } from "./suggestion-run-layout";

export function useSuggestionRunLayout(
  root: RefObject<HTMLDivElement | null>,
  runs: readonly { label: string }[],
) {
  const [layout, setLayout] = useState({ columns: 1, minWidth: 470 });
  const current = useRef(layout);
  current.current = layout;
  // Width capacity is independent of height, including when one tall set fits.
  const capacity = useRef(1);
  const focus = useRef<{
    iri: string;
    button: boolean;
    columns: number;
  } | null>(null);
  useLayoutEffect(() => {
    const rows = root.current;
    if (!rows) return;
    const doc = rows.ownerDocument,
      win = doc.defaultView!;
    const canvas = doc.createElement("canvas").getContext("2d")!;
    let live = true;
    const measure = () => {
      if (!live || !rows.clientWidth || !rows.clientHeight) return;
      const cell = rows.querySelector("td") ?? rows;
      const style = win.getComputedStyle(cell);
      canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const widest = runs.reduce(
        (width, run) => Math.max(width, canvas.measureText(run.label).width),
        0,
      );
      const next = suggestionRunLayout(
        rows.clientWidth,
        rows.clientHeight,
        runs.length,
        widest,
        capacity.current,
      );
      capacity.current = next.capacity;
      if (
        next.columns === current.current.columns &&
        next.minWidth === current.current.minWidth
      )
        return;
      const active = doc.activeElement as HTMLElement | null;
      const row = active?.closest<HTMLElement>("[data-run-iri]");
      if (next.columns !== current.current.columns && row && rows.contains(row))
        focus.current = {
          iri: row.dataset.runIri!,
          button: active?.tagName === "BUTTON",
          columns: next.columns,
        };
      current.current = next;
      setLayout(next);
    };
    measure();
    const observer = new win.ResizeObserver(measure);
    observer.observe(rows);
    void doc.fonts.ready.then(measure);
    doc.fonts.addEventListener("loadingdone", measure);
    return () => {
      live = false;
      observer.disconnect();
      doc.fonts.removeEventListener("loadingdone", measure);
    };
  }, [root, runs]);
  useLayoutEffect(() => {
    const pending = focus.current;
    if (!pending || pending.columns !== layout.columns) return;
    const row = [
      ...(root.current?.querySelectorAll<HTMLElement>("[data-run-iri]") ?? []),
    ].find((el) => el.dataset.runIri === pending.iri);
    (pending.button
      ? row?.querySelector<HTMLButtonElement>("button")
      : row
    )?.focus({ preventScroll: true });
    focus.current = null;
  }, [root, layout.columns]);
  return layout;
}
