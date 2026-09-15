import { InlineCreate } from "./InlineCreate";
import { takeCreation, entityDragType, type Creation } from "./authoring";
import { displayName } from "../domain/rdf-model";
import { Fragment } from "react";
import { EditableEntityName } from "./InlineRename";
import { EntityMenu } from "./EntityMenu";
import { TaxonomyAssistant } from "./TaxonomyAssistant";
import type { TaxonomyMode } from "../shared/taxonomy-assistant";
import { useEffect, useMemo, useState } from "react";
import {
  useSnapshot,
  act,
  command,
  onCommand,
  panel,
  savePanel,
} from "./client";
import { THING, NS, kindLabel } from "../domain/model";
export function HierarchyPanel() {
  const s = useSnapshot()!,
    [tab, setTab] = useState(panel("hierarchy.tab", "classes")),
    [filter, setFilter] = useState(""),
    [draft, setDraft] = useState<Creation | null>(null),
    [discovery, setDiscovery] = useState<{
      iri: string;
      mode: TaxonomyMode;
      doc: Document;
    } | null>(null),
    [context, setContext] = useState<{
      iri: string;
      x: number;
      y: number;
      doc: Document;
    } | null>(null),
    [open, setOpen] = useState<Set<string>>(
      () =>
        new Set(
          panel("hierarchy.open", [
            THING,
            NS.pizza + "DomainConcept",
            NS.pizza + "Food",
            NS.pizza + "Pizza",
            NS.pizza + "PizzaTopping",
          ]),
        ),
    );
  const map = useMemo(
    () => new Map(s.entities.map((e) => [e.iri, e])),
    [s.entities],
  );
  const properties = tab === "properties",
    entities = s.entities.filter((e) =>
      properties
        ? e.kind.endsWith("Property")
        : e.kind === "Class" || e.kind === "Defined",
    );
  const visible = new Set<string>();
  if (filter.trim()) {
    const q = filter.toLowerCase();
    const add = (iri: string) => {
      if (visible.has(iri)) return;
      visible.add(iri);
      for (const p of map.get(iri)?.parents ?? []) add(p);
    };
    for (const e of entities)
      if ((e.name + " " + e.iri).toLowerCase().includes(q)) add(e.iri);
  }
  const rows: { iri: string; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (iri: string, depth: number) => {
    if (visited.has(iri) || (filter.trim() && !visible.has(iri))) return;
    const e = map.get(iri);
    if (!e) return;
    visited.add(iri);
    rows.push({ iri, depth });
    if (open.has(iri) || filter) for (const c of e.children) walk(c, depth + 1);
  };
  const ids = new Set(entities.map((e) => e.iri));
  for (const e of entities
    .filter((e) => !e.parents.some((p) => ids.has(p)))
    .sort((a, b) => a.name.localeCompare(b.name)))
    walk(e.iri, 0);
  const toggle = (iri: string) => {
    setOpen((previous) => {
      savePanel("hierarchy.open", [...previous], false);
      const next = new Set(previous);
      if (next.has(iri)) next.delete(iri);
      else next.add(iri);
      savePanel("hierarchy.open", [...next]);
      return next;
    });
  };
  useEffect(
    () =>
      onCommand((id) => {
        if (id === "authoring.create") {
          const next = takeCreation();
          if (next) {
            setDraft(next);
            setFilter("");
            setTab(next.kind.endsWith("Property") ? "properties" : "classes");
            setOpen((p) => new Set([...p, next.parent]));
          }
        }

        if (id === "ui.restore:hierarchy.open")
          setOpen(new Set(panel("hierarchy.open", [] as string[])));
        if (id === "ui.restore:hierarchy.tab")
          setTab(panel("hierarchy.tab", "classes"));
        if (id === "hierarchy.reset") {
          setTab("classes");
          setFilter("");
          setOpen(new Set([THING]));
        }
        if (id === "hierarchy.search") {
          command("view.hierarchy");
          setTimeout(
            () =>
              document
                .querySelector<HTMLInputElement>(
                  '[aria-label="Filter hierarchy"]',
                )
                ?.focus(),
            30,
          );
        }
      }),
    [],
  );
  useEffect(() => {
    const next = takeCreation();
    if (next) {
      setDraft(next);
      setTab(next.kind.endsWith("Property") ? "properties" : "classes");
      setOpen((p) => new Set([...p, next.parent]));
    }
  }, []);
  useEffect(() => {
    const iri = s.selected;
    if (!iri || !map.has(iri)) return;
    const next = new Set(open),
      seen = new Set<string>();
    const parents = (i: string) => {
      if (seen.has(i)) return;
      seen.add(i);
      for (const p of map.get(i)?.parents ?? []) {
        next.add(p);
        parents(p);
      }
    };
    parents(iri);
    if (next.size !== open.size) setOpen(next);
  }, [s.selected, s.entities]);
  return (
    <section
      className="panel hierarchy-panel"
      data-panel="hierarchy"
      aria-label="Hierarchy panel"
    >
      <div className="panel-toolbar">
        <button
          aria-pressed={!properties}
          onClick={() => {
            savePanel("hierarchy.tab", tab, false);
            setTab("classes");
            savePanel("hierarchy.tab", "classes");
          }}
        >
          Classes · {s.classCount}
        </button>
        <button
          aria-pressed={properties}
          onClick={() => {
            savePanel("hierarchy.tab", tab, false);
            setTab("properties");
            savePanel("hierarchy.tab", "properties");
          }}
        >
          Properties · {s.propertyCount}
        </button>
      </div>
      <div className="panel-toolbar">
        <input
          aria-label="Filter hierarchy"
          placeholder="Filter hierarchy"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          title="New class"
          aria-label="New class"
          onClick={() =>
            command(properties ? "entity.createProperty" : "entity.createClass")
          }
        >
          +
        </button>
      </div>
      <div
        role="tree"
        aria-label={properties ? "Property hierarchy" : "Class hierarchy"}
        className="tree"
      >
        {draft && properties && (
          <InlineCreate draft={draft} close={() => setDraft(null)} />
        )}
        {rows.map(({ iri, depth }, index) => {
          const e = map.get(iri)!,
            expanded = open.has(iri) || !!filter;
          return (
            <Fragment key={iri}>
              <div
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={e.children.length ? expanded : undefined}
                aria-selected={s.selected === iri}
                tabIndex={
                  s.selected === iri ||
                  (!rows.some((r) => r.iri === s.selected) && index === 0)
                    ? 0
                    : -1
                }
                key={iri}
                className={"tree-row " + (s.selected === iri ? "selected" : "")}
                style={{ paddingLeft: 8 + depth * 16 }}
                draggable={!draft}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(entityDragType, iri);
                  ev.dataTransfer.setData("text/plain", iri);
                  ev.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => void act("select", { iri })}
                onDoubleClick={() => {
                  if (e.children.length) toggle(iri);
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  void act("select", { iri });
                  setContext({
                    iri,
                    x: ev.clientX,
                    y: ev.clientY,
                    doc: ev.currentTarget.ownerDocument,
                  });
                }}
                onKeyDown={(ev) => {
                  if (
                    ev.key === "ContextMenu" ||
                    (ev.shiftKey && ev.key === "F10")
                  ) {
                    ev.preventDefault();
                    const r = ev.currentTarget.getBoundingClientRect();
                    setContext({
                      iri,
                      x: r.x + 40,
                      y: r.y + 20,
                      doc: ev.currentTarget.ownerDocument,
                    });
                  }
                  if (ev.key === "ArrowRight") {
                    ev.preventDefault();
                    if (e.children.length && !open.has(iri)) toggle(iri);
                    else
                      (
                        ev.currentTarget.nextElementSibling as HTMLElement
                      )?.focus();
                  }
                  if (ev.key === "ArrowLeft") {
                    ev.preventDefault();
                    if (open.has(iri)) toggle(iri);
                    else {
                      const parent = rows.findIndex(
                        (r) => r.iri === e.parents[0],
                      );
                      if (parent >= 0)
                        (
                          ev.currentTarget.parentElement?.children[
                            parent
                          ] as HTMLElement
                        )?.focus();
                    }
                  }
                  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                    ev.preventDefault();
                    const row =
                      rows[
                        Math.min(
                          rows.length - 1,
                          Math.max(
                            0,
                            index + (ev.key === "ArrowDown" ? 1 : -1),
                          ),
                        )
                      ];
                    void act("select", { iri: row.iri });
                    (
                      ev.currentTarget.parentElement?.children[
                        rows.indexOf(row)
                      ] as HTMLElement
                    )?.focus();
                  }
                  if (ev.key === "Home" || ev.key === "End") {
                    ev.preventDefault();
                    (
                      ev.currentTarget.parentElement?.children[
                        ev.key === "Home" ? 0 : rows.length - 1
                      ] as HTMLElement
                    )?.focus();
                  }
                }}
              >
                <button
                  onDoubleClick={(ev) => ev.stopPropagation()}
                  className="tree-expander"
                  tabIndex={-1}
                  aria-label={(expanded ? "Collapse " : "Expand ") + e.name}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggle(iri);
                  }}
                >
                  {e.children.length ? (expanded ? "⌄" : "›") : ""}
                </button>
                <span
                  className={"entity-marker " + e.kind}
                  title={kindLabel(e.kind)}
                >
                  {e.kind === "Defined"
                    ? "⊞"
                    : e.kind.endsWith("Property")
                      ? "◇"
                      : "□"}
                </span>
                <EditableEntityName
                  iri={iri}
                  name={e.name}
                  className="tree-name"
                >
                  {displayName(e)}
                </EditableEntityName>
                {e.instances > 0 && (
                  <span className="muted count">
                    {e.instances.toLocaleString("en-GB")}
                  </span>
                )}
              </div>
              {draft && !properties && draft.parent === iri && (
                <div style={{ paddingLeft: 16 + depth * 16 }}>
                  <InlineCreate draft={draft} close={() => setDraft(null)} />
                </div>
              )}
            </Fragment>
          );
        })}
        {!rows.length && <p className="empty">No matching entities.</p>}
      </div>
      <div className="panel-toolbar bottom">
        <button
          disabled={!s.selected}
          onClick={() => {
            void act("seed", { iris: [s.selected] }).then(() =>
              command("graph.fit"),
            );
            command("view.graph");
          }}
        >
          Show in graph
        </button>
      </div>
      {discovery && (
        <TaxonomyAssistant
          {...discovery}
          close={() => setDiscovery(null)}
          added={() => {
            setFilter("");
            setOpen((previous) => {
              const next = new Set([...previous, discovery.iri]);
              savePanel("hierarchy.open", [...next], false);
              return next;
            });
          }}
        />
      )}
      {context && (
        <EntityMenu
          {...context}
          document={context.doc}
          close={() => setContext(null)}
          taxonomy={(mode) =>
            setDiscovery({ iri: context.iri, mode, doc: context.doc })
          }
          branch={
            map.get(context.iri)?.children.length
              ? {
                  open: open.has(context.iri),
                  toggle: () => toggle(context.iri),
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
