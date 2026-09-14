import { useEffect, useRef, useState } from "react";
import { request, useSnapshot } from "./client";
import { identifier, displayName } from "../domain/rdf-model";
import { type Creation, type CreationKind } from "./authoring";
export function InlineCreate({
  draft,
  close,
  dismissible = false,
  onRelationshipChange,
  getPosition,
}: {
  draft: Creation;
  close: () => void;
  dismissible?: boolean;
  onRelationshipChange?: (kind: CreationKind, parent: string) => void;
  getPosition?: () => Creation["position"];
}) {
  const s = useSnapshot()!,
    [label, setLabel] = useState(""),
    [kind, setKind] = useState<CreationKind>(draft.kind),
    [parent, setParent] = useState(draft.parent),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    input = useRef<HTMLInputElement>(null),
    done = useRef(false);
  useEffect(() => {
    input.current?.focus();
    return () => {
      done.current = true;
    };
  }, []);
  useEffect(() => {
    if (s.datasetEpoch !== draft.epoch) close();
  }, [s.datasetEpoch]);
  async function save() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (s.datasetEpoch !== draft.epoch) throw Error("The workspace changed.");
      await request(
        kind === "Class"
          ? "createClass"
          : kind === "Individual"
            ? "createIndividual"
            : "createProperty",
        {
          name: label,
          parent,
          type: parent,
          kind,
          position: getPosition ? getPosition() : draft.position,
          datasetEpoch: draft.epoch,
        },
      );
      if (!done.current) close();
    } catch (e) {
      if (!done.current) {
        setError(
          (e as Error).message.replace(
            /^Error invoking remote method '[^']+': Error: /,
            "",
          ),
        );
        input.current?.focus();
      }
    } finally {
      if (!done.current) setBusy(false);
    }
  }
  return (
    <form
      className="inline-create"
      aria-label="Create entity"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          close();
        }
      }}
    >
      {dismissible && (
        <div className="inline-create-heading">
          <strong>
            {kind === "Individual"
              ? "New instance"
              : kind === "Class"
                ? "New class"
                : "New property"}
          </strong>
          <button
            type="button"
            className="inline-create-close"
            aria-label="Close create entity"
            title="Close (Esc)"
            onClick={close}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
      <label>
        Kind
        <select
          aria-label="Entity kind"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as CreationKind;
            setKind(next);
            onRelationshipChange?.(next, parent);
          }}
        >
          <option value="Class">Class</option>
          <option value="Individual">Instance</option>
          <option value="ObjectProperty">Object property</option>
          <option value="DataProperty">Data property</option>
          <option value="AnnotationProperty">Annotation property</option>
        </select>
      </label>
      <label>
        Label
        <input
          ref={input}
          aria-label="New entity label"
          placeholder="e.g. Course Credit"
          value={label}
          maxLength={256}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
      </label>
      {(kind === "Class" || kind === "Individual") && (
        <label>
          {kind === "Class" ? "Parent class" : "Instance of"}
          <select
            aria-label={kind === "Class" ? "Parent class" : "Instance of"}
            value={parent}
            onChange={(e) => {
              setParent(e.target.value);
              onRelationshipChange?.(kind, e.target.value);
            }}
          >
            {s.entities
              .filter((e) => ["Class", "Defined"].includes(e.kind))
              .map((e) => (
                <option key={e.iri} value={e.iri}>
                  {displayName(e)}
                </option>
              ))}
          </select>
        </label>
      )}
      <small>
        Identifier:{" "}
        {label.trim() ? identifier(label) : "generated from the label"}
        {label.trim() ? " (made unique if needed)" : ""}
      </small>
      {error && <div role="alert">{error}</div>}
      <div className="inline-create-actions">
        <button type="submit" className="primary" disabled={busy}>
          Create
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
