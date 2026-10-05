import { useId, useLayoutEffect, useRef } from "react";
import { extendControl, type ExtendRelation } from "../shared/entity-extend";
import type { FindRow } from "../shared/find";
import { suspendMenus } from "./access-keys";
import "./entity-extend.css";

/** Reveal a quiet cluster before focusing a trigger that may be visibility:hidden. */
export function focusEntityExtendTrigger(button: HTMLButtonElement | null) {
  if (!button?.isConnected || button.disabled) return;
  button
    .closest(".entity-extend")
    ?.parentElement?.closest<HTMLElement>("[tabindex]")
    ?.focus({ preventScroll: true });
  button.focus({ preventScroll: true });
}

/** An in-place annotation on the face, creation through the relation menu. */
export function EntityExtend({
  row,
  query,
  narrow,
  ready,
  pending,
  added,
  open,
  setOpen,
  synonym,
  create,
}: {
  row: FindRow;
  query: string;
  narrow: boolean;
  ready: boolean;
  pending: boolean;
  added: boolean;
  open: boolean;
  setOpen(open: boolean): void;
  synonym(): void;
  create(relation: ExtendRelation, trigger: HTMLButtonElement): void;
}) {
  const control = extendControl(row.kind, query, row.synonym, narrow, added);
  const folded = control.form === "folded";
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) focusEntityExtendTrigger(trigger.current);
  };
  const position = () => {
    const button = trigger.current,
      popup = menu.current;
    if (!button || !popup) return;
    popup.style.overflowY =
      popup.scrollHeight > popup.clientHeight ? "auto" : "visible";
    const rect = button.getBoundingClientRect(),
      win = button.ownerDocument.defaultView!;
    const scale = Number(
      button.closest<HTMLElement>(".adaptive-pane")?.dataset.paneZoom ?? 1,
    );
    const width = popup.getBoundingClientRect().width / scale;
    const height = popup.getBoundingClientRect().height / scale;
    Object.assign(popup.style, {
      left:
        Math.max(
          8,
          Math.min(
            rect.right / scale - width,
            win.innerWidth / scale - width - 8,
          ),
        ) + "px",
      top:
        Math.max(
          8,
          Math.min(
            rect.bottom / scale + 3,
            win.innerHeight / scale - height - 8,
          ),
        ) + "px",
    });
  };
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const popup = menu.current;
    popup.showPopover();
    position();
    if (keyboardOpen.current)
      popup
        .querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus({ preventScroll: true });
    const doc = popup.ownerDocument,
      win = doc.defaultView!;
    const resume = suspendMenus(doc);
    const outside = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      close(false);
      if (!(event.target as HTMLElement).closest(".entity-extend"))
        win.requestAnimationFrame(() =>
          focusEntityExtendTrigger(trigger.current),
        );
    };
    doc.addEventListener("pointerdown", outside, true);
    win.addEventListener("resize", position);
    win.addEventListener("scroll", position, true);
    return () => {
      resume();
      if (popup.matches(":popover-open")) popup.hidePopover();
      doc.removeEventListener("pointerdown", outside, true);
      win.removeEventListener("resize", position);
      win.removeEventListener("scroll", position, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (open) position();
  }, [narrow, control.form]);
  useLayoutEffect(() => {
    if (!ready || control.form === "empty") setOpen(false);
  }, [ready, control.form]);
  if (control.form === "empty") return null;
  const main = !folded && control.synonym;
  const more = folded || control.relations.length > 0;
  const title = `Add ${query.trim()} as a synonym of ${row.name}`;
  return (
    <span
      ref={root}
      className="entity-extend"
      data-open={open || undefined}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (open && event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      {!ready && (
        <span className="sr-only" id={id + "-busy"}>
          Finishing the current search
        </span>
      )}
      {main && (
        <button
          type="button"
          className={`ext-action ext-main find-synonym${!more ? " ext-only" : ""}`}
          title={title}
          aria-label={title}
          disabled={!ready || pending}
          aria-describedby={!ready ? id + "-busy" : undefined}
          onClick={synonym}
        >
          + <span>Synonym</span>
        </button>
      )}
      {more && (
        <button
          type="button"
          ref={trigger}
          className={`ext-action ${folded ? "ext-main ext-only" : "ext-more"}`}
          aria-label={`More ways to extend ${row.name}`}
          title={`More ways to extend ${row.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          disabled={!ready}
          aria-describedby={!ready ? id + "-busy" : undefined}
          onClick={(event) => {
            keyboardOpen.current = event.detail === 0;
            setOpen(!open);
          }}
        >
          {folded ? "+" : "v"}
        </button>
      )}
      {more && open && (
        <div
          ref={menu}
          id={id}
          popover="manual"
          className="ext-menu"
          role="menu"
          aria-label={folded ? row.name : `Under ${row.name}`}
          onKeyDown={(event) => {
            event.stopPropagation();
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ];
            const current = items.indexOf(
              event.currentTarget.ownerDocument
                .activeElement as HTMLButtonElement,
            );
            let next = -1;
            if (event.key === "Escape") {
              event.preventDefault();
              close();
              return;
            }
            if (event.key === "Tab") {
              close();
              return;
            }
            if (event.key === "ArrowDown") next = (current + 1) % items.length;
            if (event.key === "ArrowUp")
              next = (current - 1 + items.length) % items.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = items.length - 1;
            if (event.key.length === 1 && /\p{L}/u.test(event.key))
              next = items.findIndex((item) =>
                item.textContent
                  ?.toLocaleLowerCase()
                  .startsWith(event.key.toLocaleLowerCase()),
              );
            if (next >= 0) {
              event.preventDefault();
              items[next]?.focus({ preventScroll: true });
            }
          }}
        >
          <span className="ext-caption">
            {folded ? row.name : `Under ${row.name}`}
          </span>
          {folded && control.synonym && (
            <>
              <button
                type="button"
                role="menuitem"
                className="ext-item"
                title={title}
                disabled={!ready || pending}
                aria-describedby={!ready ? id + "-busy" : undefined}
                onClick={() => {
                  close();
                  synonym();
                }}
              >
                <span className="ext-label">Synonym</span>
                <span className="ext-predicate">rdfs:seeAlso</span>
              </button>
              {!!control.relations.length && (
                <span role="separator" className="ext-separator" />
              )}
            </>
          )}
          {control.relations.map((relation) => (
            <button
              type="button"
              role="menuitem"
              disabled={!ready}
              key={relation.door}
              className="ext-item"
              onClick={() => {
                close(false);
                create(relation, trigger.current!);
              }}
            >
              <span className="ext-label">{relation.label}</span>
              <span className="ext-predicate">{relation.predicate}</span>
            </button>
          ))}
          {!folded && !!control.relations.length && (
            <>
              <span role="separator" className="ext-separator" />
              <span className="ext-caption">
                {control.relations.length === 2
                  ? "creates a new class, or a new individual"
                  : "creates a new property"}
              </span>
            </>
          )}
        </div>
      )}
    </span>
  );
}
