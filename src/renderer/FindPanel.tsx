import { useEffect, useId, useRef, useState } from "react";
import { command, request, setState, useSnapshot, state } from "./client";
import { progressiveSearch } from "./progressive-search";
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
  const queryKey = JSON.stringify([options, snapshot.datasetEpoch]);
  const key = JSON.stringify([
    options,
    snapshot.datasetEpoch,
    snapshot.version,
  ]);
  const [result, setResult] = useState<{
    key: string;
    queryKey: string;
    epoch: number;
    data?: FindResults;
    error?: string;
  }>();
  useEffect(() => {
    return progressiveSearch<FindResults>(
      request,
      "find",
      { ...options, consumer, searchId: crypto.randomUUID() },
      (data) =>
        setResult({ key, queryKey, epoch: snapshot.datasetEpoch, data }),
      (error) =>
        setResult({
          key,
          queryKey,
          epoch: snapshot.datasetEpoch,
          error: error.message,
        }),
    );
  }, [key]);
  return {
    // Keep this query's rows in place while an ontology edit refreshes them.
    data: result?.queryKey === queryKey ? result.data : undefined,
    facets: result?.epoch === snapshot.datasetEpoch ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    busy: result?.key !== key,
  };
}

export function FindDialog({ close }: { close: () => void }) {
  const [text, setText] = useState(() => findState().options.text);
  const [selected, setSelected] = useState(0);
  const quickOptions = defaultFindOptions;
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const listId = useId();
  const { data, busy, error } = useFindResults({
    ...quickOptions,
    text,
    limit: 6,
  });
  const rows = data?.rows ?? [];
  const selectedIri = useRef("");
  useEffect(() => {
    const index = rows.findIndex((row) => row.iri === selectedIri.current);
    if (index >= 0) setSelected(index);
  }, [data]);
  const highlight = (index: number) => {
    selectedIri.current = rows[index]?.iri ?? "";
    setSelected(index);
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
  const submit = async (iri = rows[selected]?.iri ?? "") => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      if (iri) {
        await request("select", { iri });
        revealInOpenTaxonomy(iri);
      }
      updateFind({ ...quickOptions, text: text.trim() }, iri);
      rememberFind();
      submitted.current = true;
      close();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
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
            selectedIri.current = "";
            setSelected(0);
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
        >
          {rows.map((row, i) => (
            <button
              type="button"
              role="option"
              id={listId + "-" + i}
              key={row.iri}
              aria-selected={i === selected}
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
          {busy && text
            ? "Searching..."
            : data?.total
              ? data.total.toLocaleString() +
                (data.total === 1
                  ? " match. Enter to open results in Find."
                  : " matches. Enter to open results in Find.")
              : text
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
            disabled={!text.trim() || submitting}
          >
            Show results
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function FindPanel() {
  const { options, selected, recent } = useFindState();
  const { data, facets, busy, error } = useFindResults(options);
  const [fieldFilter, setFieldFilter] = useState("");
  const fields = facets?.fields ?? [];
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
  useEffect(() => {
    setActionError("");
    setMessage("");
    setAddedSynonyms(new Set());
  }, [snapshot.datasetEpoch, options.text]);
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
    selectFind(iri);
    run(async () => {
      await request("select", { iri });
      revealInOpenTaxonomy(iri);
    });
  };
  const addSynonym = (row: FindRow) => {
    if (
      !synonymText ||
      busy ||
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
        disabled={busy || !!addingSynonym || !available}
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
    if (!active) return;
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
    if (busy || !data?.total || graphPending.current) return;
    graphPending.current = true;
    setOpeningGraph(true);
    run(async () => {
      try {
        const id = await request<string>("graphCreate", {
          find: options,
          findResultId: data.resultId,
          datasetEpoch: snapshot.datasetEpoch,
          version: snapshot.version,
        });
        // IPC replies can arrive before the broadcast snapshot. Register the
        // new graph before opening its tab; the new canvas fits itself on mount.
        setState(await request<Snapshot>("state"));
        command("view." + id);
      } finally {
        graphPending.current = false;
        setOpeningGraph(false);
      }
    });
  };
  const offset = data?.offset ?? options.offset;
  const total = data?.total ?? 0;
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
    >
      <form
        className="find-controls"
        onSubmit={(e) => {
          e.preventDefault();
          rememberFind();
        }}
      >
        <div className="find-query">
          <input
            aria-label="Find text"
            type="search"
            maxLength={256}
            placeholder="Name, IRI or order reference"
            value={options.text}
            onChange={(e) =>
              updateFind({ text: e.target.value, excludeIri: "" })
            }
            onBlur={rememberFind}
          />
          <button
            type="button"
            onClick={() => updateFind({ ...defaultFindOptions })}
            disabled={!options.text}
          >
            Clear
          </button>
          {recent.length > 0 && (
            <select
              aria-label="Recent searches"
              value=""
              onChange={(e) =>
                updateFind({ text: e.target.value, excludeIri: "" })
              }
            >
              <option value="" disabled>
                Recent searches
              </option>
              {recent.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="find-filters">
          <label>
            Sort
            <select
              aria-label="Sort results"
              value={options.sort}
              onChange={(e) =>
                updateFind({ sort: e.target.value as FindOptions["sort"] })
              }
            >
              <option value="relevance">Best match</option>
              <option value="name">Name A to Z</option>
              <option value="name-desc">Name Z to A</option>
              <option value="iri">IRI</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              updateFind({ ...defaultFindOptions, text: options.text })
            }
          >
            Reset filters
          </button>
        </div>
      </form>
      <div className="find-workarea">
        <details className="find-facets" open>
          <summary>
            Search scope ·{" "}
            {options.fields.includes("*")
              ? "All fields"
              : options.fields.length +
                (options.fields.length === 1 ? " field" : " fields")}
          </summary>
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
                    onChange={(e) =>
                      updateFind({
                        kinds: e.target.checked
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
                onChange={(e) => setFieldFilter(e.target.value)}
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
                Clear fields
              </button>
            </div>
            <div className="find-field-list">
              {fields
                .filter((f) =>
                  (f.label + " " + f.id)
                    .toLocaleLowerCase()
                    .includes(fieldFilter.toLocaleLowerCase()),
                )
                .map((f) => (
                  <label
                    key={f.id}
                    title={
                      f.id +
                      " · " +
                      f.count.toLocaleString() +
                      " entities with this field"
                    }
                  >
                    <input
                      type="checkbox"
                      aria-label={f.label}
                      checked={fieldSelected(f.id)}
                      onChange={(e) => toggleField(f.id, e.target.checked)}
                    />
                    <span>{f.label}</span>
                    <small>{f.count.toLocaleString()}</small>
                  </label>
                ))}
            </div>
            {!options.fields.length && (
              <p className="find-method">
                Select at least one field to search.
              </p>
            )}
          </fieldset>
        </details>
        <div className="find-matches">
          <div className="find-results-toolbar">
            <div className="find-summary" role="status">
              {busy
                ? "Searching..."
                : options.text.trim()
                  ? total.toLocaleString() +
                    (total === 1 ? " match" : " matches")
                  : "Type a name, IRI or order reference to find entities."}
            </div>
            <button
              type="button"
              onClick={graphResults}
              disabled={busy || !total || openingGraph}
              title="Open all filtered matches, across every page, with shared ancestry back to the roots"
            >
              {openingGraph ? "Opening graph..." : "Open results in new graph"}
            </button>
          </div>
          {(error || actionError) && (
            <p className="validation-error" role="alert">
              {error || actionError}
            </p>
          )}
          <div className="find-results-scroll" aria-busy={busy}>
            <table className="find-results" aria-label="Found entities">
              <thead>
                <tr>
                  <th scope="col">Entity</th>
                  <th scope="col">Type</th>
                  {synonymText && (
                    <th scope="col" className="find-synonym-column">
                      Synonym
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.iri} data-selected={selected === row.iri}>
                    <td>
                      <button
                        type="button"
                        className="find-result-name"
                        aria-pressed={selected === row.iri}
                        onClick={() => choose(row.iri)}
                        onDoubleClick={() => editEntity(row.iri)}
                      >
                        {row.name}
                      </button>
                      <div className="find-result-iri" title={row.iri}>
                        {row.iri}
                      </div>
                      {row.matchedField && (
                        <p className="find-match-evidence">
                          <strong>
                            {fields.find((f) => f.id === row.matchedField)
                              ?.label ??
                              compactIri(
                                row.matchedField,
                                snapshot.ontology.namespace,
                              )}
                          </strong>
                          : {row.matchedValue}
                        </p>
                      )}
                      {row.description && (
                        <p className="find-result-description">
                          {row.description}
                        </p>
                      )}
                    </td>
                    <td>{kindLabel(row.kind)}</td>
                    {synonymText && <td>{synonymButton(row, true)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && !rows.length && options.text.trim() && (
              <p className="find-empty">
                No matches. Try fewer words or reset the filters.
              </p>
            )}
          </div>
        </div>
      </div>
      <footer className="find-footer">
        <div className="find-pagination" aria-label="Result pages">
          <span>
            {total
              ? (offset + 1).toLocaleString() +
                " to " +
                Math.min(total, offset + options.limit).toLocaleString() +
                " of " +
                total.toLocaleString()
              : "0 results"}
          </span>
          <button
            disabled={busy || offset === 0}
            onClick={() => updateFind({ offset: 0 })}
            aria-label="First results page"
          >
            «
          </button>
          <button
            disabled={busy || offset === 0}
            onClick={() =>
              updateFind({ offset: Math.max(0, offset - options.limit) })
            }
            aria-label="Previous results page"
          >
            ‹
          </button>
          <span>
            Page {total ? Math.floor(offset / options.limit) + 1 : 0} /{" "}
            {Math.ceil(total / options.limit)}
          </span>
          <button
            disabled={busy || offset + options.limit >= total}
            onClick={() => updateFind({ offset: offset + options.limit })}
            aria-label="Next results page"
          >
            ›
          </button>
          <button
            disabled={busy || offset + options.limit >= total}
            onClick={() =>
              updateFind({
                offset:
                  Math.max(0, Math.ceil(total / options.limit) - 1) *
                  options.limit,
              })
            }
            aria-label="Last results page"
          >
            »
          </button>
          <select
            aria-label="Results per page"
            value={options.limit}
            onChange={(e) => updateFind({ limit: +e.target.value })}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
        <div className="find-actions" aria-label="Selected result actions">
          <span className="find-selected">
            {active?.name ?? "Select a result"}
          </span>
          {active && (
            <>
              <button
                disabled={!active}
                onClick={() => active && editEntity(active.iri)}
              >
                Details
              </button>
              <button
                disabled={!taxonomy}
                onClick={() => active && revealInTaxonomy(active.iri)}
              >
                Find in taxonomy
              </button>
              <button
                disabled={!active}
                onClick={() => active && openSimilar(active.name, active.iri)}
              >
                Find similar
              </button>
              {synonymButton(active)}
              <button disabled={!active} onClick={() => graph(true)}>
                New graph
              </button>
              <button disabled={!active} onClick={() => graph(false)}>
                Current graph
              </button>
              <button
                disabled={!active}
                onClick={() =>
                  active &&
                  run(async () => {
                    await window.axiom.copy(active.iri);
                    setMessage("IRI copied.");
                  })
                }
              >
                Copy IRI
              </button>
            </>
          )}
        </div>
        {message && <span role="status">{message}</span>}
      </footer>
    </section>
  );
}
