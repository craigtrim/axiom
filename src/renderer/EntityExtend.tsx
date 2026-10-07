import { useId, useLayoutEffect, useRef } from "react";
import {
  extendControl,
  extendGroup,
  type ExtendRelation,
  type ExtendAction,
} from "../shared/entity-extend";
import { rememberExtendAction, useExtendActions } from "./extend-actions";
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

/** The face repeats the last applicable action; the caret always offers choices. */
export function EntityExtend({
  row,
  query,
  ready,
  pending,
  open,
  setOpen,
  synonym,
  create,
}: {
  row: FindRow;
  query: string;
  ready: boolean;
  pending: boolean;
  open: boolean;
  setOpen(open: boolean): void;
  synonym(): void;
  create(relation: ExtendRelation, trigger: HTMLButtonElement): void;
}) {
  const layout = usePaneLayout();
  const preferences = useExtendActions();
  const preferred = preferences[extendGroup(row.kind)] ?? "synonym";
  const control = extendControl(
    row.kind,
    query,
    row.synonym,
    preferred,
    row.iri,
  );
  const relations = control.relations;
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mainButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const keyboardOpen = useRef(false);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) focusEntityExtendTrigger(trigger.current);
  };
  const recordSynonym = () => {
    const cluster = root.current;
    // Keep focus on the stable row while the action is briefly disabled during
    // saving. The action remains available after a successful write.
    if (cluster?.contains(cluster.ownerDocument.activeElement))
      cluster.parentElement
        ?.closest<HTMLElement>("[tabindex]")
        ?.focus({ preventScroll: true });
    synonym();
  };
  const run = (action: ExtendAction, fromMenu = false) => {
    if (!ready || pending) return;
    rememberExtendAction(row.kind, action);
    if (open) close(false);
    if (action === "synonym") recordSynonym();
    else {
      const relation = relations.find((item) => item.door === action);
      if (relation)
        create(relation, fromMenu ? trigger.current! : mainButton.current!);
    }
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
  }, [layout.width, layout.height, control.form, control.primary, open]);
  useLayoutEffect(() => {
    if (!ready || layout.recovery || control.form === "empty") setOpen(false);
  }, [ready, layout.recovery, control.form]);
  if (control.form === "empty") return null;
  const more = control.form === "split";
  const primaryRelation = relations.find(
    (relation) => relation.door === control.primary,
  );
  const synonymTitle = `Add ${query.trim()} as a synonym of ${row.name}`;
  const title =
    control.primary === "synonym"
      ? synonymTitle
      : `Add ${primaryRelation!.label.toLowerCase()} ${control.primary === "sibling" || control.primary === "instance" ? "of" : "under"} ${row.name}`;
  return (
    <span
      ref={root}
      className="entity-extend"
      data-primary-action={control.primary}
      data-open={open || undefined}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (!open && more && ready && !pending && event.key === "ArrowDown") {
          event.preventDefault();
          keyboardOpen.current = true;
          setOpen(true);
        }
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
      {control.primary && (
        <button
          type="button"
          ref={mainButton}
          className={`ext-action ext-main${control.primary === "synonym" ? " find-synonym" : ""}${!more ? " ext-only" : ""}`}
          title={title}
          aria-label={title}
          disabled={!ready || pending}
          aria-describedby={!ready ? id + "-busy" : undefined}
          onClick={() => run(control.primary!)}
        >
          +{" "}
          <span>
            {control.primary === "synonym" ? "Synonym" : primaryRelation!.label}
          </span>
        </button>
      )}
      {more && (
        <button
          type="button"
          ref={trigger}
          className="ext-action ext-more"
          aria-label={`More ways to extend ${row.name}`}
          title={`More ways to extend ${row.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          disabled={!ready || pending}
          aria-describedby={!ready ? id + "-busy" : undefined}
          onClick={(event) => {
            keyboardOpen.current = event.detail === 0;
            setOpen(!open);
          }}
        >
          v
        </button>
      )}
      {more && open && !layout.recovery && (
        <div
          ref={menu}
          id={id}
          popover="manual"
          className="ext-menu"
          role="menu"
          aria-label={row.name}
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
          <span className="ext-caption">{row.name}</span>
          {control.synonym && (
            <>
              <button
                type="button"
                role="menuitem"
                className="ext-item"
                title={synonymTitle}
                disabled={!ready || pending}
                aria-describedby={!ready ? id + "-busy" : undefined}
                onClick={() => run("synonym", true)}
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
              disabled={!ready || pending}
              key={relation.door}
              className="ext-item"
              onClick={() => run(relation.door, true)}
            >
              <span className="ext-label">{relation.label}</span>
              <span className="ext-predicate">{relation.predicate}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
