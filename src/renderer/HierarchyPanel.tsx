import { classMoveIssue } from "../domain/taxonomy-move";
import { taxonomyRows } from "../domain/taxonomy-rows";
import {
  alignTaxonomyRow,
  takeTaxonomyReveal,
  revealInTaxonomy,
} from "./taxonomy-navigation";
import {
  namedClass,
  taxonomyParents,
  taxonomyChildren,
} from "../domain/class-expressions";
import { instanceAction } from "../shared/action-state";
import { showInstances } from "./instance-report";
import { PaneToolbar } from "./AdaptivePane";
import { InlineCreate } from "./InlineCreate";
import {
  takeCreation,
  entityDragType,
  taxonomyDragType,
  type TaxonomyDrag,
  type Creation,
} from "./authoring";
import { displayName } from "../domain/rdf-model";
import { Fragment } from "react";
import { EditableEntityName } from "./InlineRename";
import { EntityMenu } from "./EntityMenu";
import { openTaxonomy } from "./taxonomy-view";
import { useEffect, useMemo, useState, useRef } from "react";
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
  const rootRef = useRef<HTMLElement>(null);
  const revealRef = useRef<ReturnType<typeof takeTaxonomyReveal>>(null);
  const [revealTick, setRevealTick] = useState(0);
  useEffect(() => {
    const reveal = () => {
      const request = takeTaxonomyReveal();
      if (!request) return;
      const { iri } = request;
      revealRef.current = request;
      setFilter("");
      const entity = s.entities.find((e) => e.iri === iri);
      setTab(entity?.kind.endsWith("Property") ? "properties" : "classes");
      setRevealTick((x) => x + 1);
    };
    reveal();
    return onCommand((id) => {
      if (id === "taxonomy.reveal") reveal();
    });
  }, [s.entities]);
  useEffect(() => {
    const request = revealRef.current;
    const tree = rootRef.current?.querySelector<HTMLElement>('[role="tree"]');
    if (!request || !tree) return;
    if (request.epoch !== s.datasetEpoch || request.iri !== s.selected) {
      revealRef.current = null;
      return;
    }
    const win = tree.ownerDocument.defaultView!;
    let frame = 0;
    const align = () => {
      if (revealRef.current !== request) return;
      const row = [
        ...tree.querySelectorAll<HTMLElement>("[data-entity-iri]"),
      ].find((r) => r.dataset.entityIri === request.iri);
      if (row && alignTaxonomyRow(tree, row, request.anchor)) {
        revealRef.current = null;
        observer.disconnect();
      }
    };
    const schedule = () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => {
        frame = win.requestAnimationFrame(align);
      });
    };
    // A reveal can arrive while its pane is hidden. Finish when it is visible.
    const observer = new win.ResizeObserver(schedule);
    observer.observe(tree);
    schedule();
    return () => {
      observer.disconnect();
      win.cancelAnimationFrame(frame);
    };
  }, [revealTick, open, filter, tab, s.selected, s.datasetEpoch]);
  const map = useMemo(
    () => new Map(s.entities.map((e) => [e.iri, e])),
    [s.entities],
  );
  const properties = tab === "properties";
  const entities = useMemo(
    () =>
      s.entities.filter((e) =>
        properties ? e.kind.endsWith("Property") : namedClass(e),
      ),
    [s.entities, properties],
  );
  const rows = useMemo(
    () => taxonomyRows(entities, open, filter),
    [entities, open, filter],
  );
  const rowParents = useMemo(() => {
    const parents = new Map<string, string | null>(),
      path: string[] = [];
    for (const row of rows) {
      parents.set(row.iri, row.depth ? path[row.depth - 1] : null);
      path[row.depth] = row.iri;
      path.length = row.depth + 1;
    }
    return parents;
  }, [rows]);
  const selectedVisible = rows.some((r) => r.iri === s.selected);
  const dragging = useRef<TaxonomyDrag | null>(null),
    hover = useRef<{
      iri: string;
      timer: ReturnType<typeof setTimeout>;
    } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null),
    [dropMessage, setDropMessage] = useState("");
  const allowed = useRef(new Map<string, string | undefined>());
  const scroll = useRef<{
    win: Window;
    frame: number;
    speed: number;
    tree: HTMLElement;
  } | null>(null);
  const clearHover = () => {
    if (hover.current) clearTimeout(hover.current.timer);
    hover.current = null;
  };
  const stopDrag = () => {
    clearHover();
    dragging.current = null;
    allowed.current.clear();
    setDropTarget(null);
    setDropMessage("");
    if (scroll.current)
      scroll.current.win.cancelAnimationFrame(scroll.current.frame);
    scroll.current = null;
  };
  useEffect(() => {
    stopDrag();
  }, [s.datasetEpoch]);
  useEffect(
    () => () => {
      clearHover();
      if (scroll.current)
        scroll.current.win.cancelAnimationFrame(scroll.current.frame);
    },
    [],
  );
  const over = (ev: React.DragEvent, parent: string) => {
    if (
      draft ||
      properties ||
      !ev.dataTransfer.types.includes(taxonomyDragType)
    )
      return;
    const target = map.get(parent);
    if (!target || !namedClass(target)) return;
    ev.preventDefault();
    const source = dragging.current;
    if (source && !allowed.current.has(parent))
      allowed.current.set(parent, classMoveIssue(map, source.iri, parent));
    const issue = source ? allowed.current.get(parent) : undefined;
    ev.dataTransfer.dropEffect = issue ? "none" : "move";
    setDropTarget(issue ? null : parent);
    setDropMessage(issue ?? "Move under " + displayName(target));
    if (hover.current?.iri !== parent) {
      clearHover();
      if (!issue && !open.has(parent) && taxonomyChildren(target).length)
        hover.current = {
          iri: parent,
          timer: setTimeout(() => {
            setOpen((previous) => {
              const next = new Set([...previous, parent]);
              savePanel("hierarchy.open", [...next], false);
              return next;
            });
          }, 650),
        };
    }
  };
  const drop = async (ev: React.DragEvent, parent: string) => {
    if (
      !ev.dataTransfer.types.includes(taxonomyDragType) ||
      properties ||
      draft
    )
      return;
    ev.preventDefault();
    ev.stopPropagation();
    const data = ev.dataTransfer.getData(taxonomyDragType);
    stopDrag();
    let source: TaxonomyDrag;
    try {
      source = JSON.parse(data);
    } catch {
      return;
    }
    if (
      !source ||
      typeof source.iri !== "string" ||
      !(source.fromParent === null || typeof source.fromParent === "string")
    )
      return;
    const moved = await act("moveClass", { ...source, parent });
    if (moved) {
      setFilter("");
      setOpen((previous) => {
        const next = new Set([...previous, parent]);
        savePanel("hierarchy.open", [...next], false);
        return next;
      });
      revealInTaxonomy(source.iri);
    }
  };
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
        if (id.startsWith("taxonomy.added:")) {
          const iri = id.slice("taxonomy.added:".length);
          setFilter("");
          setOpen((previous) => {
            const next = new Set([...previous, iri]);
            savePanel("hierarchy.open", [...next], false);
            return next;
          });
        }
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
    const iri = draft?.parent ?? s.selected;
    if (!iri || !map.has(iri)) return;
    const next = new Set(open),
      seen = new Set<string>();
    const parents = (i: string) => {
      if (seen.has(i)) return;
      seen.add(i);
      for (const p of taxonomyParents(map.get(i))) {
        next.add(p);
        parents(p);
      }
    };
    parents(iri);
    if (next.size !== open.size) setOpen(next);
  }, [s.selected, s.entities, draft?.parent]);
  return (
    <section
      ref={rootRef}
      className="panel hierarchy-panel"
      data-panel="hierarchy"
      aria-label="Hierarchy panel"
    >
      <div className="hierarchy-controls">
        <PaneToolbar label="Hierarchy type">
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
        </PaneToolbar>
        <PaneToolbar label="Hierarchy filter">
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
              command(
                properties ? "entity.createProperty" : "entity.createClass",
              )
            }
          >
            +
          </button>
        </PaneToolbar>
      </div>
      <div
        role="tree"
        aria-label={properties ? "Property hierarchy" : "Class hierarchy"}
        className="tree"
        onDragOver={(ev) => {
          if (!ev.dataTransfer.types.includes(taxonomyDragType)) return;
          const tree = ev.currentTarget,
            rect = tree.getBoundingClientRect(),
            win = tree.ownerDocument.defaultView!;
          const speed =
            ev.clientY < rect.top + 36
              ? -10
              : ev.clientY > rect.bottom - 36
                ? 10
                : 0;
          if (scroll.current) scroll.current.speed = speed;
          else if (speed) {
            const tick = () => {
              const current = scroll.current;
              if (!current) return;
              if (!current.speed) {
                scroll.current = null;
                return;
              }
              current.tree.scrollTop += current.speed;
              current.frame = current.win.requestAnimationFrame(tick);
            };
            scroll.current = {
              win,
              tree,
              speed,
              frame: win.requestAnimationFrame(tick),
            };
          }
          if (!(ev.target as Element).closest(".tree-row")) over(ev, THING);
        }}
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
            clearHover();
            setDropTarget(null);
            setDropMessage("");
            if (scroll.current) scroll.current.speed = 0;
          }
        }}
        onDrop={(ev) => void drop(ev, THING)}
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
                data-entity-iri={iri}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={
                  taxonomyChildren(e).length ? expanded : undefined
                }
                aria-selected={s.selected === iri}
                tabIndex={
                  s.selected === iri || (!selectedVisible && index === 0)
                    ? 0
                    : -1
                }
                key={iri}
                className={
                  "tree-row " +
                  (s.selected === iri ? "selected " : "") +
                  (dropTarget === iri ? "taxonomy-drop-target" : "")
                }
                style={{ paddingLeft: 8 + depth * 16 }}
                draggable={!draft}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(entityDragType, iri);
                  ev.dataTransfer.setData("text/plain", iri);
                  ev.dataTransfer.effectAllowed = "copyMove";
                  if (!properties && namedClass(e) && iri !== THING) {
                    const source = {
                      iri,
                      fromParent: rowParents.get(iri) ?? null,
                      version: s.version,
                      datasetEpoch: s.datasetEpoch,
                    };
                    dragging.current = source;
                    allowed.current.clear();
                    ev.dataTransfer.setData(
                      taxonomyDragType,
                      JSON.stringify(source),
                    );
                  }
                }}
                onDragOver={(ev) => over(ev, iri)}
                onDragLeave={(ev) => {
                  if (
                    !ev.currentTarget.contains(
                      ev.relatedTarget as Node | null,
                    ) &&
                    hover.current?.iri === iri
                  )
                    clearHover();
                }}
                onDragEnd={stopDrag}
                onDrop={(ev) => void drop(ev, iri)}
                onClick={() => void act("select", { iri })}
                onDoubleClick={() => {
                  if (taxonomyChildren(e).length) toggle(iri);
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  ev.currentTarget.focus();
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
                    if (taxonomyChildren(e).length && !open.has(iri))
                      toggle(iri);
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
                  {taxonomyChildren(e).length ? (expanded ? "⌄" : "›") : ""}
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
                {instanceAction(e).visible && (
                  <button
                    className="muted count instance-count"
                    disabled={!instanceAction(e).enabled}
                    title={instanceAction(e).title}
                    aria-label={
                      "Show " +
                      e.instances.toLocaleString("en-GB") +
                      " direct instances of " +
                      displayName(e)
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      showInstances(iri);
                    }}
                    onDoubleClick={(ev) => ev.stopPropagation()}
                    onKeyDown={(ev) => {
                      if (["Enter", " "].includes(ev.key)) ev.stopPropagation();
                    }}
                  >
                    {e.instances.toLocaleString("en-GB")}
                  </button>
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
      {dropMessage && (
        <div className="taxonomy-drop-hint" role="status">
          {dropMessage}
        </div>
      )}
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
      {context && (
        <EntityMenu
          {...context}
          document={context.doc}
          close={() => setContext(null)}
          taxonomy={(mode) => openTaxonomy(context.iri, mode)}
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
