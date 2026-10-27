import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  command,
  onCommand,
  panel,
  report,
  request,
  savePanel,
  useSnapshot,
} from "./client";
import { clearInstanceReport, useInstanceTarget } from "./instance-report";
import { progressiveSearch } from "./progressive-search";
import { displayName } from "../domain/rdf-model";
// #165: retain the table rename target after the Individuals visual rebuild.
import { EditableEntityName } from "./InlineRename";
import {
  columnReasons,
  columnWidth,
  defaultIndividualColumns,
  restoreIndividualColumns,
  type IndividualColumn,
  type IndividualColumnLayout,
  type IndividualGridPage,
  type IndividualRow,
} from "../shared/individual-columns";
import {
  IndividualPaneHeader,
  IndividualPopover,
  IndividualIcon,
  IdentifierTag,
  ReasonTag,
} from "./IndividualsChrome";

const nf = (n: number) => n.toLocaleString("en-US");
const layoutsKey = "table.individuals.layouts",
  scopeKey = "table.individuals.scope";
export function ColumnChooser({
  columns,
  total,
  layout,
  change,
}: {
  columns: IndividualColumn[];
  total: number;
  layout: IndividualColumnLayout;
  change: (next: IndividualColumnLayout, message: string) => void;
}) {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const movedControl = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    const control = movedControl.current,
      group = control?.parentElement;
    const target = control?.disabled
      ? group?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      : control;
    target?.focus({ preventScroll: true });
    group?.style.removeProperty("display");
    movedControl.current = null;
  }, [layout.order]);
  const move = (key: string, delta: number) => {
    const order = [...layout.order],
      i = order.indexOf(key),
      j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    change(
      { ...layout, order },
      `${byKey.get(key)!.label} moved ${delta < 0 ? "earlier" : "later"}`,
    );
  };
  return (
    <div className="chooser" aria-label="Columns">
      <div className="ph">
        <span className="t">Columns</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {`${layout.visible.length} of ${columns.length} shown`}
        </span>
        <span className="flex" />
        <button
          className="btn tiny"
          onClick={() =>
            change(
              { ...layout, visible: columns.map((c) => c.key) },
              "All columns shown",
            )
          }
        >
          All
        </button>
        <button
          className="btn tiny"
          onClick={() =>
            change({ ...layout, visible: ["subject"] }, "Only Individual shown")
          }
        >
          None
        </button>
        <button
          className="btn tiny"
          onClick={() =>
            change(defaultIndividualColumns(columns, total), "Columns reset")
          }
        >
          Reset
        </button>
      </div>
      <div className="pb">
        {layout.order.map((key, index) => {
          const c = byKey.get(key)!;
          return (
            <div className="crow" key={key}>
              <label>
                <input
                  type="checkbox"
                  aria-label={c.label}
                  checked={layout.visible.includes(key)}
                  disabled={key === "subject"}
                  onChange={(e) =>
                    change(
                      {
                        ...layout,
                        visible: e.target.checked
                          ? [...layout.visible, key]
                          : layout.visible.filter((k) => k !== key),
                      },
                      `${c.label} ${e.target.checked ? "shown" : "hidden"}`,
                    )
                  }
                />
                <span
                  className={
                    "cn" + (["subject", "iri"].includes(key) ? " plain" : "")
                  }
                >
                  {c.label}
                </span>
              </label>
              {columnReasons(c, total).map((r) => (
                <ReasonTag key={r.text} warn={r.warn}>
                  {r.text}
                </ReasonTag>
              ))}
              <span className="fillbar">
                <i
                  style={{
                    width:
                      (total ? Math.round((c.fill / total) * 1000) / 10 : 0) +
                      "%",
                  }}
                />
              </span>
              <span className="nums">
                <span className="f">{nf(c.fill)}</span>
                <span className="d">{nf(c.distinct)}</span>
              </span>
              {
                <span className="moves">
                  <button
                    className="btn tiny"
                    aria-label={`Move ${c.label} earlier`}
                    disabled={index === 0}
                    onClick={(event) => {
                      movedControl.current = event.currentTarget;
                      event.currentTarget.parentElement!.style.display = "flex";
                      move(key, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="btn tiny"
                    aria-label={`Move ${c.label} later`}
                    disabled={index === layout.order.length - 1}
                    onClick={(event) => {
                      movedControl.current = event.currentTarget;
                      event.currentTarget.parentElement!.style.display = "flex";
                      move(key, 1);
                    }}
                  >
                    ↓
                  </button>
                </span>
              }
            </div>
          );
        })}
      </div>
      <div className="pf">
        <span className="flex">
          Fill is how many rows carry a value. Distinct is how many differ.
        </span>
      </div>
    </div>
  );
}
const GridRows = memo(function GridRows({
  rows,
  columns,
  start,
  end,
  select,
}: {
  rows: IndividualRow[];
  columns: IndividualColumn[];
  start: number;
  end: number;
  select: (iri: string) => void;
}) {
  return (
    <tbody>
      {start > 0 && (
        <tr aria-hidden="true">
          <td
            colSpan={columns.length}
            style={{ height: start * 30, padding: 0, border: 0 }}
          />
        </tr>
      )}
      {rows.slice(start, end).map((row) => (
        <tr
          key={row.iri}
          role="row"
          data-iri={row.iri}
          onClick={() => select(row.iri)}
        >
          {columns.map((c, i) => {
            const values = row.values[c.key] ?? [];
            return (
              <td
                role="gridcell"
                key={c.key}
                className={[
                  i === 0 ? "pin" : "",
                  c.kind === "num" ? "num" : "",
                  c.kind === "mono" ? "mono" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {c.key === "subject" ? (
                  <span className="idc">
                    <EditableEntityName
                      iri={row.iri}
                      name={values[0]}
                      className={"nm" + (row.labelled ? "" : " anon")}
                    >
                      {values[0]}
                    </EditableEntityName>
                    {!row.labelled && <IdentifierTag />}
                  </span>
                ) : values.length > 0 ? (
                  <span className="cellwrap">
                    <span className="tx">{values[0]}</span>
                    {values.length > 1 && (
                      <IndividualPopover
                        label={`${values.length - 1} more values of ${c.label}`}
                        buttonClass="plus"
                        button={`+${values.length - 1}`}
                        valueList
                      >
                        <div className="vh2">
                          {c.label} · {values.length} values
                        </div>
                        <ul>
                          {values.map((v, j) => (
                            <li key={j}>{v}</li>
                          ))}
                        </ul>
                      </IndividualPopover>
                    )}
                  </span>
                ) : null}
              </td>
            );
          })}
        </tr>
      ))}
      {end < rows.length && (
        <tr aria-hidden="true">
          <td
            colSpan={columns.length}
            style={{ height: (rows.length - end) * 30, padding: 0, border: 0 }}
          />
        </tr>
      )}
    </tbody>
  );
});
export function OntologyIndividualsPanel() {
  const s = useSnapshot()!,
    target = useInstanceTarget();
  const [scope, setScope] = useState(() => panel(scopeKey, "")),
    [query, setQuery] = useState(() => panel("table.individuals.query", "")),
    [page, setPage] = useState(() => panel("table.individuals.page", 1)),
    [sort, setSort] = useState(() =>
      panel<{ key: string; direction: number; explicit?: boolean }>(
        "table.individuals.sort",
        { key: "subject", direction: 1 },
      ),
    );
  const [data, setData] = useState<IndividualGridPage>(),
    [layout, setLayout] = useState<IndividualColumnLayout>(),
    [announcement, say] = useState(""),
    [reveal, setReveal] = useState<string>();
  const [scroll, setScroll] = useState({ top: 0, height: 660 });
  const table = useRef<HTMLTableElement>(null),
    wrap = useRef<HTMLDivElement>(null),
    liveLayout = useRef(layout),
    filter = useRef<HTMLInputElement>(null),
    pendingFocus = useRef<string | null>(null),
    previousSnapshot = useRef(s),
    pendingSelection = useRef<"first" | "last">(null),
    generation = useRef(0),
    restored = useRef(false);
  const consumer = useRef(crypto.randomUUID()).current;
  const columnSorted =
    !query.trim() ||
    sort.explicit ||
    sort.key !== "subject" ||
    sort.direction !== 1;
  const selected = useRef(s.selected),
    selectionIntent = useRef<string | null>(null);
  // Repeated keys advance locally while earlier selection acknowledgements arrive (#86).
  if (!selectionIntent.current || s.selected === selectionIntent.current) {
    selected.current = s.selected;
    selectionIntent.current = null;
  }
  const select = useCallback((iri: string) => {
    selected.current = iri;
    selectionIntent.current = iri;
    void request("select", { iri }).catch((error: Error) => {
      if (selectionIntent.current === iri) {
        selectionIntent.current = null;
        selected.current = previousSnapshot.current.selected;
      }
      report(error.message, true);
    });
  }, []);
  const chooseScope = useCallback((value: string) => {
    setScope(value);
    savePanel(scopeKey, value);
    setLayout(undefined);
    liveLayout.current = undefined;
    pendingFocus.current = null;
    pendingSelection.current = null;
    setReveal(undefined);
    setPage(1);
    setQuery("");
    savePanel("table.individuals.page", 1);
    savePanel("table.individuals.query", "");
    restored.current = false;
  }, []);
  useEffect(() => {
    if (target?.datasetEpoch === s.datasetEpoch) {
      chooseScope(target.iri);
      clearInstanceReport();
    }
  }, [target, s.datasetEpoch, chooseScope]);
  useEffect(
    () =>
      onCommand((id) => {
        if (id === `ui.restore:${layoutsKey}`) {
          setLayout(undefined);
          liveLayout.current = undefined;
        }
        if (id === `ui.restore:${scopeKey}`) chooseScope(panel(scopeKey, ""));
      }),
    [chooseScope],
  );
  useEffect(() => {
    setLayout(undefined);
    liveLayout.current = undefined;
    restored.current = false;
    selectionIntent.current = null;
    selected.current = s.selected;
    pendingFocus.current = null;
    pendingSelection.current = null;
    setReveal(undefined);
  }, [s.datasetEpoch]);
  // Reveal creations in the active scope without disturbing ordinary selection (#86).
  useEffect(() => {
    const previous = previousSnapshot.current;
    previousSnapshot.current = s;
    if (
      previous.datasetEpoch !== s.datasetEpoch ||
      !s.selected ||
      previous.entities.some((e) => e.iri === s.selected)
    )
      return;
    const created = s.entities.find((e) => e.iri === s.selected);
    if (
      created?.kind !== "Individual" ||
      (scope && !created.types.includes(scope))
    )
      return;
    setQuery("");
    savePanel("table.individuals.query", "");
    setReveal(created.iri);
  }, [s, scope]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    const ticket = ++generation.current;
    const saved = panel<Record<string, IndividualColumnLayout>>(layoutsKey, {})[
      scope
    ];
    const current = liveLayout.current ?? saved;
    return progressiveSearch<IndividualGridPage>(
      request,
      "individualGrid",
      {
        scope,
        query,
        shown: current?.visible,
        sort: columnSorted ? sort.key : undefined,
        direction: sort.direction,
        page,
        reveal,
        consumer,
        searchId: crypto.randomUUID(),
        datasetEpoch: s.datasetEpoch,
        version: s.version,
      },
      (value) => {
        if (ticket !== generation.current) return;
        const next = restoreIndividualColumns(
          value.columns,
          value.scopeTotal,
          current,
        );
        liveLayout.current = next;
        setLayout(next);
        setData(value);
        if (value.page !== page) {
          setPage(value.page);
          savePanel("table.individuals.page", value.page);
        }
        if (reveal && value.rows.some((r) => r.iri === reveal)) {
          pendingFocus.current = reveal;
          setReveal(undefined);
        }
        if (pendingSelection.current) {
          const row =
            pendingSelection.current === "first"
              ? value.rows[0]
              : value.rows.at(-1);
          pendingSelection.current = null;
          if (row) {
            pendingFocus.current = row.iri;
            select(row.iri);
          }
        }
      },
      (e) => report(e.message, true),
    );
  }, [
    scope,
    query,
    page,
    reveal,
    sort,
    s.version,
    s.datasetEpoch,
    layout?.visible.join("\0"),
  ]);
  useLayoutEffect(() => {
    for (const row of table.current?.querySelectorAll<HTMLTableRowElement>(
      "tbody tr[data-iri]",
    ) ?? []) {
      const active = row.dataset.iri === s.selected;
      row.setAttribute("aria-selected", String(active));
      row.tabIndex = active ? 0 : -1;
    }
    const iri = pendingFocus.current,
      el = wrap.current;
    if (!iri || !el || iri !== s.selected) return;
    const index = data?.rows.findIndex((r) => r.iri === iri) ?? -1;
    if (index < 0) return;
    const top = 29 + index * 30;
    if (top < el.scrollTop + 29) el.scrollTop = top - 29;
    else if (top + 30 > el.scrollTop + el.clientHeight)
      el.scrollTop = top + 30 - el.clientHeight;
    const row = table.current?.querySelector<HTMLTableRowElement>(
      `tbody tr[data-iri="${CSS.escape(iri)}"]`,
    );
    if (row) {
      row.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [s.selected, data, scroll.top, scroll.height, layout]);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setScroll((old) => ({ ...old, height: el.clientHeight })),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!data || !wrap.current || restored.current) return;
    const pos = panel<{ top: number; left: number }>(
      `table.individuals.scroll.${scope}`,
      { top: 0, left: 0 },
    );
    wrap.current.scrollTop = pos.top;
    wrap.current.scrollLeft = pos.left;
    restored.current = true;
  }, [data, scope]);
  const change = useCallback(
    (next: IndividualColumnLayout, message: string) => {
      liveLayout.current = next;
      setLayout(next);
      savePanel(layoutsKey, {
        ...panel(layoutsKey, {}),
        [scopeRef.current]: next,
      });
      say(message);
    },
    [],
  );
  const visibleKey = layout?.order
    .filter((k) => layout.visible.includes(k))
    .join("\0");
  const columns = useMemo(() => {
    const byKey = new Map(data?.columns.map((c) => [c.key, c]));
    return (
      visibleKey
        ?.split("\0")
        .map((k) => byKey.get(k)!)
        .filter(Boolean) ?? []
    );
  }, [visibleKey, data?.columns]);
  const setWidth = (c: IndividualColumn, width: number, announce = true) => {
    const next = liveLayout.current;
    if (!next || !table.current) return;
    const value = columnWidth(width);
    next.widths = { ...next.widths, [c.key]: value };
    const col = table.current.querySelector<HTMLTableColElement>(
      `col[data-key="${CSS.escape(c.key)}"]`,
    );
    if (col) col.style.width = value + "px";
    table.current.style.width =
      columns.reduce((n, c) => n + next.widths[c.key], 0) + "px";
    table.current
      .querySelector(`[data-resize="${CSS.escape(c.key)}"]`)
      ?.setAttribute("aria-valuenow", String(value));
    if (announce) {
      savePanel(layoutsKey, { ...panel(layoutsKey, {}), [scope]: next });
      say(`${c.label} is ${value} pixels wide`);
    }
  };
  const autofit = (c: IndividualColumn) => {
    const canvas = document.createElement("canvas").getContext("2d")!,
      styles = getComputedStyle(table.current!);
    const measure = (text: string, mono = false) => {
      canvas.font = mono
        ? "12px " + styles.getPropertyValue("--mono")
        : "13px " + styles.getPropertyValue("--font");
      return canvas.measureText(text).width;
    };
    let width = measure(c.label.toUpperCase()) + 46;
    for (const r of data?.rows ?? []) {
      const vs = r.values[c.key];
      if (vs?.length)
        width = Math.max(
          width,
          measure(vs[0], c.kind === "mono") +
            22 +
            (vs.length > 1 ? 36 : 0) +
            (c.key === "subject" && !r.labelled ? 28 : 0),
        );
    }
    setWidth(c, Math.ceil(width));
  };
  const drag = useRef<
      { c: IndividualColumn; start: number; width: number } | undefined
    >(undefined),
    reorder = useRef<
      | {
          key: string;
          x: number;
          y: number;
          active: boolean;
          target?: string;
          after?: boolean;
        }
      | undefined
    >(undefined),
    suppressSort = useRef(false);
  const clearReorder = () => {
    table.current
      ?.querySelectorAll(".dragsrc,.dropL,.dropR")
      .forEach((el) => el.classList.remove("dragsrc", "dropL", "dropR"));
    table.current?.ownerDocument.body.classList.remove("individuals-dragging");
    reorder.current = undefined;
  };
  useEffect(() => {
    const doc = table.current?.ownerDocument;
    return () => doc?.body.classList.remove("individuals-dragging");
  }, []);
  const go = (n: number) => {
    setPage(n);
    savePanel("table.individuals.page", n);
    if (wrap.current) wrap.current.scrollTop = 0;
  };
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 100));
  const start = Math.max(0, Math.floor((scroll.top - 29) / 30) - 4),
    end = Math.min(
      data?.rows.length ?? 0,
      Math.ceil((scroll.top + scroll.height) / 30) + 4,
    );
  return (
    <section
      className="individuals-surface pane"
      data-panel="individuals"
      aria-label="Individuals"
    >
      <IndividualPaneHeader recoveryOnly>
        <span className="name">Individuals</span>
      </IndividualPaneHeader>
      <div className="tbar">
        <span className="ttl">Individuals</span>
        <span className="fwrap">
          <input
            ref={filter}
            className="fld"
            placeholder="Filter individuals"
            aria-label="Filter individuals"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
              savePanel("table.individuals.page", 1);
              savePanel("table.individuals.query", e.target.value);
            }}
          />
          {query && (
            <button
              className="ib grid-clear"
              aria-label="Clear the filter"
              onClick={() => {
                setQuery("");
                go(1);
                savePanel("table.individuals.query", "");
                filter.current?.focus();
              }}
            >
              <IndividualIcon name="x" />
            </button>
          )}
        </span>
        {layout && data && (
          <IndividualPopover
            label={`Columns ${layout.visible.length} of ${data.columns.length}`}
            button={`Columns ${layout.visible.length} of ${data.columns.length}`}
            width={408}
            align="end"
          >
            <ColumnChooser
              columns={data.columns}
              total={data.scopeTotal}
              layout={layout}
              change={change}
            />
          </IndividualPopover>
        )}
        <label
          className="wide"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          Class
          <select
            className="sel"
            aria-label="Filter by class"
            value={scope}
            onChange={(e) => chooseScope(e.target.value)}
          >
            {s.entities
              .filter((e) => ["Class", "Defined"].includes(e.kind))
              .map((e) => (
                <option key={e.iri} value={e.iri} disabled={!e.instances}>
                  {displayName(e)} ({nf(e.instances)})
                </option>
              ))}
            <option value="">All classes</option>
          </select>
        </label>
        <button
          className="btn wide"
          onClick={() => command("entity.createIndividual")}
        >
          New individual
        </button>
      </div>
      <div className="gstat" aria-live="polite">
        {query ? (
          <>
            <b>{nf(data?.total ?? 0)}</b>
            {` of ${nf(data?.scopeTotal ?? 0)} individuals match across ${columns.length} shown ${columns.length === 1 ? "column" : "columns"}`}
          </>
        ) : (
          <>
            <b>{nf(data?.scopeTotal ?? 0)}</b> individuals
            <span className="dot">·</span>
            {`${columns.length} of ${data?.columns.length ?? 0} columns shown`}
          </>
        )}
      </div>
      <div
        className="gwrap"
        ref={wrap}
        tabIndex={0}
        role="region"
        aria-label="Individuals table, scrollable"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScroll({ top: el.scrollTop, height: el.clientHeight });
          savePanel(`table.individuals.scroll.${scope}`, {
            top: el.scrollTop,
            left: el.scrollLeft,
          });
        }}
        onKeyDown={(e) => {
          if (
            (e.target as HTMLElement).closest("button,input,select") ||
            !data?.rows.length
          )
            return;
          let i = data.rows.findIndex((r) => r.iri === selected.current);
          const turn = (n: number, edge: "first" | "last") => {
            pendingSelection.current = edge;
            go(n);
            e.preventDefault();
          };
          if (e.key === "ArrowDown") {
            if (i === data.rows.length - 1 && page < pages) {
              turn(page + 1, "first");
              return;
            }
            i = Math.min(data.rows.length - 1, i + 1);
          } else if (e.key === "ArrowUp") {
            if (i === 0 && page > 1) {
              turn(page - 1, "last");
              return;
            }
            i = Math.max(0, i - 1);
          } else if (e.key === "Home") i = 0;
          else if (e.key === "End") i = data.rows.length - 1;
          else if (e.key === "PageDown" && page < pages) {
            turn(page + 1, "first");
            return;
          } else if (e.key === "PageUp" && page > 1) {
            turn(page - 1, "first");
            return;
          } else return;
          e.preventDefault();
          pendingFocus.current = data.rows[i].iri;
          select(data.rows[i].iri);
        }}
      >
        <table
          className="g"
          hidden={!!data && !data.total}
          role="grid"
          aria-label="Individuals"
          aria-rowcount={data?.total}
          ref={table}
          style={{
            width: columns.reduce(
              (n, c) => n + (layout?.widths[c.key] ?? c.width),
              0,
            ),
          }}
        >
          <colgroup>
            {columns.map((c) => (
              <col
                key={c.key}
                data-key={c.key}
                style={{ width: layout?.widths[c.key] ?? c.width }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={i === 0 ? "pin" : ""}
                  aria-sort={
                    columnSorted && sort.key === c.key
                      ? sort.direction === 1
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  data-column={c.key}
                >
                  <div className="hcell">
                    <button
                      className="hlab"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        suppressSort.current = false;
                        reorder.current = {
                          key: c.key,
                          x: e.clientX,
                          y: e.clientY,
                          active: false,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const move = reorder.current;
                        if (!move || move.key !== c.key) return;
                        if (
                          !move.active &&
                          Math.hypot(e.clientX - move.x, e.clientY - move.y) <=
                            5
                        )
                          return;
                        move.active = true;
                        e.currentTarget.classList.add("dragsrc");
                        const doc = e.currentTarget.ownerDocument;
                        doc.body.classList.add("individuals-dragging");
                        table.current
                          ?.querySelectorAll(".dropL,.dropR")
                          .forEach((el) =>
                            el.classList.remove("dropL", "dropR"),
                          );
                        const target = doc
                          .elementFromPoint(e.clientX, e.clientY)
                          ?.closest<HTMLTableCellElement>("th[data-column]");
                        move.target =
                          target && table.current?.contains(target)
                            ? target.dataset.column
                            : undefined;
                        if (move.target) {
                          const box = target!.getBoundingClientRect();
                          move.after = e.clientX > box.x + box.width / 2;
                          target!
                            .querySelector(".hcell")
                            ?.classList.add(move.after ? "dropR" : "dropL");
                        }
                      }}
                      onPointerUp={() => {
                        const move = reorder.current,
                          current = liveLayout.current;
                        suppressSort.current = !!move?.active;
                        if (
                          current &&
                          move?.active &&
                          move.target &&
                          move.target !== move.key
                        ) {
                          const order = current.order.filter(
                            (key) => key !== move.key,
                          );
                          order.splice(
                            order.indexOf(move.target) + (move.after ? 1 : 0),
                            0,
                            move.key,
                          );
                          change({ ...current, order }, `${c.label} moved`);
                        }
                        clearReorder();
                      }}
                      onPointerCancel={clearReorder}
                      onLostPointerCapture={clearReorder}
                      data-dir={
                        columnSorted && sort.key === c.key
                          ? sort.direction === 1
                            ? "asc"
                            : "desc"
                          : undefined
                      }
                      onClick={() => {
                        if (suppressSort.current) {
                          suppressSort.current = false;
                          return;
                        }
                        const direction =
                          columnSorted && sort.key === c.key
                            ? -sort.direction
                            : 1;
                        setSort({ key: c.key, direction, explicit: true });
                        go(1);
                        savePanel("table.individuals.sort", {
                          key: c.key,
                          direction,
                          explicit: true,
                        });
                        say(
                          `Sorted by ${c.label}, ${direction === 1 ? "ascending" : "descending"}`,
                        );
                      }}
                    >
                      <span className="t">{c.label}</span>
                      <span className="sg">
                        {sort.key === c.key && sort.direction === -1
                          ? "↓"
                          : "↑"}
                      </span>
                    </button>
                    <button
                      className="rz"
                      data-resize={c.key}
                      role="separator"
                      aria-orientation="vertical"
                      aria-valuemin={56}
                      aria-valuemax={720}
                      aria-valuenow={layout?.widths[c.key] ?? c.width}
                      aria-label={`Width of ${c.label}`}
                      onDoubleClick={() => autofit(c)}
                      onPointerDown={(e) => {
                        drag.current = {
                          c,
                          start: e.clientX,
                          width: liveLayout.current!.widths[c.key],
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                        e.currentTarget.classList.add("live");
                        e.preventDefault();
                      }}
                      onPointerMove={(e) => {
                        if (drag.current?.c.key === c.key)
                          setWidth(
                            c,
                            drag.current.width + e.clientX - drag.current.start,
                            false,
                          );
                      }}
                      onPointerUp={(e) => {
                        if (!drag.current) return;
                        drag.current = undefined;
                        e.currentTarget.classList.remove("live");
                        setWidth(c, liveLayout.current!.widths[c.key]);
                      }}
                      onKeyDown={(e) => {
                        let w = liveLayout.current!.widths[c.key];
                        if (e.key === "ArrowLeft") w -= e.shiftKey ? 32 : 8;
                        else if (e.key === "ArrowRight")
                          w += e.shiftKey ? 32 : 8;
                        else if (e.key === "Home") w = c.width;
                        else if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          autofit(c);
                          return;
                        } else return;
                        e.preventDefault();
                        setWidth(c, w);
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {data && (
            <GridRows
              rows={data.rows}
              columns={columns}
              start={start}
              end={end}
              select={select}
            />
          )}
        </table>
        {data && !data.total && (
          <div className="empty">
            {query
              ? `No individual matches "${query}" in the ${columns.length} shown ${columns.length === 1 ? "column" : "columns"}. Show more columns to widen the search.`
              : "This class holds no individuals."}
          </div>
        )}
      </div>
      {pages > 1 && (
        <div className="gfoot">
          <span>
            Rows {nf((page - 1) * 100 + 1)} to{" "}
            {nf(Math.min(page * 100, data!.total))}
          </span>
          <span className="pg">
            <button
              className="ib"
              aria-label="First page"
              disabled={page === 1}
              onClick={() => go(1)}
            >
              <IndividualIcon name="first" />
            </button>
            <button
              className="ib"
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => go(page - 1)}
            >
              <IndividualIcon name="prev" />
            </button>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label htmlFor="individual-page">Page</label>
              <input
                id="individual-page"
                className="pgn"
                inputMode="numeric"
                aria-label="Page number"
                key={page}
                defaultValue={page}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  const next = Math.max(
                    1,
                    Math.min(
                      pages,
                      Number.isFinite(value) ? Math.floor(value) || 1 : 1,
                    ),
                  );
                  e.target.value = String(next);
                  go(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              <span>of {nf(pages)}</span>
            </span>
            <button
              className="ib"
              aria-label="Next page"
              disabled={page === pages}
              onClick={() => go(page + 1)}
            >
              <IndividualIcon name="next" />
            </button>
            <button
              className="ib"
              aria-label="Last page"
              disabled={page === pages}
              onClick={() => go(pages)}
            >
              <IndividualIcon name="last" />
            </button>
          </span>
        </div>
      )}
      <span className="vh" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
