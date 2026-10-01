import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Snapshot } from "../shared/protocol";
import type { TextAnalysisDraft } from "../shared/text-analysis";
import type { TextEntityClassDraft } from "./text-analysis-session";
import { useDraftParentSuggestions } from "./useDraftParentSuggestions";
import { textParentOptions, type ParentOption } from "./text-parent-options";

export const parentIri = (iri: string, namespace: string) =>
  namespace && iri.startsWith(namespace)
    ? ":" + iri.slice(namespace.length)
    : iri;

export function TextParentPicker({
  snapshot,
  value,
  preview,
  disabled,
  ready,
  text,
  setText,
  add,
  create,
  compact = false,
  excludeIri = "",
}: {
  snapshot: Snapshot;
  value: TextEntityClassDraft;
  preview?: TextAnalysisDraft;
  disabled: boolean;
  ready: boolean;
  text: string;
  setText(text: string): void;
  add(iri: string): void;
  create(label: string): void;
  compact?: boolean;
  excludeIri?: string;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 232,
  });
  const [showPrompt, setShowPrompt] = useState(false);
  const assistant = useDraftParentSuggestions(
    snapshot,
    {
      label: value.label,
      comment: value.comment,
      parents: value.parents.flatMap((p) => ("iri" in p ? [p.iri] : [])),
      version: snapshot.version,
      datasetEpoch: snapshot.datasetEpoch,
    },
    () => {
      setActive(-1);
      // A completed suggestion must not steal focus from a name being edited.
      if (
        input.current &&
        (input.current.ownerDocument.activeElement ===
          input.current.ownerDocument.body ||
          input.current.ownerDocument.activeElement?.closest(
            ".text-create-parents, .text-parent-entry",
          ))
      ) {
        setOpen(true);
        input.current.focus();
      }
    },
  );
  const options = useMemo(
    () =>
      textParentOptions(
        snapshot.entities,
        value.parents,
        text,
        preview?.parents ?? [],
        assistant.entry?.state === "completed" ? assistant.entry.values : [],
        assistant.assistant,
      ).filter((option) => !option.iri || option.iri !== excludeIri),
    [
      snapshot.entities,
      value.parents,
      text,
      preview,
      assistant.entry,
      assistant.assistant,
      excludeIri,
    ],
  );
  useEffect(() => {
    setActive(-1);
  }, [text, assistant.entry]);
  useEffect(() => {
    if (active >= 0)
      input.current?.ownerDocument
        .getElementById(id + "-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useLayoutEffect(() => {
    if (!open || !input.current) return;
    const field = input.current,
      win = field.ownerDocument.defaultView!;
    const place = () => {
      const r = field.getBoundingClientRect(),
        gap = 3;
      const below = win.innerHeight - r.bottom - gap;
      const above = r.top - gap;
      const height = Math.min(232, Math.max(below, above));
      setPosition({
        left: r.left,
        width: r.width,
        top:
          below >= Math.min(232, above) ? r.bottom + gap : r.top - height - gap,
        maxHeight: height,
      });
    };
    place();
    win.addEventListener("resize", place);
    win.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    observer.observe(field);
    return () => {
      observer.disconnect();
      win.removeEventListener("resize", place);
      win.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const choose = (option: ParentOption) => {
    if (disabled) return;
    setOpen(false);
    setActive(-1);
    setText("");
    if (option.iri) {
      add(option.iri);
      input.current?.focus();
    } else create(option.label);
  };
  return (
    <>
      <div className="text-parent-entry">
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Parent classes"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id}
          aria-activedescendant={
            open && options[active] ? id + "-" + active : undefined
          }
          placeholder="Search classes, or type a new name…"
          maxLength={256}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                !options.length
                  ? -1
                  : !open || i < 0 || i >= options.length
                    ? 0
                    : (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                      options.length,
              );
            } else if (e.key === "Enter") {
              e.preventDefault();
              const option =
                open &&
                (options[active] ??
                  (options.length === 1 ? options[0] : undefined));
              if (option) choose(option);
            } else if (e.key === "Escape" && (open || text)) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setActive(-1);
              setText("");
            }
          }}
        />
        {!compact && (
          <div className="text-parent-assistant">
            <select
              aria-label="Assistant"
              value={assistant.provider}
              disabled={disabled}
              onChange={(e) =>
                assistant.setProvider(e.target.value as "claude" | "codex")
              }
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
            <button
              type="button"
              disabled={
                disabled || !ready || assistant.busy || !assistant.prompt
              }
              onClick={() => void assistant.generate()}
            >
              {assistant.busy && (
                <span className="text-parent-spinner" aria-hidden="true" />
              )}
              {assistant.busy ? "Thinking…" : "Suggest"}
            </button>
            {assistant.entry?.state === "completed" && (
              <button
                type="button"
                disabled={disabled || assistant.busy}
                onClick={() => void assistant.generate(true)}
              >
                Run again
              </button>
            )}
          </div>
        )}
      </div>
      {!compact && (
        <p className="text-parent-help" role="status">
          {assistant.entry?.cache?.hit && (
            <>
              Cached result from{" "}
              {new Date(assistant.entry.cache.completedAt).toLocaleString()} ·{" "}
              {assistant.entry.cache.model ?? "Model not reported"}.{" "}
            </>
          )}
          {assistant.entry?.state === "completed"
            ? `${assistant.assistant} suggested ${assistant.entry.values.length} parents. They are in the list above, under its name.`
            : `Uses your installed ${assistant.assistant} sign-in. Suggestions appear in the same list.`}{" "}
          <button
            type="button"
            className="text-parent-prompt-toggle"
            disabled={disabled || !assistant.prompt}
            aria-expanded={showPrompt}
            onClick={() => setShowPrompt(!showPrompt)}
          >
            Prompt
          </button>
        </p>
      )}
      {text.trim() && !open && (
        <p className="text-parent-help">
          Choose a parent from the list, or press Escape to clear the search.
        </p>
      )}
      {showPrompt && (
        <div className="text-parent-prompt">
          <textarea
            aria-label="Parent prompt"
            readOnly
            rows={8}
            value={assistant.prompt}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              void window.axiom
                .copy(assistant.prompt)
                .catch((e) => assistant.setError(e.message))
            }
          >
            Copy prompt
          </button>
        </div>
      )}
      {assistant.error && (
        <p role="alert" className="validation-error">
          {assistant.error}
        </p>
      )}
      {open &&
        !disabled &&
        input.current &&
        createPortal(
          <div
            id={id}
            role="listbox"
            aria-label="Parent classes"
            className="text-parent-listbox"
            style={position}
          >
            {!options.length && (
              <p>No class matches that. Keep typing to create one.</p>
            )}
            {options.map((option, index) => (
              <Fragment key={option.iri ?? "create"}>
                {option.group !== options[index - 1]?.group && (
                  <div className="text-parent-group" role="presentation">
                    {option.group}
                  </div>
                )}
                <div
                  role="option"
                  id={id + "-" + index}
                  aria-selected={active === index}
                  className="text-parent-option"
                  onPointerMove={() => setActive(index)}
                  onPointerDown={(e) => {
                    if (e.button === 0) {
                      e.preventDefault();
                      choose(option);
                    }
                  }}
                >
                  <span>
                    {option.iri
                      ? option.label
                      : `Create “${option.label}” as a new parent`}
                  </span>
                  {option.iri && (
                    <code>
                      {parentIri(option.iri, snapshot.ontology.namespace)}
                    </code>
                  )}
                </div>
              </Fragment>
            ))}
          </div>,
          input.current.ownerDocument.body,
        )}
    </>
  );
}
