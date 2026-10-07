import { useEffect, useRef, useState } from "react";
import { NS, shorten } from "../domain/model";
import {
  suggestedTouchpointPredicate,
  touchpointPredicates,
  type TouchpointContext,
  type TouchpointObject,
  type TouchpointResponse,
  type TouchpointSelection,
} from "../shared/touchpoints";
import { request, useSnapshot } from "./client";
import { IndividualPaneHeader, LinkedPill } from "./IndividualsChrome";
import { entityNamespace } from "../shared/terms";

export function TouchpointsPanel({
  subject,
  panelId = "touchpoints",
}: {
  subject?: string;
  panelId?: string;
}) {
  const snapshot = useSnapshot()!;
  const [pinned] = useState(subject ?? snapshot.selected);
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
    setChoices({});
    setError("");
    setMessage("");
    setBusy(false);
    setApplying(false);
    if (!pinned) return;
    void request<TouchpointContext>("touchpointContext", {
      iri: pinned,
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
  }, [pinned, snapshot.datasetEpoch]);
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
    setChoices({});
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
  const linkedTo = (
    candidate: NonNullable<typeof response>["candidates"][number],
  ) =>
    context?.links.find((link) =>
      [candidate.iri, candidate.url, candidate.wikidataIri].includes(link.iri),
    );
  const age = () => {
    const seconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(response?.fetchedAt ?? "")) / 1000),
    );
    const days = Math.floor(seconds / 86400),
      hours = Math.floor(seconds / 3600),
      minutes = Math.floor(seconds / 60);
    return days
      ? `${days} ${days === 1 ? "day" : "days"} ago`
      : hours
        ? `${hours} ${hours === 1 ? "hour" : "hours"} ago`
        : minutes
          ? `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
          : "just now";
  };
  const [choices, setChoices] = useState<Record<string, TouchpointSelection>>(
    {},
  );
  const count = Object.keys(selected).length;
  const namespace = entityNamespace(
    context?.iri ?? "",
    snapshot.ontology.namespace,
  );
  const localName = context?.iri.startsWith(namespace)
    ? ":" + context.iri.slice(namespace.length)
    : shorten(context?.iri ?? "");
  return (
    <section
      className="individuals-surface pane"
      data-panel={panelId}
      aria-label="Touchpoints"
    >
      <IndividualPaneHeader>
        <span className="name">Touchpoints</span>
        <span className="state">
          {response?.fetchedAt && <span className="word">Fetched {age()}</span>}
          <button
            className="btn"
            disabled={!context || !query.trim() || disabled}
            onClick={() => void run(true)}
          >
            Refresh
          </button>
        </span>
      </IndividualPaneHeader>
      <div className="tpbar">
        <span className="pin">{context?.label}</span>
        <span className="dot">·</span>
        <span>{localName}</span>
        <span className="dot">·</span>
        <span>pinned to this subject</span>
        {response?.ranking === "wikipedia" && (
          <>
            <span className="dot">·</span>
            <span>Ranked by Wikipedia. The local model is unavailable.</span>
          </>
        )}
      </div>
      <form
        className="tpq"
        onSubmit={(e) => {
          e.preventDefault();
          setChoices({});
          void run();
        }}
      >
        <label
          htmlFor={panelId + "-query"}
          style={{ fontSize: 12, color: "var(--text-muted)" }}
        >
          Query
        </label>
        <input
          id={panelId + "-query"}
          className="fld"
          aria-label="Query"
          value={query}
          style={{ maxWidth: 360 }}
          maxLength={500}
          disabled={!context || disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="btn"
          disabled={!context || !query.trim() || disabled}
        >
          Search
        </button>
        <span className="flex" />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {response?.candidates.length ?? 0} candidates
        </span>
      </form>
      <div className="pbody" aria-busy={busy}>
        {busy && <p role="status">Searching Wikipedia…</p>}
        {error && <p role="alert">{error}</p>}
        {stale && (
          <p role="status">
            The ontology changed. Search again before applying.
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {response &&
          !response.candidates.length &&
          !busy &&
          !response.error && <p>No candidate was returned for this query.</p>}
        {response &&
          response.candidates.length > 0 &&
          response.candidates.every(linkedTo) && (
            <p>Every candidate is already linked.</p>
          )}
        {response?.candidates.map((candidate) => {
          const linked = linkedTo(candidate),
            choice = choices[candidate.id] ??
              selected[candidate.id] ?? {
                id: candidate.id,
                predicate: suggestedTouchpointPredicate(
                  response.context,
                  candidate,
                ),
                object: "dbpedia" as TouchpointObject,
              };
          const change = (update: Partial<TouchpointSelection>) => {
            const next = { ...choice, ...update };
            setChoices((old) => ({ ...old, [candidate.id]: next }));
            if (selected[candidate.id])
              setSelected((old) => ({ ...old, [candidate.id]: next }));
          };
          return (
            <div
              className={"cand" + (linked ? " linked" : "")}
              key={candidate.id}
              aria-label={candidate.label}
              role="article"
            >
              {linked ? (
                <span className="pill no2">✓</span>
              ) : candidate.disambiguation ? (
                <span className="pill no2">×</span>
              ) : (
                <input
                  type="checkbox"
                  checked={!!selected[candidate.id]}
                  aria-label={`Select ${candidate.label}`}
                  disabled={disabled || stale}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = { ...old };
                      if (e.target.checked) next[candidate.id] = choice;
                      else delete next[candidate.id];
                      return next;
                    })
                  }
                />
              )}
              <span>
                <span className="ttl2">{candidate.label}</span>
                <br />
                <span className="ds">{candidate.description}</span>
              </span>
              {linked ? (
                <>
                  <span>
                    <LinkedPill />
                  </span>
                  <span className="iri2">
                    {linked.iri.replace(/^https?:\/\/(www\.)?/, "")}
                  </span>
                </>
              ) : candidate.disambiguation ? (
                <>
                  <span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      not selectable
                    </span>
                  </span>
                  <span className="iri2" />
                </>
              ) : (
                <>
                  <span>
                    <select
                      className="sel"
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
                        ...[...touchpointPredicates].sort(),
                        NS.rdfs + "seeAlso",
                        ...(context?.kind === "Individual"
                          ? [NS.owl + "sameAs"]
                          : []),
                      ].map((p) => (
                        <option key={p} value={p}>
                          {shorten(p)}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span>
                    <select
                      className="sel"
                      aria-label={`Target for ${candidate.label}`}
                      value={choice.object}
                      disabled={disabled || stale}
                      onChange={(e) =>
                        change({ object: e.target.value as TouchpointObject })
                      }
                    >
                      <option value="dbpedia">DBpedia</option>
                      <option
                        value="wikidata"
                        disabled={!candidate.wikidataIri}
                      >
                        Wikidata
                      </option>
                      <option value="wikipedia">Wikipedia</option>
                    </select>
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="tpfoot">
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {count} selected. Applying adds it as one Undo operation.
        </span>
        <span className="flex" />
        <button
          className="btn primary"
          disabled={disabled || stale || !count}
          onClick={() => void apply()}
        >
          Apply selected touchpoints
        </button>
      </div>
    </section>
  );
}
