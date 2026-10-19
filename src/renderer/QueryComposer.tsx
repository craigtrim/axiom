// craigtrim/axiom#111: source uses the same tokens as the editable views.
import { Code } from "./Code";
import { useEffect, useRef, useState } from "react";
import { useAssistantProvider } from "./assistant-provider";
import {
  assistantActivities,
  useAssistantActivity,
  cancelAssistant,
} from "./AssistantActivity";
import { panel, savePanel, request, useSnapshot } from "./client";
import { flushQueryHistory, openQueryProposal } from "./query-history";
import { useRetainedPreview } from "./use-retained-preview";
import { usePaneToast } from "./SharedPane";
import {
  buildQueryPrompt,
  type QueryContext,
  type QueryAssistantStatus,
} from "../shared/query-assistant";
import { writeQueryFields, type QueryFields } from "../shared/query-fields";
import type { AssistantId, AssistantInfo } from "../shared/assistant";
import { NS, shorten } from "../domain/model";

// craigtrim/axiom#88: proposals stay in the composer until explicitly opened.
export function QueryComposer(props: {
  text: string;
  queryId: string;
  mode: "fields" | "describe";
  visible: boolean;
  setMode(mode: "fields" | "describe"): void;
  close(): void;
  write(text: string): void;
  opened(): void;
}) {
  const snapshot = useSnapshot()!,
    notify = usePaneToast();
  const [instructions, setInstructions] = useState(
    panel("query.instructions", ""),
  );
  const [provider, setProvider] = useAssistantProvider();
  const [includeQuery, setIncludeQuery] = useState(
    panel("query.includeCurrent", false),
  );
  const [assistants, setAssistants] = useState<AssistantInfo[]>([]);
  const [status, setStatus] = useState<QueryAssistantStatus>({
    running: false,
  });
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const activity = useAssistantActivity("query");
  const live = useRef(true),
    pending = useRef(false),
    cancelled = useRef(false),
    outcome = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState(false);
  const refresh = async (announce = false) => {
    try {
      const items = await window.axiom.queryAssistant.assistants();
      if (!live.current) return;
      const newly = items.filter(
        (item) =>
          item.available &&
          !assistants.find((old) => old.id === item.id)?.available,
      );
      setAssistants(items);
      if (!items.find((item) => item.id === provider)?.available) {
        const found = items.find((item) => item.available);
        if (found) setProvider(found.id);
      }
      if (announce)
        notify(
          "PATH scanned again.",
          newly.length
            ? newly
                .map(
                  (item) =>
                    item.name + (item.version ? " " + item.version : ""),
                )
                .join(" and ") +
                (newly.length === 1 ? " is" : " are") +
                " now available. Being found is not proof of a signed in account."
            : undefined,
        );
    } catch (e) {
      if (live.current) setError((e as Error).message);
    }
  };
  useEffect(() => {
    live.current = true;
    void refresh();
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const next = await window.axiom.queryAssistant.status();
        if (live.current && !assistantActivities.get("query")) setStatus(next);
      } catch (e) {
        if (live.current) setError((e as Error).message);
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, []);
  const running = !!activity || status.running;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [running]);
  const contextKey = JSON.stringify([
    instructions,
    snapshot.version,
    snapshot.datasetEpoch,
  ]);
  const preview = useRetainedPreview(
    contextKey,
    String(snapshot.datasetEpoch),
    async () => ({
      context: await request<QueryContext>("queryContext", { instructions }),
      instructions,
    }),
    250,
  );
  const context = preview.value?.context;
  const input = context && {
    provider,
    instructions: preview.value!.instructions,
    currentQuery: includeQuery ? props.text : "",
    queryId: props.queryId,
    datasetEpoch: context.datasetEpoch,
    version: context.version,
  };
  const intent = JSON.stringify([
    contextKey,
    provider,
    includeQuery,
    props.text,
    props.queryId,
    props.mode,
    props.visible,
  ]);
  const latest = useRef(intent);
  latest.current = intent;
  const available = assistants.find((item) => item.id === provider);
  const generate = async () => {
    if (
      !input ||
      pending.current ||
      assistantActivities.get("query") ||
      !instructions.trim() ||
      !available?.available
    )
      return;
    pending.current = true;
    cancelled.current = false;
    setError("");
    let started = false;
    try {
      const fresh = await preview.validate();
      if (!fresh || !live.current || latest.current !== intent) return;
      await flushQueryHistory();
      if (
        !live.current ||
        latest.current !== intent ||
        assistantActivities.get("query")
      )
        return;
      setError("");
      setStatus({ running: true, startedAt: Date.now() });
      started = true;
      const response = await assistantActivities.run(
        "query",
        `${provider === "claude" ? "Claude Code" : "Codex"} · Generating query…`,
        async (check) => {
          check();
          return window.axiom.queryAssistant.run({
            ...input,
            instructions,
            datasetEpoch: fresh.context.datasetEpoch,
            version: fresh.context.version,
          });
        },
        () => window.axiom.queryAssistant.cancel(),
      );
      if (live.current) setStatus({ running: false, response });
    } catch (e) {
      if (live.current) {
        if (!started) {
          setError((e as Error).message);
          return;
        }
        const next = await window.axiom.queryAssistant
          .status()
          .catch(() => ({ running: false, error: (e as Error).message }));
        if (live.current)
          setStatus(cancelled.current ? { running: false } : next);
      }
    } finally {
      pending.current = false;
    }
  };
  const cancel = async () => {
    cancelled.current = true;
    try {
      await cancelAssistant("query");
      if (assistantActivities.get("query")?.error)
        throw Error(assistantActivities.get("query")!.error);
      if (live.current) {
        setStatus({ running: false });
        notify(
          "Generation cancelled.",
          "The process tree was terminated and the lock released.",
        );
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    }
  };
  const response = status.response;
  const failure = error || preview.error || status.error;
  const refusal = status.refusal || response?.validation;
  const unsupported = response?.result.status === "unsupported";
  const open = async () => {
    if (!response || opening) return;
    setOpening(true);
    try {
      const view = await openQueryProposal(response.completedAt);
      const number =
        view.entries.findIndex((entry) => entry.id === view.activeId) + 1;
      notify(
        response.validation
          ? `Opened for correction as document ${number}.`
          : `Opened as document ${number}.`,
        response.validation
          ? "Run stays unavailable until you change the text."
          : "Nothing ran. Run is still yours to press.",
      );
      props.opened();
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setOpening(false);
    }
  };
  useEffect(() => {
    if (props.mode === "describe")
      outcome.current?.scrollIntoView({ block: "nearest" });
  }, [response?.completedAt, refusal, failure, props.mode]);
  const [fields, setFields] = useState<QueryFields>();
  const [fieldError, setFieldError] = useState("");
  const [subject, setSubject] = useState("");
  const [predicate, setPredicate] = useState(NS.rdfs + "label");
  const [value, setValue] = useState("");
  const [limit, setLimit] = useState("50");
  const [written, setWritten] = useState(false);
  useEffect(() => {
    let valid = true;
    if (fields?.datasetEpoch !== snapshot.datasetEpoch) setFields(undefined);
    void request<QueryFields>("queryFields")
      .then((next) => {
        if (!valid) return;
        setFields(next);
        setFieldError("");
        setSubject((old) =>
          next.classes.some((entry) => entry.iri === old) ? old : "",
        );
        setPredicate((old) =>
          next.predicates.some((entry) => entry.iri === old)
            ? old
            : (next.predicates[0]?.iri ?? ""),
        );
      })
      .catch((e) => {
        if (valid) setFieldError(e.message);
      });
    return () => {
      valid = false;
    };
  }, [snapshot.datasetEpoch, snapshot.version]);
  const write = () => {
    if (
      !fields ||
      fields.datasetEpoch !== snapshot.datasetEpoch ||
      fields.version !== snapshot.version
    )
      return;
    try {
      props.write(
        writeQueryFields(fields, { subject, predicate, value, limit }),
      );
      setWritten(true);
      setFieldError("");
    } catch (e) {
      setFieldError((e as Error).message);
    }
  };
  const missing = (["codex", "claude"] as const)
    .filter((id) => !assistants.find((item) => item.id === id)?.available)
    .map((id) => (id === "codex" ? "Codex" : "Claude Code"));
  const missingHint = `${missing.join(" and ")}${missing.length === 2 ? " were" : " was"} not found on PATH. Install ${missing.length === 2 ? "either" : "it"} and sign in from a terminal; Axiom has no API key field and never asks for one.`;
  return (
    <section
      className="comp query-composer"
      aria-label="Compose a SPARQL query"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          props.close();
        }
      }}
    >
      <h3>Composer</h3>
      <div className="cmode">
        <div className="seg" role="group" aria-label="Composer mode">
          <button
            aria-pressed={props.mode === "fields"}
            onClick={() => props.setMode("fields")}
          >
            Fields
          </button>
          <button
            aria-pressed={props.mode === "describe"}
            onClick={() => props.setMode("describe")}
          >
            Describe
          </button>
        </div>
      </div>
      <div className="cbody" hidden={props.mode !== "fields"}>
        <label>
          Subject class
          <select
            className="sel"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">Any class</option>
            {fields?.classes.map((item) => (
              <option key={item.iri} value={item.iri}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Predicate
          <select
            className="sel"
            value={predicate}
            onChange={(e) => setPredicate(e.target.value)}
          >
            {fields?.predicates.map((item) => (
              <option key={item.iri} value={item.iri}>
                {shorten(item.iri)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Value contains
          <input
            className="fld"
            placeholder="Any value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          Limit
          <input
            className="fld"
            inputMode="numeric"
            size={4}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <button
          className="btn"
          disabled={
            !fields || !predicate || fields.version !== snapshot.version
          }
          onClick={write}
        >
          Write into the editor
        </button>
        <p className="hint">
          {written
            ? "Written. Edit it freely; the composer does not own the text once it is there."
            : "The composer writes a query and then lets go of it. It never rewrites what you have edited."}
        </p>
        {fieldError && (
          <div className="prop bad4" role="alert">
            {fieldError}
          </div>
        )}
      </div>
      <div className="cbody" hidden={props.mode !== "describe"}>
        <label>
          Describe the query
          <textarea
            className="ta2"
            rows={2}
            maxLength={12000}
            disabled={running}
            placeholder="For example: Find classes whose names start with American."
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              savePanel("query.instructions", e.target.value, false);
            }}
          />
        </label>
        <div className="prow">
          <select
            className="sel"
            aria-label="Agent"
            value={provider}
            disabled={running}
            onChange={(e) => setProvider(e.target.value as AssistantId)}
          >
            {(["codex", "claude"] as const).map((id) => {
              const agent = assistants.find((item) => item.id === id),
                name = id === "codex" ? "Codex" : "Claude Code";
              return (
                <option key={id} value={id} disabled={!agent?.available}>
                  {name}
                  {agent?.available
                    ? agent.version
                      ? " " + agent.version
                      : ""
                    : " not on PATH"}
                </option>
              );
            })}
          </select>
          <button
            className="btn quiet"
            disabled={running}
            onClick={() => void refresh(true)}
          >
            Refresh agents
          </button>
        </div>
        {!!missing.length && <p className="hint miss">{missingHint}</p>}
        <button
          className="sw"
          role="switch"
          aria-checked={includeQuery}
          disabled={running}
          onClick={() => {
            setIncludeQuery(!includeQuery);
            savePanel("query.includeCurrent", !includeQuery, false);
          }}
        >
          <span className="track" aria-hidden="true">
            <span className="knob" />
          </span>
          Refine the current query
        </button>
        <p className="hint">
          {includeQuery
            ? "The editor text is part of the request, so this is a revision."
            : "The request is your description plus the ontology context, so this is a new query."}
        </p>
        <details className="ctxbox">
          <summary>{`What gets sent: ${context ? context.terms.length + context.predicates.length : 0} context lines, ${(context?.omitted ?? 0) + (context?.omittedPredicates ?? 0)} omitted, from ${available?.path ?? "no executable"}`}</summary>
          <pre className="cc">
            {context && input ? (
              <Code language="prompt">{buildQueryPrompt(context, input)}</Code>
            ) : (
              "Loading ontology context..."
            )}
          </pre>
        </details>
        {running ? (
          <div className="prow">
            <button className="btn quiet" onClick={() => void cancel()}>
              Cancel generation
            </button>
            <span className="hint">
              Working{" "}
              <span className="elapsed">
                {Math.max(
                  0,
                  (now - (status.startedAt ?? activity?.startedAt ?? now)) /
                    1000,
                ).toFixed(1)}
                s
              </span>
              , no estimate is available
            </span>
          </div>
        ) : (
          <button
            className="btn primary"
            disabled={!context || !instructions.trim() || !available?.available}
            onClick={() => void generate()}
          >
            Generate
          </button>
        )}
        {!running && (failure || refusal || response) && (
          <div
            ref={outcome}
            className={
              "prop " +
              (failure || refusal ? "bad4" : unsupported ? "wrn4" : "ok2")
            }
            role="status"
            aria-live="polite"
          >
            <b>
              {failure
                ? "Generation failed."
                : refusal
                  ? "The proposal failed validation."
                  : unsupported
                    ? "Not supported by this context."
                    : "Validated against the query engine."}
            </b>
            <div>{failure || refusal || response?.result.explanation}</div>
            {!failure && !refusal && !!response?.result.assumptions.length && (
              <ul className="asm">
                {response.result.assumptions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
            {unsupported && !failure && !refusal && (
              <div>No document was opened.</div>
            )}
            {(failure || response?.result.status === "query") && (
              <span>
                {failure ? (
                  <button className="btn quiet" onClick={() => void generate()}>
                    Try again
                  </button>
                ) : (
                  <button
                    className={"btn" + (refusal ? " quiet" : "")}
                    disabled={opening}
                    onClick={() => void open()}
                  >
                    {refusal ? "Open it for correction" : "Open in the editor"}
                  </button>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
