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
import { FindCreatePanel } from "./FindCreatePanel";
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
  const { options, selected, recent, created } = useFindState();
  const searchOptions = { ...options, browse: true, diagnostics: true };
  const { data, facets, busy, error } = useFindResults(searchOptions);
  const [fieldFilter, setFieldFilter] = useState("");
  const fields = facets?.fields ?? [];
  const selectedFieldCount = options.fields.includes("*") ? fields.length : fields.filter(f => options.fields.includes(f.id)).length;
  const filteredFields = fields.filter(f => (f.label + " " + f.id).toLocaleLowerCase().includes(fieldFilter.toLocaleLowerCase()));
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
  }, [snapshot.datasetEpoch]);
  useEffect(() => { setAddedSynonyms(new Set()); }, [options.text]);
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
    selectFind(iri);
    run(async () => {
      await request("select", { iri });
      revealInOpenTaxonomy(iri);
    });
  };
  const reveal = async (iri: string, label: string, acknowledgement: string) => {
    const epoch = snapshot.datasetEpoch;
    await request("select", { iri, datasetEpoch: epoch });
    if (state?.datasetEpoch !== epoch) return;
    updateFind({ text: label, fields: ["*"], kinds: [...findKinds], excludeIri: "", sort: "relevance", revealIri: iri }, iri);
    setMessage(acknowledgement);
    revealInOpenTaxonomy(iri);
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
          find: searchOptions,
          findResultId: data.resultId,
          datasetEpoch: snapshot.datasetEpoch,
          version: snapshot.version,
        });
        // IPC replies can arrive before the broadcast snapshot. Register the
        // new graph before opening its tab; the new canvas fits itself on mount.
        setState(await request<Snapshot>("state"));
        setMessage(`Sending ${data.total.toLocaleString()} entities to a new graph view`);
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
  const resetScope = () => updateFind({ fields: ["*"], kinds: [...findKinds], excludeIri: "", sort: "relevance" });
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
            aria-label="Search the ontology"
            type="search"
            maxLength={256}
            placeholder="Search names, IRIs and annotations"
            value={options.text}
            onChange={(e) =>
              updateFind({ text: e.target.value, excludeIri: "" })
            }
            onBlur={rememberFind}
          />
          <button
            type="button"
            onClick={() => updateFind({ text: "", excludeIri: "" })}
            aria-label="Clear query"
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
              value={options.sort === "iri" ? "type" : options.sort}
              onChange={(e) =>
                updateFind({ sort: e.target.value as FindOptions["sort"] })
              }
            >
              <option value="relevance">Best match</option>
              <option value="name">Name A to Z</option>
              <option value="name-desc">Name Z to A</option>
              <option value="type">Type</option>
            </select>
          </label>
          <button
            type="button"
            onClick={resetScope}
          >
            Reset filters
          </button>
        </div>
      </form>
      <div className="find-workarea">
        <details className="find-facets" open>
          <summary>
            Search scope: {selectedFieldCount} of {fields.length} fields, {options.kinds.length} of {findKinds.length} types
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
                Clear
              </button>
            </div>
            <div className="find-field-list">
              {filteredFields
                .map((f) => (
                  <label
                    key={f.id}
                    title={
                      f.id +
                      " · " +
                      f.count.toLocaleString() +
                      (options.text.trim() ? " matches in this field" : " entities with a value")
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
              {!filteredFields.length && <p className="muted">No field name contains that text.</p>}
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
                : `${total.toLocaleString()} ${total === 1 ? "match" : "matches"} of ${storeTotal.toLocaleString()} entities`}
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
            {(!data || rows.length > 0) && <table className="find-results" aria-label="Found entities">
              <thead>
                <tr>
                  <th scope="col">Entity</th>
                  <th scope="col">Type</th>
                    <th scope="col" className="find-synonym-column">
                      Synonym
                    </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.iri} data-selected={selected === row.iri} aria-selected={selected === row.iri} tabIndex={0}
                    onKeyDown={event => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); choose(row.iri); }
                    }}>
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
                      <div className="find-result-path" title={row.iri}>
                        {row.path ?? "no parent recorded"}
                      </div>
                      {row.matchedField && !["name", "iri"].includes(row.matchedField) && (
                        <p className="find-match-evidence">
                          <strong>matched in {" "}
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
                    </td>
                    <td>{kindLabel(row.kind)}</td>
                    <td><span className="find-row-synonyms">{row.aliases?.join(", ") || "none recorded"}</span>{synonymButton(row, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
            {!busy && data && !rows.length && <div className="find-zero">
              <h2>No matches for “{options.text}”</h2>
              <p>Searched {selectedFieldCount} of {fields.length} fields across {options.kinds.length} of {findKinds.length} entity types, in {storeTotal.toLocaleString()} entities. A miss inside a narrowed scope is not the same as an absence.</p>
              <p className="muted">{data.emptyCause === "filters" ? "The current scope excludes the matching entities." : "The query has no matches in the current scope."}</p>
              <section className="find-remedies" aria-label="Widen the search first">
                <h3>Widen the search first</h3>
                {data.remedies?.map(remedy => <button type="button" key={remedy.id} disabled={!remedy.count}
                  onClick={() => remedy.id === "fields" ? updateFind({ fields: ["*"] }) : remedy.id === "types" ? updateFind({ kinds: [...findKinds] }) : resetScope()}>
                  <span>{remedy.id === "fields" ? `Search all ${fields.length} fields` : remedy.id === "types" ? "Include all entity types" : "Reset every filter"}</span>
                  <span className="find-remedy-yield">{remedy.count.toLocaleString()} {remedy.count === 1 ? "match" : "matches"}</span>
                </button>)}
              </section>
              <FindCreatePanel storeTotal={storeTotal} reveal={reveal} />
            </div>}
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
            Page {total ? Math.floor(offset / options.limit) + 1 : 0} of{" "}
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
            {[...new Set([10, 25, 50, options.limit])].sort((a,b) => a-b).map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
        <section className="find-inspector" aria-label="Selected entity">
          {!active ? <p className="muted">Select a result to inspect it.</p> : <dl>
            <dt>Label</dt><dd>{active.name} {created.includes(active.iri) && <span className="find-created">created here</span>}</dd>
            <dt>Type</dt><dd>{kindLabel(active.kind)}</dd>
            <dt>IRI</dt><dd><code>{active.iri}</code></dd>
            <dt>Ancestry</dt><dd>{active.path ?? "no parent recorded"}</dd>
            <dt>Synonyms</dt><dd>{active.aliases?.join(", ") || "none recorded"}</dd>
            <dt>Definition</dt><dd>{active.description || "none recorded"}</dd>
          </dl>}
        <div className="find-actions" aria-label="Selected result actions">
          <span className="find-selected">
            {active?.name}
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
        </section>
        {message && <span role="status">{message}</span>}
      </footer>
    </section>
  );
}
