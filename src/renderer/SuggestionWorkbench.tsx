import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  available: { word: "Available", icon: "+" },
  added: { word: "Added", icon: "✓" },
  exists: { word: "Exists", icon: "⧉" },
  unavailable: { word: "Unavailable", icon: "!" },
};

export function SuggestionWorkbench<T extends SuggestionItem>(
  p: SuggestionWorkbenchProps<T>,
) {
  const defaultSort: SuggestionSort =
    p.mode === "synonyms"
      ? { column: "distance", direction: "ascending" }
      : null;
  const [filter, setFilter] = useState<SuggestionFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SuggestionSort>(defaultSort);
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
  const disabled = p.applying || p.activity || !!p.blocked || !p.targetExists;
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
    setSort(defaultSort);
    setOverlay(null);
    setToast("");
  }, [p.runId, p.targetIri, p.mode]);
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
    if (!overlay) return;
    const trigger = overlayTrigger().current!;
    const doc = trigger.ownerDocument,
      win = doc.defaultView!;
    const place = () => {
      const r = trigger.getBoundingClientRect();
      const width = Math.min(620, win.innerWidth - 32);
      const below = win.innerHeight - r.bottom - 22;
      const maxHeight = Math.max(
        80,
        Math.min(win.innerHeight * 0.6, 520, below >= 180 ? below : r.top - 22),
      );
      setPosition({
        left: Math.max(
          16,
          Math.min(r.right - width, win.innerWidth - width - 16),
        ),
        top: below >= 180 ? r.bottom + 6 : Math.max(16, r.top - maxHeight - 6),
        maxHeight,
      });
    };
    place();
    popover.current?.focus();
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
    };
  }, [overlay]);

  const toggleRow = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const changeSort = (column: NonNullable<SuggestionSort>["column"]) =>
    setSort((previous) =>
      previous?.column !== column
        ? { column, direction: "ascending" }
        : previous.direction === "ascending"
          ? { column, direction: "descending" }
          : defaultSort,
    );
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
      aria-sort={sort?.column === column ? sort.direction : "none"}
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
          text
        )}
        <span aria-hidden="true">
          {sort?.column === column
            ? sort.direction === "ascending"
              ? "↑"
              : "↓"
            : "↕"}
        </span>
      </button>
    </th>
  );
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
            ‹
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
            ›
          </button>
        </div>
        <label className="ac-kind">
          <span className="ac-label">Suggest</span>
          <select
            aria-label="Suggestion type"
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
        </label>
        <label className="ac-assistant">
          <span className="ac-label">Assistant</span>
          <select
            aria-label="Taxonomy assistant"
            value={p.provider}
            disabled={p.activity || p.applying}
            onChange={(e) =>
              p.setProvider(e.target.value as "claude" | "codex")
            }
          >
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label className="ac-history">
          <span className="ac-label">Run</span>
          <select
            aria-label="Run history"
            value={nodeHistory.some((h) => h.id === p.runId) ? p.runId : ""}
            disabled={p.loading || p.applying}
            onChange={(e) => p.selectRun(e.target.value)}
          >
            <option value="">
              {p.loading ? "Loading history…" : "New run"}
            </option>
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
                  ? h.count + " suggestions · " + h.applied + " added"
                  : h.state}
              </option>
            ))}
          </select>
        </label>
        {p.navigation && (
          <button
            className="ac-another"
            aria-label="Open another view"
            title="Open another view"
            onClick={p.navigation.openAnother}
          >
            ⧉
          </button>
        )}
        <button
          className="primary ac-new"
          disabled={p.loading || p.activity || p.applying || !p.targetExists}
          onClick={() => {
            requested.current = true;
            void p.generate();
          }}
        >
          New run
        </button>
        {entry?.state === "completed" && (
          <button disabled={disabled} onClick={() => void p.generate(true)}>
            Run again
          </button>
        )}
      </div>
      <div className="ac-run ac-band">
        <h2 title={p.targetIri}>
          {wording.heading} <span>{p.name}</span>
        </h2>
        <p className="ac-peek" title={summary}>
          {summary}
        </p>
        {entry?.cache?.hit && (
          <p role="status">
            Cached result from{" "}
            {new Date(entry.cache.completedAt).toLocaleString()} ·{" "}
            {entry.cache.model ?? "Model not reported"}.
          </p>
        )}
        <div className="ac-overlays">
          {p.prompt && (
            <button
              ref={promptButton}
              aria-expanded={overlay === "prompt"}
              aria-controls={overlay === "prompt" ? id + "-overlay" : undefined}
              onClick={() => setOverlay(overlay === "prompt" ? null : "prompt")}
            >
              Prompt
            </button>
          )}
          <button
            ref={analysis}
            aria-expanded={overlay === "analysis"}
            aria-controls={overlay === "analysis" ? id + "-overlay" : undefined}
            disabled={!summary}
            onClick={() =>
              setOverlay(overlay === "analysis" ? null : "analysis")
            }
          >
            Analysis
          </button>
          <button
            ref={contextButton}
            aria-expanded={overlay === "context"}
            aria-controls={overlay === "context" ? id + "-overlay" : undefined}
            disabled={!p.context}
            onClick={() => setOverlay(overlay === "context" ? null : "context")}
          >
            Context
          </button>
        </div>
      </div>
      <div className="ac-tools ac-band">
        <div
          className="ac-filters"
          role="group"
          aria-label="Suggestion status filters"
        >
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
        <input
          type="search"
          className="ac-search"
          aria-label={
            "Filter suggestions by label or " +
            wording.description.toLowerCase()
          }
          placeholder="Filter suggestions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
        onScroll={() => setOverlay(null)}
        aria-busy={p.loading || p.applying || entry?.state === "running"}
      >
        <table className="ac-table" aria-label={wording.table}>
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
                      <span aria-hidden="true">{meta.icon}</span>
                      <span className="ac-status-word" aria-hidden="true">
                        {meta.word}
                      </span>
                    </span>
                  </td>
                  <td>
                    <button
                      className="ac-expand"
                      aria-label={"Details for " + item.label}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? detailId : undefined}
                      onClick={() => toggleRow(item.id)}
                    >
                      <span aria-hidden="true">›</span>
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="ac-detail-row">
                    <td colSpan={p.mode === "synonyms" ? 7 : 5}>
                      <div className="ac-detail" id={detailId}>
                        {item.reason && (
                          <div>
                            <h3>
                              {item.reasonTitle ??
                                (legacyParents
                                  ? "Why this parent matched"
                                  : `Why ${assistant} proposed this`)}
                            </h3>
                            <p>{item.reason}</p>
                          </div>
                        )}
                        {p.mode !== "synonyms" && (
                          <div>
                            <h3>Definition</h3>
                            <p>{item.definition}</p>
                          </div>
                        )}
                        {p.renderDetails(item)}
                        {item.status !== "available" && (
                          <p className={"ac-status-note ac-" + item.status}>
                            {item.status === "added"
                              ? wording.added
                              : item.issue}
                          </p>
                        )}
                        {item.status === "available" && (
                          <div>
                            <button
                              disabled={disabled}
                              onClick={() => void add([item.index])}
                            >
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
            {entry?.state === "completed" ? (
              items.length ? (
                <>
                  <strong>No suggestions match this filter</strong>
                  <p>
                    {query.trim()
                      ? `Nothing in this run matches "${query.trim()}" under the current status filter.`
                      : "Nothing in this run has that status."}
                  </p>
                  <button
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear filter and search
                  </button>
                </>
              ) : (
                <>
                  <strong>{wording.empty}</strong>
                  <p>No changes were made.</p>
                </>
              )
            ) : (
              <p>
                {p.loading
                  ? "Loading history…"
                  : p.activity
                    ? "Preparing suggestions…"
                    : !p.targetExists
                      ? `Right-click an entity and choose Suggest > ${wording.label} to begin. Earlier runs remain available in Run history.`
                      : wording.start}
              </p>
            )}
          </div>
        )}
      </div>
      <footer className="ac-footer ac-band">
        <span className="ac-selection" role="status">
          {selectedItems.length
            ? `${selectedItems.length} of ${available.length} available selected`
            : "No suggestions selected"}
        </span>
        <span className="ac-toast" role="status">
          {toast}
        </span>
        <button
          disabled={!selectedItems.length || p.applying}
          onClick={() => setSelected(new Set())}
        >
          Clear selection
        </button>
        <button
          className="primary"
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
      {overlay &&
        root.current &&
        createPortal(
          <div
            ref={popover}
            tabIndex={-1}
            id={id + "-overlay"}
            className="ac-popover"
            role="dialog"
            aria-label={overlayLabel}
            style={position}
          >
            <header>
              <h3>{overlayLabel}</h3>
              <button
                aria-label={
                  "Close " +
                  (overlay === "analysis"
                    ? "Analysis"
                    : overlay === "prompt"
                      ? "Prompt"
                      : "Context")
                }
                onClick={() => {
                  setOverlay(null);
                  overlayTrigger().current?.focus();
                }}
              >
                ×
              </button>
            </header>
            {overlay === "analysis" ? (
              <>
                {summary
                  .split(/\n\s*\n/)
                  .filter(Boolean)
                  .map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                {p.analysisContent}
              </>
            ) : overlay === "prompt" ? (
              p.prompt
            ) : (
              p.context
            )}
          </div>,
          root.current.ownerDocument.body,
        )}
    </section>
  );
}
