import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { suspendMenus } from "./access-keys";
export interface ContextAction {
  label: string;
  key: string;
  enabled?: boolean;
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
  actions: ContextAction[];
  document: Document;
  x: number;
  y: number;
  close: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const m = ref.current!,
      previous = doc.activeElement as HTMLElement | null,
      resume = suspendMenus(doc),
      r = m.getBoundingClientRect();
    m.style.left =
      Math.max(4, Math.min(x, doc.defaultView!.innerWidth - r.width - 4)) +
      "px";
    m.style.top =
      Math.max(4, Math.min(y, doc.defaultView!.innerHeight - r.height - 4)) +
      "px";
    m.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (e: PointerEvent) => {
      if (!m.contains(e.target as Node)) close();
    };
    doc.addEventListener("pointerdown", outside);
    return () => {
      doc.removeEventListener("pointerdown", outside);
      resume();
      previous?.focus();
    };
  }, []);
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
            ...ref.current!.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ],
          i = buttons.indexOf(doc.activeElement as HTMLButtonElement);
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
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          close();
        }
        if (!e.ctrlKey && !e.metaKey && e.key.length === 1) {
          const a = actions.find(
            (a) => a.key === e.key.toUpperCase() && a.enabled !== false,
          );
          if (a) {
            e.preventDefault();
            void a.run();
          }
        }
      }}
    >
      {actions.map((a) => (
        <button
          role="menuitem"
          aria-keyshortcuts={"Alt+" + a.key}
          key={a.key}
          disabled={a.enabled === false}
          onPointerMove={(e) => {
            if (
              !e.currentTarget.disabled &&
              doc.activeElement !== e.currentTarget
            )
              e.currentTarget.focus({ preventScroll: true });
          }}
          onClick={() => void a.run()}
        >
          <AccessLabel label={a.label} letter={a.key} />
        </button>
      ))}
    </div>,
    doc.body,
  );
}
