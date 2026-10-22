import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { request, useSnapshot } from "./client";
import type { ResourceMatch } from "../domain/resource-search";
import { compactIri, expandIri } from "../shared/terms";
import { displayName } from "../domain/rdf-model";
import { progressiveSearch } from "./progressive-search";
import { SeeAlsoWarning } from "./SeeAlsoWarning";
import { THING } from "../domain/model";
export function ResourceInput({
  value,
  namespace,
  label,
  classesOnly = false,
  createMissingClass = false,
  exclude = [],
  disabled = false,
  change,
  textValue = false,
  commitOnBlur = true,
  useText,
  seeAlsoSubject,
}: {
  value: string;
  namespace: string;
  label: string;
  classesOnly?: boolean;
  createMissingClass?: boolean;
  exclude?: string[];
  disabled?: boolean;
  change(value: string): void;
  textValue?: boolean;
  commitOnBlur?: boolean;
  useText?(value: string): void;
  seeAlsoSubject?: string;
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
  // Issue 158: a draft belongs to one value, even before layout effects move focus.
  const identity = JSON.stringify([
    s.datasetEpoch,
    namespace,
    value,
    textValue,
  ]);
  const [draft, setDraft] = useState({ identity, text: shown });
  const text = draft.identity === identity ? draft.text : shown;
  const setText = (text: string) => setDraft({ identity, text });
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<ResourceMatch[]>([]),
    [active, setActive] = useState(-1),
    [error, setError] = useState("");
  if (draft.identity !== identity) {
    setDraft({ identity, text: shown });
    setOpen(false);
    setItems([]);
    setActive(-1);
    setError("");
  }
  const [creating, setCreating] = useState(false);
  const creationPending = useRef(false);
  // craigtrim/axiom#72: check every class, including matches outside the suggestion limit.
  const exactClasses = createMissingClass
    ? s.entities.filter(
        (e) =>
          ["Class", "Defined"].includes(e.kind) &&
          [displayName(e), compactIri(e.iri, s.ontology.namespace), e.iri].some(
            (name) =>
              name.toLocaleLowerCase() === text.trim().toLocaleLowerCase(),
          ),
      )
    : [];
  const creationNote =
    createMissingClass &&
    text !== shown &&
    !!text.trim() &&
    !exactClasses.length;
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
  // craigtrim/axiom#35: the typed text is the first option, ahead of every match.
  const textOption = !!useText && text.trim() !== "",
    offset = textOption ? 1 : 0;
  const currentSelection = useRef({ items, active, offset });
  currentSelection.current = { items, active, offset };
  const omitted = JSON.stringify(exclude);
  const scope = JSON.stringify([
    s.datasetEpoch,
    namespace,
    classesOnly,
    omitted,
  ]);
  const key = JSON.stringify([
    identity,
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
          const iri = selection.items[selection.active - selection.offset]?.iri;
          const literal = selection.offset === 1 && selection.active === 0;
          const index = iri ? values.findIndex((item) => item.iri === iri) : -1;
          const nextActive = literal ? 0 : index >= 0 ? index + offset : -1;
          setActive(nextActive);
          setItems(values);
          currentSelection.current = {
            items: values,
            active: nextActive,
            offset,
          };
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
      // Issue 85 reveals a tools line under a focused single Details value.
      // Leave its Add action reachable while the resource choices are open.
      const tools = input
        .current!.closest(".details-pane .statement-group-row")
        ?.querySelector<HTMLElement>(".statement-single-tools");
      const bottom = Math.max(
        r.bottom,
        tools?.getBoundingClientRect().bottom ?? r.bottom,
      );
      const below = owner.innerHeight - bottom - 12;
      const height = Math.max(
        100,
        Math.min(240, below >= 160 ? below : r.top - 12),
      );
      setPosition({
        left: Math.max(
          8,
          Math.min(r.left, owner.innerWidth - Math.max(240, r.width) - 8),
        ),
        top: below >= 160 ? bottom + 2 : r.top - height - 2,
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
    if (disabled || !alive.current || latest.current !== key) return;
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
    if (disabled || !alive.current || latest.current !== key) return;
    ++intent.current;
    pending.current = undefined;
    skipBlur.current = true;
    setOpen(false);
    setError("");
    useText?.(text);
    input.current?.blur();
  };
  const currentCreation = useRef({ scope, identity, change });
  currentCreation.current = { scope, identity, change };
  const sameCreation = () =>
    alive.current &&
    currentCreation.current.scope === scope &&
    currentCreation.current.identity === identity;
  const createParent = async () => {
    if (creationPending.current || disabled) return;
    creationPending.current = true;
    setCreating(true);
    setError("");
    try {
      const iri = await request<string>("createClass", {
        name: text.trim(),
        parent: THING,
        datasetEpoch: s.datasetEpoch,
        version: s.version,
        preserveSelection: true,
      });
      if (!sameCreation()) return;
      skipBlur.current = true;
      setText(text.trim());
      setOpen(false);
      currentCreation.current.change(iri);
      input.current?.blur();
    } catch (e) {
      if (sameCreation())
        setError(
          (e as Error).message.replace(
            /^Error invoking remote method '[^']+': Error: /,
            "",
          ),
        );
    } finally {
      creationPending.current = false;
      if (alive.current) setCreating(false);
    }
  };
  const commit = () => {
    if (draft.identity !== identity || latest.current !== key) return;
    if (creationPending.current) return;
    if (text === shown && (!textValue || useText)) return;
    if (createMissingClass) {
      if (exactClasses.length === 1 && !exclude.includes(exactClasses[0].iri))
        choose(exactClasses[0].iri);
      else if (creationNote) void createParent();
      else setError("Choose a class from the matches.");
      return;
    }
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
        aria-describedby={
          error ? id + "-error" : creationNote ? id + "-create" : undefined
        }
        value={text}
        disabled={disabled || creating}
        autoComplete="off"
        spellCheck={false}
        onFocus={(e) => {
          focused.current = true;
          skipBlur.current = false;
          // A highlight from an earlier visit could now name another row.
          setActive(-1);
          setOpen(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setError("");
          // A keystroke drops any highlight, so Enter keeps the typed text.
          setActive(-1);
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
              items.length + offset
                ? Math.max(
                    0,
                    Math.min(
                      items.length - 1 + offset,
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
            setActive(-1);
            setError("");
            setOpen(false);
            input.current?.blur();
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && textOption && active === 0) chooseText();
            else if (open && active >= offset && items[active - offset])
              chooseMatch(items[active - offset].iri);
            else commit();
          }
        }}
      />
      {seeAlsoSubject && (
        <SeeAlsoWarning
          subject={seeAlsoSubject}
          term={{
            literal:
              text === shown
                ? textValue
                : !!useText && !/^[a-z][a-z0-9+.-]*:/iu.test(text.trim()),
            value: text === shown ? value : text,
          }}
        />
      )}
      {error && (
        <small role="alert" id={id + "-error"}>
          {error}
        </small>
      )}
      {creationNote && !error && (
        <small
          className="resource-create-note"
          id={id + "-create"}
          role="status"
        >
          “{text.trim()}” will be created as a new class.
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
            {/* Hover only shades a row; Enter acts on the keyboard highlight. */}
            {textOption && (
              <div
                id={id + "-0"}
                role="option"
                aria-selected={active === 0}
                className="resource-text-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={chooseText}
                title={text}
              >
                <span>“{text}”</span>
                <small>Store a text value</small>
              </div>
            )}
            {items.map((item, i) => (
              <div
                id={id + "-" + (i + offset)}
                key={item.iri}
                role="option"
                aria-selected={active === i + offset}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => chooseMatch(item.iri)}
                title={item.iri}
              >
                <span>{item.label}</span>
                <small>
                  {item.identifier === item.label ? item.iri : item.identifier}
                </small>
              </div>
            ))}
            {!items.length && !textOption && (
              <div className="muted">Type a name or IRI to find matches.</div>
            )}
          </div>,
          input.current?.ownerDocument.body ?? document.body,
        )}
    </div>
  );
}
