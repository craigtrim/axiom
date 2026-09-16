import { useRef, useState } from "react";
import { Modal } from "./Dialogs";
import { request, command, useSnapshot } from "./client";
import {
  NS,
  SUBCLASS,
  SUBPROPERTY,
  TYPE,
  expand,
  shorten,
} from "../domain/model";
import { displayName } from "../domain/rdf-model";
export interface ConnectionDraft {
  source?: string;
  target?: string;
  epoch: number;
  version: number;
}
export function CreateEdgeDialog({
  draft,
  document,
  close,
}: {
  draft: ConnectionDraft;
  document: Document;
  close: () => void;
}) {
  const s = useSnapshot()!;
  const suggested = (from: string, to: string) => {
    const a = s.entities.find((e) => e.iri === from),
      b = s.entities.find((e) => e.iri === to);
    if (
      a &&
      b &&
      ["Class", "Defined"].includes(a.kind) &&
      ["Class", "Defined"].includes(b.kind)
    )
      return shorten(SUBCLASS);
    if (a?.kind === "Individual" && b && ["Class", "Defined"].includes(b.kind))
      return shorten(TYPE);
    if (a?.kind.endsWith("Property") && a.kind === b?.kind)
      return shorten(SUBPROPERTY);
    return "";
  };
  const [source, setSource] = useState(draft.source ?? ""),
    [target, setTarget] = useState(draft.target ?? ""),
    [predicate, setPredicate] = useState(() =>
      suggested(draft.source ?? "", draft.target ?? ""),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const edited = useRef(false),
    submitting = useRef(false);
  const stale = s.datasetEpoch !== draft.epoch || s.version !== draft.version;
  const entities = [...s.entities].sort((a, b) =>
    displayName(a).localeCompare(displayName(b)),
  );
  const predicates = [
    ...new Set([
      SUBCLASS,
      TYPE,
      SUBPROPERTY,
      NS.owl + "equivalentClass",
      NS.owl + "disjointWith",
      ...s.entities
        .filter((e) => e.kind.endsWith("Property"))
        .map((e) => e.iri),
    ]),
  ];
  const label = (iri: string) => {
    const e = s.entities.find((e) => e.iri === iri);
    return e ? displayName(e) : iri;
  };
  const relationship = expand(predicate.trim().replace(/^<|>$/g, ""));
  const explanation =
    relationship === SUBCLASS
      ? "is a subclass of"
      : relationship === TYPE
        ? "is an instance of"
        : relationship === SUBPROPERTY
          ? "is a subproperty of"
          : predicate.trim();
  async function submit() {
    if (submitting.current || stale || !source || !target || !predicate.trim())
      return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await request("createEdge", {
        datasetEpoch: draft.epoch,
        version: draft.version,
        statement: {
          subject: source,
          predicate: relationship,
          object: { literal: false, value: target },
        },
      });
      close();
      command("view.inspector");
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add relationship"
      document={document}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="create-edge-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          From
          <select
            aria-label="New edge source"
            autoFocus={!source}
            disabled={busy}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              if (!edited.current)
                setPredicate(suggested(e.target.value, target));
            }}
          >
            <option value="">Choose source</option>
            {entities.map((e) => (
              <option key={e.iri} value={e.iri}>
                {displayName(e)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship
          <input
            aria-label="New edge relationship"
            autoFocus={!!source && !!target}
            list="new-edge-predicates"
            placeholder="Choose a relationship or enter its IRI"
            disabled={busy}
            value={predicate}
            onChange={(e) => {
              edited.current = true;
              setPredicate(e.target.value);
            }}
          />
        </label>
        <datalist id="new-edge-predicates">
          {predicates.map((p) => (
            <option key={p} value={shorten(p)} />
          ))}
        </datalist>
        <label>
          To
          <select
            aria-label="New edge target"
            autoFocus={!!source && !target}
            disabled={busy}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              if (!edited.current)
                setPredicate(suggested(source, e.target.value));
            }}
          >
            <option value="">Choose target</option>
            {entities.map((e) => (
              <option key={e.iri} value={e.iri}>
                {displayName(e)}
              </option>
            ))}
          </select>
        </label>
        {source && target && predicate.trim() && (
          <p className="connection-direction">
            {label(source)} → {explanation} → {label(target)}
          </p>
        )}
        {stale && (
          <p role="alert">
            The ontology changed. Close this dialog and start the connection
            again.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || stale || !source || !target || !predicate.trim()}
          >
            {busy ? "Adding..." : "Add relationship"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
