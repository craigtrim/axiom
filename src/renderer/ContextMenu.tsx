import { useEffect, useRef } from "react";
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
}: {
  actions: (ContextAction | null)[];
  document: Document;
  x: number;
  y: number;
  close: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
        Math.max(4, Math.min(x, win.innerWidth - r.width - 4)) + "px";
      m.style.top =
        Math.max(4, Math.min(y, win.innerHeight - r.height - 4)) + "px";
    };
    position();
    m.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (e: PointerEvent) => {
      if (!m.contains(e.target as Node)) close();
    };
    const blur = () => {
      restore.current = null;
      close();
    };
    doc.addEventListener("pointerdown", outside);
    win.addEventListener("resize", position);
    win.addEventListener("blur", blur);
    return () => {
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
    close();
    void a.run();
  };
  return createPortal(
    <div
      role="menu"
      aria-label={label}
      className="entity-context-menu"
      ref={ref}
      style={{ left: x, top: y }}
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
            role={a.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={a.checked}
            aria-disabled={a.enabled === false || undefined}
            aria-keyshortcuts={"Alt+" + a.key}
            title={a.title}
            tabIndex={-1}
            onPointerMove={(e) => {
              if (doc.activeElement !== e.currentTarget)
                e.currentTarget.focus({ preventScroll: true });
            }}
            onClick={() => invoke(a)}
          >
            <span className="menu-check" aria-hidden="true">
              {a.checked ? "✓" : ""}
            </span>
            <span>
              <AccessLabel label={a.label} letter={a.key} />
            </span>
          </button>
        ),
      )}
    </div>,
    doc.body,
  );
}
