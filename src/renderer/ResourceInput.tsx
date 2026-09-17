import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { request, useSnapshot } from "./client";
import type { ResourceMatch } from "../domain/resource-search";
import { compactIri, expandIri } from "../shared/terms";
import { displayName } from "../domain/rdf-model";
export function ResourceInput({
  value,
  namespace,
  label,
  classesOnly = false,
  exclude = [],
  disabled = false,
  change,
}: {
  value: string;
  namespace: string;
  label: string;
  classesOnly?: boolean;
  exclude?: string[];
  disabled?: boolean;
  change(value: string): void;
}) {
  const s = useSnapshot()!;
  const name = (iri: string) => {
    const e = s.entities.find((e) => e.iri === iri);
    const compact = compactIri(iri, namespace);
    return compact !== iri && compact.includes(":")
      ? compact
      : e
        ? displayName(e)
        : compact;
  };
  const shown = name(value);
  const [text, setText] = useState(shown),
    [open, setOpen] = useState(false),
    [items, setItems] = useState<ResourceMatch[]>([]),
    [active, setActive] = useState(-1),
    [error, setError] = useState("");
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 240,
    maxHeight: 240,
  });
  const input = useRef<HTMLInputElement>(null),
    id = useId(),
    skipBlur = useRef(false),
    focused = useRef(false),
    ticket = useRef(0);
  const omitted = JSON.stringify(exclude);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [value, shown]);
  useEffect(() => {
    if (!open) return;
    const serial = ++ticket.current;
    setItems([]);
    setActive(-1);
    const timer = window.setTimeout(() => {
      void request<ResourceMatch[]>("resourceSuggestions", {
        query: text === shown ? "" : text,
        classesOnly,
        exclude,
      })
        .then((values) => {
          if (ticket.current === serial) {
            setItems(values);
            setError("");
          }
        })
        .catch(() => {
          if (ticket.current === serial)
            setError("Search unavailable. Try again.");
        });
    }, 80);
    return () => {
      clearTimeout(timer);
      ++ticket.current;
    };
  }, [text, open, s.version, s.datasetEpoch, classesOnly, omitted]);
  useEffect(() => {
    if (!open) return;
    const owner = input.current!.ownerDocument.defaultView!;
    const place = () => {
      const r = input.current!.getBoundingClientRect();
      const below = owner.innerHeight - r.bottom - 12;
      const height = Math.max(
        100,
        Math.min(240, below >= 160 ? below : r.top - 12),
      );
      setPosition({
        left: Math.max(
          8,
          Math.min(r.left, owner.innerWidth - Math.max(240, r.width) - 8),
        ),
        top: below >= 160 ? r.bottom + 2 : r.top - height - 2,
        width: Math.min(owner.innerWidth - 16, Math.max(240, r.width)),
        maxHeight: height,
      });
    };
    place();
    owner.addEventListener("resize", place);
    owner.addEventListener("scroll", place, true);
    return () => {
      owner.removeEventListener("resize", place);
      owner.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (active >= 0)
      input.current?.ownerDocument
        .getElementById(id + "-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (iri: string) => {
    skipBlur.current = true;
    setText(name(iri));
    setOpen(false);
    setError("");
    change(iri);
    input.current?.blur();
  };
  const commit = () => {
    if (text === shown) return;
    const normalized = text.trim().toLocaleLowerCase();
    const exact = items.filter((e) =>
      [e.label, e.identifier, e.iri].some(
        (n) => n.toLocaleLowerCase() === normalized,
      ),
    );
    if (exact.length === 1) {
      choose(exact[0].iri);
      return;
    }
    if (
      !classesOnly &&
      /^(?:[a-z][a-z0-9+.-]*:|<)|^[\p{L}\p{N}_-]+$/iu.test(text.trim()) &&
      !/\s/.test(text.trim())
    ) {
      choose(expandIri(text, namespace));
      return;
    }
    setError(
      classesOnly
        ? "Choose a class from the matches."
        : "Choose a match or enter a resource IRI.",
    );
  };
  return (
    <div className="resource-input">
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        title={value}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? id + "-" + active : undefined
        }
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
        value={text}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onFocus={(e) => {
          focused.current = true;
          skipBlur.current = false;
          setOpen(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setError("");
        }}
        onBlur={() => {
          focused.current = false;
          setOpen(false);
          if (!skipBlur.current) commit();
          skipBlur.current = false;
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((i) =>
              items.length
                ? Math.max(
                    0,
                    Math.min(
                      items.length - 1,
                      i + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  )
                : -1,
            );
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            skipBlur.current = true;
            setText(shown);
            setError("");
            setOpen(false);
            input.current?.blur();
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && active >= 0 && items[active]) choose(items[active].iri);
            else commit();
          }
        }}
      />
      {error && (
        <small role="alert" id={id + "-error"}>
          {error}
        </small>
      )}
      {open &&
        createPortal(
          <div
            id={id}
            role="listbox"
            aria-label={label + " matches"}
            className="resource-matches"
            style={position}
          >
            {items.map((item, i) => (
              <div
                id={id + "-" + i}
                key={item.iri}
                role="option"
                aria-selected={active === i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(item.iri)}
                title={item.iri}
              >
                <span>{item.label}</span>
                <small>
                  {item.identifier === item.label ? item.iri : item.identifier}
                </small>
              </div>
            ))}
            {!items.length && (
              <div className="muted">Type a name or IRI to find matches.</div>
            )}
          </div>,
          input.current?.ownerDocument.body ?? document.body,
        )}
    </div>
  );
}
