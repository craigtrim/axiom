import { useEffect, useMemo, useRef, useState } from "react";
import {
  namedClass,
  taxonomyChildren,
  taxonomyParents,
} from "../domain/class-expressions";
import { taxonomyRows } from "../domain/taxonomy-rows";
import { displayName } from "../domain/rdf-model";
import { THING } from "../domain/model";
import { panel, useSnapshot } from "./client";

export function StyleClassTree({
  filter,
  selected,
  select,
}: {
  filter: string;
  selected?: string;
  select(iri: string): void;
}) {
  const s = useSnapshot()!;
  const entities = useMemo(() => s.entities.filter(namedClass), [s.entities]);
  const map = useMemo(
    () => new Map(entities.map((e) => [e.iri, e])),
    [entities],
  );
  const [open, setOpen] = useState(
    () => new Set(panel("hierarchy.open", [THING])),
  );
  const reveal = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selected || !map.has(selected)) return;
    reveal.current = selected;
    setOpen((previous) => {
      const next = new Set(previous),
        seen = new Set<string>(),
        pending = [...taxonomyParents(map.get(selected)!)];
      while (pending.length) {
        const id = pending.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        next.add(id);
        const parent = map.get(id);
        if (parent) pending.push(...taxonomyParents(parent));
      }
      return next;
    });
  }, [selected, map]);
  const [top, setTop] = useState(0),
    [height, setHeight] = useState(340);
  const host = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () => taxonomyRows(entities, open, filter),
    [entities, open, filter],
  );
  const rowHeight = 30,
    start = Math.max(0, Math.floor(top / rowHeight) - 8);
  const visible = rows.slice(start, start + Math.ceil(height / rowHeight) + 16);
  useEffect(() => {
    const el = host.current!;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    host.current!.scrollTop = 0;
    setTop(0);
  }, [filter]);
  useEffect(() => {
    if (!reveal.current) return;
    const index = rows.findIndex((row) => row.iri === reveal.current);
    if (index < 0) return;
    const el = host.current!,
      y = index * rowHeight;
    if (y < el.scrollTop || y + rowHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = y;
    setTop(el.scrollTop);
    reveal.current = undefined;
  }, [rows]);
  const toggle = (iri: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(iri)) next.delete(iri);
      else next.add(iri);
      return next;
    });
  const focus = (index: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    select(row.iri);
    const el = host.current!,
      y = rows.indexOf(row) * rowHeight;
    if (y < el.scrollTop) el.scrollTop = y;
    if (y + rowHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = y + rowHeight - el.clientHeight;
    setTop(el.scrollTop);
    el.ownerDocument.defaultView!.requestAnimationFrame(() => {
      [...el.querySelectorAll<HTMLElement>("[data-entity-iri]")]
        .find((e) => e.dataset.entityIri === row.iri)
        ?.focus();
    });
  };
  return (
    <div
      ref={host}
      role="tree"
      aria-label="Style class hierarchy"
      className="tree style-class-tree"
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * rowHeight, position: "relative" }}>
        {visible.map(({ iri, depth }, offset) => {
          const e = map.get(iri)!,
            index = start + offset,
            children = taxonomyChildren(e).length,
            expanded = !!filter.trim() || open.has(iri);
          return (
            <div
              key={iri}
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={children ? expanded : undefined}
              aria-selected={iri === selected}
              data-entity-iri={iri}
              className={"tree-row " + (iri === selected ? "selected" : "")}
              tabIndex={
                iri === selected ||
                (!rows.some((r) => r.iri === selected) && index === 0)
                  ? 0
                  : -1
              }
              style={{
                position: "absolute",
                top: index * rowHeight,
                height: rowHeight,
                left: 0,
                right: 0,
                paddingLeft: 8 + depth * 16,
              }}
              onClick={() => select(iri)}
              onDoubleClick={() => children && toggle(iri)}
              onKeyDown={(event) => {
                if (
                  ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  focus(
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? rows.length - 1
                        : index + (event.key === "ArrowDown" ? 1 : -1),
                  );
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  if (children && !expanded) toggle(iri);
                  else if (children) focus(index + 1);
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  if (children && expanded && !filter) toggle(iri);
                  else {
                    const parent = taxonomyParents(e).find((id) =>
                      rows.some((r) => r.iri === id),
                    );
                    if (parent) focus(rows.findIndex((r) => r.iri === parent));
                  }
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(iri);
                }
              }}
            >
              <button
                type="button"
                className="tree-expander"
                tabIndex={-1}
                disabled={!children}
                aria-hidden={!children || undefined}
                aria-label={
                  (expanded ? "Collapse " : "Expand ") + displayName(e)
                }
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(iri);
                }}
              >
                {children ? (expanded ? "⌄" : "›") : ""}
              </button>
              <span className={"entity-marker " + e.kind}>
                {e.kind === "Defined" ? "⊞" : "□"}
              </span>
              <span className="tree-name" title={e.iri}>
                {displayName(e)}
              </span>
              <span className="muted count">
                {e.instances.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
      {!rows.length && <p className="empty">No matching classes.</p>}
    </div>
  );
}
