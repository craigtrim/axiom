import { classMoveIssue } from "../domain/taxonomy-move";
import { taxonomyRows } from "../domain/taxonomy-rows";
import {
  alignTaxonomyRow,
  completeTaxonomyReveal,
  currentTaxonomyReveal,
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
  selectionFromHierarchy,
  setSelectionOrigin,
} from "./client";
import { THING, NS, kindLabel } from "../domain/model";
import {
  singleHierarchySelection,
  selectHierarchyRow,
  pruneHierarchySelection,
  type HierarchySelection,
} from "./hierarchy-selection";
export function HierarchyPanel() {
  const s = useSnapshot()!,
    [tab, setTab] = useState(panel("hierarchy.tab", "classes")),
    [filter, setFilter] = useState(""),
    [draft, setDraft] = useState<Creation | null>(null),
    [context, setContext] = useState<{
      iri: string;
      iris: string[];
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
  const [selection, setSelection] = useState(() =>
    singleHierarchySelection(s.selected),
  );
  const selectionRef = useRef(selection);
  const updateSelection = (next: HierarchySelection) => {
    selectionRef.current = next;
    setSelection(next);
  };
  useEffect(() => {
    if (!selectionFromHierarchy)
      updateSelection(singleHierarchySelection(s.selected));
  }, [s.selected]);
  useEffect(() => {
    updateSelection(singleHierarchySelection(s.selected));
    setContext(null);
  }, [s.datasetEpoch]);
  const revealRef = useRef<ReturnType<typeof takeTaxonomyReveal>>(null);
  const [revealTick, setRevealTick] = useState(0);
  useEffect(() => {
    const reveal = () => {
      const request = takeTaxonomyReveal();
      if (!request) return;
      if (request.details && selectionFromHierarchy) return;
      const { iri } = request;
      revealRef.current = request;
      setFilter("");
      const entity = s.entities.find((e) => e.iri === iri);
      setTab(entity?.kind.endsWith("Property") ? "properties" : "classes");
      setRevealTick((x) => x + 1);
    };
    reveal();
    const off = onCommand((id) => {
      if (id === "taxonomy.reveal") reveal();
    });
    command("taxonomy.follow");
    return off;
  }, [s.entities]);
  useEffect(() => {
    const request = revealRef.current;
    const tree = rootRef.current?.querySelector<HTMLElement>('[role="tree"]');
    if (!request || !tree) return;
    if (!currentTaxonomyReveal(request)) {
      revealRef.current = null;
      return;
    }
    if (request.iri !== s.selected) return;
    const win = tree.ownerDocument.defaultView!;
    let frame = 0;
    const align = () => {
      if (revealRef.current !== request) return;
      if (!currentTaxonomyReveal(request)) {
        revealRef.current = null;
        observer.disconnect();
        return;
      }
      if (
        request.details &&
        (selectionFromHierarchy ||
          !request.details.isConnected ||
          !request.details.checkVisibility({ visibilityProperty: true }))
      )
        return;
      const row = [
        ...tree.querySelectorAll<HTMLElement>("[data-entity-iri]"),
      ].find((r) => r.dataset.entityIri === request.iri);
      if (row && alignTaxonomyRow(tree, row, request.anchor)) {
        revealRef.current = null;
        observer.disconnect();
        completeTaxonomyReveal(request);
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
    const off = onCommand((id) => {
      if (id === "taxonomy.layout") schedule();
    });
    schedule();
    return () => {
      observer.disconnect();
      off();
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
  const visibleIds = useMemo(() => rows.map((r) => r.iri), [rows]);
  useEffect(() => {
    // External navigation can select a hidden node before the ancestry-opening
    // effect runs. Keep that selection until the next render reveals it.
    if (
      selectionFromHierarchy ||
      !s.selected ||
      !entities.some((e) => e.iri === s.selected)
    )
      updateSelection(
        pruneHierarchySelection(selectionRef.current, visibleIds),
      );
    const visible = new Set(visibleIds);
    setContext((current) =>
      current && current.iris.every((iri) => visible.has(iri)) ? current : null,
    );
  }, [visibleIds]);
  const selectedSet = new Set(selection.ids);
  const selectedVisible = rows.some((r) => r.iri === selection.focus);
  const choose = (
    iri: string,
    modifiers: { toggle?: boolean; range?: boolean; focusOnly?: boolean } = {},
  ) => {
    updateSelection(
      selectHierarchyRow(selectionRef.current, iri, visibleIds, modifiers),
    );
    if (!modifiers.focusOnly) void act("select", { iri, origin: "hierarchy" });
  };
  const menuSelection = (iri: string) => {
    if (!selectionRef.current.ids.includes(iri)) choose(iri);
    else updateSelection({ ...selectionRef.current, focus: iri });
    return [...selectionRef.current.ids];
  };
  const focusRow = (iri: string) => {
    const tree = rootRef.current?.querySelector('[role="tree"]');
    [...(tree?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
      .find((row) => row.dataset.entityIri === iri)
      ?.focus();
  };
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
    if (!draft && selectionFromHierarchy) return;
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
  }, [s.selected, s.entities, draft?.parent, revealTick]);
  return (
    <section
      ref={rootRef}
      className="panel hierarchy-panel"
      data-panel="hierarchy"
      aria-label="Hierarchy panel"
      onPointerDownCapture={() => setSelectionOrigin("hierarchy")}
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
            onChange={(e) => {
              setSelectionOrigin("hierarchy");
              setFilter(e.target.value);
            }}
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
        aria-multiselectable="true"
        data-selection-count={selection.ids.length}
        aria-description="Ctrl-click toggles a node. Shift-click selects a visible range. Ctrl+A selects all visible rows."
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
                aria-selected={selectedSet.has(iri)}
                tabIndex={
                  selection.focus === iri || (!selectedVisible && index === 0)
                    ? 0
                    : -1
                }
                key={iri}
                className={
                  "tree-row " +
                  (selectedSet.has(iri) ? "selected " : "") +
                  (dropTarget === iri ? "taxonomy-drop-target" : "")
                }
                style={{ paddingLeft: 8 + depth * 16 }}
                draggable={!draft && selection.ids.length <= 1}
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
                onClick={(ev) =>
                  choose(iri, {
                    toggle: ev.ctrlKey || ev.metaKey,
                    range: ev.shiftKey,
                  })
                }
                onDoubleClick={() => {
                  if (taxonomyChildren(e).length) toggle(iri);
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  ev.currentTarget.focus();
                  setContext({
                    iri,
                    iris: menuSelection(iri),
                    x: ev.clientX,
                    y: ev.clientY,
                    doc: ev.currentTarget.ownerDocument,
                  });
                }}
                onKeyDown={(ev) => {
                  if (
                    (ev.target as HTMLElement).closest(
                      "input,[data-inline-rename]",
                    )
                  )
                    return;
                  const control = ev.ctrlKey || ev.metaKey;
                  if (control && ev.key.toLowerCase() === "a") {
                    ev.preventDefault();
                    updateSelection({
                      ids: [...visibleIds],
                      anchor: iri,
                      focus: iri,
                    });
                    return;
                  }
                  if (
                    ev.key === " " ||
                    ev.key === "Enter" ||
                    ev.key === "Escape"
                  ) {
                    ev.preventDefault();
                    choose(iri, {
                      toggle: ev.key === " " && control,
                      range: ev.key === " " && ev.shiftKey,
                    });
                    return;
                  }
                  if (
                    ev.key === "ContextMenu" ||
                    (ev.shiftKey && ev.key === "F10")
                  ) {
                    ev.preventDefault();
                    const r = ev.currentTarget.getBoundingClientRect();
                    setContext({
                      iri,
                      iris: menuSelection(iri),
                      x: r.x + 40,
                      y: r.y + 20,
                      doc: ev.currentTarget.ownerDocument,
                    });
                  }
                  if (ev.key === "ArrowRight") {
                    ev.preventDefault();
                    if (taxonomyChildren(e).length && !open.has(iri))
                      toggle(iri);
                    else if (rows[index + 1]) {
                      const next = rows[index + 1].iri;
                      choose(next, {
                        range: ev.shiftKey,
                        toggle: control,
                        focusOnly: control && !ev.shiftKey,
                      });
                      focusRow(next);
                    }
                  }
                  if (ev.key === "ArrowLeft") {
                    ev.preventDefault();
                    if (open.has(iri)) toggle(iri);
                    else {
                      const parent = rowParents.get(iri);
                      if (parent) {
                        choose(parent, {
                          range: ev.shiftKey,
                          toggle: control,
                          focusOnly: control && !ev.shiftKey,
                        });
                        focusRow(parent);
                      }
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
                    choose(row.iri, {
                      range: ev.shiftKey,
                      toggle: control,
                      focusOnly: control && !ev.shiftKey,
                    });
                    focusRow(row.iri);
                  }
                  if (ev.key === "Home" || ev.key === "End") {
                    ev.preventDefault();
                    const next = rows[ev.key === "Home" ? 0 : rows.length - 1];
                    choose(next.iri, {
                      range: ev.shiftKey,
                      toggle: control,
                      focusOnly: control && !ev.shiftKey,
                    });
                    focusRow(next.iri);
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
          disabled={!selection.ids.length}
          onClick={() => {
            void act("seed", {
              iris: selection.ids,
              expand: selection.ids.length <= 1,
            }).then(() => command("graph.fit"));
            command("view.graph");
          }}
        >
          Show in graph
        </button>
        <span className="hierarchy-selection-count" role="status">
          {selection.ids.length > 1 ? selection.ids.length + " selected" : ""}
        </span>
      </div>
      {context && (
        <EntityMenu
          {...context}
          document={context.doc}
          close={() => setContext(null)}
          taxonomy={(mode) => openTaxonomy(context.iri, mode)}
          branch={
            context.iris.some((id) => taxonomyChildren(map.get(id)).length)
              ? {
                  open: context.iris
                    .filter((id) => taxonomyChildren(map.get(id)).length)
                    .every((id) => open.has(id)),
                  count: context.iris.reduce(
                    (n, id) => n + taxonomyChildren(map.get(id)).length,
                    0,
                  ),
                  toggle: () => {
                    const branches = context.iris.filter(
                      (id) => taxonomyChildren(map.get(id)).length,
                    );
                    const collapse = branches.every((id) => open.has(id));
                    setOpen((previous) => {
                      const next = new Set(previous);
                      for (const id of branches)
                        if (collapse) next.delete(id);
                        else next.add(id);
                      savePanel("hierarchy.open", [...next]);
                      return next;
                    });
                  },
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
