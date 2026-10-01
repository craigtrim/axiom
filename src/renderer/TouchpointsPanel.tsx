import { useEffect, useRef, useState } from "react";
import { NS, shorten } from "../domain/model";
import {
  suggestedTouchpointPredicate,
  touchpointObject,
  touchpointPredicates,
  type TouchpointContext,
  type TouchpointObject,
  type TouchpointResponse,
  type TouchpointSelection,
} from "../shared/touchpoints";
import { request, useSnapshot } from "./client";
import "./touchpoints.css";

export function TouchpointsPanel() {
  const snapshot = useSnapshot()!;
  const [context, setContext] = useState<TouchpointContext>();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<TouchpointResponse>();
  const [selected, setSelected] = useState<Record<string, TouchpointSelection>>(
    {},
  );
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const ticket = useRef(0),
    reserved = useRef(false);
  useEffect(() => {
    const current = ++ticket.current;
    reserved.current = false;
    setContext(undefined);
    setQuery("");
    setResponse(undefined);
    setSelected({});
    setError("");
    setMessage("");
    setBusy(false);
    setApplying(false);
    if (!snapshot.selected) return;
    void request<TouchpointContext>("touchpointContext", {
      iri: snapshot.selected,
    })
      .then((value) => {
        if (ticket.current !== current) return;
        setContext(value);
        setQuery(value.label);
      })
      .catch((e) => {
        if (ticket.current === current) setError((e as Error).message);
      });
    return () => {
      ++ticket.current;
    };
  }, [snapshot.selected, snapshot.datasetEpoch]);
  const stale =
    !!response &&
    (response.context.version !== snapshot.version ||
      response.context.datasetEpoch !== snapshot.datasetEpoch);
  const run = async (refresh = false) => {
    if (!context || reserved.current || !query.trim()) return;
    reserved.current = true;
    const current = ++ticket.current;
    setBusy(true);
    setError("");
    setMessage("");
    setSelected({});
    try {
      const value = await window.axiom.touchpoints.search({
        iri: context.iri,
        query,
        refresh,
      });
      if (ticket.current !== current) return;
      setResponse(value);
      setContext(value.context);
      setError(value.error?.message ?? "");
    } catch (e) {
      if (ticket.current === current) setError((e as Error).message);
    } finally {
      if (ticket.current === current) {
        reserved.current = false;
        setBusy(false);
      }
    }
  };
  const apply = async () => {
    if (!response || reserved.current || stale || !Object.keys(selected).length)
      return;
    reserved.current = true;
    const current = ticket.current;
    setApplying(true);
    setError("");
    try {
      const count = await window.axiom.touchpoints.apply(
        response.token,
        Object.values(selected),
      );
      const next = await request<TouchpointContext>("touchpointContext", {
        iri: response.context.iri,
      });
      if (ticket.current !== current) return;
      setContext(next);
      setResponse(response);
      setSelected({});
      setMessage(
        `Added ${count} ${count === 1 ? "touchpoint" : "touchpoints"}. Undo removes this batch.`,
      );
    } catch (e) {
      if (ticket.current === current) setError((e as Error).message);
    } finally {
      if (ticket.current === current) {
        reserved.current = false;
        setApplying(false);
      }
    }
  };
  const disabled = busy || applying;
  return (
    <section
      className="panel touchpoints-panel"
      data-panel="touchpoints"
      aria-label="Find Touchpoints"
    >
      <form
        className="panel-toolbar touchpoints-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label>
          Wikipedia search
          <input
            type="search"
            value={query}
            maxLength={500}
            disabled={!context || disabled}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="submit" disabled={!context || !query.trim() || disabled}>
          Search
        </button>
        <button
          type="button"
          disabled={!context || !query.trim() || disabled}
          onClick={() => void run(true)}
        >
          Refresh
        </button>
      </form>
      <div className="touchpoints-summary">
        {context ? (
          <p>
            Find external concepts for <strong>{context.label}</strong>.
          </p>
        ) : (
          <p>Select an entity to find touchpoints.</p>
        )}
        {response && (
          <p>
            Results for <strong>{response.query}</strong>.
          </p>
        )}
        {response?.fetchedAt && (
          <p className="muted">
            {response.cached
              ? response.stale
                ? "Saved results"
                : "Cached results"
              : "Results"}{" "}
            fetched {new Date(response.fetchedAt).toLocaleString()}.
          </p>
        )}
        {busy && <p role="status">Searching Wikipedia…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {stale && (
          <p role="status">
            The ontology changed since this search. Search again before applying
            touchpoints.
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      <div className="touchpoints-results" aria-busy={busy}>
        {response &&
          !response.candidates.length &&
          !busy &&
          !response.error && <p>No Wikipedia concepts matched this query.</p>}
        {response?.candidates.map((candidate) => {
          const choice = selected[candidate.id];
          const linked = context?.links.some((link) =>
            [candidate.iri, candidate.url, candidate.wikidataIri].includes(
              link.iri,
            ),
          );
          const change = (value: Partial<TouchpointSelection>) =>
            setSelected((old) => ({
              ...old,
              [candidate.id]: { ...old[candidate.id], ...value },
            }));
          const object = touchpointObject(
            candidate,
            choice?.object ?? "dbpedia",
          );
          return (
            <article
              className="touchpoint-row"
              key={candidate.id}
              aria-label={candidate.label}
            >
              <div className="touchpoint-title">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Select ${candidate.label}`}
                    checked={!!choice}
                    disabled={
                      disabled || stale || candidate.disambiguation || linked
                    }
                    onChange={(e) =>
                      setSelected((old) => {
                        const next = { ...old };
                        if (e.target.checked)
                          next[candidate.id] = {
                            id: candidate.id,
                            predicate: suggestedTouchpointPredicate(
                              response.context,
                              candidate,
                            ),
                            object: "dbpedia",
                          };
                        else delete next[candidate.id];
                        return next;
                      })
                    }
                  />
                  <strong>{candidate.label}</strong>
                </label>
                {candidate.disambiguation && <span>Disambiguation page</span>}
                {linked && <span>Linked</span>}
                <button
                  type="button"
                  onClick={() =>
                    void window.axiom.touchpoints
                      .open(candidate.url)
                      .catch((e) => setError((e as Error).message))
                  }
                >
                  Open Wikipedia page
                  <span className="sr-only"> for {candidate.label}</span>
                </button>
              </div>
              <p>
                {candidate.description || "No short description available."}
              </p>
              <p className="touchpoint-iri">{object}</p>
              {choice && (
                <div className="touchpoint-options">
                  <label>
                    Relationship
                    <select
                      aria-label={`Relationship for ${candidate.label}`}
                      value={choice.predicate}
                      disabled={disabled || stale}
                      onChange={(e) =>
                        change({
                          predicate: e.target.value,
                          object:
                            e.target.value === NS.rdfs + "seeAlso"
                              ? "wikipedia"
                              : "dbpedia",
                        })
                      }
                    >
                      {[
                        ...touchpointPredicates,
                        NS.rdfs + "seeAlso",
                        ...(context?.kind === "Individual"
                          ? [NS.owl + "sameAs"]
                          : []),
                      ].map((predicate) => (
                        <option key={predicate} value={predicate}>
                          {shorten(predicate)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Link target
                    <select
                      aria-label={`Link target for ${candidate.label}`}
                      value={choice.object}
                      disabled={disabled || stale}
                      onChange={(e) =>
                        change({ object: e.target.value as TouchpointObject })
                      }
                    >
                      <option value="dbpedia">DBpedia resource</option>
                      {candidate.wikidataIri && (
                        <option value="wikidata">Wikidata entity</option>
                      )}
                      <option value="wikipedia">Wikipedia page</option>
                    </select>
                  </label>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="panel-toolbar touchpoints-footer">
        <span>{Object.keys(selected).length} selected</span>
        <button
          type="button"
          disabled={disabled || stale || !Object.keys(selected).length}
          onClick={() => void apply()}
        >
          {applying ? "Applying…" : "Apply selected touchpoints"}
        </button>
      </div>
    </section>
  );
}
