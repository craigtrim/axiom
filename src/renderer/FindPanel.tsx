import { useEffect, useId, useRef, useState } from "react";
import { command, request, useSnapshot } from "./client";
import { Modal } from "./Dialogs";
import { editEntity } from "./authoring";
import { revealInTaxonomy } from "./taxonomy-navigation";
import { kindLabel } from "../domain/model";
import {
  defaultFindOptions,
  type FindOptions,
  type FindResults,
} from "../shared/find";
import {
  findState,
  rememberFind,
  selectFind,
  updateFind,
  useFindState,
} from "./find-state";

function useFindResults(options: FindOptions) {
  const snapshot = useSnapshot()!;
  const key = JSON.stringify([
    options,
    snapshot.datasetEpoch,
    snapshot.version,
  ]);
  const [result, setResult] = useState<{
    key: string;
    data?: FindResults;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void request<FindResults>("find", { ...options })
        .then((data) => {
          if (active) setResult({ key, data });
        })
        .catch((error) => {
          if (active) setResult({ key, error: error.message });
        });
    }, 90);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    busy: result?.key !== key,
  };
}

export function FindDialog({ close }: { close: () => void }) {
  const [text, setText] = useState(() => findState().options.text);
  const [selected, setSelected] = useState(0);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const listId = useId();
  const { data, busy, error } = useFindResults({
    ...defaultFindOptions,
    text,
    limit: 6,
  });
  const rows = data?.rows ?? [];
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
      if (iri) await request("select", { iri });
      updateFind({ ...defaultFindOptions, text: text.trim() }, iri);
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
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) {
              if (e.key === "Enter") e.preventDefault();
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((n) =>
                Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    n + (e.key === "ArrowDown" ? 1 : -1),
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
              onMouseMove={() => setSelected(i)}
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
  const { data, busy, error } = useFindResults(options);
  const snapshot = useSnapshot()!;
  const root = useRef<HTMLElement>(null);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const rows = data?.rows ?? [];
  const active = rows.find((row) => row.iri === selected);
  useEffect(() => {
    setActionError("");
    setMessage("");
  }, [snapshot.datasetEpoch]);
  useEffect(() => {
    root.current?.querySelector(".find-results-scroll")?.scrollTo({ top: 0 });
  }, [options.offset, options.text, options.kind, options.sort]);
  const run = (action: () => Promise<unknown>) => {
    setActionError("");
    setMessage("");
    void action().catch((e) => setActionError(e.message));
  };
  const choose = (iri: string) => {
    selectFind(iri);
    run(() => request("select", { iri }));
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
            onChange={(e) => updateFind({ text: e.target.value })}
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
              onChange={(e) => updateFind({ text: e.target.value })}
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
            Type
            <select
              aria-label="Entity type"
              value={options.kind}
              onChange={(e) =>
                updateFind({ kind: e.target.value as FindOptions["kind"] })
              }
            >
              <option value="all">All entities</option>
              <option value="classes">Classes</option>
              <option value="individuals">Individuals</option>
              <option value="properties">Properties</option>
            </select>
          </label>
          <label>
            Search in
            <select
              aria-label="Search in"
              value={options.field}
              onChange={(e) =>
                updateFind({ field: e.target.value as FindOptions["field"] })
              }
            >
              <option value="all">Names and IRIs</option>
              <option value="name">Names and aliases</option>
              <option value="iri">IRIs</option>
            </select>
          </label>
          <label>
            Match
            <select
              aria-label="Match mode"
              value={options.match}
              onChange={(e) =>
                updateFind({ match: e.target.value as FindOptions["match"] })
              }
            >
              <option value="words">All words / type-ahead</option>
              <option value="phrase">Contains phrase</option>
              <option value="exact">Exact</option>
            </select>
          </label>
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
      <div className="find-summary" role="status">
        {busy
          ? "Searching..."
          : options.text.trim()
            ? total.toLocaleString() + (total === 1 ? " match" : " matches")
            : "Type a name, IRI or order reference to find entities."}
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
                  {row.description && (
                    <p className="find-result-description">{row.description}</p>
                  )}
                </td>
                <td>{kindLabel(row.kind)}</td>
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
        </div>
        {message && <span role="status">{message}</span>}
      </footer>
    </section>
  );
}
