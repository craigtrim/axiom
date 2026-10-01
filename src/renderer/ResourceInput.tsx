import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { request, useSnapshot } from "./client";
import type { ResourceMatch } from "../domain/resource-search";
import { compactIri, expandIri } from "../shared/terms";
import { displayName } from "../domain/rdf-model";
import { progressiveSearch } from "./progressive-search";
export function ResourceInput({
  value,
  namespace,
  label,
  classesOnly = false,
  exclude = [],
  disabled = false,
  change,
  textValue = false,
  commitOnBlur = true,
  useText,
}: {
  value: string;
  namespace: string;
  label: string;
  classesOnly?: boolean;
  exclude?: string[];
  disabled?: boolean;
  change(value: string): void;
  textValue?: boolean;
  commitOnBlur?: boolean;
  useText?(value: string): void;
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
  const shown = textValue ? value : name(value);
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
    consumer = useRef(crypto.randomUUID()).current;
  const currentSelection = useRef({ items, active });
  currentSelection.current = { items, active };
  const omitted = JSON.stringify(exclude);
  const scope = JSON.stringify([
    s.datasetEpoch,
    namespace,
    classesOnly,
    omitted,
  ]);
  const key = JSON.stringify([
    scope,
    s.version,
    text,
    shown,
    textValue,
    disabled,
  ]);
  const latest = useRef(key),
    settled = useRef("");
  latest.current = key;
  const alive = useRef(true),
    intent = useRef(0),
    pending = useRef<string | undefined>(undefined);
  if (pending.current && pending.current !== key) {
    ++intent.current;
    pending.current = undefined;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ++intent.current;
    };
  }, []);
  useLayoutEffect(() => {
    setItems([]);
    setActive(-1);
    setError("");
    settled.current = "";
  }, [scope]);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [value, shown]);
  useEffect(() => {
    if (!open || disabled) return;
    let cancel = () => {};
    const timer = setTimeout(() => {
      cancel = progressiveSearch<ResourceMatch[]>(
        request,
        "resourceSuggestions",
        {
          query: text === shown && !textValue ? "" : text,
          classesOnly,
          exclude,
          consumer,
          searchId: crypto.randomUUID(),
        },
        (values) => {
          if (latest.current !== key) return;
          const selection = currentSelection.current;
          const iri = selection.items[selection.active]?.iri;
          const literal =
            !!useText && selection.active === selection.items.length;
          const nextActive = literal
            ? values.length
            : iri
              ? values.findIndex((item) => item.iri === iri)
              : -1;
          setActive(nextActive);
          setItems(values);
          currentSelection.current = { items: values, active: nextActive };
          settled.current = key;
          setError((previous) =>
            previous === "Search unavailable. Try again." ? "" : previous,
          );
        },
        () => {
          if (latest.current === key)
            setError("Search unavailable. Try again.");
        },
      );
    }, 120);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [key, open]);
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
    if (disabled || !alive.current) return;
    skipBlur.current = true;
    setText(name(iri));
    setOpen(false);
    setError("");
    change(iri);
    input.current?.blur();
  };
  const withCurrentMatches = async (
    apply: (values: ResourceMatch[]) => void,
    chosen?: string,
  ) => {
    if (disabled || pending.current === key) return;
    const ticket = ++intent.current;
    pending.current = key;
    const current = () =>
      alive.current && latest.current === key && ticket === intent.current;
    const args = {
      query: text === shown && !textValue ? "" : text,
      classesOnly,
      exclude,
      consumer: consumer + ":commit",
      searchId: crypto.randomUUID(),
    };
    let requested = false;
    try {
      let values = currentSelection.current.items;
      if (settled.current !== key) {
        requested = true;
        values = await request<ResourceMatch[]>("resourceSuggestions", args);
        if (!current()) return;
        // An explicitly selected semantic match may not be in the lexical pass.
        if (chosen && !values.some((item) => item.iri === chosen))
          values =
            (await request<ResourceMatch[] | undefined>(
              "resourceSuggestionsSemantic",
              args,
            )) ?? values;
      }
      if (current()) apply(values);
    } catch {
      if (current()) setError("Search unavailable. Try again.");
    } finally {
      if (ticket === intent.current) pending.current = undefined;
      if (requested) void request("cancelSearch", args).catch(() => {});
    }
  };
  const chooseMatch = (iri: string) =>
    void withCurrentMatches((values) => {
      if (values.some((item) => item.iri === iri)) choose(iri);
      else
        setError("That match is no longer available. Choose a current match.");
    }, iri);
  const chooseText = () => {
    if (disabled || !alive.current) return;
    ++intent.current;
    pending.current = undefined;
    skipBlur.current = true;
    setOpen(false);
    setError("");
    useText?.(text);
    input.current?.blur();
  };
  const commit = () => {
    if (text === shown && (!textValue || useText)) return;
    // A complete IRI remains a resource even if Enter/Tab beats the search
    // debounce. Plain annotation text still has an explicit literal option.
    if (
      !classesOnly &&
      !textValue &&
      /^(?:[a-z][a-z0-9+.-]*:|<)/iu.test(text.trim()) &&
      !/\s/.test(text.trim())
    ) {
      choose(expandIri(text, namespace));
      return;
    }
    if (textValue && useText) {
      chooseText();
      return;
    }
    void withCurrentMatches((values) => {
      const normalized = text.trim().toLocaleLowerCase();
      const exact = values.filter((e) =>
        [e.label, e.identifier, e.iri].some(
          (n) => n.toLocaleLowerCase() === normalized,
        ),
      );
      if (useText && (textValue || !exact.length)) {
        chooseText();
        return;
      }
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
    });
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
        }}
        onBlur={() => {
          focused.current = false;
          setOpen(false);
          if (!skipBlur.current && commitOnBlur) commit();
          skipBlur.current = false;
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((i) =>
              items.length + (useText ? 1 : 0)
                ? Math.max(
                    0,
                    Math.min(
                      items.length - 1 + (useText ? 1 : 0),
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
            ++intent.current;
            pending.current = undefined;
            setText(shown);
            setError("");
            setOpen(false);
            input.current?.blur();
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && active >= 0 && items[active])
              chooseMatch(items[active].iri);
            else if (open && active === items.length && useText) chooseText();
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
                onClick={() => chooseMatch(item.iri)}
                title={item.iri}
              >
                <span>{item.label}</span>
                <small>
                  {item.identifier === item.label ? item.iri : item.identifier}
                </small>
              </div>
            ))}
            {useText && (
              <div
                id={id + "-" + items.length}
                role="option"
                aria-selected={active === items.length}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(items.length)}
                onClick={chooseText}
              >
                <span>Use text “{text}”</span>
                <small>Store a text value</small>
              </div>
            )}
            {!items.length && !useText && (
              <div className="muted">Type a name or IRI to find matches.</div>
            )}
          </div>,
          input.current?.ownerDocument.body ?? document.body,
        )}
    </div>
  );
}
