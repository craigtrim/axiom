import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { usePaneLayout } from "./AdaptivePane";
import { suspendMenus } from "./access-keys";
import { useActionOverflow } from "./useActionOverflow";

// Shared pane behavior for the view migrations in craigtrim/axiom#81.
export interface SharedMenuAction {
  id: string;
  label: string;
  run: () => void;
  disabled?: boolean;
  reason?: string;
  shortcut?: string;
  checked?: boolean;
  commandId?: string;
}
export type SharedMenuItem = SharedMenuAction | { id: string; separator: true };
const openMenus = new WeakMap<
  Document,
  { element: HTMLElement; close: () => void }
>();

export function SharedMenu({
  items,
  trigger,
  label = "More actions",
}: {
  items: readonly SharedMenuItem[];
  trigger: RefObject<HTMLButtonElement | null>;
  label?: string;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { width, height, recovery } = usePaneLayout();
  const close = (restore = false) => {
    const popup = menu.current;
    if (!popup) return;
    if (popup.matches(":popover-open")) popup.hidePopover();
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  const position = () => {
    const popup = menu.current,
      owner = trigger.current;
    if (!popup || !owner) return;
    const win = owner.ownerDocument.defaultView!;
    const scale = owner.getBoundingClientRect().width / owner.offsetWidth || 1;
    const box = owner.getBoundingClientRect();
    const vw = win.innerWidth / scale,
      vh = win.innerHeight / scale;
    popup.style.maxWidth = `${Math.max(0, vw - 8)}px`;
    popup.style.minWidth = `${Math.min(190, Math.max(0, vw - 8))}px`;
    popup.style.maxHeight = `${Math.max(0, vh - 8)}px`;
    const w = popup.getBoundingClientRect().width / scale;
    const h = popup.getBoundingClientRect().height / scale;
    popup.style.left = `${Math.max(4, Math.min(box.right / scale - w, vw - w - 4))}px`;
    popup.style.top = `${
      box.bottom / scale + 2 + h <= vh - 4
        ? box.bottom / scale + 2
        : Math.max(4, box.top / scale - h - 2)
    }px`;
  };
  const show = () => {
    const popup = menu.current;
    if (!popup) return;
    if (popup.matches(":popover-open")) {
      close(true);
      return;
    }
    openMenus.get(popup.ownerDocument)?.close();
    openMenus.set(popup.ownerDocument, {
      element: popup,
      close: () => close(),
    });
    popup.showPopover();
    position();
    setOpen(true);
    (
      popup.querySelector<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? popup
    ).focus();
  };
  useLayoutEffect(() => {
    if (recovery) close();
    else if (menu.current?.matches(":popover-open")) position();
  }, [width, height, recovery, items]);
  useEffect(() => {
    if (!open || !menu.current) return;
    const doc = menu.current.ownerDocument;
    const popup = menu.current;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        close();
    };
    const resume = suspendMenus(doc);
    const dismissResize = () => close();
    doc.addEventListener("pointerdown", dismiss, true);
    doc.defaultView!.addEventListener("resize", dismissResize);
    return () => {
      resume();
      doc.removeEventListener("pointerdown", dismiss, true);
      doc.defaultView!.removeEventListener("resize", dismissResize);
      if (openMenus.get(doc)?.element === popup) openMenus.delete(doc);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn quiet iconbtn"
        aria-label={label}
        aria-haspopup="menu"
        aria-controls={id}
        aria-expanded={open}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
          focusable="false"
        >
          {[5, 12, 19].map((cx) => (
            <circle
              key={cx}
              cx={cx}
              cy="12"
              r="1.3"
              fill="currentColor"
              stroke="none"
            />
          ))}
        </svg>
      </button>
      <div
        ref={menu}
        id={id}
        popover="manual"
        className="menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={(event) => {
          const popup = menu.current!;
          const buttons = [
            ...popup.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
          ];
          const index = buttons.indexOf(
            popup.ownerDocument.activeElement as HTMLButtonElement,
          );
          if (event.key === "Escape" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          } else if (
            ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (!buttons.length) return;
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next].focus();
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            buttons[index]?.click();
          }
        }}
      >
        {items.map((item) =>
          "separator" in item ? (
            <div key={item.id} className="sep" role="separator" />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-shared-overflow={item.commandId}
              aria-disabled={item.disabled || undefined}
              title={item.reason}
              onClick={() => {
                if (!item.disabled) {
                  close(true);
                  item.run();
                }
              }}
            >
              {item.checked ? "✓ " : ""}
              {item.label}
              {item.shortcut && <span className="k">{item.shortcut}</span>}
            </button>
          ),
        )}
      </div>
    </>
  );
}

export interface SharedCommand {
  id: string;
  /** Larger priorities leave first. Equal priorities retain source order. */
  priority: number;
  content: ReactNode;
  overflow: readonly SharedMenuItem[];
}
export function SharedActionRow({
  primary,
  commands = [],
  state,
  stateText,
  stateKind,
  items = [],
  label = "Actions",
}: {
  primary: ReactNode;
  commands?: readonly SharedCommand[];
  state?: ReactNode;
  stateText?: string;
  stateKind?: "warnink" | "okink" | "badink";
  items?: readonly SharedMenuItem[];
  label?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    more = useRef<HTMLButtonElement>(null);
  const stateSlot = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (stateSlot.current)
      stateSlot.current.title =
        stateText ?? stateSlot.current.textContent ?? "";
  }, [state, stateText]);
  const hidden = useActionOverflow(root, more, commands, "shared");
  const overflow = commands
    .filter((c) => hidden.has(c.id))
    .flatMap((c) =>
      c.overflow.map((item) =>
        "separator" in item ? item : { ...item, commandId: c.id },
      ),
    );
  return (
    <div ref={root} className="bar" role="group" aria-label={label}>
      <div className="shared-primary" data-fixed-action>
        {primary}
      </div>
      {state != null && (
        <span
          ref={stateSlot}
          className={"state " + (stateKind ?? "")}
          title={stateText ?? (typeof state === "string" ? state : undefined)}
          data-fixed-action
        >
          <span data-natural-width>{state}</span>
        </span>
      )}
      <span className="od-fill" />
      {commands.map((command) => (
        <div
          key={command.id}
          className="shared-command"
          data-shared-command={command.id}
          data-overflowed={hidden.has(command.id)}
          inert={hidden.has(command.id)}
          aria-hidden={hidden.has(command.id) || undefined}
        >
          {command.content}
        </div>
      ))}
      <SharedMenu trigger={more} items={[...overflow, ...items]} />
    </div>
  );
}

type Notify = (heading: string, detail?: string) => void;
const ToastContext = createContext<Notify | null>(null);
export function usePaneToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("usePaneToast requires a SharedPane");
  return notify;
}
export function SharedPane({
  children,
  footer,
  className = "",
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const toast = useRef<HTMLDivElement>(null);
  const serial = useRef(0);
  const [message, setMessage] = useState<{
    heading: string;
    detail?: string;
    serial: number;
  } | null>(null);
  useEffect(() => {
    if (!message) return;
    const win = toast.current!.ownerDocument.defaultView!;
    const timer = win.setTimeout(() => setMessage(null), 4200);
    return () => win.clearTimeout(timer);
  }, [message]);
  return (
    <ToastContext.Provider
      value={(heading, detail) =>
        setMessage({ heading, detail, serial: ++serial.current })
      }
    >
      <div className={"pane " + (footer != null ? "footed " : "") + className}>
        {children}
        {footer != null && <div className="foot">{footer}</div>}
        <div
          ref={toast}
          className="toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          hidden={!message}
        >
          {message && (
            <span key={message.serial}>
              <b>{message.heading}</b>
              {message.detail && (
                <>
                  {" "}
                  <span className="sub">{message.detail}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
