import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { command, request, setState, useSnapshot, state } from "./client";
import { progressiveSearch } from "./progressive-search";
import { useDelayedBusy } from "./use-delayed-busy";
import {
  findSynonymText,
  type FindSynonymResult,
} from "../shared/find-synonyms";
import type { Snapshot } from "../shared/protocol";
import { Modal } from "./Dialogs";
import { editEntity } from "./authoring";
import { revealInTaxonomy, revealInOpenTaxonomy } from "./taxonomy-navigation";
import { compactIri } from "../shared/terms";
import { kindLabel } from "../domain/model";
import { FindCreatePanel } from "./FindCreatePanel";
import { usePaneLayout } from "./AdaptivePane";
import { FindPopover } from "./FindPopover";
import "./find-editor.css";
import {
  defaultFindOptions,
  findKinds,
  type FindOptions,
  type FindResults,
  type FindRow,
} from "../shared/find";
import {
  findState,
  rememberFind,
  openSimilar,
  selectFind,
  updateFind,
  useFindState,
} from "./find-state";

function useFindResults(options: FindOptions) {
  const snapshot = useSnapshot()!;
  const consumer = useRef(crypto.randomUUID()).current;
  const key = JSON.stringify([
    options,
    snapshot.datasetEpoch,
    snapshot.version,
  ]);
  const [result, setResult] = useState<{
    key: string;
    epoch: number;
    options: FindOptions;
    data?: FindResults;
    error?: string;
  }>();
  useEffect(() => {
    return progressiveSearch<FindResults>(
      request,
      "find",
      { ...options, consumer, searchId: crypto.randomUUID() },
      (data) => setResult({ key, epoch: snapshot.datasetEpoch, options, data }),
      (error) =>
        setResult((previous) => ({
          key,
          epoch: snapshot.datasetEpoch,
          options:
            previous?.epoch === snapshot.datasetEpoch
              ? previous.options
              : options,
          data:
            previous?.epoch === snapshot.datasetEpoch
              ? previous.data
              : undefined,
          error: error.message,
        })),
    );
  }, [key]);
  const busy = result?.key !== key;
  // Keep a failed search's alert mounted until a successful replacement arrives.
  const error =
    result?.epoch === snapshot.datasetEpoch ? result.error : undefined;
  const announcing = useDelayedBusy(busy, key);
  return {
    // Retained rows are display-only until the current query/version completes.
    data: result?.epoch === snapshot.datasetEpoch ? result.data : undefined,
    facets: result?.epoch === snapshot.datasetEpoch ? result.data : undefined,
    error,
    busy,
    ready: !busy && !error && !!result?.data,
    announcing,
    key,
    displayedOptions: result?.options ?? options,
  };
}

export function FindDialog({ close }: { close: () => void }) {
  const snapshot = useSnapshot()!;
  const [text, setText] = useState(() => findState().options.text);
  const [selectedIri, setSelectedIri] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState<string>();
  const quickOptions = defaultFindOptions;
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const listId = useId();
  const { data, busy, ready, announcing, error, key } = useFindResults({
    ...quickOptions,
    text,
    limit: 6,
  });
  const rows = data?.rows ?? [];
  const selected = Math.max(
    0,
    rows.findIndex((row) => row.iri === selectedIri),
  );
  const highlight = (index: number) => {
    if (ready) setSelectedIri(rows[index]?.iri ?? "");
  };
  useEffect(() => {
    const field = input.current!;
    field.focus();
    field.select();
  }, []);
  useEffect(() => {
    input.current?.ownerDocument
      .getElementById(listId + "-" + selected)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const submit = async (chosen?: string) => {
    if (!text.trim() || submitting) return;
    if (!ready) {
      if (busy && chosen === undefined) setPendingSubmit(key);
      return;
    }
    const iri = chosen ?? rows[selected]?.iri ?? "";
    setPendingSubmit(undefined);
    setSubmitting(true);
    setSubmitError("");
    try {
      if (iri) {
        await request("select", {
          iri,
          datasetEpoch: snapshot.datasetEpoch,
          version: snapshot.version,
        });
        if (state?.datasetEpoch !== snapshot.datasetEpoch) return;
        revealInOpenTaxonomy(iri);
      }
      updateFind(
        {
          ...quickOptions,
          limit: findState().options.limit,
          text: text.trim(),
        },
        iri,
      );
      rememberFind();
      submitted.current = true;
      close();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => {
    if (pendingSubmit !== key) return;
    if (error) setPendingSubmit(undefined);
    else if (ready) void submit();
  }, [pendingSubmit, key, ready, error]);
  return (
    <Modal
      title="Find entities"
      close={close}
      onClosed={() => {
        if (submitted.current) setTimeout(() => command("view.find"), 0);
      }}
    >
      <form
        className="quick-find"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={input}
          autoFocus
          role="combobox"
          aria-label="Search entities"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={rows.length > 0}
          aria-activedescendant={
            rows[selected] ? listId + "-" + selected : undefined
          }
          maxLength={256}
          placeholder="Name, IRI or order reference"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSelectedIri("");
            setPendingSubmit(undefined);
            setSubmitError("");
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) {
              if (e.key === "Enter") e.preventDefault();
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              highlight(
                Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    selected + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
          }}
        />
        <div
          id={listId}
          role="listbox"
          aria-label="Matching entities"
          className="palette-results quick-find-matches"
          aria-busy={busy}
        >
          {rows.map((row, i) => (
            <button
              type="button"
              role="option"
              id={listId + "-" + i}
              key={row.iri}
              aria-selected={i === selected}
              disabled={!ready || submitting}
              tabIndex={-1}
              onMouseMove={() => highlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void submit(row.iri)}
              title={row.iri}
            >
              <span>{row.name}</span>
              <small>{kindLabel(row.kind)}</small>
            </button>
          ))}
        </div>
        <p className="muted" role="status">
          {announcing && text
            ? "Searching..."
            : error
              ? "Search unavailable. Edit the query to try again."
              : data?.total
                ? data.total.toLocaleString() +
                  (data.total === 1
                    ? " match. Enter to open results in Find."
                    : " matches. Enter to open results in Find.")
                : ready && text
                  ? "No matches. Edit the search or open Find to change its filters."
                  : "Type to search names, aliases and IRIs."}
        </p>
        {(error || submitError) && <p role="alert">{error || submitError}</p>}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            type="submit"
            disabled={!text.trim() || submitting || !!error}
          >
            Show results
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function FindPanel() {
  const layout = usePaneLayout();
  const queryInput = useRef<HTMLInputElement>(null);
  const scopeTrigger = useRef<HTMLButtonElement>(null);
  const recentTrigger = useRef<HTMLButtonElement>(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const scopeId = useId(),
    createId = useId();
  const pendingPageFocus = useRef<string | undefined>(undefined);
  const scopeVisible = !layout.compact || scopeOpen;
  const createOverlay = layout.shallow && createOpen;
  const { options, selected, recent, created } = useFindState();
  const searchOptions = { ...options, browse: true, diagnostics: true };
  const { data, facets, busy, ready, announcing, error, displayedOptions } =
    useFindResults(searchOptions);
  const [fieldFilter, setFieldFilter] = useState("");
  const fields = facets?.fields ?? [];
  const selectedFieldCount = options.fields.includes("*")
    ? fields.length
    : fields.filter((f) => options.fields.includes(f.id)).length;
  const filteredFields = fields.filter((f) =>
    (f.label + " " + f.id)
      .toLocaleLowerCase()
      .includes(fieldFilter.toLocaleLowerCase()),
  );
  const fieldSelected = (id: string) =>
    options.fields.includes("*") || options.fields.includes(id);
  const toggleField = (id: string, checked: boolean) => {
    const current = options.fields.includes("*")
      ? fields.map((f) => f.id)
      : options.fields;
    updateFind({
      fields: checked ? [...current, id] : current.filter((f) => f !== id),
    });
  };
  const snapshot = useSnapshot()!;
  const root = useRef<HTMLElement>(null);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [openingGraph, setOpeningGraph] = useState(false);
  const synonymText = findSynonymText(options.text);
  const [addingSynonym, setAddingSynonym] = useState("");
  const synonymPending = useRef(false);
  const [addedSynonyms, setAddedSynonyms] = useState(new Set<string>());
  const graphPending = useRef(false);
  const rows = data?.rows ?? [];
  const active = rows.find((row) => row.iri === selected);
  const [chrome, setChrome] = useState({
    header: true,
    pager: true,
    inspector: true,
  });
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const win = host.ownerDocument.defaultView!;
    const measure = (selector: string) =>
      host.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0;
    const update = () => {
      const next = { header: true, pager: true, inspector: true };
      if (layout.narrow && layout.shallow)
        Object.assign(next, { header: false, pager: false, inspector: false });
      else if (layout.shallow) {
        // Reserve three real rows, then withdraw supporting regions in priority order.
        // These are measured content requirements, not additional presentation thresholds.
        const available =
          layout.height -
          measure(".find-controls") -
          measure(".find-results thead") -
          3 * measure(".find-results tbody tr");
        const sizes = {
          header: measure(".find-results-toolbar"),
          pager: measure(".find-pagination"),
          inspector: measure(".find-inspector"),
        };
        let needed = sizes.header + sizes.pager + sizes.inspector + 8;
        for (const name of ["header", "pager", "inspector"] as const) {
          if (needed <= available) break;
          next[name] = false;
          needed -= sizes[name];
        }
      }
      setChrome((old) =>
        old.header === next.header &&
        old.pager === next.pager &&
        old.inspector === next.inspector
          ? old
          : next,
      );
    };
    const observer = new win.ResizeObserver(update);
    for (const selector of [
      ".find-controls",
      ".find-results-toolbar",
      ".find-pagination",
      ".find-inspector",
      ".find-results tbody tr",
    ]) {
      const element = host.querySelector(selector);
      if (element) observer.observe(element);
    }
    update();
    return () => observer.disconnect();
  }, [layout.width, layout.height, layout.mode, data]);
  const focusRow = (index: number) => {
    if (!ready || !rows[index]) {
      root.current?.querySelector<HTMLElement>(".find-results-scroll")?.focus();
      return;
    }
    selectFind(rows[index].iri);
    const row = root.current?.querySelectorAll<HTMLElement>(
      ".find-results tbody tr",
    )[index];
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  };
  const changePage = (next: number, keyboard = false) => {
    if (!ready) return;
    pendingPageFocus.current = keyboard
      ? JSON.stringify([
          { ...options, offset: next, revealIri: undefined },
          snapshot.datasetEpoch,
          snapshot.version,
        ])
      : undefined;
    updateFind({ offset: next });
  };
  useEffect(() => {
    const current = JSON.stringify([
      options,
      snapshot.datasetEpoch,
      snapshot.version,
    ]);
    if (pendingPageFocus.current !== current)
      pendingPageFocus.current = undefined;
    if (ready && pendingPageFocus.current === current) {
      pendingPageFocus.current = undefined;
      focusRow(0);
    }
  }, [ready, data, options, snapshot.datasetEpoch, snapshot.version]);
  const closeScope = () => {
    setScopeOpen(false);
    if (layout.compact) scopeTrigger.current?.focus();
    else queryInput.current?.focus();
  };
  const closeCreate = () => {
    setCreateOpen(false);
    root.current?.ownerDocument.defaultView?.requestAnimationFrame(() => {
      if (layout.shallow) createTrigger.current?.focus();
      else queryInput.current?.focus();
    });
  };
  // Capture focus before a presentation withdraws or relocates its DOM node.
  const focusBeforeLayout = root.current?.ownerDocument
    .activeElement as HTMLElement | null;
  useLayoutEffect(() => {
    const focused = focusBeforeLayout;
    if (layout.recovery) return;
    if (
      layout.compact &&
      root.current?.querySelector(".find-facets")?.contains(focused ?? null)
    ) {
      setScopeOpen(true);
      root.current?.ownerDocument.defaultView?.requestAnimationFrame(() =>
        focused?.focus(),
      );
      return;
    }
    if (
      layout.shallow &&
      root.current?.querySelector(".find-create")?.contains(focused ?? null)
    ) {
      setCreateOpen(true);
      root.current?.ownerDocument.defaultView?.requestAnimationFrame(() =>
        focused?.focus(),
      );
      return;
    }
    if (
      focused &&
      root.current?.contains(focused) &&
      (!focused.checkVisibility({ visibilityProperty: true }) ||
        focused.closest("[inert]"))
    )
      queryInput.current?.focus();
  }, [
    layout.mode,
    layout.recovery,
    chrome.header,
    chrome.pager,
    chrome.inspector,
  ]);
  const rowKeys = (
    event: KeyboardEvent<HTMLTableRowElement>,
    index: number,
  ) => {
    if (event.target !== event.currentTarget || !ready) return;
    const key = event.key;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "Enter",
        " ",
      ].includes(key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "ArrowUp" && index === 0) queryInput.current?.focus();
    else if (key === "ArrowUp") focusRow(index - 1);
    else if (key === "ArrowDown")
      focusRow(Math.min(rows.length - 1, index + 1));
    else if (key === "Home") focusRow(0);
    else if (key === "End") focusRow(rows.length - 1);
    else if (key === "PageUp" && options.offset > 0)
      changePage(Math.max(0, options.offset - options.limit), true);
    else if (
      key === "PageDown" &&
      data &&
      options.offset + options.limit < data.total
    )
      changePage(options.offset + options.limit, true);
    else if (key === "Enter") {
      selectFind(rows[index].iri);
      editEntity(rows[index].iri);
    } else if (key === " ") selectFind(rows[index].iri);
  };
  useEffect(() => {
    setActionError("");
    setMessage("");
    setAddedSynonyms(new Set());
  }, [snapshot.datasetEpoch]);
  useEffect(() => {
    setAddedSynonyms(new Set());
  }, [options.text]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    // Undo or an edit in another view can make a recently added term available.
    if (data)
      setAddedSynonyms(
        (previous) =>
          new Set(
            [...previous].filter(
              (iri) =>
                !data.rows.some(
                  (row) => row.iri === iri && row.synonym === "available",
                ),
            ),
          ),
      );
  }, [data]);
  useEffect(() => {
    root.current?.querySelector(".find-results-scroll")?.scrollTo({ top: 0 });
  }, [
    options.offset,
    options.text,
    options.kinds,
    options.fields,
    options.sort,
  ]);
  const run = (action: () => Promise<unknown>) => {
    setActionError("");
    setMessage("");
    void action().catch((e) => setActionError(e.message));
  };
  const choose = (iri: string) => {
    if (!ready) return;
    selectFind(iri);
    run(async () => {
      await request("select", {
        iri,
        datasetEpoch: snapshot.datasetEpoch,
        version: snapshot.version,
      });
      if (state?.datasetEpoch !== snapshot.datasetEpoch) return;
      revealInOpenTaxonomy(iri);
    });
  };
  const reveal = async (
    iri: string,
    label: string,
    acknowledgement: string,
  ) => {
    const epoch = snapshot.datasetEpoch;
    await request("select", { iri, datasetEpoch: epoch });
    if (state?.datasetEpoch !== epoch) return;
    updateFind(
      {
        text: label,
        fields: ["*"],
        kinds: [...findKinds],
        excludeIri: "",
        sort: "relevance",
        revealIri: iri,
      },
      iri,
    );
    setMessage(acknowledgement);
    revealInOpenTaxonomy(iri);
  };
  const addSynonym = (row: FindRow) => {
    if (
      !synonymText ||
      !ready ||
      row.synonym !== "available" ||
      synonymPending.current
    )
      return;
    const text = synonymText,
      epoch = snapshot.datasetEpoch;
    synonymPending.current = true;
    setAddingSynonym(row.iri);
    run(async () => {
      try {
        const result = await request<FindSynonymResult>("addFindSynonym", {
          iri: row.iri,
          text,
          datasetEpoch: epoch,
        });
        if (
          state?.datasetEpoch !== epoch ||
          findState().options.text.trim() !== text
        )
          return;
        setAddedSynonyms((previous) => new Set([...previous, row.iri]));
        setMessage(
          result.added
            ? `Added “${result.value}” as a synonym for ${row.name}.`
            : `“${result.value}” is already recorded for ${row.name}.`,
        );
      } finally {
        synonymPending.current = false;
        setAddingSynonym("");
      }
    });
  };
  const synonymButton = (row: FindRow | undefined, compact = false) => {
    if (!synonymText || !row?.synonym) return null;
    const added = addedSynonyms.has(row.iri),
      available = row.synonym === "available" && !added;
    const title = added
      ? `Added "${synonymText}" as rdfs:seeAlso`
      : row.synonym === "label"
        ? `"${synonymText}" already matches this entity's name`
        : row.synonym === "exists"
          ? `"${synonymText}" already exists as rdfs:seeAlso`
          : `Add "${synonymText}" as rdfs:seeAlso`;
    return (
      <button
        type="button"
        className={compact ? "find-synonym" : undefined}
        title={title}
        aria-label={
          available ? `Add "${synonymText}" as synonym for ${row.name}` : title
        }
        disabled={!ready || !!addingSynonym || !available}
        onClick={() => addSynonym(row)}
      >
        {addingSynonym === row.iri
          ? "Adding…"
          : added
            ? "Added"
            : !available
              ? "Exists"
              : compact
                ? "+ Add"
                : "Add as synonym"}
      </button>
    );
  };
  const graph = (fresh: boolean) => {
    if (!ready || !active) return;
    run(async () => {
      if (fresh) {
        const id = await request<string>("graphCreate", { iris: [active.iri] });
        command("view." + id);
      } else {
        await request("seed", { iris: [active.iri] });
        command("view.graph");
      }
      command("graph.fit");
    });
  };
  const graphResults = () => {
    if (!ready || !data?.total || graphPending.current) return;
    graphPending.current = true;
    setOpeningGraph(true);
    run(async () => {
      try {
        const id = await request<string>("graphCreate", {
          find: searchOptions,
          findResultId: data.resultId,
          datasetEpoch: snapshot.datasetEpoch,
          version: snapshot.version,
        });
        // IPC replies can arrive before the broadcast snapshot. Register the
        // new graph before opening its tab; the new canvas fits itself on mount.
        setState(await request<Snapshot>("state"));
        setMessage(
          `Sending ${data.total.toLocaleString()} entities to a new graph view`,
        );
        command("view." + id);
      } finally {
        graphPending.current = false;
        setOpeningGraph(false);
      }
    });
  };
  const offset = data?.offset ?? options.offset;
  const total = data?.total ?? 0;
  const storeTotal = data?.storeTotal ?? facets?.storeTotal ?? 0;
  const resetScope = () =>
    updateFind({
      fields: [...defaultFindOptions.fields],
      kinds: [...findKinds],
      excludeIri: "",
      sort: "relevance",
    });
  const allFields =
    options.fields.includes("*") ||
    (fields.length > 0 && selectedFieldCount === fields.length);
  const allTypes = options.kinds.length === findKinds.length;
  const defaultScope =
    options.fields.length === defaultFindOptions.fields.length &&
    defaultFindOptions.fields.every((f) => options.fields.includes(f)) &&
    allTypes &&
    options.sort === "relevance" &&
    !options.excludeIri;
  const scopeSummary = `${selectedFieldCount} of ${fields.length} fields, ${options.kinds.length} of ${findKinds.length} types`;
  const resetEveryFilter = () =>
    updateFind({
      fields: ["*"],
      kinds: [...findKinds],
      excludeIri: "",
      sort: "relevance",
    });
  const taxonomy =
    !!active &&
    [
      "Class",
      "Defined",
      "ObjectProperty",
      "DataProperty",
      "AnnotationProperty",
    ].includes(active.kind);
  return (
    <section
      ref={root}
      className="panel find-panel"
      data-panel="find"
      aria-label="Find entities results"
      data-layout={layout.mode}
      data-options-open={layout.compact && scopeOpen}
      data-create-open={createOverlay}
    >
      <form
        className="find-controls"
        onSubmit={(event) => {
          event.preventDefault();
          rememberFind();
        }}
      >
        <button
          type="button"
          ref={scopeTrigger}
          hidden={!layout.compact}
          className="find-scope-trigger"
          aria-label={`Options: ${scopeSummary}`}
          aria-expanded={scopeOpen}
          aria-controls={scopeId}
          onClick={() => {
            if (scopeOpen) closeScope();
            else {
              setScopeOpen(true);
              requestAnimationFrame(() =>
                root.current
                  ?.querySelector<HTMLElement>(
                    ".find-facets button, .find-facets input",
                  )
                  ?.focus(),
              );
            }
          }}
        >
          <span>Options</span>
          <span className="find-scope-ratios">
            {selectedFieldCount} of {fields.length} fields,{" "}
            {options.kinds.length} of {findKinds.length} types
          </span>
        </button>
        <div className="find-query">
          <input
            ref={queryInput}
            aria-label="Search the ontology"
            type="search"
            maxLength={256}
            placeholder="Search names, IRIs and annotations"
            value={options.text}
            onChange={(event) => {
              pendingPageFocus.current = undefined;
              updateFind({ text: event.target.value, excludeIri: "" });
            }}
            onBlur={rememberFind}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (options.text) updateFind({ text: "", excludeIri: "" });
                else focusRow(0);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                event.stopPropagation();
                if (event.altKey) {
                  rememberFind();
                  recentTrigger.current?.click();
                } else focusRow(0);
              }
            }}
          />
          <div className="find-input-actions">
            {options.text && (
              <button
                type="button"
                aria-label="Clear query"
                title="Clear query"
                onClick={() => {
                  updateFind({ text: "", excludeIri: "" });
                  queryInput.current?.focus();
                }}
              >
                ×
              </button>
            )}
            <FindPopover
              label="Recent searches"
              triggerRef={recentTrigger}
              face={<span aria-hidden="true">◷</span>}
            >
              {recent.length ? (
                recent.map((text) => (
                  <button
                    type="button"
                    key={text}
                    onClick={() => updateFind({ text, excludeIri: "" })}
                  >
                    {text}
                  </button>
                ))
              ) : (
                <p>No recent searches.</p>
              )}
            </FindPopover>
          </div>
        </div>
        <label className="find-sort" hidden={layout.narrow && layout.shallow}>
          <span className="find-sort-label" hidden={layout.compact}>
            Sort
          </span>
          <select
            aria-label="Sort results"
            value={options.sort === "iri" ? "type" : options.sort}
            onChange={(event) =>
              updateFind({ sort: event.target.value as FindOptions["sort"] })
            }
          >
            <option value="relevance">Best match</option>
            <option value="name">Name A to Z</option>
            <option value="name-desc">Name Z to A</option>
            <option value="type">Type</option>
          </select>
        </label>
        <FindPopover label="More">
          <label>
            Results per page
            <select
              aria-label="Results per page"
              value={options.limit}
              onChange={(event) => updateFind({ limit: +event.target.value })}
            >
              {[25, 50, 100, 200].map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </label>
          {active && (
            <div role="group" aria-label="Selected result actions">
              <strong>{active.name}</strong>
              <button
                type="button"
                disabled={!ready}
                onClick={() => editEntity(active.iri)}
              >
                Details
              </button>
              <button
                type="button"
                disabled={!ready || !taxonomy}
                onClick={() => revealInTaxonomy(active.iri)}
              >
                Find in taxonomy
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => openSimilar(active.name, active.iri)}
              >
                Find similar
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => graph(true)}
              >
                New graph
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => graph(false)}
              >
                Current graph
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() =>
                  run(async () => {
                    await window.axiom.copy(active.iri);
                    setMessage("IRI copied.");
                  })
                }
              >
                Copy IRI
              </button>
              <dl className="find-selected-details">
                <dt>IRI</dt>
                <dd>{active.iri}</dd>
                <dt>Ancestry</dt>
                <dd>{active.path ?? "no parent recorded"}</dd>
                <dt>Synonyms</dt>
                <dd>{active.aliases?.join(", ") || "none recorded"}</dd>
                <dt>Definition</dt>
                <dd>{active.description || "none recorded"}</dd>
              </dl>
            </div>
          )}
        </FindPopover>
      </form>
      <div className="find-workarea">
        <section
          id={scopeId}
          className="find-facets"
          aria-label="Search scope"
          hidden={!scopeVisible}
          onKeyDown={(event) => {
            if (event.key === "Escape" && scopeOpen) {
              event.preventDefault();
              event.stopPropagation();
              closeScope();
            }
          }}
        >
          <header className="find-scope-heading">
            <strong>Search scope</strong>
            {!defaultScope && (
              <button type="button" onClick={resetScope}>
                Reset filters
              </button>
            )}
            {scopeOpen && (
              <button type="button" onClick={closeScope}>
                Close Options
              </button>
            )}
          </header>
          <p className="find-scope-summary">{scopeSummary}</p>
          <fieldset className="find-type-facets">
            <legend>Entity types</legend>
            {findKinds.map((id) => {
              const facet = facets?.kinds.find((f) => f.id === id);
              const label =
                facet?.label ??
                {
                  classes: "Classes",
                  individuals: "Instances",
                  properties: "Properties",
                  other: "Other entities",
                }[id];
              return (
                <label key={id}>
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={options.kinds.includes(id)}
                    onChange={(event) =>
                      updateFind({
                        kinds: event.target.checked
                          ? [...options.kinds, id]
                          : options.kinds.filter((k) => k !== id),
                      })
                    }
                  />
                  {label}
                  <span>{facet?.count ?? 0}</span>
                </label>
              );
            })}
          </fieldset>
          <fieldset className="find-field-facets">
            <legend>Search fields</legend>
            <div className="find-facet-tools">
              <input
                type="search"
                aria-label="Filter search fields"
                placeholder="Filter fields"
                value={fieldFilter}
                onChange={(event) => setFieldFilter(event.target.value)}
              />
              <button
                type="button"
                onClick={() => updateFind({ fields: ["*"] })}
              >
                All fields
              </button>
              <button
                type="button"
                onClick={() => updateFind({ fields: ["name"] })}
              >
                Names only
              </button>
              <button type="button" onClick={() => updateFind({ fields: [] })}>
                Clear
              </button>
            </div>
            <div className="find-field-list">
              {filteredFields.map((field) => (
                <label
                  key={field.id}
                  title={`${field.id} · ${field.count.toLocaleString()} ${options.text.trim() ? "matches in this field" : "entities with a value"}`}
                >
                  <input
                    type="checkbox"
                    aria-label={field.label}
                    checked={fieldSelected(field.id)}
                    onChange={(event) =>
                      toggleField(field.id, event.target.checked)
                    }
                  />
                  <span>{field.label}</span>
                  <small>{field.count.toLocaleString()}</small>
                </label>
              ))}
              {!filteredFields.length && (
                <p className="muted">No field name contains that text.</p>
              )}
            </div>
            {!options.fields.length && (
              <p className="find-method">
                Select at least one field to search.
              </p>
            )}
          </fieldset>
        </section>
        <div
          className="find-matches"
          inert={(layout.compact && scopeOpen) || undefined}
          aria-hidden={(layout.compact && scopeOpen) || undefined}
        >
          <header
            className="find-results-toolbar"
            data-withdrawn={!chrome.header}
            inert={!chrome.header || undefined}
            aria-hidden={!chrome.header || undefined}
          >
            <div className="find-summary" role="status">
              {announcing
                ? "Searching..."
                : error
                  ? "Search unavailable"
                  : `${total.toLocaleString()} ${total === 1 ? "match" : "matches"} of ${storeTotal.toLocaleString()} entities`}
            </div>
            {total > 0 && (
              <button
                type="button"
                onClick={graphResults}
                disabled={!ready || openingGraph}
                aria-label="Open results in new graph"
                title="Open all filtered matches, across every page, with shared ancestry back to the roots"
              >
                <span aria-hidden="true">↗</span>
                <span className="find-graph-label" hidden={layout.compact}>
                  {openingGraph
                    ? "Opening graph..."
                    : "Open results in new graph"}
                </span>
              </button>
            )}
          </header>
          {(error || actionError) && (
            <p className="validation-error" role="alert">
              {error || actionError}
            </p>
          )}
          <div
            className="find-results-scroll"
            aria-busy={busy}
            tabIndex={-1}
            aria-label="Find results"
          >
            {(!data || rows.length > 0) && (
              <table className="find-results" aria-label="Found entities">
                <thead>
                  <tr>
                    <th scope="col">Entity</th>
                    <th
                      scope="col"
                      className="find-type-column"
                      hidden={layout.narrow && layout.shallow}
                    >
                      Type
                    </th>
                    <th
                      scope="col"
                      className="find-synonym-column"
                      hidden={layout.narrow}
                    >
                      Synonym
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.iri}
                      data-selected={selected === row.iri}
                      aria-selected={selected === row.iri}
                      tabIndex={
                        ready && (active ? selected === row.iri : index === 0)
                          ? 0
                          : -1
                      }
                      aria-disabled={!ready || undefined}
                      onClick={(event) => {
                        if (!(event.target as HTMLElement).closest("button"))
                          choose(row.iri);
                      }}
                      onKeyDown={(event) => rowKeys(event, index)}
                    >
                      <td>
                        <button
                          type="button"
                          className="find-result-name"
                          disabled={!ready}
                          tabIndex={-1}
                          aria-pressed={selected === row.iri}
                          onClick={() => choose(row.iri)}
                          onDoubleClick={() => editEntity(row.iri)}
                        >
                          {row.name}
                        </button>
                        <div
                          className="find-result-path"
                          title={row.path ?? "no parent recorded"}
                        >
                          <bdi>{row.path ?? "no parent recorded"}</bdi>
                        </div>
                        {row.matchedField &&
                          row.matchedField !== "iri" &&
                          (row.matchedField !== "name" ||
                            row.matchedValue !== row.name) && (
                            <p className="find-match-evidence">
                              <strong>
                                matched in{" "}
                                {fields.find(
                                  (field) => field.id === row.matchedField,
                                )?.label ??
                                  compactIri(
                                    row.matchedField,
                                    snapshot.ontology.namespace,
                                  )}
                              </strong>
                              : {row.matchedValue}
                            </p>
                          )}
                        <span
                          className="find-folded-type"
                          hidden={!(layout.narrow && layout.shallow)}
                        >
                          {kindLabel(row.kind)}
                        </span>
                        {layout.narrow && (
                          <div className="find-folded-synonyms">
                            <span className="find-row-synonyms">
                              <span className="sr-only">Synonyms: </span>
                              {row.aliases?.join(", ") || "none recorded"}
                            </span>
                            {synonymButton(row, true)}
                          </div>
                        )}
                      </td>
                      <td
                        className="find-type-column"
                        hidden={layout.narrow && layout.shallow}
                      >
                        {kindLabel(row.kind)}
                      </td>
                      {!layout.narrow && (
                        <td className="find-synonym-column">
                          <span className="find-row-synonyms">
                            {row.aliases?.join(", ") || "none recorded"}
                          </span>
                          {synonymButton(row, true)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data && !rows.length && (
              <fieldset className="find-zero" disabled={!ready}>
                <div hidden={createOverlay}>
                  <h2>
                    {allFields && allTypes
                      ? `No matches for "${displayedOptions.text}" anywhere in the ontology.`
                      : `No matches for "${displayedOptions.text}" in ${selectedFieldCount} of ${fields.length} fields.`}
                  </h2>
                  <p>
                    {scopeSummary} · {storeTotal.toLocaleString()} entities
                  </p>
                  <div
                    className="find-remedies"
                    role="group"
                    aria-label="Search remedies"
                  >
                    {data.remedies
                      ?.filter((remedy) =>
                        remedy.id === "fields"
                          ? !allFields
                          : remedy.id === "types"
                            ? !allTypes
                            : !allFields ||
                              !allTypes ||
                              !!options.excludeIri ||
                              options.sort !== "relevance",
                      )
                      .map((remedy) => (
                        <button
                          type="button"
                          key={remedy.id}
                          disabled={!remedy.count}
                          onClick={() =>
                            remedy.id === "fields"
                              ? updateFind({ fields: ["*"] })
                              : remedy.id === "types"
                                ? updateFind({ kinds: [...findKinds] })
                                : resetEveryFilter()
                          }
                        >
                          <span>
                            {remedy.id === "fields"
                              ? `Search all ${fields.length} fields`
                              : remedy.id === "types"
                                ? "Include all entity types"
                                : "Reset every filter"}
                          </span>
                          <span className="find-remedy-yield">
                            {remedy.count.toLocaleString()}{" "}
                            {remedy.count === 1 ? "match" : "matches"}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
                <button
                  ref={createTrigger}
                  type="button"
                  hidden={!layout.shallow || createOpen}
                  aria-expanded={createOpen}
                  aria-controls={createId}
                  onClick={() => {
                    setCreateOpen(true);
                    requestAnimationFrame(() =>
                      root.current
                        ?.querySelector<HTMLInputElement>(
                          '[aria-label="Class label"]',
                        )
                        ?.focus(),
                    );
                  }}
                >
                  Not in the ontology? Add it.
                </button>
                <div
                  id={createId}
                  className="find-create-host"
                  hidden={layout.shallow && !createOpen}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Escape" &&
                      createOpen &&
                      !event.defaultPrevented
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      closeCreate();
                    }
                  }}
                >
                  {createOpen && (
                    <button
                      type="button"
                      className="find-create-close"
                      onClick={closeCreate}
                    >
                      Back to results
                    </button>
                  )}
                  <FindCreatePanel storeTotal={storeTotal} reveal={reveal} />
                </div>
              </fieldset>
            )}
          </div>
          <footer
            className="find-footer"
            data-withdrawn={!chrome.pager && !chrome.inspector}
          >
            <div
              className="find-pagination"
              role="group"
              aria-label="Result pages"
              data-withdrawn={!chrome.pager}
              inert={!chrome.pager || undefined}
              aria-hidden={!chrome.pager || undefined}
            >
              <span hidden={layout.narrow}>
                {total
                  ? `${(offset + 1).toLocaleString()} to ${Math.min(total, offset + options.limit).toLocaleString()} of ${total.toLocaleString()}`
                  : "0 results"}
              </span>
              <button
                hidden={layout.narrow}
                disabled={!ready || offset === 0}
                onClick={() => changePage(0)}
                aria-label="First results page"
              >
                «
              </button>
              <button
                disabled={!ready || offset === 0}
                onClick={() => changePage(Math.max(0, offset - options.limit))}
                aria-label="Previous results page"
              >
                ‹
              </button>
              <span>
                Page {total ? Math.floor(offset / options.limit) + 1 : 0} of{" "}
                {Math.ceil(total / options.limit)}
              </span>
              <button
                disabled={!ready || offset + options.limit >= total}
                onClick={() => changePage(offset + options.limit)}
                aria-label="Next results page"
              >
                ›
              </button>
              <button
                hidden={layout.narrow}
                disabled={!ready || offset + options.limit >= total}
                onClick={() =>
                  changePage(
                    Math.max(0, Math.ceil(total / options.limit) - 1) *
                      options.limit,
                  )
                }
                aria-label="Last results page"
              >
                »
              </button>
            </div>
            <section
              className="find-inspector"
              aria-label="Selected entity"
              data-withdrawn={!chrome.inspector}
              inert={!chrome.inspector || undefined}
              aria-hidden={!chrome.inspector || undefined}
            >
              {active ? (
                <p
                  title={`${active.name} · ${kindLabel(active.kind)} · ${active.iri} · ${active.path ?? "no parent recorded"} · ${active.aliases?.join(", ") || "none recorded"} · ${active.description || "none recorded"}`}
                >
                  <strong>{active.name}</strong>
                  {created.includes(active.iri) && (
                    <span className="find-created"> created here</span>
                  )}{" "}
                  · {kindLabel(active.kind)} · {active.iri} ·{" "}
                  {active.path ?? "no parent recorded"} ·{" "}
                  {active.aliases?.join(", ") || "none recorded"} ·{" "}
                  {active.description || "none recorded"}
                </p>
              ) : (
                <p className="muted">Select a result to inspect it.</p>
              )}
            </section>
          </footer>
          {message && (
            <span className="find-message" role="status">
              {message}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
