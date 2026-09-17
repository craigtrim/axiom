import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { suspendMenus } from "./access-keys";
export interface ContextAction {
  label: string;
  title?: string;
  key: string;
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
  run: () => unknown;
  children?: (ContextAction | null)[];
}
export function AccessLabel({
  label,
  letter,
}: {
  label: string;
  letter: string;
}) {
  const i = label.toUpperCase().indexOf(letter);
  return i < 0 ? (
    <>
      {label} (<u>{letter}</u>)
    </>
  ) : (
    <>
      {label.slice(0, i)}
      <u>{label[i]}</u>
      {label.slice(i + 1)}
    </>
  );
}

export function ContextMenu({
  actions,
  document: doc,
  x,
  y,
  close,
  label = "Entity actions",
  owner,
  dismiss,
  parentRect,
}: {
  actions: (ContextAction | null)[];
  document: Document;
  x: number;
  y: number;
  close: () => void;
  label?: string;
  owner?: string;
  dismiss?: () => void;
  parentRect?: DOMRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const id = useId(),
    ownerId = owner ?? id;
  const [submenu, setSubmenu] = useState<{
    action: ContextAction;
    rect: DOMRect;
  } | null>(null);
  const openSubmenu = (a: ContextAction) => {
    if (!a.children || a.enabled === false) return;
    const button = [
      ...ref.current!.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.dataset.menuKey === a.key);
    if (button) setSubmenu({ action: a, rect: button.getBoundingClientRect() });
  };
  const restore = useRef<HTMLElement | null>(null);
  const items = actions
    .filter((a) => a === null || a.visible !== false)
    .filter(
      (a, i, all) =>
        a !== null || (i > 0 && i < all.length - 1 && all[i - 1] !== null),
    );
  // Filtering may leave a trailing separator after a hidden group.
  while (items.at(-1) === null) items.pop();
  useEffect(() => {
    const m = ref.current!,
      win = doc.defaultView!,
      resume = suspendMenus(doc);
    restore.current = doc.activeElement as HTMLElement | null;
    const position = () => {
      const r = m.getBoundingClientRect();
      m.style.left =
        Math.max(
          4,
          Math.min(
            parentRect && x + r.width > win.innerWidth - 4
              ? parentRect.left - r.width
              : x,
            win.innerWidth - r.width - 4,
          ),
        ) + "px";
      m.style.top =
        Math.max(4, Math.min(y, win.innerHeight - r.height - 4)) + "px";
    };
    position();
    m.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (e: PointerEvent) => {
      if (
        (e.target as HTMLElement)
          .closest(".entity-context-menu")
          ?.getAttribute("data-menu-owner") !== ownerId
      )
        (dismiss ?? close)();
    };
    const blur = () => {
      restore.current = null;
      close();
    };
    doc.addEventListener("pointerdown", outside);
    win.addEventListener("resize", position);
    win.addEventListener("blur", blur);
    return () => {
      clearTimeout(hoverTimer.current);
      doc.removeEventListener("pointerdown", outside);
      win.removeEventListener("resize", position);
      win.removeEventListener("blur", blur);
      resume();
      if (restore.current?.isConnected)
        restore.current.focus({ preventScroll: true });
    };
  }, []);
  const invoke = (a: ContextAction) => {
    if (a.enabled === false) return;
    if (a.children) {
      openSubmenu(a);
      return;
    }
    (dismiss ?? close)();
    void a.run();
  };
  return createPortal(
    <>
      <div
        data-menu-owner={ownerId}
        role="menu"
        aria-label={label}
        className="entity-context-menu"
        ref={ref}
        style={{ left: x, top: y }}
        onPointerLeave={() => clearTimeout(hoverTimer.current)}
        onKeyDown={(e) => {
          e.stopPropagation();
          const buttons = [
            ...ref.current!.querySelectorAll<HTMLButtonElement>("button"),
          ];
          const i = buttons.indexOf(doc.activeElement as HTMLButtonElement);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            buttons[
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                    buttons.length
            ]?.focus();
          }
          if (e.key === "ArrowRight") {
            const a = items.find((a) => a?.key === buttons[i]?.dataset.menuKey);
            if (a?.children) {
              e.preventDefault();
              openSubmenu(a);
            }
          }
          if (e.key === "ArrowLeft" && parentRect) {
            e.preventDefault();
            close();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const candidates = [
              ...doc.querySelectorAll<HTMLElement>(
                "a[href],button,input,select,textarea,[tabindex]",
              ),
            ].filter(
              (el) =>
                el.tabIndex >= 0 &&
                !ref.current!.contains(el) &&
                !el.matches(":disabled,[aria-disabled=true]") &&
                !el.closest("[inert]") &&
                el.getClientRects().length,
            );
            const at = candidates.indexOf(restore.current!);
            restore.current =
              candidates[
                at < 0
                  ? e.shiftKey
                    ? candidates.length - 1
                    : 0
                  : (at + (e.shiftKey ? -1 : 1) + candidates.length) %
                    candidates.length
              ] ?? null;
            close();
          }
          if (
            !e.ctrlKey &&
            !e.metaKey &&
            !e.nativeEvent.isComposing &&
            e.key.length === 1 &&
            e.key !== " "
          ) {
            const a = items.find((a) => a?.key === e.key.toUpperCase());
            if (a) {
              e.preventDefault();
              invoke(a);
            }
          }
        }}
      >
        {items.map((a, i) =>
          a === null ? (
            <div
              key={"separator-" + i}
              role="separator"
              aria-orientation="horizontal"
              className="menu-separator"
            />
          ) : (
            <button
              key={a.key}
              data-menu-key={a.key}
              aria-haspopup={a.children ? "menu" : undefined}
              aria-expanded={
                a.children ? submenu?.action.key === a.key : undefined
              }
              role={a.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={a.checked}
              aria-disabled={a.enabled === false || undefined}
              aria-keyshortcuts={"Alt+" + a.key}
              title={a.title}
              tabIndex={-1}
              onPointerMove={(e) => {
                clearTimeout(hoverTimer.current);
                if (doc.activeElement !== e.currentTarget)
                  e.currentTarget.focus({ preventScroll: true });
                if (a.children) {
                  if (submenu?.action.key !== a.key) openSubmenu(a);
                } else if (submenu)
                  hoverTimer.current = setTimeout(() => setSubmenu(null), 220);
              }}
              onClick={() => invoke(a)}
            >
              <span className="menu-check" aria-hidden="true">
                {a.checked ? "✓" : ""}
              </span>
              <span>
                <AccessLabel label={a.label} letter={a.key} />
                {a.children && (
                  <span className="menu-submenu-arrow" aria-hidden="true">
                    ›
                  </span>
                )}
              </span>
            </button>
          ),
        )}
      </div>
      {submenu && (
        <ContextMenu
          actions={submenu.action.children!}
          document={doc}
          x={submenu.rect.right - 2}
          y={submenu.rect.top}
          parentRect={submenu.rect}
          owner={ownerId}
          dismiss={dismiss ?? close}
          close={() => setSubmenu(null)}
          label={submenu.action.label}
        />
      )}
    </>,
    doc.body,
  );
}
