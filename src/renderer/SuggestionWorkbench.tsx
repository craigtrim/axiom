import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePaneLayout } from "./AdaptivePane";
import { SuggestionIcon } from "./SuggestionIcon";
import "./suggestions-reference.css";

// Match the Suggestions reference while retaining real runs and edits (craigtrim/axiom#82).
import type { SuggestionRun } from "../shared/suggestions";
import { ErrorNotice } from "./ErrorNotice";
import {
  selectVisibleSuggestions,
  visibleSuggestions,
  type SuggestionItem,
  type SuggestionFilter,
  type SuggestionSort,
  type SuggestionStatus,
} from "./suggestion-workbench-model";

export type SuggestionNavigation = {
  modes: { id: string; name: string }[];
  changeMode(mode: string): void;
  openAnother(): void;
  sorts?: Map<string, SuggestionSort>;
};
export type SuggestionHistory = Pick<
  SuggestionRun,
  "id" | "iri" | "label" | "startedAt" | "state" | "provider"
> & { count: number; applied: number };
export type SuggestionWorkbenchProps<T extends SuggestionItem> = {
  navigation?: SuggestionNavigation;
  mode: "children" | "parents" | "synonyms";
  name: string;
  targetIri: string;
  context?: ReactNode;
  prompt?: ReactNode;
  summary: string;
  analysisContent?: ReactNode;
  progress?: ReactNode;
  renderDetails(item: T): ReactNode;
  items: T[];
  entry?: Pick<
    SuggestionRun,
    "id" | "state" | "provider" | "error" | "auditId" | "cache"
  >;
  history: SuggestionHistory[];
  runId: string;
  provider: "claude" | "codex";
  setProvider(value: "claude" | "codex"): void;
  loading: boolean;
  applying: boolean;
  activity: boolean;
  selectionActivity?: boolean;
  waiting: boolean;
  targetExists: boolean;
  blocked: string;
  drift: string;
  error: string;
  generate(bypassCache?: boolean): Promise<void>;
  apply(indices: number[]): Promise<number | undefined>;
  selectRun(id: string): void;
  selectTarget(iri: string, id?: string): void;
};
const modeWording = {
  children: {
    label: "Add Children",
    heading: "Add children to",
    table: "Suggested child classes",
    description: "Definition",
    singular: "child",
    plural: "children",
    added: "Added to the ontology in this run as a direct child.",
    empty: "No new direct children suggested.",
    start:
      "The assistant proposes immediate child classes for your review. Start a run when ready.",
  },
  parents: {
    label: "Add Parents",
    heading: "Add parents to",
    table: "Suggested parent classes",
    description: "Definition",
    singular: "parent",
    plural: "parents",
    added: "Added to the ontology in this run as a direct parent.",
    empty: "No additional parent classes were suggested.",
    start:
      "The assistant proposes existing parent classes using their meaning and hierarchy. Start a run when ready.",
  },
  synonyms: {
    label: "Find Synonyms",
    heading: "Find synonyms for",
    table: "Suggested synonyms",
    description: "Explanation",
    singular: "synonym",
    plural: "synonyms",
    added: "Added to this entity in this run as rdfs:seeAlso text.",
    empty: "No synonyms were suggested.",
    start:
      "Choose the synonyms you want to add as rdfs:seeAlso text. Start a run when ready.",
  },
};
const statusMeta: Record<SuggestionStatus, { word: string; icon: string }> = {
  available: { word: "Available", icon: "plus" },
  added: { word: "Added", icon: "check" },
  exists: { word: "Exists", icon: "dup" },
  unavailable: { word: "Unavailable", icon: "info" },
};

export function SuggestionWorkbench<T extends SuggestionItem>(
  p: SuggestionWorkbenchProps<T>,
) {
  const defaultSort: SuggestionSort =
    p.mode === "synonyms"
      ? { column: "distance", direction: "ascending" }
      : null;
  const { recovery } = usePaneLayout();
  const [folded, setFolded] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<SuggestionFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SuggestionSort>(() =>
    p.navigation?.sorts?.has(p.mode)
      ? p.navigation.sorts.get(p.mode)!
      : defaultSort,
  );
  const [selected, setSelected] = useState(new Set<string>());
  const [expanded, setExpanded] = useState(new Set<string>());
  const [overlay, setOverlay] = useState<
    "analysis" | "context" | "prompt" | null
  >(null);
  const [toast, setToast] = useState("");
  const [position, setPosition] = useState({
    left: 16,
    top: 16,
    maxHeight: 520,
    width: 620,
  });
  const root = useRef<HTMLElement>(null),
    checkAll = useRef<HTMLInputElement>(null);
  const analysis = useRef<HTMLButtonElement>(null),
    contextButton = useRef<HTMLButtonElement>(null),
    promptButton = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null),
    requested = useRef(false);
  const currentRun = useRef(p.runId);
  currentRun.current = p.runId;
  const id = useId();
  const entry = p.entry?.id === p.runId ? p.entry : undefined;
  // craigtrim/axiom#149: a saved terminal run cannot borrow another target's progress.
  const finishedStatus =
    entry?.state === "failed"
      ? "This run failed."
      : entry?.state === "cancelled"
        ? "This run was cancelled."
        : entry?.state === "interrupted"
          ? "This run was interrupted."
          : "";
  const preparing =
    entry?.state === "running" ||
    (!entry && (p.waiting || (p.selectionActivity ?? p.activity)));
  const items = p.items;
  const wording = modeWording[p.mode];
  const visible = visibleSuggestions(items, filter, query, sort);
  const available = items.filter((item) => item.status === "available");
  const selectedItems = available.filter((item) => selected.has(item.id));
  const visibleAvailable = visible.filter(
    (item) => item.status === "available",
  );
  const visibleSelected = visibleAvailable.filter((item) =>
    selected.has(item.id),
  );
  // Issue #68: another node's run can block generation without blocking review.
  const disabled =
    p.applying ||
    (p.selectionActivity ?? p.activity) ||
    !!p.blocked ||
    !p.targetExists;
  const assistant =
    (entry?.provider ?? p.provider) === "claude" ? "Claude" : "Codex";
  const legacyParents = p.mode === "parents" && !!entry && !entry.provider;
  const overlayLabel =
    overlay === "prompt"
      ? "Exact prompt"
      : overlay === "analysis"
        ? legacyParents
          ? "Why these parents matched"
          : `Why ${assistant} proposed these`
        : legacyParents
          ? "Context used for matching"
          : "Context sent to the assistant";
  const overlayTrigger = () =>
    overlay === "analysis"
      ? analysis
      : overlay === "prompt"
        ? promptButton
        : contextButton;
  const nodeHistory = p.history
    .filter((h) => h.iri === p.targetIri)
    .sort((a, b) => b.startedAt - a.startedAt);
  const targets = [
    ...new Map([...p.history].reverse().map((h) => [h.iri, h.label])).entries(),
  ];
  if (p.targetIri && !targets.some(([iri]) => iri === p.targetIri))
    targets.push([p.targetIri, p.name]);
  const targetIndex = targets.findIndex(([iri]) => iri === p.targetIri);
  const summary = p.summary;
  const distanceHelp = `Character insertions, deletions or substitutions from "${p.name}", ignoring case. Lower means closer spelling. This score does not restrict selection.`;
  const semanticHelp = `Cosine distance (1 minus similarity) from "${p.name}", using local full-precision all-mpnet-base-v2 embeddings. Lower means closer meaning. This score does not restrict selection.`;
  const counts = {
    all: items.length,
    available: available.length,
    added: items.filter((i) => i.status === "added").length,
    exists: items.filter((i) => i.status === "exists").length,
  };

  useEffect(() => {
    setSelected(new Set());
    setExpanded(new Set());
    setFilter("all");
    setQuery("");
    setOverlay(null);
    setToast("");
  }, [p.runId, p.targetIri, p.mode]);
  useEffect(() => {
    setSort(
      p.navigation?.sorts?.has(p.mode)
        ? p.navigation.sorts.get(p.mode)!
        : defaultSort,
    );
  }, [p.mode]);
  useLayoutEffect(() => {
    const host = root.current!;
    const observer = new host.ownerDocument.defaultView!.ResizeObserver(
      (entries) => {
        setFolded(entries[0].contentRect.width <= 900);
      },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (entry?.state === "running") requested.current = true;
    if (entry && ["failed", "cancelled", "interrupted"].includes(entry.state))
      requested.current = false;
    if (entry?.state === "completed" && requested.current) {
      requested.current = false;
      setToast(`New run recorded · ${items.length} suggestions`);
    }
  }, [entry?.state, entry?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useLayoutEffect(() => {
    if (checkAll.current)
      checkAll.current.indeterminate =
        visibleSelected.length > 0 &&
        visibleSelected.length < visibleAvailable.length;
  }, [visibleSelected.length, visibleAvailable.length]);
  useLayoutEffect(() => {
    if (!overlay || recovery) return;
    const trigger = overlayTrigger().current!;
    const doc = trigger.ownerDocument,
      win = doc.defaultView!;
    const place = () => {
      const r = trigger.getBoundingClientRect();
      const zoom =
        root.current!.getBoundingClientRect().width /
          root.current!.offsetWidth || 1;
      const viewportWidth = win.innerWidth / zoom,
        viewportHeight = win.innerHeight / zoom;
      const right = r.right / zoom,
        bottom = r.bottom / zoom,
        top = r.top / zoom;
      const width = Math.min(620, viewportWidth - 32);
      const below = viewportHeight - bottom - 22;
      const maxHeight = Math.max(
        80,
        Math.min(viewportHeight * 0.6, 520, below >= 180 ? below : top - 22),
      );
      setPosition({
        left: Math.max(16, Math.min(right - width, viewportWidth - width - 16)),
        top: below >= 180 ? bottom + 6 : Math.max(16, top - maxHeight - 6),
        maxHeight,
        width,
      });
    };
    place();
    const panel = popover.current!;
    panel.showPopover();
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (
        !popover.current?.contains(node) &&
        !analysis.current?.contains(node) &&
        !contextButton.current?.contains(node) &&
        !promptButton.current?.contains(node)
      )
        setOverlay(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOverlay(null);
        trigger.focus();
      }
    };
    doc.addEventListener("pointerdown", outside);
    doc.addEventListener("keydown", key, true);
    win.addEventListener("resize", place);
    const observer = new win.ResizeObserver(place);
    observer.observe(root.current!);
    return () => {
      doc.removeEventListener("pointerdown", outside);
      doc.removeEventListener("keydown", key, true);
      win.removeEventListener("resize", place);
      observer.disconnect();
      if (panel.isConnected && panel.matches(":popover-open"))
        panel.hidePopover();
    };
  }, [overlay, recovery]);

  const toggleRow = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const changeSort = (column: NonNullable<SuggestionSort>["column"]) =>
    setSort((previous) => {
      const next: SuggestionSort =
        previous?.column !== column
          ? { column, direction: "ascending" }
          : previous.direction === "ascending"
            ? { column, direction: "descending" }
            : null;
      p.navigation?.sorts?.set(p.mode, next);
      return next;
    });
  async function add(indices: number[]) {
    const run = p.runId;
    const count = await p.apply(indices);
    if (count !== undefined && run === currentRun.current) {
      setSelected(new Set());
      setToast(
        `${count} ${count === 1 ? wording.singular : wording.plural} added ${p.mode === "children" ? "under" : "to"} ${p.name}`,
      );
    }
  }
  function navigate(offset: number) {
    const next = targets[targetIndex + offset];
    if (next)
      p.selectTarget(next[0], p.history.find((h) => h.iri === next[0])?.id);
  }
  const sortHeader = (
    column: NonNullable<SuggestionSort>["column"],
    text: string,
  ) => (
    <th
      scope="col"
      aria-sort={
        sort?.column === column ? sort.direction : sort ? "none" : undefined
      }
      className={
        column === "distance"
          ? "ac-distance-col"
          : column === "semanticDistance"
            ? "ac-semantic-col"
            : undefined
      }
    >
      <button
        className="ac-sort"
        onClick={() => changeSort(column)}
        title={
          column === "distance"
            ? distanceHelp
            : column === "semanticDistance"
              ? semanticHelp
              : undefined
        }
        aria-label={
          column === "distance"
            ? "Levenshtein distance"
            : column === "semanticDistance"
              ? "Cosine distance"
              : undefined
        }
      >
        {column === "distance" ? (
          <>
            <span className="ac-distance-full">{text}</span>
            <span className="ac-distance-short">Edits</span>
          </>
        ) : (
          text + " "
        )}
        <SuggestionIcon name="sort" />
      </button>
    </th>
  );
  function panelButton(
    kind: "analysis" | "context" | "prompt",
    label: string,
    disabled: boolean,
  ) {
    const open = overlay === kind;
    return (
      <div className="ac-pop-host">
        <button
          className="ac-btn ac-pop-trigger"
          ref={
            kind === "analysis"
              ? analysis
              : kind === "context"
                ? contextButton
                : promptButton
          }
          aria-expanded={open}
          aria-controls={id + "-" + kind}
          disabled={disabled}
          onClick={() => setOverlay(open ? null : kind)}
        >
          <SuggestionIcon name="chev" />
          {label}
        </button>
        {open && (
          <div
            ref={popover}
            id={id + "-" + kind}
            popover="manual"
            className="ac-popover"
            role="group"
            aria-label={kind === "analysis" ? "Run analysis" : overlayLabel}
            style={position}
          >
            <p className="ac-pop-title">
              {kind === "context" ? "Context sent" : overlayLabel}
            </p>
            <div className="ac-pop-body">
              {kind === "analysis" ? (
                <>
                  {summary
                    .split(/\n\s*\n/)
                    .filter(Boolean)
                    .map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  {p.analysisContent}
                </>
              ) : kind === "prompt" ? (
                p.prompt
              ) : (
                p.context
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <section
      ref={root}
      className="panel taxonomy-panel add-children-panel"
      data-panel="taxonomy"
      aria-label="Taxonomy suggestions"
    >
      <div className="ac-command ac-band">
        <div className="ac-pager" role="group" aria-label="Suggestion targets">
          <button
            aria-label="Previous target"
            title="Previous target"
            disabled={p.applying || targetIndex <= 0}
            onClick={() => navigate(-1)}
          >
            <SuggestionIcon name="chev" reverse />
          </button>
          <span aria-live="polite">
            {Math.max(0, targetIndex + 1)} / {targets.length}
          </span>
          <button
            aria-label="Next target"
            title="Next target"
            disabled={
              p.applying ||
              targetIndex < 0 ||
              targetIndex === targets.length - 1
            }
            onClick={() => navigate(1)}
          >
            <SuggestionIcon name="chev" />
          </button>
        </div>
        <label className="ac-label" htmlFor={id + "-kind"}>
          Suggest
        </label>
        <select
          id={id + "-kind"}
          className="ac-ctl ac-kind"
          value={p.mode}
          onChange={(e) => p.navigation?.changeMode(e.target.value)}
        >
          {(p.navigation?.modes ?? [{ id: p.mode, name: wording.label }]).map(
            (mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
              </option>
            ),
          )}
        </select>

        <select
          aria-label="Assistant"
          className="ac-ctl ac-assistant"
          value={p.provider}
          disabled={p.activity || p.applying}
          onChange={(e) => p.setProvider(e.target.value as "claude" | "codex")}
        >
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
        <div className="ac-fill" />
        <select
          aria-label="Run history"
          className="ac-ctl ac-history"
          value={nodeHistory.some((h) => h.id === p.runId) ? p.runId : ""}
          disabled={p.loading || p.applying}
          onChange={(e) => p.selectRun(e.target.value)}
        >
          {!nodeHistory.some((h) => h.id === p.runId) && (
            <option value="">
              {p.loading ? "Loading history…" : "New run"}
            </option>
          )}
          {nodeHistory.map((h) => (
            <option key={h.id} value={h.id}>
              {new Date(h.startedAt).toLocaleString()} ·{" "}
              {h.provider === "claude"
                ? "Claude"
                : h.provider === "codex"
                  ? "Codex"
                  : "Local matching"}{" "}
              ·{" "}
              {h.state === "completed"
                ? h.count + " suggestions, " + h.applied + " added"
                : h.state}
            </option>
          ))}
        </select>
        {entry?.cache?.hit && (
          <button
            className="ac-btn"
            disabled={disabled || p.activity}
            onClick={() => {
              requested.current = true;
              void p.generate(true);
            }}
          >
            Run again
          </button>
        )}
        <button
          className="ac-btn ac-primary ac-new"
          disabled={p.loading || p.activity || p.applying || !p.targetExists}
          onClick={() => {
            requested.current = true;
            void p.generate();
          }}
        >
          <SuggestionIcon name="run" />
          New run
        </button>
        {p.navigation && (
          <button
            className="ac-iconbtn ac-another"
            aria-label="Open another view"
            title="Open another view"
            onClick={p.navigation.openAnother}
          >
            ⧉
          </button>
        )}
      </div>
      <div className="ac-run ac-band">
        <h1 title={p.targetIri}>
          {wording.heading + " "}
          <span>{p.name}</span>
        </h1>
        <p className="ac-peek" title={summary}>
          {summary.split(/\n\s*\n/)[0]}
        </p>
        {entry?.cache?.hit && (
          <p role="status" className="ac-cached">
            {`Cached result from ${new Date(entry.cache.completedAt).toLocaleString()} · ${entry.cache.model ?? "Model not reported"}.`}
          </p>
        )}
        {p.prompt && panelButton("prompt", "Prompt", false)}
        {panelButton("analysis", "Analysis", !summary)}
        {panelButton("context", "Context", !p.context)}
      </div>
      <div className="ac-tools ac-band">
        <div className="ac-filters" role="group" aria-label="Filter by status">
          {(
            [
              ["all", "All"],
              ["available", "Available"],
              ["added", "Added"],
              ["exists", "Already exist"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className="ac-chip"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="ac-fill" />
        <div className="ac-search">
          <SuggestionIcon name="search" />
          <input
            ref={search}
            type="search"
            className="ac-ctl"
            aria-label={
              "Filter suggestions by label or " +
              wording.description.toLowerCase()
            }
            placeholder="Filter suggestions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {p.progress}
      {p.waiting && (
        <p role="status" className="ac-notice">
          Waiting for the current suggestions to finish. This run will start
          automatically.
        </p>
      )}
      {p.error && (
        <ErrorNotice
          error={p.error}
          auditId={p.error === entry?.error ? entry?.auditId : undefined}
        />
      )}
      {p.blocked && entry?.state !== "running" && (
        <p role="alert" className="ac-notice">
          {p.blocked} This run is kept for reference.
        </p>
      )}
      {p.drift && !p.blocked && entry?.state !== "running" && (
        <p role="status" className="ac-notice">
          {p.drift} Check that the suggestions still fit before adding them.
        </p>
      )}
      <div
        className="ac-scroll"
        aria-busy={p.loading || p.applying || entry?.state === "running"}
      >
        <table
          className="ac-table"
          data-mode={p.mode}
          aria-label={wording.table}
          hidden={!visible.length}
        >
          <colgroup>
            <col className="ac-check-col" />
            <col className="ac-name-col" />
            <col className="ac-definition-col" />
            {p.mode === "synonyms" && <col className="ac-distance-col" />}
            {p.mode === "synonyms" && <col className="ac-semantic-col" />}
            <col className="ac-status-col" />
            <col className="ac-expand-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <input
                  ref={checkAll}
                  type="checkbox"
                  className="ac-check"
                  aria-label="Select all available suggestions"
                  disabled={disabled || !visibleAvailable.length}
                  checked={
                    !!visibleAvailable.length &&
                    visibleSelected.length === visibleAvailable.length
                  }
                  onChange={(e) =>
                    setSelected(
                      selectVisibleSuggestions(
                        selected,
                        visible,
                        e.target.checked,
                      ),
                    )
                  }
                />
              </th>
              {sortHeader("label", "Suggestion")}
              <th scope="col" className="ac-definition-col">
                {wording.description}
              </th>
              {p.mode === "synonyms" && sortHeader("distance", "Levenshtein")}
              {p.mode === "synonyms" &&
                sortHeader("semanticDistance", "Cosine")}
              {sortHeader("status", "Status")}
              <th scope="col">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          {visible.map((item) => {
            const meta = statusMeta[item.status],
              isOpen = expanded.has(item.id),
              detailId = id + "-" + item.index;
            return (
              <tbody
                key={item.id}
                className={
                  (selected.has(item.id) && item.status === "available"
                    ? "ac-selected "
                    : "") + (isOpen ? "ac-open" : "")
                }
              >
                <tr
                  className="ac-row"
                  onClick={(e) => {
                    if (
                      !(e.target as HTMLElement).closest(
                        "button,input,a,select",
                      )
                    )
                      toggleRow(item.id);
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      className="ac-check"
                      aria-label={
                        item.status === "available"
                          ? "Select " + item.label
                          : `${item.label}, ${meta.word}, cannot be added`
                      }
                      disabled={disabled || item.status !== "available"}
                      checked={
                        item.status === "available" && selected.has(item.id)
                      }
                      onChange={(e) =>
                        setSelected(
                          selectVisibleSuggestions(
                            selected,
                            [item],
                            e.target.checked,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <span className="ac-name">{item.label}</span>
                    <span className="ac-kind-badge">
                      {p.mode === "synonyms" ? "Synonym" : "Class"}
                    </span>
                    <div className="ac-inline-definition ac-clamp">
                      {item.definition}
                    </div>
                  </td>
                  <td className="ac-definition-col">
                    <div className="ac-clamp">{item.definition}</div>
                  </td>
                  {p.mode === "synonyms" && (
                    <td className="ac-distance-cell" title={distanceHelp}>
                      {item.distance}
                    </td>
                  )}
                  {p.mode === "synonyms" && (
                    <td className="ac-semantic-cell" title={semanticHelp}>
                      {item.semanticDistance === undefined
                        ? "…"
                        : item.semanticDistance.toFixed(3)}
                    </td>
                  )}
                  <td>
                    <span
                      className={"ac-status ac-" + item.status}
                      role="img"
                      aria-label={meta.word}
                      title={meta.word}
                    >
                      <SuggestionIcon name={meta.icon} />
                      <span className="ac-status-word" aria-hidden="true">
                        {meta.word}
                      </span>
                    </span>
                  </td>
                  <td>
                    <button
                      className="ac-expand"
                      aria-label={
                        (isOpen ? "Hide" : "Show") +
                        " details for " +
                        item.label
                      }
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? detailId : undefined}
                      onClick={() => toggleRow(item.id)}
                    >
                      <SuggestionIcon name="chev" />
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="ac-detail-row">
                    <td
                      colSpan={
                        (p.mode === "synonyms" ? 7 : 5) - (folded ? 1 : 0)
                      }
                    >
                      <div className="ac-detail" id={detailId}>
                        {item.reason && (
                          <div>
                            <h3>
                              {item.reasonTitle ??
                                (legacyParents
                                  ? "Why this parent matched"
                                  : `Why ${assistant} proposed these`)}
                            </h3>
                            <p>{item.reason}</p>
                          </div>
                        )}
                        <hr className="ac-rule" />
                        {p.renderDetails(item)}
                        {item.status !== "available" && (
                          <p className={"ac-status-note ac-" + item.status}>
                            <SuggestionIcon name={meta.icon} />
                            <span>
                              {item.status === "added"
                                ? wording.added
                                : item.issue}
                            </span>
                          </p>
                        )}
                        {item.status === "available" && (
                          <div>
                            <button
                              className="ac-btn ac-primary"
                              disabled={disabled}
                              onClick={() => void add([item.index])}
                            >
                              <SuggestionIcon name="plus" />
                              Add this {wording.singular}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
        {!visible.length && (
          <div className="ac-empty" role="status">
            <SuggestionIcon name="empty" />
            {entry?.state === "completed" ? (
              items.length ? (
                <>
                  <h2>No suggestions match this filter</h2>
                  <p>
                    {query.trim()
                      ? `Nothing in this run matches "${query.trim()}" under the current status filter.`
                      : "Nothing in this run has that status."}
                  </p>
                  <button
                    className="ac-btn"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                      search.current?.focus();
                    }}
                  >
                    Clear filter and search
                  </button>
                </>
              ) : (
                <>
                  <h2>{wording.empty}</h2>
                  <p>No changes were made.</p>
                </>
              )
            ) : (
              <p>
                {finishedStatus ||
                  (p.loading
                    ? "Loading history…"
                    : preparing
                      ? "Preparing suggestions…"
                      : !p.targetExists
                        ? `Right-click an entity and choose Suggest > ${wording.label} to begin. Earlier runs remain available in Run history.`
                        : wording.start)}
              </p>
            )}
          </div>
        )}
      </div>
      <footer className="ac-footer ac-band">
        <span className="ac-selection" role="status">
          {selectedItems.length ? (
            <>
              <b>{selectedItems.length}</b> of <b>{available.length}</b>{" "}
              available selected
            </>
          ) : (
            "No suggestions selected"
          )}
        </span>
        <span>
          {toast && (
            <span className="ac-toast" role="status">
              <SuggestionIcon name="check" />
              {toast}
            </span>
          )}
        </span>
        <div className="ac-fill" />
        <button
          className="ac-btn"
          disabled={!selectedItems.length || p.applying}
          onClick={() => setSelected(new Set())}
        >
          Clear selection
        </button>
        <button
          className="ac-btn ac-primary ac-btn-lg"
          disabled={disabled || !selectedItems.length}
          onClick={() => void add(selectedItems.map((item) => item.index))}
        >
          {p.applying
            ? "Adding…"
            : selectedItems.length
              ? `Add ${selectedItems.length} ${selectedItems.length === 1 ? wording.singular : wording.plural}`
              : `Add selected ${wording.plural}`}
        </button>
      </footer>
    </section>
  );
}
