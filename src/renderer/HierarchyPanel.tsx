import { branchRoots, classMovesIssue } from "../domain/taxonomy-move";
import { taxonomyRows } from "../domain/taxonomy-rows";
import {
  alignTaxonomyRow,
  completeTaxonomyReveal,
  currentTaxonomyReveal,
  takeTaxonomyReveal,
} from "./taxonomy-navigation";
import {
  namedClass,
  taxonomyParents,
  taxonomyChildren,
} from "../domain/class-expressions";
import { registerPaneRecovery } from "./AdaptivePane";
import {
  SharedPane,
  SharedMenu,
  usePaneToast,
  type SharedMenuItem,
} from "./SharedPane";
import { useActionOverflow } from "./useActionOverflow";
import { InlineCreate } from "./InlineCreate";
import {
  takeCreation,
  editEntity,
  entityDragType,
  taxonomyDragType,
  type TaxonomyDrag,
  type Creation,
} from "./authoring";
import { displayName } from "../domain/rdf-model";
import { Fragment, type RefObject, type CSSProperties } from "react";
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
import "./hierarchy-reference.css";

// craigtrim/axiom#91: shared chrome surrounds the existing authoring and reveal behavior.
registerPaneRecovery("hierarchy", {
  Body: ({ maximize }) => (
    <div className="hierarchy-recovery">
      <div className="id">Hierarchy</div>
      <div className="why">
        Too little room to read a tree. Expansion, selection and filter are
        retained.
      </div>
      <div>{maximize}</div>
    </div>
  ),
});
export function HierarchyPanel() {
  const rootRef = useRef<HTMLElement>(null);
  return (
    <section
      ref={rootRef}
      className="panel shared-layer hierarchy-panel"
      data-panel="hierarchy"
      aria-label="Hierarchy panel"
      onPointerDownCapture={() => setSelectionOrigin("hierarchy")}
    >
      <SharedPane className="footed hierarchy-surface">
        <HierarchyContent rootRef={rootRef} />
      </SharedPane>
    </section>
  );
}
function HierarchyContent({
  rootRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
}) {
  const notify = usePaneToast();
  const s = useSnapshot()!,
    [tab, setTab] = useState(panel("hierarchy.tab", "classes")),
    [filter, setFilter] = useState(panel("hierarchy.filter", "")),
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
  const barRef = useRef<HTMLDivElement>(null),
    moreRef = useRef<HTMLButtonElement>(null),
    filterRef = useRef<HTMLInputElement>(null);
  const [filterPinned, setFilterPinned] = useState(false);
  const [undoOffer, setUndoOffer] = useState<{
    label: string;
    version: number;
  } | null>(null);
  const [lifted, setLifted] = useState<string[]>([]);
  useEffect(() => {
    savePanel("hierarchy.filter", filter, false);
  }, [filter]);
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
    setUndoOffer(null);
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
    // effect runs, including a property before the tab switches. Keep that
    // selection until the next render reveals it.
    if (
      selectionFromHierarchy ||
      !s.selected ||
      !s.entities.some(
        (e) =>
          e.iri === s.selected &&
          (namedClass(e) || e.kind.endsWith("Property")),
      )
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
    [dropMessage, setDropMessage] = useState(""),
    [dropBlocked, setDropBlocked] = useState(false),
    [emptyDrop, setEmptyDrop] = useState(false);
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
    setDropBlocked(false);
    setEmptyDrop(false);
    setLifted([]);
    if (scroll.current)
      scroll.current.win.cancelAnimationFrame(scroll.current.frame);
    scroll.current = null;
  };
  useEffect(() => {
    stopDrag();
  }, [s.datasetEpoch, s.version]);
  useEffect(
    () => () => {
      clearHover();
      if (scroll.current)
        scroll.current.win.cancelAnimationFrame(scroll.current.frame);
    },
    [],
  );
  const over = (ev: React.DragEvent, parent: string, empty = false) => {
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
    if (
      !source ||
      source.version !== s.version ||
      source.datasetEpoch !== s.datasetEpoch
    )
      return;
    if (source && !allowed.current.has(parent))
      allowed.current.set(
        parent,
        classMovesIssue(map, source.moves ?? [source], parent),
      );
    const issue = source ? allowed.current.get(parent) : undefined;
    ev.dataTransfer.dropEffect = issue ? "none" : "move";
    setDropTarget(parent);
    setDropBlocked(!!issue);
    setEmptyDrop(empty);
    const moves = source.moves ?? [source];
    setDropMessage(
      issue ??
        "Move " +
          (moves.length === 1
            ? displayName(map.get(moves[0].iri)!)
            : moves.length + " branches") +
          " under " +
          displayName(target),
    );
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
          }, 600),
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
    if (
      source.version !== s.version ||
      source.datasetEpoch !== s.datasetEpoch
    ) {
      notify(
        "That move is blocked.",
        "The ontology changed. Drag the class again.",
      );
      return;
    }
    const moves = source.moves ?? [source];
    if (
      !Array.isArray(moves) ||
      !moves.length ||
      moves.some(
        (m) =>
          !m ||
          typeof m.iri !== "string" ||
          !(m.fromParent === null || typeof m.fromParent === "string"),
      )
    )
      return;
    const issue = classMovesIssue(map, moves, parent);
    if (issue) {
      notify("That move is blocked.", issue + ".");
      return;
    }
    const label =
      "Move " +
      (moves.length === 1
        ? displayName(map.get(moves[0].iri)!)
        : moves.length + " branches") +
      " under " +
      displayName(map.get(parent)!);
    const moved = await act("moveClasses", { ...source, moves, parent });
    if (moved) {
      setFilter("");
      setOpen((previous) => {
        const next = new Set([...previous, parent]);
        savePanel("hierarchy.open", [...next], false);
        return next;
      });
      updateSelection({
        ids: moves.map((m) => m.iri),
        anchor: source.iri,
        focus: source.iri,
      });
      setUndoOffer({ label, version: source.version + 1 });
      notify(
        label.replace(/^Move /, "Moved ") + ".",
        "Other parents, children, instances and OWL definitions are intact. One Undo reverses it.",
      );
    }
  };
  const toggle = (iri: string) => {
    if (filter.trim()) {
      notify(
        "Expansion is held open while a filter is active.",
        "Clear the filter to collapse branches again.",
      );
      return;
    }
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
          setFilterPinned(true);
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
        if (id === "hierarchy.graph") {
          const ids = selectionRef.current.ids;
          if (ids.length) {
            void act("seed", { iris: ids, expand: ids.length === 1 }).then(() =>
              command("graph.fit"),
            );
            command("view.graph");
          }
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
  const canUndo =
    !!undoOffer &&
    s.undoLabel === undoOffer.label &&
    s.version === undoOffer.version;
  const undoMove = async () => {
    if (!canUndo) return;
    if (await act("undo")) {
      setUndoOffer(null);
      notify("Move reversed.", "Redo would reapply it.");
    }
  };
  const switchTab = (next: string) => {
    if (tab === next) return;
    stopDrag();
    setTab(next);
    setUndoOffer(null);
    setContext(null);
    updateSelection(singleHierarchySelection(null));
    savePanel("hierarchy.tab", next);
  };
  const showGraph = () => {
    void act("seed", {
      iris: selection.ids,
      expand: selection.ids.length === 1,
    }).then(() => command("graph.fit"));
    command("view.graph");
  };
  const showFilter = () => {
    setFilterPinned(true);
    setTimeout(() => filterRef.current?.focus(), 0);
  };
  const create = () =>
    command(properties ? "entity.createProperty" : "entity.createClass");
  const details = () => {
    if (selection.ids.length === 1) editEntity(selection.ids[0]);
  };
  const actions = [
    {
      id: "details",
      priority: 4,
      label: "Open in Details",
      disabled: selection.ids.length !== 1,
      run: details,
    },
    {
      id: "graph",
      priority: 3,
      label: "Show in graph",
      disabled: !selection.ids.length,
      run: showGraph,
    },
    {
      id: "new",
      priority: 2,
      label: properties ? "New property" : "New class",
      run: create,
    },
    { id: "filter", priority: 1, label: "Filter hierarchy", run: showFilter },
  ];
  const pinnedFilter = filterPinned || !!filter;
  const hidden = useActionOverflow(
    barRef,
    moreRef,
    actions.filter((a) => !pinnedFilter || a.id !== "filter"),
    "shared",
  );
  const isHidden = (id: string) =>
    hidden.has(id) && !(id === "filter" && (filterPinned || !!filter));
  const setAllBranches = (expand: boolean) => {
    if (filter.trim()) {
      notify(
        "Expansion is held open while a filter is active.",
        "Clear the filter to collapse branches again.",
      );
      return;
    }
    const next = new Set(expand ? entities.map((e) => e.iri) : []);
    setOpen(next);
    savePanel("hierarchy.open", [...next]);
  };
  const overflow = actions.filter((a) => isHidden(a.id));
  const menu: SharedMenuItem[] = [
    ...overflow,
    ...(overflow.length
      ? [{ id: "hidden-separator", separator: true as const }]
      : []),
    {
      id: "expand",
      label: "Expand every branch",
      run: () => setAllBranches(true),
    },
    {
      id: "collapse",
      label: "Collapse every branch",
      run: () => setAllBranches(false),
    },
    {
      id: "all",
      label: "Select every visible row",
      run: () =>
        updateSelection({
          ids: [...visibleIds],
          anchor: selection.focus ?? visibleIds[0],
          focus: selection.focus ?? visibleIds[0],
        }),
    },
    { id: "undo-separator", separator: true },
    {
      id: "undo",
      label: "Undo the last move",
      disabled: !canUndo,
      run: () => void undoMove(),
    },
  ];
  const selectedName =
    selection.ids.length === 1 && map.has(selection.ids[0])
      ? displayName(map.get(selection.ids[0])!)
      : "";
  const stateText =
    dropMessage ||
    (selection.ids.length > 1
      ? selection.ids.length + " selected"
      : selectedName || "Nothing selected");
  return (
    <>
      <div
        ref={barRef}
        className="bar"
        role="group"
        aria-label="Hierarchy actions"
      >
        <span
          className="seg"
          data-fixed-action
          role="group"
          aria-label="Hierarchy type"
        >
          <button
            type="button"
            aria-pressed={!properties}
            onClick={() => switchTab("classes")}
          >
            Classes
          </button>
          <button
            type="button"
            aria-pressed={properties}
            onClick={() => switchTab("properties")}
          >
            Properties
          </button>
        </span>
        <span
          className={"state" + (dropMessage && dropBlocked ? " badink" : "")}
          title={stateText}
          data-fixed-action={!pinnedFilter ? "" : undefined}
        >
          <span data-natural-width>
            {!dropMessage && selection.ids.length > 1 ? (
              <>
                <span className="num">{selection.ids.length}</span>
                {" selected"}
              </>
            ) : (
              stateText
            )}
          </span>
        </span>
        <span className="od-fill" />
        <div
          className="shared-command"
          data-shared-command={!pinnedFilter ? "filter" : undefined}
          data-fixed-action={pinnedFilter ? "" : undefined}
          data-overflowed={isHidden("filter")}
          inert={isHidden("filter")}
          aria-hidden={isHidden("filter") || undefined}
        >
          <input
            ref={filterRef}
            className="fld"
            size={13}
            aria-label="Filter hierarchy"
            placeholder="Filter hierarchy"
            value={filter}
            onFocus={() => setFilterPinned(true)}
            onBlur={() => setFilterPinned(false)}
            onChange={(e) => {
              setSelectionOrigin("hierarchy");
              setFilter(e.target.value);
            }}
          />
        </div>
        {[...actions]
          .reverse()
          .filter((a) => a.id !== "filter")
          .map((a) => (
            <div
              key={a.id}
              className="shared-command"
              data-shared-command={a.id}
              data-overflowed={isHidden(a.id)}
              inert={isHidden(a.id)}
              aria-hidden={isHidden(a.id) || undefined}
            >
              <button
                className="btn quiet"
                type="button"
                disabled={a.disabled}
                onClick={a.run}
              >
                {a.label}
              </button>
            </div>
          ))}
        <SharedMenu trigger={moreRef} items={menu} />
      </div>
      <div
        role={rows.length || draft ? "tree" : "region"}
        aria-multiselectable={rows.length || draft ? true : undefined}
        data-selection-count={selection.ids.length}
        aria-description="Ctrl-click toggles a node. Shift-click selects a visible range. Ctrl+A selects all visible rows."
        aria-label={properties ? "Property hierarchy" : "Class hierarchy"}
        className="body tree"
        onDragOver={(ev) => {
          if (!ev.dataTransfer.types.includes(taxonomyDragType)) return;
          const tree = ev.currentTarget,
            rect = tree.getBoundingClientRect(),
            win = tree.ownerDocument.defaultView!;
          const speed =
            ev.clientY < rect.top + 28
              ? -Math.min(10, Math.ceil((28 - (ev.clientY - rect.top)) / 3))
              : ev.clientY > rect.bottom - 28
                ? Math.min(10, Math.ceil((28 - (rect.bottom - ev.clientY)) / 3))
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
          if (!(ev.target as Element).closest(".tree-row"))
            over(ev, THING, true);
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
            expanded = open.has(iri) || !!filter.trim(),
            extraParents = e.parents.filter(
              (p) =>
                p !== rowParents.get(iri) &&
                map.has(p) &&
                namedClass(map.get(p)!),
            ),
            count = properties ? (e.assertions ?? 0) : e.instances,
            hit =
              !!filter.trim() &&
              (e.name + " " + (e.label ?? "") + " " + e.iri)
                .toLowerCase()
                .includes(filter.trim().toLowerCase());
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
                  "tree-row tr " +
                  (lifted.includes(iri) ? "lift " : "") +
                  (dropTarget === iri && !emptyDrop
                    ? dropBlocked
                      ? "nodrop"
                      : "drop"
                    : "")
                }
                draggable={!draft}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(entityDragType, iri);
                  ev.dataTransfer.setData("text/plain", iri);
                  ev.dataTransfer.effectAllowed = "copyMove";
                  const ids = selectedSet.has(iri) ? selection.ids : [iri];
                  if (!selectedSet.has(iri)) choose(iri);
                  if (properties) return;
                  if (ids.includes(THING)) {
                    ev.preventDefault();
                    notify(
                      displayName(map.get(THING)!) + " cannot be moved.",
                      "It is the root of the taxonomy, so it has no parent to replace.",
                    );
                    return;
                  }
                  const roots = branchRoots(map, ids);
                  if (!roots.length) {
                    ev.preventDefault();
                    return;
                  }
                  const moves = roots.map((id) => ({
                    iri: id,
                    fromParent: rowParents.get(id) ?? null,
                  }));
                  const source = {
                    iri,
                    fromParent: rowParents.get(iri) ?? null,
                    moves,
                    version: s.version,
                    datasetEpoch: s.datasetEpoch,
                  };
                  dragging.current = source;
                  allowed.current.clear();
                  setLifted(roots);
                  ev.dataTransfer.setData(
                    taxonomyDragType,
                    JSON.stringify(source),
                  );
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
                    if (ev.key === "Enter") editEntity(iri);
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
                    else if (rows[index + 1]?.depth > depth) {
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
                <span
                  className="ind"
                  style={{ "--ind-depth": depth } as CSSProperties}
                />
                {taxonomyChildren(e).length ? (
                  <button
                    onDoubleClick={(ev) => ev.stopPropagation()}
                    className="exp"
                    tabIndex={-1}
                    aria-expanded={expanded}
                    aria-label={
                      (expanded ? "Collapse " : "Expand ") + displayName(e)
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggle(iri);
                    }}
                  >
                    <i />
                  </button>
                ) : (
                  <span className="exp leaf" aria-hidden="true">
                    <i />
                  </span>
                )}
                <span
                  className={
                    "mk " +
                    (e.kind === "ObjectProperty"
                      ? "obj"
                      : e.kind.endsWith("Property")
                        ? "dat"
                        : "cls")
                  }
                  title={kindLabel(e.kind)}
                  aria-hidden="true"
                />
                <EditableEntityName
                  iri={iri}
                  name={e.name}
                  className="tree-name nm"
                >
                  {displayName(e)}
                </EditableEntityName>
                {hit && <span className="hit">match</span>}
                {!!extraParents.length && (
                  <span
                    className="alt"
                    title={
                      "also under " +
                      extraParents
                        .map((p) => displayName(map.get(p)!))
                        .join(", ")
                    }
                  >
                    {"also under " +
                      extraParents
                        .map((p) => displayName(map.get(p)!))
                        .join(", ")}
                  </span>
                )}
                <span className="sp" />
                {!!count && (
                  <span className="cnt">
                    {count.toLocaleString("en-US")}
                    <span className="unit">
                      {properties ? " assertions" : " instances"}
                    </span>
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
        {!!rows.length && (
          <div
            className={
              "rootdrop" +
              (emptyDrop && dropTarget && !dropBlocked ? " drop" : "")
            }
            aria-hidden="true"
          />
        )}
        {!rows.length && (
          <div className="empty" role="note">
            <b>Nothing in this hierarchy matches that filter.</b>
            {
              " Matching rows keep their ancestors so the indentation still tells you where they sit. Clear the filter to get the whole tree back."
            }
          </div>
        )}
      </div>
      <div className="foot">
        <span>
          <span className="num">{rows.length.toLocaleString("en-US")}</span>
          {" rows shown of "}
          <span className="num">
            {(properties ? s.propertyCount : s.classCount).toLocaleString(
              "en-US",
            )}
          </span>
        </span>
        <span className="keys">
          <span>
            <b>Ctrl</b>
            {" click toggles a row"}
          </span>
          <span>
            <b>Shift</b>
            {" click selects a range"}
          </span>
          <span>
            <b>Ctrl A</b>
            {" selects every visible row"}
          </span>
          {!properties && (
            <span>
              <b>Drag</b>
              {" a row onto a class to reparent it"}
            </span>
          )}
        </span>
        {canUndo && (
          <span className="undo">
            <button
              className="btn quiet"
              type="button"
              onClick={() => void undoMove()}
            >
              Undo move
            </button>
          </span>
        )}
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
    </>
  );
}
