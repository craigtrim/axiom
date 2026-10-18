import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NS, shorten } from "../domain/model";
import {
  suggestedTouchpointPredicate,
  touchpointPredicates,
  touchpointObject,
  type TouchpointCandidate,
  type TouchpointContext,
  type TouchpointObject,
  type TouchpointResponse,
  type TouchpointSelection,
  type WikipediaError,
} from "../shared/touchpoints";
import { request, useSnapshot } from "./client";
import { registerPaneRecovery, usePaneLayout } from "./AdaptivePane";
import { SharedMenu, SharedPane, usePaneToast } from "./SharedPane";
import "./touchpoints-reference.css";

// craigtrim/axiom#92: each pinned subject keeps its query, choices and request through recovery.
registerPaneRecovery("touchpoints", {
  Body: ({ maximize }) => (
    <div className="touchpoints-recovery">
      <div className="touchpoints-recovery-copy" />
      <div>{maximize}</div>
    </div>
  ),
});
type Note = { head: string; tail?: string; kind?: "bad" | "ok" };
export function touchpointDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Date.now() - date.getTime() < 60000) return "just now";
  return `${date.getDate()} ${date.toLocaleString("en-GB", { month: "long" })} ${date.getFullYear()}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
const kindWord = (kind?: string) =>
  ["Class", "Defined", "Intersection"].includes(kind ?? "")
    ? "class"
    : kind?.endsWith("Property")
      ? "property"
      : (kind ?? "resource").toLowerCase();

export function TouchpointsPanel({
  subject,
  panelId = "touchpoints",
}: {
  subject?: string;
  panelId?: string;
}) {
  return (
    <section
      className="panel shared-layer touchpoints-panel"
      data-panel={panelId}
      aria-label="Touchpoints"
    >
      <SharedPane className="footed touchpoints-surface">
        <TouchpointsContent subject={subject} />
      </SharedPane>
    </section>
  );
}
function TouchpointsContent({ subject }: { subject?: string }) {
  const snapshot = useSnapshot()!,
    layout = usePaneLayout(),
    notify = usePaneToast();
  const [pinned] = useState(subject ?? snapshot.selected);
  const [context, setContext] = useState<TouchpointContext>();
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  queryRef.current = query;
  const [response, setResponse] = useState<TouchpointResponse>();
  const [selected, setSelected] = useState<Record<string, TouchpointSelection>>(
    {},
  );
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false);
  const [note, setNote] = useState<Note>();
  const reserved = useRef(false),
    ticket = useRef(0),
    more = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLSpanElement>(null),
    [recoveryTarget, setRecoveryTarget] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setRecoveryTarget(
      layout.recovery
        ? (anchor.current
            ?.closest(".adaptive-pane")
            ?.querySelector(".touchpoints-recovery-copy") ?? null)
        : null,
    );
  }, [layout.recovery]);
  useLayoutEffect(() => {
    const pane = anchor.current?.closest<HTMLElement>(".touchpoints-surface");
    if (pane)
      pane.dataset.wrap = String(layout.width < 400 && layout.width >= 240);
  }, [layout.width]);
  useEffect(() => {
    const current = ++ticket.current;
    reserved.current = false;
    setContext(undefined);
    setQuery("");
    setResponse(undefined);
    setSelected({});
    setNote(undefined);
    setBusy(false);
    setApplying(false);
    if (!pinned) return;
    void request<TouchpointContext>("touchpointContext", { iri: pinned })
      .then(async (value) => {
        if (ticket.current !== current) return;
        setContext(value);
        setQuery(value.label);
        queryRef.current = value.label;
        const saved = await window.axiom.touchpoints.saved({
          iri: pinned,
          query: value.label,
        });
        if (ticket.current === current) setResponse(saved);
      })
      .catch((error) => {
        if (ticket.current === current)
          setNote({ head: error.message, kind: "bad" });
      });
    const unsubscribe = window.axiom.onEvent(({ type, data }) => {
      if (
        type !== "wikipedia-cache" ||
        (data.iri && data.iri !== pinned) ||
        reserved.current ||
        !queryRef.current.trim()
      )
        return;
      const read = ++ticket.current;
      void window.axiom.touchpoints
        .saved({ iri: pinned, query: queryRef.current })
        .then((saved) => {
          if (ticket.current !== read) return;
          setResponse(saved);
          if (saved) setContext(saved.context);
          setSelected((old) =>
            Object.fromEntries(
              Object.entries(old).filter(([id]) =>
                saved?.candidates.some((c) => c.id === id),
              ),
            ),
          );
          setNote(undefined);
        })
        .catch((error) => {
          if (ticket.current === read)
            setNote({ head: error.message, kind: "bad" });
        });
    });
    return () => {
      ++ticket.current;
      unsubscribe();
    };
  }, [pinned, snapshot.datasetEpoch]);
  const date = touchpointDate(response?.fetchedAt),
    count = Object.keys(selected).length;
  const disabled = busy || applying;
  const linked = (candidate: TouchpointCandidate) =>
    context?.links.some((link) =>
      [candidate.iri, candidate.url, candidate.wikidataIri].includes(link.iri),
    );
  const defaults = (candidate: TouchpointCandidate): TouchpointSelection => ({
    id: candidate.id,
    predicate: suggestedTouchpointPredicate(response!.context, candidate),
    object: "dbpedia",
  });
  const showFailure = (
    error: WikipediaError,
    refresh: boolean,
    saved: boolean,
  ) => {
    const retained = saved ? " The saved results below are unchanged." : "";
    if (error.kind === "rate-limit") {
      setNote({
        kind: "bad",
        head: "Wikipedia returned HTTP 429.",
        tail:
          (error.firstWithoutRetryAfter
            ? "No Retry-After header, so the first wait is five seconds and each consecutive throttle doubles it."
            : `Wikipedia asked Axiom to wait ${error.waitSeconds} seconds, and each consecutive throttle doubles the wait.`) +
          " The request is not retried automatically" +
          (saved ? " and the saved results below are unchanged." : "."),
      });
      if (refresh && saved)
        notify(
          "Refresh was throttled.",
          `The rows on screen are still the saved ones from ${date}.`,
        );
    } else setNote({ kind: "bad", head: error.message, tail: retained.trim() });
  };
  const run = async (refresh = false) => {
    if (
      !context ||
      reserved.current ||
      !query.trim() ||
      (refresh && !response?.fetchedAt)
    )
      return;
    reserved.current = true;
    const current = ++ticket.current,
      previous = response;
    setBusy(true);
    setNote(undefined);
    try {
      const value = await window.axiom.touchpoints.search({
        iri: context.iri,
        query,
        refresh,
      });
      if (ticket.current !== current) return;
      if (value.error) {
        if (!previous?.fetchedAt && value.fetchedAt) {
          setResponse(value);
          setContext(value.context);
        }
        showFailure(
          value.error,
          refresh,
          !!(previous?.fetchedAt || value.fetchedAt),
        );
      } else {
        setResponse(value);
        setContext(value.context);
        setSelected({});
        if (refresh) {
          const added = value.candidates.filter(
            (c) => !previous?.candidates.some((old) => old.id === c.id),
          ).length;
          setNote({
            kind: "ok",
            head: "Refreshed.",
            tail:
              added === 1
                ? "One new candidate arrived that the saved copy did not have, and the saved entry has been replaced."
                : added > 1
                  ? `${added} new candidates arrived that the saved copy did not have, and the saved entry has been replaced.`
                  : "The saved entry has been replaced.",
          });
        }
        notify(
          refresh
            ? "Refreshed from Wikipedia."
            : `Fetched ${value.candidates.length} candidates.`,
          value.ranking === "model"
            ? "Ranked locally using the label, parents and description."
            : "Wikipedia order retained, the local model is unavailable.",
        );
      }
    } catch (error) {
      if (ticket.current === current)
        setNote({
          kind: "bad",
          head: (error as Error).message,
          tail: previous?.fetchedAt
            ? "The saved results below are unchanged."
            : undefined,
        });
    } finally {
      if (ticket.current === current) {
        reserved.current = false;
        setBusy(false);
      }
    }
  };
  const staleNote = () => {
    setNote({
      kind: "bad",
      head: "The ontology changed after this search.",
      tail: "Search again before applying, so the statements are validated against the store you are actually writing to. Your selection and choices are kept.",
    });
    notify("Nothing was applied.", "The result is older than the store.");
  };
  const apply = async () => {
    if (!response || reserved.current || !count) return;
    if (
      response.context.version !== snapshot.version ||
      response.context.datasetEpoch !== snapshot.datasetEpoch
    ) {
      staleNote();
      return;
    }
    const picked = response.candidates.filter((c) => selected[c.id]);
    const invalid = picked.filter((c) =>
      response.context.links.some(
        (link) =>
          !link.literal &&
          link.predicate === selected[c.id].predicate &&
          link.iri === touchpointObject(c, selected[c.id].object),
      ),
    );
    if (invalid.length) {
      setNote({
        kind: "bad",
        head: "The whole batch was rejected.",
        tail: `${invalid[0].label} already has that statement, so it is invalid. Validation rejects the batch rather than writing part of it. Change its relationship or target, or deselect it, and apply again.`,
      });
      notify(
        "Nothing was applied.",
        `${count} selected, ${invalid.length} invalid.`,
      );
      return;
    }
    reserved.current = true;
    setApplying(true);
    const current = ticket.current;
    try {
      const added = await window.axiom.touchpoints.apply(
        response.token,
        picked.map((c) => selected[c.id]),
      );
      const next = await request<TouchpointContext>("touchpointContext", {
        iri: response.context.iri,
      });
      if (ticket.current !== current) return;
      setContext(next);
      // This read updates display links; the service still guards the exact mutation version.
      setResponse({ ...response, context: next });
      setSelected({});
      setNote({
        kind: "ok",
        head: `Added ${added} resource statement${added === 1 ? "" : "s"} as one Undo operation.`,
        tail: picked
          .map(
            (c) =>
              `${shorten(selected[c.id].predicate)} ${touchpointObject(c, selected[c.id].object)}`,
          )
          .join(", "),
      });
      notify(`Applied ${added}.`, "One Undo reverses the whole batch.");
    } catch (error) {
      if (ticket.current === current) {
        if ((error as Error).message.includes("ontology changed")) staleNote();
        else {
          setNote({
            kind: "bad",
            head: "The whole batch was rejected.",
            tail: (error as Error).message,
          });
          notify("Nothing was applied.");
        }
      }
    } finally {
      if (ticket.current === current) {
        reserved.current = false;
        setApplying(false);
      }
    }
  };
  const toggle = (candidate: TouchpointCandidate) => {
    if (disabled) return;
    if (candidate.disambiguation) {
      notify(
        "A disambiguation page cannot be selected.",
        "It names several subjects, so no single resource statement would be true.",
      );
      return;
    }
    setSelected((old) => {
      const next = { ...old };
      if (next[candidate.id]) delete next[candidate.id];
      else next[candidate.id] = defaults(candidate);
      return next;
    });
  };
  const clear = async () => {
    if (!context || reserved.current) return;
    reserved.current = true;
    const current = ++ticket.current;
    try {
      await window.axiom.touchpoints.clear(context.iri);
      if (ticket.current !== current) return;
      setResponse(undefined);
      setSelected({});
      setNote(undefined);
      notify(
        "Saved entry removed.",
        "Edit, Settings, Clear Wikipedia cache does this for every subject at once.",
      );
    } catch (error) {
      if (ticket.current === current)
        setNote({ kind: "bad", head: (error as Error).message });
    } finally {
      if (ticket.current === current) reserved.current = false;
    }
  };
  const visibleNote: Note | undefined = busy
    ? {
        head: "Searching English Wikipedia.",
        tail: "One request, up to twenty candidates, fifteen second timeout.",
      }
    : (note ??
      (response?.candidates.length && response.candidates.every(linked)
        ? { kind: "ok", head: "Every candidate is already linked." }
        : undefined));
  return (
    <>
      <span ref={anchor} hidden />
      {recoveryTarget &&
        createPortal(
          <>
            <div className="id">Touchpoints, {context?.label}</div>
            <div className="why">
              {response?.fetchedAt
                ? `Too little room to review candidates. The query "${query}" and its results from ${date} are retained.`
                : "Too little room to review candidates. The query is retained and nothing has been fetched yet."}
            </div>
          </>,
          recoveryTarget,
        )}
      <div className="bar" role="group" aria-label="Touchpoints actions">
        <span className="pin">
          <span className="pn">{context?.label}</span>
          <span className="pk">{kindWord(context?.kind)}</span>
        </span>
        <input
          className="fld qf"
          aria-label="Wikipedia query"
          value={query}
          maxLength={500}
          disabled={!context}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
        <button
          className="btn primary"
          disabled={!context || !query.trim() || disabled}
          onClick={() => void run()}
        >
          Search
        </button>
        <button
          className="btn quiet"
          disabled={!response?.fetchedAt || disabled || !query.trim()}
          onClick={() => void run(true)}
        >
          Refresh
        </button>
        <SharedMenu
          trigger={more}
          items={[
            {
              id: "all",
              label: "Select every selectable candidate",
              disabled: !response?.fetchedAt || disabled,
              run: () =>
                setSelected(
                  Object.fromEntries(
                    response!.candidates
                      .filter((c) => !c.disambiguation)
                      .map((c) => [c.id, defaults(c)]),
                  ),
                ),
            },
            {
              id: "none",
              label: "Clear the selection",
              disabled: !count || disabled,
              run: () => setSelected({}),
            },
            { id: "separator", separator: true },
            {
              id: "clear",
              label: "Clear the Wikipedia cache for this subject",
              disabled: !response?.fetchedAt || disabled,
              run: () => void clear(),
            },
          ]}
        />
      </div>
      <div className="body" aria-busy={busy}>
        <div className="stack">
          <div className="touchpoints-note">
            {visibleNote && (
              <div
                className={"why2 " + (visibleNote.kind ?? "")}
                role={visibleNote.kind === "bad" ? "alert" : "status"}
              >
                <b>{visibleNote.head}</b>
                {visibleNote.tail && ` ${visibleNote.tail}`}
              </div>
            )}
          </div>
          <div
            className="rows"
            role={!busy && response?.candidates.length ? "list" : "group"}
            aria-label="Wikipedia candidates"
          >
            {!busy &&
              (!response?.fetchedAt ? (
                <div className="empty">
                  <b>{`Nothing fetched yet for ${context?.label}.`}</b>
                  {
                    " The query starts as the preferred label and stays editable. Typing sends nothing; press Enter or choose Search to fetch up to twenty English Wikipedia candidates. Search does not invoke Claude or Codex, and it never writes to the ontology."
                  }
                </div>
              ) : !response.candidates.length ? (
                <div className="empty">
                  <b>No candidate was returned for this query.</b>
                </div>
              ) : (
                response.candidates.map((candidate) => {
                  const choice = selected[candidate.id];
                  const change = (update: Partial<TouchpointSelection>) =>
                    setSelected((old) => ({
                      ...old,
                      [candidate.id]: { ...old[candidate.id], ...update },
                    }));
                  return (
                    <div
                      key={candidate.id}
                      className={
                        "cand" + (candidate.disambiguation ? " dis" : "")
                      }
                      data-selected={!!choice}
                      role="listitem"
                      aria-label={candidate.label}
                      onClick={(e) => {
                        if (!(e.target as Element).closest("button,select"))
                          toggle(candidate);
                      }}
                    >
                      <button
                        className="pick"
                        type="button"
                        role="checkbox"
                        aria-checked={!!choice}
                        aria-disabled={
                          candidate.disambiguation || disabled || undefined
                        }
                        aria-label={`Select ${candidate.label}`}
                        onClick={() => toggle(candidate)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                        </svg>
                      </button>
                      <div className="cbody">
                        <div className="ctitle">
                          {candidate.label}
                          {candidate.disambiguation && (
                            <span className="tag wrn">
                              <span className="gl" />
                              disambiguation, cannot be selected
                            </span>
                          )}
                          {linked(candidate) && (
                            <span className="tag good">
                              <span className="gl" />
                              Linked
                            </span>
                          )}
                          {!candidate.disambiguation &&
                            suggestedTouchpointPredicate(
                              response.context,
                              candidate,
                            ) ===
                              NS.skos + "exactMatch" && (
                              <span className="tag inf">
                                <span className="gl" />
                                title, alias or redirect match
                              </span>
                            )}
                          {candidate.similarity !== undefined &&
                            response.ranking === "model" && (
                              <span className="rank">
                                {`rank ${Math.round(candidate.similarity * 100)}`}
                              </span>
                            )}
                        </div>
                        <div className="cdesc">{candidate.description}</div>
                        {choice && (
                          <div className="copt">
                            <span className="clabel">asserts</span>
                            <select
                              className="sel"
                              aria-label={`Relationship for ${candidate.label}`}
                              value={choice.predicate}
                              disabled={disabled}
                              onChange={(e) =>
                                change({
                                  predicate: e.target.value,
                                  ...(e.target.value === NS.rdfs + "seeAlso"
                                    ? { object: "wikipedia" as const }
                                    : {}),
                                })
                              }
                            >
                              {[
                                ...touchpointPredicates,
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
                            <span className="clabel">pointing at</span>
                            <select
                              className="sel"
                              aria-label={`Target for ${candidate.label}`}
                              value={choice.object}
                              disabled={disabled}
                              onChange={(e) =>
                                change({
                                  object: e.target.value as TouchpointObject,
                                })
                              }
                            >
                              <option value="dbpedia">DBpedia</option>
                              {candidate.wikidataIri && (
                                <option value="wikidata">Wikidata</option>
                              )}
                              <option value="wikipedia">Wikipedia</option>
                            </select>
                            <span className="ciri">
                              {touchpointObject(candidate, choice.object)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ))}
          </div>
        </div>
      </div>
      <div className="foot">
        <span>
          <span className="num">{count}</span> selected
        </span>
        <span>
          <button
            className="btn primary"
            disabled={disabled || !count}
            onClick={() => void apply()}
          >
            Apply selected touchpoints
          </button>
        </span>
        {response?.fetchedAt && (
          <span>
            {`${response.candidates.length} candidates, fetched ${date}`}
          </span>
        )}
        <span>{`query "${query}"`}</span>
        {response && (
          <span>
            {response?.ranking === "model"
              ? "ranked by the local MPNet model"
              : "Wikipedia order, local model unavailable"}
          </span>
        )}
        <span>saved under ~/.axiom/wikipedia, no automatic expiry</span>
      </div>
    </>
  );
}
