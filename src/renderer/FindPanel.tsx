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
import { EntityExtend, focusEntityExtendTrigger } from "./EntityExtend";
import type { ExtendRelation } from "../shared/entity-extend";
import {
  emptyFindDraft,
  findCreationOffer,
  type FindCreationPreview,
  creationNoun,
} from "../shared/find-create";
import { useRetainedPreview } from "./use-retained-preview";
import { entityIdentifier } from "../shared/entity-names";
import { usePaneLayout } from "./AdaptivePane";
import { FindPopover } from "./FindPopover";
import "./find-editor.css";
import "./find-reference.css";
import { FindGlyph } from "./FindGlyph";
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
  openFindCreation,
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
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState("");
  const createReturnFocus = useRef<HTMLButtonElement | null>(null);
  const scopeId = useId(),
    createId = useId();
  const pendingPageFocus = useRef<string | undefined>(undefined);
  const scopeVisible = !layout.compact || scopeOpen;
  const { options, selected, recent, created, draft } = useFindState();
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
  const graphPending = useRef(false);
  const rows = data?.rows ?? [];
  const createOverlay = createOpen && (layout.shallow || rows.length > 0);
  const offerKey = JSON.stringify([
    synonymText,
    snapshot.datasetEpoch,
    snapshot.version,
  ]);
  const offerCheck = useRetainedPreview(
    synonymText && rows.length ? offerKey : null,
    String(snapshot.datasetEpoch),
    () =>
      request<FindCreationPreview>("findCreatePreview", {
        creation: {
          ...emptyFindDraft(synonymText),
          // Check the proposed name's IRI before the editor can disambiguate it.
          iri:
            snapshot.ontology.namespace +
            entityIdentifier(emptyFindDraft(synonymText).label),
        },
        datasetEpoch: snapshot.datasetEpoch,
        version: snapshot.version,
      }),
    100,
  );
  const offer = findCreationOffer(
    options.text,
    offerCheck.fresh ? (offerCheck.value?.collisions ?? []) : [],
  );
  const offerReady =
    ready &&
    offerCheck.fresh &&
    !offerCheck.value?.errors.length &&
    offer.enabled;
  const openResultCreation = () => {
    if (!offerReady) return;
    createReturnFocus.current = null;
    openFindCreation({ door: "header" });
    setCreateOpen(true);
    root.current?.ownerDocument.defaultView?.requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLInputElement>('[aria-label="Class label"]')
        ?.focus(),
    );
  };
  const openRelatedCreation = (
    row: FindRow,
    relation: ExtendRelation,
    trigger: HTMLButtonElement,
  ) => {
    if (!ready) return;
    createReturnFocus.current = trigger;
    openFindCreation({ door: relation.door, target: row.iri }, relation.kind);
    setCreateOpen(true);
    root.current?.ownerDocument.defaultView?.requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLInputElement>(
          '.find-create input[aria-label$=" label"]',
        )
        ?.focus(),
    );
  };
  useEffect(() => {
    setCreateOpen(false);
    setExtendOpen("");
  }, [options.text, snapshot.datasetEpoch]);
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
    const measure = (selector: string) => {
      const element = host.querySelector<HTMLElement>(selector);
      if (!element) return 0;
      // Withdrawn chrome is absolutely positioned, so it can wrap to a different
      // height than when it participates in the grid. Measure its natural grid
      // width to avoid alternating show/hide decisions at the fit boundary.
      const withdrawn = element.dataset.withdrawn;
      if (withdrawn === "true") element.dataset.withdrawn = "false";
      const height = element.offsetHeight;
      if (withdrawn === "true") element.dataset.withdrawn = withdrawn;
      return height;
    };
    const update = () => {
      const next = { header: true, pager: true, inspector: true };
      if (layout.shallow && (layout.narrow || !rows.length))
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
        // Selection must not withdraw a header or pager and shift the results.
        // Fit those first, then show the inspector only in the remaining space.
        let needed = sizes.header + sizes.pager + 8;
        for (const name of ["header", "pager"] as const) {
          if (needed <= available) break;
          next[name] = false;
          needed -= sizes[name];
        }
        next.inspector = needed + sizes.inspector <= available;
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
  }, [layout.width, layout.height, layout.mode, data, !!active]);
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
      if (
        createReturnFocus.current?.isConnected &&
        !createReturnFocus.current.disabled
      ) {
        focusEntityExtendTrigger(createReturnFocus.current);
        return;
      }
      if (rows.length && !chrome.header) moreTrigger.current?.focus();
      else if (layout.shallow || rows.length) createTrigger.current?.focus();
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
  }, [snapshot.datasetEpoch]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(timer);
  }, [message]);
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
    setCreateOpen(false);
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
      row.synonym === undefined ||
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
        setMessage(
          result.added
            ? `${result.value} added to ${row.name}`
            : `${row.name} already records ${result.value}`,
        );
      } finally {
        synonymPending.current = false;
        setAddingSynonym("");
      }
    });
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
  const scopeSummary = `${selectedFieldCount} of ${fields.length} fields, ${options.kinds.length} of ${findKinds.length} types`;
  const remedies =
    data?.remedies?.filter((remedy) =>
      remedy.id === "fields"
        ? !allFields
        : remedy.id === "types"
          ? !allTypes
          : !allFields ||
            !allTypes ||
            !!options.excludeIri ||
            options.sort !== "relevance",
    ) ?? [];
  const canWiden = remedies.some((remedy) => remedy.count > 0);
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
  const creationLabel = (iri: string) => {
    const entity = snapshot.entities.find((entity) => entity.iri === iri);
    return entity?.label || entity?.name || iri;
  };
  const creationParents = draft.parents
    .filter(Boolean)
    .map(creationLabel)
    .join(", ");
  const creationEditor = (
    <div
      id={createId}
      className="find-create-host"
      hidden={(layout.shallow || rows.length > 0) && !createOpen}
      onKeyDown={(event) => {
        if (event.key === "Escape" && createOpen && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          closeCreate();
        }
      }}
    >
      {createOpen && (
        <div className="extend-context">
          <button type="button" className="extend-back" onClick={closeCreate}>
            Back to results
          </button>
          {!draft.origin || draft.origin.door === "header" ? (
            <span>
              Adding <b>{options.text.trim()}</b> from your search
            </span>
          ) : draft.origin.door === "sibling" &&
            (draft.kind ?? "Class") === "Class" ? (
            <span>
              New <b>class</b>
              {`, sibling of ${creationLabel(draft.origin.target ?? "")}, under `}
              <b>{creationParents || "owl:Thing"}</b>
              {", asserted with "}
              <code>rdfs:subClassOf</code>
            </span>
          ) : (
            <span>
              New <b>{creationNoun(draft.kind ?? "Class")}</b>
              {`, ${(draft.kind ?? "Class") === "Class" ? "subclass" : draft.kind === "Individual" ? "instance" : "subproperty"} of `}
              <b>
                {creationParents ||
                  ((draft.kind ?? "Class") === "Class" ? "owl:Thing" : "…")}
              </b>
              {", asserted with "}
              <code>
                {(draft.kind ?? "Class") === "Class"
                  ? "rdfs:subClassOf"
                  : draft.kind === "Individual"
                    ? "rdf:type"
                    : "rdfs:subPropertyOf"}
              </code>
            </span>
          )}
        </div>
      )}
      <FindCreatePanel reveal={reveal} />
    </div>
  );
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
          className="find-scope-trigger btn scope-btn"
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
          <FindGlyph name="filter" />
          <span className="find-scope-ratios r">
            {`${selectedFieldCount}/${fields.length} · ${options.kinds.length}/${findKinds.length}`}
          </span>
        </button>
        <div className="find-query">
          <input
            ref={queryInput}
            aria-label="Search the ontology"
            type="search"
            maxLength={256}
            placeholder="Search the ontology"
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
                className="ib"
                type="button"
                aria-label="Clear query"
                title="Clear query"
                onClick={() => {
                  updateFind({ text: "", excludeIri: "" });
                  queryInput.current?.focus();
                }}
              >
                <FindGlyph name="close" />
              </button>
            )}
            <FindPopover
              label="Recent searches"
              triggerRef={recentTrigger}
              className="ib"
              face={<FindGlyph name="clock" />}
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
          <select
            className="sel sort"
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
        <FindPopover
          label="More"
          triggerRef={moreTrigger}
          className="ib"
          face={<FindGlyph name="more" />}
        >
          {!chrome.header && rows.length > 0 && offer.visible && (
            <button
              type="button"
              title={offerCheck.error || offer.title}
              disabled={!offerReady}
              onClick={openResultCreation}
            >
              {offer.title}
            </button>
          )}
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
          <div
            className="find-facet-tools"
            role="group"
            aria-label="Search field tools"
          >
            <input
              type="search"
              aria-label="Filter search fields"
              placeholder="Filter fields"
              value={fieldFilter}
              onChange={(event) => setFieldFilter(event.target.value)}
            />
            <button type="button" onClick={() => updateFind({ fields: ["*"] })}>
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
          inert={createOverlay || undefined}
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
            <span className="s">{scopeSummary}</span>
            <button type="button" className="btn" onClick={resetScope}>
              Reset filters
            </button>
            {scopeOpen && (
              <button type="button" onClick={closeScope}>
                Close Options
              </button>
            )}
          </header>
          <div className="find-type-facets">
            <h4>Entity types</h4>
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
                <label className="chk" key={id}>
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
                  <span className="n">{label}</span>
                  <span className={`c${facet?.count ? " hit" : ""}`}>
                    {facet?.count ?? 0}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="find-field-facets">
            <h4>Search fields</h4>
            <div className="find-field-list">
              {filteredFields.map((field) => (
                <label
                  className="chk"
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
                  <span className="n">{field.label}</span>
                  <small className={`c${field.count ? " hit" : ""}`}>
                    {field.count.toLocaleString()}
                  </small>
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
          </div>
        </section>
        <div
          className="find-matches"
          inert={(layout.compact && scopeOpen) || undefined}
          aria-hidden={(layout.compact && scopeOpen) || undefined}
        >
          <header
            className="find-results-toolbar"
            data-withdrawn={!chrome.header}
            inert={!chrome.header || createOverlay || undefined}
            aria-hidden={!chrome.header || createOverlay || undefined}
          >
            <div className="find-summary" role="status">
              {announcing
                ? "Searching..."
                : error
                  ? "Search unavailable"
                  : `${total.toLocaleString()} ${total === 1 ? "match" : "matches"} of ${storeTotal.toLocaleString()} entities`}
            </div>
            {total > 0 && (
              <span className="find-result-actions">
                {offer.visible && (
                  <button
                    ref={createTrigger}
                    type="button"
                    className="ib"
                    aria-label={offer.title}
                    title={offerCheck.error || offer.title}
                    disabled={!offerReady}
                    aria-expanded={createOpen}
                    aria-controls={createId}
                    onClick={openResultCreation}
                  >
                    <FindGlyph name="plus" />
                  </button>
                )}
                <button
                  className="btn"
                  type="button"
                  onClick={graphResults}
                  disabled={!ready || openingGraph}
                  aria-label="Open results in new graph"
                  title="Open all filtered matches, across every page, with shared ancestry back to the roots"
                >
                  <FindGlyph name="graph" />
                  <span className="find-graph-label" hidden={layout.compact}>
                    {openingGraph
                      ? "Opening graph..."
                      : "Open results in new graph"}
                  </span>
                </button>
              </span>
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
              <table
                className="find-results"
                aria-label="Found entities"
                inert={createOverlay || undefined}
                aria-hidden={createOverlay || undefined}
              >
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
                    <th scope="col" className="find-extend-column">
                      <span className="sr-only">Extend entity</span>
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
                        </td>
                      )}
                      <td className="find-extend-column">
                        <EntityExtend
                          row={row}
                          query={options.text}
                          narrow={layout.narrow}
                          ready={ready}
                          pending={!!addingSynonym}
                          open={extendOpen === row.iri}
                          setOpen={(open) =>
                            setExtendOpen((previous) =>
                              open
                                ? row.iri
                                : previous === row.iri
                                  ? ""
                                  : previous,
                            )
                          }
                          synonym={() => addSynonym(row)}
                          create={(relation, trigger) =>
                            openRelatedCreation(row, relation, trigger)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data && !rows.length && (
              <fieldset className="find-zero" disabled={!ready}>
                <div hidden={createOverlay}>
                  <h3>
                    {allFields && allTypes
                      ? "Nothing matched anywhere in the ontology."
                      : `Nothing matched in ${selectedFieldCount} of ${fields.length} fields.`}
                  </h3>
                  <p className="why">
                    {canWiden
                      ? "A miss inside a narrowed scope is not the same as an absence."
                      : "Widening the scope would not help."}
                  </p>
                  <div
                    className="find-remedies"
                    hidden={!canWiden}
                    role="group"
                    aria-label="Search remedies"
                  >
                    {remedies.map((remedy) => (
                      <button
                        className="find-remedy"
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
                              ? "Include every entity type"
                              : "Reset every filter"}
                        </span>
                        <span className="find-remedy-yield y">
                          {`${remedy.count.toLocaleString()} ${remedy.count === 1 ? "match" : "matches"}`}
                        </span>
                      </button>
                    ))}
                  </div>
                  <hr className="rule" />
                </div>
                <div
                  className="find-create-entry"
                  hidden={!layout.shallow || createOpen}
                >
                  <button
                    className="btn primary"
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
                    <FindGlyph name="plus" />
                    Add entity
                  </button>
                  <span>{`Carries "${displayedOptions.text.trim()}" across.`}</span>
                </div>
                {creationEditor}
              </fieldset>
            )}
            {rows.length > 0 && createOpen && (
              <fieldset className="find-zero" disabled={!ready}>
                {creationEditor}
              </fieldset>
            )}
          </div>
          <footer
            className="find-pagination"
            role="group"
            aria-label="Result pages"
            data-withdrawn={!chrome.pager}
            inert={!chrome.pager || createOverlay || undefined}
            aria-hidden={!chrome.pager || createOverlay || undefined}
          >
            <span>
              {total
                ? `${(offset + 1).toLocaleString()} to ${Math.min(total, offset + options.limit).toLocaleString()} of ${total.toLocaleString()}`
                : "0 results"}
            </span>
            <span className="find-page-spacer" />
            <button
              className="ib"
              disabled={!ready || offset === 0}
              onClick={() => changePage(0)}
              aria-label="First results page"
            >
              <FindGlyph name="first" />
            </button>
            <button
              className="ib"
              disabled={!ready || offset === 0}
              onClick={() => changePage(Math.max(0, offset - options.limit))}
              aria-label="Previous results page"
            >
              <FindGlyph name="prev" />
            </button>
            <span className="pg">
              {`Page ${total ? Math.floor(offset / options.limit) + 1 : 0} of ${Math.ceil(total / options.limit)}`}
            </span>
            <button
              className="ib"
              disabled={!ready || offset + options.limit >= total}
              onClick={() => changePage(offset + options.limit)}
              aria-label="Next results page"
            >
              <FindGlyph name="next" />
            </button>
            <button
              className="ib"
              disabled={!ready || offset + options.limit >= total}
              onClick={() =>
                changePage(
                  Math.max(0, Math.ceil(total / options.limit) - 1) *
                    options.limit,
                )
              }
              aria-label="Last results page"
            >
              <FindGlyph name="last" />
            </button>
          </footer>
          {message && (
            <span
              className="extend-confirmation"
              role="status"
              aria-live="polite"
            >
              {message}
            </span>
          )}
        </div>
      </div>
      {active && (
        <section
          className="find-inspector"
          aria-label="Selected entity"
          data-withdrawn={!chrome.inspector}
          inert={!chrome.inspector || createOverlay || undefined}
          aria-hidden={!chrome.inspector || createOverlay || undefined}
        >
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
        </section>
      )}
      <div className="find-store" hidden={layout.compact}>
        <span>
          {`${snapshot.classCount.toLocaleString()} classes · ${snapshot.individualCount.toLocaleString()} individuals · ${snapshot.tripleCount.toLocaleString()} triples`}
        </span>
        <button type="button" onClick={() => command("help.shortcuts")}>
          Shortcuts
        </button>
      </div>
    </section>
  );
}
