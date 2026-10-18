import { useEffect, useId, useRef, useState } from "react";
import type { Snapshot } from "../shared/protocol";
import type { ResourceMatch } from "../domain/resource-search";
import { normalizeSearchText } from "../domain/cosine";
import { local } from "../domain/model";
import { request } from "./client";
import { progressiveSearch } from "./progressive-search";
import type { TextEntityClassDraft } from "./text-analysis-session";

// craigtrim/axiom#93: nested comboboxes share ranked search without assistant calls.
export function AddEntityPicker({
  node,
  snapshot,
  label,
  placeholder,
  disabled,
  change,
  take,
}: {
  node: TextEntityClassDraft;
  snapshot: Snapshot;
  label: string;
  placeholder: string;
  disabled: boolean;
  change(text: string): void;
  take(parent: TextEntityClassDraft["parents"][number]): void;
}) {
  const id = useId(),
    field = useRef<HTMLInputElement>(null),
    consumer = useRef(crypto.randomUUID()).current;
  const text = node.pickerText ?? "",
    [open, setOpen] = useState(!!text),
    [active, setActive] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    matches: ResourceMatch[];
    error?: string;
  }>();
  const key = JSON.stringify([
    text,
    snapshot.datasetEpoch,
    snapshot.version,
    node.parents,
  ]);
  const latest = useRef(key);
  latest.current = key;
  const enter = useRef<string | undefined>(undefined);
  const classes = snapshot.entities.filter((e) =>
    ["Class", "Defined"].includes(e.kind),
  );
  const used = new Set(
    node.parents.flatMap((p) => ("iri" in p ? [p.iri] : [])),
  );
  const ready = result?.key === key && !result.error;
  const options =
    !text.trim() || !ready
      ? []
      : [
          ...result.matches
            .filter(
              (m) => classes.some((e) => e.iri === m.iri) && !used.has(m.iri),
            )
            .slice(0, 6)
            .map((m) => ({
              label:
                snapshot.entities.find((e) => e.iri === m.iri)?.label ||
                m.label,
              iri: m.iri,
            })),
          ...(!classes.some((e) =>
            [e.label, e.name, local(e.iri)].some(
              (n) => normalizeSearchText(n ?? "") === normalizeSearchText(text),
            ),
          ) &&
          !node.parents.some(
            (p) =>
              "create" in p &&
              normalizeSearchText(p.create.label) === normalizeSearchText(text),
          )
            ? [{ label: text.trim(), iri: undefined }]
            : []),
        ];
  const choose = (option: (typeof options)[number]) => {
    if (disabled) return;
    enter.current = undefined;
    setOpen(false);
    setActive(0);
    take(
      option.iri
        ? { iri: option.iri }
        : {
            create: {
              label: option.label,
              comment: "",
              parents: [],
              manualParents: true,
            },
          },
    );
    field.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    setActive(0);
    if (!text.trim() || disabled) return;
    let cancel = () => {};
    const timer = setTimeout(() => {
      cancel = progressiveSearch<ResourceMatch[]>(
        request,
        "resourceSuggestions",
        {
          query: text,
          classesOnly: true,
          exclude: [...used],
          consumer,
          searchId: crypto.randomUUID(),
        },
        (matches) => {
          if (latest.current === key) setResult({ key, matches });
        },
        () => {
          if (latest.current === key)
            setResult({
              key,
              matches: [],
              error: "Search unavailable. Try again.",
            });
        },
      );
    }, 120);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [key, disabled]);
  useEffect(() => {
    if (enter.current === key && ready && options.length) choose(options[0]);
  }, [key, ready, result]);
  useEffect(() => {
    if (open)
      field.current?.ownerDocument
        .getElementById(id + "-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div className="pick2">
      <input
        ref={field}
        className="fld wide"
        role="combobox"
        aria-label={label}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open && !!options.length}
        aria-controls={id}
        aria-activedescendant={
          open && options[active] ? id + "-" + active : undefined
        }
        value={text}
        maxLength={256}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          enter.current = undefined;
          change(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            if (options.length)
              setActive(
                (a) =>
                  (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                  options.length,
              );
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (!ready) enter.current = key;
            else if (options[active]) choose(options[active]);
          } else if (e.key === "Escape" && (open || text)) {
            e.preventDefault();
            e.stopPropagation();
            enter.current = undefined;
            change("");
            setOpen(false);
          }
        }}
      />
      {open && !!options.length && (
        <div
          className="psug"
          role="listbox"
          id={id}
          aria-label="Matching classes"
        >
          {options.map((o, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              id={id + "-" + i}
              key={o.iri ?? "new"}
              className={o.iri ? "" : "new"}
              data-active={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o.iri ? o.label : `Draft a new parent named ${o.label}`}
              <span className="pi">
                {o.iri
                  ? o.iri.replace(/^http:\/\//, "")
                  : "committed in the same transaction"}
              </span>
            </button>
          ))}
        </div>
      )}
      {result?.key === key && result.error && (
        <div className="fnote" role="status">
          {result.error}
        </div>
      )}
    </div>
  );
}
