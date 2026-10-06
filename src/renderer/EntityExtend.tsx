import { useId, useLayoutEffect, useRef } from "react";
import { extendControl, type ExtendRelation } from "../shared/entity-extend";
import { THING } from "../domain/model";
import type { FindRow } from "../shared/find";
import { suspendMenus } from "./access-keys";
import { usePaneLayout } from "./AdaptivePane";
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
  const layout = usePaneLayout();
  const control = extendControl(row.kind, query, row.synonym, narrow, added);
  const relations = control.relations.filter(
    (relation) => relation.door !== "sibling" || row.iri !== THING,
  );
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
  const recordSynonym = () => {
    const cluster = root.current;
    // The main action (or an individual's entire cluster) disappears after the
    // write. Keep keyboard focus on the stable row before that can happen.
    if (cluster?.contains(cluster.ownerDocument.activeElement))
      cluster.parentElement
        ?.closest<HTMLElement>("[tabindex]")
        ?.focus({ preventScroll: true });
    synonym();
  };
  const focusItem = (item: HTMLButtonElement | undefined | null) => {
    const popup = menu.current;
    if (!item || !popup) return;
    item.focus({ preventScroll: true });
    // Scroll only the popup, never the result row or its retained scroll area.
    const scale = Number(
      popup.closest<HTMLElement>(".adaptive-pane")?.dataset.paneZoom ?? 1,
    );
    const box = popup.getBoundingClientRect(),
      target = item.getBoundingClientRect();
    const top = box.top + popup.clientTop * scale;
    const bottom = top + popup.clientHeight * scale;
    if (target.top < top) popup.scrollTop += (target.top - top) / scale;
    else if (target.bottom > bottom)
      popup.scrollTop += (target.bottom - bottom) / scale;
  };
  const position = () => {
    const button = trigger.current,
      popup = menu.current;
    if (!button || !popup) return;
    const rect = button.getBoundingClientRect(),
      win = button.ownerDocument.defaultView!;
    const scale = Number(
      button.closest<HTMLElement>(".adaptive-pane")?.dataset.paneZoom ?? 1,
    );
    // A top-layer popup still inherits the pane's CSS zoom. Viewport dimensions
    // are physical CSS pixels; its sizing/position properties are unzoomed.
    popup.style.setProperty(
      "--ext-menu-width",
      Math.max(1, (win.innerWidth - 16) / scale) + "px",
    );
    popup.style.setProperty(
      "--ext-menu-height",
      Math.max(1, (win.innerHeight - 16) / scale) + "px",
    );
    const { width, height } = popup.getBoundingClientRect();
    Object.assign(popup.style, {
      left:
        Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8)) /
          scale +
        "px",
      top:
        Math.max(
          8,
          Math.min(rect.bottom + 3 * scale, win.innerHeight - height - 8),
        ) /
          scale +
        "px",
    });
    // Resizing or zooming an already-open menu can move its focused choice out
    // of the newly constrained scroll area without another navigation key.
    const focused = popup.ownerDocument.activeElement;
    if (focused?.matches(".ext-item") && popup.contains(focused))
      focusItem(focused as HTMLButtonElement);
  };
  useLayoutEffect(() => {
    if (!open || layout.recovery || !menu.current) return;
    const popup = menu.current;
    popup.showPopover();
    position();
    if (keyboardOpen.current)
      focusItem(
        popup.querySelector<HTMLButtonElement>("button:not(:disabled)"),
      );
    const doc = popup.ownerDocument,
      win = doc.defaultView!;
    const resume = suspendMenus(doc);
    const outside = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      close(false);
    };
    let frame = 0;
    const schedulePosition = () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(position);
    };
    const observer = new win.ResizeObserver(schedulePosition);
    observer.observe(popup);
    if (trigger.current) observer.observe(trigger.current);
    doc.addEventListener("pointerdown", outside, true);
    win.addEventListener("resize", schedulePosition);
    win.addEventListener("scroll", schedulePosition, true);
    return () => {
      resume();
      observer.disconnect();
      win.cancelAnimationFrame(frame);
      if (popup.matches(":popover-open")) popup.hidePopover();
      doc.removeEventListener("pointerdown", outside, true);
      win.removeEventListener("resize", schedulePosition);
      win.removeEventListener("scroll", schedulePosition, true);
    };
  }, [open, layout.recovery]);
  useLayoutEffect(() => {
    if (open) position();
  }, [layout.width, layout.height, narrow, control.form, open]);
  useLayoutEffect(() => {
    if (!ready || layout.recovery || control.form === "empty") setOpen(false);
  }, [ready, layout.recovery, control.form]);
  if (control.form === "empty") return null;
  const main = !folded && control.synonym;
  const more = folded || relations.length > 0;
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
          onClick={recordSynonym}
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
      {more && open && !layout.recovery && (
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
            if (event.key.length === 1 && /\p{L}/u.test(event.key)) {
              for (let offset = 1; offset <= items.length; offset++) {
                const index = (current + offset) % items.length;
                if (
                  items[index].textContent
                    ?.toLocaleLowerCase()
                    .startsWith(event.key.toLocaleLowerCase())
                ) {
                  next = index;
                  break;
                }
              }
            }
            if (next >= 0) {
              event.preventDefault();
              focusItem(items[next]);
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
                  recordSynonym();
                }}
              >
                <span className="ext-label">Synonym</span>
                <span className="ext-predicate">rdfs:seeAlso</span>
              </button>
              {!!relations.length && (
                <span role="separator" className="ext-separator" />
              )}
            </>
          )}
          {relations.map((relation) => (
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
          {!folded && !!relations.length && (
            <>
              <span role="separator" className="ext-separator" />
              <span className="ext-caption">
                {row.kind === "Class" || row.kind === "Defined"
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
